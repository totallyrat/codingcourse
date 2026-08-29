/**
 * A deliberately small TypeScript-to-JavaScript stripper.
 *
 * It exists for one job: when neither `tsx` nor `ts-node` is installed, the
 * TypeScript track's write-and-run exercises still have to run. Rather than
 * shipping a megabyte of compiler for that, this removes the annotations the
 * course actually teaches - and the course only teaches TypeScript whose
 * runtime semantics are plain JavaScript, which is the whole point of the
 * language.
 *
 * It is not a compiler. Enums, namespaces, decorators and parameter properties
 * all change runtime behaviour, so they are rejected by name instead of being
 * silently mangled.
 */

export interface StripResult {
  code: string;
  /** Set when the source uses something that cannot simply be erased. */
  unsupported?: string;
}

const UNSUPPORTED: Array<[RegExp, string]> = [
  [/^\s*(export\s+)?(const\s+)?enum\s+/m, 'enum'],
  [/^\s*(export\s+)?namespace\s+/m, 'namespace'],
  [/^\s*@[A-Za-z_$]/m, 'decorator'],
  [/\bconstructor\s*\([^)]*\b(private|public|protected|readonly)\s/m, 'parameter property'],
];

/**
 * Walks the source once, tracking string/template/comment/regex state so the
 * type-stripping regexes never fire inside a string literal.
 */
export function stripTypes(source: string): StripResult {
  for (const [re, name] of UNSUPPORTED) {
    if (re.test(source)) {
      return { code: source, unsupported: name };
    }
  }

  const segments: Array<{ code: boolean; text: string }> = [];
  let buf = '';
  let i = 0;
  const push = (code: boolean, text: string) => segments.push({ code, text });

  while (i < source.length) {
    const ch = source[i];
    const two = source.slice(i, i + 2);

    if (two === '//') {
      const end = source.indexOf('\n', i);
      push(true, buf);
      buf = '';
      push(false, source.slice(i, end === -1 ? source.length : end));
      i = end === -1 ? source.length : end;
      continue;
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      push(true, buf);
      buf = '';
      push(false, source.slice(i, end === -1 ? source.length : end + 2));
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (ch === '`' && source.slice(j, j + 2) === '${') depth++;
        if (ch === '`' && source[j] === '}' && depth > 0) depth--;
        if (source[j] === ch && depth === 0) {
          j++;
          break;
        }
        j++;
      }
      push(true, buf);
      buf = '';
      push(false, source.slice(i, j));
      i = j;
      continue;
    }
    buf += ch;
    i++;
  }
  push(true, buf);

  const code = segments
    .map((seg) => (seg.code ? stripCodeSegment(seg.text) : seg.text))
    .join('');

  return { code };
}

function stripCodeSegment(src: string): string {
  let out = src;

  // Whole-line declarations that produce no runtime output.
  out = out.replace(
    /^[ \t]*(export\s+)?(interface|type)\s+[A-Za-z_$][\w$]*[^\n]*?\{[\s\S]*?\n[ \t]*\}[ \t]*;?[ \t]*$/gm,
    '',
  );
  // The same declarations written on one line, which the block form above
  // misses because it insists on a closing brace of its own.
  out = out.replace(
    /^[ \t]*(export\s+)?interface\s+[A-Za-z_$][\w$]*[^\n{]*\{[^\n}]*\}[ \t]*;?[ \t]*$/gm,
    '',
  );
  out = out.replace(/^[ \t]*(export\s+)?type\s+[A-Za-z_$][\w$]*\s*(<[^>]*>)?\s*=[^\n;]*;?[ \t]*$/gm, '');
  out = out.replace(/^[ \t]*declare\s+[^\n]*$/gm, '');
  out = out.replace(/^[ \t]*import\s+type\s+[^\n]*$/gm, '');

  // `satisfies X` and `as X` / `as const` assertions.
  out = out.replace(/\s+satisfies\s+[A-Za-z_$][\w$.<>[\]|&, ]*/g, '');
  out = out.replace(/\s+as\s+const\b/g, '');
  out = out.replace(/\s+as\s+[A-Za-z_$][\w$.]*(<[^<>()]*>)?(\[\])*/g, '');

  // Non-null assertions: `x!.y` and `x!)`.
  out = out.replace(/([\w$\])])!(?=[.;,)\]\s])/g, '$1');

  // `implements X` on classes.
  out = out.replace(
    /(\bclass\s+[A-Za-z_$][\w$]*(\s+extends\s+[A-Za-z_$][\w$.]*)?)\s+implements\s+[^{]+/g,
    '$1 ',
  );

  // Generic type parameters on function declarations.
  out = out.replace(/\bfunction(\s+[A-Za-z_$][\w$]*)?\s*<[^<>()]*>\s*\(/g, (m) => m.replace(/<[^<>()]*>/, ''));

  // Access modifiers on class members.
  out = out.replace(/^([ \t]*)(public|private|protected|readonly|abstract)\s+/gm, '$1');

  out = stripSignatures(out);
  out = stripVariableAnnotations(out);
  out = stripClassFieldAnnotations(out);
  return out;
}

/**
 * Annotations are only removed in positions where a type can legally appear.
 *
 * The tempting shortcut - "delete everything between a colon and the next
 * comma" - destroys object literals and ternaries. So instead this finds the
 * parameter lists of functions (a paren group whose `)` is followed by `{`,
 * `=>` or a return type) and strips only there, plus the return type itself.
 */
function stripSignatures(src: string): string {
  const chars = [...src];
  const cuts: Array<[number, number]> = [];

  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== '(') continue;
    const close = matchParen(src, i);
    if (close < 0) continue;

    const after = src.slice(close + 1);
    const isSignature = /^\s*(\{|=>|:)/.test(after);
    if (!isSignature) continue;

    // Parameter annotations, only for a name sitting directly after `(` or `,`.
    let j = i + 1;
    let expectName = true;
    while (j < close) {
      const ch = src[j];
      if (ch === '(' || ch === '[' || ch === '{' || ch === '<') {
        const end = matchAny(src, j);
        if (end < 0) break;
        j = end + 1;
        expectName = false;
        continue;
      }
      if (ch === ',') {
        expectName = true;
        j++;
        continue;
      }
      if (/\s/.test(ch)) {
        j++;
        continue;
      }
      if (expectName) {
        const name = /^\.{0,3}[A-Za-z_$][\w$]*\??/.exec(src.slice(j));
        if (name) {
          let k = j + name[0].length;
          while (k < close && /\s/.test(src[k])) k++;
          if (src[k] === ':') {
            const typeEnd = scanTypeUntil(src, k + 1, close);
            cuts.push([k, typeEnd]);
            // A `?` marker only means optional when a type followed it.
            if (name[0].endsWith('?')) cuts.push([j + name[0].length - 1, j + name[0].length]);
            j = typeEnd;
            continue;
          }
          j = k;
          expectName = false;
          continue;
        }
      }
      j++;
      expectName = false;
    }

    // The return type, between `)` and the body.
    const retMatch = /^(\s*):/.exec(after);
    if (retMatch) {
      const colonAt = close + 1 + retMatch[1].length;
      const typeEnd = scanReturnType(src, colonAt + 1);
      if (typeEnd > colonAt) cuts.push([colonAt, typeEnd]);
    }
  }

  return applyCuts(src, cuts);
}

function stripVariableAnnotations(src: string): string {
  const cuts: Array<[number, number]> = [];
  const re = /\b(let|const|var)\s+(\{[^}]*\}|\[[^\]]*\]|[A-Za-z_$][\w$]*)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const colonAt = m.index + m[0].length - 1;
    const end = scanTypeUntil(src, colonAt + 1, src.length);
    cuts.push([colonAt, end]);
  }
  return applyCuts(src, cuts);
}

/** `speed: number = 5;` written as a class field on its own line. */
function stripClassFieldAnnotations(src: string): string {
  // Two shapes to catch, and the second used to be missed entirely:
  //   readonly max: number;          -> readonly max;
  //   private items: number[] = [];  -> private items = [];
  // A field with both a modifier and an initialiser is the common case in
  // real code, and leaving its annotation behind produces a class body that
  // is not JavaScript at all.
  const MODIFIERS = '(?:public|private|protected|readonly|static|declare|override|abstract)';
  const pattern = new RegExp(
    `^([ \\t]*(?:${MODIFIERS}\\s+)*[A-Za-z_$][\\w$]*)\\??\\s*:\\s*[A-Za-z_$][\\w$.<>[\\]|&\\s]*?(\\s*(?:=[^\\n]*|;)\\s*)$`,
    'gm',
  );
  return src.replace(pattern, (full, head: string, tail: string) =>
    // An arithmetic operator means this was never an annotation.
    /[+\-*/%]/.test(full.slice(0, full.indexOf('=') === -1 ? full.length : full.indexOf('='))) ? full : head + tail,
  );
}

function applyCuts(src: string, cuts: Array<[number, number]>): string {
  if (!cuts.length) return src;
  cuts.sort((a, b) => a[0] - b[0]);
  let out = '';
  let cursor = 0;
  for (const [from, to] of cuts) {
    if (from < cursor) continue;
    out += src.slice(cursor, from);
    cursor = to;
  }
  return out + src.slice(cursor);
}

function matchParen(src: string, open: number): number {
  return matchAny(src, open);
}

/** Index of the bracket closing the one at `open`, or -1. */
function matchAny(src: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
  const close = pairs[src[open]];
  if (!close) return -1;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === src[open]) depth++;
    else if (src[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Consumes one type expression starting at `from`, stopping at a top-level
 * comma, the given limit, or a `=`/`;`/newline when `stopAtAssign` is set.
 * Crucially, `{` and `(` only open a nesting level at the *start* of a type -
 * after a type name they mean the function body has begun.
 */
function scanTypeUntil(src: string, from: number, limit: number, stopAtArrow = false): number {
  let i = from;
  let depth = 0;
  let atom = false;
  while (i < limit && i < src.length) {
    const ch = src[i];
    if (depth === 0) {
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch === '{' || ch === '(') {
        if (atom) break;
        const end = matchAny(src, i);
        if (end < 0 || end >= limit) break;
        i = end + 1;
        atom = true;
        continue;
      }
      if (ch === '<' || ch === '[') {
        const end = matchAny(src, i);
        if (end < 0 || end >= limit) break;
        i = end + 1;
        atom = true;
        continue;
      }
      if (ch === ',' || ch === ')' || ch === ']' || ch === '}') break;
      if (ch === ';' || ch === '\n') break;
      if (ch === '=') {
        // `=>` belongs to a function type (`(n: number) => void`) unless we
        // are reading a return type, where it starts the arrow body instead.
        if (src[i + 1] === '>' && !stopAtArrow) {
          i += 2;
          atom = false;
          continue;
        }
        break;
      }
      if (ch === '|' || ch === '&') {
        atom = false;
        i++;
        continue;
      }
      if (!/[\w$.'"]/.test(ch)) break;
      atom = true;
      i++;
      continue;
    }
    i++;
  }
  // Do not swallow the whitespace that separated the type from what follows.
  while (i > from && /\s/.test(src[i - 1])) i--;
  return i;
}

/** A return type runs until the body starts. */
function scanReturnType(src: string, from: number): number {
  const end = scanTypeUntil(src, from, src.length, true);
  const after = src.slice(end).trimStart();
  // Only treat it as a return type when a function body really follows,
  // so a ternary like `cond ? a() : b()` is left alone.
  if (after.startsWith('{') || after.startsWith('=>')) return end;
  return -1;
}

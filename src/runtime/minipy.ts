/* ============================================================================
   MiniPy - a tree-walking interpreter for the subset of Python this course
   teaches.

   Why this exists: the app must be able to actually *run* what a learner
   writes, on a machine that may well have no Python installed (which is most
   Windows machines). When a real interpreter is on PATH the Electron main
   process uses it; when it is not, this takes over, and the learner never
   finds out the difference except for the badge in the run panel.

   What it covers: numbers (int/float distinction included), strings and
   f-strings, lists, tuples, dicts, sets, slicing, the usual operators,
   if/elif/else, while, for, break/continue, functions with defaults, list
   comprehensions, classes with __init__ and methods, try/except, and about
   forty builtins and container methods.

   What it does not: imports, generators, decorators, with-statements, async,
   and the rest of the standard library. Any of those produce a clear
   "MiniPy does not support X" error rather than a confusing wrong answer -
   silently doing the wrong thing would be much worse than saying no.
   ========================================================================== */

export interface PyResult {
  ok: boolean;
  stdout: string;
  error?: string;
  /** Set when execution stopped because it hit the step budget. */
  timedOut?: boolean;
}

/* --------------------------------------------------------------- values */

/** A Python float. Ints are plain JS numbers; this wrapper keeps `4/2 == 2.0`
 *  printing as `2.0` the way Python does. */
class PyFloat {
  constructor(readonly v: number) {}
}
class PyTuple {
  constructor(readonly items: PyValue[]) {}
}
class PySet {
  items: PyValue[] = [];
  constructor(items: PyValue[] = []) {
    for (const it of items) this.add(it);
  }
  add(v: PyValue) {
    if (!this.items.some((x) => pyEq(x, v))) this.items.push(v);
  }
  has(v: PyValue) {
    return this.items.some((x) => pyEq(x, v));
  }
  delete(v: PyValue) {
    const i = this.items.findIndex((x) => pyEq(x, v));
    if (i >= 0) this.items.splice(i, 1);
  }
}
class PyDict {
  keys: PyValue[] = [];
  values: PyValue[] = [];
  get(k: PyValue): PyValue | undefined {
    const i = this.keys.findIndex((x) => pyEq(x, k));
    return i < 0 ? undefined : this.values[i];
  }
  set(k: PyValue, v: PyValue) {
    const i = this.keys.findIndex((x) => pyEq(x, k));
    if (i < 0) {
      this.keys.push(k);
      this.values.push(v);
    } else this.values[i] = v;
  }
  has(k: PyValue) {
    return this.keys.some((x) => pyEq(x, k));
  }
  delete(k: PyValue) {
    const i = this.keys.findIndex((x) => pyEq(x, k));
    if (i >= 0) {
      this.keys.splice(i, 1);
      this.values.splice(i, 1);
    }
  }
  get size() {
    return this.keys.length;
  }
}
class PyFunc {
  constructor(
    readonly name: string,
    readonly params: Array<{ name: string; def?: Node }>,
    readonly body: Node[],
    readonly closure: Env,
    readonly self?: PyValue,
  ) {}
}
class PyClass {
  constructor(
    readonly name: string,
    readonly methods: Map<string, PyFunc>,
    readonly base?: PyClass,
  ) {}
  find(name: string): PyFunc | undefined {
    return this.methods.get(name) ?? this.base?.find(name);
  }
}
class PyInstance {
  fields = new Map<string, PyValue>();
  constructor(readonly cls: PyClass) {}
}
type Builtin = {
  __builtin: string;
  call: (args: PyValue[], ctx: Ctx, kwargs: Map<string, PyValue>) => PyValue;
};

export type PyValue =
  | number
  | PyFloat
  | string
  | boolean
  | null
  | PyValue[]
  | PyTuple
  | PySet
  | PyDict
  | PyFunc
  | PyClass
  | PyInstance
  | Builtin;

class PyError extends Error {
  constructor(
    readonly type: string,
    message: string,
    public line = 0,
  ) {
    super(message);
  }
}
class BreakSignal extends Error {}
class ContinueSignal extends Error {}
class ReturnSignal extends Error {
  constructor(readonly value: PyValue) {
    super('return');
  }
}

const isFloat = (v: PyValue): v is PyFloat => v instanceof PyFloat;
const numOf = (v: PyValue): number => (v instanceof PyFloat ? v.v : (v as number));
const isNum = (v: PyValue): boolean => typeof v === 'number' || v instanceof PyFloat;
const mkNum = (n: number, float: boolean): PyValue => (float ? new PyFloat(n) : n);

function typeName(v: PyValue): string {
  if (v === null) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return 'int';
  if (v instanceof PyFloat) return 'float';
  if (typeof v === 'string') return 'str';
  if (Array.isArray(v)) return 'list';
  if (v instanceof PyTuple) return 'tuple';
  if (v instanceof PySet) return 'set';
  if (v instanceof PyDict) return 'dict';
  if (v instanceof PyFunc) return 'function';
  if (v instanceof PyClass) return v.name;
  if (v instanceof PyInstance) return v.cls.name;
  return 'builtin_function_or_method';
}

function pyEq(a: PyValue, b: PyValue): boolean {
  if (isNum(a) && isNum(b) && typeof a !== 'boolean' && typeof b !== 'boolean') return numOf(a) === numOf(b);
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    if (isNum(a) && isNum(b)) return Number(a) === Number(b);
  }
  if (a === null || b === null) return a === b;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => pyEq(x, b[i]));
  if (a instanceof PyTuple && b instanceof PyTuple)
    return a.items.length === b.items.length && a.items.every((x, i) => pyEq(x, b.items[i]));
  if (a instanceof PyDict && b instanceof PyDict)
    return a.size === b.size && a.keys.every((k, i) => b.has(k) && pyEq(a.values[i], b.get(k)!));
  if (a instanceof PySet && b instanceof PySet)
    return a.items.length === b.items.length && a.items.every((x) => b.has(x));
  return a === b;
}

function truthy(v: PyValue): boolean {
  if (v === null || v === false) return false;
  if (v === true) return true;
  if (typeof v === 'number') return v !== 0;
  if (v instanceof PyFloat) return v.v !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof PyTuple) return v.items.length > 0;
  if (v instanceof PySet) return v.items.length > 0;
  if (v instanceof PyDict) return v.size > 0;
  return true;
}

function fmtFloat(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : Number.isNaN(n) ? 'nan' : '-inf';
  if (Number.isInteger(n) && Math.abs(n) < 1e16) return `${n}.0`;
  return String(n);
}

/** `str()` - what print shows. */
function pyStr(v: PyValue): string {
  if (v === null) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return String(v);
  if (v instanceof PyFloat) return fmtFloat(v.v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(', ')}]`;
  if (v instanceof PyTuple)
    return v.items.length === 1 ? `(${pyRepr(v.items[0])},)` : `(${v.items.map(pyRepr).join(', ')})`;
  if (v instanceof PySet) return v.items.length ? `{${v.items.map(pyRepr).join(', ')}}` : 'set()';
  if (v instanceof PyDict)
    return `{${v.keys.map((k, i) => `${pyRepr(k)}: ${pyRepr(v.values[i])}`).join(', ')}}`;
  if (v instanceof PyFunc) return `<function ${v.name}>`;
  if (v instanceof PyClass) return `<class '${v.name}'>`;
  if (v instanceof PyInstance) return `<${v.cls.name} object>`;
  return `<built-in function ${(v as Builtin).__builtin}>`;
}

/** `repr()` - what shows inside a container. */
function pyRepr(v: PyValue): string {
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return pyStr(v);
}

/* ------------------------------------------------------------ tokenizer */

type TokType = 'NAME' | 'NUM' | 'STR' | 'FSTR' | 'OP' | 'NEWLINE' | 'INDENT' | 'DEDENT' | 'EOF';
interface Tok {
  type: TokType;
  value: string;
  line: number;
  /** For NUM: whether the literal was a float. */
  float?: boolean;
}

const KEYWORDS = new Set([
  'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'False', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'None',
  'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try', 'while', 'with', 'yield',
]);

const OPS = [
  '**=', '//=', '>>=', '<<=', '...', '**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=',
  '%=', '&=', '|=', '^=', '->', '<<', '>>', '+', '-', '*', '/', '%', '=', '<', '>', '(', ')', '[',
  ']', '{', '}', ',', ':', '.', ';', '&', '|', '^', '~', '@',
];

function tokenize(src: string): Tok[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const toks: Tok[] = [];
  const indents = [0];
  let depth = 0; // bracket nesting - newlines inside brackets are ignored

  for (let ln = 0; ln < lines.length; ln++) {
    const raw = lines[ln];
    const lineNo = ln + 1;

    if (depth === 0) {
      const stripped = raw.replace(/\t/g, '    ');
      const indentMatch = /^ */.exec(stripped)![0].length;
      const rest = stripped.slice(indentMatch);
      if (rest.trim() === '' || rest.trimStart().startsWith('#')) continue;

      if (indentMatch > indents[indents.length - 1]) {
        indents.push(indentMatch);
        toks.push({ type: 'INDENT', value: '', line: lineNo });
      } else {
        while (indentMatch < indents[indents.length - 1]) {
          indents.pop();
          toks.push({ type: 'DEDENT', value: '', line: lineNo });
        }
        if (indentMatch !== indents[indents.length - 1]) {
          throw new PyError('IndentationError', 'unindent does not match any outer indentation level', lineNo);
        }
      }
    }

    let i = depth === 0 ? /^[ \t]*/.exec(raw.replace(/\t/g, '    '))![0].length : 0;
    const line = raw.replace(/\t/g, '    ');

    while (i < line.length) {
      const ch = line[i];
      if (ch === ' ') {
        i++;
        continue;
      }
      if (ch === '#') break;

      // strings, including f-strings and triple quotes
      const prefixMatch = /^([fFrRbB]{0,2})("""|'''|"|')/.exec(line.slice(i));
      if (prefixMatch) {
        const prefix = prefixMatch[1].toLowerCase();
        const quote = prefixMatch[2];
        let j = i + prefixMatch[0].length;
        let text = '';
        let closed = false;
        while (j < line.length) {
          if (!prefix.includes('r') && line[j] === '\\' && j + 1 < line.length) {
            text += line[j] + line[j + 1];
            j += 2;
            continue;
          }
          if (line.startsWith(quote, j)) {
            j += quote.length;
            closed = true;
            break;
          }
          text += line[j];
          j++;
        }
        if (!closed && quote.length === 3) {
          // Triple-quoted strings may run on; consume following lines.
          let k = ln + 1;
          while (k < lines.length) {
            const idx = lines[k].indexOf(quote);
            if (idx >= 0) {
              text += '\n' + lines[k].slice(0, idx);
              ln = k;
              i = 0;
              closed = true;
              break;
            }
            text += '\n' + lines[k];
            k++;
          }
          if (closed) {
            toks.push({ type: prefix.includes('f') ? 'FSTR' : 'STR', value: text, line: lineNo });
            // The rest of the closing line is rare in teaching code; skip it.
            i = line.length;
            continue;
          }
        }
        if (!closed) throw new PyError('SyntaxError', 'unterminated string literal', lineNo);
        toks.push({ type: prefix.includes('f') ? 'FSTR' : 'STR', value: text, line: lineNo });
        i = j;
        continue;
      }

      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(line[i + 1] ?? ''))) {
        const m = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|(\d[\d_]*)?\.\d[\d_]*([eE][+-]?\d+)?|\d[\d_]*\.(?!\.)\d*([eE][+-]?\d+)?|\d[\d_]*([eE][+-]?\d+)?)/.exec(
          line.slice(i),
        )!;
        const text = m[0].replace(/_/g, '');
        const float = /[.eE]/.test(text) && !/^0[xXbB]/.test(text);
        toks.push({ type: 'NUM', value: text, line: lineNo, float });
        i += m[0].length;
        continue;
      }

      if (/[A-Za-z_]/.test(ch)) {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(i))!;
        toks.push({ type: 'NAME', value: m[0], line: lineNo });
        i += m[0].length;
        continue;
      }

      const op = OPS.find((o) => line.startsWith(o, i));
      if (op) {
        if ('([{'.includes(op)) depth++;
        if (')]}'.includes(op)) depth = Math.max(0, depth - 1);
        toks.push({ type: 'OP', value: op, line: lineNo });
        i += op.length;
        continue;
      }

      throw new PyError('SyntaxError', `invalid character '${ch}'`, lineNo);
    }

    if (depth === 0) toks.push({ type: 'NEWLINE', value: '', line: lineNo });
  }

  while (indents.length > 1) {
    indents.pop();
    toks.push({ type: 'DEDENT', value: '', line: lines.length });
  }
  toks.push({ type: 'EOF', value: '', line: lines.length });
  return toks;
}

/* ---------------------------------------------------------------- parser */

type Node =
  | { t: 'Num'; v: number; float: boolean; line: number }
  | { t: 'Str'; v: string; line: number }
  | { t: 'FStr'; raw: string; line: number }
  | { t: 'Bool'; v: boolean; line: number }
  | { t: 'None'; line: number }
  | { t: 'Name'; id: string; line: number }
  | { t: 'List'; items: Node[]; line: number }
  | { t: 'Tuple'; items: Node[]; line: number }
  | { t: 'SetLit'; items: Node[]; line: number }
  | { t: 'DictLit'; entries: Array<[Node, Node]>; line: number }
  | { t: 'Bin'; op: string; l: Node; r: Node; line: number }
  | { t: 'Unary'; op: string; e: Node; line: number }
  | { t: 'Bool2'; op: 'and' | 'or'; l: Node; r: Node; line: number }
  | { t: 'Cond'; test: Node; then: Node; other: Node; line: number }
  | { t: 'Call'; fn: Node; args: Node[]; kwargs: Array<[string, Node]>; line: number }
  | { t: 'Attr'; obj: Node; name: string; line: number }
  | { t: 'Index'; obj: Node; idx: Node; line: number }
  | { t: 'Slice'; obj: Node; lo: Node | null; hi: Node | null; step: Node | null; line: number }
  | { t: 'Comp'; expr: Node; target: Node; iter: Node; cond: Node | null; kind: 'list' | 'set'; line: number }
  | { t: 'DictComp'; key: Node; value: Node; target: Node; iter: Node; cond: Node | null; line: number }
  | { t: 'Lambda'; params: Array<{ name: string; def?: Node }>; body: Node; line: number }
  | { t: 'Assign'; targets: Node[]; value: Node; line: number }
  | { t: 'AugAssign'; target: Node; op: string; value: Node; line: number }
  | { t: 'Expr'; e: Node; line: number }
  | { t: 'If'; test: Node; body: Node[]; orelse: Node[]; line: number }
  | { t: 'While'; test: Node; body: Node[]; line: number }
  | { t: 'For'; target: Node; iter: Node; body: Node[]; line: number }
  | { t: 'Def'; name: string; params: Array<{ name: string; def?: Node }>; body: Node[]; line: number }
  | { t: 'Class'; name: string; base: string | null; body: Node[]; line: number }
  | { t: 'Return'; value: Node | null; line: number }
  | { t: 'Break'; line: number }
  | { t: 'Continue'; line: number }
  | { t: 'Pass'; line: number }
  | { t: 'Del'; target: Node; line: number }
  | { t: 'Raise'; exc: Node | null; line: number }
  | { t: 'Try'; body: Node[]; handlers: Array<{ type: string | null; name: string | null; body: Node[] }>; orelse: Node[]; final: Node[]; line: number }
  | { t: 'Global'; names: string[]; line: number }
  | { t: 'Assert'; test: Node; msg: Node | null; line: number };

class Parser {
  private pos = 0;
  constructor(private toks: Tok[]) {}

  private peek(o = 0): Tok {
    return this.toks[Math.min(this.pos + o, this.toks.length - 1)];
  }
  private at(type: TokType, value?: string): boolean {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }
  private atOp(...values: string[]): boolean {
    const t = this.peek();
    return t.type === 'OP' && values.includes(t.value);
  }
  private atKw(...values: string[]): boolean {
    const t = this.peek();
    return t.type === 'NAME' && values.includes(t.value);
  }
  private next(): Tok {
    return this.toks[this.pos++];
  }
  private expect(type: TokType, value?: string): Tok {
    if (!this.at(type, value)) {
      const t = this.peek();
      throw new PyError('SyntaxError', `expected ${value ?? type} but found '${t.value || t.type}'`, t.line);
    }
    return this.next();
  }
  private skipNewlines() {
    while (this.at('NEWLINE')) this.next();
  }

  parseModule(): Node[] {
    const body: Node[] = [];
    this.skipNewlines();
    while (!this.at('EOF')) {
      body.push(...this.statement());
      this.skipNewlines();
    }
    return body;
  }

  private block(): Node[] {
    this.expect('OP', ':');
    if (this.at('NEWLINE')) {
      this.next();
      this.skipNewlines();
      this.expect('INDENT');
      const body: Node[] = [];
      while (!this.at('DEDENT') && !this.at('EOF')) {
        body.push(...this.statement());
        this.skipNewlines();
      }
      if (this.at('DEDENT')) this.next();
      return body;
    }
    // one-liner: `if x: return 1`
    return this.statement();
  }

  private statement(): Node[] {
    const t = this.peek();
    const line = t.line;

    if (this.atKw('if')) {
      this.next();
      const test = this.expression();
      const body = this.block();
      let orelse: Node[] = [];
      this.skipNewlines();
      if (this.atKw('elif')) {
        const sub = this.statementFromElif();
        orelse = [sub];
      } else if (this.atKw('else')) {
        this.next();
        orelse = this.block();
      }
      return [{ t: 'If', test, body, orelse, line }];
    }
    if (this.atKw('while')) {
      this.next();
      const test = this.expression();
      const body = this.block();
      return [{ t: 'While', test, body, line }];
    }
    if (this.atKw('for')) {
      this.next();
      const target = this.targetList();
      if (!this.atKw('in')) throw new PyError('SyntaxError', "expected 'in'", line);
      this.next();
      const iter = this.expression();
      const body = this.block();
      return [{ t: 'For', target, iter, body, line }];
    }
    if (this.atKw('def')) {
      this.next();
      const name = this.expect('NAME').value;
      const params = this.paramList();
      if (this.atOp('->')) {
        this.next();
        this.expression();
      }
      const body = this.block();
      return [{ t: 'Def', name, params, body, line }];
    }
    if (this.atKw('class')) {
      this.next();
      const name = this.expect('NAME').value;
      let base: string | null = null;
      if (this.atOp('(')) {
        this.next();
        if (!this.atOp(')')) base = this.expect('NAME').value;
        this.expect('OP', ')');
      }
      const body = this.block();
      return [{ t: 'Class', name, base, body, line }];
    }
    if (this.atKw('try')) {
      this.next();
      const body = this.block();
      const handlers: Array<{ type: string | null; name: string | null; body: Node[] }> = [];
      let orelse: Node[] = [];
      let final: Node[] = [];
      this.skipNewlines();
      while (this.atKw('except')) {
        this.next();
        let type: string | null = null;
        let alias: string | null = null;
        if (!this.atOp(':')) {
          type = this.expect('NAME').value;
          if (this.atKw('as')) {
            this.next();
            alias = this.expect('NAME').value;
          }
        }
        handlers.push({ type, name: alias, body: this.block() });
        this.skipNewlines();
      }
      if (this.atKw('else')) {
        this.next();
        orelse = this.block();
        this.skipNewlines();
      }
      if (this.atKw('finally')) {
        this.next();
        final = this.block();
      }
      return [{ t: 'Try', body, handlers, orelse, final, line }];
    }
    if (this.atKw('return')) {
      this.next();
      const value = this.at('NEWLINE') || this.at('EOF') || this.atOp(';') ? null : this.expressionList();
      this.endStatement();
      return [{ t: 'Return', value, line }];
    }
    if (this.atKw('break')) {
      this.next();
      this.endStatement();
      return [{ t: 'Break', line }];
    }
    if (this.atKw('continue')) {
      this.next();
      this.endStatement();
      return [{ t: 'Continue', line }];
    }
    if (this.atKw('pass')) {
      this.next();
      this.endStatement();
      return [{ t: 'Pass', line }];
    }
    if (this.atKw('del')) {
      this.next();
      const target = this.expression();
      this.endStatement();
      return [{ t: 'Del', target, line }];
    }
    if (this.atKw('raise')) {
      this.next();
      const exc = this.at('NEWLINE') || this.at('EOF') ? null : this.expression();
      this.endStatement();
      return [{ t: 'Raise', exc, line }];
    }
    if (this.atKw('global') || this.atKw('nonlocal')) {
      this.next();
      const names = [this.expect('NAME').value];
      while (this.atOp(',')) {
        this.next();
        names.push(this.expect('NAME').value);
      }
      this.endStatement();
      return [{ t: 'Global', names, line }];
    }
    if (this.atKw('assert')) {
      this.next();
      const test = this.expression();
      let msg: Node | null = null;
      if (this.atOp(',')) {
        this.next();
        msg = this.expression();
      }
      this.endStatement();
      return [{ t: 'Assert', test, msg, line }];
    }
    if (this.atKw('import') || this.atKw('from')) {
      throw new PyError(
        'MiniPyError',
        'imports are not available here - everything you need is built in',
        line,
      );
    }
    if (this.atKw('with') || this.atKw('yield') || this.atKw('lambda') === false && this.atKw('async')) {
      throw new PyError('MiniPyError', `'${this.peek().value}' is not supported in this editor`, line);
    }

    // expression / assignment
    const first = this.expressionList();
    if (this.atOp('=')) {
      const targets: Node[] = [first];
      let value: Node = first;
      while (this.atOp('=')) {
        this.next();
        value = this.expressionList();
        targets.push(value);
      }
      const realTargets = targets.slice(0, -1);
      this.endStatement();
      return [{ t: 'Assign', targets: realTargets, value, line }];
    }
    if (this.atOp('+=', '-=', '*=', '/=', '//=', '%=', '**=', '&=', '|=', '^=', '<<=', '>>=')) {
      const op = this.next().value.slice(0, -1);
      const value = this.expressionList();
      this.endStatement();
      return [{ t: 'AugAssign', target: first, op, value, line }];
    }
    if (this.atOp(':')) {
      // annotated assignment: `count: int = 0`
      this.next();
      this.expression();
      if (this.atOp('=')) {
        this.next();
        const value = this.expressionList();
        this.endStatement();
        return [{ t: 'Assign', targets: [first], value, line }];
      }
      this.endStatement();
      return [{ t: 'Pass', line }];
    }
    this.endStatement();
    return [{ t: 'Expr', e: first, line }];
  }

  private statementFromElif(): Node {
    const line = this.peek().line;
    this.next(); // elif
    const test = this.expression();
    const body = this.block();
    let orelse: Node[] = [];
    this.skipNewlines();
    if (this.atKw('elif')) orelse = [this.statementFromElif()];
    else if (this.atKw('else')) {
      this.next();
      orelse = this.block();
    }
    return { t: 'If', test, body, orelse, line };
  }

  private endStatement() {
    if (this.atOp(';')) {
      this.next();
      return;
    }
    if (this.at('NEWLINE')) this.next();
  }

  private paramList(): Array<{ name: string; def?: Node }> {
    this.expect('OP', '(');
    const params: Array<{ name: string; def?: Node }> = [];
    while (!this.atOp(')')) {
      if (this.atOp('*') || this.atOp('**')) {
        throw new PyError('MiniPyError', '*args and **kwargs are not supported here', this.peek().line);
      }
      const name = this.expect('NAME').value;
      if (this.atOp(':')) {
        this.next();
        this.expression();
      }
      let def: Node | undefined;
      if (this.atOp('=')) {
        this.next();
        def = this.expression();
      }
      params.push({ name, def });
      if (this.atOp(',')) this.next();
      else break;
    }
    this.expect('OP', ')');
    return params;
  }

  /**
   * Assignment/loop targets are parsed with `postfix`, not `orExpr`. Going
   * through the comparison layer would let `for i in xs` swallow the `in` as a
   * membership test and leave the loop with no iterable.
   */
  private targetList(): Node {
    const first = this.target();
    if (!this.atOp(',')) return first;
    const items = [first];
    while (this.atOp(',')) {
      this.next();
      if (this.atKw('in') || this.atOp('=')) break;
      items.push(this.target());
    }
    return { t: 'Tuple', items, line: first.line };
  }

  private target(): Node {
    if (this.atOp('(') || this.atOp('[')) {
      // Parenthesised targets: `for (a, b) in pairs:`
      const open = this.next().value;
      const items: Node[] = [];
      const close = open === '(' ? ')' : ']';
      while (!this.atOp(close)) {
        items.push(this.target());
        if (this.atOp(',')) this.next();
        else break;
      }
      this.expect('OP', close);
      return items.length === 1 ? items[0] : { t: 'Tuple', items, line: this.peek().line };
    }
    return this.postfix();
  }

  private expressionList(): Node {
    const first = this.expression();
    if (!this.atOp(',')) return first;
    const items = [first];
    while (this.atOp(',')) {
      this.next();
      if (this.at('NEWLINE') || this.at('EOF') || this.atOp('=', ')', ']', '}')) break;
      items.push(this.expression());
    }
    return { t: 'Tuple', items, line: first.line };
  }

  expression(): Node {
    if (this.atKw('lambda')) {
      const line = this.next().line;
      const params: Array<{ name: string; def?: Node }> = [];
      while (!this.atOp(':')) {
        const name = this.expect('NAME').value;
        let def: Node | undefined;
        if (this.atOp('=')) {
          this.next();
          def = this.expression();
        }
        params.push({ name, def });
        if (this.atOp(',')) this.next();
      }
      this.expect('OP', ':');
      return { t: 'Lambda', params, body: this.expression(), line };
    }
    const value = this.orExpr();
    if (this.atKw('if')) {
      const line = this.next().line;
      const test = this.orExpr();
      if (!this.atKw('else')) throw new PyError('SyntaxError', "conditional expression needs 'else'", line);
      this.next();
      const other = this.expression();
      return { t: 'Cond', test, then: value, other, line };
    }
    return value;
  }

  private orExpr(): Node {
    let left = this.andExpr();
    while (this.atKw('or')) {
      const line = this.next().line;
      left = { t: 'Bool2', op: 'or', l: left, r: this.andExpr(), line };
    }
    return left;
  }
  private andExpr(): Node {
    let left = this.notExpr();
    while (this.atKw('and')) {
      const line = this.next().line;
      left = { t: 'Bool2', op: 'and', l: left, r: this.notExpr(), line };
    }
    return left;
  }
  private notExpr(): Node {
    if (this.atKw('not')) {
      const line = this.next().line;
      return { t: 'Unary', op: 'not', e: this.notExpr(), line };
    }
    return this.comparison();
  }
  private comparison(): Node {
    let left = this.bitOr();
    for (;;) {
      let op: string | null = null;
      if (this.atOp('==', '!=', '<', '<=', '>', '>=')) op = this.next().value;
      else if (this.atKw('in')) {
        this.next();
        op = 'in';
      } else if (this.atKw('not') && this.peek(1).type === 'NAME' && this.peek(1).value === 'in') {
        this.next();
        this.next();
        op = 'not in';
      } else if (this.atKw('is')) {
        this.next();
        if (this.atKw('not')) {
          this.next();
          op = 'is not';
        } else op = 'is';
      }
      if (!op) return left;
      const right = this.bitOr();
      left = { t: 'Bin', op, l: left, r: right, line: left.line };
    }
  }
  private bitOr(): Node {
    let left = this.bitXor();
    while (this.atOp('|')) {
      const line = this.next().line;
      left = { t: 'Bin', op: '|', l: left, r: this.bitXor(), line };
    }
    return left;
  }
  private bitXor(): Node {
    let left = this.bitAnd();
    while (this.atOp('^')) {
      const line = this.next().line;
      left = { t: 'Bin', op: '^', l: left, r: this.bitAnd(), line };
    }
    return left;
  }
  private bitAnd(): Node {
    let left = this.shift();
    while (this.atOp('&')) {
      const line = this.next().line;
      left = { t: 'Bin', op: '&', l: left, r: this.shift(), line };
    }
    return left;
  }
  private shift(): Node {
    let left = this.additive();
    while (this.atOp('<<', '>>')) {
      const tok = this.next();
      left = { t: 'Bin', op: tok.value, l: left, r: this.additive(), line: tok.line };
    }
    return left;
  }
  private additive(): Node {
    let left = this.multiplicative();
    while (this.atOp('+', '-')) {
      const tok = this.next();
      left = { t: 'Bin', op: tok.value, l: left, r: this.multiplicative(), line: tok.line };
    }
    return left;
  }
  private multiplicative(): Node {
    let left = this.unary();
    while (this.atOp('*', '/', '//', '%', '@')) {
      const tok = this.next();
      left = { t: 'Bin', op: tok.value, l: left, r: this.unary(), line: tok.line };
    }
    return left;
  }
  private unary(): Node {
    if (this.atOp('-', '+', '~')) {
      const tok = this.next();
      return { t: 'Unary', op: tok.value, e: this.unary(), line: tok.line };
    }
    return this.power();
  }
  private power(): Node {
    const base = this.postfix();
    if (this.atOp('**')) {
      const line = this.next().line;
      return { t: 'Bin', op: '**', l: base, r: this.unary(), line };
    }
    return base;
  }

  private postfix(): Node {
    let node = this.atom();
    for (;;) {
      if (this.atOp('(')) {
        const line = this.next().line;
        const args: Node[] = [];
        const kwargs: Array<[string, Node]> = [];
        while (!this.atOp(')')) {
          if (this.at('NAME') && this.peek(1).type === 'OP' && this.peek(1).value === '=') {
            const key = this.next().value;
            this.next();
            kwargs.push([key, this.expression()]);
          } else {
            const arg = this.expression();
            // A generator expression as an argument - `sum(x * x for x in xs)`
            // - is evaluated eagerly as a list, which is indistinguishable
            // here from the real thing except for memory use.
            args.push(this.atKw('for') ? this.comprehensionTail(arg, 'list', line) : arg);
          }
          if (this.atOp(',')) this.next();
          else break;
        }
        this.expect('OP', ')');
        node = { t: 'Call', fn: node, args, kwargs, line };
      } else if (this.atOp('[')) {
        const line = this.next().line;
        let lo: Node | null = null;
        if (!this.atOp(':')) lo = this.expression();
        if (this.atOp(':')) {
          this.next();
          let hi: Node | null = null;
          let step: Node | null = null;
          if (!this.atOp(']') && !this.atOp(':')) hi = this.expression();
          if (this.atOp(':')) {
            this.next();
            if (!this.atOp(']')) step = this.expression();
          }
          this.expect('OP', ']');
          node = { t: 'Slice', obj: node, lo, hi, step, line };
        } else {
          this.expect('OP', ']');
          node = { t: 'Index', obj: node, idx: lo!, line };
        }
      } else if (this.atOp('.')) {
        const line = this.next().line;
        const name = this.expect('NAME').value;
        node = { t: 'Attr', obj: node, name, line };
      } else return node;
    }
  }

  private atom(): Node {
    const tok = this.peek();
    const line = tok.line;

    if (tok.type === 'NUM') {
      this.next();
      const v = tok.value.startsWith('0x') || tok.value.startsWith('0X')
        ? parseInt(tok.value, 16)
        : tok.value.startsWith('0b') || tok.value.startsWith('0B')
          ? parseInt(tok.value.slice(2), 2)
          : Number(tok.value);
      return { t: 'Num', v, float: !!tok.float, line };
    }
    if (tok.type === 'STR') {
      this.next();
      let text = unescapePy(tok.value);
      // adjacent string literals concatenate
      while (this.at('STR')) text += unescapePy(this.next().value);
      return { t: 'Str', v: text, line };
    }
    if (tok.type === 'FSTR') {
      this.next();
      return { t: 'FStr', raw: tok.value, line };
    }
    if (tok.type === 'NAME') {
      if (tok.value === 'True' || tok.value === 'False') {
        this.next();
        return { t: 'Bool', v: tok.value === 'True', line };
      }
      if (tok.value === 'None') {
        this.next();
        return { t: 'None', line };
      }
      if (KEYWORDS.has(tok.value) && tok.value !== 'lambda') {
        throw new PyError('SyntaxError', `unexpected keyword '${tok.value}'`, line);
      }
      this.next();
      return { t: 'Name', id: tok.value, line };
    }
    if (this.atOp('(')) {
      this.next();
      if (this.atOp(')')) {
        this.next();
        return { t: 'Tuple', items: [], line };
      }
      const first = this.expression();
      if (this.atOp(',')) {
        const items = [first];
        while (this.atOp(',')) {
          this.next();
          if (this.atOp(')')) break;
          items.push(this.expression());
        }
        this.expect('OP', ')');
        return { t: 'Tuple', items, line };
      }
      this.expect('OP', ')');
      return first;
    }
    if (this.atOp('[')) {
      this.next();
      if (this.atOp(']')) {
        this.next();
        return { t: 'List', items: [], line };
      }
      const first = this.expression();
      if (this.atKw('for')) {
        const comp = this.comprehensionTail(first, 'list', line);
        this.expect('OP', ']');
        return comp;
      }
      const items = [first];
      while (this.atOp(',')) {
        this.next();
        if (this.atOp(']')) break;
        items.push(this.expression());
      }
      this.expect('OP', ']');
      return { t: 'List', items, line };
    }
    if (this.atOp('{')) {
      this.next();
      if (this.atOp('}')) {
        this.next();
        return { t: 'DictLit', entries: [], line };
      }
      const first = this.expression();
      if (this.atOp(':')) {
        this.next();
        const firstVal = this.expression();
        if (this.atKw('for')) {
          this.next();
          const target = this.targetList();
          if (!this.atKw('in')) throw new PyError('SyntaxError', "expected 'in'", line);
          this.next();
          const iter = this.orExpr();
          let cond: Node | null = null;
          if (this.atKw('if')) {
            this.next();
            cond = this.orExpr();
          }
          this.expect('OP', '}');
          return { t: 'DictComp', key: first, value: firstVal, target, iter, cond, line };
        }
        const entries: Array<[Node, Node]> = [[first, firstVal]];
        while (this.atOp(',')) {
          this.next();
          if (this.atOp('}')) break;
          const k = this.expression();
          this.expect('OP', ':');
          entries.push([k, this.expression()]);
        }
        this.expect('OP', '}');
        return { t: 'DictLit', entries, line };
      }
      if (this.atKw('for')) {
        const comp = this.comprehensionTail(first, 'set', line);
        this.expect('OP', '}');
        return comp;
      }
      const items = [first];
      while (this.atOp(',')) {
        this.next();
        if (this.atOp('}')) break;
        items.push(this.expression());
      }
      this.expect('OP', '}');
      return { t: 'SetLit', items, line };
    }

    throw new PyError('SyntaxError', `unexpected '${tok.value || tok.type}'`, line);
  }

  private comprehensionTail(expr: Node, kind: 'list' | 'set', line: number): Node {
    this.next(); // for
    const target = this.targetList();
    if (!this.atKw('in')) throw new PyError('SyntaxError', "expected 'in'", line);
    this.next();
    const iter = this.orExpr();
    let cond: Node | null = null;
    if (this.atKw('if')) {
      this.next();
      cond = this.expression();
    }
    return { t: 'Comp', expr, target, iter, cond, kind, line };
  }
}

function unescapePy(s: string): string {
  return s.replace(/\\(n|t|r|\\|'|"|0|a|b|f|v|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4})/g, (_m, g: string) => {
    switch (g[0]) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '\\': return '\\';
      case "'": return "'";
      case '"': return '"';
      case '0': return '\0';
      case 'a': return '\x07';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case 'x': return String.fromCharCode(parseInt(g.slice(1), 16));
      case 'u': return String.fromCharCode(parseInt(g.slice(1), 16));
      default: return g;
    }
  });
}

/* ----------------------------------------------------------- environment */

class Env {
  vars = new Map<string, PyValue>();
  constructor(readonly parent: Env | null = null) {}
  get(name: string): PyValue | undefined {
    let env: Env | null = this;
    while (env) {
      if (env.vars.has(name)) return env.vars.get(name);
      env = env.parent;
    }
    return undefined;
  }
  has(name: string): boolean {
    let env: Env | null = this;
    while (env) {
      if (env.vars.has(name)) return true;
      env = env.parent;
    }
    return false;
  }
  set(name: string, value: PyValue) {
    this.vars.set(name, value);
  }
  setGlobal(name: string, value: PyValue) {
    let env: Env = this;
    while (env.parent) env = env.parent;
    env.vars.set(name, value);
  }
}

interface Ctx {
  out: string[];
  steps: { n: number; max: number };
  stdin: string[];
  globals: Env;
}

/* ---------------------------------------------------------- interpreter */

function bin(op: string, a: PyValue, b: PyValue, line: number): PyValue {
  switch (op) {
    case 'in':
      return contains(b, a, line);
    case 'not in':
      return !truthy(contains(b, a, line));
    case 'is':
      return a === b || (a === null && b === null);
    case 'is not':
      return !(a === b || (a === null && b === null));
    case '==':
      return pyEq(a, b);
    case '!=':
      return !pyEq(a, b);
  }

  if (op === '<' || op === '>' || op === '<=' || op === '>=') {
    if (typeof a === 'string' && typeof b === 'string') {
      return op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
    }
    if (isNum(a) && isNum(b)) {
      const x = numOf(a as number);
      const y = numOf(b as number);
      return op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y;
    }
    throw new PyError(
      'TypeError',
      `'${op}' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`,
      line,
    );
  }

  if (op === '+') {
    if (typeof a === 'string' && typeof b === 'string') return a + b;
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    if (a instanceof PyTuple && b instanceof PyTuple) return new PyTuple([...a.items, ...b.items]);
    if (typeof a === 'string' || typeof b === 'string') {
      throw new PyError(
        'TypeError',
        typeof a === 'string'
          ? `can only concatenate str (not "${typeName(b)}") to str`
          : `unsupported operand type(s) for +: '${typeName(a)}' and 'str'`,
        line,
      );
    }
  }
  if (op === '*') {
    if (typeof a === 'string' && typeof b === 'number') return a.repeat(Math.max(0, b));
    if (typeof b === 'string' && typeof a === 'number') return b.repeat(Math.max(0, a));
    if (Array.isArray(a) && typeof b === 'number') {
      const out: PyValue[] = [];
      for (let i = 0; i < b; i++) out.push(...a);
      return out;
    }
  }

  if (!isNum(a) || !isNum(b)) {
    throw new PyError(
      'TypeError',
      `unsupported operand type(s) for ${op}: '${typeName(a)}' and '${typeName(b)}'`,
      line,
    );
  }
  const x = numOf(a);
  const y = numOf(b);
  const float = isFloat(a) || isFloat(b);

  switch (op) {
    case '+': return mkNum(x + y, float);
    case '-': return mkNum(x - y, float);
    case '*': return mkNum(x * y, float);
    case '/':
      if (y === 0) throw new PyError('ZeroDivisionError', 'division by zero', line);
      return new PyFloat(x / y);
    case '//':
      if (y === 0) throw new PyError('ZeroDivisionError', 'integer division or modulo by zero', line);
      return mkNum(Math.floor(x / y), float);
    case '%':
      if (y === 0) throw new PyError('ZeroDivisionError', 'integer division or modulo by zero', line);
      // Python's % follows the sign of the divisor, unlike JS.
      return mkNum(((x % y) + y) % y, float);
    case '**': {
      const r = Math.pow(x, y);
      return mkNum(r, float || y < 0);
    }
    case '&': return Math.trunc(x) & Math.trunc(y);
    case '|': return Math.trunc(x) | Math.trunc(y);
    case '^': return Math.trunc(x) ^ Math.trunc(y);
    case '<<': return Math.trunc(x) << Math.trunc(y);
    case '>>': return Math.trunc(x) >> Math.trunc(y);
    default:
      throw new PyError('SyntaxError', `unknown operator ${op}`, line);
  }
}

function contains(container: PyValue, item: PyValue, line: number): boolean {
  if (typeof container === 'string') {
    if (typeof item !== 'string') {
      throw new PyError('TypeError', `'in <string>' requires string as left operand, not ${typeName(item)}`, line);
    }
    return container.includes(item);
  }
  if (Array.isArray(container)) return container.some((x) => pyEq(x, item));
  if (container instanceof PyTuple) return container.items.some((x) => pyEq(x, item));
  if (container instanceof PySet) return container.has(item);
  if (container instanceof PyDict) return container.has(item);
  throw new PyError('TypeError', `argument of type '${typeName(container)}' is not iterable`, line);
}

function iterate(v: PyValue, line: number): PyValue[] {
  if (typeof v === 'string') return [...v];
  if (Array.isArray(v)) return v.slice();
  if (v instanceof PyTuple) return v.items.slice();
  if (v instanceof PySet) return v.items.slice();
  if (v instanceof PyDict) return v.keys.slice();
  throw new PyError('TypeError', `'${typeName(v)}' object is not iterable`, line);
}

function normIndex(i: number, len: number, line: number, forSlice = false): number {
  let idx = Math.trunc(i);
  if (idx < 0) idx += len;
  if (!forSlice && (idx < 0 || idx >= len)) throw new PyError('IndexError', 'list index out of range', line);
  return Math.max(0, Math.min(len, idx));
}

class Interp {
  constructor(private ctx: Ctx) {}

  private step(line: number) {
    if (++this.ctx.steps.n > this.ctx.steps.max) {
      throw new PyError('MiniPyError', 'this program ran too long - is there a loop that never ends?', line);
    }
  }

  execBlock(body: Node[], env: Env) {
    for (const stmt of body) this.exec(stmt, env);
  }

  exec(node: Node, env: Env): void {
    this.step(node.line);
    switch (node.t) {
      case 'Expr':
        this.eval(node.e, env);
        return;
      case 'Assign': {
        const value = this.eval(node.value, env);
        for (const target of node.targets) this.assign(target, value, env);
        return;
      }
      case 'AugAssign': {
        const current = this.eval(node.target, env);
        const value = bin(node.op, current, this.eval(node.value, env), node.line);
        this.assign(node.target, value, env);
        return;
      }
      case 'If':
        if (truthy(this.eval(node.test, env))) this.execBlock(node.body, env);
        else this.execBlock(node.orelse, env);
        return;
      case 'While':
        while (truthy(this.eval(node.test, env))) {
          this.step(node.line);
          try {
            this.execBlock(node.body, env);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      case 'For': {
        const items = iterate(this.eval(node.iter, env), node.line);
        for (const item of items) {
          this.step(node.line);
          this.assign(node.target, item, env);
          try {
            this.execBlock(node.body, env);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      }
      case 'Def':
        env.set(node.name, new PyFunc(node.name, node.params, node.body, env));
        return;
      case 'Class': {
        const methods = new Map<string, PyFunc>();
        const classEnv = new Env(env);
        for (const stmt of node.body) {
          if (stmt.t === 'Def') methods.set(stmt.name, new PyFunc(stmt.name, stmt.params, stmt.body, classEnv));
          else this.exec(stmt, classEnv);
        }
        const base = node.base ? env.get(node.base) : undefined;
        env.set(node.name, new PyClass(node.name, methods, base instanceof PyClass ? base : undefined));
        return;
      }
      case 'Return':
        throw new ReturnSignal(node.value ? this.eval(node.value, env) : null);
      case 'Break':
        throw new BreakSignal();
      case 'Continue':
        throw new ContinueSignal();
      case 'Pass':
        return;
      case 'Global':
        for (const name of node.names) {
          if (!env.has(name)) this.ctx.globals.set(name, null);
        }
        return;
      case 'Del': {
        if (node.target.t === 'Name') env.vars.delete(node.target.id);
        else if (node.target.t === 'Index') {
          const obj = this.eval(node.target.obj, env);
          const idx = this.eval(node.target.idx, env);
          if (Array.isArray(obj)) obj.splice(normIndex(numOf(idx as number), obj.length, node.line), 1);
          else if (obj instanceof PyDict) obj.delete(idx);
        }
        return;
      }
      case 'Raise': {
        const exc = node.exc ? this.eval(node.exc, env) : null;
        if (exc instanceof PyInstance) throw new PyError(exc.cls.name, pyStr(exc.fields.get('message') ?? ''), node.line);
        throw new PyError('Exception', exc === null ? '' : pyStr(exc), node.line);
      }
      case 'Assert':
        if (!truthy(this.eval(node.test, env))) {
          throw new PyError('AssertionError', node.msg ? pyStr(this.eval(node.msg, env)) : '', node.line);
        }
        return;
      case 'Try': {
        try {
          this.execBlock(node.body, env);
          this.execBlock(node.orelse, env);
        } catch (e) {
          if (e instanceof BreakSignal || e instanceof ContinueSignal || e instanceof ReturnSignal) throw e;
          if (!(e instanceof PyError)) throw e;
          const handler = node.handlers.find((h) => h.type === null || h.type === e.type || h.type === 'Exception');
          if (!handler) {
            this.execBlock(node.final, env);
            throw e;
          }
          if (handler.name) env.set(handler.name, e.message);
          this.execBlock(handler.body, env);
        } finally {
          this.execBlock(node.final, env);
        }
        return;
      }
      default:
        this.eval(node as Node, env);
    }
  }

  private assign(target: Node, value: PyValue, env: Env) {
    if (target.t === 'Name') {
      env.set(target.id, value);
      return;
    }
    if (target.t === 'Tuple' || target.t === 'List') {
      const items = iterate(value, target.line);
      if (items.length !== target.items.length) {
        throw new PyError(
          'ValueError',
          items.length < target.items.length
            ? `not enough values to unpack (expected ${target.items.length}, got ${items.length})`
            : `too many values to unpack (expected ${target.items.length})`,
          target.line,
        );
      }
      target.items.forEach((t, i) => this.assign(t, items[i], env));
      return;
    }
    if (target.t === 'Index') {
      const obj = this.eval(target.obj, env);
      const idx = this.eval(target.idx, env);
      if (Array.isArray(obj)) {
        obj[normIndex(numOf(idx as number), obj.length, target.line)] = value;
        return;
      }
      if (obj instanceof PyDict) {
        obj.set(idx, value);
        return;
      }
      throw new PyError('TypeError', `'${typeName(obj)}' object does not support item assignment`, target.line);
    }
    if (target.t === 'Attr') {
      const obj = this.eval(target.obj, env);
      if (obj instanceof PyInstance) {
        obj.fields.set(target.name, value);
        return;
      }
      throw new PyError('AttributeError', `cannot set attribute on '${typeName(obj)}'`, target.line);
    }
    throw new PyError('SyntaxError', 'cannot assign to that', target.line);
  }

  eval(node: Node, env: Env): PyValue {
    this.step(node.line);
    switch (node.t) {
      case 'Num':
        return node.float ? new PyFloat(node.v) : node.v;
      case 'Str':
        return node.v;
      case 'Bool':
        return node.v;
      case 'None':
        return null;
      case 'FStr':
        return this.evalFString(node.raw, env, node.line);
      case 'Name': {
        if (env.has(node.id)) return env.get(node.id)!;
        const b = BUILTINS[node.id];
        if (b) return b;
        throw new PyError('NameError', `name '${node.id}' is not defined`, node.line);
      }
      case 'List':
        return node.items.map((i) => this.eval(i, env));
      case 'Tuple':
        return new PyTuple(node.items.map((i) => this.eval(i, env)));
      case 'SetLit':
        return new PySet(node.items.map((i) => this.eval(i, env)));
      case 'DictLit': {
        const d = new PyDict();
        for (const [k, v] of node.entries) d.set(this.eval(k, env), this.eval(v, env));
        return d;
      }
      case 'Bin':
        return bin(node.op, this.eval(node.l, env), this.eval(node.r, env), node.line);
      case 'Unary': {
        const v = this.eval(node.e, env);
        if (node.op === 'not') return !truthy(v);
        if (node.op === '~') return ~Math.trunc(numOf(v as number));
        if (!isNum(v)) throw new PyError('TypeError', `bad operand type for unary ${node.op}: '${typeName(v)}'`, node.line);
        return mkNum(node.op === '-' ? -numOf(v) : numOf(v), isFloat(v));
      }
      case 'Bool2': {
        const left = this.eval(node.l, env);
        if (node.op === 'and') return truthy(left) ? this.eval(node.r, env) : left;
        return truthy(left) ? left : this.eval(node.r, env);
      }
      case 'Cond':
        return truthy(this.eval(node.test, env)) ? this.eval(node.then, env) : this.eval(node.other, env);
      case 'Lambda':
        return new PyFunc('<lambda>', node.params, [{ t: 'Return', value: node.body, line: node.line }], env);
      case 'Comp': {
        const out: PyValue[] = [];
        const scope = new Env(env);
        for (const item of iterate(this.eval(node.iter, env), node.line)) {
          this.step(node.line);
          this.assign(node.target, item, scope);
          if (node.cond && !truthy(this.eval(node.cond, scope))) continue;
          out.push(this.eval(node.expr, scope));
        }
        return node.kind === 'set' ? new PySet(out) : out;
      }
      case 'DictComp': {
        const d = new PyDict();
        const scope = new Env(env);
        for (const item of iterate(this.eval(node.iter, env), node.line)) {
          this.step(node.line);
          this.assign(node.target, item, scope);
          if (node.cond && !truthy(this.eval(node.cond, scope))) continue;
          d.set(this.eval(node.key, scope), this.eval(node.value, scope));
        }
        return d;
      }
      case 'Index': {
        const obj = this.eval(node.obj, env);
        const idx = this.eval(node.idx, env);
        return this.index(obj, idx, node.line);
      }
      case 'Slice': {
        const obj = this.eval(node.obj, env);
        const items = typeof obj === 'string' ? [...obj] : Array.isArray(obj) ? obj : obj instanceof PyTuple ? obj.items : null;
        if (!items) throw new PyError('TypeError', `'${typeName(obj)}' object is not subscriptable`, node.line);
        const step = node.step ? Math.trunc(numOf(this.eval(node.step, env) as number)) : 1;
        if (step === 0) throw new PyError('ValueError', 'slice step cannot be zero', node.line);
        const len = items.length;
        let lo = node.lo ? Math.trunc(numOf(this.eval(node.lo, env) as number)) : step > 0 ? 0 : len - 1;
        let hi = node.hi ? Math.trunc(numOf(this.eval(node.hi, env) as number)) : step > 0 ? len : -len - 1;
        if (lo < 0) lo += len;
        if (hi < 0) hi += len;
        const out: PyValue[] = [];
        if (step > 0) {
          for (let i = Math.max(0, lo); i < Math.min(len, hi); i += step) out.push(items[i]);
        } else {
          for (let i = Math.min(len - 1, lo); i > Math.max(-1, hi); i += step) out.push(items[i]);
        }
        if (typeof obj === 'string') return out.join('');
        if (obj instanceof PyTuple) return new PyTuple(out);
        return out;
      }
      case 'Attr': {
        const obj = this.eval(node.obj, env);
        return this.getAttr(obj, node.name, node.line);
      }
      case 'Call': {
        const args = node.args.map((a) => this.eval(a, env));
        const kwargs = new Map(node.kwargs.map(([k, v]) => [k, this.eval(v, env)] as const));
        // Method calls need the receiver, so they are resolved here rather
        // than through a generic bound-method object.
        if (node.fn.t === 'Attr') {
          const obj = this.eval(node.fn.obj, env);
          return this.callMethod(obj, node.fn.name, args, kwargs, node.line);
        }
        const fn = this.eval(node.fn, env);
        return this.call(fn, args, kwargs, node.line);
      }
      default:
        throw new PyError('SyntaxError', `cannot evaluate ${node.t}`, node.line);
    }
  }

  private index(obj: PyValue, idx: PyValue, line: number): PyValue {
    if (typeof obj === 'string') {
      const i = normIndex(numOf(idx as number), obj.length, line);
      return obj[i];
    }
    if (Array.isArray(obj)) return obj[normIndex(numOf(idx as number), obj.length, line)];
    if (obj instanceof PyTuple) return obj.items[normIndex(numOf(idx as number), obj.items.length, line)];
    if (obj instanceof PyDict) {
      if (!obj.has(idx)) throw new PyError('KeyError', pyRepr(idx), line);
      return obj.get(idx)!;
    }
    throw new PyError('TypeError', `'${typeName(obj)}' object is not subscriptable`, line);
  }

  private getAttr(obj: PyValue, name: string, line: number): PyValue {
    if (obj instanceof PyInstance) {
      if (obj.fields.has(name)) return obj.fields.get(name)!;
      const method = obj.cls.find(name);
      if (method) return new PyFunc(method.name, method.params, method.body, method.closure, obj);
    }
    if (obj instanceof PyClass) {
      const method = obj.find(name);
      if (method) return method;
    }
    throw new PyError('AttributeError', `'${typeName(obj)}' object has no attribute '${name}'`, line);
  }

  call(fn: PyValue, args: PyValue[], kwargs: Map<string, PyValue>, line: number): PyValue {
    this.step(line);
    if (fn && typeof fn === 'object' && '__builtin' in fn) {
      return (fn as Builtin).call(args, this.ctx, kwargs);
    }
    if (fn instanceof PyClass) {
      const inst = new PyInstance(fn);
      const init = fn.find('__init__');
      if (init) {
        this.invoke(new PyFunc(init.name, init.params, init.body, init.closure, inst), args, kwargs, line);
      }
      return inst;
    }
    if (fn instanceof PyFunc) return this.invoke(fn, args, kwargs, line);
    throw new PyError('TypeError', `'${typeName(fn)}' object is not callable`, line);
  }

  private invoke(fn: PyFunc, args: PyValue[], kwargs: Map<string, PyValue>, line: number): PyValue {
    const env = new Env(fn.closure);
    const params = fn.params;
    let offset = 0;
    if (fn.self !== undefined && params.length && params[0].name === 'self') {
      env.set('self', fn.self);
      offset = 1;
    }
    const positional = params.slice(offset);
    if (args.length > positional.length) {
      throw new PyError(
        'TypeError',
        `${fn.name}() takes ${positional.length} positional argument${positional.length === 1 ? '' : 's'} but ${args.length} were given`,
        line,
      );
    }
    positional.forEach((param, i) => {
      if (i < args.length) env.set(param.name, args[i]);
      else if (kwargs.has(param.name)) env.set(param.name, kwargs.get(param.name)!);
      else if (param.def) env.set(param.name, this.eval(param.def, fn.closure));
      else throw new PyError('TypeError', `${fn.name}() missing required argument: '${param.name}'`, line);
    });

    try {
      this.execBlock(fn.body, env);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    return null;
  }

  private callMethod(
    obj: PyValue,
    name: string,
    args: PyValue[],
    kwargs: Map<string, PyValue>,
    line: number,
  ): PyValue {
    const method = METHODS(obj, name, this, line);
    if (method) return method(args, this.ctx, kwargs);
    // Fall back to a user-defined method / attribute holding a function.
    const attr = this.getAttr(obj, name, line);
    return this.call(attr, args, kwargs, line);
  }

  private evalFString(raw: string, env: Env, line: number): string {
    let out = '';
    let i = 0;
    while (i < raw.length) {
      const ch = raw[i];
      if (ch === '{' && raw[i + 1] === '{') {
        out += '{';
        i += 2;
        continue;
      }
      if (ch === '}' && raw[i + 1] === '}') {
        out += '}';
        i += 2;
        continue;
      }
      if (ch === '{') {
        let depth = 1;
        let j = i + 1;
        while (j < raw.length && depth > 0) {
          if (raw[j] === '{') depth++;
          else if (raw[j] === '}') depth--;
          if (depth > 0) j++;
        }
        if (depth !== 0) throw new PyError('SyntaxError', "f-string: expected '}'", line);
        const inner = raw.slice(i + 1, j);
        const [exprSrc, spec] = splitFormatSpec(inner);
        const value = this.evalSnippet(exprSrc, env, line);
        out += formatValue(value, spec);
        i = j + 1;
        continue;
      }
      out += ch;
      i++;
    }
    return unescapePy(out);
  }

  evalSnippet(src: string, env: Env, line: number): PyValue {
    try {
      const parser = new Parser(tokenize(src.trim()));
      const expr = parser.expression();
      return this.eval(expr, env);
    } catch (e) {
      if (e instanceof PyError) {
        e.line = e.line || line;
        throw e;
      }
      throw new PyError('SyntaxError', `bad f-string expression: ${src}`, line);
    }
  }
}

function splitFormatSpec(inner: string): [string, string] {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inStr) {
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") inStr = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ':' && depth === 0) return [inner.slice(0, i), inner.slice(i + 1)];
    else if (c === '!' && depth === 0 && inner[i + 1] === 'r') return [inner.slice(0, i), '!r'];
  }
  return [inner, ''];
}

function formatValue(value: PyValue, spec: string): string {
  if (!spec) return pyStr(value);
  if (spec === '!r') return pyRepr(value);
  const m = /^([<>^]?)(\d*)(,?)(?:\.(\d+))?([fdges%]?)$/.exec(spec);
  if (!m) return pyStr(value);
  const [, align, widthRaw, comma, precision, type] = m;
  let text: string;
  if (type === 'f' || (precision && isNum(value))) {
    text = numOf(value as number).toFixed(precision ? Number(precision) : 6);
  } else if (type === '%') {
    text = `${(numOf(value as number) * 100).toFixed(precision ? Number(precision) : 6)}%`;
  } else if (type === 'd') {
    text = String(Math.trunc(numOf(value as number)));
  } else {
    text = pyStr(value);
  }
  if (comma && isNum(value)) {
    const [int, frac] = text.split('.');
    text = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? `.${frac}` : '');
  }
  const width = widthRaw ? Number(widthRaw) : 0;
  if (text.length >= width) return text;
  const pad = width - text.length;
  if (align === '>') return ' '.repeat(pad) + text;
  if (align === '^') return ' '.repeat(Math.floor(pad / 2)) + text + ' '.repeat(Math.ceil(pad / 2));
  if (align === '<') return text + ' '.repeat(pad);
  return isNum(value) ? ' '.repeat(pad) + text : text + ' '.repeat(pad);
}

/* -------------------------------------------------------------- builtins */

const bi = (
  name: string,
  call: (args: PyValue[], ctx: Ctx, kwargs: Map<string, PyValue>) => PyValue,
): Builtin => ({ __builtin: name, call });



function toNumber(v: PyValue, line = 0): number {
  if (isNum(v)) return numOf(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  throw new PyError('TypeError', `expected a number, got '${typeName(v)}'`, line);
}

const BUILTINS: Record<string, Builtin> = {
  print: bi('print', (args, ctx, kw) => {
    const sep = kw.has('sep') ? pyStr(kw.get('sep')!) : ' ';
    const end = kw.has('end') ? pyStr(kw.get('end')!) : '\n';
    ctx.out.push(args.map(pyStr).join(sep) + end);
    return null;
  }),
  len: bi('len', (args) => {
    const v = args[0];
    if (typeof v === 'string') return v.length;
    if (Array.isArray(v)) return v.length;
    if (v instanceof PyTuple) return v.items.length;
    if (v instanceof PySet) return v.items.length;
    if (v instanceof PyDict) return v.size;
    throw new PyError('TypeError', `object of type '${typeName(v)}' has no len()`, 0);
  }),
  range: bi('range', (args) => {
    const nums = args.map((a) => Math.trunc(toNumber(a)));
    const [start, stop, step] =
      nums.length === 1 ? [0, nums[0], 1] : nums.length === 2 ? [nums[0], nums[1], 1] : nums;
    if (step === 0) throw new PyError('ValueError', 'range() arg 3 must not be zero', 0);
    const out: PyValue[] = [];
    if (step > 0) for (let i = start; i < stop; i += step) out.push(i);
    else for (let i = start; i > stop; i += step) out.push(i);
    if (out.length > 2_000_000) throw new PyError('MiniPyError', 'that range is too large to build here', 0);
    return out;
  }),
  int: bi('int', (args, _ctx, kw) => {
    const v = args[0];
    if (v === undefined) return 0;
    if (typeof v === 'string') {
      const baseArg = kw.get('base') ?? args[1];
      const base = baseArg !== undefined ? Math.trunc(toNumber(baseArg)) : 10;
      const n = parseInt(v.trim(), base);
      if (Number.isNaN(n)) {
        throw new PyError('ValueError', `invalid literal for int() with base ${base}: '${v}'`, 0);
      }
      return n;
    }
    return Math.trunc(toNumber(v));
  }),
  float: bi('float', (args) => {
    const v = args[0];
    if (typeof v === 'string') {
      const n = Number(v.trim());
      if (Number.isNaN(n)) throw new PyError('ValueError', `could not convert string to float: '${v}'`, 0);
      return new PyFloat(n);
    }
    return new PyFloat(toNumber(v));
  }),
  str: bi('str', (args) => (args.length ? pyStr(args[0]) : '')),
  repr: bi('repr', (args) => pyRepr(args[0])),
  bool: bi('bool', (args) => (args.length ? truthy(args[0]) : false)),
  list: bi('list', (args) => (args.length ? iterate(args[0], 0) : [])),
  tuple: bi('tuple', (args) => new PyTuple(args.length ? iterate(args[0], 0) : [])),
  set: bi('set', (args) => new PySet(args.length ? iterate(args[0], 0) : [])),
  dict: bi('dict', (args) => {
    const d = new PyDict();
    if (args[0] instanceof PyDict) {
      const src = args[0];
      src.keys.forEach((k, i) => d.set(k, src.values[i]));
    } else if (Array.isArray(args[0])) {
      for (const pair of args[0]) {
        const items = iterate(pair, 0);
        d.set(items[0], items[1]);
      }
    }
    return d;
  }),
  sum: bi('sum', (args) => {
    const items = iterate(args[0], 0);
    let float = args[1] !== undefined && isFloat(args[1]);
    let total = args[1] !== undefined ? numOf(args[1] as number) : 0;
    for (const item of items) {
      if (!isNum(item)) throw new PyError('TypeError', `unsupported operand type(s) for +: 'int' and '${typeName(item)}'`, 0);
      if (isFloat(item)) float = true;
      total += numOf(item);
    }
    return mkNum(total, float);
  }),
  min: bi('min', (args) => reduceExtreme(args, true)),
  max: bi('max', (args) => reduceExtreme(args, false)),
  abs: bi('abs', (args) => mkNum(Math.abs(toNumber(args[0])), isFloat(args[0]))),
  round: bi('round', (args, _ctx, kw) => {
    const n = toNumber(args[0]);
    const digitsArg = kw.get('ndigits') ?? args[1];
    const digits = digitsArg !== undefined ? Math.trunc(toNumber(digitsArg)) : 0;
    const result = pyRound(n, digits);
    // Without a digit count Python returns an int; with one, a float.
    return digitsArg === undefined ? result : new PyFloat(result);
  }),
  sorted: bi('sorted', (args, ctx, kw) => {
    const items = iterate(args[0], 0);
    const key = kw.get('key') ?? args[1] ?? null;
    const reverse = truthy(kw.get('reverse') ?? args[2] ?? false);
    return sortValues(items, key, reverse, ctx);
  }),
  reversed: bi('reversed', (args) => iterate(args[0], 0).reverse()),
  enumerate: bi('enumerate', (args, _ctx, kw) => {
    const startArg = kw.get('start') ?? args[1];
    const start = startArg !== undefined ? Math.trunc(toNumber(startArg)) : 0;
    return iterate(args[0], 0).map((v, i) => new PyTuple([i + start, v]));
  }),
  zip: bi('zip', (args) => {
    const lists = args.map((a) => iterate(a, 0));
    const n = Math.min(...lists.map((l) => l.length));
    const out: PyValue[] = [];
    for (let i = 0; i < n; i++) out.push(new PyTuple(lists.map((l) => l[i])));
    return out;
  }),
  any: bi('any', (args) => iterate(args[0], 0).some(truthy)),
  all: bi('all', (args) => iterate(args[0], 0).every(truthy)),
  type: bi('type', (args) => typeName(args[0])),
  isinstance: bi('isinstance', (args) => {
    const [v, t] = args;
    if (t instanceof PyClass) {
      let cls: PyClass | undefined = v instanceof PyInstance ? v.cls : undefined;
      while (cls) {
        if (cls === t) return true;
        cls = cls.base;
      }
      return false;
    }
    const want = (t as Builtin)?.__builtin ?? pyStr(t);
    return typeName(v) === want || (want === 'float' && typeof v === 'number');
  }),
  input: bi('input', (args, ctx) => {
    if (args.length) ctx.out.push(pyStr(args[0]));
    return ctx.stdin.length ? ctx.stdin.shift()! : '';
  }),
  chr: bi('chr', (args) => String.fromCharCode(Math.trunc(toNumber(args[0])))),
  ord: bi('ord', (args) => String(args[0]).charCodeAt(0)),
  divmod: bi('divmod', (args) => {
    const a = toNumber(args[0]);
    const b = toNumber(args[1]);
    if (b === 0) throw new PyError('ZeroDivisionError', 'integer division or modulo by zero', 0);
    const float = isFloat(args[0]) || isFloat(args[1]);
    return new PyTuple([mkNum(Math.floor(a / b), float), mkNum(((a % b) + b) % b, float)]);
  }),
  pow: bi('pow', (args) => mkNum(Math.pow(toNumber(args[0]), toNumber(args[1])), isFloat(args[0]) || isFloat(args[1]))),
};


/**
 * Python's round(): half-to-even, applied to the *exact* binary value.
 *
 * The obvious `Math.round(n * 10 ** d) / 10 ** d` is wrong in a way learners
 * notice: 2.675 * 100 is exactly 267.5 in floating point even though 2.675
 * itself is 2.67499..., so the naive version answers 2.68 where Python says
 * 2.67. Reading the exact decimal expansion out of `toFixed` avoids inventing
 * that extra half.
 */
function pyRound(n: number, digits: number): number {
  if (!Number.isFinite(n) || Math.abs(n) >= 1e21) return n;
  if (digits < 0) {
    const factor = Math.pow(10, -digits);
    return pyRound(n / factor, 0) * factor;
  }
  const sign = n < 0 ? -1 : 1;
  const decimals = Math.max(0, Math.min(100, digits + 20));
  const exact = Math.abs(n).toFixed(decimals);
  const dot = exact.indexOf('.');
  const intPart = dot < 0 ? exact : exact.slice(0, dot);
  const fracPart = dot < 0 ? '' : exact.slice(dot + 1);

  const kept = fracPart.slice(0, digits);
  const rest = fracPart.slice(digits);
  const base = Number(kept ? `${intPart}.${kept}` : intPart);
  const unit = Math.pow(10, -digits);

  const tie = rest[0] === '5' && /^0*$/.test(rest.slice(1));
  const lastDigit = Number((digits === 0 ? intPart : kept)?.slice(-1) || '0');

  let abs: number;
  if (tie) abs = lastDigit % 2 === 0 ? base : base + unit;
  else if (rest[0] !== undefined && rest[0] >= '5') abs = base + unit;
  else abs = base;

  const value = sign * abs;
  // The addition above can reintroduce float noise; snap it back.
  return digits > 0 ? Number(value.toFixed(digits)) : value;
}

function reduceExtreme(args: PyValue[], wantMin: boolean): PyValue {
  const items = args.length === 1 ? iterate(args[0], 0) : args;
  if (!items.length) throw new PyError('ValueError', `${wantMin ? 'min' : 'max'}() arg is an empty sequence`, 0);
  return items.reduce((best, v) => {
    if (typeof best === 'string' && typeof v === 'string') {
      return wantMin ? (v < best ? v : best) : v > best ? v : best;
    }
    const a = numOf(best as number);
    const b = numOf(v as number);
    return wantMin ? (b < a ? v : best) : b > a ? v : best;
  });
}

function sortValues(items: PyValue[], key: PyValue | null, reverse: boolean, ctx: Ctx): PyValue[] {
  const interp = new Interp(ctx);
  const decorated = items.map((v) => ({
    v,
    k: key && key !== null ? interp.call(key, [v], new Map(), 0) : v,
  }));
  decorated.sort((a, b) => {
    const x = a.k;
    const y = b.k;
    if (typeof x === 'string' && typeof y === 'string') return x < y ? -1 : x > y ? 1 : 0;
    if (x instanceof PyTuple && y instanceof PyTuple) {
      for (let i = 0; i < Math.min(x.items.length, y.items.length); i++) {
        const xi = x.items[i];
        const yi = y.items[i];
        if (pyEq(xi, yi)) continue;
        if (typeof xi === 'string' && typeof yi === 'string') return xi < yi ? -1 : 1;
        return numOf(xi as number) - numOf(yi as number);
      }
      return x.items.length - y.items.length;
    }
    return numOf(x as number) - numOf(y as number);
  });
  const out = decorated.map((d) => d.v);
  return reverse ? out.reverse() : out;
}

/* ------------------------------------------------------- object methods */

type MethodImpl = (args: PyValue[], ctx: Ctx, kwargs: Map<string, PyValue>) => PyValue;

function METHODS(obj: PyValue, name: string, interp: Interp, line: number): MethodImpl | null {
  if (typeof obj === 'string') return stringMethod(obj, name, line);
  if (Array.isArray(obj)) return listMethod(obj, name, interp, line);
  if (obj instanceof PyDict) return dictMethod(obj, name, line);
  if (obj instanceof PySet) return setMethod(obj, name, line);
  if (obj instanceof PyTuple) return tupleMethod(obj, name);
  return null;
}

function stringMethod(s: string, name: string, line: number): MethodImpl | null {
  const map: Record<string, MethodImpl> = {
    upper: () => s.toUpperCase(),
    lower: () => s.toLowerCase(),
    title: () => s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()),
    capitalize: () => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s),
    strip: (a) => (a[0] !== undefined ? trimChars(s, String(a[0]), true, true) : s.trim()),
    lstrip: (a) => (a[0] !== undefined ? trimChars(s, String(a[0]), true, false) : s.replace(/^\s+/, '')),
    rstrip: (a) => (a[0] !== undefined ? trimChars(s, String(a[0]), false, true) : s.replace(/\s+$/, '')),
    split: (a) => {
      if (a[0] === undefined || a[0] === null) return s.split(/\s+/).filter((p) => p.length > 0);
      return s.split(String(a[0]));
    },
    rsplit: (a) => (a[0] === undefined ? s.split(/\s+/).filter(Boolean) : s.split(String(a[0]))),
    splitlines: () => s.split('\n'),
    join: (a) => iterate(a[0], line).map((v) => {
      if (typeof v !== 'string') throw new PyError('TypeError', `sequence item: expected str instance, ${typeName(v)} found`, line);
      return v;
    }).join(s),
    replace: (a) => s.split(String(a[0])).join(String(a[1])),
    startswith: (a) => s.startsWith(String(a[0])),
    endswith: (a) => s.endsWith(String(a[0])),
    find: (a) => s.indexOf(String(a[0])),
    rfind: (a) => s.lastIndexOf(String(a[0])),
    index: (a) => {
      const i = s.indexOf(String(a[0]));
      if (i < 0) throw new PyError('ValueError', 'substring not found', line);
      return i;
    },
    count: (a) => (String(a[0]) === '' ? s.length + 1 : s.split(String(a[0])).length - 1),
    isdigit: () => s.length > 0 && /^[0-9]+$/.test(s),
    isalpha: () => s.length > 0 && /^[A-Za-z]+$/.test(s),
    isalnum: () => s.length > 0 && /^[A-Za-z0-9]+$/.test(s),
    isspace: () => s.length > 0 && /^\s+$/.test(s),
    isupper: () => /[A-Za-z]/.test(s) && s === s.toUpperCase(),
    islower: () => /[A-Za-z]/.test(s) && s === s.toLowerCase(),
    zfill: (a) => s.padStart(Math.trunc(toNumber(a[0])), '0'),
    ljust: (a) => s.padEnd(Math.trunc(toNumber(a[0])), a[1] ? String(a[1]) : ' '),
    rjust: (a) => s.padStart(Math.trunc(toNumber(a[0])), a[1] ? String(a[1]) : ' '),
    format: (a) => {
      let i = 0;
      return s.replace(/\{([^{}]*)\}/g, (_m, spec: string) => {
        const [nameOrIdx, fmt] = splitFormatSpec(spec);
        const value = nameOrIdx === '' ? a[i++] : a[Number(nameOrIdx)];
        return formatValue(value ?? null, fmt);
      });
    },
  };
  return map[name] ?? null;
}

function trimChars(s: string, chars: string, left: boolean, right: boolean): string {
  let start = 0;
  let end = s.length;
  if (left) while (start < end && chars.includes(s[start])) start++;
  if (right) while (end > start && chars.includes(s[end - 1])) end--;
  return s.slice(start, end);
}

function listMethod(list: PyValue[], name: string, interp: Interp, line: number): MethodImpl | null {
  const map: Record<string, MethodImpl> = {
    append: (a) => {
      list.push(a[0]);
      return null;
    },
    extend: (a) => {
      list.push(...iterate(a[0], line));
      return null;
    },
    insert: (a) => {
      const i = Math.trunc(toNumber(a[0]));
      list.splice(i < 0 ? Math.max(0, list.length + i) : Math.min(i, list.length), 0, a[1]);
      return null;
    },
    pop: (a) => {
      if (!list.length) throw new PyError('IndexError', 'pop from empty list', line);
      const i = a[0] !== undefined ? normIndex(toNumber(a[0]), list.length, line) : list.length - 1;
      return list.splice(i, 1)[0];
    },
    remove: (a) => {
      const i = list.findIndex((x) => pyEq(x, a[0]));
      if (i < 0) throw new PyError('ValueError', 'list.remove(x): x not in list', line);
      list.splice(i, 1);
      return null;
    },
    clear: () => {
      list.length = 0;
      return null;
    },
    index: (a) => {
      const i = list.findIndex((x) => pyEq(x, a[0]));
      if (i < 0) throw new PyError('ValueError', `${pyRepr(a[0])} is not in list`, line);
      return i;
    },
    count: (a) => list.filter((x) => pyEq(x, a[0])).length,
    reverse: () => {
      list.reverse();
      return null;
    },
    sort: (a, ctx, kw) => {
      const key = kw.get('key') ?? a[0] ?? null;
      const reverse = truthy(kw.get('reverse') ?? a[1] ?? false);
      const sorted = sortValues(list.slice(), key, reverse, ctx);
      list.length = 0;
      list.push(...sorted);
      return null;
    },
    copy: () => list.slice(),
  };
  void interp;
  return map[name] ?? null;
}

function dictMethod(d: PyDict, name: string, line: number): MethodImpl | null {
  const map: Record<string, MethodImpl> = {
    keys: () => d.keys.slice(),
    values: () => d.values.slice(),
    items: () => d.keys.map((k, i) => new PyTuple([k, d.values[i]])),
    get: (a) => (d.has(a[0]) ? d.get(a[0])! : (a[1] ?? null)),
    pop: (a) => {
      if (!d.has(a[0])) {
        if (a[1] !== undefined) return a[1];
        throw new PyError('KeyError', pyRepr(a[0]), line);
      }
      const v = d.get(a[0])!;
      d.delete(a[0]);
      return v;
    },
    setdefault: (a) => {
      if (!d.has(a[0])) d.set(a[0], a[1] ?? null);
      return d.get(a[0])!;
    },
    update: (a) => {
      if (a[0] instanceof PyDict) a[0].keys.forEach((k, i) => d.set(k, (a[0] as PyDict).values[i]));
      return null;
    },
    clear: () => {
      d.keys.length = 0;
      d.values.length = 0;
      return null;
    },
    copy: () => {
      const c = new PyDict();
      d.keys.forEach((k, i) => c.set(k, d.values[i]));
      return c;
    },
  };
  return map[name] ?? null;
}

function setMethod(s: PySet, name: string, line: number): MethodImpl | null {
  const map: Record<string, MethodImpl> = {
    add: (a) => {
      s.add(a[0]);
      return null;
    },
    remove: (a) => {
      if (!s.has(a[0])) throw new PyError('KeyError', pyRepr(a[0]), line);
      s.delete(a[0]);
      return null;
    },
    discard: (a) => {
      s.delete(a[0]);
      return null;
    },
    union: (a) => new PySet([...s.items, ...iterate(a[0], line)]),
    intersection: (a) => {
      const other = new PySet(iterate(a[0], line));
      return new PySet(s.items.filter((x) => other.has(x)));
    },
    difference: (a) => {
      const other = new PySet(iterate(a[0], line));
      return new PySet(s.items.filter((x) => !other.has(x)));
    },
    clear: () => {
      s.items.length = 0;
      return null;
    },
  };
  return map[name] ?? null;
}

function tupleMethod(t: PyTuple, name: string): MethodImpl | null {
  const map: Record<string, MethodImpl> = {
    count: (a) => t.items.filter((x) => pyEq(x, a[0])).length,
    index: (a) => t.items.findIndex((x) => pyEq(x, a[0])),
  };
  return map[name] ?? null;
}

/* ------------------------------------------------------------------ entry */

export function runPython(
  source: string,
  opts: { stdin?: string; maxSteps?: number } = {},
): PyResult {
  const ctx: Ctx = {
    out: [],
    steps: { n: 0, max: opts.maxSteps ?? 3_000_000 },
    stdin: (opts.stdin ?? '').split('\n'),
    globals: new Env(),
  };

  try {
    const ast = new Parser(tokenize(source)).parseModule();
    const interp = new Interp(ctx);
    interp.execBlock(ast, ctx.globals);
    return { ok: true, stdout: ctx.out.join('') };
  } catch (e) {
    const stdout = ctx.out.join('');
    if (e instanceof PyError) {
      const timedOut = e.type === 'MiniPyError' && e.message.includes('ran too long');
      const where = e.line ? `line ${e.line}: ` : '';
      return { ok: false, stdout, error: `${where}${e.type}: ${e.message}`, timedOut };
    }
    if (e instanceof ReturnSignal) return { ok: false, stdout, error: "'return' outside function" };
    if (e instanceof BreakSignal) return { ok: false, stdout, error: "'break' outside loop" };
    if (e instanceof ContinueSignal) return { ok: false, stdout, error: "'continue' outside loop" };
    return { ok: false, stdout, error: `InternalError: ${(e as Error).message}` };
  }
}

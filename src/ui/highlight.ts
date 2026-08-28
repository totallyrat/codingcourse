/**
 * A small, dependency-free tokenizer. It is deliberately not a parser: it
 * highlights the shapes a learner needs to read a 20-line snippet, and it must
 * never throw on half-written code, because it runs on every keystroke in the
 * editor.
 */
export type TokenKind = 'kw' | 'str' | 'num' | 'com' | 'fn' | 'punc' | 'op' | 'txt';
export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS: Record<string, string[]> = {
  python: `False None True and as assert async await break class continue def del elif else except
    finally for from global if import in is lambda nonlocal not or pass raise return try while with yield
    self print len range int str float list dict set tuple bool input open enumerate zip map filter sum
    min max abs sorted reversed type isinstance super`.split(/\s+/),
  javascript: `await async break case catch class const continue debugger default delete do else export
    extends finally for function if import in instanceof let new of return static super switch this throw
    try typeof var void while with yield true false null undefined console log document window Math JSON
    Promise Array Object String Number Boolean Map Set`.split(/\s+/),
  typescript: `abstract any as asserts async await boolean break case catch class const continue declare
    default delete do else enum export extends false finally for from function get if implements import in
    infer instanceof interface is keyof let namespace never new null number object of private protected
    public readonly return satisfies set static string super switch symbol this throw true try type typeof
    undefined union unknown var void while yield console`.split(/\s+/),
  cpp: `alignas auto bool break case catch char class const constexpr continue decltype default delete do
    double else enum explicit export extern false float for friend goto if inline int long mutable
    namespace new noexcept nullptr operator private protected public return short signed sizeof static
    struct switch template this throw true try typedef typename union unsigned using virtual void volatile
    while std cout cin endl string vector map size_t include define`.split(/\s+/),
  csharp: `abstract as base bool break byte case catch char checked class const continue decimal default
    delegate do double else enum event explicit extern false finally fixed float for foreach get if
    implicit in int interface internal is lock long namespace new null object operator out override params
    private protected public readonly ref return sbyte sealed set short sizeof static string struct switch
    this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void while yield
    Console WriteLine List Dictionary`.split(/\s+/),
  rust: `as async await break const continue crate dyn else enum extern false fn for if impl in let loop
    match mod move mut pub ref return self Self static struct super trait true type unsafe use where while
    println vec String Vec Option Some None Result Ok Err i32 i64 u32 u64 f64 usize bool str`.split(/\s+/),
  go: `break case chan const continue default defer else fallthrough for func go goto if import interface
    map package range return select struct switch type var true false nil make new len cap append copy
    delete panic recover print println string int int64 float64 bool error fmt Println Printf`.split(/\s+/),
  sql: `SELECT FROM WHERE GROUP BY ORDER HAVING JOIN LEFT RIGHT INNER OUTER FULL ON AS INSERT INTO VALUES
    UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX VIEW DISTINCT LIMIT OFFSET UNION ALL AND OR NOT NULL
    IS IN BETWEEN LIKE EXISTS CASE WHEN THEN ELSE END COUNT SUM AVG MIN MAX PRIMARY KEY FOREIGN REFERENCES
    DEFAULT CHECK UNIQUE ASC DESC WITH`.split(/\s+/),
  gdscript: `func var const extends class_name if elif else for while match break continue return pass
    signal export onready tool yield await static enum true false null self and or not in is as preload
    load print Vector2 Vector3 Node2D Node Sprite2D _ready _process _physics_process`.split(/\s+/),
  blueprint: `Event Begin Play Tick Branch Sequence Cast To Print String Delay Timeline Spawn Actor Get Set
    Add Component Target Return Node True False Exec Then Condition`.split(/\s+/),
  bash: `cd ls mkdir rm cp mv cat echo grep find chmod export source if then fi for do done while git npm
    node python pip sudo apt curl wget touch pwd head tail less man exit`.split(/\s+/),
  html: `html head body div span a p ul ol li h1 h2 h3 h4 img script link meta title style class id href
    src button input form label section header footer nav main article aside table tr td th`.split(/\s+/),
  css: `color background display flex grid margin padding border width height position top left right
    bottom font-size font-family align-items justify-content gap opacity transform transition z-index
    overflow content none auto absolute relative fixed hover focus root`.split(/\s+/),
  text: [],
};

const LINE_COMMENT: Record<string, string> = {
  python: '#',
  gdscript: '#',
  bash: '#',
  sql: '--',
  javascript: '//',
  typescript: '//',
  cpp: '//',
  csharp: '//',
  rust: '//',
  go: '//',
  css: '',
  html: '',
  blueprint: '//',
  text: '',
};

export function normalizeLang(lang: string | undefined): string {
  const l = (lang ?? 'text').toLowerCase();
  if (l in KEYWORDS) return l;
  const aliases: Record<string, string> = {
    py: 'python',
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    'c++': 'cpp',
    cs: 'csharp',
    'c#': 'csharp',
    golang: 'go',
    gd: 'gdscript',
    shell: 'bash',
    sh: 'bash',
    console: 'bash',
    ue5: 'blueprint',
    unreal: 'blueprint',
  };
  return aliases[l] ?? 'text';
}

/** Splits source into tokens. Never throws; unknown text falls through as 'txt'. */
export function tokenize(source: string, langInput: string | undefined): Token[] {
  const lang = normalizeLang(langInput);
  const keywords = new Set(KEYWORDS[lang] ?? []);
  const comment = LINE_COMMENT[lang] ?? '';
  const tokens: Token[] = [];
  let buffer = '';

  const flush = () => {
    if (!buffer) return;
    tokens.push({ kind: 'txt', text: buffer });
    buffer = '';
  };
  const push = (kind: TokenKind, text: string) => {
    flush();
    tokens.push({ kind, text });
  };

  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);

    // Block comments
    if ((lang === 'css' || lang === 'javascript' || lang === 'typescript' || lang === 'cpp' ||
         lang === 'csharp' || lang === 'rust' || lang === 'go') && rest.startsWith('/*')) {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      push('com', source.slice(i, stop));
      i = stop;
      continue;
    }
    if (lang === 'html' && rest.startsWith('<!--')) {
      const end = source.indexOf('-->', i + 4);
      const stop = end === -1 ? source.length : end + 3;
      push('com', source.slice(i, stop));
      i = stop;
      continue;
    }
    // Line comments
    if (comment && rest.startsWith(comment)) {
      const nl = source.indexOf('\n', i);
      const stop = nl === -1 ? source.length : nl;
      push('com', source.slice(i, stop));
      i = stop;
      continue;
    }
    // Triple-quoted / template strings
    if (rest.startsWith('"""') || rest.startsWith("'''")) {
      const q = rest.slice(0, 3);
      const end = source.indexOf(q, i + 3);
      const stop = end === -1 ? source.length : end + 3;
      push('str', source.slice(i, stop));
      i = stop;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === ch) {
          j++;
          break;
        }
        if (source[j] === '\n' && ch !== '`') break;
        j++;
      }
      push('str', source.slice(i, j));
      i = j;
      continue;
    }
    // Numbers
    if (/[0-9]/.test(ch) && !/[\w$]/.test(source[i - 1] ?? '')) {
      const m = /^0[xXbB][0-9a-fA-F_]+|^[0-9][0-9_]*(\.[0-9_]+)?([eE][+-]?[0-9]+)?[fFlLuU]?/.exec(rest);
      if (m) {
        push('num', m[0]);
        i += m[0].length;
        continue;
      }
    }
    // Identifiers / keywords / call sites
    if (/[A-Za-z_$@#]/.test(ch)) {
      const m = /^[A-Za-z_$@#][\w$]*/.exec(rest)!;
      const word = m[0];
      const after = source.slice(i + word.length).match(/^\s*\(/);
      const isKw = keywords.has(word) || (lang === 'sql' && keywords.has(word.toUpperCase()));
      push(isKw ? 'kw' : after ? 'fn' : 'txt', word);
      i += word.length;
      continue;
    }
    if (/[{}()[\];,.]/.test(ch)) {
      push('punc', ch);
      i++;
      continue;
    }
    if (/[+\-*/%=<>!&|^~?:]/.test(ch)) {
      const m = /^[+\-*/%=<>!&|^~?:]+/.exec(rest)!;
      push('op', m[0]);
      i += m[0].length;
      continue;
    }
    buffer += ch;
    i++;
  }
  flush();
  return tokens;
}

/**
 * Running JavaScript when there is no Node to run it on.
 *
 * The desktop build always has a real Node (Electron's own) a few
 * milliseconds away, so "write and run" genuinely runs. A phone browser has
 * no such thing, and the honest fallback — "structure check only" — would
 * turn the two biggest tracks into a spelling test.
 *
 * So: a Worker, built from a blob, with the learner's code pasted into it as
 * source rather than passed to `eval`. That matters twice over. It keeps the
 * page's Content-Security-Policy free of `unsafe-eval`, and it means a syntax
 * error surfaces the way a syntax error should — as an error event with a line
 * number, not as a thrown object from inside a `Function` constructor.
 *
 * The worker is its own realm: no DOM, no page globals, no access to the
 * learner's profile. A runaway loop is not caught, it is terminated, which is
 * the only thing that actually works against `while (true) {}`.
 */

export interface BrowserRunResult {
  ok: boolean;
  stdout: string;
  error?: string;
  timedOut?: boolean;
}

const OUTPUT_CAP = 64 * 1024;

export function browserJsAvailable(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  );
}

/**
 * Node's console prints values, not JSON. `console.log([1, 2])` is
 * `[ 1, 2 ]` there and `1,2` if you naively join. Exercise output is compared
 * character for character against what Node printed when the content was
 * written, so the formatting has to agree with Node's, not with the DOM's.
 */
const PRELUDE = String.raw`
const __out = [];
let __size = 0;
const __CAP = ${OUTPUT_CAP};

function __quote(s) {
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/'/g, "\\'");
  return "'" + escaped + "'";
}

function __inspect(value, depth, seen) {
  const t = typeof value;
  if (t === 'string') return depth === 0 ? value : __quote(value);
  if (t === 'number') return Object.is(value, -0) ? '-0' : String(value);
  if (t === 'bigint') return String(value) + 'n';
  if (t === 'boolean' || value === null || value === undefined) return String(value);
  if (t === 'function') {
    return value.name ? '[Function: ' + value.name + ']' : '[Function (anonymous)]';
  }
  if (t === 'symbol') return value.toString();
  if (value instanceof Error) return (value.stack || (value.name + ': ' + value.message));
  if (seen.has(value)) return '[Circular *1]';
  if (depth > 4) return Array.isArray(value) ? '[Array]' : '[Object]';
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (!value.length) return '[]';
      const parts = value.map((v) => __inspect(v, depth + 1, seen));
      return '[ ' + parts.join(', ') + ' ]';
    }
    if (value instanceof Map) {
      if (!value.size) return 'Map(0) {}';
      const parts = [];
      value.forEach((v, k) => parts.push(__inspect(k, depth + 1, seen) + ' => ' + __inspect(v, depth + 1, seen)));
      return 'Map(' + value.size + ') { ' + parts.join(', ') + ' }';
    }
    if (value instanceof Set) {
      if (!value.size) return 'Set(0) {}';
      const parts = [];
      value.forEach((v) => parts.push(__inspect(v, depth + 1, seen)));
      return 'Set(' + value.size + ') { ' + parts.join(', ') + ' }';
    }
    if (value instanceof Date) return value.toISOString();
    const keys = Object.keys(value);
    const name = value.constructor && value.constructor.name !== 'Object' ? value.constructor.name + ' ' : '';
    if (!keys.length) return name + '{}';
    const parts = keys.map((k) => {
      const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : __quote(k);
      return key + ': ' + __inspect(value[k], depth + 1, seen);
    });
    return name + '{ ' + parts.join(', ') + ' }';
  } finally {
    seen.delete(value);
  }
}

function __write(text) {
  if (__size >= __CAP) return;
  __size += text.length;
  __out.push(__size > __CAP ? text.slice(0, text.length - (__size - __CAP)) + '\n… output truncated' : text);
}

function __log(...args) {
  __write(args.map((a) => __inspect(a, 0, new Set())).join(' ') + '\n');
}

const console = { log: __log, info: __log, warn: __log, error: __log, debug: __log, trace: __log };

let __stdinLines = [];
function readline() {
  return __stdinLines.length ? __stdinLines.shift() : '';
}
const prompt = readline;
const process = {
  argv: ['node', 'main.js'],
  env: {},
  exit() {},
  stdout: { write: (s) => __write(String(s)) },
  stderr: { write: (s) => __write(String(s)) },
};
function require() {
  throw new Error('require() is not available here — this editor runs a single file.');
}

function __finish(error) {
  self.postMessage({ done: true, stdout: __out.join(''), error: error });
}
`;

const EPILOGUE = String.raw`
(async () => {
  try {
    const returned = __main();
    if (returned && typeof returned.then === 'function') await returned;
    // One turn of the event loop, so a solution written with promises or a
    // zero-delay timer still gets its output flushed before we report.
    await new Promise((r) => setTimeout(r, 0));
    __finish(undefined);
  } catch (err) {
    __finish(err && err.stack ? String(err.stack).split('\n').slice(0, 3).join('\n') : String(err));
  }
})();
`;

function workerSource(userCode: string, stdin: string): string {
  return [
    PRELUDE,
    `__stdinLines = ${JSON.stringify(stdin ? stdin.replace(/\n$/, '').split('\n') : [])};`,
    'function __main() {',
    userCode,
    '}',
    EPILOGUE,
  ].join('\n');
}

export function runJavaScriptInBrowser(
  source: string,
  opts: { stdin?: string; timeoutMs?: number } = {},
): Promise<BrowserRunResult> {
  if (!browserJsAvailable()) {
    return Promise.resolve({ ok: false, stdout: '', error: 'No JavaScript sandbox is available here.' });
  }

  const timeoutMs = opts.timeoutMs ?? 5000;
  return new Promise<BrowserRunResult>((resolve) => {
    let url = '';
    let worker: Worker | null = null;
    let settled = false;
    let timer = 0;

    const done = (result: BrowserRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        worker?.terminate();
      } catch {
        /* already gone */
      }
      if (url) URL.revokeObjectURL(url);
      resolve(result);
    };

    try {
      const blob = new Blob([workerSource(source, opts.stdin ?? '')], { type: 'text/javascript' });
      url = URL.createObjectURL(blob);
      worker = new Worker(url);
    } catch (err) {
      done({ ok: false, stdout: '', error: `Could not start the sandbox: ${String(err)}` });
      return;
    }

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as { stdout?: string; error?: string };
      done({ ok: !data?.error, stdout: data?.stdout ?? '', error: data?.error });
    };

    // Fires for a syntax error in the pasted source, which never reaches the
    // try/catch inside the worker because the script never parses.
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault?.();
      done({ ok: false, stdout: '', error: cleanSyntaxError(event.message) });
    };

    timer = setTimeout(
      () => done({ ok: false, stdout: '', error: 'Timed out — is there a loop that never ends?', timedOut: true }),
      timeoutMs,
    ) as unknown as number;
  });
}

/** Worker error messages arrive prefixed with "Uncaught " on some engines. */
function cleanSyntaxError(message: string): string {
  return (message || 'Your code could not be parsed.').replace(/^Uncaught\s+/, '');
}

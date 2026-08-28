import { bridge } from '@/lib/bridge';
import type { RunLanguage, TestCase, WriteExercise } from '@/engine/types';
import { runPython } from './minipy';
import { stripTypes } from './stripTypes';

/* ============================================================================
   One entry point for "run this code and tell me if it is right".

   Execution order, best first:
     1. A real compiler or interpreter on this machine (python3, g++, rustc,
        go, dotnet-script, node). Detected once at startup.
     2. For JavaScript and TypeScript inside the desktop app, Electron's own
        Node - always present, so those two always really run.
     3. For Python with nothing installed, the bundled MiniPy interpreter.
     4. Otherwise: structural checks only, and the UI says so plainly rather
        than pretending the program ran.
   ========================================================================== */

export interface CheckResult {
  name: string;
  pass: boolean;
  expected: string;
  actual: string;
  hidden: boolean;
}

export interface StructuralResult {
  label: string;
  pass: boolean;
  /** false = "must not contain" rule. */
  required: boolean;
}

export type Engine = 'native' | 'minipy' | 'static';

export interface RunOutcome {
  /** The program executed without crashing. */
  ran: boolean;
  /** Every test and structural rule passed. */
  passed: boolean;
  stdout: string;
  error?: string;
  engine: Engine;
  engineLabel: string;
  tests: CheckResult[];
  structural: StructuralResult[];
  durationMs: number;
  timedOut?: boolean;
}

let toolchainCache: Partial<Record<RunLanguage, string | null>> | null = null;
let toolchainPromise: Promise<Partial<Record<RunLanguage, string | null>>> | null = null;

export async function toolchains(): Promise<Partial<Record<RunLanguage, string | null>>> {
  if (toolchainCache) return toolchainCache;
  if (!toolchainPromise) {
    toolchainPromise = bridge.runner
      .detect()
      .then((t) => {
        toolchainCache = t;
        return t;
      })
      .catch(() => ({}));
  }
  return toolchainPromise;
}

/** Which engine would be used for a language right now, for UI badges. */
export async function engineFor(lang: RunLanguage): Promise<{ engine: Engine; label: string }> {
  const tc = await toolchains();
  const native = tc[lang];
  if (native) return { engine: 'native', label: `${native} on this machine` };
  if (lang === 'python') return { engine: 'minipy', label: 'built-in Python interpreter' };
  return { engine: 'static', label: 'structure check only' };
}

const normalize = (s: string): string =>
  s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');

function compare(test: TestCase, actual: string): boolean {
  if (test.expectContains?.length) {
    let cursor = 0;
    for (const fragment of test.expectContains) {
      const idx = actual.indexOf(fragment, cursor);
      if (idx < 0) return false;
      cursor = idx + fragment.length;
    }
    return true;
  }
  return normalize(actual) === normalize(test.expect);
}

/** Exported so the content tests can grade exactly the way the app does. */
export function checkStructure(exercise: WriteExercise, source: string): StructuralResult[] {
  const results: StructuralResult[] = [];
  // Comments are stripped first so "you must use a loop" is not satisfied by
  // the word `for` appearing in a comment.
  const code = source
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)#.*$/gm, '$1');

  for (const rule of exercise.mustContain ?? []) {
    const pass = rule.regex ? new RegExp(rule.pattern, 'm').test(code) : code.includes(rule.pattern);
    results.push({ label: rule.label, pass, required: true });
  }
  for (const rule of exercise.mustNotContain ?? []) {
    const hit = rule.regex ? new RegExp(rule.pattern, 'm').test(code) : code.includes(rule.pattern);
    results.push({ label: rule.label, pass: !hit, required: false });
  }
  return results;
}

interface RawRun {
  ok: boolean;
  stdout: string;
  error?: string;
  engine: Engine;
  engineLabel: string;
  timedOut?: boolean;
}

/** Runs one program once, choosing the best engine available. */
export async function runOnce(
  lang: RunLanguage,
  source: string,
  stdin?: string,
): Promise<RawRun> {
  const tc = await toolchains();

  let payload = source;
  let langForNative: RunLanguage = lang;
  if (lang === 'typescript' && !tc.typescript) {
    // No tsx: erase the types and run it as JavaScript on Node.
    const stripped = stripTypes(source);
    if (stripped.unsupported) {
      return {
        ok: false,
        stdout: '',
        error: `This editor cannot run TypeScript ${stripped.unsupported}s without a TypeScript toolchain installed.`,
        engine: 'static',
        engineLabel: 'structure check only',
      };
    }
    payload = stripped.code;
    langForNative = 'javascript';
  }

  if (tc[langForNative]) {
    const res = await bridge.runner.run({ language: langForNative, source: payload, stdin, timeoutMs: 8000 });
    if (!('unavailable' in res)) {
      return {
        ok: res.ok,
        stdout: res.stdout,
        error: res.ok ? undefined : res.timedOut ? 'Timed out after 8 seconds.' : res.stderr.trim() || `Exited with code ${res.exitCode}`,
        engine: 'native',
        engineLabel: `${res.toolchain} on this machine`,
        timedOut: res.timedOut,
      };
    }
  }

  if (lang === 'python') {
    const res = runPython(source, { stdin });
    return {
      ok: res.ok,
      stdout: res.stdout,
      error: res.error,
      engine: 'minipy',
      engineLabel: 'built-in Python interpreter',
      timedOut: res.timedOut,
    };
  }

  return {
    ok: false,
    stdout: '',
    error: `No ${LANGUAGE_LABEL[lang]} toolchain was found on this machine, so this exercise is checked by structure only.`,
    engine: 'static',
    engineLabel: 'structure check only',
  };
}

export async function runWriteExercise(exercise: WriteExercise, source: string): Promise<RunOutcome> {
  const started = performance.now();
  const structural = checkStructure(exercise, source);
  const structuralOk = structural.every((s) => s.pass);

  // Structural rules are checked first and short-circuit: telling somebody
  // "your output is right but you were asked to use a loop" is more useful
  // than a wall of passing tests they solved the wrong way.
  if (!structuralOk) {
    return {
      ran: false,
      passed: false,
      stdout: '',
      engine: 'static',
      engineLabel: 'structure check',
      tests: [],
      structural,
      durationMs: performance.now() - started,
      error: structural.find((s) => !s.pass)!.required
        ? `Not quite: ${structural.find((s) => !s.pass)!.label}`
        : `Not allowed here: ${structural.find((s) => !s.pass)!.label}`,
    };
  }

  const tests: CheckResult[] = [];
  let engine: Engine = 'static';
  let engineLabel = '';
  let firstError: string | undefined;
  let stdout = '';
  let timedOut = false;

  for (const test of exercise.tests) {
    const res = await runOnce(exercise.runLang, source, test.stdin);
    engine = res.engine;
    engineLabel = res.engineLabel;
    if (res.timedOut) timedOut = true;
    if (!stdout) stdout = res.stdout;
    if (!res.ok) {
      firstError ??= res.error;
      tests.push({
        name: test.name,
        pass: false,
        expected: test.expect,
        actual: res.stdout,
        hidden: !!test.hidden,
      });
      // A crash fails everything; running the rest just repeats the error.
      break;
    }
    tests.push({
      name: test.name,
      pass: compare(test, res.stdout),
      expected: test.expect,
      actual: res.stdout,
      hidden: !!test.hidden,
    });
  }

  // With no runtime at all, fall back to honestly reporting structure only.
  if (engine === 'static') {
    return {
      ran: false,
      passed: structuralOk && (exercise.mustContain?.length ?? 0) > 0,
      stdout: '',
      error: firstError,
      engine,
      engineLabel: 'structure check only',
      tests: [],
      structural,
      durationMs: performance.now() - started,
    };
  }

  return {
    ran: !firstError,
    passed: !firstError && tests.every((t) => t.pass),
    stdout,
    error: firstError,
    engine,
    engineLabel,
    tests,
    structural,
    durationMs: performance.now() - started,
    timedOut,
  };
}

export const LANGUAGE_LABEL: Record<RunLanguage, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  cpp: 'C++',
  csharp: 'C#',
  rust: 'Rust',
  go: 'Go',
};

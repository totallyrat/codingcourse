import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type RunLanguage = 'python' | 'javascript' | 'typescript' | 'cpp' | 'csharp' | 'rust' | 'go';

export interface RunRequest {
  language: RunLanguage;
  source: string;
  stdin?: string;
  timeoutMs?: number;
}

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  /** 'native' = a real compiler/interpreter on this machine ran the code. */
  engine: 'native';
  toolchain: string;
  timedOut: boolean;
  truncated: boolean;
}

const MAX_OUTPUT = 64 * 1024;
const DEFAULT_TIMEOUT = 8000;

interface Toolchain {
  id: string;
  /** Probe command that must exit 0 for the toolchain to count as present. */
  probe: [string, string[]];
  file: string;
  /** Commands to run in order; the last one's output is what the user sees. */
  steps: (dir: string, file: string, bin: string) => Array<[string, string[]]>;
}

const CANDIDATES: Record<RunLanguage, Toolchain[]> = {
  python: [
    {
      id: 'python3',
      probe: ['python3', ['--version']],
      file: 'main.py',
      steps: (dir, file) => [['python3', [join(dir, file)]]],
    },
    {
      id: 'python',
      probe: ['python', ['--version']],
      file: 'main.py',
      steps: (dir, file) => [['python', [join(dir, file)]]],
    },
    {
      id: 'py',
      probe: ['py', ['--version']],
      file: 'main.py',
      steps: (dir, file) => [['py', ['-3', join(dir, file)]]],
    },
  ],
  javascript: [
    {
      id: 'node',
      probe: ['node', ['--version']],
      file: 'main.mjs',
      steps: (dir, file) => [['node', [join(dir, file)]]],
    },
    {
      // Electron *is* Node. This one is always present in the packaged app,
      // so JavaScript exercises run for real even on a machine with no
      // developer tooling installed at all.
      id: 'electron-node',
      probe: [process.execPath, ['-e', 'process.exit(0)']],
      file: 'main.mjs',
      steps: (dir, file) => [[process.execPath, [join(dir, file)]]],
    },
  ],
  typescript: [
    {
      id: 'tsx',
      probe: ['npx', ['--no-install', 'tsx', '--version']],
      file: 'main.ts',
      steps: (dir, file) => [['npx', ['--no-install', 'tsx', join(dir, file)]]],
    },
    {
      // Falls back to running the type-stripped source (the renderer strips
      // annotations before sending) on Electron's own Node.
      id: 'electron-node',
      probe: [process.execPath, ['-e', 'process.exit(0)']],
      file: 'main.mjs',
      steps: (dir, file) => [[process.execPath, [join(dir, file)]]],
    },
  ],
  cpp: [
    {
      id: 'g++',
      probe: ['g++', ['--version']],
      file: 'main.cpp',
      steps: (dir, file, bin) => [
        ['g++', ['-std=c++17', '-O0', '-o', join(dir, bin), join(dir, file)]],
        [join(dir, bin), []],
      ],
    },
    {
      id: 'clang++',
      probe: ['clang++', ['--version']],
      file: 'main.cpp',
      steps: (dir, file, bin) => [
        ['clang++', ['-std=c++17', '-O0', '-o', join(dir, bin), join(dir, file)]],
        [join(dir, bin), []],
      ],
    },
  ],
  csharp: [
    {
      id: 'dotnet-script',
      probe: ['dotnet', ['script', '--version']],
      file: 'main.csx',
      steps: (dir, file) => [['dotnet', ['script', join(dir, file)]]],
    },
  ],
  rust: [
    {
      id: 'rustc',
      probe: ['rustc', ['--version']],
      file: 'main.rs',
      steps: (dir, file, bin) => [
        ['rustc', ['-O', '-o', join(dir, bin), join(dir, file)]],
        [join(dir, bin), []],
      ],
    },
  ],
  go: [
    {
      id: 'go',
      probe: ['go', ['version']],
      file: 'main.go',
      steps: (dir, file) => [['go', ['run', join(dir, file)]]],
    },
  ],
};

const probeCache = new Map<string, boolean>();

function exec(
  cmd: string,
  args: string[],
  opts: { cwd?: string; stdin?: string; timeoutMs: number },
): Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean; truncated: boolean }> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, {
        cwd: opts.cwd,
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONDONTWRITEBYTECODE: '1',
          // Without this, re-launching our own binary would open a window.
          ...(cmd === process.execPath ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        },
      });
    } catch (err) {
      resolve({ stdout: '', stderr: String(err), code: null, timedOut: false, truncated: false });
      return;
    }

    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const cap = (current: string, chunk: string): string => {
      if (current.length >= MAX_OUTPUT) {
        truncated = true;
        return current;
      }
      const next = current + chunk;
      if (next.length > MAX_OUTPUT) {
        truncated = true;
        return next.slice(0, MAX_OUTPUT);
      }
      return next;
    };

    child.stdout?.on('data', (d) => {
      stdout = cap(stdout, d.toString());
    });
    child.stderr?.on('data', (d) => {
      stderr = cap(stderr, d.toString());
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut, truncated });
    };

    child.on('error', (err) => {
      stderr += String(err.message);
      finish(null);
    });
    child.on('close', finish);

    if (opts.stdin !== undefined) child.stdin?.write(opts.stdin);
    child.stdin?.end();
  });
}

async function isAvailable(tc: Toolchain): Promise<boolean> {
  const key = tc.id;
  const cached = probeCache.get(key);
  if (cached !== undefined) return cached;
  const res = await exec(tc.probe[0], tc.probe[1], { timeoutMs: 5000 });
  const ok = res.code === 0 && !res.timedOut;
  probeCache.set(key, ok);
  return ok;
}

/** Which languages this machine can genuinely compile/run right now. */
export async function detectToolchains(): Promise<Record<RunLanguage, string | null>> {
  const out = {} as Record<RunLanguage, string | null>;
  await Promise.all(
    (Object.keys(CANDIDATES) as RunLanguage[]).map(async (lang) => {
      out[lang] = null;
      for (const tc of CANDIDATES[lang]) {
        if (await isAvailable(tc)) {
          out[lang] = tc.id;
          return;
        }
      }
    }),
  );
  return out;
}

/**
 * Runs the learner's own source on their own machine, in a throwaway temp
 * directory, with a hard timeout and an output cap. Only ever called from an
 * explicit "Run" action in the lesson player — nothing in the content library
 * executes on its own.
 */
export async function runCode(req: RunRequest): Promise<RunResult | { ok: false; unavailable: true }> {
  const started = Date.now();
  const timeoutMs = Math.min(req.timeoutMs ?? DEFAULT_TIMEOUT, 15000);

  let chosen: Toolchain | null = null;
  for (const tc of CANDIDATES[req.language] ?? []) {
    if (await isAvailable(tc)) {
      chosen = tc;
      break;
    }
  }
  if (!chosen) return { ok: false, unavailable: true };

  const dir = mkdtempSync(join(tmpdir(), 'codeling-'));
  const bin = process.platform === 'win32' ? 'program.exe' : 'program';

  try {
    writeFileSync(join(dir, chosen.file), req.source, 'utf8');
    const steps = chosen.steps(dir, chosen.file, bin);
    let last = { stdout: '', stderr: '', code: 0 as number | null, timedOut: false, truncated: false };

    for (let i = 0; i < steps.length; i++) {
      const [cmd, args] = steps[i];
      const isFinal = i === steps.length - 1;
      last = await exec(cmd, args, {
        cwd: dir,
        stdin: isFinal ? (req.stdin ?? '') : undefined,
        timeoutMs,
      });
      // A failed compile step is the result the learner needs to see.
      if (last.code !== 0 || last.timedOut) break;
    }

    return {
      ok: last.code === 0 && !last.timedOut,
      stdout: last.stdout,
      stderr: last.stderr,
      exitCode: last.code,
      durationMs: Date.now() - started,
      engine: 'native',
      toolchain: chosen.id,
      timedOut: last.timedOut,
      truncated: last.truncated,
    };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* the OS will reap the temp dir */
    }
  }
}

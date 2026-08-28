import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allExercises } from '.';
import { runPython } from '@/runtime/minipy';
import { stripTypes } from '@/runtime/stripTypes';
import { checkStructure } from '@/runtime/index';
import type { RunLanguage, TestCase, WriteExercise } from '@/engine/types';

/**
 * Every write-and-run exercise ships a reference solution. This compiles and
 * runs each one against its own test cases, so a broken exercise cannot reach
 * a learner — the worst possible bug in a teaching app is one where the
 * correct answer is marked wrong.
 *
 * Languages with no toolchain on this machine are skipped rather than failing.
 */

function have(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const TOOLS: Partial<Record<RunLanguage, boolean>> = {
  python: have('python3', ['--version']),
  javascript: have('node', ['--version']),
  typescript: have('node', ['--version']),
  cpp: have('g++', ['--version']),
  rust: have('rustc', ['--version']),
  go: have('go', ['version']),
  csharp: have('dotnet', ['script', '--version']),
};

const normalize = (s: string) =>
  s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');

function runNative(lang: RunLanguage, source: string, stdin: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'codeling-test-'));
  try {
    const write = (name: string) => {
      const file = join(dir, name);
      writeFileSync(file, source, 'utf8');
      return file;
    };
    const run = (cmd: string, args: string[]) =>
      execFileSync(cmd, args, { input: stdin, encoding: 'utf8', cwd: dir, timeout: 30000 });

    switch (lang) {
      case 'python':
        return run('python3', [write('main.py')]);
      case 'javascript':
        return run('node', [write('main.mjs')]);
      case 'typescript': {
        const stripped = stripTypes(source);
        expect(stripped.unsupported, 'stripTypes could not handle this solution').toBeUndefined();
        writeFileSync(join(dir, 'main.mjs'), stripped.code, 'utf8');
        return run('node', [join(dir, 'main.mjs')]);
      }
      case 'cpp':
        write('main.cpp');
        execFileSync('g++', ['-std=c++17', '-o', join(dir, 'prog'), join(dir, 'main.cpp')], { timeout: 60000 });
        return run(join(dir, 'prog'), []);
      case 'rust':
        write('main.rs');
        execFileSync('rustc', ['-o', join(dir, 'prog'), join(dir, 'main.rs')], { timeout: 60000, cwd: dir });
        return run(join(dir, 'prog'), []);
      case 'go':
        return run('go', ['run', write('main.go')]);
      default:
        throw new Error(`no runner for ${lang}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function matches(test: TestCase, actual: string): boolean {
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

const writeExercises = allExercises().filter((e): e is WriteExercise => e.kind === 'write');

describe('every reference solution passes its own tests', () => {
  it('there are write exercises to check', () => {
    expect(writeExercises.length).toBeGreaterThan(15);
  });

  for (const ex of writeExercises) {
    const available = TOOLS[ex.runLang];
    it.skipIf(!available)(`${ex.id} (${ex.runLang})`, () => {
      for (const test of ex.tests) {
        const output = runNative(ex.runLang, ex.solution, test.stdin ?? '');
        expect(matches(test, output), `${ex.id} / ${test.name}\nexpected:\n${test.expect}\ngot:\n${output}`).toBe(
          true,
        );
      }
    });
  }
});

describe('the bundled Python interpreter agrees with the reference solutions', () => {
  for (const ex of writeExercises.filter((e) => e.runLang === 'python')) {
    it(ex.id, () => {
      for (const test of ex.tests) {
        const result = runPython(ex.solution, { stdin: test.stdin });
        expect(result.error ?? '', `${ex.id} / ${test.name}`).toBe('');
        expect(matches(test, result.stdout), `${ex.id} / ${test.name}\ngot:\n${result.stdout}`).toBe(true);
      }
    });
  }
});

describe('starter code never already solves the exercise', () => {
  for (const ex of writeExercises) {
    it(ex.id, () => {
      // A starter that happens to pass would let somebody click through
      // without writing anything, and teach them nothing.
      if (!TOOLS[ex.runLang]) return;
      // Grade the starter exactly as the app would: structural rules first,
      // then the tests. A starter that fails either one is fine.
      let allPass = checkStructure(ex, ex.starter).every((r) => r.pass);
      if (!allPass) return;
      for (const test of ex.tests) {
        let output = '';
        try {
          output = runNative(ex.runLang, ex.starter, test.stdin ?? '');
        } catch {
          allPass = false;
          break;
        }
        if (!matches(test, output)) {
          allPass = false;
          break;
        }
      }
      expect(allPass, `${ex.id} starter already passes`).toBe(false);
    });
  }
});

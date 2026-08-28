import { describe, expect, it } from 'vitest';
import { runPython } from './minipy';

const out = (src: string, stdin?: string) => {
  const r = runPython(src, { stdin });
  if (!r.ok) throw new Error(r.error);
  return r.stdout;
};

describe('minipy: values and arithmetic', () => {
  it('keeps ints and floats distinct the way Python does', () => {
    expect(out('print(4 / 2)')).toBe('2.0\n');
    expect(out('print(4 // 2)')).toBe('2\n');
    expect(out('print(7 // 2)')).toBe('3\n');
    expect(out('print(2 ** 10)')).toBe('1024\n');
    expect(out('print(1 + 2 * 3)')).toBe('7\n');
    expect(out('print(0.1 + 0.2 == 0.3)')).toBe('False\n');
  });

  it('follows Python modulo sign rules', () => {
    expect(out('print(-7 % 3)')).toBe('2\n');
    expect(out('print(7 % -3)')).toBe('-2\n');
  });

  it('raises on division by zero with a real message', () => {
    const r = runPython('print(1 / 0)');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('ZeroDivisionError');
  });
});

describe('minipy: strings', () => {
  it('handles methods, slicing and f-strings', () => {
    expect(out('print("hello".upper())')).toBe('HELLO\n');
    expect(out('print("hello"[1:4])')).toBe('ell\n');
    expect(out('print("hello"[::-1])')).toBe('olleh\n');
    expect(out('print("-".join(["a", "b", "c"]))')).toBe('a-b-c\n');
    expect(out('name = "Ada"\nprint(f"hi {name}, {2 + 3}")')).toBe('hi Ada, 5\n');
    expect(out('print(f"{3.14159:.2f}")')).toBe('3.14\n');
    expect(out('print("a,b,c".split(","))')).toBe("['a', 'b', 'c']\n");
  });

  it('reports the classic str + int TypeError', () => {
    const r = runPython('print("age: " + 30)');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('TypeError');
    expect(r.error).toContain('concatenate');
  });
});

describe('minipy: control flow', () => {
  it('runs loops, conditionals and break/continue', () => {
    expect(out('for i in range(3):\n    print(i)')).toBe('0\n1\n2\n');
    expect(out('n = 0\nwhile n < 3:\n    n += 1\nprint(n)')).toBe('3\n');
    expect(
      out('for i in range(5):\n    if i == 2:\n        continue\n    if i == 4:\n        break\n    print(i)'),
    ).toBe('0\n1\n3\n');
  });

  it('handles elif chains', () => {
    const src = [
      'def grade(s):',
      '    if s >= 90:',
      '        return "A"',
      '    elif s >= 80:',
      '        return "B"',
      '    else:',
      '        return "C"',
      'print(grade(95), grade(85), grade(10))',
    ].join('\n');
    expect(out(src)).toBe('A B C\n');
  });

  it('stops runaway loops instead of hanging', () => {
    const r = runPython('while True:\n    pass', { maxSteps: 5000 });
    expect(r.ok).toBe(false);
    expect(r.timedOut).toBe(true);
  });
});

describe('minipy: containers', () => {
  it('supports lists, dicts, sets and comprehensions', () => {
    expect(out('xs = [3, 1, 2]\nxs.sort()\nprint(xs)')).toBe('[1, 2, 3]\n');
    expect(out('print([x * x for x in range(5) if x % 2 == 0])')).toBe('[0, 4, 16]\n');
    expect(out('d = {"a": 1}\nd["b"] = 2\nprint(d)')).toBe("{'a': 1, 'b': 2}\n");
    expect(out('print(sorted({"b": 2, "a": 1}.keys()))')).toBe("['a', 'b']\n");
    expect(out('print(len(set([1, 1, 2, 3])))')).toBe('3\n');
    expect(out('print({k: v * 2 for k, v in {"a": 1}.items()})')).toBe("{'a': 2}\n");
  });

  it('unpacks tuples and iterates with enumerate/zip', () => {
    expect(out('a, b = 1, 2\nprint(a, b)')).toBe('1 2\n');
    expect(out('for i, c in enumerate(["x", "y"]):\n    print(i, c)')).toBe('0 x\n1 y\n');
    expect(out('for a, b in zip([1, 2], ["a", "b"]):\n    print(a, b)')).toBe('1 a\n2 b\n');
  });

  it('raises IndexError and KeyError with Python wording', () => {
    expect(runPython('print([1, 2][5])').error).toContain('IndexError');
    expect(runPython('print({"a": 1}["b"])').error).toContain('KeyError');
  });
});

describe('minipy: functions and classes', () => {
  it('supports defaults, recursion and closures', () => {
    expect(out('def greet(name, greeting="Hi"):\n    return greeting + ", " + name\nprint(greet("Ada"))')).toBe(
      'Hi, Ada\n',
    );
    const fib = [
      'def fib(n):',
      '    if n < 2:',
      '        return n',
      '    return fib(n - 1) + fib(n - 2)',
      'print(fib(10))',
    ].join('\n');
    expect(out(fib)).toBe('55\n');
  });

  it('supports classes with __init__ and methods', () => {
    const src = [
      'class Counter:',
      '    def __init__(self, start=0):',
      '        self.value = start',
      '    def bump(self, by=1):',
      '        self.value += by',
      '        return self.value',
      'c = Counter(10)',
      'c.bump()',
      'print(c.bump(5))',
    ].join('\n');
    expect(out(src)).toBe('16\n');
  });

  it('reports NameError for undefined names', () => {
    const r = runPython('print(nope)');
    expect(r.ok).toBe(false);
    expect(r.error).toContain("name 'nope' is not defined");
  });
});

describe('minipy: input and errors', () => {
  it('reads stdin lines through input()', () => {
    expect(out('name = input()\nprint("hello " + name)', 'Ada')).toBe('hello Ada\n');
  });

  it('keeps output produced before the error', () => {
    const r = runPython('print("before")\nprint(1 / 0)');
    expect(r.ok).toBe(false);
    expect(r.stdout).toBe('before\n');
  });

  it('handles try/except', () => {
    const src = ['try:', '    x = 1 / 0', 'except ZeroDivisionError:', '    print("caught")'].join('\n');
    expect(out(src)).toBe('caught\n');
  });

  it('refuses imports with a clear explanation', () => {
    const r = runPython('import os');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('imports are not available');
  });
});

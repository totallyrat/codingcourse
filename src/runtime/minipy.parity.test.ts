import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { runPython } from './minipy';

/**
 * Differential test: every snippet is run through both the real CPython on
 * this machine and MiniPy, and the two outputs must match exactly. This is the
 * only way to be confident the fallback interpreter teaches the same Python
 * the learner will meet outside the app.
 *
 * Skipped automatically when CPython is not installed, so it never blocks a
 * contributor who does not have it.
 */
function findPython(): string | null {
  for (const cmd of ['python3', 'python']) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'ignore' });
      return cmd;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

const python = findPython();

const SNIPPETS: Array<[string, string]> = [
  ['arithmetic', 'print(1 + 2 * 3 - 4 / 2)\nprint(7 // 2, 7 % 2, 2 ** 8)\nprint(-7 // 2, -7 % 2)'],
  ['float formatting', 'print(4 / 2)\nprint(10 / 4)\nprint(1e3)\nprint(round(2.5), round(3.5), round(2.675, 2))'],
  ['strings', 'S = "Hello, World"\nprint(S.upper())\nprint(S.lower().split(", "))\nprint(S[7:], S[:5], S[::-1])\nprint(len(S), S.count("l"), S.replace("l", "L"))'],
  ['fstrings', 'n = 7\npi = 3.14159\nprint(f"{n} squared is {n ** 2}")\nprint(f"pi is about {pi:.3f}")\nprint(f"{n:>5}|{n:<5}|")'],
  ['lists', 'xs = [5, 3, 9, 1]\nxs.append(7)\nxs.sort()\nprint(xs)\nprint(xs[0], xs[-1], xs[1:3])\nprint(sum(xs), min(xs), max(xs), len(xs))\nxs.reverse()\nprint(xs)'],
  ['comprehensions', 'print([x * x for x in range(6)])\nprint([x for x in range(20) if x % 3 == 0])\nprint([w.upper() for w in "a b c".split()])'],
  ['dicts', 'd = {"a": 1, "b": 2}\nd["c"] = 3\nprint(d)\nprint(sorted(d.keys()), sorted(d.values()))\nprint(d.get("z", 0))\nfor k in sorted(d):\n    print(k, d[k])'],
  ['loops', 'total = 0\nfor i in range(1, 11):\n    total += i\nprint(total)\nn = 10\nwhile n > 0:\n    n -= 3\nprint(n)'],
  ['nested loops', 'for i in range(1, 4):\n    row = ""\n    for j in range(1, 4):\n        row += str(i * j) + " "\n    print(row.strip())'],
  ['conditionals', 'for n in [-5, 0, 7]:\n    if n < 0:\n        print(n, "negative")\n    elif n == 0:\n        print(n, "zero")\n    else:\n        print(n, "positive")'],
  ['functions', 'def area(w, h=2):\n    return w * h\nprint(area(3), area(3, 4))\ndef fact(n):\n    return 1 if n <= 1 else n * fact(n - 1)\nprint(fact(10))'],
  ['classes', 'class Dog:\n    def __init__(self, name):\n        self.name = name\n        self.tricks = []\n    def learn(self, trick):\n        self.tricks.append(trick)\n        return len(self.tricks)\nd = Dog("Rex")\nd.learn("sit")\nprint(d.name, d.learn("roll"), d.tricks)'],
  ['tuples and unpacking', 'point = (3, 4)\nx, y = point\nprint(x, y, point)\npairs = [(1, "a"), (2, "b")]\nfor num, letter in pairs:\n    print(num, letter)'],
  ['sets', 'a = set([1, 2, 3, 3])\nprint(len(a))\nprint(sorted(a))\nprint(2 in a, 9 in a)'],
  ['enumerate zip', 'names = ["ada", "alan"]\nfor i, n in enumerate(names, 1):\n    print(i, n.capitalize())\nfor n, s in zip(names, [1, 2]):\n    print(n, s)'],
  ['string building', 'words = ["never", "gonna", "give"]\nprint(" ".join(words))\nprint("-".join(w[0] for w in words) if False else "-".join([w[0] for w in words]))'],
  ['boolean logic', 'print(True and False, True or False, not True)\nprint(bool(0), bool(""), bool([]), bool([0]))\nprint(1 == 1.0, [] == [], "a" < "b")'],
  ['sorting with key', 'words = ["pear", "fig", "banana"]\nprint(sorted(words, key=len))\nprint(sorted(words, reverse=True))'],
  ['fizzbuzz', 'for i in range(1, 16):\n    if i % 15 == 0:\n        print("FizzBuzz")\n    elif i % 3 == 0:\n        print("Fizz")\n    elif i % 5 == 0:\n        print("Buzz")\n    else:\n        print(i)'],
  ['try except', 'def safe_div(a, b):\n    try:\n        return a / b\n    except ZeroDivisionError:\n        return None\nprint(safe_div(6, 3), safe_div(1, 0))'],
];

describe.skipIf(!python)('minipy matches CPython', () => {
  for (const [name, src] of SNIPPETS) {
    it(name, () => {
      const real = execFileSync(python!, ['-c', src], { encoding: 'utf8' });
      const mine = runPython(src);
      expect(mine.error ?? '').toBe('');
      expect(mine.stdout).toBe(real);
    });
  }
});

describe.skipIf(!python)('minipy reports the same error kinds as CPython', () => {
  const ERRORS: Array<[string, string]> = [
    ['NameError', 'print(missing)'],
    ['TypeError', 'print("n: " + 5)'],
    ['ZeroDivisionError', 'print(1 // 0)'],
    ['IndexError', 'print([1, 2, 3][9])'],
    ['KeyError', 'print({"a": 1}["z"])'],
    ['ValueError', 'print(int("abc"))'],
  ];
  for (const [kind, src] of ERRORS) {
    it(kind, () => {
      let realFailed = false;
      try {
        execFileSync(python!, ['-c', src], { encoding: 'utf8', stdio: 'pipe' });
      } catch (e) {
        realFailed = true;
        expect(String((e as { stderr?: string }).stderr)).toContain(kind);
      }
      expect(realFailed).toBe(true);
      const mine = runPython(src);
      expect(mine.ok).toBe(false);
      expect(mine.error).toContain(kind);
    });
  }
});

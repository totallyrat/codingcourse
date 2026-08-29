import { describe, expect, it } from 'vitest';
import { stripTypes } from './stripTypes';

const strip = (src: string) => stripTypes(src).code;

/**
 * The stripper only runs when no TypeScript toolchain is installed, so its one
 * job is to never produce broken JavaScript. Most of these cases are things
 * that a naive "delete from colon to comma" implementation gets wrong.
 */
describe('stripTypes removes annotations', () => {
  it('strips parameter and return types', () => {
    expect(strip('function f(a: number, b: string): boolean {\n  return true;\n}')).toBe(
      'function f(a, b) {\n  return true;\n}',
    );
  });

  it('strips variable annotations', () => {
    expect(strip('let count: number = 0;')).toBe('let count = 0;');
    expect(strip('const names: string[] = [];')).toBe('const names = [];');
    expect(strip('const map: Record<string, number> = {};')).toBe('const map = {};');
  });

  it('strips arrow function types', () => {
    expect(strip('const f = (n: number): number => n * 2;')).toBe('const f = (n) => n * 2;');
  });

  it('removes interfaces and type aliases entirely', () => {
    const src = 'interface P {\n  x: number;\n}\ntype Id = string;\nconst p = { x: 1 };';
    const out = strip(src);
    expect(out).not.toContain('interface');
    expect(out).not.toContain('type Id');
    expect(out).toContain('const p = { x: 1 };');
  });

  it('removes an interface written on one line', () => {
    // The multi-line form is the one people copy out of documentation; the
    // one-line form is the one people type, and it used to survive into the
    // JavaScript and take the whole program down with a syntax error.
    const out = strip('interface P { x: number }\nconst p = { x: 3 };\nconsole.log(p.x);');
    expect(out).not.toContain('interface');
    expect(out).toContain('const p = { x: 3 };');
    expect(out).toContain('console.log(p.x);');
  });

  it('leaves an object literal that merely mentions the word type alone', () => {
    const src = 'const config = { type: "x" };\nconsole.log(config.type);';
    expect(strip(src)).toBe(src);
  });

  it('strips an annotation from a class field that carries modifiers', () => {
    const out = strip('class Q {\n  private items: number[] = [];\n  readonly max: number = 10;\n}');
    expect(out).toContain('items = [];');
    expect(out).toContain('max = 10;');
    expect(out).not.toContain('number');
  });

  it('strips as-assertions and non-null markers', () => {
    expect(strip('const n = value as number;')).toBe('const n = value;');
    expect(strip('const v = maybe!;')).toBe('const v = maybe;');
    expect(strip('const s = x as const;')).toBe('const s = x;');
  });

  it('strips optional parameter markers', () => {
    expect(strip('function g(a: string, b?: string) {\n  return a;\n}')).toBe(
      'function g(a, b) {\n  return a;\n}',
    );
  });
});

describe('stripTypes leaves JavaScript alone', () => {
  it('does not touch object literals', () => {
    const src = 'const user = { name: "Ada", age: 36, tags: ["a", "b"] };';
    expect(strip(src)).toBe(src);
  });

  it('does not touch nested object literals inside calls', () => {
    const src = 'render({ x: 1, y: { z: 2 } }, { deep: true });';
    expect(strip(src)).toBe(src);
  });

  it('does not touch ternaries', () => {
    const src = 'const label = ok ? "yes" : "no";\nconst v = f() ? a() : b();';
    expect(strip(src)).toBe(src);
  });

  it('does not touch ternaries inside a condition followed by a block', () => {
    const src = 'if (flag ? a : b) {\n  run();\n}';
    expect(strip(src)).toBe(src);
  });

  it('does not touch switch case labels', () => {
    const src = 'switch (k) {\n  case 1:\n    go();\n    break;\n  default:\n    stop();\n}';
    expect(strip(src)).toBe(src);
  });

  it('does not touch colons inside strings or template literals', () => {
    const src = 'console.log("time: 12:30");\nconsole.log(`a: ${x}`);';
    expect(strip(src)).toBe(src);
  });

  it('does not touch labelled loops', () => {
    const src = 'outer:\nfor (const x of xs) {\n  break outer;\n}';
    expect(strip(src)).toBe(src);
  });

  it('leaves a default object parameter intact', () => {
    expect(strip('function h(opts: Options = { a: 1 }) {\n  return opts;\n}')).toBe(
      'function h(opts = { a: 1 }) {\n  return opts;\n}',
    );
  });
});

describe('stripTypes refuses what it cannot erase', () => {
  it('rejects enums', () => {
    expect(stripTypes('enum Color { Red }').unsupported).toBe('enum');
  });

  it('rejects namespaces', () => {
    expect(stripTypes('namespace N {}').unsupported).toBe('namespace');
  });

  it('rejects parameter properties', () => {
    expect(stripTypes('class A {\n  constructor(private x: number) {}\n}').unsupported).toBe(
      'parameter property',
    );
  });
});

describe('stripTypes output actually runs', () => {
  it('produces evaluable JavaScript for a typical exercise solution', () => {
    const src = [
      'interface Point {',
      '  x: number;',
      '  y: number;',
      '}',
      '',
      'function distance(a: Point, b: Point): number {',
      '  const dx: number = a.x - b.x;',
      '  const dy: number = a.y - b.y;',
      '  return Math.round(Math.sqrt(dx * dx + dy * dy));',
      '}',
      '',
      'globalThis.__result = distance({ x: 0, y: 0 }, { x: 3, y: 4 });',
    ].join('\n');
    const out = strip(src);
    // eslint-disable-next-line no-new-func
    new Function(out)();
    expect((globalThis as unknown as { __result: number }).__result).toBe(5);
  });
});

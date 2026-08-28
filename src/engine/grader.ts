import type { Exercise } from './types';

/* ============================================================================
   Grading for the nine element types that can be judged without running code.
   (`write` is graded by src/runtime, which actually executes the program.)

   The guiding rule: never mark somebody wrong for a difference that does not
   matter. Whitespace, quote style, trailing semicolons in languages that do
   not care, and letter case in prose answers are all normalised away. Being
   marked wrong for a space is the fastest way to make a learner distrust the
   app - and once they distrust it, they stop believing the corrections too.
   ========================================================================== */

export type Response =
  | { kind: 'choice'; picked: number[] }
  | { kind: 'assemble'; tiles: string[] }
  | { kind: 'order'; lines: string[] }
  | { kind: 'blank'; values: string[] }
  | { kind: 'match'; pairs: Array<[string, string]> }
  | { kind: 'predict'; picked: number }
  | { kind: 'bug'; line: number; why?: number }
  | { kind: 'wire'; links: Array<[string, string]> }
  | { kind: 'terminal'; command: string }
  | { kind: 'write'; correct: boolean };

export interface Grade {
  correct: boolean;
  /** Short, specific note shown alongside the explanation. */
  detail?: string;
  /** For partially-correct multi-part answers, 0..1 - drives the mascot mood. */
  partial?: number;
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const looseCode = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),;:{}[\]])\s*/g, '$1')
    .replace(/['"]/g, '"')
    .replace(/;$/, '')
    .trim();
const looseText = (s: string) => collapse(s).toLowerCase().replace(/[.!]$/, '');

export function grade(exercise: Exercise, response: Response): Grade {
  switch (exercise.kind) {
    case 'choice': {
      if (response.kind !== 'choice') return { correct: false };
      const want = [...exercise.answer].sort((a, b) => a - b);
      const got = [...response.picked].sort((a, b) => a - b);
      const correct = want.length === got.length && want.every((v, i) => v === got[i]);
      if (correct) return { correct: true };
      const hits = got.filter((g) => want.includes(g)).length;
      return {
        correct: false,
        partial: want.length ? hits / want.length : 0,
        detail:
          want.length > 1
            ? `${hits} of ${want.length} correct options selected.`
            : `The answer was "${exercise.options[want[0]]}".`,
      };
    }

    case 'assemble': {
      if (response.kind !== 'assemble') return { correct: false };
      const want = exercise.answer.map(looseCode).join(' ');
      const got = response.tiles.map(looseCode).join(' ');
      if (want === got) return { correct: true };
      // Same tiles, wrong order is worth saying out loud - it is a different
      // mistake from having picked the wrong pieces.
      const sameSet = [...response.tiles].sort().join(' ') === [...exercise.answer].sort().join(' ');
      return {
        correct: false,
        detail: sameSet ? 'Right pieces, wrong order.' : `Expected: ${exercise.answer.join(' ')}`,
      };
    }

    case 'order': {
      if (response.kind !== 'order') return { correct: false };
      const want = exercise.lines.map(looseCode);
      const got = response.lines.map(looseCode);
      if (want.length === got.length && want.every((v, i) => v === got[i])) return { correct: true };
      const inPlace = want.filter((v, i) => got[i] === v).length;
      return {
        correct: false,
        partial: want.length ? inPlace / want.length : 0,
        detail: `${inPlace} of ${want.length} lines were in the right place.`,
      };
    }

    case 'blank': {
      if (response.kind !== 'blank') return { correct: false };
      const results = exercise.blanks.map((blank, i) => {
        const given = response.values[i] ?? '';
        return blank.accept.some((a) => looseCode(a) === looseCode(given) || looseText(a) === looseText(given));
      });
      const hits = results.filter(Boolean).length;
      if (hits === exercise.blanks.length) return { correct: true };
      const firstWrong = results.indexOf(false);
      return {
        correct: false,
        partial: hits / exercise.blanks.length,
        detail: `Blank ${firstWrong + 1} should be "${exercise.blanks[firstWrong].accept[0]}".`,
      };
    }

    case 'match': {
      if (response.kind !== 'match') return { correct: false };
      const want = new Map(exercise.pairs.map(([l, r]) => [looseText(l), looseText(r)]));
      const hits = response.pairs.filter(([l, r]) => want.get(looseText(l)) === looseText(r)).length;
      if (hits === exercise.pairs.length) return { correct: true };
      return {
        correct: false,
        partial: hits / exercise.pairs.length,
        detail: `${hits} of ${exercise.pairs.length} pairs matched.`,
      };
    }

    case 'predict': {
      if (response.kind !== 'predict') return { correct: false };
      if (response.picked === exercise.answer) return { correct: true };
      return { correct: false, detail: `It prints ${exercise.options[exercise.answer]}` };
    }

    case 'bug': {
      if (response.kind !== 'bug') return { correct: false };
      const lineRight = response.line === exercise.buggyLine;
      if (!exercise.why) {
        return lineRight
          ? { correct: true }
          : { correct: false, detail: `The bug is on line ${exercise.buggyLine}.` };
      }
      const whyRight = response.why === exercise.why.answer;
      if (lineRight && whyRight) return { correct: true };
      return {
        correct: false,
        partial: (lineRight ? 0.5 : 0) + (whyRight ? 0.5 : 0),
        detail: lineRight
          ? `Right line. ${exercise.why.options[exercise.why.answer]}`
          : `The bug is on line ${exercise.buggyLine}.`,
      };
    }

    case 'wire': {
      if (response.kind !== 'wire') return { correct: false };
      const key = (l: [string, string]) => `${l[0]}>${l[1]}`;
      const want = new Set(exercise.links.map(key));
      const got = new Set(response.links.map(key));
      const hits = [...want].filter((k) => got.has(k)).length;
      const extra = [...got].filter((k) => !want.has(k)).length;
      if (hits === want.size && extra === 0) return { correct: true };
      return {
        correct: false,
        partial: want.size ? Math.max(0, (hits - extra) / want.size) : 0,
        detail:
          extra > 0
            ? `${extra} connection${extra > 1 ? 's' : ''} should not be there.`
            : `${hits} of ${want.size} wires connected.`,
      };
    }

    case 'terminal': {
      if (response.kind !== 'terminal') return { correct: false };
      const got = collapse(response.command);
      const correct = exercise.accept.some(
        (a) => collapse(a) === got || collapse(a).toLowerCase() === got.toLowerCase(),
      );
      return correct ? { correct: true } : { correct: false, detail: `Try: ${exercise.accept[0]}` };
    }

    case 'write': {
      if (response.kind !== 'write') return { correct: false };
      return { correct: response.correct };
    }
  }
}

/** A blank exercise's template split into text runs and blank markers. */
export function splitTemplate(template: string): Array<{ text: string } | { blank: number }> {
  const parts: Array<{ text: string } | { blank: number }> = [];
  const re = /\{\{(\d+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    if (m.index > last) parts.push({ text: template.slice(last, m.index) });
    parts.push({ blank: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < template.length) parts.push({ text: template.slice(last) });
  return parts;
}

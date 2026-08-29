import type { Exercise } from './types';

/* ============================================================================
   Getting unstuck.

   The old "I am stuck" button marked the question wrong and showed the answer,
   which is the one thing a learner who is nearly there does not need. Instead
   there are three steps, and the question stays open the whole way:

     1. the hint the author wrote,
     2. how to approach this *kind* of question,
     3. a narrowing tip computed from the answer — two options eliminated, the
        first tile named, the line the bug is on given as a range.

   Only after all three is there a "show me the answer", and that is still the
   old behaviour: it counts as wrong, because it is.
   ========================================================================== */

export interface Tip {
  label: string;
  body: string;
}

const STRATEGY: Record<Exercise['kind'], string> = {
  choice:
    'Rule out what is definitely wrong first. Two options are usually there to catch a specific misunderstanding — decide what each one would mean if it were true.',
  predict:
    'Run it in your head one line at a time and write down what each name holds after that line. Do not skip the line you think is obvious.',
  assemble:
    'Build the line from the outside in: what is the statement, then what does it take, then the details in the middle.',
  order:
    'Find the line that cannot depend on anything else — that is your first. Then ask what has to exist before each remaining line can run.',
  blank:
    'Read the whole snippet first and work out what it is trying to do. The blanks are almost always a keyword, a name already in scope, or a method.',
  match:
    'Pair the ones you are sure of first; every pair you place makes the rest easier by elimination.',
  bug: 'Read it as the computer would, not as you meant it. Look for the line where what is written stops matching what you intended.',
  wire: 'Follow the execution line first — what fires, and what happens next — then join the data pins that feed it.',
  terminal:
    'Say the command out loud as a sentence: what tool, what action, what target. The flags come last.',
  write:
    'Get one test passing before you try to satisfy all of them. Print what you have half way through if you cannot see where it goes wrong.',
};

function letterFor(index: number): string {
  return String(index + 1);
}

/** The narrowing tip: real information, computed from the answer. */
function narrow(exercise: Exercise): string | null {
  switch (exercise.kind) {
    case 'choice': {
      const wrong = exercise.options.map((_, i) => i).filter((i) => !exercise.answer.includes(i));
      const named = wrong.slice(0, 2).map(letterFor);
      const count =
        exercise.answer.length > 1 ? ` You need ${exercise.answer.length} of them.` : '';
      if (!named.length) return `Every option is correct.${count}`;
      return `It is not ${named.length === 2 ? `${named[0]} or ${named[1]}` : named[0]}.${count}`;
    }
    case 'predict': {
      const wrong = exercise.options.map((_, i) => i).filter((i) => i !== exercise.answer);
      const named = wrong.slice(0, 2).map(letterFor);
      return `It is not ${named[0]}${named[1] ? ` or ${named[1]}` : ''}.`;
    }
    case 'assemble':
      return `It is ${exercise.answer.length} pieces long and starts with \`${exercise.answer[0]}\`.`;
    case 'order':
      return `The first line is \`${exercise.lines[0]}\`.`;
    case 'blank': {
      const parts = exercise.blanks.map((blank, i) => {
        const answer = blank.accept[0] ?? '';
        const head = answer.slice(0, 1);
        return `${exercise.blanks.length > 1 ? `blank ${i + 1}: ` : ''}${answer.length} characters, starts with "${head}"`;
      });
      return parts.join(' · ');
    }
    case 'match': {
      const [left, right] = exercise.pairs[0];
      return `One pair to start you off: ${left} goes with "${right}".`;
    }
    case 'bug': {
      const lines = exercise.code.split('\n').length;
      const half = exercise.buggyLine <= Math.ceil(lines / 2) ? 'first' : 'second';
      return `The mistake is in the ${half} half of the snippet.`;
    }
    case 'terminal': {
      const first = exercise.accept[0]?.split(' ') ?? [];
      return first.length > 1
        ? `It starts with \`${first.slice(0, 2).join(' ')}\`.`
        : `It is a single word: it starts with "${(first[0] ?? '').slice(0, 2)}".`;
    }
    case 'wire': {
      const [from, to] = exercise.links[0] ?? [];
      if (!from || !to) return null;
      const source = from.split(':')[0];
      const target = to.split(':')[0];
      return `Start by joining ${source} to ${target}.`;
    }
    case 'write': {
      const rule = exercise.mustContain?.[0]?.label;
      const expected = exercise.tests[0]?.expect?.split('\n')[0];
      if (rule && expected) return `${capitalise(rule)}, and the first line of output is \`${expected}\`.`;
      if (expected) return `The first line of output is \`${expected}\`.`;
      if (rule) return capitalise(rule) + '.';
      return null;
    }
    default:
      return null;
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The escalating tips for one exercise. Always at least two, usually three;
 * the author's hint is skipped when there is not one rather than faked.
 */
export function tipsFor(exercise: Exercise): Tip[] {
  const tips: Tip[] = [];
  if (exercise.hint) tips.push({ label: 'Hint', body: exercise.hint });
  tips.push({ label: 'How to approach it', body: STRATEGY[exercise.kind] });
  const narrowed = narrow(exercise);
  if (narrowed) tips.push({ label: 'Narrow it down', body: narrowed });
  return tips;
}

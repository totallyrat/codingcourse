import type { Exercise, ExerciseKind } from '@/engine/types';
import { AssembleElement } from './Assemble';
import { BlankElement } from './Blank';
import { BugElement } from './Bug';
import { ChoiceElement, PredictElement } from './Choice';
import { MatchElement } from './Match';
import { OrderElement } from './Order';
import { TerminalElement } from './Terminal';
import { WireElement } from './Wire';
import { WriteElement } from './Write';
import type { ElementProps } from './shared';

/**
 * The ten prebuilt element types, and the one place that maps an exercise to
 * the component that presents it. Adding an eleventh means adding a variant to
 * the Exercise union, a grader case, and one line here.
 */
export function ExerciseElement(props: ElementProps<Exercise>) {
  const { exercise } = props;
  switch (exercise.kind) {
    case 'choice':
      return <ChoiceElement {...props} exercise={exercise} />;
    case 'predict':
      return <PredictElement {...props} exercise={exercise} />;
    case 'assemble':
      return <AssembleElement {...props} exercise={exercise} />;
    case 'order':
      return <OrderElement {...props} exercise={exercise} />;
    case 'blank':
      return <BlankElement {...props} exercise={exercise} />;
    case 'match':
      return <MatchElement {...props} exercise={exercise} />;
    case 'bug':
      return <BugElement {...props} exercise={exercise} />;
    case 'wire':
      return <WireElement {...props} exercise={exercise} />;
    case 'terminal':
      return <TerminalElement {...props} exercise={exercise} />;
    case 'write':
      return <WriteElement {...props} exercise={exercise} />;
  }
}

/** Short label shown on the exercise card, so the type is always legible. */
export const KIND_LABEL: Record<ExerciseKind, string> = {
  choice: 'Choose',
  predict: 'Predict the output',
  assemble: 'Build the line',
  order: 'Put in order',
  blank: 'Fill the gaps',
  match: 'Match the pairs',
  bug: 'Find the bug',
  wire: 'Wire the graph',
  terminal: 'Run a command',
  write: 'Write and run',
};

export type { ElementProps };

/* ============================================================================
   The content + progress model.

   Two ideas run through all of it:
   - A *concept* is the unit of memory (what the scheduler tracks), an
     *exercise* is only ever a way of testing one. Several exercises share a
     concept, so a missed idea can come back wearing a different hat.
   - Everything is data. There is no model, no service and no API key anywhere
     in this app; the "intelligence" is entirely the scoring functions in
     courseBuilder.ts and lessonComposer.ts operating over this library.
   ========================================================================== */

export type TrackId = string;
export type ConceptId = string;
export type SkillId = string;
export type ExerciseId = string;

export type RunLanguage = 'python' | 'javascript' | 'typescript' | 'cpp' | 'csharp' | 'rust' | 'go';

/** The ten prebuilt element types a lesson can be assembled from. */
export type ExerciseKind =
  | 'choice'
  | 'assemble'
  | 'order'
  | 'blank'
  | 'write'
  | 'match'
  | 'predict'
  | 'bug'
  | 'wire'
  | 'terminal';

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type Interest =
  | 'games'
  | 'web'
  | 'apps'
  | 'data'
  | 'automation'
  | 'systems'
  | 'graphics'
  | 'interviews';

export type Goal = 'games' | 'web' | 'apps' | 'data' | 'automation' | 'systems' | 'interviews' | 'curious';

export type Experience = 'none' | 'some' | 'confident' | 'pro';

export interface ExerciseCommon {
  id: ExerciseId;
  track: TrackId;
  /** First entry is the primary concept — the one mastery is credited to. */
  concepts: ConceptId[];
  difficulty: Difficulty;
  prompt: string;
  /** Highlighting language; defaults to the track's. */
  lang?: string;
  hint?: string;
  /** Shown after answering, right or wrong. This is where the teaching is. */
  explain?: string;
  tags?: Interest[];
  estSeconds?: number;
}

/** Pick one (or several) of a set of options. */
export interface ChoiceExercise extends ExerciseCommon {
  kind: 'choice';
  code?: string;
  options: string[];
  /** Indices into `options`. More than one entry makes it multi-select. */
  answer: number[];
}

/** Tap/drag word tiles in order to build a line of code. */
export interface AssembleExercise extends ExerciseCommon {
  kind: 'assemble';
  /** The correct sequence of tiles. */
  answer: string[];
  /** Extra tiles that do not belong, to make it a real choice. */
  distractors?: string[];
  /** Optional context shown above the tray. */
  code?: string;
}

/** Drag whole lines into the right order. */
export interface OrderExercise extends ExerciseCommon {
  kind: 'order';
  /** Given in the correct order; the UI shuffles them. */
  lines: string[];
  /** Lines that must be left out of the answer entirely. */
  decoys?: string[];
}

/** Fill the gaps in a snippet. `{{0}}`, `{{1}}` … mark the blanks. */
export interface BlankExercise extends ExerciseCommon {
  kind: 'blank';
  template: string;
  /** One entry per blank; any listed spelling is accepted. */
  blanks: Array<{ accept: string[]; width?: number; placeholder?: string }>;
}

export interface TestCase {
  /** Human-readable name shown in the results table. */
  name: string;
  /** Fed to the program on stdin. */
  stdin?: string;
  /** Exact expected stdout after trimming trailing whitespace per line. */
  expect: string;
  /** When set, the output only has to contain these fragments, in order. */
  expectContains?: string[];
  hidden?: boolean;
}

/** Write real code and run it. */
export interface WriteExercise extends ExerciseCommon {
  kind: 'write';
  runLang: RunLanguage;
  starter: string;
  solution: string;
  tests: TestCase[];
  /** Structural requirements checked before running (e.g. "use a for loop"). */
  mustContain?: Array<{ pattern: string; label: string; regex?: boolean }>;
  mustNotContain?: Array<{ pattern: string; label: string; regex?: boolean }>;
}

/** Match concepts to definitions, two columns. */
export interface MatchExercise extends ExerciseCommon {
  kind: 'match';
  pairs: Array<[string, string]>;
}

/** Read code, say what it prints. */
export interface PredictExercise extends ExerciseCommon {
  kind: 'predict';
  code: string;
  options: string[];
  answer: number;
}

/** Click the line that is wrong, then say why. */
export interface BugExercise extends ExerciseCommon {
  kind: 'bug';
  code: string;
  /** 1-indexed. */
  buggyLine: number;
  why?: { options: string[]; answer: number };
}

/** Wire node graphs — Unreal Blueprints, Unity Visual Scripting, shader graphs. */
export interface WireNode {
  id: string;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  inputs?: string[];
  outputs?: string[];
  tone?: 'event' | 'flow' | 'data' | 'action';
}
export interface WireExercise extends ExerciseCommon {
  kind: 'wire';
  nodes: WireNode[];
  /** Required links as `nodeId:outputName` -> `nodeId:inputName`. */
  links: Array<[string, string]>;
}

/** Type the right command into a simulated shell. */
export interface TerminalExercise extends ExerciseCommon {
  kind: 'terminal';
  /** Lines printed before the prompt, to set the scene. */
  intro?: string[];
  cwd?: string;
  /** Any of these command spellings counts as correct. */
  accept: string[];
  /** Printed when the learner gets it right. */
  output?: string[];
}

export type Exercise =
  | ChoiceExercise
  | AssembleExercise
  | OrderExercise
  | BlankExercise
  | WriteExercise
  | MatchExercise
  | PredictExercise
  | BugExercise
  | WireExercise
  | TerminalExercise;

/* ------------------------------------------------------------------ course */

export type SkillLevel = 'intro' | 'core' | 'applied' | 'advanced';

export interface Skill {
  id: SkillId;
  title: string;
  blurb: string;
  concepts: ConceptId[];
  /** Skill ids that should come first. Cycles are rejected at load time. */
  requires: SkillId[];
  level: SkillLevel;
  tags: Interest[];
  unit: string;
}

export interface Track {
  id: TrackId;
  name: string;
  kind: 'language' | 'engine' | 'tool';
  tagline: string;
  blurb: string;
  /** Highlighting language for snippets in this track. */
  lang: string;
  runLang?: RunLanguage;
  /** Two-character mark used in the UI instead of an icon font. */
  mark: string;
  tags: Interest[];
  goals: Goal[];
  /** How steep this track is for a newcomer, 1 (gentle) to 5 (brutal). */
  slope: 1 | 2 | 3 | 4 | 5;
  /** Languages that transfer into this one, for the recommender. */
  transfersFrom?: TrackId[];
  skills: Skill[];
}

/* ---------------------------------------------------------------- learner */

export interface WizardAnswers {
  trackId: TrackId;
  goal: Goal;
  experience: Experience;
  minutesPerDay: number;
  interests: Interest[];
  priorLanguages: TrackId[];
  /** Practice mode removes hearts; some people just hate them. */
  hearts: boolean;
}

export interface ConceptMemory {
  strength: number;
  ease: number;
  interval: number;
  dueLesson: number;
  lapses: number;
  seen: number;
  correct: number;
  lastLesson: number;
  streak: number;
}

export interface ExerciseMemory {
  lastLesson: number;
  wrong: number;
  right: number;
}

/** An exercise queued to come back because it was answered wrong. */
export interface MistakeEntry {
  exerciseId: ExerciseId;
  concept: ConceptId;
  dueLesson: number;
  misses: number;
  addedLesson: number;
}

export interface CourseUnit {
  id: string;
  title: string;
  skillIds: SkillId[];
}

export interface Course {
  trackId: TrackId;
  /** Ordered skill ids: the syllabus the builder produced. */
  syllabus: SkillId[];
  units: CourseUnit[];
  /** Why each skill landed where it did — surfaced in the course preview. */
  rationale: Array<{ skillId: SkillId; score: number; reasons: string[] }>;
  /** Skills pre-credited from the placement answers. */
  placed: SkillId[];
  createdAt: number;
  answers: WizardAnswers;
}

export interface DayRecord {
  /** Local YYYY-MM-DD. */
  date: string;
  xp: number;
  lessons: number;
  correct: number;
  answered: number;
  seconds: number;
}

export interface Profile {
  version: 1;
  id: string;
  name: string;
  course: Course | null;
  /** Every course ever started, so switching tracks does not wipe progress. */
  archived: Course[];
  concepts: Record<ConceptId, ConceptMemory>;
  exercises: Record<ExerciseId, ExerciseMemory>;
  mistakes: MistakeEntry[];
  lessonIndex: number;
  /** Skill id -> lessons completed against it. */
  skillProgress: Record<SkillId, number>;
  crowned: SkillId[];
  xp: number;
  streak: number;
  bestStreak: number;
  lastActiveDate: string | null;
  freezes: number;
  days: DayRecord[];
  settings: {
    hearts: boolean;
    sound: boolean;
    dailyGoalXp: number;
    reduceMotion: boolean;
    fontScale: number;
  };
  createdAt: number;
}

/* ----------------------------------------------------------------- lesson */

export type LessonSlotSource = 'recheck' | 'review' | 'new' | 'stretch' | 'warmup';

export interface LessonSlot {
  exercise: Exercise;
  source: LessonSlotSource;
  /** Populated for 'recheck' — how many times this was missed before. */
  misses?: number;
}

export interface Lesson {
  id: string;
  index: number;
  skillId: SkillId;
  title: string;
  slots: LessonSlot[];
  /** Counts by source, used for the pre-lesson briefing. */
  mix: Record<LessonSlotSource, number>;
}

export interface AnswerOutcome {
  correct: boolean;
  /** Seconds spent on this item. */
  seconds: number;
  /** Whether a hint was opened before answering. */
  usedHint: boolean;
}

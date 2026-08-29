import { hashString, mulberry32, shuffle } from './rng';

/* ============================================================================
   Weekly quests.

   Ten of them, generated on the Monday and gone the next Monday, each worth a
   chest. They are deterministic: the same learner in the same week always gets
   the same ten, so the list cannot be rerolled by closing the app, and a
   quest's progress is only ever advanced by something that actually happened
   in a lesson.
   ========================================================================== */

export type QuestKind =
  | 'xp'
  | 'lessons'
  | 'accuracy'
  | 'perfect'
  | 'minutes'
  | 'rechecks'
  | 'streak'
  | 'skills'
  | 'levels'
  | 'gems';

export interface Quest {
  id: string;
  kind: QuestKind;
  title: string;
  target: number;
  /** For 'accuracy': the score a lesson has to beat, 0..1. */
  threshold?: number;
  progress: number;
  done: boolean;
  /** Set once the chest has been handed over, so it is never paid twice. */
  paid: boolean;
}

export interface QuestState {
  /** The Monday this set belongs to, as YYYY-MM-DD. */
  week: string;
  quests: Quest[];
}

/** Monday of the week `now` falls in, local time. */
export function weekKey(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // getDay() is 0 on Sunday, and a week here starts on Monday.
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Template {
  kind: QuestKind;
  /** Candidate targets, one of which is picked. */
  sizes: number[];
  threshold?: number;
  title: (target: number, threshold?: number) => string;
}

const TEMPLATES: Template[] = [
  { kind: 'xp', sizes: [40, 80, 150, 300], title: (n) => `Earn ${n} XP` },
  { kind: 'lessons', sizes: [3, 5, 8, 12], title: (n) => `Finish ${n} lessons` },
  {
    kind: 'accuracy',
    sizes: [1, 2, 3],
    threshold: 0.8,
    title: (n) => (n === 1 ? 'Score 80% in a lesson' : `Score 80% in ${n} lessons`),
  },
  {
    kind: 'accuracy',
    sizes: [1, 2],
    threshold: 0.9,
    title: (n) => (n === 1 ? 'Score 90% in a lesson' : `Score 90% in ${n} lessons`),
  },
  { kind: 'perfect', sizes: [1, 2, 3], title: (n) => (n === 1 ? 'Finish a perfect lesson' : `Finish ${n} perfect lessons`) },
  { kind: 'minutes', sizes: [10, 20, 45], title: (n) => `Practise for ${n} minutes` },
  { kind: 'rechecks', sizes: [3, 6, 10], title: (n) => `Get ${n} re-checked items right` },
  { kind: 'streak', sizes: [3, 5, 7], title: (n) => `Reach a ${n} day streak` },
  { kind: 'skills', sizes: [1, 2, 3], title: (n) => (n === 1 ? 'Take a skill past 75%' : `Take ${n} skills past 75%`) },
  { kind: 'levels', sizes: [1, 2], title: (n) => (n === 1 ? 'Climb a level' : `Climb ${n} levels`) },
  { kind: 'gems', sizes: [50, 100, 200], title: (n) => `Collect ${n} gems` },
];

export const QUESTS_PER_WEEK = 10;

/** The ten quests for one learner in one week. Same inputs, same list. */
export function generateQuests(profileId: string, week: string): Quest[] {
  const rand = mulberry32(hashString(`${profileId}:${week}`));
  const pool = shuffle(TEMPLATES, rand);
  const quests: Quest[] = [];

  for (let i = 0; quests.length < QUESTS_PER_WEEK; i++) {
    const template = pool[i % pool.length];
    // Later passes over the pool take bigger targets, so a repeated kind is a
    // harder version of itself rather than the same quest twice.
    const lap = Math.floor(i / pool.length);
    const index = Math.min(template.sizes.length - 1, Math.floor(rand() * template.sizes.length) + lap);
    const target = template.sizes[index];
    const id = `${template.kind}-${target}-${template.threshold ?? 0}`;
    if (quests.some((q) => q.id === id)) continue;
    quests.push({
      id,
      kind: template.kind,
      title: template.title(target, template.threshold),
      target,
      threshold: template.threshold,
      progress: 0,
      done: false,
      paid: false,
    });
  }

  // Cheapest first: the list should open with something you might finish today.
  return quests.sort((a, b) => cost(a) - cost(b));
}

function cost(quest: Quest): number {
  const weight: Record<QuestKind, number> = {
    xp: 0.12,
    gems: 0.1,
    minutes: 0.6,
    lessons: 2.4,
    rechecks: 1.6,
    accuracy: 6,
    perfect: 9,
    skills: 8,
    levels: 12,
    streak: 3,
  };
  return quest.target * weight[quest.kind];
}

/** Rolls the week over when it has to, and leaves it alone when it has not. */
export function ensureWeek(state: QuestState | null, profileId: string, now = new Date()): QuestState {
  const week = weekKey(now);
  if (state && state.week === week) return state;
  return { week, quests: generateQuests(profileId, week) };
}

/** What one finished lesson did, in the terms quests are written in. */
export interface LessonFacts {
  xp: number;
  gems: number;
  correct: number;
  total: number;
  perfect: boolean;
  seconds: number;
  /** Items that were on the re-check queue and were answered right. */
  rechecksCleared: number;
  /** Skills that crossed 75% because of this lesson. */
  skillsMastered: number;
  /** Rungs climbed on the ladder. */
  levelsClimbed: number;
  /** The streak after this lesson. */
  streak: number;
}

export interface QuestUpdate {
  state: QuestState;
  /** Quests finished by this lesson — one chest each. */
  completed: Quest[];
}

/** Applies a lesson to the week's quests. Progress only ever goes up. */
export function applyLessonToQuests(state: QuestState, facts: LessonFacts): QuestUpdate {
  const score = facts.total ? facts.correct / facts.total : 0;
  const completed: Quest[] = [];

  const quests = state.quests.map((quest) => {
    if (quest.done) return quest;
    let progress = quest.progress;

    switch (quest.kind) {
      case 'xp':
        progress += facts.xp;
        break;
      case 'gems':
        progress += facts.gems;
        break;
      case 'lessons':
        progress += 1;
        break;
      case 'minutes':
        progress += facts.seconds / 60;
        break;
      case 'rechecks':
        progress += facts.rechecksCleared;
        break;
      case 'accuracy':
        if (score >= (quest.threshold ?? 0.8)) progress += 1;
        break;
      case 'perfect':
        if (facts.perfect) progress += 1;
        break;
      case 'skills':
        progress += facts.skillsMastered;
        break;
      case 'levels':
        progress += facts.levelsClimbed;
        break;
      case 'streak':
        // A streak is a state, not a tally: it is the best you have reached.
        progress = Math.max(progress, facts.streak);
        break;
    }

    const next = { ...quest, progress: Math.min(quest.target, roundish(progress)) };
    if (!next.done && next.progress >= next.target) {
      next.done = true;
      completed.push(next);
    }
    return next;
  });

  return { state: { ...state, quests }, completed };
}

function roundish(value: number): number {
  return Math.round(value * 100) / 100;
}

export function questsDone(state: QuestState | null): number {
  return state?.quests.filter((q) => q.done).length ?? 0;
}

/** Chests earned but not yet handed over, so a crash cannot eat a reward. */
export function unpaidChests(state: QuestState | null): Quest[] {
  return state?.quests.filter((q) => q.done && !q.paid) ?? [];
}

export function markPaid(state: QuestState, ids: string[]): QuestState {
  const set = new Set(ids);
  return { ...state, quests: state.quests.map((q) => (set.has(q.id) ? { ...q, paid: true } : q)) };
}

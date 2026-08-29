import { clearMistake, memoryFor, queueMistake, reviewConcept } from './scheduler';
import { applyLesson, freshLevel, type LevelChange, type LevelState } from './levels';
import { applyLessonToQuests, ensureWeek, markPaid, type Quest } from './quests';
import type { AnswerOutcome, Course, Exercise, Profile, Skill, SkillId, TrackId } from './types';

/* ============================================================================
   Profile lifecycle: creation, recording answers, XP, streaks.

   Every function here is pure — it takes a profile and returns the next one.
   The app holds exactly one profile in React state and persists it after each
   change, so keeping this side-effect free is what makes "undo the last
   lesson" and the unit tests possible.
   ========================================================================== */

export const XP_PER_CORRECT = 10;
export const XP_LESSON_BONUS = 20;
export const XP_PERFECT_BONUS = 15;
export const GEMS_PER_LESSON = 12;
export const GEMS_PERFECT_BONUS = 8;

export function todayKey(now = new Date()): string {
  // Local date, not UTC: a streak should break at the learner's midnight.
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysBetween(a: string, b: string): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(b) - parse(a)) / 86400000);
}

export function createProfile(id: string, name = 'Learner'): Profile {
  return {
    version: 1,
    id,
    name,
    course: null,
    archived: [],
    concepts: {},
    exercises: {},
    mistakes: [],
    lessonIndex: 0,
    skillProgress: {},
    crowned: [],
    xp: 0,
    streak: 0,
    bestStreak: 0,
    lastActiveDate: null,
    freezes: 2,
    gems: 40,
    inventory: { streakSaver: 0, superBoost: 0, lessonSkip: 0, chest: 0 },
    boostLessons: 0,
    levels: {},
    quests: null,
    avatar: null,
    days: [],
    settings: {
      hearts: true,
      sound: true,
      dailyGoalXp: 60,
      reduceMotion: false,
      fontScale: 1,
      reminders: { enabled: false, hour: 19, minute: 0 },
    },
    createdAt: Date.now(),
  };
}

/** Swaps in a new course, archiving the old one rather than discarding it. */
export function setCourse(profile: Profile, course: Course): Profile {
  const archived = profile.course ? [...profile.archived.filter((c) => c.trackId !== profile.course!.trackId), profile.course] : profile.archived;
  return {
    ...profile,
    course,
    archived: archived.filter((c) => c.trackId !== course.trackId),
    settings: { ...profile.settings, hearts: course.answers.hearts },
  };
}

/** The ladder state for a track, defaulted rather than undefined. */
export function levelFor(profile: Profile, trackId: TrackId): LevelState {
  return profile.levels[trackId] ?? freshLevel();
}

/**
 * Records one answer. This is the single place where a wrong answer turns into
 * a promise to ask again next lesson.
 */
export function recordAnswer(profile: Profile, exercise: Exercise, outcome: AnswerOutcome): Profile {
  const lesson = profile.lessonIndex;
  const concepts = { ...profile.concepts };

  for (const [i, concept] of exercise.concepts.entries()) {
    const before = memoryFor(profile, concept);
    // Secondary concepts move at a third of the rate: an exercise mostly
    // tests one idea and merely brushes the others.
    const after = reviewConcept(before, outcome.correct, lesson, {
      usedHint: outcome.usedHint,
      seconds: outcome.seconds,
    });
    concepts[concept] =
      i === 0
        ? after
        : {
            ...before,
            seen: before.seen + 1,
            correct: before.correct + (outcome.correct ? 1 : 0),
            lastLesson: lesson,
            strength: before.strength + (after.strength - before.strength) * 0.34,
            dueLesson: outcome.correct ? before.dueLesson : lesson + 1,
          };
  }

  const exMemory = profile.exercises[exercise.id] ?? { lastLesson: -1, wrong: 0, right: 0 };
  const exercises = {
    ...profile.exercises,
    [exercise.id]: {
      lastLesson: lesson,
      wrong: exMemory.wrong + (outcome.correct ? 0 : 1),
      right: exMemory.right + (outcome.correct ? 1 : 0),
    },
  };

  const primary = exercise.concepts[0];
  const mistakes = outcome.correct
    ? clearMistake(profile.mistakes, exercise.id, lesson)
    : queueMistake(profile.mistakes, exercise.id, primary, lesson);

  return { ...profile, concepts, exercises, mistakes };
}

export interface LessonSummary {
  correct: number;
  total: number;
  seconds: number;
  perfect: boolean;
  skillId: SkillId;
  trackId: TrackId;
  /** Items in the lesson that were at or above the learner's level. */
  atLevel: number;
  /** The composer had no at-level material left — see Lesson.starved. */
  starved?: boolean;
  /** Items from the re-check queue that were answered right this time. */
  rechecksCleared?: number;
  /** Skills that crossed 75% because of this lesson. */
  skillsMastered?: number;
}

export interface LessonReward {
  profile: Profile;
  xpEarned: number;
  gemsEarned: number;
  /** Whether a Super Boost was spent on this lesson. */
  boosted: boolean;
  level: LevelChange;
  /** Quests this lesson finished off — one chest each, already granted. */
  questsCompleted: Quest[];
}

/** Applies end-of-lesson bookkeeping: XP, gems, the ladder, the streak, the day log. */
export function completeLesson(profile: Profile, summary: LessonSummary, now = new Date()): LessonReward {
  const boosted = profile.boostLessons > 0;
  const base = summary.correct * XP_PER_CORRECT + XP_LESSON_BONUS + (summary.perfect ? XP_PERFECT_BONUS : 0);
  const xpEarned = boosted ? base * 2 : base;
  const gemsEarned = GEMS_PER_LESSON + (summary.perfect ? GEMS_PERFECT_BONUS : 0);

  const score = summary.total ? summary.correct / summary.total : 0;
  const level = applyLesson(levelFor(profile, summary.trackId), {
    score,
    atLevel: summary.atLevel,
    total: summary.total,
    starved: summary.starved,
  });

  const date = todayKey(now);
  const days = [...profile.days];
  const todayIdx = days.findIndex((d) => d.date === date);

  const dayRecord = todayIdx >= 0 ? { ...days[todayIdx] } : { date, xp: 0, lessons: 0, correct: 0, answered: 0, seconds: 0 };
  dayRecord.xp += xpEarned;
  dayRecord.lessons += 1;
  dayRecord.correct += summary.correct;
  dayRecord.answered += summary.total;
  dayRecord.seconds += summary.seconds;
  if (todayIdx >= 0) days[todayIdx] = dayRecord;
  else days.push(dayRecord);
  // Two years of daily records is ~730 rows; trimming keeps the profile file
  // small enough to stay a single atomic write.
  const trimmed = days.slice(-800);

  let streak = profile.streak;
  let freezes = profile.freezes;
  if (profile.lastActiveDate === null) {
    streak = 1;
  } else {
    const gap = daysBetween(profile.lastActiveDate, date);
    if (gap === 0) {
      streak = Math.max(1, streak);
    } else if (gap === 1) {
      streak += 1;
    } else if (gap === 2 && freezes > 0) {
      // One free miss, spent automatically — the point is to keep somebody
      // who slipped a single day from abandoning a 30-day streak.
      freezes -= 1;
      streak += 1;
    } else {
      streak = 1;
    }
  }

  // Quests are settled last, because they read the streak and the level move
  // this lesson just produced.
  const questsBefore = ensureWeek(profile.quests, profile.id, now);
  const applied = applyLessonToQuests(questsBefore, {
    xp: xpEarned,
    gems: gemsEarned,
    correct: summary.correct,
    total: summary.total,
    perfect: summary.perfect,
    seconds: summary.seconds,
    rechecksCleared: summary.rechecksCleared ?? 0,
    skillsMastered: summary.skillsMastered ?? 0,
    levelsClimbed: level.moved === 'up' ? 1 : 0,
    streak,
  });
  const questsCompleted = applied.completed;
  const quests = markPaid(applied.state, questsCompleted.map((q) => q.id));

  return {
    profile: {
      ...profile,
      xp: profile.xp + xpEarned,
      gems: profile.gems + gemsEarned,
      boostLessons: Math.max(0, profile.boostLessons - 1),
      levels: { ...profile.levels, [summary.trackId]: level.state },
      quests,
      inventory: { ...profile.inventory, chest: profile.inventory.chest + questsCompleted.length },
      lessonIndex: profile.lessonIndex + 1,
      skillProgress: {
        ...profile.skillProgress,
        [summary.skillId]: (profile.skillProgress[summary.skillId] ?? 0) + 1,
      },
      streak,
      bestStreak: Math.max(profile.bestStreak, streak),
      lastActiveDate: date,
      freezes,
      days: trimmed,
    },
    xpEarned,
    gemsEarned,
    boosted,
    level,
    questsCompleted,
  };
}

/* ------------------------------------------------------------------- shop */

export type ShopItemId = 'streakSaver' | 'superBoost' | 'instantXp' | 'lessonSkip' | 'chest';

export interface ShopItem {
  id: ShopItemId;
  name: string;
  blurb: string;
  price: number;
}

/**
 * Five things to spend gems on. Every one of them maps onto a mechanic that
 * already exists — a streak saver is the freeze the scheduler was already
 * spending for you, a skip really does credit the skill — so nothing here is
 * a number that only moves in the shop.
 */
export const SHOP: ShopItem[] = [
  {
    id: 'streakSaver',
    name: 'Streak Saver',
    blurb: 'Miss a day and this is spent instead of your streak. Stacks.',
    price: 50,
  },
  {
    id: 'superBoost',
    name: 'Super Boost',
    blurb: 'Double XP for your next three lessons.',
    price: 80,
  },
  {
    id: 'instantXp',
    name: 'Instant XP',
    blurb: '150 XP straight away, and it counts towards today\u2019s goal.',
    price: 60,
  },
  {
    id: 'lessonSkip',
    name: 'Lesson Skip',
    blurb: 'Marks one lesson as passed. Keeps the XP, skips the practice.',
    price: 100,
  },
  {
    id: 'chest',
    name: 'Mystery Chest',
    blurb: 'One of the other four. You find out when you open it.',
    price: 70,
  },
];

const CHEST_TABLE: ShopItemId[] = [
  'streakSaver',
  'streakSaver',
  'superBoost',
  'superBoost',
  'instantXp',
  'instantXp',
  'instantXp',
  'lessonSkip',
];

export const INSTANT_XP = 150;
export const BOOST_LESSONS = 3;

export interface Purchase {
  profile: Profile;
  ok: boolean;
  /** What was actually granted — a chest resolves to one of the others. */
  granted: ShopItemId | null;
  reason?: string;
}

/** Buys one item. Chests resolve here, so the caller cannot peek first. */
export function buyItem(profile: Profile, id: ShopItemId, roll = Math.random(), now = new Date()): Purchase {
  const item = SHOP.find((s) => s.id === id);
  if (!item) return { profile, ok: false, granted: null, reason: 'No such item.' };
  if (profile.gems < item.price) {
    return { profile, ok: false, granted: null, reason: `${item.price - profile.gems} more gems needed.` };
  }

  const granted: ShopItemId =
    id === 'chest' ? CHEST_TABLE[Math.min(CHEST_TABLE.length - 1, Math.floor(roll * CHEST_TABLE.length))] : id;

  let next: Profile = { ...profile, gems: profile.gems - item.price };
  next = grant(next, granted, now);
  return { profile: next, ok: true, granted };
}

/** Applies an item's effect. Split out so a chest and a direct buy agree. */
export function grant(profile: Profile, id: ShopItemId, now = new Date()): Profile {
  switch (id) {
    case 'streakSaver':
      return {
        ...profile,
        freezes: profile.freezes + 1,
        inventory: { ...profile.inventory, streakSaver: profile.inventory.streakSaver + 1 },
      };
    case 'superBoost':
      return {
        ...profile,
        boostLessons: profile.boostLessons + BOOST_LESSONS,
        inventory: { ...profile.inventory, superBoost: profile.inventory.superBoost + 1 },
      };
    case 'lessonSkip':
      return {
        ...profile,
        inventory: { ...profile.inventory, lessonSkip: profile.inventory.lessonSkip + 1 },
      };
    case 'instantXp': {
      const date = todayKey(now);
      const days = [...profile.days];
      const idx = days.findIndex((d) => d.date === date);
      const record = idx >= 0 ? { ...days[idx] } : { date, xp: 0, lessons: 0, correct: 0, answered: 0, seconds: 0 };
      record.xp += INSTANT_XP;
      if (idx >= 0) days[idx] = record;
      else days.push(record);
      return { ...profile, xp: profile.xp + INSTANT_XP, days };
    }
    default:
      return profile;
  }
}

/**
 * Opens a chest won from a quest. Same table as the shop's chest, but free —
 * the gems were the quest.
 */
export function openQuestChest(profile: Profile, roll = Math.random(), now = new Date()): Purchase {
  if (profile.inventory.chest <= 0) {
    return { profile, ok: false, granted: null, reason: 'No chests to open.' };
  }
  const granted = CHEST_TABLE[Math.min(CHEST_TABLE.length - 1, Math.floor(roll * CHEST_TABLE.length))];
  const opened: Profile = {
    ...profile,
    inventory: { ...profile.inventory, chest: profile.inventory.chest - 1 },
  };
  return { profile: grant(opened, granted, now), ok: true, granted };
}

/**
 * Spends a Lesson Skip on a skill: it is credited as passed, and the XP for a
 * clean lesson is paid out. The practice is genuinely skipped — the concepts
 * are marked as seen, so the scheduler will still bring them round for review
 * rather than pretending they were learned properly.
 */
export function spendLessonSkip(profile: Profile, skill: Skill, now = new Date()): Profile {
  if (profile.inventory.lessonSkip <= 0) return profile;
  const concepts = { ...profile.concepts };
  for (const concept of skill.concepts) {
    const before = memoryFor(profile, concept);
    concepts[concept] = {
      ...before,
      seen: Math.max(2, before.seen),
      correct: Math.max(2, before.correct),
      strength: Math.max(0.8, before.strength),
      interval: Math.max(3, before.interval),
      dueLesson: profile.lessonIndex + 3,
      lastLesson: profile.lessonIndex,
      streak: Math.max(1, before.streak),
    };
  }

  const date = todayKey(now);
  const days = [...profile.days];
  const idx = days.findIndex((d) => d.date === date);
  const record = idx >= 0 ? { ...days[idx] } : { date, xp: 0, lessons: 0, correct: 0, answered: 0, seconds: 0 };
  record.xp += XP_LESSON_BONUS;
  record.lessons += 1;
  if (idx >= 0) days[idx] = record;
  else days.push(record);

  return {
    ...profile,
    concepts,
    days,
    xp: profile.xp + XP_LESSON_BONUS,
    lessonIndex: profile.lessonIndex + 1,
    skillProgress: { ...profile.skillProgress, [skill.id]: (profile.skillProgress[skill.id] ?? 0) + 1 },
    inventory: { ...profile.inventory, lessonSkip: profile.inventory.lessonSkip - 1 },
  };
}

/** XP earned today, for the daily-goal ring. */
export function xpToday(profile: Profile, now = new Date()): number {
  return profile.days.find((d) => d.date === todayKey(now))?.xp ?? 0;
}

/** Streak status without mutating anything — the home screen reads this. */
export function streakState(profile: Profile, now = new Date()): 'active' | 'at-risk' | 'broken' | 'none' {
  if (!profile.lastActiveDate || profile.streak === 0) return 'none';
  const gap = daysBetween(profile.lastActiveDate, todayKey(now));
  if (gap === 0) return 'active';
  if (gap === 1) return 'at-risk';
  if (gap === 2 && profile.freezes > 0) return 'at-risk';
  return 'broken';
}

/** Rolls a broken streak back to zero on load, so the UI never lies. */
export function reconcileStreak(profile: Profile, now = new Date()): Profile {
  if (streakState(profile, now) !== 'broken') return profile;
  return { ...profile, streak: 0 };
}

export function levelFromXp(xp: number): { level: number; into: number; needed: number } {
  // Each level costs a little more than the last; level 10 is about 4,500 XP.
  let level = 1;
  let remaining = xp;
  let cost = 100;
  while (remaining >= cost) {
    remaining -= cost;
    level += 1;
    cost = Math.round(cost * 1.18);
  }
  return { level, into: remaining, needed: cost };
}

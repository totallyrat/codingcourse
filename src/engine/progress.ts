import { clearMistake, memoryFor, queueMistake, reviewConcept } from './scheduler';
import type { AnswerOutcome, Course, Exercise, Profile, SkillId } from './types';

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
    days: [],
    settings: {
      hearts: true,
      sound: true,
      dailyGoalXp: 60,
      reduceMotion: false,
      fontScale: 1,
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
  xpEarned: number;
  skillId: SkillId;
  newCrowns: SkillId[];
}

/** Applies end-of-lesson bookkeeping: XP, the streak, the day log. */
export function completeLesson(
  profile: Profile,
  summary: Omit<LessonSummary, 'xpEarned' | 'newCrowns'>,
  now = new Date(),
): { profile: Profile; xpEarned: number } {
  const xpEarned =
    summary.correct * XP_PER_CORRECT + XP_LESSON_BONUS + (summary.perfect ? XP_PERFECT_BONUS : 0);

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

  return {
    profile: {
      ...profile,
      xp: profile.xp + xpEarned,
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

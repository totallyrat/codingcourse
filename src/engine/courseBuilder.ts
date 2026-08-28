import type {
  Course,
  CourseUnit,
  Experience,
  Goal,
  Interest,
  Skill,
  SkillId,
  Track,
  TrackId,
  WizardAnswers,
} from './types';

/* ============================================================================
   Course construction.

   Two jobs live here:

   a) Ranking tracks against what somebody just told the wizard, so the app can
      say "these three fit you, and here is why" instead of dumping a grid of
      logos on them.

   b) Turning the chosen track's skill graph into an ordered syllabus. That is
      a topological sort of the prerequisite DAG, with the *free* choices at
      each step broken by a fit score. Two people picking Python get the same
      skills in a different order and reach the parts they came for sooner.

   Every number below is a weight in a scoring function. No model, no service.
   ========================================================================== */

const EXPERIENCE_RANK: Record<Experience, number> = { none: 0, some: 1, confident: 2, pro: 3 };

export interface TrackScore {
  track: Track;
  score: number;
  reasons: string[];
  /** Set when the track is a stretch for the stated experience level. */
  caution?: string;
}

export interface RecommendationInput {
  goal: Goal;
  experience: Experience;
  interests: Interest[];
  priorLanguages: TrackId[];
  minutesPerDay: number;
}

/**
 * Ranks every track for one person. Scores are normalised to roughly 0..1 so
 * the wizard can show a "fit" percentage that means something.
 */
export function recommendTracks(tracks: Track[], input: RecommendationInput): TrackScore[] {
  const scored = tracks.map((track) => {
    const reasons: string[] = [];
    let score = 0;

    // --- goal alignment: the single strongest signal (0.40) ----------------
    if (track.goals.includes(input.goal)) {
      score += 0.4;
      reasons.push(`Built for ${GOAL_LABEL[input.goal].toLowerCase()}`);
    } else if (input.goal === 'curious') {
      score += 0.22;
    } else {
      // Adjacent goals still count for something.
      const adjacency = ADJACENT_GOALS[input.goal] ?? [];
      if (track.goals.some((g) => adjacency.includes(g))) {
        score += 0.16;
        reasons.push('Adjacent to what you want to build');
      }
    }

    // --- interest overlap (0.22) -------------------------------------------
    const overlap = input.interests.filter((i) => track.tags.includes(i));
    if (overlap.length) {
      score += Math.min(0.22, 0.09 * overlap.length);
      reasons.push(`Matches your interest in ${overlap.map((o) => INTEREST_LABEL[o]).join(' and ')}`);
    }

    // --- slope vs experience (0.20) ----------------------------------------
    // A steep track handed to a beginner is the fastest way to lose them; an
    // easy track handed to a professional is the fastest way to bore them.
    const rank = EXPERIENCE_RANK[input.experience];
    const idealSlope = 1.6 + rank * 1.05;
    const mismatch = Math.abs(track.slope - idealSlope);
    const slopeScore = Math.max(0, 0.2 - mismatch * 0.062);
    score += slopeScore;
    let caution: string | undefined;
    if (track.slope - idealSlope >= 1.6) {
      caution = 'Steep for where you said you are — doable, but expect slower going.';
    } else if (idealSlope - track.slope >= 1.6 && rank >= 2) {
      reasons.push('You should move through the early units quickly');
    }

    // --- transfer from languages already known (0.18) ----------------------
    const transfers = (track.transfersFrom ?? []).filter((t) => input.priorLanguages.includes(t));
    if (transfers.length) {
      score += Math.min(0.18, 0.1 * transfers.length);
      reasons.push(`Your ${transfers.map(niceName).join(' and ')} experience carries over`);
    }
    if (input.priorLanguages.includes(track.id)) {
      // Already knows it: still fine to sharpen, but not the top suggestion.
      score -= 0.12;
      reasons.push('You already listed this one — good for filling gaps');
    }

    // --- time budget realism (up to 0.08 penalty) --------------------------
    if (input.minutesPerDay <= 10 && track.slope >= 4) {
      score -= 0.08;
      reasons.push('Heavy going for 10 minutes a day');
    }

    return { track, score: Math.max(0, Math.min(1, score)), reasons: reasons.slice(0, 3), caution };
  });

  return scored.sort((a, b) => b.score - a.score || a.track.name.localeCompare(b.track.name));
}

/* -------------------------------------------------------------- syllabus */

function skillFit(skill: Skill, answers: WizardAnswers): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0.5;

  const overlap = skill.tags.filter((t) => answers.interests.includes(t));
  if (overlap.length) {
    score += 0.12 * overlap.length;
    reasons.push(`matches ${overlap.map((o) => INTEREST_LABEL[o]).join(', ')}`);
  }
  if (GOAL_TAGS[answers.goal]?.some((t) => skill.tags.includes(t))) {
    score += 0.2;
    reasons.push(`serves your ${GOAL_LABEL[answers.goal].toLowerCase()} goal`);
  }

  const rank = EXPERIENCE_RANK[answers.experience];
  if (skill.level === 'intro') {
    // Fundamentals never get dropped, they just stop being the headline.
    score += rank === 0 ? 0.25 : rank === 1 ? 0.05 : -0.15;
    if (rank === 0) reasons.push('foundation you need first');
  }
  if (skill.level === 'advanced') {
    score += rank >= 2 ? 0.14 : -0.2;
    if (rank >= 2) reasons.push('depth you are ready for');
  }
  if (skill.level === 'applied') {
    score += 0.08;
  }

  return { score: Math.max(0, score), reasons };
}

/**
 * Kahn's algorithm over the prerequisite graph, choosing the best-fitting
 * skill among those currently unblocked. Cycles (a content bug) degrade to
 * appending the remaining skills in authored order rather than throwing —
 * a broken course is still better than a blank screen.
 */
export function orderSyllabus(
  track: Track,
  answers: WizardAnswers,
): { order: SkillId[]; rationale: Course['rationale'] } {
  const byId = new Map(track.skills.map((s) => [s.id, s]));
  const indegree = new Map<SkillId, number>();
  const dependents = new Map<SkillId, SkillId[]>();

  for (const skill of track.skills) {
    const deps = skill.requires.filter((r) => byId.has(r));
    indegree.set(skill.id, deps.length);
    for (const dep of deps) {
      dependents.set(dep, [...(dependents.get(dep) ?? []), skill.id]);
    }
  }

  const fitCache = new Map<SkillId, { score: number; reasons: string[] }>();
  const fit = (id: SkillId) => {
    if (!fitCache.has(id)) fitCache.set(id, skillFit(byId.get(id)!, answers));
    return fitCache.get(id)!;
  };

  const ready = track.skills.filter((s) => (indegree.get(s.id) ?? 0) === 0).map((s) => s.id);
  const order: SkillId[] = [];
  const rationale: Course['rationale'] = [];

  while (ready.length) {
    // Among everything unblocked, take the best fit. Ties fall back to
    // authored order, which is the content designer's own judgement.
    ready.sort((a, b) => {
      const diff = fit(b).score - fit(a).score;
      if (Math.abs(diff) > 0.001) return diff;
      return track.skills.findIndex((s) => s.id === a) - track.skills.findIndex((s) => s.id === b);
    });
    const next = ready.shift()!;
    order.push(next);
    const f = fit(next);
    rationale.push({ skillId: next, score: Number(f.score.toFixed(3)), reasons: f.reasons });

    for (const dep of dependents.get(next) ?? []) {
      const remaining = (indegree.get(dep) ?? 1) - 1;
      indegree.set(dep, remaining);
      if (remaining === 0) ready.push(dep);
    }
  }

  if (order.length < track.skills.length) {
    for (const skill of track.skills) {
      if (!order.includes(skill.id)) {
        order.push(skill.id);
        rationale.push({ skillId: skill.id, score: 0, reasons: ['appended — prerequisite cycle in content'] });
      }
    }
  }

  return { order, rationale };
}

/** Groups the ordered syllabus into units, using the authored unit names. */
export function buildUnits(track: Track, order: SkillId[]): CourseUnit[] {
  const byId = new Map(track.skills.map((s) => [s.id, s]));
  const units: CourseUnit[] = [];
  for (const id of order) {
    const skill = byId.get(id);
    if (!skill) continue;
    const last = units[units.length - 1];
    // Reordering can interleave units; a unit is re-opened rather than merged
    // so the map still reads top-to-bottom in the order you will study it.
    if (last && last.title === skill.unit) {
      last.skillIds.push(id);
    } else {
      units.push({ id: `${track.id}-u${units.length + 1}`, title: skill.unit, skillIds: [id] });
    }
  }
  return units;
}

/**
 * Skills an experienced learner should not be made to grind through from zero.
 * They are still tested — the placement check-up in lesson one draws from them
 * — but they start pre-credited instead of locked.
 */
export function placementSkips(track: Track, answers: WizardAnswers): SkillId[] {
  const rank = EXPERIENCE_RANK[answers.experience];
  if (rank === 0) return [];
  const transfers = (track.transfersFrom ?? []).some((t) => answers.priorLanguages.includes(t));
  const depth = rank === 1 ? (transfers ? 1 : 0) : rank === 2 ? (transfers ? 2 : 1) : 2;
  if (depth === 0) return [];
  const levels: Array<Skill['level']> = depth === 1 ? ['intro'] : ['intro', 'core'];
  return track.skills.filter((s) => levels.includes(s.level)).map((s) => s.id);
}

export function buildCourse(track: Track, answers: WizardAnswers): Course {
  const { order, rationale } = orderSyllabus(track, answers);
  return {
    trackId: track.id,
    syllabus: order,
    units: buildUnits(track, order),
    rationale,
    placed: placementSkips(track, answers),
    createdAt: Date.now(),
    answers,
  };
}

/** Items per lesson, from the daily time budget. Kept honest at both ends. */
export function slotsForBudget(minutesPerDay: number): number {
  const perItemSeconds = 34;
  return Math.max(7, Math.min(18, Math.round((minutesPerDay * 60) / perItemSeconds)));
}

/* --------------------------------------------------------------- labels */

export const GOAL_LABEL: Record<Goal, string> = {
  games: 'Making games',
  web: 'Building for the web',
  apps: 'Building apps and tools',
  data: 'Working with data',
  automation: 'Automating boring work',
  systems: 'Low-level and systems work',
  interviews: 'Passing technical interviews',
  curious: 'Just curious',
};

export const INTEREST_LABEL: Record<Interest, string> = {
  games: 'games',
  web: 'the web',
  apps: 'apps',
  data: 'data',
  automation: 'automation',
  systems: 'systems',
  graphics: 'graphics',
  interviews: 'interviews',
};

const ADJACENT_GOALS: Record<Goal, Goal[]> = {
  games: ['systems', 'apps'],
  web: ['apps', 'data'],
  apps: ['web', 'games'],
  data: ['automation', 'web'],
  automation: ['data', 'apps'],
  systems: ['games', 'apps'],
  interviews: ['apps', 'data'],
  curious: ['web', 'apps', 'games', 'data'],
};

const GOAL_TAGS: Record<Goal, Interest[]> = {
  games: ['games', 'graphics'],
  web: ['web'],
  apps: ['apps'],
  data: ['data'],
  automation: ['automation'],
  systems: ['systems'],
  interviews: ['interviews'],
  curious: [],
};

const NICE_NAMES: Record<string, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  cpp: 'C++',
  csharp: 'C#',
  rust: 'Rust',
  go: 'Go',
  sql: 'SQL',
  web: 'HTML & CSS',
  ue5: 'Unreal Engine',
  unity: 'Unity',
  godot: 'Godot',
  git: 'Git',
};

export function niceName(id: TrackId): string {
  return NICE_NAMES[id] ?? id;
}

import type { Exercise, Skill, SkillId, Track, TrackId } from '@/engine/types';
import { pythonTrack, pythonExercises } from './tracks/python';
import { javascriptTrack, javascriptExercises } from './tracks/javascript';
import { typescriptTrack, typescriptExercises } from './tracks/typescript';
import { webTrack, webExercises } from './tracks/web';
import { cppTrack, cppExercises } from './tracks/cpp';
import { csharpTrack, csharpExercises } from './tracks/csharp';
import { rustTrack, rustExercises } from './tracks/rust';
import { goTrack, goExercises } from './tracks/go';
import { sqlTrack, sqlExercises } from './tracks/sql';
import { ue5Track, ue5Exercises } from './tracks/ue5';
import { unityTrack, unityExercises } from './tracks/unity';
import { godotTrack, godotExercises } from './tracks/godot';
import { gitTrack, gitExercises } from './tracks/git';

/**
 * The whole library, assembled once at module load.
 *
 * Nothing here is fetched, generated or personalised — it is a fixed corpus
 * that ships inside the app. Everything adaptive happens in src/engine, which
 * only ever reads from these arrays.
 */
export const TRACKS: Track[] = [
  pythonTrack,
  javascriptTrack,
  typescriptTrack,
  webTrack,
  cppTrack,
  csharpTrack,
  rustTrack,
  goTrack,
  sqlTrack,
  ue5Track,
  unityTrack,
  godotTrack,
  gitTrack,
];

const EXERCISES_BY_TRACK: Record<TrackId, Exercise[]> = {
  python: pythonExercises,
  javascript: javascriptExercises,
  typescript: typescriptExercises,
  web: webExercises,
  cpp: cppExercises,
  csharp: csharpExercises,
  rust: rustExercises,
  go: goExercises,
  sql: sqlExercises,
  ue5: ue5Exercises,
  unity: unityExercises,
  godot: godotExercises,
  git: gitExercises,
};

export function trackById(id: TrackId): Track | undefined {
  return TRACKS.find((t) => t.id === id);
}

export function exercisesForTrack(id: TrackId): Exercise[] {
  return EXERCISES_BY_TRACK[id] ?? [];
}

let flattened: Exercise[] | null = null;
export function allExercises(): Exercise[] {
  flattened ??= TRACKS.flatMap((t) => EXERCISES_BY_TRACK[t.id] ?? []);
  return flattened;
}

export function skillById(trackId: TrackId, skillId: SkillId): Skill | undefined {
  return trackById(trackId)?.skills.find((s) => s.id === skillId);
}

/**
 * Human-readable names for concept ids, derived from the id itself. Content
 * files never repeat a display name for a concept, so this is the one place
 * that turns `py.fstrings` into "F-strings" for the stats screen.
 */
const CONCEPT_OVERRIDES: Record<string, string> = {
  'py.fstrings': 'F-strings',
  'py.strmethods': 'String methods',
  'py.listmethods': 'List methods',
  'py.dictmethods': 'Dictionary methods',
  'py.loopcontrol': 'Break and continue',
  'js.mapfilter': 'Map and filter',
  'js.arraymethods': 'Array methods',
  'js.forof': 'for...of',
  'js.dom': 'The DOM',
  'ts.fnTypes': 'Function types',
  'ts.strictnull': 'Strict null checks',
  'ue5.bpbasics': 'Blueprint basics',
  'ue5.bpvars': 'Blueprint variables',
  'ue5.bploops': 'Blueprint loops',
  'ue5.bpfunctions': 'Blueprint functions',
  'ue5.perf': 'Performance',
  'un.getcomponent': 'GetComponent',
  'un.lifecycle': 'MonoBehaviour lifecycle',
  'gd.tree': 'The scene tree',
  'sql.groupby': 'GROUP BY',
  'sql.having': 'HAVING',
  'sql.null': 'NULL handling',
  'git.undo': 'Undoing changes',
  'go.zero': 'Zero values',
  'rs.question': 'The ? operator',
  'cpp.smartptr': 'Smart pointers',
  'cpp.stackheap': 'Stack and heap',
  'cpp.rangefor': 'Range-based for',
  'cs.expressionbody': 'Expression-bodied members',
  'cs.interpolation': 'String interpolation',
  'web.a11y': 'Accessibility',
  'web.boxmodel': 'The box model',
};

export function conceptLabel(concept: string): string {
  if (CONCEPT_OVERRIDES[concept]) return CONCEPT_OVERRIDES[concept];
  const tail = concept.split('.').slice(1).join(' ');
  if (!tail) return concept;
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

/** Total element count, shown in the wizard so the claim is checkable. */
export const LIBRARY_SIZE = allExercises().length;

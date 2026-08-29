import type { Exercise, Skill, SkillId, Track, TrackId } from '@/engine/types';
import { pythonTrack, pythonExercises } from './tracks/python';
import { pythonExtra, pythonExtraSkills } from './tracks/python.extra';
import { javascriptTrack, javascriptExercises } from './tracks/javascript';
import { javascriptExtra, javascriptExtraSkills } from './tracks/javascript.extra';
import { typescriptTrack, typescriptExercises } from './tracks/typescript';
import { typescriptExtra, typescriptExtraSkills } from './tracks/typescript.extra';
import { webTrack, webExercises } from './tracks/web';
import { webExtra, webExtraSkills } from './tracks/web.extra';
import { cppTrack, cppExercises } from './tracks/cpp';
import { cppExtra, cppExtraSkills } from './tracks/cpp.extra';
import { csharpTrack, csharpExercises } from './tracks/csharp';
import { csharpExtra, csharpExtraSkills } from './tracks/csharp.extra';
import { rustTrack, rustExercises } from './tracks/rust';
import { rustExtra, rustExtraSkills } from './tracks/rust.extra';
import { goTrack, goExercises } from './tracks/go';
import { goExtra, goExtraSkills } from './tracks/go.extra';
import { sqlTrack, sqlExercises } from './tracks/sql';
import { sqlExtra, sqlExtraSkills } from './tracks/sql.extra';
import { ue5Track, ue5Exercises } from './tracks/ue5';
import { ue5Extra, ue5ExtraSkills } from './tracks/ue5.extra';
import { unityTrack, unityExercises } from './tracks/unity';
import { unityExtra, unityExtraSkills } from './tracks/unity.extra';
import { godotTrack, godotExercises } from './tracks/godot';
import { godotExtra, godotExtraSkills } from './tracks/godot.extra';
import { gitTrack, gitExercises } from './tracks/git';
import { gitExtra, gitExtraSkills } from './tracks/git.extra';

/**
 * The whole library, assembled once at module load.
 *
 * Nothing here is fetched, generated or personalised — it is a fixed corpus
 * that ships inside the app. Everything adaptive happens in src/engine, which
 * only ever reads from these arrays.
 */
/**
 * A track plus whatever its `.extra` file adds. Keeping the additions in their
 * own file means the original course files stay readable, and a track can grow
 * a new unit without anybody rewriting the one that already works.
 */
function withExtras(track: Track, extraSkills: Skill[] = []): Track {
  return extraSkills.length ? { ...track, skills: [...track.skills, ...extraSkills] } : track;
}

export const TRACKS: Track[] = [
  withExtras(pythonTrack, pythonExtraSkills),
  withExtras(javascriptTrack, javascriptExtraSkills),
  withExtras(typescriptTrack, typescriptExtraSkills),
  withExtras(webTrack, webExtraSkills),
  withExtras(cppTrack, cppExtraSkills),
  withExtras(csharpTrack, csharpExtraSkills),
  withExtras(rustTrack, rustExtraSkills),
  withExtras(goTrack, goExtraSkills),
  withExtras(sqlTrack, sqlExtraSkills),
  withExtras(ue5Track, ue5ExtraSkills),
  withExtras(unityTrack, unityExtraSkills),
  withExtras(godotTrack, godotExtraSkills),
  withExtras(gitTrack, gitExtraSkills),
];

const EXERCISES_BY_TRACK: Record<TrackId, Exercise[]> = {
  python: [...pythonExercises, ...pythonExtra],
  javascript: [...javascriptExercises, ...javascriptExtra],
  typescript: [...typescriptExercises, ...typescriptExtra],
  web: [...webExercises, ...webExtra],
  cpp: [...cppExercises, ...cppExtra],
  csharp: [...csharpExercises, ...csharpExtra],
  rust: [...rustExercises, ...rustExtra],
  go: [...goExercises, ...goExtra],
  sql: [...sqlExercises, ...sqlExtra],
  ue5: [...ue5Exercises, ...ue5Extra],
  unity: [...unityExercises, ...unityExtra],
  godot: [...godotExercises, ...godotExtra],
  git: [...gitExercises, ...gitExtra],
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
  'py.venv': 'Virtual environments',
  'py.json': 'JSON',
  'py.csv': 'CSV files',
  'js.npm': 'npm',
  'cpp.raii': 'RAII',
  'cpp.rule5': 'The rule of five',
  'cpp.cmake': 'CMake',
  'cs.linq': 'LINQ',
  'rs.mut': 'Mutability',
  'rs.impl': 'impl blocks',
  'go.fmt': 'The fmt package',
  'sql.cte': 'Common table expressions',
  'ue5.exec': 'Execution wires',
  'ue5.umg': 'UMG',
  'ue5.hud': 'HUDs',
  'ue5.pintypes': 'Pin types',
  'ue5.getset': 'Get and Set',
  'ue5.purefn': 'Pure functions',
  'ue5.macros': 'Macros and loops',
  'ue5.timeline': 'Timelines',
  'ue5.delay': 'Delay and retriggering',
  'ue5.cast': 'Casting',
  'ue5.datatables': 'Data tables',
  'git.pr': 'Pull requests',
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

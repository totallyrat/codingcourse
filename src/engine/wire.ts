import type { PinSpec, PinType } from './types';

/**
 * Pin rules for the node-graph element, shared by the player and by the
 * content tests so an authored Blueprint graph is held to the same rules the
 * learner is.
 *
 * A pin may be written as a bare string in content that predates types; those
 * behave the way they always did — `exec` is execution flow, everything else
 * accepts anything.
 */

export interface Pin {
  name: string;
  type: PinType;
}

export function pinOf(spec: PinSpec): Pin {
  if (typeof spec !== 'string') return spec;
  return { name: spec, type: spec === 'exec' ? 'exec' : 'wildcard' };
}

/** Content-facing pin id, `nodeId:label`. Links are always out -> in. */
export function pinId(nodeId: string, spec: PinSpec): string {
  return `${nodeId}:${pinOf(spec).name}`;
}

/**
 * Exec never joins data, and a typed pin only joins its own type — except for
 * the two conversions Unreal inserts silently, which we allow for the same
 * reason it does: refusing them would teach a rule the real editor does not
 * have.
 */
export function pinsCompatible(from: PinType, to: PinType): boolean {
  if (from === 'exec' || to === 'exec') return from === to;
  if (from === 'wildcard' || to === 'wildcard') return true;
  if (from === 'float' && to === 'string') return true;
  if (from === 'int' && to === 'float') return true;
  return from === to;
}

import type { ReactNode } from 'react';
import type { AvatarConfig } from '@/engine/types';
import type { Species } from './Mascot';

/* ============================================================================
   Your own creature.

   Five axes — silhouette, colour, face, what is on its head, what it is
   wearing — assembled into the same Species shape the cast uses, so a made-up
   character runs on exactly the same rig as Bit: same spring, same blink, same
   squash and stretch. Nothing here is a separate drawing path.
   ========================================================================== */

export type HeadShape = AvatarConfig['head'];
export type EyeStyle = AvatarConfig['eyes'];
export type MouthStyle = AvatarConfig['mouth'];
export type CrownStyle = AvatarConfig['crown'];
export type ArmStyle = AvatarConfig['arms'];
export type OutfitStyle = AvatarConfig['outfit'];
export type { AvatarConfig };

export const AVATAR_COLOURS = [
  '#ffffff',
  '#7ef0b2',
  '#f6c66b',
  '#ff8080',
  '#8fd8ff',
  '#c9a6ff',
  '#ffb066',
  '#a6f0e0',
  '#ff9ecb',
  '#c9c9d4',
];

export const DEFAULT_AVATAR: AvatarConfig = {
  name: 'Mine',
  head: 'round',
  colour: '#7ef0b2',
  eyes: 'round',
  mouth: 'smile',
  crown: 'caret',
  arms: 'bracket',
  outfit: 'none',
  outfitColour: '#ffffff',
};

const HEADS: Record<HeadShape, { x: number; y: number; w: number; h: number; rx: number }> = {
  round: { x: 61, y: 114, w: 78, h: 74, rx: 37 },
  square: { x: 64, y: 114, w: 72, h: 74, rx: 12 },
  tall: { x: 71, y: 108, w: 58, h: 82, rx: 22 },
  wide: { x: 56, y: 120, w: 88, h: 64, rx: 20 },
  blob: { x: 60, y: 112, w: 80, h: 78, rx: 30 },
};

/**
 * Dark ink on a light body, light ink on a dark one. Faces have to read at
 * 40 pixels, and a mid-grey mouth on a mid-green head does not.
 */
export function inkFor(colour: string): string {
  const hex = colour.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#0b0b10' : '#ffffff';
}

function outfitShapes(config: AvatarConfig, head: { x: number; y: number; w: number; h: number }): ReactNode {
  const bottom = head.y + head.h;
  const centre = 100;
  switch (config.outfit) {
    case 'scarf':
      return (
        <>
          <rect x={head.x + 4} y={bottom - 16} width={head.w - 8} height="11" rx="5" fill={config.outfitColour} />
          <path
            d={`M ${centre + 10} ${bottom - 8} l 8 22 l -12 -4 z`}
            fill={config.outfitColour}
            opacity="0.9"
          />
        </>
      );
    case 'tie':
      return (
        <>
          <path d={`M ${centre - 7} ${bottom - 14} h 14 l -7 8 z`} fill={config.outfitColour} />
          <path d={`M ${centre} ${bottom - 6} l 7 12 l -7 8 l -7 -8 z`} fill={config.outfitColour} />
        </>
      );
    case 'collar':
      return (
        <path
          d={`M ${centre - 20} ${bottom - 14} l 20 14 l 20 -14 l 6 8 l -26 16 l -26 -16 z`}
          fill={config.outfitColour}
          opacity="0.95"
        />
      );
    case 'cape':
      return null; // drawn behind, see capeBehind
    default:
      return null;
  }
}

function crownShapes(config: AvatarConfig): ReactNode {
  if (config.crown !== 'horns') return null;
  return (
    <>
      <path d="M70 118 C 60 104, 62 96, 72 92 C 70 102, 74 110, 80 116 z" fill={config.colour} />
      <path d="M130 118 C 140 104, 138 96, 128 92 C 130 102, 126 110, 120 116 z" fill={config.colour} />
    </>
  );
}

/** Turns a saved configuration into something the mascot rig can draw. */
export function avatarSpecies(config: AvatarConfig): Species {
  const head = HEADS[config.head];
  const ink = inkFor(config.colour);
  const eyeScale = config.eyes === 'wide' ? 1.3 : config.eyes === 'sleepy' ? 0.72 : 1;

  return {
    id: 'bit',
    name: config.name || 'Mine',
    blurb: 'Yours.',
    body: config.colour,
    ink,
    edge: config.colour,
    head,
    crown: config.crown === 'caret' ? 'caret' : config.crown === 'leaf' ? 'leaf' : config.crown === 'bulb' ? 'bulb' : 'none',
    arms: config.arms,
    eyeScale,
    mouthStyle: config.mouth,
    behind:
      config.outfit === 'cape' ? (
        <path
          d={`M ${head.x + 6} ${head.y + 18} q -26 46 -6 68 h ${head.w - 12} q 20 -22 -6 -68 z`}
          fill={config.outfitColour}
          opacity="0.9"
        />
      ) : null,
    front: (
      <>
        {crownShapes(config)}
        {config.eyes === 'visor' ? (
          <rect x={head.x + 8} y="136" width={head.w - 16} height="20" rx="10" fill={ink} opacity="0.92" />
        ) : null}
        {outfitShapes(config, head)}
      </>
    ),
  };
}

const HEAD_LIST: HeadShape[] = ['round', 'square', 'tall', 'wide', 'blob'];
const EYE_LIST: EyeStyle[] = ['round', 'wide', 'sleepy', 'visor'];
const MOUTH_LIST: MouthStyle[] = ['smile', 'flat', 'oh'];
const CROWN_LIST: CrownStyle[] = ['none', 'caret', 'leaf', 'bulb', 'horns'];
const ARM_LIST: ArmStyle[] = ['bracket', 'mitt', 'none'];
const OUTFIT_LIST: OutfitStyle[] = ['none', 'scarf', 'tie', 'collar', 'cape'];

export const AVATAR_OPTIONS = {
  head: HEAD_LIST,
  eyes: EYE_LIST,
  mouth: MOUTH_LIST,
  crown: CROWN_LIST,
  arms: ARM_LIST,
  outfit: OUTFIT_LIST,
  colour: AVATAR_COLOURS,
};

export function randomAvatar(rand: () => number = Math.random): AvatarConfig {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  return {
    name: DEFAULT_AVATAR.name,
    head: pick(HEAD_LIST),
    colour: pick(AVATAR_COLOURS),
    eyes: pick(EYE_LIST),
    mouth: pick(MOUTH_LIST),
    crown: pick(CROWN_LIST),
    arms: pick(ARM_LIST),
    outfit: pick(OUTFIT_LIST),
    outfitColour: pick(AVATAR_COLOURS),
  };
}

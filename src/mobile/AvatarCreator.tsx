import { useState } from 'react';
import { Mascot } from '@/mascot/Mascot';
import {
  AVATAR_COLOURS,
  AVATAR_OPTIONS,
  DEFAULT_AVATAR,
  randomAvatar,
  type AvatarConfig,
} from '@/mascot/avatar';
import { haptic } from '@/lib/haptics';
import { tiltGaze } from './tilt';

/* ============================================================================
   Make your own.

   Every choice redraws the same creature immediately — there is no preview
   button, because the preview is the screen. What you build runs on the same
   rig as the cast, so it blinks, breathes and follows the phone exactly like
   they do.
   ========================================================================== */

const LABELS: Record<string, Record<string, string>> = {
  head: { round: 'Round', square: 'Boxy', tall: 'Tall', wide: 'Wide', blob: 'Blob' },
  eyes: { round: 'Round', wide: 'Wide', sleepy: 'Sleepy', visor: 'Visor' },
  mouth: { smile: 'Smile', flat: 'Flat', oh: 'Oh!' },
  crown: { none: 'Nothing', caret: 'Caret', leaf: 'Leaf', bulb: 'Bulb', horns: 'Horns' },
  arms: { bracket: 'Brackets', mitt: 'Mitts', none: 'None' },
  outfit: { none: 'None', scarf: 'Scarf', tie: 'Tie', collar: 'Collar', cape: 'Cape' },
};

export function AvatarCreator({
  initial,
  onSave,
  onCancel,
}: {
  initial: AvatarConfig | null;
  onSave: (avatar: AvatarConfig) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<AvatarConfig>(initial ?? DEFAULT_AVATAR);
  const [mood, setMood] = useState<'idle' | 'happy' | 'celebrate' | 'wave'>('wave');

  const set = <K extends keyof AvatarConfig>(key: K, value: AvatarConfig[K]) => {
    haptic('select');
    setDraft((d) => ({ ...d, [key]: value }));
  };

  return (
    <div className="creator">
      <div className="creator__stage">
        <Mascot
          custom={draft}
          mood={mood}
          size={190}
          trackPointer={false}
          gazeSource={tiltGaze}
          onPoke={() => setMood((m) => (m === 'celebrate' ? 'idle' : m === 'idle' ? 'happy' : 'celebrate'))}
        />
        <p className="creator__poke">Tap them.</p>
      </div>

      <label className="creator__name">
        <span>Name</span>
        <input
          value={draft.name}
          maxLength={16}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="Give them a name"
        />
      </label>

      <Row label="Colour">
        <div className="swatches">
          {AVATAR_COLOURS.map((colour) => (
            <button
              key={colour}
              type="button"
              className={`swatch${draft.colour === colour ? ' is-on' : ''}`}
              style={{ background: colour }}
              aria-label={colour}
              onClick={() => set('colour', colour)}
            />
          ))}
        </div>
      </Row>

      <Chips label="Head" value={draft.head} options={AVATAR_OPTIONS.head} onPick={(v) => set('head', v)} kind="head" />
      <Chips label="Eyes" value={draft.eyes} options={AVATAR_OPTIONS.eyes} onPick={(v) => set('eyes', v)} kind="eyes" />
      <Chips label="Mouth" value={draft.mouth} options={AVATAR_OPTIONS.mouth} onPick={(v) => set('mouth', v)} kind="mouth" />
      <Chips label="On top" value={draft.crown} options={AVATAR_OPTIONS.crown} onPick={(v) => set('crown', v)} kind="crown" />
      <Chips label="Arms" value={draft.arms} options={AVATAR_OPTIONS.arms} onPick={(v) => set('arms', v)} kind="arms" />
      <Chips label="Wearing" value={draft.outfit} options={AVATAR_OPTIONS.outfit} onPick={(v) => set('outfit', v)} kind="outfit" />

      {draft.outfit !== 'none' ? (
        <Row label="Outfit colour">
          <div className="swatches">
            {AVATAR_COLOURS.map((colour) => (
              <button
                key={colour}
                type="button"
                className={`swatch${draft.outfitColour === colour ? ' is-on' : ''}`}
                style={{ background: colour }}
                aria-label={colour}
                onClick={() => set('outfitColour', colour)}
              />
            ))}
          </div>
        </Row>
      ) : null}

      <div className="creator__actions">
        <button
          type="button"
          className="ghostbtn"
          onClick={() => {
            haptic('tap');
            setDraft((d) => ({ ...randomAvatar(), name: d.name }));
          }}
        >
          Surprise me
        </button>
        <button
          type="button"
          className="bigbtn"
          onClick={() => {
            haptic('win');
            onSave({ ...draft, name: draft.name.trim() || 'Mine' });
          }}
        >
          Save
        </button>
        <button type="button" className="ghostbtn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="creator__row">
      <span className="creator__label">{label}</span>
      {children}
    </section>
  );
}

function Chips<T extends string>({
  label,
  value,
  options,
  onPick,
  kind,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onPick: (value: T) => void;
  kind: string;
}) {
  return (
    <Row label={label}>
      <div className="chipscroll" data-noswipe>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`pickchip${value === option ? ' is-on' : ''}`}
            onClick={() => onPick(option)}
          >
            {LABELS[kind]?.[option] ?? option}
          </button>
        ))}
      </div>
    </Row>
  );
}

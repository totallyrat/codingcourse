import { useEffect, useRef, useState } from 'react';
import { type Quest, type QuestState } from '@/engine/quests';

/* ============================================================================
   The week's ten quests.

   Each is a bar, because that is the only thing worth showing: how far along
   it is. `animateFrom` is what makes the post-lesson replay work — the bars
   mount at their old values and are told to move a beat later, so you watch
   the lesson you just finished land on them.
   ========================================================================== */

export function Quests({
  state,
  animateFrom,
}: {
  state: QuestState | null;
  /** Quest id -> progress before the lesson, for the replay. */
  animateFrom?: Record<string, number>;
}) {
  if (!state) return null;

  return (
    <ul className="quests__list">
      {state.quests.map((quest, i) => (
        // The key carries the replay, so arriving here after a lesson mounts a
        // fresh row holding the old value — which is the only way the bar has
        // somewhere to travel from.
        <QuestRow
          key={`${quest.id}${animateFrom ? ':replay' : ''}`}
          quest={quest}
          from={animateFrom?.[quest.id]}
          index={i}
        />
      ))}
    </ul>
  );
}

function QuestRow({ quest, from, index }: { quest: Quest; from?: number; index: number }) {
  const target = Math.max(1, quest.target);
  const [value, setValue] = useState(from ?? quest.progress);
  const armed = useRef(false);

  useEffect(() => {
    if (from === undefined || armed.current) {
      setValue(quest.progress);
      return;
    }
    armed.current = true;
    // The bars go in order, a beat apart, so the eye can follow one at a time
    // rather than watching ten things twitch at once.
    const timer = setTimeout(() => setValue(quest.progress), 240 + index * 110);
    return () => clearTimeout(timer);
  }, [from, quest.progress, index]);

  const moved = from !== undefined && quest.progress > from;
  const pct = Math.min(1, value / target);

  return (
    <li className={`quest${quest.done ? ' is-done' : ''}${moved ? ' is-moving' : ''}`}>
      <div className="quest__row">
        <span className="quest__title">{quest.title}</span>
        <span className="quest__value">
          {quest.done ? (
            <span className="quest__won">
              <ChestPip />
              chest
            </span>
          ) : (
            <>
              {trim(value)}
              <em>/{trim(quest.target)}</em>
            </>
          )}
        </span>
      </div>
      <div className="quest__track">
        <span className="quest__fill" style={{ width: `${Math.max(pct * 100, pct > 0 ? 7 : 0)}%` }}>
          <i className="quest__shine" aria-hidden="true" />
        </span>
      </div>
    </li>
  );
}

function ChestPip() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
      <path d="M3 9a9 4.5 0 0 1 18 0v2H3z" fill="currentColor" />
      <rect x="3" y="11" width="18" height="9" rx="2" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

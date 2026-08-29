import { useEffect, useRef, useState } from 'react';
import { questsDone, type Quest, type QuestState } from '@/engine/quests';

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
  chests,
}: {
  state: QuestState | null;
  /** Quest id -> progress before the lesson, for the replay. */
  animateFrom?: Record<string, number>;
  chests?: number;
}) {
  if (!state) return null;
  const done = questsDone(state);

  return (
    <section className="quests">
      <header className="quests__head">
        <h4>This week&rsquo;s quests</h4>
        <span className="quests__count">
          {done} / {state.quests.length}
        </span>
      </header>
      {chests ? (
        <p className="quests__chests">
          {chests} chest{chests === 1 ? '' : 's'} waiting in the shop.
        </p>
      ) : null}
      <ul className="quests__list">
        {state.quests.map((quest) => (
          <QuestRow key={quest.id} quest={quest} from={animateFrom?.[quest.id]} />
        ))}
      </ul>
    </section>
  );
}

function QuestRow({ quest, from }: { quest: Quest; from?: number }) {
  const target = Math.max(1, quest.target);
  const [value, setValue] = useState(from ?? quest.progress);
  const armed = useRef(false);

  useEffect(() => {
    if (from === undefined || armed.current) {
      setValue(quest.progress);
      return;
    }
    armed.current = true;
    // One frame at the old value, then the new one, so the CSS transition has
    // something to animate between.
    const timer = setTimeout(() => setValue(quest.progress), 260);
    return () => clearTimeout(timer);
  }, [from, quest.progress]);

  const moved = from !== undefined && quest.progress > from;
  const pct = Math.min(1, value / target);

  return (
    <li className={`quest${quest.done ? ' is-done' : ''}${moved ? ' is-moving' : ''}`}>
      <div className="quest__row">
        <span className="quest__title">{quest.title}</span>
        <span className="quest__value">
          {quest.done ? 'Chest earned' : `${trim(value)} / ${trim(quest.target)}`}
        </span>
      </div>
      <div className="quest__track">
        <span className="quest__fill" style={{ width: `${pct * 100}%` }} />
      </div>
    </li>
  );
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

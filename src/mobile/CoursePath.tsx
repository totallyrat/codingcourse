import { useEffect, useMemo, useRef, useState } from 'react';
import { Mascot, type SpeciesId } from '@/mascot/Mascot';
import { haptic } from '@/lib/haptics';
import { tiltGaze } from './tilt';
import { conceptLabel, trackById } from '@/content';
import { activeSkill, isSkillUnlocked, skillMastery } from '@/engine/lessonComposer';
import { levelFor } from '@/engine/progress';
import { levelBlurb } from '@/engine/levels';
import type { Profile, Skill } from '@/engine/types';

/* ============================================================================
   The course, as a path.

   A vertical trail of big round nodes that weaves left and right, unit banners
   between the sections, and one of the cast standing beside the trail every
   few steps. Tapping a node opens a card over it — what the lesson is, where
   it sits, and a button to start — because on a phone the map and the detail
   have to be the same screen or you lose your place.
   ========================================================================== */

const WEAVE = 74; // how far the path swings from the centre, in pixels
const COMPANIONS: SpeciesId[] = ['pip', 'byte', 'nib', 'loop'];

/** How many lesson bubbles a skill is drawn as. */
const STEPS_PER_SKILL = 4;

interface NodeModel {
  key: string;
  skill: Skill;
  /** Which bubble of that skill this is, 0-based. */
  step: number;
  state: 'done' | 'current' | 'open' | 'locked';
  mastery: number;
  index: number;
  offset: number;
  trophy?: boolean;
}

export function CoursePath({
  profile,
  onStart,
  onSkip,
}: {
  profile: Profile;
  onStart: () => void;
  onSkip: (skill: Skill) => void;
}) {
  const course = profile.course!;
  const track = trackById(course.trackId)!;
  const current = activeSkill(profile, course, track);
  const ladder = levelFor(profile, track.id);
  const [open, setOpen] = useState<string | null>(null);
  const currentRef = useRef<HTMLDivElement>(null);

  const skills = useMemo(() => new Map(track.skills.map((s) => [s.id, s])), [track]);

  const units = useMemo(() => {
    let index = 0;
    let firstCurrentTaken = false;
    return course.units.map((unit) => {
      const unitSkills = unit.skillIds.map((id) => skills.get(id)).filter((s): s is Skill => !!s);
      const nodes: NodeModel[] = [];

      for (const skill of unitSkills) {
        const mastery = skillMastery(profile, skill);
        const unlocked = isSkillUnlocked(profile, course, track, skill.id);
        // A skill is several lessons of work, so it is drawn as several
        // bubbles — which is what makes the path a path rather than a list of
        // chapter headings.
        const filled = Math.min(STEPS_PER_SKILL, Math.round(mastery * STEPS_PER_SKILL));
        for (let step = 0; step < STEPS_PER_SKILL; step++) {
          const at = index++;
          let state: NodeModel['state'];
          if (step < filled) state = 'done';
          else if (!unlocked) state = 'locked';
          else if (skill.id === current.id && !firstCurrentTaken) {
            state = 'current';
            firstCurrentTaken = true;
          } else state = 'open';

          nodes.push({
            key: `${skill.id}-${step}`,
            skill,
            step,
            mastery,
            state,
            index: at,
            // A sine weave rather than a zig-zag: the path bends, it does not
            // bounce, and no node ever leaves the screen.
            offset: Math.round(Math.sin(at * 0.7) * WEAVE),
          });
        }
      }

      // A trophy closes every section, and only lights up once the section is done.
      const sectionDone = unitSkills.every((skill) => skillMastery(profile, skill) >= 0.75);
      const at = index++;
      nodes.push({
        key: `${unit.id}-trophy`,
        skill: unitSkills[unitSkills.length - 1] ?? unitSkills[0],
        step: STEPS_PER_SKILL,
        mastery: sectionDone ? 1 : 0,
        state: sectionDone ? 'done' : 'locked',
        index: at,
        offset: 0,
        trophy: true,
      });

      return { ...unit, nodes };
    });
  }, [course, track, profile, skills, current.id]);

  // Bring the node you are on into view when the screen first opens.
  useEffect(() => {
    const timer = setTimeout(() => {
      currentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 260);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNode = open ? units.flatMap((u) => u.nodes).find((n) => n.key === open) : null;

  return (
    <div className="path" onClick={() => setOpen(null)}>
      {units.map((unit, unitIndex) => (
        <section key={unit.id} className="path__unit">
          <header className="unitbanner">
            <div className="unitbanner__text">
              <span className="unitbanner__eyebrow">Section {unitIndex + 1}</span>
              <h3>{unit.title}</h3>
            </div>
            <span className="unitbanner__mark" aria-hidden="true">
              {track.mark}
            </span>
          </header>

          <div className="path__nodes">
            {unit.nodes.map((node) => (
              <div
                key={node.key}
                className="pathrow"
                style={{ transform: `translateX(${node.offset}px)` }}
                ref={node.state === 'current' ? currentRef : undefined}
              >
                <PathNode
                  node={node}
                  open={open === node.key}
                  onOpen={(e) => {
                    e.stopPropagation();
                    haptic('tap');
                    setOpen(open === node.key ? null : node.key);
                  }}
                />
                {node.index % 7 === 3 ? (
                  <span
                    className="path__friend"
                    style={{ transform: `translateX(${node.offset > 0 ? -110 : 110}px)` }}
                    aria-hidden="true"
                  >
                    <Mascot
                      species={COMPANIONS[(node.index / 2) % COMPANIONS.length]}
                      mood={node.state === 'done' ? 'happy' : 'idle'}
                      size={74}
                      trackPointer={false}
                      gazeSource={tiltGaze}
                    />
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}

      {openNode ? (
        <NodeCard
          node={openNode}
          profile={profile}
          ladderNote={levelBlurb(ladder)}
          onStart={() => {
            setOpen(null);
            onStart();
          }}
          onSkip={() => {
            setOpen(null);
            onSkip(openNode.skill);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}

      <p className="path__end">
        {course.units.length} sections · {course.syllabus.length} skills · keep going and it keeps growing.
      </p>
    </div>
  );
}

function PathNode({
  node,
  open,
  onOpen,
}: {
  node: NodeModel;
  open: boolean;
  onOpen: (e: React.MouseEvent) => void;
}) {
  const r = 33;
  const c = 2 * Math.PI * r;
  return (
    <button
      type="button"
      className={`pathnode is-${node.state}${open ? ' is-open' : ''}${node.trophy ? ' pathnode--trophy' : ''}`}
      onClick={onOpen}
      aria-label={`${node.skill.title}, ${Math.round(node.mastery * 100)} per cent`}
      aria-expanded={open}
    >
      {node.state === 'current' ? <span className="pathnode__start">Start</span> : null}
      <svg className="pathnode__ring" viewBox="0 0 76 76" aria-hidden="true">
        <circle cx="38" cy="38" r={r} className="pathnode__track" />
        <circle
          cx="38"
          cy="38"
          r={r}
          className="pathnode__value"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, node.mastery)))}
        />
      </svg>
      <span className="pathnode__face">
        {node.trophy ? (
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d="M7 4h10v4a5 5 0 0 1-10 0z" fill="currentColor" />
            <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M10 13h4v3h-4zM8 19h8v2H8z" fill="currentColor" />
          </svg>
        ) : node.state === 'done' ? (
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" fill="currentColor" />
          </svg>
        ) : node.state === 'locked' ? (
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect x="4" y="10" width="16" height="11" rx="2.5" fill="currentColor" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d="M8 5l11 7-11 7z" fill="currentColor" />
          </svg>
        )}
      </span>
    </button>
  );
}

function NodeCard({
  node,
  profile,
  ladderNote,
  onStart,
  onSkip,
  onClose,
}: {
  node: NodeModel;
  profile: Profile;
  ladderNote: string;
  onStart: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const { skill, state, mastery } = node;
  return (
    <div className="nodecard" role="dialog" aria-label={skill.title} onClick={(e) => e.stopPropagation()}>
      <span className="nodecard__arrow" aria-hidden="true" />
      <div className="nodecard__head">
        <h4>{node.trophy ? 'Section trophy' : skill.title}</h4>
        <button type="button" className="nodecard__close" aria-label="Close" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="nodecard__blurb">
        {node.trophy ? 'Finish every skill in this section to light it up.' : skill.blurb}
      </p>

      <div className="nodecard__meter">
        <span style={{ width: `${Math.round(mastery * 100)}%` }} />
      </div>
      <div className="nodecard__chips">
        <span className="chip">{Math.round(mastery * 100)}% known</span>
        <span className="chip">{skill.concepts.length} ideas</span>
        {state === 'done' ? <span className="chip chip--right">passed</span> : null}
      </div>
      <p className="nodecard__ideas">{skill.concepts.map((c) => conceptLabel(c)).join(' · ')}</p>

      {node.trophy || state === 'locked' ? (
        <p className="nodecard__locked">
          {node.trophy
            ? state === 'done'
              ? 'Section complete. The next one is already open.'
              : 'Not yet — keep going up the path.'
            : 'Finish the skills before this one and it opens.'}
        </p>
      ) : (
        <>
          <button type="button" className="bigbtn" onClick={onStart}>
            {state === 'done' ? 'Practise again' : `Lesson ${node.step + 1} of ${STEPS_PER_SKILL}`}
          </button>
          <p className="nodecard__note">{ladderNote}</p>
          {state === 'current' && profile.inventory.lessonSkip > 0 ? (
            <button type="button" className="nodecard__skip" onClick={onSkip}>
              Use a Lesson Skip ({profile.inventory.lessonSkip} left)
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

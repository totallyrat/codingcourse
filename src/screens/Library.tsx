import { useState } from 'react';
import { Button, Card, Chip, Modal } from '@/ui/primitives';
import { LIBRARY_SIZE, TRACKS, exercisesForTrack } from '@/content';
import { buildCourse } from '@/engine/courseBuilder';
import type { Course, Profile, Track } from '@/engine/types';

/**
 * Every track in the library, and the way to switch to one.
 *
 * Switching archives the current course rather than deleting it, and concept
 * memory is never wiped — coming back to Python after a month of Rust should
 * pick up where it left off, minus whatever has decayed.
 */
export function Library({
  profile,
  onSwitch,
  onRerunWizard,
}: {
  profile: Profile;
  onSwitch: (course: Course) => void;
  onRerunWizard: () => void;
}) {
  const [pending, setPending] = useState<Track | null>(null);
  const currentId = profile.course?.trackId;

  const start = (track: Track) => {
    const answers = profile.course
      ? { ...profile.course.answers, trackId: track.id }
      : {
          trackId: track.id,
          goal: 'curious' as const,
          experience: 'none' as const,
          minutesPerDay: 10,
          interests: [],
          priorLanguages: [],
          hearts: true,
        };
    onSwitch(buildCourse(track, answers));
    setPending(null);
  };

  return (
    <div className="library">
      <header className="library__head">
        <div>
          <p className="eyebrow">Course library</p>
          <h2>{LIBRARY_SIZE} exercises, {TRACKS.length} tracks</h2>
          <p className="muted" style={{ maxWidth: 620, marginTop: 8 }}>
            Everything ships with the app. Switching track keeps your XP, your streak and everything the
            scheduler has learned about you — the old course is archived, not thrown away.
          </p>
        </div>
        <Button variant="outline" onClick={onRerunWizard}>
          Redo the setup wizard
        </Button>
      </header>

      <div className="library__grid">
        {TRACKS.map((track) => {
          const isCurrent = track.id === currentId;
          const archived = profile.archived.some((c) => c.trackId === track.id);
          return (
            <Card key={track.id} className={`trackcard${isCurrent ? ' is-current' : ''}`}>
              <div className="trackcard__top">
                <span className="trackcard__mark">{track.mark}</span>
                <div>
                  <h4>{track.name}</h4>
                  <p className="trackcard__tag">{track.tagline}</p>
                </div>
              </div>
              <p className="trackcard__blurb">{track.blurb}</p>
              <div className="trackcard__meta">
                <Chip>{track.skills.length} skills</Chip>
                <Chip>{exercisesForTrack(track.id).length} exercises</Chip>
                <Chip>{'▲'.repeat(track.slope)} steepness</Chip>
                {track.runLang ? <Chip tone="right">runs code</Chip> : null}
              </div>
              <div className="trackcard__foot">
                {isCurrent ? (
                  <Chip tone="solid">current course</Chip>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setPending(track)}>
                    {archived ? 'Resume this track' : 'Switch to this track'}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal open={pending !== null} onClose={() => setPending(null)}>
        {pending ? (
          <>
            <h3>Switch to {pending.name}?</h3>
            <p className="muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
              Your {profile.course ? profile.course.trackId : 'current'} course is archived and can be resumed
              at any time. XP, streak and everything the scheduler knows about you carry over.
            </p>
            <div className="row" style={{ gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => start(pending)}>
                Switch course
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}

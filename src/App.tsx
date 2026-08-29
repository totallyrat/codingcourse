import { useCallback, useEffect, useMemo, useState } from 'react';
import { TitleBar } from '@/ui/TitleBar';
import { Button, Modal, ToastHost, useToast } from '@/ui/primitives';
import { Bit } from '@/mascot/Bit';
import { Wizard } from '@/screens/Wizard';
import { Home } from '@/screens/Home';
import { Lesson, type LessonResult } from '@/screens/Lesson';
import { Results } from '@/screens/Results';
import { Stats } from '@/screens/Stats';
import { Library } from '@/screens/Library';
import { Settings } from '@/screens/Settings';
import { useProfile } from '@/lib/useProfile';
import { bridge } from '@/lib/bridge';
import { exercisesForTrack, trackById } from '@/content';
import { composeLesson } from '@/engine/lessonComposer';
import { slotsForBudget } from '@/engine/courseBuilder';
import { completeLesson, createProfile, levelFor, setCourse } from '@/engine/progress';
import type { Course, Lesson as LessonModel, Profile } from '@/engine/types';

type View =
  | { name: 'home' }
  | { name: 'lesson'; lesson: LessonModel }
  | { name: 'results'; result: LessonResult; xpEarned: number }
  | { name: 'stats' }
  | { name: 'library' }
  | { name: 'settings' }
  | { name: 'wizard' };

export function App() {
  return (
    <ToastHost>
      <Shell />
      <div className="grain" aria-hidden="true" />
    </ToastHost>
  );
}

function Shell() {
  const { profile, loading, update } = useProfile();
  const [view, setView] = useState<View>({ name: 'home' });
  const [shortcuts, setShortcuts] = useState(false);
  const toast = useToast();

  // The font scale and forced reduced-motion are applied at the root so every
  // screen, including the mascot, picks them up.
  useEffect(() => {
    if (!profile) return;
    const root = document.documentElement;
    root.style.fontSize = `${16 * profile.settings.fontScale}px`;
    root.dataset.reduceMotion = profile.settings.reduceMotion ? 'true' : 'false';
  }, [profile?.settings.fontScale, profile?.settings.reduceMotion, profile]);

  const startLesson = useCallback(
    (mode: 'course' | 'review') => {
      if (!profile?.course) return;
      const track = trackById(profile.course.trackId);
      if (!track) return;
      const lesson = composeLesson({
        profile,
        course: profile.course,
        track,
        library: exercisesForTrack(track.id),
        mode,
        slots: slotsForBudget(profile.course.answers.minutesPerDay),
        level: levelFor(profile, track.id).level,
      });
      if (!lesson.slots.length) {
        toast('Nothing to practise right now — start a course lesson instead.', '·');
        return;
      }
      setView({ name: 'lesson', lesson });
    },
    [profile, toast],
  );

  // Native menu items and the app's own keyboard shortcuts share one handler.
  useEffect(
    () =>
      bridge.app.onMenu((action) => {
        if (action === 'continue') startLesson('course');
        else if (action === 'review') startLesson('review');
        else if (action === 'shortcuts') setShortcuts(true);
        else if (action === 'home') setView({ name: 'home' });
        else if (action === 'stats') setView({ name: 'stats' });
        else if (action === 'library') setView({ name: 'library' });
        else if (action === 'settings') setView({ name: 'settings' });
      }),
    [startLesson],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setShortcuts((s) => !s);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const onFinishLesson = useCallback(
    (result: LessonResult) => {
      update((p) => {
        const { profile: next, xpEarned } = completeLesson(p, {
          correct: result.correct,
          total: result.total,
          seconds: result.seconds,
          perfect: result.perfect,
          skillId: result.lesson.skillId,
          trackId: p.course?.trackId ?? '',
          atLevel: result.lesson.atLevel,
        });
        // The XP figure is needed by the results screen, so it is stashed on
        // the view rather than recomputed there.
        setView({ name: 'results', result, xpEarned });
        return next;
      });
    },
    [update],
  );

  const onCourseChosen = useCallback(
    (course: Course) => {
      update((p) => setCourse(p, course));
      setView({ name: 'home' });
    },
    [update],
  );

  const crumb = useMemo(() => {
    if (!profile?.course) return undefined;
    const track = trackById(profile.course.trackId);
    switch (view.name) {
      case 'lesson':
        return `${track?.name} · ${view.lesson.title}`;
      case 'stats':
        return 'Progress';
      case 'library':
        return 'Library';
      case 'settings':
        return 'Settings';
      default:
        return track?.name;
    }
  }, [view, profile]);

  if (loading || !profile) {
    return (
      <div className="app">
        <TitleBar />
        <div className="boot">
          <Bit mood="idle" size={140} />
          <p className="muted">Loading your progress…</p>
        </div>
      </div>
    );
  }

  const needsWizard = !profile.course || view.name === 'wizard';

  return (
    <div className="app">
      <TitleBar crumb={crumb} />

      {needsWizard ? (
        <main className="app__main app__main--full">
          <Wizard onFinish={onCourseChosen} />
        </main>
      ) : view.name === 'lesson' ? (
        <main className="app__main app__main--full">
          <Lesson
            lesson={view.lesson}
            profile={profile}
            onUpdate={update}
            onFinish={onFinishLesson}
            onQuit={() => setView({ name: 'home' })}
          />
        </main>
      ) : view.name === 'results' ? (
        <main className="app__main app__main--full">
          <Results
            result={view.result}
            profile={profile}
            xpEarned={view.xpEarned}
            onContinue={() => setView({ name: 'home' })}
            onAgain={() => startLesson('course')}
          />
        </main>
      ) : (
        <div className="app__frame">
          <Nav view={view.name} onGo={(name) => setView({ name } as View)} profile={profile} />
          <main className="app__main">
            {view.name === 'home' ? (
              <Home
                profile={profile}
                onStart={() => startLesson('course')}
                onReview={() => startLesson('review')}
                onOpenStats={() => setView({ name: 'stats' })}
              />
            ) : view.name === 'stats' ? (
              <Stats profile={profile} />
            ) : view.name === 'library' ? (
              <Library
                profile={profile}
                onSwitch={(course) => {
                  update((p) => setCourse(p, course));
                  setView({ name: 'home' });
                  toast('Course switched. Your progress carried over.', '✓');
                }}
                onRerunWizard={() => setView({ name: 'wizard' })}
              />
            ) : (
              <Settings
                profile={profile}
                onUpdate={update}
                onReset={() => {
                  update(() => createProfile(`p_${Date.now().toString(36)}`));
                  setView({ name: 'home' });
                  toast('Everything erased. Starting fresh.', '·');
                }}
              />
            )}
          </main>
        </div>
      )}

      <Modal open={shortcuts} onClose={() => setShortcuts(false)}>
        <h3>Keyboard</h3>
        <table className="shortcuts">
          <tbody>
            {[
              ['Enter', 'Check the answer, then continue'],
              ['1 – 9', 'Pick an option'],
              ['Ctrl + Enter', 'Run the code you wrote'],
              ['Space, then ↑ ↓', 'Move a line while reordering'],
              ['Tab', 'Indent inside the editor'],
              ['Esc', 'Leave the lesson'],
              ['Ctrl + 1 / 2 / 3', 'Home, progress, library'],
              ['Ctrl + R', 'Practise weak spots'],
              ['F1', 'This list'],
            ].map(([keys, what]) => (
              <tr key={keys}>
                <td>
                  <span className="kbd">{keys}</span>
                </td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
          <Button onClick={() => setShortcuts(false)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}

const NAV: Array<{ id: 'home' | 'stats' | 'library' | 'settings'; label: string; icon: JSX.Element }> = [
  {
    id: 'home',
    label: 'Course',
    icon: (
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'stats',
    label: 'Progress',
    icon: (
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'library',
    label: 'Library',
    icon: (
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <path d="M5 4h5v16H5zM14 4h5v16h-5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
];

function Nav({
  view,
  onGo,
  profile,
}: {
  view: string;
  onGo: (name: 'home' | 'stats' | 'library' | 'settings') => void;
  profile: Profile;
}) {
  const track = profile.course ? trackById(profile.course.trackId) : undefined;
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav__brand">
        <span className="nav__mark">{track?.mark ?? '{}'}</span>
        <span className="nav__track">{track?.name ?? 'Codeling'}</span>
      </div>
      <ul className="nav__list">
        {NAV.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`nav__item${view === item.id ? ' is-on' : ''}`}
              onClick={() => onGo(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="nav__foot">
        <div className="nav__streak">
          <span className="nav__streaknum">{profile.streak}</span>
          <span className="nav__streaklabel">day streak</span>
        </div>
      </div>
    </nav>
  );
}

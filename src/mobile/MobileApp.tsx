import { useCallback, useEffect, useMemo, useState } from 'react';
import { ToastHost, useToast } from '@/ui/primitives';
import { Bit } from '@/mascot/Bit';
import { Wizard } from '@/screens/Wizard';
import { Lesson, type LessonResult } from '@/screens/Lesson';
import { Results } from '@/screens/Results';
import { Stats } from '@/screens/Stats';
import { Library } from '@/screens/Library';
import { MobileHome } from './MobileHome';
import { MobileSettings } from './MobileSettings';
import { Pager } from './Pager';
import { TabBar, TABS } from './TabBar';
import { Confetti } from './Confetti';
import { InstallSheet, dismissInstallBanner, installBannerDismissed } from './InstallSheet';
import { currentPlatform } from './platform';
import { restoreTilt } from './tilt';
import { haptic } from '@/lib/haptics';
import { useProfile } from '@/lib/useProfile';
import { exercisesForTrack, trackById } from '@/content';
import { composeLesson } from '@/engine/lessonComposer';
import { slotsForBudget } from '@/engine/courseBuilder';
import { completeLesson, createProfile, setCourse, xpToday } from '@/engine/progress';
import type { Course, Lesson as LessonModel } from '@/engine/types';

type View =
  | { name: 'tabs' }
  | { name: 'wizard' }
  | { name: 'lesson'; lesson: LessonModel }
  | { name: 'results'; result: LessonResult; xpEarned: number };

/**
 * The phone build.
 *
 * Same engine, same content, same mascot; a different set of hands. Four tabs
 * you can swipe between, a lesson that takes the whole screen, and every
 * target sized for a thumb rather than a cursor. Lessons, results and the
 * wizard deliberately leave the tab bar behind — a lesson is somewhere you
 * are, not a page you are on.
 */
export function MobileApp() {
  return (
    <ToastHost>
      <Shell />
      <div className="grain" aria-hidden="true" />
    </ToastHost>
  );
}

function Shell() {
  const { profile, loading, update } = useProfile();
  const [tab, setTab] = useState(0);
  const [view, setView] = useState<View>({ name: 'tabs' });
  const [collapsed, setCollapsed] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [bannerGone, setBannerGone] = useState(() => installBannerDismissed());
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);
  const toast = useToast();
  const platform = useMemo(() => currentPlatform(), []);

  useEffect(() => {
    restoreTilt();
  }, []);

  useEffect(() => {
    if (!profile) return;
    const root = document.documentElement;
    root.style.fontSize = `${16 * profile.settings.fontScale}px`;
    root.dataset.reduceMotion = profile.settings.reduceMotion ? 'true' : 'false';
  }, [profile?.settings.fontScale, profile?.settings.reduceMotion, profile]);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // The service worker says when a newer build finished downloading. It is
  // already on the device by then; the next launch picks it up.
  useEffect(() => {
    const onUpdate = () => toast('Update downloaded. It applies next time you open Codeling.', '·');
    window.addEventListener('codeling:update', onUpdate);
    return () => window.removeEventListener('codeling:update', onUpdate);
  }, [toast]);

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
      });
      if (!lesson.slots.length) {
        toast('Nothing to practise right now — start a course lesson instead.', '·');
        return;
      }
      window.scrollTo(0, 0);
      setView({ name: 'lesson', lesson });
    },
    [profile, toast],
  );

  const onFinishLesson = useCallback(
    (result: LessonResult) => {
      haptic(result.perfect ? 'win' : 'select');
      update((p) => {
        const { profile: next, xpEarned } = completeLesson(p, {
          correct: result.correct,
          total: result.total,
          seconds: result.seconds,
          perfect: result.perfect,
          skillId: result.lesson.skillId,
        });
        setView({ name: 'results', result, xpEarned });
        return next;
      });
    },
    [update],
  );

  const onCourseChosen = useCallback(
    (course: Course) => {
      update((p) => setCourse(p, course));
      setView({ name: 'tabs' });
      setTab(0);
    },
    [update],
  );

  const leaveResults = useCallback(() => {
    setView({ name: 'tabs' });
    setTab(0);
    // The moment to offer installation is after the first lesson, when the app
    // has earned the ask — not on a cold first paint before anything happened.
    if (!installBannerDismissed() && platform.route !== 'installed' && platform.route !== 'desktop') {
      setInstallOpen(true);
      dismissInstallBanner();
      setBannerGone(true);
    }
  }, [platform.route]);

  if (loading || !profile) {
    return (
      <div className="mapp mapp--boot">
        <Bit mood="idle" size={132} trackPointer={false} />
        <p className="muted">Loading your progress…</p>
      </div>
    );
  }

  const needsWizard = !profile.course || view.name === 'wizard';
  const track = profile.course ? trackById(profile.course.trackId) : undefined;

  if (needsWizard) {
    return (
      <div className="mapp">
        <div className="mview" key="wizard">
          <Wizard onFinish={onCourseChosen} />
        </div>
      </div>
    );
  }

  if (view.name === 'lesson') {
    return (
      <div className="mapp">
        <div className="mview mview--rise" key={view.lesson.id}>
          <Lesson
            lesson={view.lesson}
            profile={profile}
            onUpdate={update}
            onFinish={onFinishLesson}
            onQuit={() => setView({ name: 'tabs' })}
          />
        </div>
      </div>
    );
  }

  if (view.name === 'results') {
    const celebrate = view.result.perfect || xpToday(profile) >= profile.settings.dailyGoalXp;
    return (
      <div className="mapp">
        <div className="mview mview--rise" key="results">
          <Results
            result={view.result}
            profile={profile}
            xpEarned={view.xpEarned}
            onContinue={leaveResults}
            onAgain={() => startLesson('course')}
          />
          <Confetti run={celebrate} />
        </div>
      </div>
    );
  }

  const showBanner =
    !bannerGone && tab === 0 && (platform.route === 'ios-safari' || platform.route === 'ios-other' || platform.route === 'prompt');

  return (
    <div className="mapp">
      <header className={`mhead${collapsed ? ' is-collapsed' : ''}`}>
        <span className="mhead__mark">{track?.mark ?? '{}'}</span>
        <span className="mhead__title">{tab === 0 ? (track?.name ?? 'Codeling') : TABS[tab].label}</span>
        <span className="spacer" />
        {offline ? <span className="mhead__offline">offline · still works</span> : null}
        <span className="mhead__streak">
          <span className="mhead__streaknum">{profile.streak}</span>
          <span className="mhead__streaklabel">day</span>
        </span>
      </header>

      {showBanner ? (
        <div className="minstallbar">
          <button
            type="button"
            className="minstallbar__main"
            onClick={() => {
              haptic('tap');
              setInstallOpen(true);
            }}
          >
            <span className="minstallbar__title">Put Codeling on your home screen</span>
            <span className="minstallbar__note">Two taps. No store, no account, works offline.</span>
          </button>
          <button
            type="button"
            className="minstallbar__close"
            aria-label="Dismiss"
            onClick={() => {
              dismissInstallBanner();
              setBannerGone(true);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : null}

      <Pager
        index={tab}
        onIndex={setTab}
        onPanelScroll={(panel, top) => {
          if (panel === tab) setCollapsed(top > 14);
        }}
      >
        {[
          <MobileHome
            key="home"
            profile={profile}
            onStart={() => startLesson('course')}
            onReview={() => startLesson('review')}
          />,
          <Stats key="stats" profile={profile} />,
          <Library
            key="library"
            profile={profile}
            onSwitch={(course) => {
              update((p) => setCourse(p, course));
              setTab(0);
              toast('Course switched. Your progress carried over.', '✓');
            }}
            onRerunWizard={() => setView({ name: 'wizard' })}
          />,
          <MobileSettings
            key="settings"
            profile={profile}
            onUpdate={update}
            onReset={() => {
              update(() => createProfile(`p_${Date.now().toString(36)}`));
              setTab(0);
              toast('Everything erased. Starting fresh.', '·');
            }}
          />,
        ]}
      </Pager>

      <TabBar index={tab} onSelect={setTab} />

      <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} platform={platform} />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ToastHost, useToast } from '@/ui/primitives';
import { TitleBar } from '@/ui/TitleBar';
import { isElectron } from '@/lib/bridge';
import { Mascot } from '@/mascot/Mascot';
import { Wizard } from '@/screens/Wizard';
import { Lesson, type LessonResult } from '@/screens/Lesson';
import { Library } from '@/screens/Library';
import { CoursePath } from './CoursePath';
import { Shop, GemIcon } from './Shop';
import { Leaderboard } from './Leaderboard';
import { ProfileScreen } from './ProfileScreen';
import { AvatarCreator } from './AvatarCreator';
import { Celebration } from './Celebration';
import { MobileSettings } from './MobileSettings';
import { Pager } from './Pager';
import { TabBar, TABS } from './TabBar';
import { InstallSheet, dismissInstallBanner, installBannerDismissed } from './InstallSheet';
import { currentPlatform } from './platform';
import { restoreTilt } from './tilt';
import { cancelReminder, scheduleReminder } from './notifications';
import { haptic } from '@/lib/haptics';
import { useProfile } from '@/lib/useProfile';
import { exercisesForTrack, trackById } from '@/content';
import { composeLesson } from '@/engine/lessonComposer';
import { lessonSize } from '@/engine/courseBuilder';
import {
  completeLesson,
  createProfile,
  levelFor,
  setCourse,
  spendLessonSkip,
  xpToday,
  type LessonReward,
} from '@/engine/progress';
import type { AvatarConfig, Course, Lesson as LessonModel, Profile, Skill } from '@/engine/types';
import { skillMastery } from '@/engine/lessonComposer';

type View =
  | { name: 'tabs' }
  | { name: 'wizard' }
  | { name: 'library' }
  | { name: 'settings' }
  | { name: 'avatar' }
  | { name: 'lesson'; lesson: LessonModel; before: Profile }
  | { name: 'done'; result: LessonResult; reward: LessonReward; before: Profile };

/**
 * The app, on a phone-shaped screen — which is now every screen, desktop
 * included. Three tabs you can swipe between, the course as a path, and
 * lessons that take the whole display because a lesson is somewhere you are,
 * not a page you are on.
 */
export function MobileApp() {
  return (
    <ToastHost>
      {/* On the desktop the window is phone-shaped, but it is still a window:
          it keeps the app's own title bar and caption buttons. */}
      {isElectron ? <TitleBar /> : null}
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
  // The profile as it was before the last lesson, so Profile can replay the
  // change rather than just showing the result.
  const [replayFrom, setReplayFrom] = useState<Profile | null>(null);
  const toast = useToast();
  const platform = useMemo(() => currentPlatform(), []);

  useEffect(() => {
    restoreTilt();
  }, []);

  // Arm the daily reminder whenever the setting or today's practice changes.
  // The "have I practised" question is asked at fire time, not now.
  useEffect(() => {
    if (!profile) return;
    scheduleReminder(profile.settings.reminders, () => (xpToday(profile) > 0));
    return () => cancelReminder();
  }, [profile?.settings.reminders, profile]);

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
      const level = levelFor(profile, track.id).level;
      const lesson = composeLesson({
        profile,
        course: profile.course,
        track,
        library: exercisesForTrack(track.id),
        mode,
        slots: lessonSize(profile.course.answers.minutesPerDay, level),
        level,
      });
      if (!lesson.slots.length) {
        toast('Nothing to practise right now — start a course lesson instead.', '·');
        return;
      }
      haptic('tap');
      setView({ name: 'lesson', lesson, before: profile });
    },
    [profile, toast],
  );

  const onFinishLesson = useCallback(
    (result: LessonResult, before: Profile) => {
      update((p) => {
        const track = p.course ? trackById(p.course.trackId) : undefined;
        // A skill counts as mastered by this lesson if it crossed 75% during it.
        const skillsMastered = track
          ? track.skills.filter(
              (skill) => skillMastery(before, skill) < 0.75 && skillMastery(p, skill) >= 0.75,
            ).length
          : 0;

        const reward = completeLesson(p, {
          correct: result.correct,
          total: result.total,
          seconds: result.seconds,
          perfect: result.perfect,
          skillId: result.lesson.skillId,
          trackId: p.course?.trackId ?? '',
          atLevel: result.lesson.atLevel,
          starved: result.lesson.starved,
          rechecksCleared: result.rechecksCleared,
          skillsMastered,
        });
        setView({ name: 'done', result, reward, before });
        return reward.profile;
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

  const useSkip = useCallback(
    (skill: Skill) => {
      update((p) => spendLessonSkip(p, skill));
      haptic('win');
      toast(`${skill.title} marked as passed. It will still come back for review.`, '✓');
    },
    [update, toast],
  );

  /**
   * Continue from the celebration lands on Profile with the replay armed, so
   * the numbers you just earned are watched moving rather than found already
   * moved.
   */
  const leaveLesson = useCallback(
    (before: Profile) => {
      setReplayFrom(before);
      setView({ name: 'tabs' });
      setTab(3);
      if (!installBannerDismissed() && platform.route !== 'installed' && platform.route !== 'desktop') {
        setInstallOpen(true);
        dismissInstallBanner();
        setBannerGone(true);
      }
    },
    [platform.route],
  );

  const saveAvatar = useCallback(
    (avatar: AvatarConfig) => {
      update((p) => ({ ...p, avatar }));
      setView({ name: 'tabs' });
      setTab(3);
      toast('Looking good.', '✓');
    },
    [update, toast],
  );

  if (loading || !profile) {
    return (
      <div className="mapp mapp--boot">
        <Mascot mood="idle" size={132} trackPointer={false} />
        <p className="muted">Loading your progress…</p>
      </div>
    );
  }

  const needsWizard = !profile.course || view.name === 'wizard';
  const track = profile.course ? trackById(profile.course.trackId) : undefined;
  const ladder = levelFor(profile, profile.course?.trackId ?? '');

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
            onFinish={(result) => onFinishLesson(result, view.before)}
            onQuit={() => setView({ name: 'tabs' })}
          />
        </div>
      </div>
    );
  }

  if (view.name === 'done') {
    return (
      <div className="mapp">
        <div className="mview mview--rise" key="done">
          <Celebration
            correct={view.result.correct}
            total={view.result.total}
            seconds={view.result.seconds}
            xpEarned={view.reward.xpEarned}
            gemsEarned={view.reward.gemsEarned}
            boosted={view.reward.boosted}
            level={view.reward.level}
            streak={profile.streak}
            seed={profile.lessonIndex}
            questsCompleted={view.reward.questsCompleted.length}
            avatar={profile.avatar}
            onContinue={() => leaveLesson(view.before)}
            onAgain={() => startLesson('course')}
          />
        </div>
      </div>
    );
  }

  if (view.name === 'library') {
    return (
      <div className="mapp">
        <TopBar
          title="Library"
          onBack={() => setView({ name: 'tabs' })}
          gems={profile.gems}
          streak={profile.streak}
        />
        <div className="mview" key="library">
          <div className="pager__panel">
            <Library
              profile={profile}
              onSwitch={(course) => {
                update((p) => setCourse(p, course));
                setView({ name: 'tabs' });
                setTab(0);
                toast('Course switched. Your progress carried over.', '✓');
              }}
              onRerunWizard={() => setView({ name: 'wizard' })}
            />
          </div>
        </div>
      </div>
    );
  }

  if (view.name === 'avatar') {
    return (
      <div className="mapp">
        <TopBar
          title="Your mascot"
          onBack={() => setView({ name: 'tabs' })}
          gems={profile.gems}
          streak={profile.streak}
        />
        <div className="mview" key="avatar">
          <div className="pager__panel">
            <AvatarCreator
              initial={profile.avatar}
              onSave={saveAvatar}
              onCancel={() => setView({ name: 'tabs' })}
            />
          </div>
        </div>
      </div>
    );
  }

  if (view.name === 'settings') {
    return (
      <div className="mapp">
        <TopBar
          title="Settings"
          onBack={() => setView({ name: 'tabs' })}
          gems={profile.gems}
          streak={profile.streak}
        />
        <div className="mview" key="settings">
          <div className="pager__panel">
            <MobileSettings
              profile={profile}
              onUpdate={update}
              onReset={() => {
                update(() => createProfile(`p_${Date.now().toString(36)}`));
                setView({ name: 'tabs' });
                setTab(0);
                toast('Everything erased. Starting fresh.', '·');
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  const showBanner =
    !bannerGone &&
    tab === 0 &&
    (platform.route === 'ios-safari' || platform.route === 'ios-other' || platform.route === 'prompt');

  return (
    <div className="mapp">
      <header className={`mhead${collapsed ? ' is-collapsed' : ''}`}>
        <span className="mhead__mark">{track?.mark ?? '{}'}</span>
        <span className="mhead__title">{tab === 0 ? (track?.name ?? 'Codeling') : TABS[tab].label}</span>
        <span className="mhead__level" title={`Level ${ladder.level} of ten`}>
          L{ladder.level}
        </span>
        <span className="spacer" />
        {offline ? <span className="mhead__offline">offline</span> : null}
        <span className="mhead__stat mhead__stat--gems">
          <GemIcon />
          {profile.gems}
        </span>
        <span className="mhead__stat mhead__stat--streak">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path d="M12 2c3 4 6 5.5 6 9.5a6 6 0 0 1-12 0c0-2 1-3.5 2-4.5.5 1 1 1.5 2 1.5 0-3 1-5 2-6.5z" fill="currentColor" />
          </svg>
          {profile.streak}
        </span>
        <button
          type="button"
          className="iconbtn"
          aria-label="Library"
          onClick={() => {
            haptic('tap');
            setView({ name: 'library' });
          }}
        >
          <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
            <path d="M4 5h5v14H4zM11 5h4v14h-4zM17 6l3 13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
          </svg>
        </button>
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
        onIndex={(next) => {
          if (next !== 3) setReplayFrom(null);
          setTab(next);
        }}
        onPanelScroll={(panel, top) => {
          if (panel === tab) setCollapsed(top > 14);
        }}
      >
        {[
          <CoursePath key="course" profile={profile} onStart={() => startLesson('course')} onSkip={useSkip} />,
          <Leaderboard key="league" profile={profile} />,
          <Shop key="shop" profile={profile} onUpdate={update} onToast={toast} />,
          <ProfileScreen
            key="profile"
            profile={profile}
            replayFrom={tab === 3 ? replayFrom : null}
            onSettings={() => setView({ name: 'settings' })}
            onEditAvatar={() => setView({ name: 'avatar' })}
          />,
        ]}
      </Pager>

      <TabBar index={tab} onSelect={setTab} />

      <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} platform={platform} />
    </div>
  );
}

function TopBar({
  title,
  onBack,
  gems,
  streak,
}: {
  title: string;
  onBack: () => void;
  gems: number;
  streak: number;
}) {
  return (
    <header className="mhead">
      <button type="button" className="iconbtn" aria-label="Back" onClick={onBack}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <span className="mhead__title">{title}</span>
      <span className="spacer" />
      <span className="mhead__stat mhead__stat--gems">
        <GemIcon />
        {gems}
      </span>
      <span className="mhead__stat mhead__stat--streak">{streak}</span>
    </header>
  );
}

import { useRef, useState } from 'react';
import { Button, Card, Chip, useToast } from '@/ui/primitives';
import { Settings } from '@/screens/Settings';
import { InstallSheet } from './InstallSheet';
import { currentPlatform } from './platform';
import { disableTilt, enableTilt, tiltEnabled, tiltSupported } from './tilt';
import { hapticsEnabled, setHapticsEnabled } from '@/lib/haptics';
import type { Profile } from '@/engine/types';

/**
 * The shared settings screen, with the things only a phone needs bolted on
 * top: getting the app onto the home screen, the two physical toggles, and an
 * export route — there is no File menu here, and progress that can only ever
 * live in one browser's storage is progress waiting to be lost.
 */
export function MobileSettings({
  profile,
  onUpdate,
  onReset,
}: {
  profile: Profile;
  onUpdate: (fn: (p: Profile) => Profile) => void;
  onReset: () => void;
}) {
  const platform = currentPlatform();
  const [installOpen, setInstallOpen] = useState(false);
  const [haptics, setHaptics] = useState(hapticsEnabled());
  const [tilt, setTilt] = useState(tiltEnabled());
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const exportProfile = () => {
    const blob = new Blob([JSON.stringify({ app: 'codeling', data: profile }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codeling-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const importProfile = (file: File) => {
    void file.text().then((text) => {
      try {
        const parsed = JSON.parse(text) as { data?: Profile } & Profile;
        const next = parsed.data ?? parsed;
        if (!next || typeof next !== 'object' || !('concepts' in next)) throw new Error('not a profile');
        onUpdate(() => next as Profile);
        toast('Progress restored.', '✓');
      } catch {
        toast('That file is not a Codeling export.', '·');
      }
    });
  };

  return (
    <div className="msettings">
      <Card quiet className="settings__group">
        <h4>This app on your phone</h4>
        <div className="settingrow">
          <div className="settingrow__text">
            <span className="settingrow__title">
              Home screen{' '}
              {platform.route === 'installed' ? <Chip tone="right">installed</Chip> : null}
            </span>
            <span className="settingrow__note">
              {platform.route === 'installed'
                ? 'Codeling is running as an installed app. It opens without browser chrome and works offline.'
                : 'Install it from here — no store, no account, no sign-in. It then runs full screen and offline.'}
            </span>
          </div>
          <div className="settingrow__control">
            <Button size="sm" variant="outline" onClick={() => setInstallOpen(true)}>
              {platform.route === 'installed' ? 'Details' : 'How'}
            </Button>
          </div>
        </div>

        <div className="settingrow">
          <div className="settingrow__text">
            <span className="settingrow__title">Haptics</span>
            <span className="settingrow__note">
              A tick when you answer, and a longer one when a lesson lands. Silent on hardware without a
              vibration motor.
            </span>
          </div>
          <div className="settingrow__control">
            <Toggle
              checked={haptics}
              label="Haptics"
              onChange={(v) => {
                setHapticsEnabled(v);
                setHaptics(v);
              }}
            />
          </div>
        </div>

        {tiltSupported() ? (
          <div className="settingrow">
            <div className="settingrow__text">
              <span className="settingrow__title">Bit follows the phone</span>
              <span className="settingrow__note">
                With no cursor to watch, the mascot uses the tilt of the phone instead — it looks where you
                lean and leans with you. Uses the motion sensor only; nothing is recorded.
              </span>
            </div>
            <div className="settingrow__control">
              <Toggle
                checked={tilt}
                label="Tilt tracking"
                onChange={(v) => {
                  if (!v) {
                    disableTilt();
                    setTilt(false);
                    return;
                  }
                  void enableTilt().then((result) => {
                    setTilt(result === 'on');
                    if (result === 'denied') toast('iOS said no to motion access.', '·');
                    if (result === 'unsupported') toast('This device has no motion sensor.', '·');
                  });
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="settingrow">
          <div className="settingrow__text">
            <span className="settingrow__title">Back up your progress</span>
            <span className="settingrow__note">
              One file with your course, your streak and everything the scheduler knows. Import it on any
              device — the desktop app reads the same format.
            </span>
          </div>
          <div className="settingrow__control settingrow__control--wrap">
            <Button size="sm" variant="outline" onClick={exportProfile}>
              Export
            </Button>
            <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
              Import
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importProfile(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </Card>

      <Settings profile={profile} onUpdate={onUpdate} onReset={onReset} />

      <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} platform={platform} />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__knob" />
    </button>
  );
}

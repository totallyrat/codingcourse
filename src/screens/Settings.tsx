import { useEffect, useState } from 'react';
import { Button, Card, Chip, Modal, Segmented } from '@/ui/primitives';
import { bridge, isElectron } from '@/lib/bridge';
import { toolchains } from '@/runtime';
import { LANGUAGE_LABEL } from '@/runtime';
import { createProfile } from '@/engine/progress';
import type { Profile, RunLanguage } from '@/engine/types';

export function Settings({
  profile,
  onUpdate,
  onReset,
}: {
  profile: Profile;
  onUpdate: (fn: (p: Profile) => Profile) => void;
  onReset: () => void;
}) {
  const [info, setInfo] = useState<{ version: string; platform: string; electron: string; node: string } | null>(null);
  const [path, setPath] = useState('');
  const [tools, setTools] = useState<Partial<Record<RunLanguage, string | null>>>({});
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    void bridge.app.info().then(setInfo);
    void bridge.profile.path().then(setPath);
    void toolchains().then(setTools);
  }, []);

  const set = <K extends keyof Profile['settings']>(key: K, value: Profile['settings'][K]) =>
    onUpdate((p) => ({ ...p, settings: { ...p.settings, [key]: value } }));

  return (
    <div className="settings">
      <header className="settings__head">
        <p className="eyebrow">Settings</p>
        <h2>How this works for you</h2>
      </header>

      <Card quiet className="settings__group">
        <h4>Lessons</h4>

        <Row
          title="Hearts"
          note="Five mistakes ends a lesson. Turn it off and a lesson always runs to the end — the scheduler behaves the same either way."
        >
          <Toggle checked={profile.settings.hearts} onChange={(v) => set('hearts', v)} label="Use hearts" />
        </Row>

        <Row title="Daily goal" note="How much XP counts as a day well spent. Roughly one lesson is 100 to 160 XP.">
          <Segmented
            value={String(profile.settings.dailyGoalXp)}
            options={[
              { value: '30', label: 'Light' },
              { value: '60', label: 'Regular' },
              { value: '120', label: 'Serious' },
              { value: '250', label: 'Intense' },
            ]}
            onChange={(v) => set('dailyGoalXp', Number(v))}
          />
        </Row>

        <Row title="Daily time" note="Sets how many exercises go into each lesson.">
          <Segmented
            value={String(profile.course?.answers.minutesPerDay ?? 10)}
            options={[
              { value: '5', label: '5 min' },
              { value: '10', label: '10 min' },
              { value: '15', label: '15 min' },
              { value: '20', label: '20 min' },
              { value: '30', label: '30 min' },
            ]}
            onChange={(v) =>
              onUpdate((p) =>
                p.course
                  ? { ...p, course: { ...p.course, answers: { ...p.course.answers, minutesPerDay: Number(v) } } }
                  : p,
              )
            }
          />
        </Row>
      </Card>

      <Card quiet className="settings__group">
        <h4>Appearance</h4>
        <Row title="Text size" note="Scales everything, including code.">
          <Segmented
            value={String(profile.settings.fontScale)}
            options={[
              { value: '0.92', label: 'Small' },
              { value: '1', label: 'Default' },
              { value: '1.1', label: 'Large' },
              { value: '1.22', label: 'Larger' },
            ]}
            onChange={(v) => set('fontScale', Number(v))}
          />
        </Row>
        <Row
          title="Reduce motion"
          note="Stills the mascot and removes transitions. Your system setting is respected automatically; this forces it on."
        >
          <Toggle
            checked={profile.settings.reduceMotion}
            onChange={(v) => set('reduceMotion', v)}
            label="Reduce motion"
          />
        </Row>
      </Card>

      <Card quiet className="settings__group">
        <h4>Running code</h4>
        <p className="muted settings__note">
          Codeling uses a real compiler or interpreter when it finds one on this machine, and falls back to its
          own bundled Python interpreter otherwise. Nothing is sent anywhere — your code runs locally, in a
          temporary folder, with an eight-second limit.
        </p>
        <div className="toolgrid">
          {(Object.keys(LANGUAGE_LABEL) as RunLanguage[]).map((lang) => {
            const found = tools[lang];
            const fallback = lang === 'python' ? 'built-in interpreter' : lang === 'javascript' || lang === 'typescript' ? 'built in' : null;
            return (
              <div key={lang} className="toolrow">
                <span className="toolrow__lang">{LANGUAGE_LABEL[lang]}</span>
                {found ? (
                  <Chip tone="right">{found}</Chip>
                ) : fallback ? (
                  <Chip>{fallback}</Chip>
                ) : (
                  <Chip tone="streak">not installed</Chip>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card quiet className="settings__group">
        <h4>Your data</h4>
        <p className="muted settings__note">
          Everything lives in one file on this computer. There is no account and nothing leaves the machine.
          Export and import are in the File menu.
        </p>
        {path ? <code className="settings__path">{path}</code> : null}
        <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {isElectron ? (
            <Button size="sm" variant="outline" onClick={() => void bridge.profile.reveal()}>
              Show in folder
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}>
            Erase all progress
          </Button>
        </div>
      </Card>

      <div className="settings__about">
        <span>Codeling {info?.version ?? ''}</span>
        {info ? (
          <span className="muted">
            {info.platform} · Electron {info.electron} · Node {info.node}
          </span>
        ) : null}
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)}>
        <h3>Erase everything?</h3>
        <p className="muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
          This deletes your course, your XP, your {profile.streak}-day streak and everything the scheduler has
          learned about you. It cannot be undone. Export first from the File menu if you might want it back.
        </p>
        <div className="row" style={{ gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Keep my progress
          </Button>
          <Button
            variant="wrong"
            onClick={() => {
              setConfirmReset(false);
              onReset();
            }}
          >
            Erase everything
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="settingrow">
      <div className="settingrow__text">
        <span className="settingrow__title">{title}</span>
        {note ? <span className="settingrow__note">{note}</span> : null}
      </div>
      <div className="settingrow__control">{children}</div>
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

export const blankProfile = createProfile;

import { useEffect, useState } from 'react';
import { Button } from '@/ui/primitives';
import { Sheet } from './Sheet';
import { currentPlatform, installAdvice, type Platform } from './platform';

interface PromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Chromium fires `beforeinstallprompt` once and expects you to keep it; there
 * is no way to ask for it later. Safari fires nothing at all, which is why the
 * sheet also has words in it.
 */
export function useInstallPrompt(): { prompt: PromptEvent | null; install: () => Promise<boolean> } {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return {
    prompt,
    install: async () => {
      if (!prompt) return false;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') setPrompt(null);
      return choice.outcome === 'accepted';
    },
  };
}

const SEEN_KEY = 'codeling.install.dismissed';

export function installBannerDismissed(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function dismissInstallBanner(): void {
  try {
    localStorage.setItem(SEEN_KEY, 'yes');
  } catch {
    /* private mode */
  }
}

export function InstallSheet({
  open,
  onClose,
  platform = currentPlatform(),
}: {
  open: boolean;
  onClose: () => void;
  platform?: Platform;
}) {
  const advice = installAdvice(platform.route);
  const { prompt, install } = useInstallPrompt();

  return (
    <Sheet open={open} onClose={onClose} title={advice.title}>
      <p className="muted">{advice.lead}</p>

      {advice.steps.length ? (
        <ol className="installsteps">
          {advice.steps.map((step, i) => (
            <li key={i}>
              <span className="installsteps__no">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {platform.route === 'ios-safari' ? (
        <div className="installhint">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M12 3v11M12 3l-3.4 3.4M12 3l3.4 3.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span>This button, at the bottom of Safari.</span>
        </div>
      ) : null}

      {advice.canPrompt && prompt ? (
        <Button
          variant="primary"
          size="lg"
          block
          className="mbtn"
          onClick={() => {
            void install().then((accepted) => accepted && onClose());
          }}
        >
          Install
        </Button>
      ) : null}

      <p className="muted installnote">
        It is the whole app, not a shortcut: every lesson, the interpreter and the fonts are stored on the
        phone the first time it loads. After that it opens with no network at all, and nothing you do leaves
        the device.
      </p>
    </Sheet>
  );
}

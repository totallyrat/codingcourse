import { describe, expect, it } from 'vitest';
import { installAdvice, readPlatform } from './platform';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  ipadOS:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};

describe('reading the platform', () => {
  it('routes iPhone Safari to Add to Home Screen', () => {
    const p = readPlatform({ userAgent: UA.iphoneSafari, standalone: false, maxTouchPoints: 5 });
    expect(p.ios).toBe(true);
    expect(p.safari).toBe(true);
    expect(p.route).toBe('ios-safari');
  });

  it('knows Chrome on iOS cannot install, however much it looks like Safari', () => {
    // Every iOS browser has "Safari" in its user agent. Only one of them can
    // put an icon on the home screen, and sending the others through the same
    // instructions is worse than saying nothing.
    const p = readPlatform({ userAgent: UA.iphoneChrome, standalone: false, maxTouchPoints: 5 });
    expect(p.ios).toBe(true);
    expect(p.safari).toBe(false);
    expect(p.route).toBe('ios-other');
  });

  it('sees through an iPad pretending to be a Mac', () => {
    // iPadOS 13 and later report a desktop user agent. The touch points are
    // the only thing that gives it away.
    const asPad = readPlatform({ userAgent: UA.ipadOS, standalone: false, maxTouchPoints: 5 });
    expect(asPad.ios).toBe(true);
    expect(asPad.route).toBe('ios-safari');

    const asMac = readPlatform({ userAgent: UA.macSafari, standalone: false, maxTouchPoints: 0 });
    expect(asMac.ios).toBe(false);
    expect(asMac.route).toBe('desktop');
  });

  it('lets Android use the browser prompt', () => {
    const p = readPlatform({ userAgent: UA.androidChrome, standalone: false, maxTouchPoints: 5 });
    expect(p.android).toBe(true);
    expect(p.route).toBe('prompt');
    expect(installAdvice(p.route).canPrompt).toBe(true);
  });

  it('says nothing to a phone that is already installed', () => {
    const p = readPlatform({ userAgent: UA.iphoneSafari, standalone: true, maxTouchPoints: 5 });
    expect(p.route).toBe('installed');
    expect(installAdvice('installed').steps).toHaveLength(0);
  });

  it('gives desktop the plain route', () => {
    expect(readPlatform({ userAgent: UA.desktopChrome, standalone: false }).route).toBe('desktop');
  });
});

describe('install advice', () => {
  it('names the actual buttons for iPhone Safari', () => {
    const advice = installAdvice('ios-safari');
    expect(advice.steps.join(' ')).toMatch(/Share/);
    expect(advice.steps.join(' ')).toMatch(/Add to Home Screen/);
    expect(advice.canPrompt).toBe(false);
  });

  it('sends other iOS browsers to Safari first', () => {
    expect(installAdvice('ios-other').steps.join(' ')).toMatch(/Safari/);
  });
});

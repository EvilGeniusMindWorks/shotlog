import { describe, expect, it } from 'vitest';
import { defaultEngineFor, isAppleWebKit } from './storageEnginePolicy';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const IPHONE_PWA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

describe('storage engine policy', () => {
  it('Apple WebKit prefers OPFS: iPhone Safari, the installed PWA, Chrome on iOS, Safari on Mac, iPad in desktop mode', () => {
    expect(defaultEngineFor(IPHONE_SAFARI)).toBe('opfs');
    expect(defaultEngineFor(IPHONE_PWA)).toBe('opfs');
    expect(defaultEngineFor(IPHONE_CHROME)).toBe('opfs');
    expect(defaultEngineFor(IPAD_DESKTOP_UA)).toBe('opfs');
    expect(defaultEngineFor(IPAD_DESKTOP_UA, 'MacIntel', 5)).toBe('opfs');
  });
  it('Chromium keeps IndexedDB (faster there): Chrome on Mac, Chrome on Android', () => {
    expect(defaultEngineFor(MAC_CHROME)).toBe('idb');
    expect(defaultEngineFor(ANDROID_CHROME)).toBe('idb');
    expect(isAppleWebKit(ANDROID_CHROME)).toBe(false);
  });
  it('never picks OPFS where the browser cannot open it', () => {
    expect(defaultEngineFor(IPHONE_SAFARI, '', 0, false)).toBe('idb');
  });
});

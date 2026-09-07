// Which SQLite storage engine a device should default to (2026-09-07).
//
// Measured on Matthew's iPhone after the legacy-PDF migration: the same
// 567 records took 25.3 s to apply through IndexedDB and 1.4 s through
// OPFS. Before the migration both read ~24 s because the 8 MB download and
// the slow IndexedDB writes overlapped — which hid this. On desktop
// Chromium IndexedDB is the faster of the two (0.6 s vs 1.3 s), so the
// rule is: Apple WebKit (every iOS browser, Safari on Mac) prefers OPFS;
// everything else keeps IndexedDB. Pure, so it is unit-tested; the
// client's preflight applies it only when the browser can actually open
// OPFS, and only to devices with no existing copy or an idle one.
export type StorageEngine = 'idb' | 'opfs';

export function isAppleWebKit(ua: string, platform = '', maxTouchPoints = 0): boolean {
  const iOS = /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const safari = /Safari\//.test(ua) && /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg\/|OPR\/|CriOS|FxiOS/.test(ua);
  return iOS || safari;
}

/** The engine a fresh device should start on */
export function defaultEngineFor(ua: string, platform = '', maxTouchPoints = 0, opfsAvailable = true): StorageEngine {
  return opfsAvailable && isAppleWebKit(ua, platform, maxTouchPoints) ? 'opfs' : 'idb';
}

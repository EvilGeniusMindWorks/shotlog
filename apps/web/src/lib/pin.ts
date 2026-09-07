// The device PIN, per ACCOUNT (Matthew's invite test, 2026-09-07).
//
// Before: one key per browser ('shotlog-pin'), never cleared by sign-out or
// enrolment — a new account on a used browser skipped Set PIN and unlocked
// with the previous person's PIN. Now the key carries the user id; signing
// out, Forgot PIN and enrolling clear it; a PIN already on the account
// (set on another device) still seeds a new device at sign-in.
//
// Migration: an old 'shotlog-pin' value belongs to whoever is signed in
// when it is first read — it moves to their key silently, nobody re-sets.
const LEGACY_KEY = 'shotlog-pin';
const PREFIX = 'shotlog-pin:';

const keyFor = (userId: string) => `${PREFIX}${userId}`;

/** This user's PIN hash on this device (migrating the legacy key if present) */
export function devicePinHash(userId: string | undefined | null): string | null {
  try {
    if (!userId) return null;
    const own = localStorage.getItem(keyFor(userId));
    if (own) return own;
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      localStorage.setItem(keyFor(userId), legacy);
      localStorage.removeItem(LEGACY_KEY);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

export function setDevicePin(userId: string, hash: string): void {
  try {
    localStorage.setItem(keyFor(userId), hash);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* private mode */
  }
}

/** Forget this user's PIN on this device (Change PIN, Forgot PIN, sign-out) */
export function clearDevicePin(userId: string | undefined | null): void {
  try {
    if (userId) localStorage.removeItem(keyFor(userId));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* private mode */
  }
}

/** Forget every PIN on this device — enrolling a NEW account must always
 *  land on Set PIN, whoever used the browser before */
export function clearAllDevicePins(): void {
  try {
    const gone: string[] = [LEGACY_KEY];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) gone.push(k);
    }
    for (const k of gone) localStorage.removeItem(k);
  } catch {
    /* private mode */
  }
}

// Rehearsal mode (Round S6) — the client half. Start: stash the real
// session and this device's first-run state, swap in a sandbox session for
// the chosen role, wipe the local replica, reload — the gate then runs the
// whole first-run (PIN → welcome → walkthrough) as a brand-new person.
// End: wipe the sandbox server-side, restore the stash, reload as yourself.
import { authedFetch, getSession, type SessionPayload } from '@/lib/session';
import { resetLocalReplica } from '@/db/powersync/client';

const REHEARSAL_KEY = 'shotlog-rehearsal';
const STASH_KEY = 'shotlog-rehearsal-stash';

/** Wipe the local replica COMPLETELY before switching accounts. A partial
 *  clear (the 8s race this used to be) left a replica that connected but
 *  never reached a checkpoint — resetLocalReplica waits, then deletes the
 *  database outright if the SDK will not release it. */
async function clearReplica(): Promise<void> {
  await resetLocalReplica();
}

/** Everything that makes this device "yours" or "already onboarded" */
const STASHED_KEYS = [
  'shotlog-access-token',
  'shotlog-refresh-token',
  'shotlog-user-email',
  'shotlog-user-info',
  'shotlog-pin',
  'shotlog-view-role',
  'shotlog-tour-done',
  'shotlog-first-week-hidden',
  'shotlog-first-week-manual',
  'shotlog-profile-nag-until',
  'shotlog-install-dismissed',
  'shotlog-feedback-outbox',
];

export const REHEARSAL_ROLES = ['blaster', 'driller', 'supervisor', 'mechanic', 'office', 'admin'] as const;
export type RehearsalRole = (typeof REHEARSAL_ROLES)[number];

/** The role being rehearsed on this device, or null */
export function rehearsalRole(): RehearsalRole | null {
  try {
    return (localStorage.getItem(REHEARSAL_KEY) as RehearsalRole | null) ?? null;
  } catch {
    return null;
  }
}

interface StartResponse extends SessionPayload {
  sandbox: { id: string; name: string };
  role: RehearsalRole;
}

export async function startRehearsal(role: RehearsalRole): Promise<void> {
  if (!getSession().loggedIn) throw new Error('sign in first');
  const res = await authedFetch('/platform/rehearsal/start', {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `rehearsal failed (${res.status})`);
  }
  const data = (await res.json()) as StartResponse;
  // Stash the real device state, then become the rehearsal person
  const stash: Record<string, string | null> = {};
  for (const k of STASHED_KEYS) stash[k] = localStorage.getItem(k);
  localStorage.setItem(STASH_KEY, JSON.stringify(stash));
  for (const k of STASHED_KEYS) localStorage.removeItem(k);
  localStorage.setItem('shotlog-access-token', data.accessToken);
  localStorage.setItem('shotlog-refresh-token', data.refreshToken);
  localStorage.setItem('shotlog-user-email', data.user.email);
  localStorage.setItem('shotlog-user-info', JSON.stringify(data.user));
  localStorage.setItem(REHEARSAL_KEY, role);
  // Fresh replica for the sandbox company (the token carries its cid)
  await clearReplica();
  window.location.assign('/');
}

export async function endRehearsal(): Promise<void> {
  // Wipe the sandbox with the rehearsal session while we still hold it
  await authedFetch('/platform/rehearsal/end', { method: 'POST' }).catch(() => undefined);
  await clearReplica();
  let stash: Record<string, string | null> = {};
  try {
    stash = JSON.parse(localStorage.getItem(STASH_KEY) ?? '{}') as Record<string, string | null>;
  } catch {
    stash = {};
  }
  for (const k of STASHED_KEYS) {
    const v = stash[k];
    if (v === null || v === undefined) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  }
  localStorage.removeItem(STASH_KEY);
  localStorage.removeItem(REHEARSAL_KEY);
  localStorage.setItem('shotlog-last-active', String(Date.now()));
  window.location.assign('/');
}

/** One customer · site · job · rig in the sandbox */
export async function addSampleJob(): Promise<'added' | 'existing'> {
  const res = await authedFetch('/platform/rehearsal/sample', { method: 'POST' });
  if (!res.ok) throw new Error(`sample failed (${res.status})`);
  const body = (await res.json()) as { existing?: boolean };
  return body.existing ? 'existing' : 'added';
}

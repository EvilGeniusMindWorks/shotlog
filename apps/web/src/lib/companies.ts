// Companies (Round S8c): the platform admin's switch between Alpha / Beta /
// Production companies, and the Companies page's create / rename / move /
// delete. Switching mints a session for the hidden admin twin in the target
// company (server), carries this device's PIN over to the twin, clears the
// previous company's replica and reloads — the same shape as rehearsal,
// minus the stash (a switch is meant to stick).
import { authedFetch, getRealSessionUser, getSession, type SessionPayload } from '@/lib/session';
import { devicePinHash, setDevicePin } from '@/lib/pin';
import { resetLocalReplica } from '@/db/powersync/client';

export type Environment = 'alpha' | 'beta' | 'production' | 'sandbox';

export interface CompanySummary {
  id: string;
  name: string;
  environment: Environment;
  createdAt: string;
  people: number;
  records: number;
  current: boolean;
}

export const ENV_LABEL: Record<Environment, string> = { alpha: 'ALPHA', beta: 'BETA', production: '', sandbox: 'SANDBOX' };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(path, init);
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error ?? `request failed (${res.status})`);
  return body as T;
}

export async function listCompanies(): Promise<CompanySummary[]> {
  return (await call<{ companies: CompanySummary[] }>('/platform/companies')).companies;
}

export async function createCompany(input: { name: string; environment: Exclude<Environment, 'sandbox'>; fromCompanyId?: string }): Promise<CompanySummary> {
  return (await call<{ company: CompanySummary }>('/platform/companies', { method: 'POST', body: JSON.stringify(input) })).company;
}

export async function updateCompany(id: string, patch: { name?: string; environment?: Exclude<Environment, 'sandbox'> }): Promise<CompanySummary> {
  return (await call<{ company: CompanySummary }>(`/platform/companies/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })).company;
}

export async function movePeople(toCompanyId: string, userIds: string[]): Promise<{ moved: number; skipped: number }> {
  return call(`/platform/companies/${toCompanyId}/move-people`, { method: 'POST', body: JSON.stringify({ userIds }) });
}

export async function deleteCompany(id: string): Promise<void> {
  await call(`/platform/companies/${id}`, { method: 'DELETE' });
}

/** Become the target company's admin twin on this device and reload into it */
export async function switchCompany(id: string): Promise<void> {
  if (!getSession().loggedIn) throw new Error('sign in first');
  const me = getRealSessionUser();
  const data = await call<SessionPayload & { company: CompanySummary }>(`/platform/companies/${id}/switch`, { method: 'POST' });
  // The PIN follows the person, not the twin: copy this device's PIN across
  const pin = devicePinHash(me?.id);
  if (pin && data.user.id !== me?.id) setDevicePin(data.user.id, pin);
  localStorage.setItem('shotlog-access-token', data.accessToken);
  localStorage.setItem('shotlog-refresh-token', data.refreshToken);
  localStorage.setItem('shotlog-user-email', data.user.email);
  localStorage.setItem('shotlog-user-info', JSON.stringify(data.user));
  localStorage.setItem('shotlog-last-active', String(Date.now()));
  // Fresh replica for the new company (the token carries its cid)
  await resetLocalReplica();
  window.location.assign('/');
}

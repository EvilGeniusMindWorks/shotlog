// Account session: login/logout, token refresh, authed fetch, and the
// cached user profile (licenses, signature, PIN) that powers offline
// auto-fill. Extracted unchanged from the deleted custom sync engine —
// sync itself is PowerSync's job now (see src/db/powersync/).

const LS_KEYS = {
  serverUrl: 'shotlog-server-url',
  accessToken: 'shotlog-access-token',
  refreshToken: 'shotlog-refresh-token',
  userEmail: 'shotlog-user-email',
  userInfo: 'shotlog-user-info',
};

/** Production API server — pre-filled on the login screen */
export const DEFAULT_SERVER_URL = 'https://shotlogserver-production.up.railway.app';

export interface UserLicense {
  state: string;
  licenseNumber: string;
  expirationDate: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  company: string;
  licenses?: UserLicense[];
  /** Signature on file — PNG data URL */
  signature?: string | null;
  /** Offline unlock PIN (salted SHA-256) — follows the account */
  pinHash?: string | null;
}

export function getSessionUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(LS_KEYS.userInfo);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function getSession() {
  return {
    serverUrl: localStorage.getItem(LS_KEYS.serverUrl) ?? '',
    email: localStorage.getItem(LS_KEYS.userEmail) ?? '',
    loggedIn: Boolean(localStorage.getItem(LS_KEYS.refreshToken)),
  };
}

export async function login(serverUrl: string, email: string, password: string): Promise<void> {
  const url = serverUrl.replace(/\/$/, '');
  const res = await fetch(`${url}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `login failed (${res.status})`);
  }
  const data = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
    user: SessionUser;
  };
  localStorage.setItem(LS_KEYS.serverUrl, url);
  localStorage.setItem(LS_KEYS.userEmail, email);
  localStorage.setItem(LS_KEYS.accessToken, data.accessToken);
  localStorage.setItem(LS_KEYS.refreshToken, data.refreshToken);
  localStorage.setItem(LS_KEYS.userInfo, JSON.stringify(data.user));
}

export async function logout(): Promise<void> {
  const { serverUrl } = getSession();
  const refreshToken = localStorage.getItem(LS_KEYS.refreshToken);
  if (serverUrl && refreshToken) {
    await fetch(`${serverUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  localStorage.removeItem(LS_KEYS.accessToken);
  localStorage.removeItem(LS_KEYS.refreshToken);
  localStorage.removeItem(LS_KEYS.userEmail);
  localStorage.removeItem(LS_KEYS.userInfo);
}

/** Refresh the cached session user (name, role, licenses) from the server */
export async function refreshSessionUser(): Promise<SessionUser | null> {
  try {
    const res = await authedFetch('/auth/me');
    if (!res.ok) return getSessionUser();
    const body = (await res.json()) as { user: SessionUser };
    localStorage.setItem(LS_KEYS.userInfo, JSON.stringify(body.user));
    return body.user;
  } catch {
    return getSessionUser(); // offline — cached copy is authoritative
  }
}

/** Replace the signed-in user's licenses (one per state). Needs a connection. */
export async function updateMyLicenses(licenses: UserLicense[]): Promise<SessionUser> {
  const res = await authedFetch('/auth/me/licenses', {
    method: 'PUT',
    body: JSON.stringify({ licenses }),
  });
  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; licenses?: UserLicense[]; error?: string }
    | null;
  if (!res.ok) throw new Error(body?.error ?? 'failed to save licenses');
  const user = { ...getSessionUser()!, licenses: body?.licenses ?? licenses };
  localStorage.setItem(LS_KEYS.userInfo, JSON.stringify(user));
  return user;
}

/** Save (or clear) the signed-in user's signature on file. Needs a connection. */
export async function updateMySignature(signature: string | null): Promise<SessionUser> {
  const res = await authedFetch('/auth/me/signature', {
    method: 'PUT',
    body: JSON.stringify({ signature }),
  });
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? 'failed to save signature');
  const user = { ...getSessionUser()!, signature };
  localStorage.setItem(LS_KEYS.userInfo, JSON.stringify(user));
  return user;
}

/** Save the (client-hashed) unlock PIN to the account. Needs a connection. */
export async function updateMyPin(pinHash: string): Promise<void> {
  const res = await authedFetch('/auth/me/pin', {
    method: 'PUT',
    body: JSON.stringify({ pinHash }),
  });
  if (!res.ok) throw new Error('failed to save PIN');
  const user = getSessionUser();
  if (user) localStorage.setItem(LS_KEYS.userInfo, JSON.stringify({ ...user, pinHash }));
}

/** Change the signed-in user's password. Other sessions are signed out. */
export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await authedFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? 'failed to change password');
}

// Single-flight token refresh: refresh tokens rotate server-side, so two
// concurrent 401s must NOT both hit /auth/refresh — the loser would send an
// already-rotated token, get rejected, and log the user out.
let refreshInFlight: Promise<void> | null = null;

async function refreshTokens(serverUrl: string): Promise<void> {
  refreshInFlight ??= (async () => {
    const refreshToken = localStorage.getItem(LS_KEYS.refreshToken);
    if (!refreshToken) throw new Error('not logged in');
    const refresh = await fetch(`${serverUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!refresh.ok) {
      await logout();
      throw new Error('session expired — log in again');
    }
    const tokens = (await refresh.json()) as { accessToken: string; refreshToken: string };
    localStorage.setItem(LS_KEYS.accessToken, tokens.accessToken);
    localStorage.setItem(LS_KEYS.refreshToken, tokens.refreshToken);
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Fetch with bearer token; on 401 tries one refresh-and-retry */
export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const { serverUrl } = getSession();
  if (!serverUrl) throw new Error('not logged in');
  const attempt = () =>
    fetch(`${serverUrl}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem(LS_KEYS.accessToken) ?? ''}`,
      },
    });
  let res = await attempt();
  if (res.status === 401) {
    await refreshTokens(serverUrl);
    res = await attempt();
  }
  return res;
}

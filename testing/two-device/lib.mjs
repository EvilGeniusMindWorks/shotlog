// Shared harness helpers (2026-09-07). Every harness used to redefine
// sign-in, contexts, the API helper and its waits — and the fixed sleeps
// were the main source of flaky reruns. This is the one copy.
//
// Harness shape for the runner (testing/run.mjs):
//
//   async (page, lib) => {
//     const R = lib.report();
//     await R.section('mark starts a day', async () => { ... R.ok('…', cond) ... });
//     await R.section('ray sees only his work', async () => { ... });
//     return R.summary();
//   }
//
// Sections run in order; `node testing/run.mjs 49 --only 2` runs only §2
// (earlier sections' state is the author's business — keep sections
// independent, or accept that --only starts mid-story).

export const API = 'http://localhost:4000';
export const WEB = 'http://localhost:5199';

export const USERS = {
  mark: { email: 'mark@baystateblasting.com', pass: 'dev-password-123', role: 'admin' },
  blaster: { email: 'blaster@test.local', pass: 'blaster-pass-123', role: 'blaster' },
  supervisor: { email: 'supervisor@test.local', pass: 'super-pass-123', role: 'supervisor' },
  dinis: { email: 'dinis@test.local', pass: 'dinis-pass-123', role: 'driller' },
  mechanic: { email: 'mechanic@test.local', pass: 'mech-pass-1234', role: 'mechanic' },
  office: { email: 'office@test.local', pass: 'office-pass-123', role: 'office' },
};

export const stamp = () => Date.now().toString(36);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ISO date `n` days before today (local) */
export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Results + sections ──────────────────────────────────────────────────────

export function report() {
  const results = [];
  let n = 0;
  const only = globalThis.__harnessOnly instanceof Set ? globalThis.__harnessOnly : null;
  return {
    results,
    ok(name, cond) {
      results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
      return Boolean(cond);
    },
    note(text) {
      results.push(`NOTE ${text}`);
    },
    skip(text) {
      results.push(`SKIP ${text}`);
    },
    /** One independent chapter of the story. Errors are recorded and the
     *  next section still runs. */
    async section(name, fn) {
      const idx = ++n;
      if (only && !only.has(idx) && !only.has(name)) {
        results.push(`SKIP §${idx} ${name} (--only)`);
        return;
      }
      results.push(`§${idx} ${name}`);
      try {
        await fn();
      } catch (e) {
        results.push(`ERROR §${idx} ${name}: ${e?.message ?? e}`);
      }
    },
    summary() {
      const errs = browserErrors({ clear: true });
      if (errs.length) results.push(`NOTE browser errors seen: ${errs.length} — first: [${errs[0].kind}] ${errs[0].text.slice(0, 160)}`);
      if (errs.length && process.env.HARNESS_ERRORS) for (const e of errs) results.push(`NOTE   [${e.kind}] ${e.url} — ${e.text.slice(0, 200)}`);
      return results.join('\n');
    },
  };
}

// ── Browser contexts + sign-in ─────────────────────────────────────────────

/** A fresh device. Defaults mirror what nearly every harness set by hand:
 *  server URL, recent activity, a legacy device PIN (so sign-in lands in
 *  the app, not on Set PIN), tours done, first-week card hidden, profile
 *  nag snoozed. Pass `legacyPin: false` to exercise the PIN screens. */
const BROWSER_ERRORS = (globalThis.__browserErrors ??= []);
// Noise that is not a product bug: network failures while a section is
// offline, favicon/tile 404s, devtools nags
const ERROR_NOISE = [/Failed to load resource/i, /net::ERR_/i, /favicon/i, /React DevTools/i, /\[vite\]/i, /WebSocket connection to 'ws:\/\/localhost/i];
function attachErrorSpy(p) {
  const push = (kind, text) => {
    // the harness's own init script touching localStorage on about:blank
    if (p.url() === 'about:blank' || p.url() === '') return;
    if (ERROR_NOISE.some((re) => re.test(text))) return;
    BROWSER_ERRORS.push({ kind, text: String(text).slice(0, 300), url: p.url() });
  };
  p.on('console', (m) => { if (m.type() === 'error') push('console', m.text()); });
  p.on('pageerror', (e) => push('pageerror', e?.message ?? e));
}
/** Errors the spy has seen since the last clear — a harness asserts on this */
export function browserErrors({ clear = false } = {}) {
  const out = BROWSER_ERRORS.slice();
  if (clear) BROWSER_ERRORS.length = 0;
  return out;
}

export async function mkCtx(browser, opts = {}) {
  const {
    legacyPin = true,
    tourDone = true,
    firstWeekHidden = true,
    nagSnoozed = true,
    viewport = { width: 1280, height: 900 },
    extra = '',
    ...rest
  } = opts;
  const ctx = await browser.newContext({ viewport, ...rest });
  // Error spy (S10): every page in every harness context reports console
  // errors, page errors and unhandled rejections into one list. Existing
  // harnesses get a NOTE in their summary; new ones assert on browserErrors().
  ctx.on('page', (p) => attachErrorSpy(p));
  await ctx.addInitScript(`
    localStorage.setItem('shotlog-server-url', '${API}');
    localStorage.setItem('shotlog-last-active', String(Date.now()));
    ${legacyPin ? "if (!localStorage.getItem('shotlog-pin-seeded')) { localStorage.setItem('shotlog-pin', 'x'); localStorage.setItem('shotlog-pin-seeded', '1'); }" : ''}
    ${tourDone ? "localStorage.setItem('shotlog-tour-done', '1');" : ''}
    ${firstWeekHidden ? "localStorage.setItem('shotlog-first-week-hidden', '1');" : ''}
    ${nagSnoozed ? "localStorage.setItem('shotlog-profile-nag-until', String(Date.now() + 864e5));" : ''}
    ${extra}
  `);
  return ctx;
}

/** Sign in and wait for whatever comes next (home, a gate screen, a tour)
 *  — never a fixed sleep. Returns the page. */
export async function signIn(P, user, { sync = true, timeout = 20000, pin = '123456' } = {}) {
  const u = typeof user === 'string' ? USERS[user] : user;
  await P.goto(WEB);
  await P.locator('input[type="email"]').fill(u.email);
  await P.locator('input[type="password"]').fill(u.pass);
  await P.getByRole('button', { name: 'Sign in' }).click();
  await P.locator('input[type="email"]').waitFor({ state: 'detached', timeout });
  await P.locator('main, [data-tour-overlay], [data-change-password], [data-welcome], [data-pin-pad]').first().waitFor({ timeout }).catch(() => undefined);
  // PIN is per account (2026-09-07): an account with no PIN on this device
  // and none on the account is asked to set one — do it, then carry on
  await passPinSetup(P, pin);
  if (sync) await waitForSync(P).catch(() => undefined);
  return P;
}

/** If the gate is asking for a new PIN, set (and confirm) one */
export async function passPinSetup(P, pin = '123456') {
  if (!(await P.getByText(/Set a 6-digit PIN/).count())) return false;
  for (const d of pin + pin) await P.getByRole('button', { name: d, exact: true }).click();
  await P.locator('main, [data-tour-overlay], [data-welcome]').first().waitFor({ timeout: 15000 }).catch(() => undefined);
  if (await P.getByRole('button', { name: /Let.s go/ }).count()) {
    await P.getByRole('button', { name: /Let.s go/ }).click();
    await P.locator('main').first().waitFor({ timeout: 15000 }).catch(() => undefined);
  }
  return true;
}

/** Until PowerSync reports the first download complete (`hasSynced`).
 *  Fresh devices pull the whole company; asserting before this is the
 *  classic flake. */
export async function waitForSync(P, timeout = 25000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const done = await P.evaluate(async () => {
      try {
        const { getPowerSync } = await import('/src/db/powersync/client.ts');
        return getPowerSync().currentStatus?.hasSynced === true;
      } catch {
        return false;
      }
    }).catch(() => false);
    if (done) return true;
    await sleep(250);
  }
  throw new Error('first sync did not complete in time');
}

/** Wait until the page's uploads have drained (nothing local left to send) */
export async function waitForUpload(P, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const clean = await P.evaluate(async () => {
      try {
        const { getPowerSync } = await import('/src/db/powersync/client.ts');
        const ps = getPowerSync();
        const st = ps.currentStatus;
        if (st && st.dataFlowStatus && st.dataFlowStatus.uploading) return false;
        const rows = await ps.getAll('SELECT count(*) AS n FROM ps_crud');
        return (rows[0]?.n ?? 0) === 0;
      } catch {
        return false;
      }
    }).catch(() => false);
    if (clean) return true;
    await sleep(250);
  }
  return false;
}

/** Wait for text in an element (regex), not for a clock */
export async function waitText(P, selector, re, timeout = 10000) {
  await P.waitForFunction(
    ({ selector, src, flags }) => new RegExp(src, flags).test(document.querySelector(selector)?.textContent ?? ''),
    { selector, src: re.source, flags: re.flags },
    { timeout },
  ).catch(() => undefined);
  return re.test(await P.locator(selector).first().innerText().catch(() => ''));
}

export async function skipTours(P, rounds = 2) {
  for (let i = 0; i < rounds; i++) {
    if (await P.locator('[data-tour-skip]').count()) {
      await P.locator('[data-tour-skip]').click();
      await sleep(300);
    }
  }
}

/** Every localStorage key that starts with shotlog-pin */
export function pinKeys(P) {
  return P.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('shotlog-pin')) out[k] = localStorage.getItem(k);
    }
    return out;
  });
}

// ── Server API (Playwright's request context; the runner has no fetch guarantees) ──

export function apiFor(page) {
  return async (path, init = {}, token) => {
    const res = await page.request.fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      data: init.body,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  };
}

/** Log in over the API: { token, user } */
export async function apiLogin(page, user) {
  const u = typeof user === 'string' ? USERS[user] : user;
  const api = apiFor(page);
  const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: u.email, password: u.pass }) });
  if (r.status !== 200) throw new Error(`login failed for ${u.email}: ${r.status}`);
  return { token: r.body.accessToken, user: r.body.user, api };
}

// ── Cleanup as admin ───────────────────────────────────────────────────────

/** Delete harness days (cascade), drill logs (+holes), plans, checklists —
 *  on an ADMIN page so the server accepts every delete. */
export async function cleanupAsAdmin(browser, { days = [], drillLogs = [], drillPlans = [], checklists = [] } = {}) {
  const ctx = await mkCtx(browser);
  const P = await ctx.newPage();
  await signIn(P, 'mark');
  const removed = await P.evaluate(async ({ days, drillLogs, drillPlans, checklists }) => {
    const { db, deleteWithTombstone } = await import('/src/db/index.ts');
    const { deleteDayCascade } = await import('/src/lib/lifecycle.ts');
    let n = 0;
    for (const id of days.filter(Boolean)) {
      const day = await db.blastDays.get(id);
      if (day) {
        await deleteDayCascade(day);
        n++;
      }
    }
    for (const id of drillLogs.filter(Boolean)) {
      for (const h of await db.drillLogHoles.where('drillLogId').equals(id).toArray()) await deleteWithTombstone('drillLogHoles', h.id);
      if (await db.drillLogs.get(id)) await deleteWithTombstone('drillLogs', id);
    }
    for (const id of drillPlans.filter(Boolean)) if (await db.drillPlans.get(id)) await deleteWithTombstone('drillPlans', id);
    for (const id of checklists.filter(Boolean)) if (await db.drillChecklists.get(id)) await deleteWithTombstone('drillChecklists', id);
    return n;
  }, { days, drillLogs, drillPlans, checklists });
  await waitForUpload(P);
  await ctx.close();
  return removed;
}

/** Deactivate harness accounts by email (accounts are never hard-deleted) */
export async function deactivateUsers(page, adminToken, predicate) {
  const api = apiFor(page);
  const users = (await api('/users', {}, adminToken)).body?.users ?? [];
  for (const u of users.filter(predicate)) {
    await api(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, adminToken);
  }
}

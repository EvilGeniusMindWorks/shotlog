async (page) => {
  // Round S6 — Rehearsal mode (2026-09-07): the platform admin picks a role
  // in Settings → is signed into the SANDBOX company as a brand-new person
  // → Set PIN → role welcome → walkthrough → rehearsal bar → empty jobs →
  // Add sample job → works → End wipes the sandbox and restores the real
  // session + PIN. Office rehearsal lands on the queue. Non-platform
  // admins get 403.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const API = 'http://localhost:4000';
  const WEB = 'http://localhost:5199';

  const mkCtx = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    // Init scripts run on EVERY load — re-seeding the device PIN would hide
    // the Set-PIN step of the rehearsal, so only seed it outside a rehearsal
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', '${API}');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      if (!localStorage.getItem('shotlog-rehearsal')) localStorage.setItem('shotlog-pin', 'x');
    `);
    return ctx;
  };
  const signIn = async (P, email, pass) => {
    await P.goto(WEB);
    await P.locator('input[type="email"]').fill(email);
    await P.locator('input[type="password"]').fill(pass);
    await P.getByRole('button', { name: 'Sign in' }).click();
    await P.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await P.waitForTimeout(1500);
  };
  const api = async (path, init = {}, token) => {
    const res = await page.request.fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      data: init.body,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  };
  const enterPin = async (P) => {
    for (const d of '123456123456') await P.getByRole('button', { name: d, exact: true }).click();
    await P.waitForTimeout(800);
  };
  try {
    const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'mark@baystateblasting.com', password: 'dev-password-123' }) });
    const adminTok = login.body.accessToken;
    const bl = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'blaster@test.local', password: 'blaster-pass-123' }) });
    const denied = await api('/platform/rehearsal/start', { method: 'POST', body: JSON.stringify({ role: 'driller' }) }, bl.body.accessToken);
    ok('a company admin who is not the platform admin cannot start a rehearsal (403)', denied.status === 403);

    // ── 1. rehearse as blaster ──────────────────────────────────────────
    const c1 = await mkCtx();
    const P1 = await c1.newPage();
    await signIn(P1, 'mark@baystateblasting.com', 'dev-password-123');
    await P1.goto(`${WEB}/settings`);
    await P1.waitForTimeout(1500);
    ok('Settings shows Rehearse as… for the platform admin', (await P1.locator('[data-rehearsal-card]').count()) === 1);
    await P1.locator('[data-rehearse-as="blaster"]').click();
    await P1.getByText(/Set a 6-digit PIN/).waitFor({ timeout: 20000 });
    ok('rehearsal starts as a brand-new person: Set PIN first', true);
    await enterPin(P1);
    const welcome = await P1.locator('body').innerText();
    ok('field welcome (blaster copy)', /Welcome, Rehearsal/.test(welcome) && /Tap \+ to start work/.test(welcome));
    await P1.getByRole('button', { name: /Let.s go/ }).click();
    await P1.locator('[data-tour-overlay]').waitFor({ timeout: 8000 });
    ok('walkthrough auto-runs (field script)', /blasting log and daily report/.test(await P1.locator('[data-tour-overlay]').innerText()));
    await P1.locator('[data-tour-skip]').click();
    await P1.waitForTimeout(800);
    ok('rehearsal bar shows the role', (await P1.locator('[data-rehearsal-bar="blaster"]').count()) === 1);
    ok('signed into the sandbox company', /ShotLog Sandbox/.test(await P1.locator('aside').innerText()));
    ok('first-week card is back (device dismissal cleared)', (await P1.locator('[data-first-week]').count()) === 1);
    await P1.goto(`${WEB}/jobs`);
    await P1.waitForTimeout(3000);
    ok('sandbox starts empty (no jobs)', /No jobs yet/.test(await P1.locator('main').innerText()));
    await P1.locator('[data-rehearsal-sample]').click();
    await P1.getByText(/Added a week/).waitFor({ timeout: 20000 });
    await P1.waitForTimeout(4000); // sync down
    ok('sample jobs appear (S7a: two)', (await P1.locator('[data-jobs-list] [data-list-row]').count()) === 2 && /Ledgeville/.test(await P1.locator('[data-jobs-list]').innerText()));
    const dayId = await P1.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const jobs = await db.jobs.toArray();
      return createBlastDay(jobs[0].id);
    });
    ok('the rehearsal blaster can start work', Boolean(dayId));
    await P1.waitForTimeout(3000);
    const st1 = await api('/platform/rehearsal/status', {}, adminTok);
    ok('server status: sandbox holds the sample week + the new day', st1.body?.tables?.jobs === 2 && st1.body?.tables?.blastDays === 3 && st1.body.tables.productCatalog > 0);
    // feedback from the sandbox is stored but not mailed
    const rehTok = await P1.evaluate(() => localStorage.getItem('shotlog-access-token'));
    const fb = await api('/feedback', { method: 'POST', body: JSON.stringify({ id: `reh-${Date.now()}-00000001`, kind: 'idea', message: 'S6 harness sandbox note', route: '/', buildId: 'harness' }) }, rehTok);
    ok('sandbox feedback is stored with notified=sandbox (never mailed)', fb.status === 201 && fb.body.notified === 'sandbox');
    // End → back to mark, PIN intact, sandbox empty
    await P1.goto(WEB);
    await P1.waitForTimeout(1500);
    await P1.locator('[data-rehearsal-end]').click();
    await P1.waitForTimeout(4000);
    const back = await P1.locator('body').innerText();
    ok('End returns to the real account without a PIN prompt', /Dashboard/.test(back) && !/Set a 6-digit PIN/.test(back) && (await P1.locator('[data-rehearsal-bar]').count()) === 0);
    const me = await P1.evaluate(() => JSON.parse(localStorage.getItem('shotlog-user-info') ?? '{}').email);
    ok('session is Mark again', me === 'mark@baystateblasting.com');
    ok('back in Baystate (rail shows the company)', /Baystate/.test(await P1.locator('aside').innerText()));
    const st2 = await api('/platform/rehearsal/status', {}, adminTok);
    ok('sandbox wiped: reference data + roster only', !st2.body?.tables?.jobs && !st2.body?.tables?.blastDays && st2.body?.tables?.crewMembers === 6 && st2.body.tables.productCatalog > 0);
    ok('rehearsal accounts reset to day one', st2.body.users.every((u) => !u.onboardedAt && !u.tourDoneAt && !u.pinHash));
    const fbList = await api('/feedback', {}, adminTok);
    ok('sandbox feedback wiped with the sandbox', !(fbList.body?.feedback ?? []).some((f) => f.message === 'S6 harness sandbox note'));
    await c1.close();

    // ── 2. rehearse as office → the queue ───────────────────────────────
    const c2 = await mkCtx();
    const P2 = await c2.newPage();
    await signIn(P2, 'mark@baystateblasting.com', 'dev-password-123');
    await P2.goto(`${WEB}/settings`);
    await P2.waitForTimeout(1500);
    await P2.locator('[data-rehearse-as="office"]').click();
    await P2.getByText(/Set a 6-digit PIN/).waitFor({ timeout: 20000 });
    await enterPin(P2);
    // innerText applies text-transform (uppercase eyebrow) — case-insensitive
    ok('office welcome copy', /Approvals, cards, and the record book/i.test(await P2.locator('body').innerText()));
    await P2.getByRole('button', { name: /Let.s go/ }).click();
    await P2.locator('[data-tour-overlay]').waitFor({ timeout: 8000 });
    await P2.locator('[data-tour-skip]').click();
    await P2.waitForTimeout(800);
    ok('office rehearsal lands on the queue home', (await P2.locator('[data-office-home]').count()) === 1 && (await P2.locator('[data-rehearsal-bar="office"]').count()) === 1);
    await P2.locator('[data-rehearsal-end]').click();
    await P2.waitForTimeout(4000);
    ok('End works from the office rehearsal too', (await P2.locator('[data-rehearsal-bar]').count()) === 0 && /Baystate/.test(await P2.locator('aside').innerText()));
    // after the account switch the replica must be Baystate's, fully synced
    await P2.goto(`${WEB}/jobs`);
    await P2.waitForTimeout(5000);
    const jobsBack = await P2.locator('[data-jobs-list] [data-list-row]').count();
    ok(`Baystate data re-downloaded after End (${jobsBack} jobs visible)`, jobsBack > 0);
    // Sync panel: Reset local data → clean replica → data comes back
    P2.on('dialog', (d) => d.accept());
    await P2.locator('aside button[title^="Sync status"]').click();
    await P2.locator('[data-sync-reset]').waitFor({ timeout: 5000 });
    await P2.locator('[data-sync-reset]').click();
    await P2.waitForTimeout(6000);
    await P2.goto(`${WEB}/jobs`);
    await P2.waitForTimeout(5000);
    ok('Reset local data clears and re-downloads the company', (await P2.locator('[data-jobs-list] [data-list-row]').count()) > 0 && (await P2.locator('[data-sync-first]').count()) === 0);
    // The boot-time delete path (what a wedged replica falls back to):
    // flag → reload → the database is deleted before PowerSync opens → fresh download
    await P2.evaluate(() => localStorage.setItem('shotlog-replica-reset-pending', '1'));
    await P2.reload();
    await P2.waitForTimeout(6000);
    const bootLog = await P2.evaluate(() => localStorage.getItem('shotlog-sync-log') ?? '');
    const flagCleared = await P2.evaluate(() => localStorage.getItem('shotlog-replica-reset-pending'));
    await P2.goto(`${WEB}/jobs`);
    await P2.waitForTimeout(5000);
    ok('boot-time reset deletes the database and the company re-downloads', /deleted at boot/.test(bootLog) && flagCleared === null && (await P2.locator('[data-jobs-list] [data-list-row]').count()) > 0);
    await c2.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
  }
  return results.join('\n');
}

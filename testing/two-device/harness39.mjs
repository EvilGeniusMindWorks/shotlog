async (page) => {
  // Round S2 — Guidance (2026-09-06): role-aware walkthrough auto-runs ONCE
  // per account and navigates real screens; Skip/Done record tourDoneAt on
  // the account (no repeat on reload); re-run from the ? menu and Settings;
  // "About this screen" coach sheet is role- and view-aware; first-week
  // checklist self-ticks, manual ticks persist, Hide sticks; empty states
  // say the next action.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const API = 'http://localhost:4000';
  const WEB = 'http://localhost:5199';

  const mkCtx = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, ...opts });
    // NOTE: no legacy 'shotlog-tour-done' — this harness wants the auto-run
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', '${API}');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      localStorage.setItem('shotlog-pin', 'x');
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
    const go = P.getByRole('button', { name: /Let.s go/ });
    if (await go.count()) {
      await go.click();
      await P.waitForTimeout(1500);
    }
  };
  const api = async (path, init = {}, token) => {
    const res = await page.request.fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      data: init.body,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  };
  const me = async (tok) => (await api('/auth/me', {}, tok)).body?.user;
  // tourDoneAt has no "unset" endpoint on purpose, so the auto-run case uses
  // a FRESH account (and dinis, whom the dev backfill skipped); re-run cases
  // use existing accounts. Re-running this harness needs dinis reset:
  //   docker exec -i powersync-spike-pg-1 psql -U postgres -d shotlog -c
  //   "UPDATE \"User\" SET \"tourDoneAt\" = NULL WHERE email = 'dinis@test.local'"
  let adminTok;
  let dayId;
  const stamp = Date.now().toString(36);
  try {
    const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'mark@baystateblasting.com', password: 'dev-password-123' }) });
    adminTok = login.body.accessToken;
    ok('session payload carries tourDoneAt', 'tourDoneAt' in login.body.user);

    // ── 1. fresh blaster account: tour auto-runs once, navigates, Skip records it ──
    const inv = await api('/admin/invites', { method: 'POST', body: JSON.stringify({ name: `S2 Blaster ${stamp}`, email: `s2-${stamp}@test.local`, role: 'blaster' }) }, adminTok);
    const token = inv.body.link.split('/enroll/')[1];
    const enrolled = await api(`/enroll/${token}`, { method: 'POST', body: JSON.stringify({ password: 'harness-pw-1' }) });
    ok('new account starts with tourDoneAt null', enrolled.body.user.tourDoneAt === null);
    const c1 = await mkCtx();
    const P1 = await c1.newPage();
    await signIn(P1, `s2-${stamp}@test.local`, 'harness-pw-1');
    await P1.locator('[data-tour-overlay]').waitFor({ timeout: 8000 });
    const t1 = await P1.locator('[data-tour-overlay]').innerText();
    ok('tour auto-runs on first open with the field welcome', /Welcome to ShotLog/.test(t1) && /blasting log and daily report/.test(t1));
    await P1.locator('[data-tour-next]').click();
    await P1.waitForTimeout(700);
    const t2 = await P1.locator('[data-tour-overlay]').innerText();
    ok('step 2 spotlights the Dashboard bands', /Your Dashboard/.test(t2) && /Three bands/.test(t2));
    await P1.locator('[data-tour-next]').click();
    await P1.waitForTimeout(500);
    ok('step 3 is the + button', /Start work at a job/.test(await P1.locator('[data-tour-overlay]').innerText()));
    await P1.locator('[data-tour-next]').click();
    await P1.waitForTimeout(1200);
    ok('step 4 NAVIGATES to /jobs', P1.url().endsWith('/jobs') && /Jobs/.test(await P1.locator('[data-tour-overlay]').innerText()));
    await P1.locator('[data-tour-skip]').click();
    await P1.waitForTimeout(1200);
    ok('Skip closes the tour', (await P1.locator('[data-tour-overlay]').count()) === 0);
    const m1 = await me(enrolled.body.accessToken);
    ok('Skip records tourDoneAt on the ACCOUNT', Boolean(m1?.tourDoneAt));
    await P1.goto(WEB);
    await P1.waitForTimeout(2500);
    ok('no auto-run after reload', (await P1.locator('[data-tour-overlay]').count()) === 0);
    // first-week card: license + signature open, tour ticked
    const fw = P1.locator('[data-first-week]');
    ok('first-week card shows on the field home', (await fw.count()) === 1);
    ok('walkthrough item ticked itself; license item open', (await P1.locator('[data-first-week-item="tour"][data-done="true"]').count()) === 1 && (await P1.locator('[data-first-week-item="license"][data-done="false"]').count()) === 1);
    // re-run from the ? menu
    await P1.locator('header [data-help-button]').click();
    await P1.locator('[data-help-walkthrough]').click();
    await P1.locator('[data-tour-overlay]').waitFor({ timeout: 5000 });
    ok('Walkthrough re-runs from the ? menu', true);
    await P1.locator('[data-tour-skip]').click();
    await P1.waitForTimeout(500);
    // About this screen — home (field copy) and /jobs
    await P1.locator('header [data-help-button]').click();
    await P1.locator('[data-help-coach]').click();
    const c1t = await P1.locator('[data-coach-sheet]').innerText();
    // innerText applies text-transform (uppercase eyebrow) — case-insensitive
    ok('About this screen on the field home', /About this screen/i.test(c1t) && /Dashboard/.test(c1t) && /Tap \+ to start work/.test(c1t));
    await P1.getByRole('button', { name: 'Got it' }).click();
    await P1.locator('[data-tour="nav-/jobs"]:visible').click();
    await P1.waitForTimeout(800);
    await P1.locator('header [data-help-button]').click();
    await P1.locator('[data-help-coach]').click();
    ok('coach is route-aware (Jobs)', /Jobs/.test(await P1.locator('[data-coach-sheet] h2').innerText()));
    await P1.getByRole('button', { name: 'Got it' }).click();
    // day hub view-aware coach
    await P1.waitForTimeout(3000); // first sync
    dayId = await P1.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const jobs = await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray();
      return createBlastDay(jobs[0].id);
    });
    await P1.goto(`${WEB}/blast-day/${dayId}?view=blast-log`);
    await P1.waitForTimeout(2000);
    await P1.locator('header [data-help-button]').click();
    await P1.locator('[data-help-coach]').click();
    ok('coach is VIEW-aware (Blasting log)', /Blasting log/.test(await P1.locator('[data-coach-sheet] h2').innerText()));
    await P1.getByRole('button', { name: 'Still stuck — ask' }).click();
    await P1.locator('[data-feedback-composer]').waitFor({ timeout: 20000 });
    ok('"Still stuck — ask" opens the feedback composer as a question', (await P1.locator('[data-feedback-kind="question"][aria-checked="true"]').count()) === 1);
    await P1.getByRole('button', { name: 'Cancel' }).click();
    await P1.waitForTimeout(3000);
    await c1.close();

    // ── 2. driller (dinis, tourDoneAt null in dev): driller script + coach ──
    const c2 = await mkCtx();
    const P2 = await c2.newPage();
    await signIn(P2, 'dinis@test.local', 'dinis-pass-123');
    await P2.locator('[data-tour-overlay]').waitFor({ timeout: 8000 });
    const d1 = await P2.locator('[data-tour-overlay]').innerText();
    ok('driller gets the driller script', /Checklist, drill log, my hours/.test(d1));
    await P2.locator('[data-tour-next]').click();
    await P2.waitForTimeout(700);
    ok('driller step 2 = the three tiles (home anchor)', /Your three tiles/.test(await P2.locator('[data-tour-overlay]').innerText()));
    await P2.locator('[data-tour-next]').click();
    await P2.waitForTimeout(1200);
    ok('driller step 3 navigates to /drilling', P2.url().endsWith('/drilling'));
    // walk to the end with Done
    await P2.locator('[data-tour-next]').click();
    await P2.waitForTimeout(1000);
    await P2.locator('[data-tour-next]').click();
    await P2.waitForTimeout(700);
    ok('last step is Help & feedback, with Done', /Stuck\? Start here/.test(await P2.locator('[data-tour-overlay]').innerText()) && (await P2.locator('[data-tour-done]').count()) === 1);
    await P2.locator('[data-tour-done]').click();
    await P2.waitForTimeout(800);
    await P2.goto(WEB);
    await P2.waitForTimeout(2000);
    await P2.locator('header [data-help-button]').click();
    await P2.locator('[data-help-coach]').click();
    ok('driller home coach = My Drilling', /My Drilling/.test(await P2.locator('[data-coach-sheet] h2').innerText()));
    await P2.getByRole('button', { name: 'Got it' }).click();
    await c2.close();

    // ── 3. mechanic (tour already done): no auto-run; first-week manual tick + Hide ──
    const c3 = await mkCtx();
    const P3 = await c3.newPage();
    await signIn(P3, 'mechanic@test.local', 'mech-pass-1234');
    await P3.waitForTimeout(2500);
    ok('no auto-run for an account with tourDoneAt', (await P3.locator('[data-tour-overlay]').count()) === 0);
    ok('first-week card on the mechanic home', (await P3.locator('[data-first-week]').count()) === 1);
    await P3.locator('[data-first-week-item="order"] button[aria-label="Mark done"]').click();
    await P3.waitForTimeout(300);
    ok('manual item ticks', (await P3.locator('[data-first-week-item="order"][data-done="true"]').count()) === 1);
    await P3.reload();
    await P3.waitForTimeout(2500);
    ok('manual tick persists on this device', (await P3.locator('[data-first-week-item="order"][data-done="true"]').count()) === 1);
    await P3.locator('header [data-help-button]').click();
    await P3.locator('[data-help-coach]').click();
    ok('mechanic home coach = My Shop', /My Shop/.test(await P3.locator('[data-coach-sheet] h2').innerText()));
    await P3.getByRole('button', { name: 'Got it' }).click();
    await P3.locator('[data-first-week-hide]').click();
    await P3.waitForTimeout(300);
    await P3.reload();
    await P3.waitForTimeout(2500);
    ok('Hide sticks across reload', (await P3.locator('[data-first-week]').count()) === 0);
    await c3.close();

    // ── 4. office (desktop): Settings walkthrough → office script navigates to Records ──
    const c4 = await mkCtx({ viewport: { width: 1280, height: 900 } });
    const P4 = await c4.newPage();
    await signIn(P4, 'office@test.local', 'office-pass-123');
    await P4.goto(`${WEB}/settings`);
    await P4.waitForTimeout(1500);
    await P4.locator('[data-settings-walkthrough]').click();
    await P4.locator('[data-tour-overlay]').waitFor({ timeout: 5000 });
    ok('Settings › Walkthrough starts the office script', /Everything the crews file/.test(await P4.locator('[data-tour-overlay]').innerText()));
    await P4.locator('[data-tour-next]').click();
    await P4.waitForTimeout(1200);
    ok('office step 2 navigates home + spotlights it', P4.url().replace(/\/$/, '') === WEB && /Your queue/.test(await P4.locator('[data-tour-overlay]').innerText()));
    await P4.locator('[data-tour-next]').click();
    await P4.waitForTimeout(1200);
    ok('office step 3 navigates to /records via the sidebar anchor', P4.url().endsWith('/records'));
    await P4.locator('[data-tour-skip]').click();
    await P4.waitForTimeout(500);
    await P4.locator('aside [data-help-button]').click();
    await P4.locator('[data-help-submenu]').waitFor({ timeout: 3000 });
    ok('desktop Help & feedback sub-menu has About this screen / Walkthrough / Send feedback', (await P4.locator('[data-help-coach]').count()) === 1 && (await P4.locator('[data-help-walkthrough]').count()) === 1 && (await P4.locator('[data-help-feedback]').count()) === 1);
    await P4.locator('[data-help-coach]').click();
    ok('Records coach', /Records/.test(await P4.locator('[data-coach-sheet] h2').innerText()));
    await c4.close();

    // ── 5. admin: admin script goes to People ──
    const c5 = await mkCtx({ viewport: { width: 1280, height: 900 } });
    const P5 = await c5.newPage();
    await signIn(P5, 'mark@baystateblasting.com', 'dev-password-123');
    await P5.locator('aside [data-help-button]').click();
    await P5.locator('[data-help-walkthrough]').waitFor({ timeout: 8000 });
    await P5.locator('[data-help-walkthrough]').click();
    await P5.locator('[data-tour-overlay]').waitFor({ timeout: 5000 });
    await P5.locator('[data-tour-next]').click();
    await P5.waitForTimeout(1500);
    ok('admin step 2 navigates to Admin › People', P5.url().endsWith('/admin/people') && /People/.test(await P5.locator('[data-tour-overlay]').innerText()));
    await P5.locator('[data-tour-skip]').click();
    // cleanup the harness day as admin
    await P5.goto(WEB);
    await P5.waitForTimeout(3000);
    const removed = await P5.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { deleteDayCascade } = await import('/src/lib/lifecycle.ts');
      const day = await db.blastDays.get(id);
      if (!day) return false;
      await deleteDayCascade(day);
      return true;
    }, dayId);
    await P5.waitForTimeout(3000);
    ok('harness day cleaned up', removed);
    await c5.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
  } finally {
    try {
      if (adminTok) {
        const users = (await api('/users', {}, adminTok)).body.users;
        for (const u of users.filter((x) => x.email.startsWith(`s2-${stamp}`)))
          await api(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, adminTok);
      }
    } catch {}
  }
  return results.join('\n');
}

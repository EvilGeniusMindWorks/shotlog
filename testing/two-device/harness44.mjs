async (page) => {
  // Round S7c — screen tours (2026-09-07): a short tour auto-runs the first
  // time an ACCOUNT opens the screen where the work happens (day hub → shot,
  // drill log, rig checklist, shop, approvals, people); Done/Skip records the
  // screen on the account so a second device never repeats it; re-runnable
  // from ? → "Show me …"; never on top of the walkthrough, never right after
  // another tour; the rehearsal reset clears them.
  // Pre-step (tours are append-only on purpose):
  //   docker exec -i powersync-spike-pg-1 psql -U postgres -d shotlog -c
  //   "UPDATE \"User\" SET \"toursDone\"='[]' WHERE email IN ('blaster@test.local','dinis@test.local','mechanic@test.local','office@test.local','mark@baystateblasting.com')"
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const API = 'http://localhost:4000';
  const WEB = 'http://localhost:5199';

  // NOTE: no legacy 'shotlog-tour-done' — that key suppresses every auto-run
  const mkCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', '${API}');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-first-week-hidden', '1');
    `);
    return ctx;
  };
  const signIn = async (P, email, pass) => {
    await P.goto(WEB);
    await P.locator('input[type="email"]').fill(email);
    await P.locator('input[type="password"]').fill(pass);
    await P.getByRole('button', { name: 'Sign in' }).click();
    await P.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await P.waitForTimeout(2500);
  };
  const api = async (path, init = {}, token) => {
    const res = await page.request.fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      data: init.body,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  };
  const toursOf = async (P) =>
    P.evaluate(async () => {
      const { authedFetch } = await import('/src/lib/session.ts');
      return (await (await authedFetch('/auth/me')).json()).user.toursDone;
    });
  const overlay = (P) => P.locator('[data-tour-overlay]');
  const stepThrough = async (P, max = 10) => {
    for (let i = 0; i < max; i++) {
      if (await P.locator('[data-tour-done]').count()) {
        await P.locator('[data-tour-done]').click();
        return i + 1;
      }
      await P.locator('[data-tour-next]').click();
      await P.waitForTimeout(700);
    }
    return -1;
  };
  let dayId;
  let adminTok;
  try {
    const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'mark@baystateblasting.com', password: 'dev-password-123' }) });
    adminTok = login.body.accessToken;
    ok('session payload carries toursDone', Array.isArray(login.body.user.toursDone));

    // ── 1. blaster: the day tour, hub → shot, once ──────────────────────
    const c1 = await mkCtx();
    const P1 = await c1.newPage();
    await signIn(P1, 'blaster@test.local', 'blaster-pass-123');
    // The role walkthrough may still be due for this account — that is S2's
    // auto-run, not a screen tour; get it out of the way and clear the cooldown
    const homeKind = (await overlay(P1).count()) ? await overlay(P1).getAttribute('data-tour-kind') : null;
    ok('no SCREEN tour on the home for a blaster (walkthrough only, if due)', homeKind === null || homeKind === 'walkthrough');
    if (homeKind) {
      await P1.locator('[data-tour-skip]').click();
      await P1.waitForTimeout(500);
      await P1.evaluate(() => sessionStorage.removeItem('shotlog-tour-last-ended'));
    }
    dayId = await P1.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const jobs = await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray();
      return createBlastDay(jobs[0].id, undefined, undefined, { name: 'S7c tour day' });
    });
    await P1.goto(`${WEB}/blast-day/${dayId}`);
    await overlay(P1).waitFor({ timeout: 8000 });
    ok('the day tour auto-runs the first time a work day opens', (await overlay(P1).getAttribute('data-tour-kind')) === 'day' && /Your work day/.test(await overlay(P1).innerText()));
    await P1.locator('[data-tour-next]').click();
    await P1.waitForTimeout(700);
    ok('stop 2 spotlights the spine', /The spine/.test(await overlay(P1).innerText()) && (await P1.locator('[data-tour="day-spine"]').count()) === 1);
    await P1.locator('[data-tour-next]').click();
    await P1.waitForTimeout(700);
    ok('stop 3 spotlights the tabs', /Day · Blast Log · Daily Report/.test(await overlay(P1).innerText()));
    await P1.locator('[data-tour-next]').click();
    await P1.waitForTimeout(1200);
    ok('stop 4 NAVIGATES to the blast log view and spotlights drill parameters', /view=blast-log/.test(P1.url()) && /drill parameters/i.test(await overlay(P1).innerText()));
    const n = await stepThrough(P1);
    ok(`the rest of the shot stops end with Done (${n + 3} stops)`, n > 0);
    await P1.waitForTimeout(800);
    ok('Done records the screen on the ACCOUNT', (await toursOf(P1)).includes('day'));
    await P1.goto(`${WEB}/blast-day/${dayId}`);
    await P1.waitForTimeout(2500);
    ok('no repeat on the next open', (await overlay(P1).count()) === 0);
    // Re-run from Help
    await P1.locator('aside [data-help-button]').click();
    const item = P1.locator('[data-help-screen-tour="day"]');
    ok('? menu offers "Show me your work day"', (await item.count()) === 1 && /Show me your work day/.test(await item.innerText()));
    await item.click();
    await overlay(P1).waitFor({ timeout: 5000 });
    ok('the tour re-runs on request', (await overlay(P1).getAttribute('data-tour-kind')) === 'day');
    await P1.locator('[data-tour-skip]').click();
    await P1.waitForTimeout(500);
    await c1.close();

    // ── 2. driller: checklist tour, then the drill log tour under cooldown ─
    const c2 = await mkCtx();
    const P2 = await c2.newPage();
    await signIn(P2, 'dinis@test.local', 'dinis-pass-123');
    // dinis's walkthrough may be pending — get it out of the way first
    if (await overlay(P2).count()) {
      await P2.locator('[data-tour-skip]').click();
      await P2.waitForTimeout(500);
    }
    await P2.evaluate(() => sessionStorage.removeItem('shotlog-tour-last-ended'));
    const rigId = await P2.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      return (await db.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill')).first())?.id;
    });
    await P2.goto(`${WEB}/drill-checklist/${rigId}`);
    await overlay(P2).waitFor({ timeout: 8000 });
    ok('the checklist tour auto-runs on the rig checklist', (await overlay(P2).getAttribute('data-tour-kind')) === 'checklist' && /The rig checklist/.test(await overlay(P2).innerText()));
    await P2.locator('[data-tour-next]').click();
    await P2.waitForTimeout(700);
    ok('stop 2 spotlights the rig question', /Which rig\?/.test(await overlay(P2).innerText()) && (await P2.locator('[data-tour="chk-rig"]').count()) === 1);
    await stepThrough(P2);
    await P2.waitForTimeout(800);
    ok('checklist recorded on the account', (await toursOf(P2)).includes('checklist'));
    // Straight on to a drill log: within the cooldown, NO auto-run (one sitting)
    const logId = await P2.evaluate(async (dayId) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const day = await db.blastDays.get(dayId);
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      return createDrillLog(shot, dayId, day.jobId);
    }, dayId);
    await P2.goto(`${WEB}/blast-day/${dayId}/drill-log/${logId}`);
    await P2.waitForTimeout(2500);
    ok('right after a tour, the next screen does NOT start another (cooldown)', (await overlay(P2).count()) === 0);
    ok('…but Help offers it', (await (await P2.locator('aside [data-help-button]').click(), P2.locator('[data-help-screen-tour="drill-log"]')).count()) === 1);
    await P2.locator('[data-help-screen-tour="drill-log"]').click();
    await overlay(P2).waitFor({ timeout: 5000 });
    ok('the drill-log tour runs on request', /The drill log/.test(await overlay(P2).innerText()));
    await P2.locator('[data-tour-next]').click();
    await P2.waitForTimeout(700);
    ok('stop 2 spotlights the hole entry box', /Tap the holes you drilled/.test(await overlay(P2).innerText()) && (await P2.locator('[data-tour="log-entry"]').count()) === 1);
    await stepThrough(P2);
    await P2.waitForTimeout(800);
    ok('drill-log recorded on the account', (await toursOf(P2)).includes('drill-log'));
    // After the cooldown (cleared here), a not-yet-seen screen auto-runs again
    await P2.evaluate(() => sessionStorage.removeItem('shotlog-tour-last-ended'));
    await P2.goto(`${WEB}/blast-day/${dayId}/drill-log/${logId}`);
    await P2.waitForTimeout(2500);
    ok('a seen screen never auto-runs again even after the cooldown', (await overlay(P2).count()) === 0);
    await c2.close();

    // ── 3. mechanic: the shop tour on the home (after the walkthrough) ──
    const c3 = await mkCtx();
    const P3 = await c3.newPage();
    await signIn(P3, 'mechanic@test.local', 'mech-pass-1234');
    if ((await overlay(P3).count()) && (await overlay(P3).getAttribute('data-tour-kind')) === 'walkthrough') {
      await P3.locator('[data-tour-skip]').click();
      await P3.waitForTimeout(500);
      await P3.evaluate(() => sessionStorage.removeItem('shotlog-tour-last-ended'));
      await P3.reload();
      await P3.waitForTimeout(2500);
    }
    await overlay(P3).waitFor({ timeout: 8000 });
    ok('the shop tour auto-runs on the mechanic home', (await overlay(P3).getAttribute('data-tour-kind')) === 'shop' && /My Shop/.test(await overlay(P3).innerText()));
    await P3.locator('[data-tour-next]').click();
    await P3.waitForTimeout(700);
    ok('stop 2 spotlights the trio', /Down · Tickets · Due/.test(await overlay(P3).innerText()) && (await P3.locator('[data-tour="shop-trio"]').count()) === 1);
    await P3.locator('[data-tour-skip]').click();
    await P3.waitForTimeout(800);
    ok('Skip records it too', (await toursOf(P3)).includes('shop'));
    await c3.close();

    // ── 4. office → approvals · admin → people ──────────────────────────
    const c4 = await mkCtx();
    const P4 = await c4.newPage();
    await signIn(P4, 'office@test.local', 'office-pass-123');
    if (await overlay(P4).count()) {
      await P4.locator('[data-tour-skip]').click();
      await P4.evaluate(() => sessionStorage.removeItem('shotlog-tour-last-ended'));
    }
    await P4.goto(`${WEB}/admin/approvals`);
    await overlay(P4).waitFor({ timeout: 8000 });
    ok('the approvals tour auto-runs for the office', (await overlay(P4).getAttribute('data-tour-kind')) === 'approvals');
    await stepThrough(P4);
    await P4.waitForTimeout(800);
    ok('approvals recorded', (await toursOf(P4)).includes('approvals'));
    await P4.goto(`${WEB}/admin/people`);
    await P4.waitForTimeout(2500);
    ok('People has no tour for the office (admin only)', (await overlay(P4).count()) === 0);
    await c4.close();

    const c5 = await mkCtx();
    const P5 = await c5.newPage();
    await signIn(P5, 'mark@baystateblasting.com', 'dev-password-123');
    if (await overlay(P5).count()) {
      await P5.locator('[data-tour-skip]').click();
      await P5.evaluate(() => sessionStorage.removeItem('shotlog-tour-last-ended'));
    }
    await P5.goto(`${WEB}/admin/people`);
    await overlay(P5).waitFor({ timeout: 8000 });
    ok('the people tour auto-runs for the admin', (await overlay(P5).getAttribute('data-tour-kind')) === 'people');
    await P5.locator('[data-tour-next]').click();
    await P5.waitForTimeout(700);
    ok('stop 2 spotlights Add person', /Add a person/.test(await overlay(P5).innerText()) && (await P5.locator('[data-tour="people-add"]').count()) === 1);
    await stepThrough(P5);
    await P5.waitForTimeout(800);
    ok('people recorded', (await toursOf(P5)).includes('people'));
    // Rehearsal reset clears screen tours for the rehearsal accounts
    const st = await api('/platform/rehearsal/status', {}, adminTok);
    ok('rehearsal status reports toursDone per account', (st.body.users ?? []).every((u) => Array.isArray(u.toursDone)));
    // cleanup
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
  }
  return results.join('\n');
}

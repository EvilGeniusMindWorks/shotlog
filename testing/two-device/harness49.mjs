async (page) => {
  // Whose work shows up + the PIN that never asked (Matthew's invite test,
  // 2026-09-07; plan artifact ed13a981, all Build): a NEW blaster enrolled
  // on a browser Mark used lands on Set PIN (not Mark's PIN) and sees a
  // quiet home — none of Mark's days, drafts or patterns unasked; Mark's
  // work is one tap away under Days › Everyone and found by search; Mark
  // keeps seeing his own day, his stale draft and the driller's finished
  // log on HIS plan; the Days scope is remembered per device; sign-out
  // forgets the PIN; an old device's legacy PIN migrates silently.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const API = 'http://localhost:4000';
  const WEB = 'http://localhost:5199';
  const stamp = Date.now().toString(36);
  const RAY_EMAIL = `s8-ray-${stamp}@test.local`;
  const RAY_NAME = `Ray Harness${stamp}`;

  const mkCtx = async (legacyPin = true) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', '${API}');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      ${legacyPin ? "if (!localStorage.getItem('shotlog-pin-seeded')) { localStorage.setItem('shotlog-pin', 'x'); localStorage.setItem('shotlog-pin-seeded', '1'); }" : ''}
      localStorage.setItem('shotlog-tour-done', '1');
      localStorage.setItem('shotlog-first-week-hidden', '1');
      localStorage.setItem('shotlog-profile-nag-until', String(Date.now() + 864e5));
    `);
    return ctx;
  };
  const signIn = async (P, email, pass) => {
    await P.goto(WEB);
    await P.locator('input[type="email"]').fill(email);
    await P.locator('input[type="password"]').fill(pass);
    await P.getByRole('button', { name: 'Sign in' }).click();
    await P.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await P.waitForTimeout(3000);
  };
  const api = async (path, init = {}, token) => {
    const res = await page.request.fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      data: init.body,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  };
  const skipTours = async (P) => {
    for (let i = 0; i < 2; i++) {
      if (await P.locator('[data-tour-skip]').count()) {
        await P.locator('[data-tour-skip]').click();
        await P.waitForTimeout(400);
      }
    }
  };
  const pinKeys = (P) =>
    P.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('shotlog-pin')) out[k] = localStorage.getItem(k);
      }
      return out;
    });

  let adminTok;
  let markDayId, markStaleId, planId, logId, rayDayId, markId, rayId;
  try {
    const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'mark@baystateblasting.com', password: 'dev-password-123' }) });
    adminTok = login.body.accessToken;
    const inv = await api('/admin/invites', { method: 'POST', body: JSON.stringify({ name: RAY_NAME, email: RAY_EMAIL, role: 'blaster' }) }, adminTok);
    ok('invite for a brand-new blaster created', inv.status === 201 && Boolean(inv.body.link));
    const token = inv.body.link.split('/enroll/')[1];

    // ── 1. "Mark" (blaster@) works: a day today, a stale draft, a plan ──
    const c1 = await mkCtx();
    const P1 = await c1.newPage();
    await signIn(P1, 'blaster@test.local', 'blaster-pass-123');
    await skipTours(P1);
    const made = await P1.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const { createDrillPlan } = await import('/src/hooks/useDrillPlans.ts');
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const me = JSON.parse(localStorage.getItem('shotlog-user-info'));
      const d = new Date(); d.setDate(d.getDate() - 4);
      const stale = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayId = await createBlastDay(jobs[0].id, undefined, undefined, { name: `S8 Mark day ${stamp}` });
      const staleId = await createBlastDay(jobs[1].id, stale, undefined, { name: `S8 Mark stale ${stamp}` });
      const { getPlanHoles } = await import('/src/hooks/useDrillPlans.ts');
      const planId = await createDrillPlan(jobs[0].id, `S8 pattern ${stamp}`);
      // a pattern only has holes to drill once it has a depth (1 × 2 × 20 ft)
      await db.drillPlans.update(planId, { rows: 1, cols: 2, defaultDepth: 20 });
      const planHoles = getPlanHoles(await db.drillPlans.get(planId))?.length ?? 0;
      return { dayId, staleId, planId, planHoles, meId: me.id, job0: jobs[0].name, job1: jobs[1].name };
    }, stamp);
    markDayId = made.dayId; markStaleId = made.staleId; planId = made.planId; markId = made.meId;
    ok(`Mark laid a pattern with holes to drill (${made.planHoles})`, made.planHoles > 0);
    await P1.waitForTimeout(1500);
    await P1.goto(WEB);
    await P1.waitForTimeout(2500);
    const markHome = await P1.locator('main').innerText();
    ok('Mark\'s home is mine-first and shows HIS day today', (await P1.locator('[data-home-scope]').getAttribute('data-home-scope')) === 'mine' && new RegExp(made.job0).test(markHome));
    ok('Mark\'s stale draft nags MARK', /Needs attention/i.test(markHome) && new RegExp(made.job1).test(markHome));
    await P1.waitForTimeout(3000); // let it all reach the server

    // ── 2. Matthew's move: open the invite on the SAME browser Mark used ─
    const before = await pinKeys(P1);
    ok('the browser still carries Mark\'s legacy PIN before the invite', 'shotlog-pin' in before || Object.keys(before).some((k) => k.startsWith('shotlog-pin:')));
    await P1.goto(`${WEB}/enroll/${token}`);
    await P1.getByText(new RegExp(`Welcome, ${RAY_NAME.split(' ')[0]}`)).waitFor({ timeout: 10000 });
    await P1.locator('input[type="password"]').nth(0).fill('ray-pw-12345');
    await P1.locator('input[type="password"]').nth(1).fill('ray-pw-12345');
    await P1.getByRole('button', { name: 'Create my account' }).click();
    // Full-page redirect into the gated app — wait for the gate, not a clock
    await P1.getByText(/Set a 6-digit PIN|Sign in/).waitFor({ timeout: 15000 });
    await P1.waitForTimeout(300);
    const gate = await P1.locator('body').innerText();
    ok('a NEW account on a used browser is asked to set its own PIN', /Set a 6-digit PIN/.test(gate));
    for (const d of '246813246813') await P1.getByRole('button', { name: d, exact: true }).click();
    await P1.waitForTimeout(800);
    if (await P1.getByRole('button', { name: /Let.s go/ }).count()) {
      await P1.getByRole('button', { name: /Let.s go/ }).click();
      await P1.waitForTimeout(1500);
    }
    await skipTours(P1);
    await P1.waitForTimeout(4000); // first sync of the company's records
    const after = await pinKeys(P1);
    rayId = await P1.evaluate(() => JSON.parse(localStorage.getItem('shotlog-user-info')).id);
    ok('Ray\'s PIN is stored under RAY\'s account; Mark\'s legacy key is gone', !('shotlog-pin' in after) && Boolean(after[`shotlog-pin:${rayId}`]) && after[`shotlog-pin:${rayId}`] !== 'x');

    // ── 3. Ray's home: quiet — none of Mark's work unasked ───────────────
    await P1.goto(WEB);
    await P1.waitForFunction(() => document.querySelector('[data-home-scope]'), null, { timeout: 8000 });
    // a fresh device is still applying the company's first sync — the Today
    // band renders once its query gets a turn, so wait for it, not a clock
    await P1.waitForFunction(() => document.querySelector('[data-today-empty]') || /resume/i.test(document.querySelector('main')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => undefined);
    await P1.waitForTimeout(500);
    const rayHome = await P1.locator('main').innerText();
    ok('Ray\'s home is mine-first', (await P1.locator('[data-home-scope]').getAttribute('data-home-scope')) === 'mine');
    ok('Ray sees no day today — not Mark\'s', (await P1.locator('[data-today-empty]').count()) === 1 && !new RegExp(`S8 Mark day`).test(rayHome));
    ok('Mark\'s stale draft does NOT nag Ray', !/Needs attention/i.test(rayHome));
    ok('the empty state names the door (Days › Everyone)', /Days › Everyone/.test(rayHome));
    const synced = await P1.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return Boolean(await db.blastDays.get(id));
    }, markDayId);
    ok('…yet Mark\'s day IS on Ray\'s device (availability unchanged)', synced);
    // the door: Days › Everyone
    await P1.getByRole('button', { name: 'Days › Everyone' }).click();
    await P1.waitForURL(/\/days\?scope=all/, { timeout: 8000 });
    await P1.locator('[data-days-scope="all"]').waitFor({ timeout: 8000 });
    await P1.waitForTimeout(800);
    ok('Days › Everyone lists Mark\'s day', new RegExp(made.job0).test(await P1.locator('main').innerText()));
    await P1.locator('[data-days-scope-opt="mine"]').click();
    await P1.waitForTimeout(600);
    ok('Mine hides it again', !new RegExp(made.job0).test(await P1.locator('main').innerText()) && (await P1.locator('[data-days-scope="mine"]').count()) === 1);
    await P1.getByPlaceholder('Search…').fill(made.job0.slice(0, 6));
    await P1.waitForTimeout(500);
    ok('search still finds everyone\'s days from Mine', new RegExp(made.job0).test(await P1.locator('main').innerText()));
    await P1.goto(`${WEB}/days`);
    await P1.locator('[data-days-scope]').waitFor({ timeout: 8000 });
    ok('the Days scope is remembered on the device (Mine)', (await P1.locator('[data-days-scope]').getAttribute('data-days-scope')) === 'mine');
    // Ray starts his own day → it is on his home; Mark's still is not
    const rayMade = await P1.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      return { id: await createBlastDay(jobs[2].id, undefined, undefined, { name: `S8 Ray day ${stamp}` }), job2: jobs[2].name };
    }, stamp);
    rayDayId = rayMade.id;
    const job2 = rayMade.job2;
    await P1.goto(WEB);
    await P1.waitForTimeout(2500);
    const rayHome2 = await P1.locator('main').innerText();
    const rayToday = rayHome2.split(/MY RECENT DAYS/i)[0] ?? rayHome2;
    ok('Ray\'s own day shows on his home; Mark\'s still does not', (await P1.locator('[data-today-empty]').count()) === 0 && new RegExp(job2).test(rayToday) && !new RegExp(made.job0).test(rayToday));
    await P1.waitForTimeout(3000);
    // sign out forgets Ray's PIN on this device
    await P1.goto(`${WEB}/profile`);
    await P1.getByRole('button', { name: /Sign Out/ }).click();
    await P1.waitForTimeout(2500);
    const afterOut = await pinKeys(P1);
    ok('signing out forgets Ray\'s PIN on this device', !afterOut[`shotlog-pin:${rayId}`] && !('shotlog-pin' in afterOut));
    await c1.close();

    // ── 4. Dinis finishes drilling Mark's pattern ────────────────────────
    const c2 = await mkCtx();
    const P2 = await c2.newPage();
    await signIn(P2, 'dinis@test.local', 'dinis-pass-123');
    await skipTours(P2);
    logId = await P2.evaluate(async ({ planId, count }) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillPlanLog } = await import('/src/hooks/useDrillPlans.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const plan = await db.drillPlans.get(planId);
      const logId = await createDrillPlanLog(plan);
      for (let n = 1; n <= count; n++) {
        const now = nowISO();
        await db.drillLogHoles.add({ id: generateId(), drillLogId: logId, date: todayISO(), holeNumber: String(n), angle: 0, actualDepth: 20, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      }
      return logId;
    }, { planId, count: made.planHoles });
    await P2.waitForTimeout(5000);
    const dinisSees = await P2.evaluate(async (logId) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.drillLogHoles.where('drillLogId').equals(logId).toArray()).length;
    }, logId);
    ok(`Dinis drilled every hole of Mark's pattern (${dinisSees}/${made.planHoles})`, dinisSees === made.planHoles);
    await c2.close();

    // ── 5. Mark on an OLD device (legacy PIN key): no PIN prompt; the
    //       finished pattern is on HIS home; Ray's day is not ─────────────
    const c3 = await mkCtx();
    const P3 = await c3.newPage();
    await signIn(P3, 'blaster@test.local', 'blaster-pass-123');
    await skipTours(P3);
    const keys3 = await pinKeys(P3);
    ok('an old device\'s legacy PIN migrates to Mark\'s account key (no re-set)', !('shotlog-pin' in keys3) && Boolean(keys3[`shotlog-pin:${markId}`]));
    await P3.waitForFunction(() => /ready for your review/.test(document.querySelector('main')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => undefined);
    const markHome2 = await P3.locator('main').innerText();
    const diag = await P3.evaluate(async ({ logId, planId }) => {
      const { db } = await import('/src/db/index.ts');
      const { getPlanHoles, planDrilledHoleNumbers } = await import('/src/hooks/useDrillPlans.ts');
      const { isMyPlan, myDayIds } = await import('/src/lib/mine.ts');
      const plan = await db.drillPlans.get(planId);
      const log = await db.drillLogs.get(logId);
      return {
        synced: Boolean(log) && (await db.drillLogHoles.where('drillLogId').equals(logId).toArray()).length,
        planHoles: getPlanHoles(plan)?.length ?? null,
        drilled: (await planDrilledHoleNumbers(planId)).size,
        mine: plan ? isMyPlan(plan) : null,
        myDays: (await myDayIds()).size,
      };
    }, { logId, planId });
    ok(`Mark's pattern, fully drilled by Dinis, is ready for MARK's review (${diag.drilled}/${diag.planHoles} synced, mine=${diag.mine})`, /S8 pattern/.test(markHome2) && /ready for your review/.test(markHome2));
    const markToday = markHome2.split(/MY RECENT DAYS/i)[0] ?? markHome2;
    ok('Ray\'s day is not on Mark\'s home', !new RegExp(job2).test(markToday.split(/TODAY/i)[1] ?? markToday));
    await P3.goto(`${WEB}/days`);
    await P3.locator('[data-days-scope]').waitFor({ timeout: 8000 });
    await P3.waitForTimeout(800);
    ok('Mark\'s Days list defaults to Mine', (await P3.locator('[data-days-scope]').getAttribute('data-days-scope')) === 'mine');
    const countOf = (txt) => Number((txt.match(/·\s*(\d+)\s*days?/) ?? [])[1] ?? 0);
    // the summaries query is heavy — wait for a month header, not a clock
    const monthHeader = () => P3.waitForFunction(() => /·\s*\d+\s*days?/.test(document.querySelector('main')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => undefined);
    await monthHeader();
    const mineCount = countOf(await P3.locator('main').innerText());
    await P3.locator('[data-days-scope-opt="all"]').click();
    await P3.waitForTimeout(400);
    await monthHeader();
    const allText = await P3.locator('main').innerText();
    ok(`Everyone shows more than Mine (${mineCount} → ${countOf(allText)}) and includes Ray's job`, countOf(allText) > mineCount && new RegExp(job2).test(allText));
    await c3.close();

    // ── 6. Admin: no switch, everything ──────────────────────────────────
    const c4 = await mkCtx();
    const P4 = await c4.newPage();
    await signIn(P4, 'mark@baystateblasting.com', 'dev-password-123');
    await skipTours(P4);
    await P4.goto(`${WEB}/days`);
    await P4.waitForTimeout(2000);
    const adminDays = await P4.locator('main').innerText();
    ok('admin\'s Days list has no scope switch and lists everyone', (await P4.locator('[data-days-scope]').count()) === 0 && new RegExp(job2).test(adminDays) && new RegExp(made.job0).test(adminDays));
    const removed = await P4.evaluate(async ({ ids, planId, logId }) => {
      const { db, deleteWithTombstone } = await import('/src/db/index.ts');
      const { deleteDayCascade } = await import('/src/lib/lifecycle.ts');
      let n = 0;
      for (const id of ids) {
        const day = id ? await db.blastDays.get(id) : undefined;
        if (day) { await deleteDayCascade(day); n++; }
      }
      if (logId) {
        for (const h of await db.drillLogHoles.where('drillLogId').equals(logId).toArray()) await deleteWithTombstone('drillLogHoles', h.id);
        if (await db.drillLogs.get(logId)) await deleteWithTombstone('drillLogs', logId);
      }
      if (planId && (await db.drillPlans.get(planId))) await deleteWithTombstone('drillPlans', planId);
      return n;
    }, { ids: [markDayId, markStaleId, rayDayId], planId, logId });
    await P4.waitForTimeout(3000);
    results.push(`PASS cleanup removed ${removed} day(s), the pattern and its log`);
    await c4.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
  } finally {
    try {
      if (adminTok) {
        const users = (await api('/users', {}, adminTok)).body.users;
        for (const u of users.filter((x) => x.email === RAY_EMAIL))
          await api(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, adminTok);
      }
    } catch {}
  }
  return results.join('\n');
}

async (page, lib) => {
  // Whose work shows up + the PIN that never asked (Matthew's invite test,
  // 2026-09-07; plan artifact ed13a981, all Build): a NEW blaster enrolled
  // on a browser Mark used lands on Set PIN (not Mark's PIN) and sees a
  // quiet home — none of Mark's days, drafts or patterns unasked; Mark's
  // work is one tap away under Days › Everyone and found by search; Mark
  // keeps seeing his own day, his stale draft and the driller's finished
  // log on HIS plan; the Days scope is remembered per device; sign-out
  // forgets the PIN; an old device's legacy PIN migrates silently.
  //
  // First harness on the shared lib + sections (node testing/run.mjs 49).
  // §1–§2 build the state the later sections read.
  const { mkCtx, signIn, skipTours, pinKeys, apiFor, apiLogin, waitForUpload, waitText, sleep, stamp: mkStamp, USERS } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const api = apiFor(page);
  const WEB = lib.WEB;
  const stamp = mkStamp();
  const RAY_EMAIL = `s8-ray-${stamp}@test.local`;
  const RAY_NAME = `Ray Harness${stamp}`;
  const monthCount = (txt) => Number((txt.match(/·\s*(\d+)\s*days?/) ?? [])[1] ?? 0);

  let adminTok, token;
  let markDayId, markStaleId, planId, logId, rayDayId, markId, rayId;
  let made = {};
  let job2 = '';

  await R.section('an invite for a brand-new blaster', async () => {
    adminTok = (await apiLogin(page, 'mark')).token;
    const inv = await api('/admin/invites', { method: 'POST', body: JSON.stringify({ name: RAY_NAME, email: RAY_EMAIL, role: 'blaster' }) }, adminTok);
    R.ok('invite created', inv.status === 201 && Boolean(inv.body.link));
    token = inv.body.link.split('/enroll/')[1];
  });

  // ── §2 Mark (blaster@) works: a day today, a stale draft, a pattern ──
  const c1 = await mkCtx(browser);
  const P1 = await c1.newPage();
  await R.section('Mark works: a day, a stale draft, a pattern', async () => {
    await signIn(P1, 'blaster');
    await skipTours(P1);
    made = await P1.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const { createDrillPlan, getPlanHoles } = await import('/src/hooks/useDrillPlans.ts');
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const me = JSON.parse(localStorage.getItem('shotlog-user-info'));
      const d = new Date(); d.setDate(d.getDate() - 4);
      const stale = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayId = await createBlastDay(jobs[0].id, undefined, undefined, { name: `S8 Mark day ${stamp}` });
      const staleId = await createBlastDay(jobs[1].id, stale, undefined, { name: `S8 Mark stale ${stamp}` });
      const planId = await createDrillPlan(jobs[0].id, `S8 pattern ${stamp}`);
      // a pattern only has holes to drill once it has a depth (1 × 2 × 20 ft)
      await db.drillPlans.update(planId, { rows: 1, cols: 2, defaultDepth: 20 });
      const planHoles = getPlanHoles(await db.drillPlans.get(planId))?.length ?? 0;
      return { dayId, staleId, planId, planHoles, meId: me.id, job0: jobs[0].name, job1: jobs[1].name };
    }, stamp);
    markDayId = made.dayId; markStaleId = made.staleId; planId = made.planId; markId = made.meId;
    R.ok(`Mark laid a pattern with holes to drill (${made.planHoles})`, made.planHoles > 0);
    await P1.goto(WEB);
    await waitText(P1, 'main', new RegExp(made.job0));
    await waitText(P1, 'main', /Needs attention/i); // the attention band is its own live query
    const markHome = await P1.locator('main').innerText();
    R.ok("Mark's home is mine-first and shows HIS day today", (await P1.locator('[data-home-scope]').getAttribute('data-home-scope')) === 'mine' && new RegExp(made.job0).test(markHome));
    R.ok("Mark's stale draft nags MARK", /Needs attention/i.test(markHome) && new RegExp(made.job1).test(markHome));
    await waitForUpload(P1);
  });

  // ── §3 Matthew's move: open the invite on the SAME browser Mark used ─
  await R.section('a new account on a used browser sets its OWN PIN', async () => {
    const before = await pinKeys(P1);
    R.ok("the browser still carries Mark's PIN before the invite", Object.keys(before).length > 0);
    await P1.goto(`${WEB}/enroll/${token}`);
    await P1.getByText(new RegExp(`Welcome, ${RAY_NAME.split(' ')[0]}`)).waitFor({ timeout: 10000 });
    await P1.locator('input[type="password"]').nth(0).fill('ray-pw-12345');
    await P1.locator('input[type="password"]').nth(1).fill('ray-pw-12345');
    await P1.getByRole('button', { name: 'Create my account' }).click();
    // Full-page redirect into the gated app — wait for the gate, not a clock
    await P1.getByText(/Set a 6-digit PIN|Sign in/).waitFor({ timeout: 15000 });
    R.ok('a NEW account on a used browser is asked to set its own PIN', /Set a 6-digit PIN/.test(await P1.locator('body').innerText()));
    for (const d of '246813246813') await P1.getByRole('button', { name: d, exact: true }).click();
    await P1.getByRole('button', { name: /Let.s go/ }).waitFor({ timeout: 8000 }).catch(() => undefined);
    if (await P1.getByRole('button', { name: /Let.s go/ }).count()) await P1.getByRole('button', { name: /Let.s go/ }).click();
    await skipTours(P1);
    await lib.waitForSync(P1);
    const after = await pinKeys(P1);
    rayId = await P1.evaluate(() => JSON.parse(localStorage.getItem('shotlog-user-info')).id);
    R.ok("Ray's PIN is stored under RAY's account; Mark's legacy key is gone", !('shotlog-pin' in after) && Boolean(after[`shotlog-pin:${rayId}`]) && after[`shotlog-pin:${rayId}`] !== 'x');
  });

  // ── §4 Ray's home: quiet — none of Mark's work unasked ───────────────
  await R.section("Ray's home shows none of Mark's work unasked", async () => {
    await P1.goto(WEB);
    await P1.waitForFunction(() => document.querySelector('[data-today-empty]') || /resume/i.test(document.querySelector('main')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => undefined);
    const rayHome = await P1.locator('main').innerText();
    R.ok("Ray's home is mine-first", (await P1.locator('[data-home-scope]').getAttribute('data-home-scope')) === 'mine');
    R.ok("Ray sees no day today — not Mark's", (await P1.locator('[data-today-empty]').count()) === 1 && !new RegExp(made.job0).test(rayHome.split(/MY RECENT DAYS/i)[0]));
    R.ok("Mark's stale draft does NOT nag Ray", !/Needs attention/i.test(rayHome));
    R.ok('the empty state names the door (Days › Everyone)', /Days › Everyone/.test(rayHome));
    const synced = await P1.evaluate(async (id) => (await import('/src/db/index.ts')).db.blastDays.get(id).then(Boolean), markDayId);
    R.ok("…yet Mark's day IS on Ray's device (availability unchanged)", synced);
  });

  await R.section('Days › Everyone is the door; Mine is remembered; search spans everyone', async () => {
    await P1.getByRole('button', { name: 'Days › Everyone' }).click();
    await P1.waitForURL(/\/days\?scope=all/, { timeout: 8000 });
    await P1.locator('[data-days-scope="all"]').waitFor({ timeout: 8000 });
    R.ok("Days › Everyone lists Mark's day", await waitText(P1, 'main', new RegExp(made.job0)));
    await P1.locator('[data-days-scope-opt="mine"]').click();
    await sleep(400);
    R.ok('Mine hides it again', !new RegExp(made.job0).test(await P1.locator('main').innerText()) && (await P1.locator('[data-days-scope="mine"]').count()) === 1);
    await P1.getByPlaceholder('Search…').fill(made.job0.slice(0, 6));
    R.ok("search still finds everyone's days from Mine", await waitText(P1, 'main', new RegExp(made.job0), 4000));
    await P1.goto(`${WEB}/days`);
    await P1.locator('[data-days-scope]').waitFor({ timeout: 8000 });
    R.ok('the Days scope is remembered on the device (Mine)', (await P1.locator('[data-days-scope]').getAttribute('data-days-scope')) === 'mine');
  });

  await R.section("Ray's own day shows; sign-out forgets his PIN", async () => {
    const rayMade = await P1.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      return { id: await createBlastDay(jobs[2].id, undefined, undefined, { name: `S8 Ray day ${stamp}` }), job2: jobs[2].name };
    }, stamp);
    rayDayId = rayMade.id;
    job2 = rayMade.job2;
    await P1.goto(WEB);
    await waitText(P1, 'main', new RegExp(job2));
    const rayHome2 = await P1.locator('main').innerText();
    const rayToday = rayHome2.split(/MY RECENT DAYS/i)[0] ?? rayHome2;
    R.ok("Ray's own day shows on his home; Mark's still does not", (await P1.locator('[data-today-empty]').count()) === 0 && new RegExp(job2).test(rayToday) && !new RegExp(made.job0).test(rayToday));
    await waitForUpload(P1);
    await P1.goto(`${WEB}/profile`);
    await P1.getByRole('button', { name: /Sign Out/ }).click();
    await P1.locator('input[type="email"]').waitFor({ timeout: 10000 }).catch(() => undefined);
    const afterOut = await pinKeys(P1);
    R.ok("signing out forgets Ray's PIN on this device", !afterOut[`shotlog-pin:${rayId}`] && !('shotlog-pin' in afterOut));
    await c1.close();
  });

  // ── §7 Dinis finishes drilling Mark's pattern ────────────────────────
  await R.section("Dinis drills every hole of Mark's pattern", async () => {
    const c2 = await mkCtx(browser);
    const P2 = await c2.newPage();
    await signIn(P2, 'dinis');
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
    await waitForUpload(P2);
    const dinisSees = await P2.evaluate(async (logId) => (await import('/src/db/index.ts')).db.drillLogHoles.where('drillLogId').equals(logId).toArray().then((a) => a.length), logId);
    R.ok(`Dinis drilled every hole of Mark's pattern (${dinisSees}/${made.planHoles})`, dinisSees === made.planHoles);
    await c2.close();
  });

  // ── §8 Mark on an OLD device (legacy PIN): no prompt; the pattern is his ─
  await R.section("Mark's old device: legacy PIN migrates; the finished pattern is HIS", async () => {
    const c3 = await mkCtx(browser);
    const P3 = await c3.newPage();
    await signIn(P3, 'blaster');
    await skipTours(P3);
    const keys3 = await pinKeys(P3);
    R.ok("an old device's legacy PIN migrates to Mark's account key (no re-set)", !('shotlog-pin' in keys3) && Boolean(keys3[`shotlog-pin:${markId}`]));
    const ready = await waitText(P3, 'main', /ready for your review/, 15000);
    const markHome2 = await P3.locator('main').innerText();
    R.ok("Mark's pattern, fully drilled by Dinis, is ready for MARK's review", ready && /S8 pattern/.test(markHome2));
    const markToday = (markHome2.split(/MY RECENT DAYS/i)[0] ?? markHome2).split(/TODAY/i)[1] ?? '';
    R.ok("Ray's day is not on Mark's home", !new RegExp(job2).test(markToday));
    await P3.goto(`${WEB}/days`);
    await P3.locator('[data-days-scope]').waitFor({ timeout: 8000 });
    R.ok("Mark's Days list defaults to Mine", (await P3.locator('[data-days-scope]').getAttribute('data-days-scope')) === 'mine');
    await waitText(P3, 'main', /·\s*\d+\s*days?/, 15000);
    const mineCount = monthCount(await P3.locator('main').innerText());
    await P3.locator('[data-days-scope-opt="all"]').click();
    await waitText(P3, 'main', new RegExp(job2), 15000);
    const allText = await P3.locator('main').innerText();
    R.ok(`Everyone shows more than Mine (${mineCount} → ${monthCount(allText)}) and includes Ray's job`, monthCount(allText) > mineCount && new RegExp(job2).test(allText));
    await c3.close();
  });

  // ── §9 Admin: no switch, everything; then cleanup ─────────────────────
  await R.section('admin sees everyone, no switch; cleanup', async () => {
    const c4 = await mkCtx(browser);
    const P4 = await c4.newPage();
    await signIn(P4, 'mark');
    await skipTours(P4);
    await P4.goto(`${WEB}/days`);
    await waitText(P4, 'main', new RegExp(job2), 15000);
    const adminDays = await P4.locator('main').innerText();
    R.ok("admin's Days list has no scope switch and lists everyone", (await P4.locator('[data-days-scope]').count()) === 0 && new RegExp(job2).test(adminDays) && new RegExp(made.job0).test(adminDays));
    await c4.close();
  });

  const removed = await lib.cleanupAsAdmin(browser, { days: [markDayId, markStaleId, rayDayId], drillLogs: [logId], drillPlans: [planId] }).catch((e) => `cleanup failed: ${e.message}`);
  R.ok(`cleanup removed ${removed} day(s), the pattern and its log`, typeof removed === 'number');
  if (adminTok) await lib.deactivateUsers(page, adminTok, (u) => u.email === RAY_EMAIL).catch(() => undefined);
  void USERS;
  return R.summary();
}

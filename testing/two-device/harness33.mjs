async (page) => {
  // Round 3 — Driller experience verification: trio home (checklist · log ·
  // hours + yesterday-needs-you), batch-first hole panel (log-N-as-planned,
  // skip as ordinary action), advisory 50-hour clock on the checklist,
  // drill-only solo file card, and the retired no-plan path.
  // A = admin (mark), D = driller (dinis).
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const mkCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      localStorage.setItem('shotlog-tour-done', '1');
    `);
    return ctx;
  };
  const login = async (p, email, pass) => {
    await p.goto('http://localhost:5199');
    await p.locator('input[type="email"]').fill(email);
    await p.locator('input[type="password"]').fill(pass);
    await p.getByRole('button', { name: 'Sign in' }).click();
    await p.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await p.waitForTimeout(3500);
  };
  const SYNC = 4500;
  let A, D, ctxA, ctxD;
  try {
    ctxA = await mkCtx();
    A = await ctxA.newPage();
    await login(A, 'mark@baystateblasting.com', 'dev-password-123');

    // Known driller password via admin reset (dev creds are unknown)
    const dinisId = await A.evaluate(async () => {
      const { authedFetch } = await import('/src/lib/session.ts');
      const { users } = await (await authedFetch('/users')).json();
      const d = users.find((u) => u.email.includes('dinis@'));
      await authedFetch(`/users/${d.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ tempPassword: 'dinis-pass-123' }),
      });
      return d.id;
    });

    // Setup as admin: a job + drill plan (3×4 grid, 12 holes @ 20 ft) + a
    // rig with a weekly-done checklist 45 h ago (due-soon clock)
    const setup = await A.evaluate(async (dinisId) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const now = nowISO();
      const jobs = await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray();
      const jobId = jobs[0].id;
      const planId = generateId();
      await db.drillPlans.add({
        id: planId, jobId, name: 'H33 Pattern', status: 'open', rows: 3, cols: 4,
        defaultDepth: 20, overrides: {}, holeDiameter: 3.5, burden: 8, spacing: 10,
        createdBy: 'harness', createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      const rigId = generateId();
      await db.equipment.add({
        id: rigId, assetNumber: 'H33-RIG', description: 'Harness drill', category: 'rock_drill',
        isActive: true, status: 'active', hourMeter: 1445,
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      // Weekly service done 5 days ago at 1,400 h; a shop correction today
      // puts the LEDGER's current meter at 1,445 → 45/50, due in 5 h.
      // (The clock reads the ledger, not the bare registry number, and a
      // same-day checklist would flip the page read-only.)
      const fiveAgo = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
      await db.drillChecklists.add({
        id: generateId(), equipmentId: rigId, date: fiveAgo, startingHours: 1400,
        daily: {}, weeklyDone: true, weekly: {}, repairsNote: '', outOfService: false,
        drillerUserId: dinisId, drillerName: 'Dinis M.', signatureImage: null,
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      const { getSessionUser } = await import('/src/lib/session.ts');
      const admin = getSessionUser();
      await db.hourCorrections.add({
        id: generateId(), equipmentId: rigId, observedHours: 1445, previousHours: 1400,
        note: 'H33 clock probe', correctedByUserId: admin.id, correctedByName: admin.name,
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      return { jobId, planId, rigId };
    }, dinisId);
    await A.waitForTimeout(SYNC);

    ctxD = await mkCtx();
    D = await ctxD.newPage();
    await login(D, 'dinis@test.local', 'dinis-pass-123');

    // Pre-clean: an earlier run's draft card would hide 'Add my card'
    await D.evaluate(async () => {
      const { db, deleteWithTombstone } = await import('/src/db/index.ts');
      const { todayISO } = await import('/src/lib/utils.ts');
      const { getSessionUser } = await import('/src/lib/session.ts');
      const me = getSessionUser();
      const cards = await db.timeCards
        .filter((c) => c.userId === me.id && c.date === todayISO() && c.status === 'draft')
        .toArray();
      for (const c of cards) await deleteWithTombstone('timeCards', c.id);
    });
    await D.waitForTimeout(2000);

    // ── (1) Trio home ───────────────────────────────────────────────────
    await D.goto('http://localhost:5199/');
    await D.waitForTimeout(2500);
    const home1 = await D.locator('body').innerText();
    ok('trio tiles present', /Checklist/i.test(home1) && /Drill log/i.test(home1) && /My hours/i.test(home1));
    ok('no-plan tile retired from the start grid', !home1.includes('Start logging holes'));
    ok('open plan offered', home1.includes('H33 Pattern'));

    // ── (2) Start today's log on the plan → batch-first panel ───────────
    await D.getByText('H33 Pattern', { exact: false }).first().click();
    await D.waitForTimeout(2500);
    const logUrl = D.url();
    ok('plan log opened', /\/drill-plan\/.+\/log\//.test(logUrl));
    const panel1 = await D.locator('body').innerText();
    ok('batch grid with legend', /tap open holes to select/i.test(panel1));

    // Select holes 1..5 on the grid, batch-log as planned
    for (const n of ['1', '2', '3', '4', '5']) {
      await D.getByRole('button', { name: n, exact: true }).first().click();
      await D.waitForTimeout(150);
    }
    const panel2 = await D.locator('body').innerText();
    ok('selection summary with plan values', /H-1[\s\S]*H-5/.test(panel2) && /plan calls for/i.test(panel2));
    await D.getByRole('button', { name: /Log 5 as planned/ }).click();
    await D.waitForTimeout(2000);
    const afterBatch = await D.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const url = new URL(location.href);
      const logId = url.pathname.split('/log/')[1].split('/')[0];
      const holes = await db.drillLogHoles.where('drillLogId').equals(logId).toArray();
      return {
        count: holes.length,
        allPlanned: holes.every((h) => h.actualDepth === 20 && h.plannedDepth === 20),
      };
    });
    ok('batch wrote 5 as-planned holes', afterBatch.count === 5 && afterBatch.allPlanned);

    // ── (3) Mark a hole skipped — ordinary action, not an apology ───────
    await D.getByRole('button', { name: '6', exact: true }).first().click();
    await D.waitForTimeout(200);
    await D.getByRole('button', { name: /Mark skipped/ }).click();
    await D.waitForTimeout(1500);
    const afterSkip = await D.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const url = new URL(location.href);
      const logId = url.pathname.split('/log/')[1].split('/')[0];
      const holes = await db.drillLogHoles.where('drillLogId').equals(logId).toArray();
      const skipped = holes.filter((h) => h.skipped);
      return { total: holes.length, skipped: skipped.length, skippedNum: skipped[0]?.holeNumber };
    });
    ok('skip recorded as a first-class marker', afterSkip.skipped === 1 && afterSkip.skippedNum === '6');

    // Footage/progress must NOT count the skipped hole
    const prog = await D.locator('body').innerText();
    ok('progress counts 5 drilled (skip excluded)', /5\b[^0-9]*of 12 holes drilled/.test(prog));

    // ── (4) 50-hour clock on the checklist — advisory amber ─────────────
    await D.goto(`http://localhost:5199/drill-checklist/${setup.rigId}`);
    await D.waitForTimeout(2000);
    const checkBody = await D.locator('body').innerText();
    ok('service clock computes from meter history',
      /every 50 hours or weekly/i.test(checkBody) && /due in 5 h/i.test(checkBody) && /45\/50/.test(checkBody));
    ok('clock is advisory — Sign checklist still offered', /sign/i.test(checkBody));

    // ── (5) Trio state: log tile active, hours via the sheet ────────────
    await D.goto('http://localhost:5199/');
    await D.waitForTimeout(2500);
    const home2 = await D.locator('body').innerText();
    ok('drilling-today card with all-driller progress',
      /Drilling today/i.test(home2) && /Continue drilling/i.test(home2) && /5\/12|5 · /.test(home2));
    await D.getByRole('button', { name: /My hours/ }).click();
    await D.waitForTimeout(800);
    await D.getByRole('button', { name: 'Add my card' }).click();
    await D.waitForTimeout(1200);
    const cardMade = await D.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { todayISO } = await import('/src/lib/utils.ts');
      const { getSessionUser } = await import('/src/lib/session.ts');
      const me = getSessionUser();
      const c = await db.timeCards.filter((x) => x.userId === me.id && x.date === todayISO()).first();
      return c ? { jobOk: Boolean(c.jobId), status: c.status } : null;
    });
    ok('standalone time card created from the trio', cardMade !== null && cardMade.jobOk && cardMade.status === 'draft');

    // ── (6) Yesterday-needs-you: back-date THE harness log → strip ──────
    // LOCAL-time yesterday (UTC .toISOString() crosses midnight hours
    // early and stamps "today" — the bug that polluted run 1); scoped to
    // this plan's log only, never the whole table.
    await D.evaluate(async (planId) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const t = new Date();
      t.setDate(t.getDate() - 1);
      const yesterday = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      const logs = await db.drillLogs
        .filter((l) => l.status === 'open' && l.drillPlanId === planId)
        .toArray();
      for (const l of logs) await db.drillLogs.update(l.id, { date: yesterday, updatedAt: nowISO() });
    }, setup.planId);
    await D.reload();
    await D.waitForTimeout(2500);
    const home3 = await D.locator('body').innerText();
    const stripOk =
      /Yesterday needs you/i.test(home3) && /unsigned/i.test(home3) && /not signed complete/i.test(home3);
    ok('yesterday-needs-you strip with unsigned log', stripOk);
    if (!stripOk) results.push(`HOME3_HEAD: ${home3.slice(0, 500).replace(/\n/g, ' § ')}`);

    // ── (7) Solo drill-only file card ───────────────────────────────────
    const dayId = await D.evaluate(async (jobId) => {
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      return createBlastDay(jobId, undefined, undefined, { typeOfWork: 'drill_only' });
    }, setup.jobId);
    await D.goto(`http://localhost:5199/blast-day/${dayId}`);
    await D.waitForTimeout(2000);
    const dayBody = await D.locator('body').innerText();
    ok('drill-only day shows the slim file card',
      /File the day/i.test(dayBody) && /Sign & submit the day/i.test(dayBody) && /Your hours/i.test(dayBody));

    // ── (8) Skipped marker reaches the blaster's merged review ─────────
    await D.waitForTimeout(SYNC);
    const mergedSkip = await A.evaluate(async (planId) => {
      const { db } = await import('/src/db/index.ts');
      const logs = await db.drillLogs.filter((l) => l.drillPlanId === planId).toArray();
      const { aggregateDrilling } = await import('/src/hooks/useDrillLogs.ts');
      const { getPlanHoles } = await import('/src/hooks/useDrillPlans.ts');
      const plan = await db.drillPlans.get(planId);
      const agg = await aggregateDrilling(logs, getPlanHoles(plan));
      return { totalHoles: agg.totalHoles, skipped: agg.skipped, undrilled: agg.undrilled.length };
    }, setup.planId);
    ok('aggregate: 5 drilled, H-6 skipped, 6 undrilled',
      mergedSkip.totalHoles === 5 && mergedSkip.skipped.includes('6') && mergedSkip.undrilled === 6);

    // cleanup
    await A.evaluate(async ({ planId, rigId, dayId }) => {
      const { db } = await import('/src/db/index.ts');
      const { deleteDayCascade } = await import('/src/lib/lifecycle.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const day = await db.blastDays.get(dayId);
      if (day) await deleteDayCascade(day);
      for (const l of await db.drillLogs.filter((x) => x.drillPlanId === planId).toArray()) {
        for (const h of await db.drillLogHoles.where('drillLogId').equals(l.id).toArray())
          await db.drillLogHoles.delete(h.id);
        await db.drillLogs.delete(l.id);
      }
      await db.drillPlans.delete(planId);
      for (const c of await db.drillChecklists.filter((x) => x.equipmentId === rigId).toArray())
        await db.drillChecklists.delete(c.id);
      await db.equipment.update(rigId, { isActive: false, status: 'retired', updatedAt: nowISO() });
      const cards = await db.timeCards.filter((c) => c.date === nowISO().slice(0, 10)).toArray();
      for (const c of cards) if (c.status === 'draft' && c.personName.includes('Dinis')) await db.timeCards.delete(c.id);
    }, { ...setup, dayId });
    await A.waitForTimeout(3000);

    await ctxA.close();
    await ctxD.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { if (D) results.push(`D URL ${D.url()}`); } catch {}
  }
  return results.join('\n');
}

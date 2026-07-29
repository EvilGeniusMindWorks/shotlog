async (page) => {
  // Standalone Drill Plans: blaster authors a kick-aware plan under a JOB,
  // dispatches; driller works it (big-type hole panel, hazard notes,
  // cross-log claiming, per-day logs); blaster accepts+files; the shot
  // imports totals+grid and verifies coverage. Legacy shot flow untouched.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let A, B;
  try {
    const mk = async () => {
      const ctx = await browser.newContext();
      await ctx.addInitScript(`
        localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
        localStorage.setItem('shotlog-pin', 'x');
        localStorage.setItem('shotlog-last-active', String(Date.now()));
      `);
      const p = await ctx.newPage();
      await p.goto('http://localhost:5199');
      return p;
    };
    const login = async (p, email, pass) => {
      await p.locator('input[type="email"]').fill(email);
      await p.locator('input[type="password"]').fill(pass);
      await p.getByRole('button', { name: 'Sign in' }).click();
      await p.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
      await p.waitForTimeout(3500);
    };
    const waitFor = async (p, fn, arg, ms = 45000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        try { if (await p.evaluate(fn, arg)) return true; } catch { /* nav race */ }
        await p.waitForTimeout(800);
      }
      return false;
    };
    const tag = `H25-${Date.now() % 1000000}`;

    A = await mk(); // blaster-side (admin has all perms)
    await login(A, 'mark@baystateblasting.com', 'dev-password-123');
    B = await mk(); // driller
    await login(B, 'dinis@test.local', 'dinis-pass-123');
    const dinis = await B.evaluate(() => JSON.parse(localStorage.getItem('shotlog-user-info')));

    // ── (1) create job + plan; author grid: 2×4, default 40ft, one no-hole,
    //        one kick hole (40ft depth, 5ft kick NE) → 7 holes ─────────────
    const jobId = await A.evaluate(
      (t) => window.shotlogFlows.createJob({ name: `${t} Job`, customer: 'H25' }), tag);
    const planId = await A.evaluate(async ({ t, jobId }) => {
      const { createDrillPlan } = await import('/src/hooks/useDrillPlans.ts');
      const id = await createDrillPlan(jobId, `${t} North Lift`);
      await window.shotlogDb.drillPlans.update(id, {
        rows: 2, cols: 4, defaultDepth: 40,
        overrides: { 0: { noHole: true, depth: 0 }, 5: { depth: 40, kick: 5, kickDir: 'NE' } },
        updatedAt: new Date().toISOString(),
      });
      return id;
    }, { t: tag, jobId });
    const derived = await A.evaluate(async (planId) => {
      const { getPlanHoles } = await import('/src/hooks/useDrillPlans.ts');
      const plan = await window.shotlogDb.drillPlans.get(planId);
      const holes = getPlanHoles(plan);
      const kicked = holes.find((h) => h.kick);
      return { count: holes.length, angle: kicked?.angle, len: kicked?.holeLength, dir: kicked?.kickDir };
    }, planId);
    ok('plan materializes 7 holes (1 no-hole)', derived.count === 7);
    ok(`kick derives 7.1° (got ${derived.angle?.toFixed(2)})`, Math.abs(derived.angle - 7.125) < 0.01);
    ok(`kick derives 40.3 ft length (got ${derived.len?.toFixed(2)})`, Math.abs(derived.len - 40.311) < 0.01);
    ok('kick direction NE', derived.dir === 'NE');

    // plan page renders with grid + name
    await A.goto(`http://localhost:5199/jobs/${jobId}/drill-plan/${planId}`);
    await A.waitForTimeout(2500);
    const planTxt = await A.locator('body').innerText();
    ok('plan page shows name + hole count', planTxt.includes('North Lift') && planTxt.includes('7 holes'));
    ok('job page card exists', await (async () => {
      await A.goto(`http://localhost:5199/jobs/${jobId}`);
      await A.waitForTimeout(2000);
      return (await A.locator('body').innerText()).includes('Drill Plans');
    })());

    // ── (2) dispatch to the driller ───────────────────────────────────────
    await A.goto(`http://localhost:5199/jobs/${jobId}/drill-plan/${planId}`);
    await A.waitForTimeout(2000);
    await A.getByRole('button', { name: /Send to drillers/ }).click();
    await A.waitForTimeout(800);
    await A.locator('label').filter({ hasText: 'Dinis' }).first().locator('input').check();
    await A.getByRole('button', { name: /Send to 1/ }).click();
    await A.waitForTimeout(1500);
    const logA = await A.evaluate(async (planId) =>
      (await window.shotlogDb.drillLogs.filter((l) => l.drillPlanId === planId).toArray())[0], planId);
    ok('dispatch created a plan-parented log (no blastDay/shot)',
      Boolean(logA) && !logA.blastDayId && !logA.shotId && Boolean(logA.date));

    // ── (3) driller sees it, opens it, big-type panel, logs holes ────────
    ok('log syncs to driller', await waitFor(B, async (id) =>
      Boolean(await window.shotlogDb.drillLogs.get(id)), logA.id));
    await B.goto('http://localhost:5199/');
    await B.waitForTimeout(2500);
    const bHome = await B.locator('body').innerText();
    ok('driller dashboard shows the plan log', bHome.includes('North Lift'));
    await B.goto(`http://localhost:5199/jobs/${jobId}/drill-plan/${planId}/log/${logA.id}`);
    await B.waitForTimeout(2500);
    // select the kicked hole (hole #7 in row-major numbering: idx5 → n7? count: idx0 excluded, idx1..7 → n1..7; idx5 is n5)
    const kickedN = await B.evaluate(async (planId) => {
      const { getPlanHoles } = await import('/src/hooks/useDrillPlans.ts');
      const plan = await window.shotlogDb.drillPlans.get(planId);
      return getPlanHoles(plan).find((h) => h.kick)?.n;
    }, planId);
    await B.locator('input').first().waitFor();
    // set hole number to the kicked one via the chip row
    await B.locator(`button:has-text("${kickedN}")`).first().click().catch(() => undefined);
    await B.waitForTimeout(600);
    const bigPanel = await B.locator('body').innerText();
    ok('big-type hole panel shows length+angle+kick',
      bigPanel.includes('40.3') && bigPanel.includes('7.1') && bigPanel.includes('NE'));

    // log the kicked hole with a water-note condition via db-backed UI calls
    await B.evaluate(async ({ logId, kickedN }) => {
      const { addHole } = await import('/src/hooks/useDrillLogs.ts');
      const { getPlanHoles } = await import('/src/hooks/useDrillPlans.ts');
      const log = await window.shotlogDb.drillLogs.get(logId);
      const plan = await window.shotlogDb.drillPlans.get(log.drillPlanId);
      const h = getPlanHoles(plan).find((x) => x.n === kickedN);
      await addHole(log, {
        holeNumber: String(h.n), actualDepth: 40.5, angle: +h.angle.toFixed(1), subdrill: 0,
        conditions: [{ fromFt: 8, toFt: 8, code: 'W', note: 'water at 8 ft' }],
        comment: '', plannedDepth: +h.holeLength.toFixed(1),
        plannedAngle: +h.angle.toFixed(1), plannedKick: h.kick, plannedKickDir: h.kickDir,
      });
    }, { logId: logA.id, kickedN });
    // remaining holes via a second per-day log (B starts their own)
    await B.evaluate(async ({ planId }) => {
      const { createDrillPlanLog, getPlanHoles, planDrilledHoleNumbers } = await import('/src/hooks/useDrillPlans.ts');
      const { addHole } = await import('/src/hooks/useDrillLogs.ts');
      const plan = await window.shotlogDb.drillPlans.get(planId);
      const log2Id = await createDrillPlanLog(plan, undefined, '2026-07-30');
      const log2 = await window.shotlogDb.drillLogs.get(log2Id);
      const drilled = await planDrilledHoleNumbers(planId);
      for (const h of getPlanHoles(plan)) {
        if (drilled.has(String(h.n))) continue;
        await addHole(log2, {
          holeNumber: String(h.n), actualDepth: 40, angle: 0, subdrill: 0,
          conditions: [], comment: '', plannedDepth: +(h.holeLength || h.depth).toFixed(1),
          plannedAngle: 0,
        });
      }
    }, { planId });

    // ── (4) blaster sees cross-log progress: 7/7 across 2 logs ────────────
    ok('blaster sees 7 of 7 across two logs', await waitFor(A, async (planId) => {
      const { getPlanHoles, planDrilledHoleNumbers } = await import('/src/hooks/useDrillPlans.ts');
      const plan = await window.shotlogDb.drillPlans.get(planId);
      const drilled = await planDrilledHoleNumbers(planId);
      const logs = await window.shotlogDb.drillLogs.filter((l) => l.drillPlanId === planId).toArray();
      return drilled.size === getPlanHoles(plan).length && logs.length === 2;
    }, planId));

    // ── (5) accept + file the first log (PDF with kick + note) ────────────
    await B.evaluate(async (logId) => {
      await window.shotlogDb.drillLogs.update(logId, { status: 'complete', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }, logA.id);
    await A.waitForTimeout(2500);
    await A.goto(`http://localhost:5199/jobs/${jobId}/drill-plan/${planId}/log/${logA.id}/submit`);
    ok('plan log accepted + filed', await waitFor(A, async (logId) => {
      const l = await window.shotlogDb.drillLogs.get(logId);
      const subs = (await window.shotlogDb.submissions.toArray()).filter((s) => s.sourceId === logId);
      return l?.status === 'accepted' && subs.length >= 1;
    }, logA.id, 60000));
    // pull the PDF out for the node-side text check
    const [download] = await Promise.all([
      A.waitForEvent('download', { timeout: 20000 }),
      A.evaluate(async (logId) => {
        const subs = (await window.shotlogDb.submissions.toArray()).filter((s) => s.sourceId === logId);
        const open = () => new Promise((res, rej) => {
          const req = indexedDB.open('shotlog-local-media', 1);
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
        });
        const mdb = await open();
        const blob = await new Promise((res) => {
          const req = mdb.transaction('media').objectStore('media').get(`sub-pdf-${subs[0].id}`);
          req.onsuccess = () => res(req.result);
        });
        mdb.close();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'x.pdf';
        a.click();
      }, logA.id),
    ]);
    await download.saveAs('/private/tmp/claude-501/-Users-matthewbulmer-Documents-Code-shotlog/d2d2c320-b4ff-4b90-b251-2a8a202badf3/scratchpad/h23/plan_drill_log.pdf');
    results.push('PDF SAVED');

    // ── (6) import into a shot: totals + grid + verification ──────────────
    const shotCheck = await A.evaluate(async ({ jobId, planId }) => {
      const db = window.shotlogDb;
      const dayId = await window.shotlogFlows.createBlastDay(jobId);
      const blog = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(blog.id).first();
      const { getPlanHoles } = await import('/src/hooks/useDrillPlans.ts');
      const { aggregateDrilling } = await import('/src/hooks/useDrillLogs.ts');
      const { seedDiagramFromPlan, parseDiagram, materializeDrillPlan } = await import('/src/lib/shotDiagram.ts');
      const plan = await db.drillPlans.get(planId);
      const logs = await db.drillLogs.filter((l) => l.drillPlanId === planId).toArray();
      const agg = await aggregateDrilling(logs, getPlanHoles(plan));
      await db.shots.update(shot.id, {
        drillPlanId: planId,
        totals: { ...shot.totals, numHoles: agg.totalHoles, totalDrillFootage: +agg.totalFootage.toFixed(1), avgDrillDepth: +(agg.totalFootage / agg.totalHoles).toFixed(1) },
        designPlan: { ...shot.designPlan, shotDiagramData: seedDiagramFromPlan(plan) },
        updatedAt: new Date().toISOString(),
      });
      const after = await db.shots.get(shot.id);
      const d = parseDiagram(after.designPlan.shotDiagramData);
      const holes = materializeDrillPlan(d, 0);
      const kicked = holes.find((h) => h.kick);
      return {
        dayId, shotId: shot.id,
        numHoles: after.totals.numHoles,
        footage: after.totals.totalDrillFootage,
        rows: d.rows, cols: d.cols, seeded: holes.length,
        kickAngle: kicked?.angle,
        timingBlank: d.wires.length === 0 && d.start === undefined,
      };
    }, { jobId, planId });
    ok('import fills totals (7 holes, 280.5 ft)',
      shotCheck.numHoles === 7 && Math.abs(shotCheck.footage - 280.5) < 0.01);
    ok('import seeds the 2×4 grid with 7 holes + derived kick angle',
      shotCheck.rows === 2 && shotCheck.cols === 4 && shotCheck.seeded === 7 &&
      Math.abs((shotCheck.kickAngle ?? 0) - 7.125) < 0.2);
    ok('import leaves timing blank', shotCheck.timingBlank);
    // coverage badge: shot uses all 7 → green; remove one hole → warning
    await A.goto(`http://localhost:5199/blast-day/${shotCheck.dayId}`);
    await A.waitForTimeout(3000);
    let dayTxt = await A.locator('body').innerText();
    ok('coverage badge: covers all 7', /covers all 7 drilled holes/i.test(dayTxt));
    await A.evaluate(async ({ shotId }) => {
      const db = window.shotlogDb;
      const { parseDiagram, serializeDiagram } = await import('/src/lib/shotDiagram.ts');
      const shot = await db.shots.get(shotId);
      const d = parseDiagram(shot.designPlan.shotDiagramData);
      d.plan.overrides[1] = { depth: 0 }; // drop one drilled hole from the shot plan
      await db.shots.update(shotId, {
        designPlan: { ...shot.designPlan, shotDiagramData: serializeDiagram(d) },
        updatedAt: new Date().toISOString(),
      });
    }, shotCheck);
    ok('coverage badge flips to warning (6 of 7)', await waitFor(A, async () => {
      return /of 7 drilled holes/.test(await document.body.innerText) && /unused/.test(await document.body.innerText);
    }, null, 20000));

    // ── (7) 30×50 stress: resize + paint + remap sanity ───────────────────
    const stress = await A.evaluate(async (jobId) => {
      const { createDrillPlan, getPlanHoles } = await import('/src/hooks/useDrillPlans.ts');
      const db = window.shotlogDb;
      const id = await createDrillPlan(jobId, 'Stress');
      await db.drillPlans.update(id, { rows: 30, cols: 50, defaultDepth: 20, overrides: { 1499: { depth: 25 } }, updatedAt: new Date().toISOString() });
      const plan = await db.drillPlans.get(id);
      const holes = getPlanHoles(plan);
      return { id, count: holes.length, last: holes[holes.length - 1].depth };
    }, jobId);
    ok('30×50 plan materializes 1500 holes w/ override', stress.count === 1500 && stress.last === 25);
    await A.goto(`http://localhost:5199/jobs/${jobId}/drill-plan/${stress.id}`);
    await A.waitForTimeout(4000);
    const stressOk = await A.evaluate(() => document.querySelectorAll('svg circle').length >= 1500);
    ok('30×50 grid renders (1500 cells)', stressOk);

    // ── (8) legacy shot-attached flow untouched ──────────────────────────
    const legacy = await A.evaluate(async ({ jobId }) => {
      const db = window.shotlogDb;
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const dayId = await window.shotlogFlows.createBlastDay(jobId);
      const blog = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(blog.id).first();
      const logId = await createDrillLog(shot, dayId, jobId);
      const log = await db.drillLogs.get(logId);
      return { hasDay: Boolean(log.blastDayId), hasShot: Boolean(log.shotId), noPlan: !log.drillPlanId };
    }, { jobId });
    ok('legacy shot log still creates with day+shot', legacy.hasDay && legacy.hasShot && legacy.noPlan);
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await (A ?? B).locator('body').innerText()).slice(0, 400)); } catch {}
  }
  return results.join('\n');
}

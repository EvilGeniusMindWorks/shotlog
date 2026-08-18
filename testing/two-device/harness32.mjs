async (page) => {
  // Round 2 — Blaster experience verification: three-band home (needs
  // attention w/ send-back reason · today+Continue · collapsed months),
  // day hub phase spine, merged drilling review → readiness review flow,
  // hazard rail while loading, compliance explainer, seismo later-ok.
  // A = admin (mark), B = blaster.
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
  let A, B, ctxA, ctxB;
  try {
    ctxA = await mkCtx();
    A = await ctxA.newPage();
    await login(A, 'mark@baystateblasting.com', 'dev-password-123');
    ctxB = await mkCtx();
    B = await ctxB.newPage();
    await login(B, 'blaster@test.local', 'blaster-pass-123');

    // ── Setup: B starts work at a job (full day incl. log/shot/report) ──
    const setup = await B.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const jobs = await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray();
      const dayId = await createBlastDay(jobs[0].id);
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      return { dayId, logId: log.id, shotId: shot.id, jobId: jobs[0].id };
    });
    await B.waitForTimeout(SYNC);

    // ── (1) Home: today band + no KPIs + months band ────────────────────
    await B.goto('http://localhost:5199/');
    await B.waitForTimeout(2500);
    const home1 = await B.locator('body').innerText();
    ok('home: today band with Continue', /Today ·/i.test(home1) && /Continue —/i.test(home1));
    ok('home: start-work ghost button', home1.includes('Start work at another job'));
    ok('home: KPIs dropped', !home1.includes('Shots / Month') && !home1.includes('YTD Total'));
    ok('home: months band with search', /Recent days/i.test(home1));

    // ── (2) Day hub: phase spine + later-ok seismo ──────────────────────
    await B.goto(`http://localhost:5199/blast-day/${setup.dayId}`);
    await B.waitForTimeout(2000);
    const hub1 = await B.locator('body').innerText();
    ok('hub is the default view (phase rows present)',
      /Time cards/i.test(hub1) && /Report & file/i.test(hub1) && /Seismo/.test(hub1));
    ok('seismo shows later-ok, never a nag', /later ok/i.test(hub1));
    ok('hub Continue targets a phase', /Continue —/.test(hub1));
    ok('pre-blast placeholder present', /Pre-blast checklist/i.test(hub1));

    // ── (3) Drilling: log a wet hole as the blaster, review merged ─────
    await B.evaluate(async ({ dayId, shotId, jobId }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const { getSessionUser } = await import('/src/lib/session.ts');
      const me = getSessionUser();
      const now = nowISO();
      const logId = generateId();
      await db.drillLogs.add({
        id: logId, jobId, blastDayId: dayId, shotId, status: 'complete',
        holeDiameter: 3.5, burden: 8, spacing: 10, faceHeight: 20, gps: '',
        locationNote: '', drillerUserId: me.id, drillerName: 'Dinis M.',
        signatureImage: null, completedAt: now,
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      await db.drillLogHoles.add({
        id: generateId(), drillLogId: logId, date: todayISO(), holeNumber: '12',
        angle: 0, actualDepth: 24.5, subdrill: 1,
        conditions: [{ fromFt: 12, toFt: 12, code: 'W', note: 'steady seep' }],
        comment: 'casing held', plannedDepth: 24,
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
    }, setup);
    await B.goto(`http://localhost:5199/blast-day/${setup.dayId}`);
    await B.waitForTimeout(2000);
    const hub2 = await B.locator('body').innerText();
    ok('hub gains Drilling + Readiness phases', /Drilling/.test(hub2) && /Readiness review/.test(hub2));
    ok('hub drilling sub shows hazards', /1 hazard/i.test(hub2));

    await B.goto(`http://localhost:5199/blast-day/${setup.dayId}?view=drilling`);
    await B.waitForTimeout(1500);
    const drillBody = await B.locator('body').innerText();
    // innerText applies CSS text-transform — headers read "HAZARDS", so
    // every text assert here is case-insensitive (harness29 gotcha)
    ok('merged view: attribution + hazards',
      /Dinis M\./.test(drillBody) && /hazards/i.test(drillBody) && /water at 12 ft/i.test(drillBody));

    // Accept → flows into readiness
    await B.getByRole('button', { name: /Accept pattern/ }).click();
    await B.waitForTimeout(1500);
    const readyBody = await B.locator('body').innerText();
    ok('accept flows into readiness review', /Planned → as-drilled|Affects loading/i.test(readyBody));
    ok('hazards phrased as questions', /wet-hole product below 12 ft\?/i.test(readyBody));

    // Confirm the design
    await B.getByRole('button', { name: /Confirm design/ }).click();
    await B.waitForTimeout(1500);
    const reviewSaved = await B.evaluate(async (logId) => {
      const { db } = await import('/src/db/index.ts');
      return Boolean((await db.blastLogs.get(logId))?.readinessReview?.confirmedAt);
    }, setup.logId);
    ok('readiness review recorded on the blast log', reviewSaved);

    // ── (4) Hazard rail while loading (blast-log view, shot expanded) ──
    const shotBody = await B.locator('body').innerText();
    ok('hazard rail in the shot', /Hazards in this shot/i.test(shotBody));

    // ── (5) Compliance explainer on the design page ─────────────────────
    await B.evaluate(async (shotId) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const s = await db.shots.get(shotId);
      await db.shots.update(shotId, {
        designPlan: {
          ...s.designPlan,
          closestStructureDistance: 120,
          maxPoundsPerDelay: 85,
          kFactor: 180,
        },
        updatedAt: nowISO(),
      });
    }, setup.shotId);
    await B.goto(`http://localhost:5199/blast-day/${setup.dayId}/design/${setup.shotId}`);
    await B.waitForTimeout(2000);
    await B.getByRole('button', { name: /why\?/ }).click();
    await B.waitForTimeout(800);
    const whyBody = await B.locator('body').innerText();
    ok('explainer: the math is shown', /The math/i.test(whyBody) && /SD = 120 ft ÷ √85 lbs/.test(whyBody));
    ok('explainer: what would pass', /To pass/i.test(whyBody) && /Max lbs\/delay at 120 ft/.test(whyBody));

    // ── (6) Send-back with a reason lands on B's needs-attention ────────
    // Real flow: the office only sees a day in its queue once the submit
    // has SYNCED — so wait for the submit to round-trip (B sees it) before
    // the REST send-back, or the route no-ops on the stale draft status.
    await A.waitForTimeout(SYNC);
    await A.evaluate(async (dayId) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.blastDays.update(dayId, { status: 'submitted', updatedAt: nowISO() });
    }, setup.dayId);
    let submittedOnB = false;
    for (let i = 0; i < 8 && !submittedOnB; i++) {
      await B.waitForTimeout(2500);
      submittedOnB = await B.evaluate(async (dayId) => {
        const { db } = await import('/src/db/index.ts');
        return (await db.blastDays.get(dayId))?.status === 'submitted';
      }, setup.dayId);
    }
    ok('submit round-tripped before office review', submittedOnB);
    const sendBack = await A.evaluate(async (dayId) => {
      const { authedFetch } = await import('/src/lib/session.ts');
      const res = await authedFetch(`/admin/blast-days/${dayId}/status`, {
        method: 'POST',
        body: JSON.stringify({ to: 'draft', note: 'seismo #2 missing PPV' }),
      });
      return res.status;
    }, setup.dayId);
    ok('send-back with note accepted by server', sendBack === 200);
    // Give the note time to ride server → PowerSync → B, then retry once
    await B.waitForTimeout(SYNC + 4000);
    await B.goto('http://localhost:5199/');
    await B.waitForTimeout(3000);
    let home2 = await B.locator('body').innerText();
    if (!home2.includes('seismo #2 missing PPV')) {
      await B.waitForTimeout(6000);
      await B.reload();
      await B.waitForTimeout(3000);
      home2 = await B.locator('body').innerText();
    }
    ok('needs-attention strip with the reason inline',
      /Needs attention/i.test(home2) && home2.includes('sent back') && home2.includes('seismo #2 missing PPV'));

    // cleanup: delete the harness day (draft again after send-back)
    await A.evaluate(async (dayId) => {
      const { db } = await import('/src/db/index.ts');
      const { deleteDayCascade } = await import('/src/lib/lifecycle.ts');
      const day = await db.blastDays.get(dayId);
      if (day) await deleteDayCascade(day);
    }, setup.dayId);
    await A.waitForTimeout(3000);

    await ctxA.close();
    await ctxB.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { if (B) results.push(`B URL ${B.url()}`); } catch {}
  }
  return results.join('\n');
}

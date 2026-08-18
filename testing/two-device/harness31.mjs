async (page) => {
  // Round 1 — Foundations verification: time cards (ownership, attribution,
  // approval), Archive/Delete lifecycle (archive rides DELETE grant,
  // never-used delete, draft-only day delete), hour-correction capability,
  // blaster job setup, per-shot responsible-blaster sign-off, and the
  // days-are-nouns language pass. A = admin (mark), B = blaster.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const mkCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
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

    const ids = await A.evaluate(async () => {
      const { authedFetch } = await import('/src/lib/session.ts');
      const r = await authedFetch('/users');
      const { users } = await r.json();
      const find = (frag) => users.find((u) => u.email.includes(frag));
      return {
        admin: find('mark@')?.id,
        blaster: find('blaster@')?.id,
        // the dev driller login is dinis@test.local
        driller: (find('dinis@') ?? find('driller@'))?.id,
      };
    });

    // ── (1) Time cards: own card files; approval is supervisory ──────────
    const setup = await B.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const { getSessionUser } = await import('/src/lib/session.ts');
      const me = getSessionUser();
      const jobs = await db.jobs.filter((j) => !j.archivedAt).toArray();
      const now = nowISO();
      const dayId = generateId();
      await db.blastDays.add({
        id: dayId, jobId: jobs[0].id, date: todayISO(), status: 'draft',
        typeOfWork: 'drill_to_blast', name: 'H31 time-card day',
        conditions: { temperatureRange: 'mod', weather: 'sunny', windDirection: 'N', groundConditions: 'normal', weatherNotes: '' },
        fireDetail: false, createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      const cardId = generateId();
      await db.timeCards.add({
        id: cardId, date: todayISO(), jobId: jobs[0].id, blastDayId: dayId,
        personName: me.name, userId: me.id, straightTime: 8, overtime: 1,
        signatureImage: null, status: 'filed', filedAt: now,
        enteredByUserId: me.id, enteredByName: me.name,
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      return { dayId, cardId, jobId: jobs[0].id, meId: me.id, meName: me.name };
    });
    await B.waitForTimeout(SYNC);
    const cardOnA = await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const c = await db.timeCards.get(id);
      return c ? c.status : 'MISSING';
    }, setup.cardId);
    ok('own filed time card syncs through', cardOnA === 'filed');

    // (2) card for a LOGIN person by a non-approver → discarded
    const drillerCardId = await B.evaluate(async ({ jobId, dayId, drillerId }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const { getSessionUser } = await import('/src/lib/session.ts');
      const me = getSessionUser();
      const id = generateId();
      const now = nowISO();
      await db.timeCards.add({
        id, date: todayISO(), jobId, blastDayId: dayId,
        personName: 'Driller Probe', userId: drillerId, straightTime: 8, overtime: 0,
        signatureImage: null, status: 'draft',
        enteredByUserId: me.id, enteredByName: me.name,
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      return id;
    }, { jobId: setup.jobId, dayId: setup.dayId, drillerId: ids.driller });
    await B.waitForTimeout(SYNC);
    const drillerCardOnA = await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.timeCards.get(id)) !== undefined;
    }, drillerCardId);
    ok("card for a login-holder DISCARDED (they file their own)", drillerCardOnA === false);

    // (3) blaster self-approving → discarded
    await B.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.timeCards.update(id, { status: 'approved', updatedAt: nowISO() });
    }, setup.cardId);
    await B.waitForTimeout(SYNC);
    const selfApproved = await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.timeCards.get(id))?.status;
    }, setup.cardId);
    ok('self-approval DISCARDED (approval is supervisory)', selfApproved === 'filed');

    // (4) admin approves → lands on B
    await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.timeCards.update(id, { status: 'approved', approvedAt: nowISO(), updatedAt: nowISO() });
    }, setup.cardId);
    await A.waitForTimeout(SYNC);
    // B's device still holds its rejected 'approved' write locally from (3);
    // the checkpoint after A's approval converges it — both agree now
    const approvedOnB = await B.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.timeCards.get(id))?.status;
    }, setup.cardId);
    ok('admin approval propagates', approvedOnB === 'approved');

    // (5) editing an APPROVED card as its owner → discarded
    await B.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.timeCards.update(id, { straightTime: 99, updatedAt: nowISO() });
    }, setup.cardId);
    await B.waitForTimeout(SYNC);
    const stAfter = await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.timeCards.get(id))?.straightTime;
    }, setup.cardId);
    ok('approved card frozen for its owner', stAfter === 8);

    // ── (6) Blaster sets up customer → site → job ────────────────────────
    const bJob = await B.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const now = nowISO();
      const customerId = generateId();
      const siteId = generateId();
      const jobId = generateId();
      await db.customers.add({
        id: customerId, name: 'H31 Field Customer', isActive: true,
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      await db.sites.add({
        id: siteId, customerId, name: 'H31 Field Site', address: '1 Ledge Rd',
        city: 'Whately', state: 'MA', kFactor: 180, kFactorHistory: [],
        isActive: true, createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      await db.jobs.add({
        id: jobId, name: 'H31 Blaster-made Job', customerId, siteId,
        operation: 'construction', typeOfRock: '', typeOfTerrain: '',
        defaultHazards: '', defaultPrecautions: '', isActive: true,
        customer: 'H31 Field Customer', address: '1 Ledge Rd', city: 'Whately',
        state: 'MA', kFactor: 180, kFactorHistory: [],
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      return { customerId, siteId, jobId };
    });
    await B.waitForTimeout(SYNC);
    const bJobOnA = await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.jobs.get(id)) !== undefined;
    }, bJob.jobId);
    ok('blaster-created customer/site/job accepted (setup_jobs)', bJobOnA === true);

    // (7) blaster archiving a job → discarded (archive rides DELETE grant)
    await B.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.jobs.update(id, { archivedAt: nowISO(), isActive: false, updatedAt: nowISO() });
    }, bJob.jobId);
    await B.waitForTimeout(SYNC);
    const archivedByBlaster = await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return Boolean((await db.jobs.get(id))?.archivedAt);
    }, bJob.jobId);
    ok('blaster archive DISCARDED (supervisory only)', archivedByBlaster === false);

    // (8) admin archive propagates
    await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.jobs.update(id, { archivedAt: nowISO(), archivedBy: 'admin', archivedByName: 'Mark', isActive: false, updatedAt: nowISO() });
    }, bJob.jobId);
    await A.waitForTimeout(SYNC);
    const archivedOnB = await B.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return Boolean((await db.jobs.get(id))?.archivedAt);
    }, bJob.jobId);
    ok('admin archive propagates', archivedOnB === true);

    // (9) deleting a job WITH history → discarded (archive-only)
    const usedJobId = setup.jobId; // it has H31 time-card day
    await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      await db.jobs.delete(id);
    }, usedJobId);
    await A.waitForTimeout(SYNC);
    const usedJobOnB = await B.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.jobs.get(id)) !== undefined;
    }, usedJobId);
    ok('delete of a used job DISCARDED (never-used rule)', usedJobOnB === true);

    // (10) never-used job deletes clean (B's job has no children)
    await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      await db.jobs.delete(id);
    }, bJob.jobId);
    await A.waitForTimeout(SYNC);
    const freshGoneOnB = await B.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.jobs.get(id)) === undefined;
    }, bJob.jobId);
    ok('never-used job delete propagates', freshGoneOnB === true);

    // ── (11) day delete: submitted day refuses, draft day cascades ──────
    await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.blastDays.update(id, { status: 'submitted', updatedAt: nowISO() });
    }, setup.dayId);
    await A.waitForTimeout(SYNC);
    await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      await db.blastDays.delete(id);
    }, setup.dayId);
    await A.waitForTimeout(SYNC);
    const submittedDayOnB = await B.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.blastDays.get(id)) !== undefined;
    }, setup.dayId);
    ok('submitted day delete DISCARDED (draft-only)', submittedDayOnB === true);

    await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.blastDays.update(id, { status: 'draft', updatedAt: nowISO() });
    }, setup.dayId);
    await A.waitForTimeout(SYNC);
    await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      await db.blastDays.delete(id);
    }, setup.dayId);
    await A.waitForTimeout(SYNC);
    const draftDayGone = await B.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.blastDays.get(id)) === undefined;
    }, setup.dayId);
    ok('draft day delete propagates', draftDayGone === true);

    // ── (12) hour corrections: capability-gated, append-only ────────────
    const equipId = await A.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const existing = await db.equipment.filter((e) => e.isActive).first();
      if (existing) return existing.id;
      const id = generateId();
      const now = nowISO();
      await db.equipment.add({
        id, assetNumber: 'H31-RIG', description: 'Harness rig', category: 'rock_drill',
        isActive: true, status: 'active', hourMeter: 1000,
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      return id;
    });
    await A.waitForTimeout(SYNC);
    const bCorrId = await B.evaluate(async ({ equipId, meId }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const id = generateId();
      const now = nowISO();
      await db.hourCorrections.add({
        id, equipmentId: equipId, observedHours: 555, previousHours: 1000,
        correctedByUserId: meId, correctedByName: 'Blaster', createdAt: now,
        updatedAt: now, syncStatus: 'local',
      });
      return id;
    }, { equipId, meId: setup.meId });
    await B.waitForTimeout(SYNC);
    const bCorrOnA = await A.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.hourCorrections.get(id)) !== undefined;
    }, bCorrId);
    ok('blaster hour correction DISCARDED (no correct_hours)', bCorrOnA === false);

    const aCorrId = await A.evaluate(async ({ equipId, adminId }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const id = generateId();
      const now = nowISO();
      await db.hourCorrections.add({
        id, equipmentId: equipId, observedHours: 987, previousHours: 1000,
        note: 'meter replaced', correctedByUserId: adminId, correctedByName: 'Mark',
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      await db.equipment.update(equipId, { hourMeter: 987, updatedAt: now });
      return id;
    }, { equipId, adminId: ids.admin });
    await A.waitForTimeout(SYNC);
    const aCorrOnB = await B.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.hourCorrections.get(id))?.observedHours;
    }, aCorrId);
    ok('shop correction syncs (both values kept)', aCorrOnB === 987);

    // ── (13) per-shot sign-off: only the responsible blaster signs ──────
    const shotSetup = await B.evaluate(async ({ jobId, adminId }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const now = nowISO();
      const dayId = generateId();
      const logId = generateId();
      const shotId = generateId();
      await db.blastDays.add({
        id: dayId, jobId, date: todayISO(), status: 'draft', typeOfWork: 'blasting',
        name: 'H31 shot day',
        conditions: { temperatureRange: 'mod', weather: 'sunny', windDirection: 'N', groundConditions: 'normal', weatherNotes: '' },
        fireDetail: false, createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      await db.blastLogs.add({
        id: logId, blastDayId: dayId, operation: 'construction', typeOfRock: '',
        typeOfTerrain: '', hazards: '', precautions: '', onsiteDelivery: false,
        blasterName: '', licenseNumber: '', licenseState: '', signatureImage: null,
        notes: '', createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      // the daily tab (where Time Cards lives) renders only with a report
      await db.dailyReports.add({
        id: generateId(), blastDayId: dayId, notes: '',
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      await db.shots.add({
        id: shotId, blastLogId: logId, shotNumber: 1, time: '',
        drillParams: { waterDepth: 0, holeDiameter: 0, burden: 0, spacing: 0, stemming: 0, subDrill: 0 },
        totals: { numHoles: 0, totalSqFt: 0, avgDrillDepth: 0, totalDrillFootage: 0, totalPayYards: 0, totalYardsShot: 0 },
        designPlan: { siteSketchData: null, siteSketchImage: null, shotDiagramData: null, shotDiagramImage: null, columnDiagramImage: null, closestStructureLocation: '', closestStructureDistance: 0, closestBoreholeDistance: 0, maxHolesPerDelay: 0, maxPoundsPerDelay: 0, scaledDistance: 0, predictedPPV: 0, kFactor: 180 },
        responsibleBlasterUserId: adminId, responsibleBlasterName: 'Mark',
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      return { dayId, logId, shotId };
    }, { jobId: setup.jobId, adminId: ids.admin });
    await B.waitForTimeout(SYNC);

    await B.evaluate(async (shotId) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.shots.update(shotId, {
        signatureImage: new Blob(['forged'], { type: 'image/png' }),
        signedAt: nowISO(), updatedAt: nowISO(),
      });
    }, shotSetup.shotId);
    await B.waitForTimeout(SYNC);
    const forged = await A.evaluate(async (shotId) => {
      const { db } = await import('/src/db/index.ts');
      const s = await db.shots.get(shotId);
      return s ? Boolean(s.signatureImage) : 'MISSING';
    }, shotSetup.shotId);
    ok("signing someone else's shot DISCARDED", forged === false);

    await B.evaluate(async ({ shotId, meId, meName }) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.shots.update(shotId, {
        responsibleBlasterUserId: meId, responsibleBlasterName: meName,
        signatureImage: new Blob(['mine'], { type: 'image/png' }),
        signedAt: nowISO(), updatedAt: nowISO(),
      });
    }, { shotId: shotSetup.shotId, meId: setup.meId, meName: setup.meName });
    await B.waitForTimeout(SYNC);
    const ownSign = await A.evaluate(async (shotId) => {
      const { db } = await import('/src/db/index.ts');
      const s = await db.shots.get(shotId);
      return s ? Boolean(s.signatureImage) : 'MISSING';
    }, shotSetup.shotId);
    ok('responsible blaster signs their own shot', ownSign === true);

    // ── (14) UI spot checks ─────────────────────────────────────────────
    // Field home (B, blaster) — the FAB lives there, not on the admin home
    await B.goto('http://localhost:5199/');
    await B.waitForTimeout(2000);
    const dashBody = await B.locator('body').innerText();
    ok('days-are-nouns: no "Start a Blast Day"/"New Work Day" on dashboard',
      !dashBody.includes('Start a Blast Day') && !dashBody.includes('New Work Day'));
    ok('FAB verbs the work, not the day',
      (await B.locator('[title="Start work at a job"]').count()) === 1);

    await A.goto('http://localhost:5199/jobs');
    await A.waitForTimeout(1500);
    ok('Jobs list has the lifecycle filter',
      (await A.getByRole('button', { name: 'Archived', exact: true }).count()) >= 1);

    await A.goto(`http://localhost:5199/equipment/${equipId}`);
    await A.waitForTimeout(1500);
    const equipBody = await A.locator('body').innerText();
    ok('Hour Ledger card with the shop correction',
      /hour ledger/i.test(equipBody) && /shop correction/i.test(equipBody) && equipBody.includes('987'));

    await B.goto(`http://localhost:5199/blast-day/${shotSetup.dayId}?tab=daily`);
    await B.waitForTimeout(2000);
    const dayBody = await B.locator('body').innerText();
    ok('Time Cards card on the work day', /time cards/i.test(dayBody) && /my card/i.test(dayBody));

    // cleanup: the H31 shot day + the blaster's customer/site + test card
    // (site deletes once its job is gone; customer once its site is gone)
    await A.evaluate(async ({ dayId, logId, shotId, siteId, customerId, cardId }) => {
      const { db } = await import('/src/db/index.ts');
      await db.shots.delete(shotId);
      await db.blastLogs.delete(logId);
      for (const r of await db.dailyReports.where('blastDayId').equals(dayId).toArray())
        await db.dailyReports.delete(r.id);
      await db.blastDays.delete(dayId);
      await db.sites.delete(siteId);
      await db.customers.delete(customerId);
      await db.timeCards.delete(cardId);
    }, { ...shotSetup, siteId: bJob.siteId, customerId: bJob.customerId, cardId: setup.cardId });
    await A.waitForTimeout(2500);

    await ctxA.close();
    await ctxB.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { if (A) results.push(`A URL ${A.url()}`); } catch {}
    try { if (B) results.push(`B URL ${B.url()}`); } catch {}
  }
  return results.join('\n');
}

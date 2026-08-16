async (page) => {
  // Round 2 integrity hardening: office REST approval is audited; status
  // FSMs stop field devices resolving tickets / un-retiring assets /
  // closing incidents; duplicate 1:1 children are discarded (and their
  // batch children); incident identity is id-based; local dates; shot
  // renumber; person/dashboard projections still correct.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let A, D;
  try {
    const mk = async () => {
      const ctx = await browser.newContext({ timezoneId: 'Pacific/Honolulu' });
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
    const auditFor = (p, recordId) =>
      p.evaluate(async (id) => {
        const token = localStorage.getItem('shotlog-access-token');
        const res = await fetch('http://localhost:4000/audit/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ids: [id] }),
        });
        return (await res.json()).entries;
      }, recordId);
    const tag = `H27-${Date.now() % 1000000}`;

    A = await mk(); // admin/office
    await login(A, 'mark@baystateblasting.com', 'dev-password-123');
    D = await mk(); // driller (field device)
    await login(D, 'dinis@test.local', 'dinis-pass-123');

    // ── (0) local-date: Honolulu evening-UTC → todayISO is LOCAL date ─────
    const dates = await A.evaluate(async () => {
      const { todayISO } = await import('/src/lib/utils.ts');
      const d = new Date();
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { today: todayISO(), local, utc: new Date().toISOString().slice(0, 10) };
    });
    ok(`todayISO is device-local (${dates.today})`, dates.today === dates.local);

    // ── (1) REST blast-day approval writes an audit entry ────────────────
    const jobId = await A.evaluate((t) => window.shotlogFlows.createJob({ name: `${t} Job`, customer: 'H27' }), tag);
    const dayId = await A.evaluate(async (jobId) => {
      const id = await window.shotlogFlows.createBlastDay(jobId);
      await window.shotlogDb.blastDays.update(id, { status: 'submitted', updatedAt: new Date().toISOString() });
      return id;
    }, jobId);
    await A.waitForTimeout(4000); // let it sync
    const approved = await A.evaluate(async (id) => {
      const token = localStorage.getItem('shotlog-access-token');
      const res = await fetch(`http://localhost:4000/admin/blast-days/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: 'approved' }),
      });
      return res.ok;
    }, dayId);
    ok('REST approval succeeded', approved);
    ok('office approval now AUDITED', await (async () => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const rows = await auditFor(A, dayId);
        if (rows.some((e) => e.reason === 'office status change' &&
          e.changes?.some?.((c) => c.field === 'status' && c.new === 'approved'))) return true;
        await A.waitForTimeout(1200);
      }
      return false;
    })());

    // ── (2) status FSMs: driller cannot resolve a ticket / un-retire ──────
    const guards = await A.evaluate(async (t) => {
      const db = window.shotlogDb;
      const now = new Date().toISOString();
      const rig = await db.equipment.filter((e) => e.isActive).first();
      const ticketId = `${t}-ticket`;
      await db.repairTickets.add({ id: ticketId, equipmentId: rig.id, sourceType: 'manual', description: 'test', outOfService: false, status: 'open', openedByName: 'Mark Swihart', createdAt: now, updatedAt: now });
      const eqId = `${t}-eq`;
      await db.equipment.add({ id: eqId, assetNumber: `${t}-X1`, description: 'guard test', category: 'vehicle', isActive: true, status: 'retired', createdAt: now, updatedAt: now });
      const incId = `${t}-inc`;
      await db.incidents.add({ id: incId, type: 'asset', status: 'open', date: now.slice(0, 10), time: '10:00', description: 'guard test', reportedByName: 'Mark Swihart', reportedByUserId: JSON.parse(localStorage.getItem('shotlog-user-info')).id, createdAt: now, updatedAt: now });
      return { ticketId, eqId, incId };
    }, tag);
    ok('guard records sync to driller', await waitFor(D, async ({ ticketId, eqId, incId }) => {
      return Boolean(await window.shotlogDb.repairTickets.get(ticketId)) &&
        Boolean(await window.shotlogDb.equipment.get(eqId)) &&
        Boolean(await window.shotlogDb.incidents.get(incId));
    }, guards));
    // driller tries all three forbidden flips
    await D.evaluate(async ({ ticketId, eqId, incId }) => {
      const now = new Date().toISOString();
      await window.shotlogDb.repairTickets.update(ticketId, { status: 'resolved', updatedAt: now });
      await window.shotlogDb.equipment.update(eqId, { status: 'active', updatedAt: now });
      await window.shotlogDb.incidents.update(incId, { status: 'closed', updatedAt: now });
    }, guards);
    ok('driller flips DISCARDED server-side (ticket/equipment/incident)', await (async () => {
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        const [t1, t2, t3] = await Promise.all([
          auditFor(A, guards.ticketId), auditFor(A, guards.eqId), auditFor(A, guards.incId),
        ]);
        const d1 = t1.some((e) => e.op === 'DISCARD' && /transition/.test(e.reason ?? ''));
        const d2 = t2.some((e) => e.op === 'DISCARD' && /transition/.test(e.reason ?? ''));
        const d3 = t3.some((e) => e.op === 'DISCARD' && /transition/.test(e.reason ?? ''));
        if (d1 && d2 && d3) return true;
        await A.waitForTimeout(1500);
      }
      return false;
    })());
    // mechanic CAN resolve
    const mech = await mk();
    await login(mech, 'mechanic@test.local', 'mech-pass-1234');
    await mech.evaluate(async (ticketId) => {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        if (await window.shotlogDb.repairTickets.get(ticketId)) break;
        await new Promise((r) => setTimeout(r, 600));
      }
      await window.shotlogDb.repairTickets.update(ticketId, { status: 'resolved', resolvedByName: 'Mech', updatedAt: new Date().toISOString() });
    }, guards.ticketId);
    ok('mechanic CAN resolve (applied server-side)', await (async () => {
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        const rows = await auditFor(A, guards.ticketId);
        if (rows.some((e) => e.op === 'PATCH' && /mechanic/.test(e.actorRole) &&
          e.changes?.some?.((c) => c.field === 'status'))) return true;
        await A.waitForTimeout(1500);
      }
      return false;
    })());

    // ── (3) duplicate blast log for a day → discarded + children too ──────
    const dupDay = await A.evaluate(async (jobId) => window.shotlogFlows.createBlastDay(jobId), jobId);
    await A.waitForTimeout(4000);
    await D.evaluate(async ({ dupDay, t }) => {
      // driller device fabricates a SECOND blast log + a shot for the same day
      const db = window.shotlogDb;
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        if (await db.blastDays.get(dupDay)) break;
        await new Promise((r) => setTimeout(r, 600));
      }
      const now = new Date().toISOString();
      const logId = `${t}-dup-log`;
      await db.blastLogs.add({ id: logId, blastDayId: dupDay, operation: 'construction', typeOfRock: '', typeOfTerrain: '', hazards: '', precautions: '', onsiteDelivery: false, blasterName: 'Dup', licenseNumber: '', licenseState: '', signatureImage: null, notes: '', createdAt: now, updatedAt: now });
      await db.shots.add({ id: `${t}-dup-shot`, blastLogId: logId, shotNumber: 1, time: '', drillParams: { waterDepth: 0, holeDiameter: 0, burden: 0, spacing: 0, stemming: 0, subDrill: 0 }, totals: { numHoles: 0, totalSqFt: 0, avgDrillDepth: 0, totalDrillFootage: 0, totalPayYards: 0, totalYardsShot: 0 }, designPlan: { siteSketchData: null, siteSketchImage: null, shotDiagramData: null, shotDiagramImage: null, columnDiagramImage: null, closestStructureLocation: '', closestStructureDistance: 0, closestBoreholeDistance: 0, maxHolesPerDelay: 0, maxPoundsPerDelay: 0, scaledDistance: 0, predictedPPV: 0, kFactor: 180 }, createdAt: now, updatedAt: now });
    }, { dupDay, t: tag });
    ok('duplicate blast log + its shot DISCARDED', await (async () => {
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        const [l, s] = await Promise.all([
          auditFor(A, `${tag}-dup-log`), auditFor(A, `${tag}-dup-shot`),
        ]);
        const dl = l.some((e) => e.op === 'DISCARD' && /already has/.test(e.reason ?? ''));
        const ds = s.some((e) => e.op === 'DISCARD' && /parent record was discarded/.test(e.reason ?? ''));
        if (dl && ds) return true;
        await A.waitForTimeout(1500);
      }
      return false;
    })());
    // admin device NEVER receives the duplicate
    const noDup = await A.evaluate(async (t) => !(await window.shotlogDb.blastLogs.get(`${t}-dup-log`)), tag);
    ok('other devices never see the duplicate', noDup);

    // ── (4) incident identity: name-variant appears in My Records via id ──
    const incCheck = await A.evaluate(async () => {
      const { buildDocRows } = await import('/src/lib/docRows.ts');
      const me = JSON.parse(localStorage.getItem('shotlog-user-info'));
      const rows = await buildDocRows({ scope: 'mine', meId: me.id, meName: 'CASE variant Name', role: 'admin' });
      return rows.some((r) => r.kind === 'incident' && r.sub.includes('guard test'));
    });
    ok('incident found by userId despite wrong meName', incCheck);

    // ── (5) shot renumber: fabricate a duplicate number, use the button ───
    const renumDay = await A.evaluate(async ({ jobId, t }) => {
      const dayId = await window.shotlogFlows.createBlastDay(jobId);
      const log = await window.shotlogDb.blastLogs.where('blastDayId').equals(dayId).first();
      const now = new Date().toISOString();
      await window.shotlogDb.shots.add({ id: `${t}-clash`, blastLogId: log.id, shotNumber: 1, time: '', drillParams: { waterDepth: 0, holeDiameter: 0, burden: 0, spacing: 0, stemming: 0, subDrill: 0 }, totals: { numHoles: 0, totalSqFt: 0, avgDrillDepth: 0, totalDrillFootage: 0, totalPayYards: 0, totalYardsShot: 0 }, designPlan: { siteSketchData: null, siteSketchImage: null, shotDiagramData: null, shotDiagramImage: null, columnDiagramImage: null, closestStructureLocation: '', closestStructureDistance: 0, closestBoreholeDistance: 0, maxHolesPerDelay: 0, maxPoundsPerDelay: 0, scaledDistance: 0, predictedPPV: 0, kFactor: 180 }, createdAt: now, updatedAt: now });
      return dayId;
    }, { jobId, t: tag });
    await A.goto(`http://localhost:5199/blast-day/${renumDay}`);
    await A.waitForTimeout(2500);
    const warned = (await A.locator('body').innerText()).includes('share a number');
    ok('duplicate shot-number warning shows', warned);
    if (warned) {
      await A.getByRole('button', { name: 'Renumber' }).click();
      ok('renumber resolves the clash', await waitFor(A, async (dayId) => {
        const log = await window.shotlogDb.blastLogs.where('blastDayId').equals(dayId).first();
        const shots = await window.shotlogDb.shots.where('blastLogId').equals(log.id).toArray();
        const nums = shots.map((s) => s.shotNumber).sort();
        return new Set(nums).size === nums.length;
      }, renumDay, 15000));
    } else results.push('FAIL renumber resolves the clash');

    // ── (6) projections still correct: dashboard + person page render ─────
    await A.goto('http://localhost:5199/');
    await A.waitForTimeout(3000);
    const dashTxt = await A.locator('body').innerText();
    ok('dashboard renders with projected reads', dashTxt.length > 200 && !dashTxt.includes('Error'));
    const crewId = await A.evaluate(async () => (await window.shotlogDb.crewMembers.filter((c) => c.isActive).first())?.id);
    if (crewId) {
      await A.goto(`http://localhost:5199/crew/${crewId}`);
      await A.waitForTimeout(2500);
      ok('person page renders with projected counts', !(await A.locator('body').innerText()).includes('Error'));
    }
    await mech.context().close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await (A ?? D).locator('body').innerText()).slice(0, 400)); } catch {}
  }
  return results.join('\n');
}

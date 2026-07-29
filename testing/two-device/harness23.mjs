async (page) => {
  // Searchable-PDF round: file all five document types through the REAL
  // routes, then pull each filed PDF out of the device media store as
  // base64. A node script afterwards extracts text and asserts key values
  // (proving the PDFs are text-native, not rasterized).
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let dev;
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
    `);
    dev = await ctx.newPage();
    await dev.goto('http://localhost:5199');
    await dev.locator('input[type="email"]').fill('mark@baystateblasting.com');
    await dev.locator('input[type="password"]').fill('dev-password-123');
    await dev.getByRole('button', { name: 'Sign in' }).click();
    await dev.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await dev.waitForTimeout(3500);
    const waitBody = async (t, ms = 45000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        try { if ((await dev.locator('body').innerText()).includes(t)) return true; } catch { /* navigation race */ }
        await dev.waitForTimeout(700);
      }
      return false;
    };
    const tag = `H23-${Date.now() % 1000000}`;

    // ── Seed: job, day (log+shot+report auto), rich fields on everything ──
    const jobId = await dev.evaluate(
      (t) => window.shotlogFlows.createJob({ name: `${t} Ledgeville`, customer: 'Granite Corp', address: '12 Quarry Rd', city: 'Ludlow', state: 'MA' }),
      tag,
    );
    const seed = await dev.evaluate(async ({ t, jobId }) => {
      const db = window.shotlogDb;
      const now = new Date().toISOString();
      const me = JSON.parse(localStorage.getItem('shotlog-user-info'));
      const dayId = await window.shotlogFlows.createBlastDay(jobId);
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const report = await db.dailyReports.where('blastDayId').equals(dayId).first();
      await db.blastLogs.update(log.id, {
        typeOfRock: 'Gneiss Granite', typeOfTerrain: 'Sloped ledge', hazards: 'Overhead lines west side',
        precautions: 'Mats doubled on row 1', notes: `${t} searchable notes`,
        blasterName: 'Mark Swihart', licenseNumber: 'MA-4451', licenseState: 'MA',
        operation: 'construction', updatedAt: now,
      });
      await db.shots.update(shot.id, {
        time: '10:45',
        drillParams: { ...shot.drillParams, holeDiameter: 3, burden: 6, spacing: 7, stemming: 4, subDrill: 1, waterDepth: 2 },
        totals: { ...shot.totals, numHoles: 24, totalSqFt: 1008, avgDrillDepth: 14.5, totalDrillFootage: 348, totalPayYards: 540, totalYardsShot: 540 },
        updatedAt: now,
      });
      const usage = await db.explosiveUsages.where('blastLogId').equals(log.id).first();
      const products = [{
        productId: 'p1', productName: 'Dyno AP Emulsion 2x16', manufacturer: 'Dyno Nobel',
        category: 'emulsion', quantity: 300, unitType: 'each', weightMultiplier: 2.27,
        totalWeight: 681, shotAllocations: {},
      }];
      const detonators = [{ name: 'NONEL MS', unitLength: '16ft', quantity: 24, shipment1Qty: 24, shipment2Qty: 0 }];
      if (usage) {
        await db.explosiveUsages.update(usage.id, { products, detonators, totalPoundsShot: 681, leadLine: 150, coverType: 'Mats', updatedAt: now });
      } else {
        await db.explosiveUsages.add({ id: `${t}-usage`, blastLogId: log.id, products, detonators, totalPoundsShot: 681, leadLine: 150, coverType: 'Mats', createdAt: now, updatedAt: now });
      }
      // one worker row with hours (auto-populated rows may exist; add ours)
      await db.workForceEntries.add({ id: `${t}-wf`, dailyReportId: report.id, rowNumber: 99, workerName: 'Antonio Cardoso', timeIn: '07:00', timeOut: '15:30', straightTime: 8, overtime: 0.5, truckHours: 1, travelHours: 0.5, createdAt: now, updatedAt: now });
      await db.dailyReports.update(report.id, { notes: `${t} daily notes`, updatedAt: now });
      // seismo reading on the shot
      await db.seismoReadings.add({ id: `${t}-seis`, shotId: shot.id, graphNumber: 1, seismographId: 'UM-7712', ppvTran: 0.125, ppvVert: 0.31, ppvLong: 0.09, frequency: 27, airOverpressure: 118.2, operator: 'Mark Swihart', location: '41 Elm St porch', createdAt: now, updatedAt: now });
      // drill log + holes (mine, so accept-filing works as admin)
      const rig = await db.equipment.filter((e) => e.isActive).first();
      const dlId = `${t}-dl`;
      await db.drillLogs.add({ id: dlId, jobId, blastDayId: dayId, shotId: shot.id, status: 'open', holeDiameter: 3, burden: 6, spacing: 7, faceHeight: 14, gps: '', locationNote: 'North bench', drillerUserId: me.id, drillerName: 'Dinis Baltazar', drillRigEquipmentId: rig?.id ?? null, signatureImage: null, createdAt: now, updatedAt: now });
      await db.drillLogHoles.add({ id: `${t}-h1`, drillLogId: dlId, date: now.slice(0, 10), holeNumber: '1', angle: 0, actualDepth: 14, subdrill: 1, conditions: [{ code: 'SR', fromFt: 4, toFt: 6 }], comment: 'soft seam at 5ft', createdAt: now, updatedAt: now });
      await db.drillLogHoles.add({ id: `${t}-h2`, drillLogId: dlId, date: now.slice(0, 10), holeNumber: '2', angle: 0, actualDepth: 15, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now });
      // checklist
      const clId = `${t}-cl`;
      await db.drillChecklists.add({ id: clId, equipmentId: rig ? rig.id : 'R-H23', jobId, date: now.slice(0, 10), startingHours: 412, daily: { 'Engine Oil': 'ok' }, weeklyDone: false, weekly: {}, repairsNote: 'left track loose', outOfService: false, drillerUserId: me.id, drillerName: 'Dinis Baltazar', signatureImage: null, createdAt: now, updatedAt: now });
      // incident (utility strike)
      const incId = `${t}-inc`;
      await db.incidents.add({ id: incId, type: 'utility', status: 'draft', date: now.slice(0, 10), time: '11:20', jobId, blastDayId: dayId, reportedByName: 'Mark Swihart', reportedByUserId: me.id, description: 'Nicked an unmarked gas service line during mat placement', utilityProvider: 'Eversource', digsafeNumber: 'DS-20267781', utilityMarked: 'no', utilityKind: 'gas_service', createdAt: now, updatedAt: now });
      return { dayId, logId: log.id, shotId: shot.id, dlId, clId, incId };
    }, { t: tag, jobId });

    // ── File all five through the real routes ─────────────────────────────
    await dev.goto(`http://localhost:5199/blast-day/${seed.dayId}/submit`);
    ok('day submit files blast log + daily report', await (async () => {
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) { try {
        const n = await dev.evaluate(async (dayId) =>
          (await window.shotlogDb.submissions.toArray()).filter((s) => s.blastDayId === dayId && (s.type === 'blast_log' || s.type === 'daily_report')).length,
        seed.dayId);
        if (n >= 2) return true; } catch { /* navigation race */ }
        await dev.waitForTimeout(1000);
      }
      return false;
    })());

    await dev.goto(`http://localhost:5199/blast-day/${seed.dayId}/drill-log/${seed.dlId}/submit`);
    ok('drill log accept files', await (async () => {
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) { try {
        const n = await dev.evaluate(async (dlId) =>
          (await window.shotlogDb.submissions.toArray()).filter((s) => s.sourceId === dlId).length, seed.dlId);
        if (n >= 1) return true; } catch { /* navigation race */ }
        await dev.waitForTimeout(1000);
      }
      return false;
    })());

    await dev.goto(`http://localhost:5199/drill-checklist-file/${seed.clId}`);
    ok('checklist files', await waitBody('Checklist filed', 60000));

    await dev.goto(`http://localhost:5199/incident/${seed.incId}/submit`);
    ok('incident files', await (async () => {
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) { try {
        const n = await dev.evaluate(async (incId) =>
          (await window.shotlogDb.submissions.toArray()).filter((s) => s.sourceId === incId).length, seed.incId);
        if (n >= 1) return true; } catch { /* navigation race */ }
        await dev.waitForTimeout(1000);
      }
      return false;
    })());

    // ── Pull every filed PDF out of the device media store as base64 ──────
    const pdfs = await dev.evaluate(async ({ dayId, dlId, clId, incId }) => {
      const subs = (await window.shotlogDb.submissions.toArray()).filter(
        (s) => s.blastDayId === dayId || [dlId, clId, incId].includes(s.sourceId),
      );
      const open = () => new Promise((resolve, reject) => {
        const req = indexedDB.open('shotlog-local-media', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const mdb = await open();
      const out = [];
      for (const s of subs) {
        const blob = await new Promise((resolve, reject) => {
          const req = mdb.transaction('media').objectStore('media').get(`sub-pdf-${s.id}`);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        if (!blob) { out.push({ type: s.type, size: 0, b64: '' }); continue; }
        const b64 = await new Promise((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(',')[1]);
          r.readAsDataURL(blob);
        });
        out.push({ type: s.type, size: blob.size, sha: s.pdfSha256 ?? '', b64 });
      }
      mdb.close();
      return out;
    }, seed);
    ok('all five PDFs present in device store', pdfs.length === 5 && pdfs.every((p) => p.size > 0));
    results.push('PDFDATA ' + JSON.stringify(pdfs.map(({ b64, ...rest }) => rest)));
    // hand the raw PDFs to the node side via files
    const fs = require('fs');
    const OUT = '/private/tmp/claude-501/-Users-matthewbulmer-Documents-Code-shotlog/d2d2c320-b4ff-4b90-b251-2a8a202badf3/scratchpad/h23';
    fs.mkdirSync(OUT, { recursive: true });
    for (const p of pdfs) {
      if (p.b64) fs.writeFileSync(`${OUT}/${p.type}.pdf`, Buffer.from(p.b64, 'base64'));
    }
    results.push(`WROTE ${OUT}`);
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await dev.locator('body').innerText()).slice(0, 500)); } catch {}
  }
  return results.join('\n');
}

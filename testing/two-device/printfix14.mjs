async (page) => {
  // PDF polish round: seed a data-rich day (long names to force wraps, seismo
  // readings, negative lead line, out-of-service checklist), then download the
  // REAL PDFs via the Save PDF button for visual inspection. Also checks the
  // negative-lead-line print warning and PNG-vs-JPEG page encoding.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const OUT = '/private/tmp/claude-501/-Users-matthewbulmer-Documents-Code-shotlog/d2d2c320-b4ff-4b90-b251-2a8a202badf3/scratchpad';
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
    // Admin login — jobs are admin-only writes; a blaster-created job would be
    // server-discarded and checkpoint-wiped, printing blank job fields.
    await dev.locator('input[type="email"]').fill('mark@baystateblasting.com');
    await dev.locator('input[type="password"]').fill('dev-password-123');
    await dev.getByRole('button', { name: 'Sign in' }).click();
    await dev.waitForSelector('text=Dashboard', { timeout: 15000 });
    await dev.waitForTimeout(3000); // hydration

    const tag = `P14-${Date.now() % 1000000}`;

    // ── Seed: job with long name/address, full blast day ──────────────────
    const ids = await dev.evaluate(async (t) => {
      const db = window.shotlogDb;
      const jobId = await window.shotlogFlows.createJob({
        name: `Route 3 Widening & Culvert Replacement Phase 2 ${t}`,
        customer: 'Acme Corporation & Sons Construction',
        address: '24 Lauren Lane Extension',
        city: 'Southwick',
        state: 'MA',
        kFactor: 180,
      });
      const dayId = await window.shotlogFlows.createBlastDay(jobId, '2026-07-24');
      const now = new Date().toISOString();

      await db.blastDays.update(dayId, {
        conditions: { weather: 'sunny', temperatureRange: 'mod', windDirection: 'NW', groundConditions: 'normal' },
        fireDetail: false,
        updatedAt: now,
      });

      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      // hand-drawn-ish signature
      const sig = await new Promise((r) => {
        const c = document.createElement('canvas');
        c.width = 300; c.height = 80;
        const x = c.getContext('2d');
        x.strokeStyle = '#1a365d'; x.lineWidth = 2.5; x.beginPath();
        x.moveTo(10, 60); x.bezierCurveTo(60, 5, 120, 75, 200, 35); x.bezierCurveTo(240, 15, 260, 50, 290, 30);
        x.stroke(); c.toBlob(r, 'image/png');
      });
      await db.blastLogs.update(log.id, {
        operation: 'quarry',
        typeOfRock: 'Granite',
        typeOfTerrain: 'Flat',
        hazards: 'Gas Line, Water Main, Overhead Electric Service',
        precautions: 'Mats doubled on east face, utility locates confirmed',
        notes: 'Shot went well; descenders test: gyp jaq',
        blasterName: 'Matthew Bulmer',
        licenseNumber: '11225588',
        licenseState: 'MA',
        signatureImage: sig,
        onsiteDelivery: true,
        updatedAt: now,
      });

      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      await db.shots.update(shot.id, {
        time: '10:32',
        drillParams: { waterDepth: 33, holeDiameter: 16, burden: 50, spacing: 5, stemming: 6, subDrill: 2 },
        totals: { numHoles: 28, totalSqFt: 7000, avgDrillDepth: 21.5, totalDrillFootage: 602, totalPayYards: 5578, totalYardsShot: 5578 },
        designPlan: {
          ...shot.designPlan,
          closestStructureLocation: '61 Loomis Rd — dwelling, northeast quadrant',
          closestStructureDistance: 169,
          closestBoreholeDistance: 163,
          maxHolesPerDelay: 1,
          maxPoundsPerDelay: 42,
          scaledDistance: 26.1,
          predictedPPV: 0.34,
          kFactor: 180,
        },
        updatedAt: now,
      });

      const eu = await db.explosiveUsages.where('blastLogId').equals(log.id).first();
      await db.explosiveUsages.update(eu.id, {
        products: [
          {
            productId: 'seed', productName: 'Dyno AP 3x16 (long product name wrap test)', manufacturer: 'Dyno',
            category: 'packaged_emulsion', quantity: 120, unitType: 'stick', weightMultiplier: 1.7,
            totalWeight: 204, shotAllocations: {},
          },
        ],
        totalPoundsShot: 204,
        detonators: [{ name: 'Nonel MS', unitLength: "24'", quantity: 28, shipment1Qty: 28, shipment2Qty: 0 }],
        leadLine: -1, // exercises the new pre-print warning
        coverType: 'Mats',
        updatedAt: now,
      });

      await db.seismoReadings.add({
        id: crypto.randomUUID(), shotId: shot.id, graphNumber: 1, seismographId: 'UM6B686',
        ppvTran: 0.172, ppvVert: 0.101, ppvLong: 0.088, peakVectorSum: 0.19, frequency: 32,
        airOverpressure: 90.66, maxAccelTran: 0, maxAccelVert: 0, maxAccelLong: 0,
        maxDisplacementTran: 0, maxDisplacementVert: 0, maxDisplacementLong: 0,
        operator: 'MARK SWIHART', location: '61 loomis rd — front porch ground spike',
        triggerTimestamp: now, sensorCheckPassed: true, calibrationDate: '2026-01-15',
        complianceStatus: 'compliant', printoutImage: null,
        createdAt: now, updatedAt: now,
      });

      const dr = await db.dailyReports.where('blastDayId').equals(dayId).first();
      await db.dailyReports.update(dr.id, { notes: `Long day, culvert section poured after shot. ${t}`, updatedAt: now });
      const wf = await db.workForceEntries.where('dailyReportId').equals(dr.id).toArray();
      if (wf[0]) {
        await db.workForceEntries.update(wf[0].id, { timeIn: '06:30', timeOut: '17:00', straightTime: 8, overtime: 2.5, updatedAt: now });
      }

      // Out-of-service checklist against a registry rig if one exists
      const rigs = (await db.equipment.toArray()).filter((e) => e.category === 'equip_drill');
      const rig = rigs[0];
      const clId = crypto.randomUUID();
      await db.drillChecklists.add({
        id: clId, equipmentId: rig ? rig.id : 'R1004', jobId,
        date: '2026-07-24', startingHours: 1234,
        daily: Object.fromEntries(['Engine Oil','Compressor Oil','Hydraulic Oil','Anti-Freeze','Fuel','Oil Leaks','Hoses (while drilling)','Hoses on Rollers','Grease Machine','Blow Out Coolers','Gauges','Horn','Lubricator','Backup Alarm','Emergency Stop'].map((k) => [k, 'ok'])),
        weeklyDone: false, weekly: {},
        repairsNote: 'Hose blew on the hydraulics — descenders gyp jaq',
        outOfService: true,
        drillerUserId: JSON.parse(localStorage.getItem('shotlog-user-info')).id,
        drillerName: 'Matthew Bulmer',
        signatureImage: sig,
        createdAt: now, updatedAt: now,
      });
      return { jobId, dayId, clId, wfCount: wf.length };
    }, tag);
    ok('seeded day + checklist', Boolean(ids.dayId && ids.clId));

    // ── Download the real PDFs from each print route ──────────────────────
    const grab = async (route, outName, readySel) => {
      await dev.goto(`http://localhost:5199${route}`);
      await dev.waitForSelector(readySel, { timeout: 15000 });
      await dev.waitForTimeout(2500); // fonts/images settle
      const [download] = await Promise.all([
        dev.waitForEvent('download', { timeout: 90000 }),
        dev.getByRole('button', { name: 'Save PDF' }).click(),
      ]);
      const path = `${OUT}/${outName}`;
      await download.saveAs(path);
      return path;
    };

    const p1 = await grab(`/blast-day/${ids.dayId}/print`, 'after-blast-log.pdf', 'text=Blasting Log');
    ok('blast log PDF downloaded', Boolean(p1));
    // negative lead line warning present on screen?
    const warn = (await dev.locator('body').innerText()).includes('Lead line is negative');
    ok('negative lead-line warning shown', warn);

    const p2 = await grab(`/blast-day/${ids.dayId}/print-daily`, 'after-daily-report.pdf', 'text=DAILY REPORT');
    ok('daily report PDF downloaded', Boolean(p2));

    const p3 = await grab(`/drill-checklist-print/${ids.clId}`, 'after-drill-checklist.pdf', 'text=Rock Drill Checklist');
    ok('checklist PDF downloaded', Boolean(p3));
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await dev.locator('body').innerText()).slice(0, 400)); } catch {}
  }
  return results.join('\n');
}

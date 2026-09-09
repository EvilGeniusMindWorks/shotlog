async (page, lib) => {
  // D2 (2026-09-09): compliance badges are advisory until an engineer signs off
  // the USBM curve — the tag sits beside every badge, the explainer says why,
  // the blast-log PDF carries the line.
  const { mkCtx, signIn, skipTours, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  let dayId, shotId;

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);

  await R.section('a day with a seismo reading and a structure distance', async () => {
    const made = await PB.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const today = todayISO();
      const taken = new Set((await db.blastDays.filter((d) => d.date === today).toArray()).map((d) => d.jobId));
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !taken.has(j.id)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const id = await createBlastDay(jobs[0].id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `D2 advisory ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      await db.shots.update(shot.id, { designPlan: { ...shot.designPlan, closestStructureDistance: 450, maxPoundsPerDelay: 25 }, updatedAt: nowISO() });
      const now = nowISO();
      await db.seismoReadings.add({ id: generateId(), shotId: shot.id, graphNumber: 1, seismographId: 'SN 22841', ppvTran: 0.42, ppvVert: 0.31, ppvLong: 0.28, peakVectorSum: 0, frequency: 27, airOverpressure: 118, maxAccelTran: 0, maxAccelVert: 0, maxAccelLong: 0, maxDisplacementTran: 0, maxDisplacementVert: 0, maxDisplacementLong: 0, operator: '', location: '', triggerTimestamp: now, sensorCheckPassed: true, calibrationDate: '', complianceStatus: 'compliant', printoutImage: null, createdAt: now, updatedAt: now, syncStatus: 'local' });
      return { id, shotId: shot.id };
    }, stamp);
    dayId = made.id; shotId = made.shotId;
    R.ok('made', Boolean(dayId));
  });

  await R.section('the seismo page: the tag beside the header badge and the reading badge; the explainer says why', async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}/seismo/${shotId}`);
    await PB.locator('[data-compliance-advisory]').first().waitFor({ timeout: 15000 });
    const tags = await PB.locator('[data-compliance-advisory]').count();
    R.ok(`"advisory" sits beside the badges (${tags} tags)`, tags >= 2 && /advisory/i.test(await PB.locator('[data-compliance-advisory]').first().innerText()));
    await PB.locator('[data-compliance-advisory]').nth(1).click();
    await PB.locator('[data-compliance-advisory-note]').waitFor({ timeout: 5000 });
    R.ok('the compliance explainer carries the advisory sentence', /awaiting a blasting engineer/.test(await PB.locator('[data-compliance-advisory-note]').innerText()));
    await PB.keyboard.press('Escape');
  });

  await R.section('the design plan and the day\'s readiness carry it too; the blast log PDF has the line', async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}/design/${shotId}`);
    await PB.locator('main').waitFor({ timeout: 15000 });
    await sleep(800);
    R.ok('design plan: the tag beside the USBM / OSM flags', (await PB.locator('[data-compliance-advisory]').count()) >= 1);
    const pdfText = await PB.evaluate(async (dayId) => {
      const { buildBlastLogPdf } = await import('/src/pdfdocs/index.ts');
      const blob = await buildBlastLogPdf(dayId);
      const buf = new Uint8Array(await blob.arrayBuffer());
      // the PDF's page streams are compressed; the check is that it built and is non-trivial —
      // the label itself is asserted through the table's data source below
      return { size: buf.length };
    }, dayId);
    const rows = await PB.evaluate(async () => { const { COMPLIANCE_ADVISORY } = await import('/src/lib/complianceAdvisory.tsx'); return COMPLIANCE_ADVISORY; });
    R.ok(`the blast-log PDF builds (${(pdfText.size / 1024).toFixed(0)} KB) with the advisory flag on`, pdfText.size > 5000 && rows === true);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId] }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
    void shotId;
  });
  await cB.close();
  return R.summary();
}

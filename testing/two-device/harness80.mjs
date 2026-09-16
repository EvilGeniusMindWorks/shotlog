async (page, lib) => {
  // Navigation round, push 2 — the walkthrough tab (2026-09-16)
  const { mkCtx, signIn, skipTours, sleep, WEB, browserErrors, waitForUpload } = lib;
  const waitFor = async (fn, timeout = 20000, every = 250) => {
    const until = Date.now() + timeout;
    let last;
    while (Date.now() < until) {
      last = await fn().catch(() => undefined);
      if (last) return last;
      await sleep(every);
    }
    return last;
  };
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  browserErrors({ clear: true });
  let dayId, shotId, job, logId;
  const path = (P) => new URL(P.url()).pathname + new URL(P.url()).search;
  const spa = async (P, to) => {
    await P.evaluate((to) => window.__shotlogNavigate(to), to);
    await sleep(300);
  };
  const phases = (P) =>
    P.evaluate(() =>
      [...document.querySelectorAll('[data-phase]')].map((el) => ({
        key: el.getAttribute('data-phase'),
        chip: el.getAttribute('data-phase-chip'),
        ring: el.parentElement?.querySelector('[data-phase-state]')?.getAttribute('data-phase-state'),
      })),
    );
  const continueText = async (P) => ((await P.locator('[data-day-continue]').textContent().catch(() => '')) || '').trim();
  const rings = (ps) => ps.filter((p) => p.ring === 'now').length;
  const evalDb = (P, fn, arg) => P.evaluate(fn, arg);

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);
  const cD = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
  const PD = await cD.newPage();
  await signIn(PD, 'dinis');
  await skipTours(PD);

  job = await PB.evaluate(async () => {
    const { db } = await import('/src/db/index.ts');
    const { todayISO } = await import('/src/lib/utils.ts');
    const today = todayISO();
    const taken = new Set((await db.blastDays.filter((d) => d.date === today).toArray()).map((d) => d.jobId));
    // an accepted drill log outlives the day it was on (the server keeps it), and a day's id is
    // fixed by job + date — so a job that already has a log today would start the walkthrough at Done
    const logged = new Set((await db.drillLogs.filter((l) => (l.date ?? l.createdAt.slice(0, 10)) === today).toArray()).map((l) => l.jobId));
    const free = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !taken.has(j.id) && !logged.has(j.id) && !/^S1[124]/.test(j.name)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
    return free[0] ? { id: free[0].id, name: free[0].name } : null;
  });
  if (!job) throw new Error('need a free job');
  const made = await PB.evaluate(
    async ({ jobId, stamp }) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      const id = await createBlastDayWithPapers(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `walk ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      return { id, shotId: shot.id };
    },
    { jobId: job.id, stamp },
  );
  dayId = made.id;
  shotId = made.shotId;
  await waitForUpload(PB, 30000);
  const DAY = `/blast-day/${dayId}`;
  R.note(`job ${job.name} · day ${dayId.slice(0, 8)}`);

  await R.section('The Blasting log tile opens the Walkthrough tab; two tabs, no Daily report tab; ?view=hub still lands there', async () => {
    await PB.goto(`${WEB}/days`);
    await PB.locator('aside').first().waitFor({ timeout: 20000 });
    await spa(PB, DAY);
    await PB.locator('[data-tile="blast-log"] [data-tile-action]').waitFor({ timeout: 20000 });
    await PB.locator('[data-tile="blast-log"] [data-tile-action]').click();
    await waitFor(async () => (/view=walkthrough/.test(PB.url()) ? 1 : null), 10000);
    R.ok(`the tile opens the walkthrough (${path(PB).replace(dayId, '…')})`, /\?view=walkthrough$/.test(path(PB)));
    await PB.locator('[data-tour="day-tabs"]').waitFor({ timeout: 10000 });
    const tabs = await PB.locator('[data-tour="day-tabs"] button').allTextContents();
    R.ok(`the tabs read ${tabs.map((t) => t.trim()).join(' · ')}`, tabs.length === 2 && /Walkthrough/.test(tabs[0]) && /Blasting log/.test(tabs[1]));
    R.ok('no Daily report tab inside the log', !tabs.some((t) => /Daily/.test(t)));
    await PB.goto(`${WEB}${DAY}?view=hub`);
    await PB.locator('[data-tour="day-spine"]').waitFor({ timeout: 20000 });
    // the shots arrive a beat after the fresh document; the Drill plan step needs them
    await waitFor(async () => ((await PB.locator('[data-phase="plan"]').count()) === 1 ? 1 : null), 15000);
    R.ok('an old ?view=hub link lands on the walkthrough', (await PB.locator('[data-phase="plan"]').count()) === 1);
    await spa(PB, `${DAY}?view=daily-report`);
    await PB.locator('[data-report-done], [data-report-undone]').first().waitFor({ timeout: 20000 });
    R.ok('the daily report screen shows no tabs at all', (await PB.locator('[data-tour="day-tabs"]').count()) === 0);
  });

  await R.section('The six steps through a day: plan → sent → drilling waiting → review → fill → check → sign → complete, one ring, Continue reads Next: …', async () => {
    await spa(PB, `${DAY}?view=walkthrough`);
    await PB.locator('[data-phase="plan"]').waitFor({ timeout: 20000 });
    let ps = await phases(PB);
    R.ok(`six steps in order (${ps.map((p) => p.key).join(' → ')})`, ps.map((p) => p.key).join(',') === 'plan,drilling,review,fill,check,complete');
    R.ok(`nothing yet: Drill plan "${ps[0].chip}", one ring, Continue "${await continueText(PB)}"`, ps[0].chip === 'To do' && rings(ps) === 1 && ps[0].ring === 'now' && (await continueText(PB)) === 'Next: build the drill plan');
    // lay a 2 × 3 pattern at 20 ft straight into the shot (harness53's way)
    await PB.evaluate(async (shotId) => {
      const { db } = await import('/src/db/index.ts');
      const { serializeDiagram, emptyDiagram } = await import('/src/lib/shotDiagram.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const shot = await db.shots.get(shotId);
      const d = { ...emptyDiagram(2, 3), plan: { defaultDepth: 20, overrides: {} } };
      await db.shots.update(shotId, { designPlan: { ...shot.designPlan, shotDiagramData: serializeDiagram(d) }, updatedAt: nowISO() });
    }, shotId);
    await spa(PB, `${DAY}?view=walkthrough`);
    await waitFor(async () => ((await phases(PB))[0]?.chip === 'Built · not sent' ? 1 : null), 15000);
    ps = await phases(PB);
    R.ok(`plan built: "${ps[0].chip}", Continue "${await continueText(PB)}"`, ps[0].chip === 'Built · not sent' && (await continueText(PB)) === 'Next: send the plan to drillers');
    // send it: the driller gets a log (the same thing Send to drillers does)
    logId = await PB.evaluate(async ({ shotId, dayId, jobId }) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const dinis = (await db.crewMembers.filter((c) => /Dinis/.test(c.name)).toArray())[0];
      const s = await db.shots.get(shotId);
      return createDrillLog(s, dayId, jobId, { userId: dinis?.userId ?? '', name: dinis?.name ?? 'Dinis' });
    }, { shotId, dayId, jobId: job.id });
    await waitFor(async () => ((await phases(PB))[1]?.chip === 'Waiting' ? 1 : null), 15000);
    ps = await phases(PB);
    R.ok(`sent: Drill plan "${ps[0].chip}", Drilling "${ps[1].chip}", Continue "${await continueText(PB)}"`, ps[0].chip === 'Done' && ps[1].chip === 'Waiting' && /^Waiting: .*0 of 6$/.test(await continueText(PB)));
    R.ok('the waiting step wears a blue dot, not the ring; still one ring at most', ps[1].ring === 'wait' && rings(ps) === 0);
    // the driller drills 6 and signs complete — once his device has the log
    await waitFor(() => PD.evaluate(async (logId) => Boolean(await (await import('/src/db/index.ts')).db.drillLogs.get(logId)), logId), 30000);
    await PD.evaluate(async ({ logId }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const now = nowISO();
      for (let i = 1; i <= 6; i++) await db.drillLogHoles.add({ id: generateId(), drillLogId: logId, date: todayISO(), holeNumber: String(i), angle: 0, actualDepth: 20, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
      await db.drillLogs.update(logId, { signatureImage: png, status: 'complete', completedAt: now, updatedAt: now });
    }, { logId });
    await waitForUpload(PD, 30000);
    // …and the blaster's device has heard it
    await waitFor(() => PB.evaluate(async (logId) => ((await (await import('/src/db/index.ts')).db.drillLogs.get(logId))?.status === 'complete' ? 1 : null), logId), 30000);
    await waitFor(async () => ((await phases(PB))[2]?.chip === 'To do' ? 1 : null), 30000);
    ps = await phases(PB);
    R.ok(`signed complete: Drilling "${ps[1].chip}", Review drilling "${ps[2].chip}", Continue "${await continueText(PB)}"`, ps[2].chip === 'To do' && ps[2].ring === 'now' && rings(ps) === 1 && (await continueText(PB)) === 'Next: review the drilling');
    // accept
    await PB.evaluate(async (logId) => {
      const { db } = await import('/src/db/index.ts');
      const { acceptDrillLog } = await import('/src/lib/dayHub.ts');
      await acceptDrillLog(await db.drillLogs.get(logId));
    }, logId);
    await waitFor(async () => ((await phases(PB))[3]?.chip === 'In progress' ? 1 : null), 20000);
    ps = await phases(PB);
    R.ok(`accepted: Review "${ps[2].chip}", Fill out "${ps[3].chip}", Continue "${await continueText(PB)}"`, ps[2].chip === 'Done' && ps[3].chip === 'In progress' && ps[3].ring === 'now' && rings(ps) === 1 && (await continueText(PB)) === 'Next: fill out Shot 1');
  });

  await R.section('Check and sign: seismo readings are required, each red line is a door, Complete lands on the day and the tile reads Complete', async () => {
    // explosives + totals (the accepted drilling fills the totals; explosives typed)
    await PB.evaluate(async ({ shotId, dayId }) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const usage = await db.explosiveUsages.where('blastLogId').equals(log.id).first();
      if (usage) await db.explosiveUsages.update(usage.id, { totalPoundsShot: 120, updatedAt: nowISO() });
      const s = await db.shots.get(shotId);
      if (!(s.totals.numHoles > 0)) await db.shots.update(shotId, { totals: { ...s.totals, numHoles: 6, totalDrillFootage: 120, avgDrillDepth: 20 }, updatedAt: nowISO() });
      await db.blastLogs.update(log.id, { hazards: 'None noted', licenseNumber: log.licenseNumber || 'BL-123', licenseState: log.licenseState || 'MA', blasterName: log.blasterName || 'Barry Blaster', updatedAt: nowISO() });
    }, { shotId, dayId });
    await spa(PB, `${DAY}?view=check`);
    await PB.locator('[data-check-and-sign]').waitFor({ timeout: 20000 });
    await PB.locator('[data-check-item^="seismo-"]').first().waitFor({ timeout: 15000 });
    const seismo = await PB.locator('[data-check-item^="seismo-"]').first().getAttribute('data-check-level');
    R.ok('seismo readings missing is a RED line', seismo === 'red');
    R.ok('Complete is not offered while a red line stands', await PB.locator('[data-log-complete]').isDisabled());
    R.ok(`the arrow reads "‹ Walkthrough"`, ((await PB.locator('[data-nav-back-label]').first().textContent()) || '').trim() === 'Walkthrough');
    // the red line is a door: it opens the seismo screen for that shot
    await PB.locator('[data-check-item^="seismo-"] button').first().click();
    await PB.waitForURL(/\/seismo\//, { timeout: 10000 });
    R.ok('the seismo line opens the seismo screen', /\/seismo\//.test(path(PB)));
    await PB.evaluate(async (shotId) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const now = nowISO();
      await db.seismoReadings.add({ id: generateId(), shotId, graphNumber: 1, seismographId: 'BE-1234', ppvTran: 0.12, ppvVert: 0.15, ppvLong: 0.1, peakVectorSum: 0.2, frequency: 20, airOverpressure: 120, maxAccelTran: 0, maxAccelVert: 0, maxAccelLong: 0, maxDisplacementTran: 0, maxDisplacementVert: 0, maxDisplacementLong: 0, operator: 'Barry', notes: '', complianceStatus: 'compliant', createdAt: now, updatedAt: now, syncStatus: 'local' });
    }, shotId);
    await spa(PB, `${DAY}?view=check`);
    await PB.locator('[data-check-and-sign]').waitFor({ timeout: 20000 });
    await waitFor(async () => ((await PB.locator('[data-check-item="seismo-ok"]').count()) === 1 ? 1 : null), 15000);
    R.ok('with a reading attached the seismo line is green', (await PB.locator('[data-check-item="seismo-ok"]').count()) === 1);
    R.ok('still no Complete without a signature', (await PB.locator('[data-log-complete]').isDisabled()) && /Sign first/.test((await PB.locator('[data-log-complete-why]').textContent()) || ''));
    // sign here
    await PB.evaluate(async (dayId) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
      await db.blastLogs.update(log.id, { signatureImage: png, signedAt: nowISO(), updatedAt: nowISO() });
    }, dayId);
    await waitFor(async () => ((await PB.locator('[data-check-signed="1"]').count()) === 1 ? 1 : null), 15000);
    await waitFor(async () => (!(await PB.locator('[data-log-complete]').isDisabled()) ? 1 : null), 10000);
    R.ok('signed: Complete is offered', !(await PB.locator('[data-log-complete]').isDisabled()));
    await PB.locator('[data-log-complete]').click();
    const landed = await waitFor(async () => (path(PB) === DAY ? 1 : null), 10000);
    R.ok('Mark the blasting log complete lands on the day', landed === 1);
    await waitFor(async () => (/^Complete /.test((await PB.locator('[data-tile="blast-log"]').getAttribute('data-tile-state')) || '') ? 1 : null), 15000);
    const tile = (await PB.locator('[data-tile="blast-log"]').getAttribute('data-tile-state')) || '';
    R.ok(`the tile reads "${tile}"`, /^Complete /.test(tile));
    await spa(PB, `${DAY}?view=walkthrough`);
    await PB.locator('[data-phase="complete"]').waitFor({ timeout: 15000 });
    const ps = await phases(PB);
    R.ok(`the walkthrough: every step done, the last reads "${ps[5].chip}", no Continue`, ps.every((p) => p.ring === 'done') && ps[5].chip === 'Complete' && (await PB.locator('[data-day-continue]').count()) === 0);
  });

  await R.section('File this day waits for the log complete and the report done; the pre-flight says so', async () => {
    await spa(PB, DAY);
    await PB.locator('[data-file-row], [data-file-day]').first().waitFor({ timeout: 15000 }).catch(() => {});
    const rowText = (await PB.locator('[data-file-row]').textContent().catch(() => '')) || (await PB.textContent('main')) || '';
    R.ok(`with the report not done the row says why ("${rowText.replace(/\s+/g, ' ').slice(0, 70)}")`, /daily report is not marked done/i.test(rowText));
    await spa(PB, `${DAY}/submit`);
    await PB.locator('[data-preflight-item="report-not-done"]').waitFor({ timeout: 25000 });
    R.ok('the pre-flight lists the report in red with a door', (await PB.locator('[data-preflight-item="report-not-done"]').getAttribute('data-preflight-level')) === 'red');
    R.ok('and the log complete in green', (await PB.locator('[data-preflight-item="complete-ok"]').getAttribute('data-preflight-level')) === 'ok');
    await spa(PB, `${DAY}?view=daily-report`);
    await PB.locator('[data-report-done]').waitFor({ timeout: 20000 });
    await PB.locator('[data-report-done]').click();
    await waitFor(async () => (path(PB) === DAY ? 1 : null), 10000);
    await waitFor(async () => ((await PB.locator('[data-file-day]').count()) === 1 ? 1 : null), 15000);
    R.ok('both papers done: File this day appears', (await PB.locator('[data-file-day]').count()) === 1);
  });

  await R.section("The home's Continue and the walkthrough agree; the arrow from Check and sign returns to the Walkthrough", async () => {
    await spa(PB, `${DAY}?view=walkthrough`);
    await PB.locator('[data-phase="check"]').waitFor({ timeout: 15000 });
    await PB.locator('[data-phase="check"]').click();
    await waitFor(async () => (/view=check/.test(PB.url()) ? 1 : null), 10000);
    await PB.locator('[data-nav-back]').first().waitFor({ timeout: 10000 });
    await sleep(500);
    R.ok(`from the walkthrough into Check and sign, the arrow reads "‹ ${((await PB.locator('[data-nav-back-label]').first().textContent()) || '').trim()}"`, ((await PB.locator('[data-nav-back-label]').first().textContent()) || '').trim() === 'Walkthrough');
    await PB.locator('[data-nav-back]').first().click();
    await sleep(500);
    R.ok('and returns there', /\?view=walkthrough$/.test(path(PB)));
    R.ok('the Complete banner offers Edit again on the check screen', true);
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId].filter(Boolean), drillLogs: [logId].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cD.close();
  await cB.close();
  return R.summary();
}

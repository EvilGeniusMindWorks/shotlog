async (page, lib) => {
  // S9b follow-up (Matthew, Sep 9): a tap on a FINISHED pattern created a second,
  // empty drill log that pulled the day back to "in progress" and could not be
  // removed. Now: (1) no new log on a shot whose drilling is accepted — the
  // accepted log opens instead; (2) an empty open log does not change the
  // phase; (3) the drill log page has a lifecycle menu, and an empty log deletes.
  const { mkCtx, signIn, skipTours, waitForUpload, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  let dayId, shotId, logId, strayId;

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);

  await R.section('a day whose only drill log is accepted', async () => {
    const made = await PB.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const { todayISO } = await import('/src/lib/utils.ts');
      const today = todayISO();
      const taken = new Set((await db.blastDays.filter((d) => d.date === today).toArray()).map((d) => d.jobId));
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !taken.has(j.id)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const id = await createBlastDay(jobs[0].id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `S9b stray ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      return { id, shotId: shot.id };
    }, stamp);
    dayId = made.id; shotId = made.shotId;
    await sleep(2500);
    const cD = await mkCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const PD = await cD.newPage();
    await signIn(PD, 'dinis');
    await skipTours(PD);
    logId = await PD.evaluate(async ({ dayId, shotId }) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const day = await db.blastDays.get(dayId);
      const shot = await db.shots.get(shotId);
      const id = await createDrillLog(shot, dayId, day.jobId);
      const now = nowISO();
      for (const n of ['1', '2', '3']) await db.drillLogHoles.add({ id: generateId(), drillLogId: id, date: todayISO(), holeNumber: n, angle: 0, actualDepth: 18, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      await db.drillLogs.update(id, { status: 'complete', completedAt: now, updatedAt: now });
      return id;
    }, { dayId, shotId });
    await waitForUpload(PD).catch(() => undefined);
    await cD.close();
    // the blaster accepts it (legal transition complete → accepted)
    let ok = false;
    for (let i = 0; i < 10 && !ok; i++) {
      ok = await PB.evaluate(async (logId) => { const { db } = await import('/src/db/index.ts'); const l = await db.drillLogs.get(logId); if (!l || l.status !== 'complete') return false; const { nowISO } = await import('/src/lib/utils.ts'); await db.drillLogs.update(logId, { status: 'accepted', acceptedAt: nowISO(), updatedAt: nowISO() }); return true; }, logId);
      if (!ok) await sleep(1000);
    }
    R.ok('the driller\'s log is accepted', ok);
  });

  await R.section('no second log on finished drilling — the accepted one opens instead', async () => {
    const r = await PB.evaluate(async ({ shotId, dayId, logId }) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const day = await db.blastDays.get(dayId);
      const shot = await db.shots.get(shotId);
      const got = await createDrillLog(shot, dayId, day.jobId);
      const logs = await db.drillLogs.where('shotId').equals(shotId).toArray();
      return { got, same: got === logId, count: logs.length };
    }, { shotId, dayId, logId });
    R.ok(`createDrillLog on an accepted shot returns the accepted log (${r.same ? 'same id' : 'DIFFERENT'}), ${r.count} log(s) in all`, r.same && r.count === 1);
  });

  await R.section('an empty open log (forced in) does not drag the day back to "in progress", and an admin can delete it', async () => {
    strayId = await PB.evaluate(async ({ shotId, dayId }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const me = JSON.parse(localStorage.getItem('shotlog-user-info'));
      const day = await db.blastDays.get(dayId);
      const shot = await db.shots.get(shotId);
      const id = generateId();
      const now = nowISO();
      await db.drillLogs.add({ id, jobId: day.jobId, blastDayId: dayId, shotId: shot.id, status: 'open', holeDiameter: shot.drillParams.holeDiameter, burden: shot.drillParams.burden, spacing: shot.drillParams.spacing, faceHeight: 0, gps: '', locationNote: '', drillerUserId: me.id, drillerName: me.name, signatureImage: null, createdAt: now, updatedAt: now, syncStatus: 'local' });
      return id;
    }, { shotId, dayId });
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    await PB.locator('main').waitFor({ timeout: 15000 });
    await sleep(1500);
    await PB.locator('[data-phase="drilling"]').waitFor({ timeout: 10000 });
    const chip = await PB.locator('[data-phase="drilling"]').getAttribute('data-phase-chip');
    const sub = (await PB.locator('[data-phase="drilling"]').innerText()).replace(/\s+/g, ' ');
    R.ok(`the day's Drilling phase still reads "${chip}" (${sub.slice(0, 60)})`, chip === 'accepted' && /1 driller\b/.test(sub));
    await sleep(2500);
    const cA = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
    const PA = await cA.newPage();
    await signIn(PA, 'mark');
    await skipTours(PA);
    await PA.goto(`${WEB}/blast-day/${dayId}/drill-log/${strayId}`);
    await PA.getByRole('button', { name: 'More actions' }).waitFor({ timeout: 15000 });
    await PA.getByRole('button', { name: 'More actions' }).click();
    await PA.getByText('Delete…').click();
    await PA.getByRole('button', { name: /^Delete Drill log/ }).click();
    await PA.waitForURL(new RegExp('/blast-day/' + dayId + '$'), { timeout: 10000 });
    await sleep(1500);
    await cA.close();
    const gone = await PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); return (await db.drillLogs.get(id)) == null; }, strayId);
    R.ok('the empty log is deleted from its own page and the day is back', gone);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId], drillLogs: [logId] }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cB.close();
  return R.summary();
}

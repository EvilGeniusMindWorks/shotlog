async (page, lib) => {
  // Navigation round, push 1 — the arrow says where it goes (2026-09-16)
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
  let dayId, job, rig;
  const checklistIds = [];
  const drillLogIds = [];
  const path = (P) => new URL(P.url()).pathname + new URL(P.url()).search;
  // an in-app navigation, the way a tap does it (the trail records it); never a page load
  const spa = async (P, to) => {
    await P.evaluate((to) => window.__shotlogNavigate(to), to);
    await sleep(250);
  };
  const backLabel = async (P) => {
    // the label settles a beat after the screen changes (the trail records, then the header re-reads it)
    await sleep(450);
    return ((await P.locator('[data-nav-back-label]').first().textContent().catch(() => '')) || '').trim();
  };
  const dayName = `nav ${stamp}`;
  const tapBack = async (P) => {
    await P.locator('[data-nav-back]').first().click();
    await sleep(400);
  };

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);
  const cD = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
  const PD = await cD.newPage();
  await signIn(PD, 'dinis');
  await skipTours(PD);

  const picked = await PB.evaluate(async () => {
    const { db } = await import('/src/db/index.ts');
    const { todayISO } = await import('/src/lib/utils.ts');
    const today = todayISO();
    const taken = new Set((await db.blastDays.filter((d) => d.date === today).toArray()).map((d) => d.jobId));
    // an accepted drill log outlives its day on the server, and day and shot ids are fixed by job + date —
    // a job with a log today would hand the driller an old accepted log instead of a fresh one
    const logged = new Set((await db.drillLogs.filter((l) => (l.date ?? l.createdAt.slice(0, 10)) === today).toArray()).map((l) => l.jobId));
    const free = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !taken.has(j.id) && !logged.has(j.id) && !/^S1[124]/.test(j.name)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
    const drills = (await db.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill')).toArray()).sort((a, b) =>
      a.assetNumber.localeCompare(b.assetNumber, undefined, { numeric: true }),
    );
    return { job: free[0] ? { id: free[0].id, name: free[0].name } : null, rig: drills[0] ? { id: drills[0].id, asset: drills[0].assetNumber } : null };
  });
  if (!picked.job || !picked.rig) throw new Error('need a free job and a drill');
  job = picked.job;
  rig = picked.rig;
  dayId = await PB.evaluate(
    async ({ jobId, stamp }) => {
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      return createBlastDayWithPapers(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `nav ${stamp}` });
    },
    { jobId: job.id, stamp },
  );
  await waitForUpload(PB, 30000);
  R.note(`job ${job.name} · rig ${rig.asset} · day ${dayId.slice(0, 8)}`);
  const DAY = `/blast-day/${dayId}`;

  await R.section('From Work days, Records and a job into the day: the arrow returns to where you came from', async () => {
    await PB.goto(`${WEB}/days`);
    await PB.locator('[data-tour="nav"], nav, aside').first().waitFor({ timeout: 20000 });
    await spa(PB, DAY);
    await PB.locator('[data-tile="rigs"], [data-tile="blast-log"]').first().waitFor({ timeout: 20000 });
    R.ok(`from Work days the arrow reads "‹ ${await backLabel(PB)}"`, (await backLabel(PB)) === 'Work days');
    await tapBack(PB);
    R.ok('and lands on Work days', path(PB) === '/days');
    await spa(PB, '/records');
    await spa(PB, DAY);
    await PB.locator('[data-nav-back]').first().waitFor({ timeout: 20000 });
    R.ok(`from Records the arrow reads "‹ ${await backLabel(PB)}"`, (await backLabel(PB)) === 'Records');
    await tapBack(PB);
    R.ok('and lands on Records', path(PB) === '/records');
    await spa(PB, `/jobs/${job.id}`);
    await PB.locator('[data-nav-back]').first().waitFor({ timeout: 20000 });
    await spa(PB, DAY);
    await PB.locator('[data-tile="rigs"], [data-tile="blast-log"]').first().waitFor({ timeout: 20000 });
    const fromJob = await backLabel(PB);
    R.ok(`from the job page the arrow names the job ("‹ ${fromJob}")`, fromJob.includes(job.name));
    await tapBack(PB);
    R.ok('and lands on the job page', path(PB) === `/jobs/${job.id}`);
    R.ok('a root has no arrow', (await PB.locator('[data-screen-header] [data-nav-back]').count()) === 0 || !(await PB.locator('[data-screen-header]').count()));
    R.ok('on a wide screen the job page shows its path', (await PB.locator('[data-nav-path], .text-\\[11px\\]').first().count()) > 0);
  });

  let shotId;
  await R.section('Inside the day: Blasting log → Design plan → the arrow lands on the Blasting log; the tabs are real steps the back gesture walks', async () => {
    shotId = await PB.evaluate(async (dayId) => {
      const { db } = await import('/src/db/index.ts');
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      return (await db.shots.where('blastLogId').equals(log.id).first())?.id;
    }, dayId);
    await spa(PB, '/days');
    await spa(PB, DAY);
    await PB.locator('[data-tile="blast-log"] [data-tile-action]').waitFor({ timeout: 20000 });
    await PB.locator('[data-tile="blast-log"] [data-tile-action]').click();
    await waitFor(async () => (/view=walkthrough/.test(PB.url()) ? 1 : null), 10000);
    R.ok(`the Blasting log tile opens a step of its own (${path(PB).replace(dayId, '…')})`, /\?view=walkthrough$/.test(path(PB)));
    R.ok(`inside the day the arrow names the day ("‹ ${await backLabel(PB)}")`, (await backLabel(PB)) === dayName);
    await PB.locator('[data-tour="day-tabs"] button', { hasText: 'Blasting Log' }).click();
    await waitFor(async () => (/view=blast-log/.test(PB.url()) ? 1 : null), 10000);
    R.ok('the Blasting Log tab is a step too', /\?view=blast-log$/.test(path(PB)));
    await waitFor(async () => (((await PB.locator('[data-nav-path]').first().textContent()) || '').includes('Blasting log') ? 1 : null), 8000);
    R.ok('the wide screen shows the path Work days ▸ the day ▸ Blasting log', ((await PB.locator('[data-nav-path]').first().textContent()) || '').includes('Blasting log'));
    await spa(PB, `${DAY}/design/${shotId}`);
    await PB.locator('[data-design-title]').waitFor({ timeout: 20000 });
    const designLabel = await backLabel(PB);
    if (designLabel !== 'Blasting log') R.note('trail: ' + (await PB.evaluate(() => JSON.parse(sessionStorage.getItem('shotlog-nav-trail') || '[]').map((e) => e.path.replace(/[0-9a-f-]{36}/g, '…') + ':' + e.label).join(' → '))));
    R.ok(`on the Design plan the arrow reads "‹ ${designLabel}"`, designLabel === 'Blasting log');
    await tapBack(PB);
    R.ok('and lands on the Blasting log, not the Day tab', /\?view=blast-log$/.test(path(PB)));
    await PB.goBack();
    await sleep(500);
    R.ok(`the back gesture walks the tabs: ${path(PB).replace(dayId, '…')}`, /\?view=walkthrough$/.test(path(PB)));
    await PB.goBack();
    await sleep(500);
    R.ok('…then the tiles, still inside the day', path(PB) === DAY);
    // from the walkthrough into the plan: the arrow goes back to the walkthrough
    await spa(PB, `${DAY}?view=walkthrough`);
    await spa(PB, `${DAY}/design/${shotId}?mode=plan`);
    await PB.locator('[data-design-title]').waitFor({ timeout: 20000 });
    R.ok(`opened from the walkthrough, the plan's arrow reads "‹ ${await backLabel(PB)}"`, (await backLabel(PB)) === 'Walkthrough');
    await tapBack(PB);
    R.ok('and returns to the walkthrough', /\?view=walkthrough$/.test(path(PB)));
  });

  await R.section('The driller: home card → day → drill log → the arrow reads the day; Mark complete lands on the day', async () => {
    await PD.goto(`${WEB}/`);
    await PD.locator('[data-tour="nav"]').waitFor({ timeout: 20000 });
    await spa(PD, DAY);
    await PD.locator('[data-tile="drill-log"] [data-tile-action]').waitFor({ timeout: 30000 });
    // a log left on this day by an earlier run would open read-only — start clean
    const stale = await PD.evaluate(async (dayId) => {
      const { db, deleteWithTombstone } = await import('/src/db/index.ts');
      const logs = await db.drillLogs.filter((l) => l.blastDayId === dayId).toArray();
      for (const l of logs) {
        for (const hole of await db.drillLogHoles.where('drillLogId').equals(l.id).toArray()) await deleteWithTombstone('drillLogHoles', hole.id);
        await deleteWithTombstone('drillLogs', l.id);
      }
      return logs.map((l) => `${l.id.slice(0, 8)}:${l.status}`);
    }, dayId);
    if (stale.length) R.note('removed stale logs: ' + stale.join(', '));
    await waitFor(async () => ((await PD.locator('[data-tile="drill-log"] [data-tile-action="Start"]').count()) === 1 ? 1 : null), 15000);
    R.ok(`from the home the day's arrow reads "‹ ${await backLabel(PD)}"`, (await backLabel(PD)) === 'Dashboard');
    await PD.locator('[data-tile="drill-log"] [data-tile-action]').click();
    await PD.waitForURL(/\/drill-log\//, { timeout: 15000 });
    const logId = PD.url().match(/drill-log\/([^/?]+)/)?.[1];
    if (logId) drillLogIds.push(logId);
    await sleep(600);
    R.note('fresh log: ' + JSON.stringify(await PD.evaluate(async (logId) => { const l = await (await import('/src/db/index.ts')).db.drillLogs.get(logId); return { status: l?.status, completedAt: l?.completedAt, acceptedAt: l?.acceptedAt }; }, logId)));
    await PD.locator('[data-nav-back]').first().waitFor({ timeout: 15000 });
    await waitFor(async () => ((await backLabel(PD)) === dayName ? 1 : null), 10000);
    R.ok(`on the drill log the arrow names the day ("‹ ${await backLabel(PD)}"), not home`, (await backLabel(PD)) === dayName);
    await tapBack(PD);
    R.ok('and lands on the day', path(PD) === DAY);
    await tapBack(PD);
    R.ok('then home, where he started', path(PD) === '/');
    // mark it complete → lands on the day (in through the tile, the way he does)
    await spa(PD, DAY);
    await PD.locator('[data-tile="drill-log"] [data-tile-action]').waitFor({ timeout: 30000 });
    await PD.locator('[data-tile="drill-log"] [data-tile-action]').click();
    await PD.waitForURL(/\/drill-log\//, { timeout: 15000 });
    await PD.locator('[data-tour="log-header"]').waitFor({ timeout: 30000 }).catch(async () => {
      R.note('log page did not render: ' + path(PD) + ' · ' + ((await PD.textContent('body')) || '').slice(0, 120).replace(/\s+/g, ' '));
    });
    await PD.evaluate(async (logId) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO, generateId, todayISO } = await import('/src/lib/utils.ts');
      const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
      const now = nowISO();
      // one hole, so Mark complete is offered; signed, so it completes in one tap
      await db.drillLogHoles.add({ id: generateId(), drillLogId: logId, date: todayISO(), holeNumber: '1', angle: 0, actualDepth: 20, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      await db.drillLogs.update(logId, { signatureImage: png, updatedAt: nowISO() });
    }, logId);
    await sleep(800);
    R.note('log page: ' + JSON.stringify(await PD.evaluate(async (logId) => {
      const { db } = await import('/src/db/index.ts');
      const l = await db.drillLogs.get(logId);
      return { status: l?.status, holes: (await db.drillLogHoles.where('drillLogId').equals(logId).toArray()).length, signed: Boolean(l?.signatureImage), top: document.querySelectorAll('[data-tour="log-complete"]').length, bottom: document.querySelectorAll('[data-log-complete-bottom]').length, path: location.pathname.replace(/[0-9a-f-]{36}/g, '…'), gate: document.querySelector('[data-day-setup]')?.getAttribute('data-day-setup') ?? null, header: document.querySelector('[data-tour="log-header"]')?.textContent?.slice(0, 60) };
    }, logId)));
    await PD.locator('[data-log-complete-bottom], [data-tour="log-complete"]').first().waitFor({ timeout: 40000 });
    await PD.locator('[data-log-complete-bottom]:visible, [data-tour="log-complete"]:visible').first().click();
    await PD.locator('[data-log-complete-confirm]').waitFor({ timeout: 10000 });
    // S20: a log with no rig asks for it in the sheet — Complete waits until one is picked
    if (await PD.locator('[data-log-complete-rig-select]').count()) {
      const firstRig = await PD.locator('[data-log-complete-rig-select] option').nth(1).getAttribute('value');
      await PD.locator('[data-log-complete-rig-select]').selectOption(firstRig);
      await waitFor(async () => ((await PD.locator('[data-log-complete-confirm]').isDisabled()) ? null : 1), 10000);
    }
    await PD.locator('[data-log-complete-confirm]').click();
    const landed = await waitFor(async () => (path(PD) === DAY ? 1 : null), 10000);
    R.ok('Mark complete lands on the day', landed === 1);
    await waitFor(async () => (/Signed complete/.test((await PD.locator('[data-tile="drill-log"]').textContent().catch(() => '')) || '') ? 1 : null), 10000);
    const tile = (await PD.locator('[data-tile="drill-log"]').textContent().catch(() => '')) || '';
    R.ok(`where the log reads Signed complete ("${tile.slice(0, 60)}")`, /Signed complete/.test(tile));
  });

  await R.section('The rig checklist from the day: Save lands on the day with the rig row; from the rig, Save lands on the rig (S20: the stop hours come later)', async () => {
    await spa(PD, DAY);
    await PD.locator('[data-rig-start]').waitFor({ timeout: 20000 });
    await PD.locator('[data-rig-start]').click();
    await PD.waitForURL(/\/drill-checklist\?/, { timeout: 10000 });
    const chip = PD.locator(`[data-rig-chip="${rig.asset}"]`);
    if (!(await chip.first().isVisible().catch(() => false))) {
      await PD.locator('[data-rig-all-toggle]').click();
      await chip.first().waitFor({ timeout: 5000 });
    }
    await chip.first().click();
    await waitFor(async () => ((await backLabel(PD)) === dayName ? 1 : null), 10000);
    R.ok(`the checklist's arrow names the day it came from ("‹ ${await backLabel(PD)}")`, (await backLabel(PD)) === dayName);
    await PD.locator('[data-chk-hours]').fill('1500');
    await PD.locator('[data-chk-file]').click();
    const onDay = await waitFor(async () => (path(PD) === DAY ? 1 : null), 15000);
    R.ok('Save lands on the day', onDay === 1);
    const id1 = await PD.evaluate(async ({ rigId, jobId }) => { const { db } = await import('/src/db/index.ts'); const { todayISO } = await import('/src/lib/utils.ts'); return (await db.drillChecklists.filter((c) => c.equipmentId === rigId && c.date === todayISO() && c.jobId === jobId).toArray())[0]?.id; }, { rigId: rig.id, jobId: job.id });
    if (id1) checklistIds.push(id1);
    await PD.locator(`[data-rig-row="${rig.asset}"]`).waitFor({ timeout: 15000 }).catch(() => {});
    R.ok('with the rig on its Rig checklists tile', (await PD.locator(`[data-rig-row="${rig.asset}"]`).count()) === 1);
    // from the rig: no job, no day → Done lands on the rig
    await spa(PD, `/equipment/${rig.id}`);
    await PD.locator('[data-nav-back]').first().waitFor({ timeout: 15000 });
    await spa(PD, `/drill-checklist/${rig.id}`);
    await PD.locator('[data-chk-hours]').waitFor({ timeout: 15000 });
    R.ok(`from the rig the arrow reads "‹ ${await backLabel(PD)}"`, (await backLabel(PD)) === rig.asset);
    await PD.locator('[data-checklist-job]').selectOption('');
    await PD.locator('[data-chk-file]').click();
    const onRig = await waitFor(async () => (path(PD) === `/equipment/${rig.id}` ? 1 : null), 15000);
    R.ok('Save lands on the rig', onRig === 1);
    const id2 = await PD.evaluate(async ({ rigId }) => { const { db } = await import('/src/db/index.ts'); const { todayISO } = await import('/src/lib/utils.ts'); return (await db.drillChecklists.filter((c) => c.equipmentId === rigId && c.date === todayISO() && !c.jobId).toArray())[0]?.id; }, { rigId: rig.id });
    if (id2) checklistIds.push(id2);
  });

  await R.section('Mark the daily report done lands on the day; sheets say Close and the back gesture closes them first', async () => {
    await spa(PB, '/days');
    await spa(PB, DAY);
    await PB.locator('[data-tile="daily-report"] [data-tile-action]').waitFor({ timeout: 20000 });
    await PB.locator('[data-tile="daily-report"] [data-tile-action]').click();
    await waitFor(async () => (/view=daily-report/.test(PB.url()) ? 1 : null), 10000);
    await PB.locator('[data-report-done]').waitFor({ timeout: 15000 });
    await PB.locator('[data-report-done]').click();
    const landed = await waitFor(async () => (path(PB) === DAY ? 1 : null), 10000);
    R.ok('Mark the daily report done lands on the day', landed === 1);
    await waitFor(async () => (/Done/.test((await PB.locator('[data-tile="daily-report"]').textContent()) || '') ? 1 : null), 10000);
    const tile = (await PB.locator('[data-tile="daily-report"]').textContent().catch(() => '')) || '';
    R.ok(`the tile reads Done ("${tile.slice(0, 50)}")`, /Done/.test(tile));
    R.ok('the arrow still reads Work days (the form left no step behind)', (await backLabel(PB)) === 'Work days');
    // the time cards sheet
    await PB.locator('[data-tile="time-card"] [data-tile-action]').click();
    await PB.locator('[data-time-card-sheet]').waitFor({ timeout: 10000 });
    R.ok('the sheet says Close, not "Back to the day"', (await PB.locator('[data-time-card-sheet] button', { hasText: 'Close' }).count()) === 1);
    await PB.goBack();
    await sleep(500);
    if ((await PB.locator('[data-time-card-sheet]').count()) !== 0) R.note('sheet still open after goBack · history.state=' + JSON.stringify(await PB.evaluate(() => history.state)) + ' · sheets=' + (await PB.locator('[data-sheet]').count()));
    R.ok('the back gesture closes the sheet first', (await PB.locator('[data-time-card-sheet]').count()) === 0 && path(PB) === DAY);
    if (await PB.locator('[data-time-card-sheet]').count()) await PB.locator('[data-time-card-sheet] button', { hasText: 'Close' }).click();
    await PB.locator('[data-tile="time-card"] [data-tile-action]').click();
    await PB.locator('[data-time-card-sheet]').waitFor({ timeout: 10000 });
    await PB.locator('[data-time-card-sheet] button', { hasText: 'Close' }).click();
    await sleep(500);
    R.ok('Close closes it and the day is where it was', (await PB.locator('[data-time-card-sheet]').count()) === 0 && path(PB) === DAY);
    R.ok('and the arrow still reads Work days', (await backLabel(PB)) === 'Work days');
  });

  await R.section('A fresh open and a print screen: up the map, labelled', async () => {
    const cF = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
    const PF = await cF.newPage();
    await signIn(PF, 'blaster');
    await skipTours(PF);
    // a truly fresh open: this tab has been nowhere
    await PF.evaluate(() => sessionStorage.removeItem('shotlog-nav-trail'));
    await PF.goto(`${WEB}${DAY}/design/${shotId}`);
    await PF.locator('[data-design-title]').waitFor({ timeout: 30000 });
    R.ok(`a fresh open of the Design plan: the arrow reads "‹ ${await backLabel(PF)}" (up the map)`, (await backLabel(PF)) === 'Blasting log');
    await tapBack(PF);
    R.ok('and lands on the Blasting log', /\?view=blast-log$/.test(path(PF)));
    await spa(PF, `${DAY}/print`);
    await PF.locator('[data-nav-back-label]').first().waitFor({ timeout: 20000 });
    R.ok(`the print screen's button reads "‹ ${await backLabel(PF)}"`, (await backLabel(PF)) === 'Blasting log');
    await tapBack(PF);
    R.ok('and returns to the Blasting log', /\?view=blast-log$/.test(path(PF)));
    await cF.close();
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId].filter(Boolean), drillLogs: drillLogIds, checklists: checklistIds }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cD.close();
  await cB.close();
  return R.summary();
}

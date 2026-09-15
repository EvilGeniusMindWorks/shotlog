async (page, lib) => {
  // Round S16 — A job on a date, and moving it (2026-09-15)
  const { mkCtx, signIn, skipTours, sleep, WEB, browserErrors, waitForUpload } = lib;
  const PNG = 'new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: "image/png" })';
  const waitFor = async (fn, timeout = 20000, every = 300) => {
    const until = Date.now() + timeout;
    let last;
    while (Date.now() < until) {
      last = await fn().catch(() => undefined);
      if (last) return last;
      await sleep(every);
    }
    return last;
  };
  const tileState = (P, id) => P.locator(`[data-tile="${id}"]`).first().getAttribute('data-tile-state');
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  browserErrors({ clear: true });
  let dayId, shotId, logId, jobs, dayId2, drillLogId, cardId, chkA, chkB, meD, yesterday, tomorrow;
  const cD = await mkCtx(browser, { viewport: { width: 420, height: 860 } });
  const PD = await cD.newPage();

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PB = await cB.newPage();
  await signIn(PB, "blaster");
  await skipTours(PB);

  jobs = await PB.evaluate(async () => {
    const { db } = await import('/src/db/index.ts');
    const { todayISO } = await import('/src/lib/utils.ts');
    const taken = new Set((await db.blastDays.filter((d) => d.date === todayISO()).toArray()).map((d) => d.jobId));
    return (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !taken.has(j.id) && !/^S1[124]/.test(j.name)).toArray()).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 3).map((j) => ({ id: j.id, name: j.name }));
  });
  if (jobs.length < 2) throw new Error('need free jobs');
  R.note(`jobs: ${jobs.map((j) => j.name).join(' / ')}`);

  await R.section("One log, one blaster, one signature: the tiles and the filing screen agree", async () => {
    const made = await PB.evaluate(async ({ jobId, stamp }) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      const id = await createBlastDayWithPapers(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `s16 ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      return { id, logId: log.id, shotId: shot.id };
    }, { jobId: jobs[0].id, stamp });
    dayId = made.id; logId = made.logId; shotId = made.shotId;
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    await PB.locator('[data-day-hub]').waitFor({ timeout: 20000 });
    await sleep(500);
    const st = await tileState(PB, 'blast-log');
    R.ok(`the Blasting log tile reads "${st}" · the shot count and "not signed yet", never a shot count of signatures`, /^Started/.test(st ?? '') && /not signed yet/.test(await PB.locator('[data-tile="blast-log"]').innerText()));
    R.ok('File this day is blocked with "sign it to file" about the LOG', (await PB.locator('[data-file-row]').getAttribute('data-file-row')) === 'blocked' && /log is not signed/.test(await PB.locator('[data-file-row]').innerText()));
    await PB.goto(`${WEB}/blast-day/${dayId}?view=blast-log`);
    await PB.locator('[data-tour="log-signature"]').waitFor({ timeout: 15000 });
    R.ok('the shot has no Responsible Blaster row; the log has its one signature box', (await PB.locator('[data-tour="shot-signoff"]').count()) === 0 && (await PB.getByText(/Responsible Blaster/).count()) === 0 && (await PB.locator('[data-tour="log-signature"]').count()) === 1);
    await PB.goto(`${WEB}/blast-day/${dayId}/submit`);
    await PB.locator('[data-preflight]').waitFor({ timeout: 15000 });
    const red = PB.locator('[data-preflight-level="red"]');
    R.ok(`the filing screen's red item is about the log ("${(await red.first().innerText()).replace(/\s+/g, ' ').trim().slice(0, 40)}")`, (await red.count()) === 1 && /blasting log is not signed/i.test(await red.first().innerText()) && (await PB.getByText(/has no blaster signature/).count()) === 0);
    // sign the log, the one signature
    await PB.evaluate(async ({ logId, png }) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      // eslint-disable-next-line no-eval
      await db.blastLogs.update(logId, { signatureImage: eval(png), signedAt: nowISO(), updatedAt: nowISO() });
    }, { logId, png: PNG });
    await PB.goto(`${WEB}/blast-day/${dayId}/submit`);
    await PB.locator('[data-preflight]').waitFor({ timeout: 15000 });
    await sleep(500);
    R.ok('with the log signed the red is gone and the green line names the signer', (await PB.locator('[data-preflight-level="red"]').count()) === 0 && (await PB.getByText(/Blasting log signed/).count()) === 1);
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    await PB.locator('[data-day-hub]').waitFor({ timeout: 20000 });
    const ready = await waitFor(() => tileState(PB, 'blast-log').then((x) => (x === 'Ready to file' ? x : null)));
    R.ok('the tile reads Ready to file and File this day is offered — the same rule as the filing screen', ready === 'Ready to file' && (await waitFor(() => PB.locator('[data-file-row]').getAttribute('data-file-row').then((k) => (k === 'ready' ? k : null)))) === 'ready');
  });

  await R.section("Change the date from the header: the sheet, what moves, the blocks, the trail", async () => {
    // Dinis brings a drill log and a FILED time card to the day — papers the blaster does not own
    await signIn(PD, 'dinis');
    await skipTours(PD);
    meD = await PD.evaluate(async () => (await import('/src/lib/session.ts')).getSessionUser());
    await waitFor(() => PD.evaluate(async (id) => Boolean(await (await import('/src/db/index.ts')).db.shots.get(id)), shotId).then((x) => (x ? 1 : 0)));
    const made = await PD.evaluate(async ({ dayId, shotId }) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const { createTimeCard, fileTimeCard } = await import('/src/hooks/useTimeCards.ts');
      const { getSessionUser } = await import('/src/lib/session.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const me = getSessionUser();
      const day = await db.blastDays.get(dayId);
      const logId = await createDrillLog(await db.shots.get(shotId), dayId, day.jobId);
      const now = nowISO();
      await db.drillLogHoles.add({ id: generateId(), drillLogId: logId, date: todayISO(), holeNumber: '1', angle: 0, actualDepth: 20, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      const cardId = await createTimeCard(day, { name: me.name, userId: me.id });
      await db.timeCards.update(cardId, { timeIn: '06:30', timeOut: '14:30', straightTime: 8, updatedAt: nowISO() });
      await fileTimeCard(await db.timeCards.get(cardId));
      return { logId, cardId };
    }, { dayId, shotId });
    drillLogId = made.logId; cardId = made.cardId;
    await waitForUpload(PD, 30000);
    await waitFor(() => PB.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.timeCards.get(id))?.status === 'filed', cardId).then((x) => (x ? 1 : 0)));
    const nd = await PB.evaluate(async () => (await import('/src/lib/dayMove.ts')).nearbyDates());
    yesterday = nd[0].date; tomorrow = nd[2].date;

    await PB.goto(`${WEB}/blast-day/${dayId}`);
    await PB.locator('[data-day-hub]').waitFor({ timeout: 20000 });
    R.ok('the header date is a button, plain today (not amber)', (await PB.locator('[data-day-date-button]').count()) === 1 && (await PB.locator('[data-day-date-button][data-not-today]').count()) === 0);
    await PB.locator('[data-day-date-button]').click();
    await PB.locator('[data-change-date]').waitFor({ timeout: 8000 });
    R.ok('the sheet offers Yesterday / Today (this day’s date, greyed) / Tomorrow / Pick a date', (await PB.locator('[data-move-pick]').count()) === 4 && (await PB.locator('[data-move-pick="today"]').isDisabled()));
    await PB.locator('[data-move-pick="yesterday"]').click();
    await PB.locator('[data-move-plan]').waitFor({ timeout: 10000 });
    const rows = await PB.locator('[data-move-row]').allInnerTexts();
    R.ok(`"What moves" lists the card, the log, Dinis's drill log and his FILED card (${rows.length} rows)`, rows.some((r) => /Blasting log/.test(r)) && rows.some((r) => /Drill log · Dinis/.test(r)) && rows.some((r) => /Time card · Dinis.*filed.*moves too/.test(r)));
    R.ok('nothing blocks it; the button reads Move to <yesterday>', (await PB.locator('[data-move-block]').count()) === 0 && !(await PB.locator('[data-move-go]').isDisabled()) && (await PB.locator('[data-move-go]').innerText()).includes('Move to'));
    await PB.locator('[data-move-go]').click();
    await PB.locator('[data-change-date]').waitFor({ state: 'detached', timeout: 15000 });
    const movedDay = await waitFor(() => PB.evaluate(async ({ id, d }) => { const x = await (await import('/src/db/index.ts')).db.blastDays.get(id); return x?.date === d ? x : null; }, { id: dayId, d: yesterday }));
    R.ok('the day is on yesterday with the trail (moved from today, by Barry)', movedDay?.date === yesterday && movedDay?.movedFrom?.byName === 'Barry Blaster');
    R.ok('the tiles show the trail line', (await waitFor(() => PB.locator('[data-day-moved]').count().then((n) => (n === 1 ? 1 : 0)))) === 1 && /Moved from/.test(await PB.locator('[data-day-moved]').innerText()));
    await waitForUpload(PB, 30000);
    // the server applied it to Dinis's papers — his phone sees the new date on all three
    const onD = await waitFor(async () =>
      PD.evaluate(async ({ dayId, logId, cardId, d }) => {
        const { db } = await import('/src/db/index.ts');
        const day = await db.blastDays.get(dayId);
        const log = await db.drillLogs.get(logId);
        const card = await db.timeCards.get(cardId);
        const hole = await db.drillLogHoles.where('drillLogId').equals(logId).first();
        return day?.date === d && log?.date === d && card?.date === d && card?.status === 'filed' && hole?.date === d ? { ok: true } : null;
      }, { dayId, logId: drillLogId, cardId, d: yesterday }),
      40000,
    );
    R.ok("Dinis's drill log, its hole and his filed card all moved — the server accepted the blaster's date change on papers he does not own", Boolean(onD));
    await PD.goto(`${WEB}/`);
    const line = await waitFor(() => PD.locator('[data-reminder-moved]').innerText().catch(() => ''), 25000);
    R.ok(`Dinis's home says where his card went ("${(line ?? '').slice(0, 80)}")`, /moved .* from .* to .*your time card went with it/.test(line ?? ''));

    // a block: the job already has a day with papers on the target date
    dayId2 = await PB.evaluate(async ({ jobId, d, stamp }) => (await import('/src/hooks/useBlastDay.ts')).createBlastDayWithPapers(jobId, d, undefined, { typeOfWork: 'drill_to_blast', name: `s16 other ${stamp}` }), { jobId: jobs[0].id, d: tomorrow, stamp });
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    await PB.locator('[data-day-date-button]').waitFor({ timeout: 20000 });
    await PB.locator('[data-day-date-button]').click();
    await PB.locator('[data-move-pick="tomorrow"]').click();
    await PB.locator('[data-move-plan]').waitFor({ timeout: 10000 });
    R.ok('a day with papers already on the target date is a red block and Move is held', (await PB.locator('[data-move-block]').count()) === 1 && /open that day instead/.test(await PB.locator('[data-move-block]').innerText()) && (await PB.locator('[data-move-go]').isDisabled()));
    await PB.keyboard.press('Escape');
    await PB.getByRole('button', { name: 'Cancel' }).click().catch(() => undefined);
  });

  await R.section("The amber not-today date and the Start-work date row", async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    await PB.locator('[data-day-date-button]').waitFor({ timeout: 20000 });
    R.ok('a day that is not today wears an amber "· not today" date', (await PB.locator('[data-day-date-button][data-not-today="1"]').count()) === 1 && /not today/.test(await PB.locator('[data-day-date-button]').innerText()));
    await PB.goto(`${WEB}/`);
    await PB.getByRole('button', { name: /Start a day at/ }).first().waitFor({ timeout: 20000 });
    await PB.getByRole('button', { name: /Start a day at/ }).first().click();
    await PB.locator('[data-new-day-dialog]').waitFor({ timeout: 8000 });
    R.ok('the dialog is "Start a day at a job" with a Date row reading Today', (await PB.getByText('Start a day at a job').count()) >= 1 && /^Today · /.test(await PB.locator('[data-day-date] [data-fact-value]').innerText()));
    await PB.locator('[data-day-date] [data-fact-row="date"]').click();
    await PB.locator('[data-chooser="date"]').waitFor({ timeout: 8000 });
    await PB.locator(`[data-chooser="date"] [data-option="${tomorrow}"]`).click();
    await sleep(300);
    const v = await PB.locator('[data-day-date] [data-fact-value]').innerText();
    R.ok(`pick Tomorrow and the row reads it ("${v}")`, !/^Today/.test(v) && v.length > 6);
    await PB.keyboard.press('Escape');
  });

  await R.section("A rig checklist per job-day, prefilled from the morning", async () => {
    // the morning: R at job 1, starting hours X, one item not ok
    const m = await PD.evaluate(async ({ jobA }) => {
      const { db } = await import('/src/db/index.ts');
      const { emptyChecklist, fileChecklist } = await import('/src/hooks/useMaintenance.ts');
      const { buildHourLedger } = await import('/src/lib/hourLedger.ts');
      const rig = await db.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill') && (e.status ?? 'active') === 'active').first();
      const { currentHours } = await buildHourLedger(rig);
      const start = Math.ceil(Math.max(currentHours ?? 0, rig.hourMeter ?? 0)) + 10;
      const chk = emptyChecklist(rig.id, jobA);
      chk.daily[Object.keys(chk.daily)[0]] = 'na';
      await fileChecklist({ ...chk, startingHours: start });
      return { rigId: rig.id, asset: rig.assetNumber, chkId: chk.id, start, firstKey: Object.keys(chk.daily)[0] };
    }, { jobA: jobs[1].id });
    chkA = m.chkId;
    await PD.goto(`${WEB}/drill-checklist/${m.rigId}?job=${jobs[1].id}`);
    await PD.locator('[data-chk-existing]').waitFor({ timeout: 15000 });
    R.ok('at the morning job the rig already has today’s checklist', /already has today's checklist at this job/.test(await PD.locator('[data-chk-existing]').innerText()));
    await PD.goto(`${WEB}/drill-checklist/${m.rigId}?job=${jobs[2].id}`);
    await PD.locator('[data-chk-hours]').waitFor({ timeout: 15000 });
    await PD.locator('[data-chk-carried]').waitFor({ timeout: 8000 });
    R.ok('at the second job the same rig gets a NEW checklist, answers carried from the morning', (await PD.locator('[data-chk-existing]').count()) === 0 && /carried from this morning/.test(await PD.locator('[data-chk-carried]').innerText()));
    await PD.waitForFunction((x) => Number(document.querySelector('[data-chk-hours]')?.value) >= x, m.start, { timeout: 8000 }).catch(() => undefined);
    R.ok(`starting hours prefilled from the rig’s last reading (${await PD.locator('[data-chk-hours]').inputValue()} ≥ ${m.start})`, Number(await PD.locator('[data-chk-hours]').inputValue()) >= m.start);
    const sign = PD.getByRole('button', { name: /Tap to sign/ });
    if (await sign.count()) { await sign.click(); const canvas = PD.locator('canvas').first(); await canvas.waitFor({ timeout: 5000 }); const box = await canvas.boundingBox(); await PD.mouse.move(box.x + 30, box.y + 40); await PD.mouse.down(); for (let i = 1; i <= 20; i++) await PD.mouse.move(box.x + 30 + i * 8, box.y + 40 + Math.sin(i / 2) * 15); await PD.mouse.up(); await PD.getByRole('button', { name: /Save Signature/ }).click().catch(() => undefined); await sleep(400); }
    await PD.getByRole('button', { name: /File checklist/ }).click();
    await sleep(2500);
    const two = await PD.evaluate(async ({ rigId, jobB, firstKey }) => {
      const { db } = await import('/src/db/index.ts');
      const { todayISO } = await import('/src/lib/utils.ts');
      const cs = (await db.drillChecklists.filter((c) => c.equipmentId === rigId && c.date === todayISO()).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return { n: cs.length, second: cs[1] ? { job: cs[1].jobId, carried: cs[1].daily[firstKey] } : null };
    }, { rigId: m.rigId, jobB: jobs[2].id, firstKey: m.firstKey });
    chkB = await PD.evaluate(async ({ rigId, jobB }) => { const { db } = await import('/src/db/index.ts'); return (await db.drillChecklists.filter((c) => c.equipmentId === rigId && c.jobId === jobB).toArray())[0]?.id; }, { rigId: m.rigId, jobB: jobs[2].id });
    R.ok('two checklists for one rig today — one per job-day — and the carried answer is on the second', two.n === 2 && two.second?.job === jobs[2].id && two.second?.carried === 'na');
  });

  await R.section("The File button's quiet line and Start a day at a job", async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    await PB.locator('[data-file-row]').waitFor({ timeout: 20000 });
    const ready = await waitFor(() => PB.locator('[data-file-row]').getAttribute('data-file-row').then((k) => (k === 'ready' ? k : null)));
    const sub = ready ? await PB.locator('[data-file-sub]').innerText() : '';
    R.ok(`under File this day, the quiet line names the job and the date ("${sub}")`, ready === 'ready' && sub.includes(jobs[0].name) && /\d{4}/.test(sub));
    R.ok('the button itself still reads File this day', /File this day/.test(await PB.locator('[data-file-day]').innerText()));
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    if (cardId) {
      const cA = await mkCtx(browser); const PA = await cA.newPage(); await signIn(PA, 'mark');
      await PA.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); await db.timeCards.delete(id); }, cardId);
      await waitForUpload(PA, 20000).catch(() => undefined); await cA.close();
    }
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId, dayId2].filter(Boolean), drillLogs: [drillLogId].filter(Boolean), checklists: [chkA, chkB].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cB.close();
  await cD.close();
  return R.summary();
}

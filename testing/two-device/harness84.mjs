async (page, lib) => {
  // Round S24 — The open feedback: reminders, the timing grid, who filed (2026-09-18)
  // The Sep 16–18 story on Beta: a send-back reminder on a day filed since Sep 7, a newer
  // accepted log, and the driller's home trying to clear it once a second — refused every
  // time, a toast per refusal. Now a reminder is resolved on READ (the list never writes),
  // the × writes once, a filed day does not lock a reminder, the sent-back line comes from
  // the log itself, and the daily report's stop-hours Remind is gone. The timing grid draws
  // only the pattern's holes. Work days · Everyone says who ran the day and who filed it.
  const { mkCtx, signIn, skipTours, sleep, WEB, browserErrors, waitForUpload, apiLogin } = lib;
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
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  const today = new Date().toISOString().slice(0, 10);
  browserErrors({ clear: true });
  let dayId, gridDayId, logId, meB, meD, jobA, jobB;
  const sectionStart = new Date().toISOString();

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);
  const cD = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PD = await cD.newPage();
  await signIn(PD, 'dinis');
  await skipTours(PD);
  meB = await PB.evaluate(async () => (await import('/src/lib/session.ts')).getSessionUser());
  meD = await PD.evaluate(async () => (await import('/src/lib/session.ts')).getSessionUser());

  // two jobs with a site and no open day today (one day per job per date)
  const picked = await PB.evaluate(async (today) => {
    const { db } = await import('/src/db/index.ts');
    const open = new Set((await db.blastDays.filter((d) => (d.status === 'draft' && !d.closed) || d.date === today).toArray()).map((d) => d.jobId));
    // from the END of the list: this harness files a day (which stays — a filed day is not
    // deletable), and older harnesses pick their jobs from the front
    const free = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !open.has(j.id) && j.siteId && !/^S1[124]/.test(j.name)).toArray()).sort((a, b) => b.name.localeCompare(a.name));
    return free.slice(0, 2).map((j) => ({ id: j.id, name: j.name }));
  }, today);
  if (picked.length < 2) throw new Error('need two jobs with a site and no open day');
  [jobA, jobB] = picked;
  R.note(`jobs: ${jobA.name} · ${jobB.name} · blaster ${meB.name} · driller ${meD.name}`);

  const noToasts = async (P, where) => {
    await sleep(2500);
    const n = await P.getByText(/Not saved/).count();
    R.ok(`no "Not saved" toast on ${where} (${n})`, n === 0);
  };
  const discardsSince = async () => {
    const { token, api } = await apiLogin(PB, 'mark');
    const r = await api(`/audit?from=${today}&take=200`, {}, token);
    const rows = (r.body?.entries ?? []).filter((e) => e.op === 'DISCARD' && e.at >= sectionStart && e.actorId === meD.id);
    return rows;
  };

  await R.section("Reminders never write from a list · a filed day does not lock them · the daily report's Remind removed", async () => {
    // the blaster's day: a signed blasting log, papers done, ready to file later
    const made = await PB.evaluate(async ({ jobId, stamp }) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const now = nowISO();
      const dayId = await createBlastDayWithPapers(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `s24 ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      await db.shots.update(shot.id, { totals: { ...shot.totals, numHoles: 2 }, updatedAt: now });
      const sc = document.createElement('canvas'); sc.width = 200; sc.height = 80; const sg = sc.getContext('2d'); sg.fillStyle = '#fff'; sg.fillRect(0, 0, 200, 80); sg.strokeStyle = '#000'; sg.lineWidth = 2; sg.beginPath(); sg.moveTo(10, 40); sg.lineTo(190, 40); sg.stroke();
      const sig = await new Promise((r) => sc.toBlob(r, 'image/png'));
      await db.blastLogs.update(log.id, { signatureImage: sig, signedAt: now, updatedAt: now });
      return { dayId, shotId: shot.id };
    }, { jobId: jobA.id, stamp });
    dayId = made.dayId;
    await waitForUpload(PB, 30000);
    await lib.finishPapers(PB, dayId);

    // the driller logs two holes on the shot and signs the log complete
    await waitFor(() => PD.evaluate(async ({ dayId, shotId }) => { const { db } = await import('/src/db/index.ts'); return Boolean((await db.blastDays.get(dayId)) && (await db.shots.get(shotId))) ? 1 : null; }, { dayId, shotId: made.shotId }), 40000);
    logId = await PD.evaluate(async ({ shotId, dayId, jobId }) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const shot = await db.shots.get(shotId);
      const logId = await createDrillLog(shot, dayId, jobId);
      const now = nowISO();
      for (let i = 1; i <= 2; i++) await db.drillLogHoles.add({ id: generateId(), drillLogId: logId, date: todayISO(), holeNumber: String(i), angle: 0, actualDepth: 20, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      await db.drillLogs.update(logId, { status: 'complete', completedAt: now, updatedAt: now });
      return logId;
    }, { shotId: made.shotId, dayId, jobId: jobA.id });
    await waitForUpload(PD, 30000);

    // the blaster sends it back with a note — no reminder row is written for it
    await waitFor(() => PB.evaluate(async (id) => ((await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.status === 'complete' ? 1 : null), logId), 30000);
    await PB.goto(`${WEB}/blast-day/${dayId}?view=drilling`);
    await PB.locator('[data-review-sendback]').first().waitFor({ timeout: 30000 });
    await PB.locator('[data-review-sendback]').first().click();
    await PB.locator('[data-review-sendback-sheet]').waitFor({ timeout: 10000 });
    const box = PB.locator(`[data-review-sendback-log="${logId}"]`);
    if ((await box.count()) && !(await box.isChecked().catch(() => true))) await box.check();
    await PB.locator('[data-review-sendback-note]').fill(`s24 ${stamp}: hole 2 reads 20 ft, the plan says 22`);
    await PB.locator('[data-review-sendback-go]').click();
    await waitForUpload(PB, 30000);
    const rowsB = await PB.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.dayReminders.where('blastDayId').equals(id).toArray()).map((r) => r.what), dayId);
    R.ok(`the send-back writes no reminder row — the log carries it (${rowsB.length} reminder rows on the day)`, rowsB.length === 0);
    await waitFor(() => PD.evaluate(async (id) => ((await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.sentBackAt ? 1 : null), logId), 30000);
    await PD.goto(`${WEB}/`);
    await PD.locator('[data-driller-home] [data-sent-back-band]').waitFor({ timeout: 30000 });
    const band = ((await PD.locator('[data-sent-back-band]').innerText()) || '').replace(/\s+/g, ' ');
    R.ok(`the driller's home has ONE sent-back line, from the log itself: "${band.slice(0, 80)}"`, /Sent back to you · 1/i.test(band) && band.includes(`s24 ${stamp}`) && (await PD.locator('[data-reminder-kind="sentback"]').count()) === 0 && (await PD.locator('[data-reminders]').count()) === 0);

    // he signs it complete again; the blaster accepts the drilling
    await PD.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts'); await db.drillLogs.update(id, { status: 'complete', completedAt: nowISO(), reopenNote: undefined, updatedAt: nowISO() }); }, logId);
    await waitForUpload(PD, 30000);
    await waitFor(() => PB.evaluate(async (id) => ((await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.status === 'complete' ? 1 : null), logId), 30000);
    await PB.goto(`${WEB}/blast-day/${dayId}?view=drilling`);
    await PB.locator('[data-review-accept]').waitFor({ timeout: 30000 });
    await PB.locator('[data-review-accept]').click();
    const acc = await waitFor(() => PB.evaluate(async (id) => ((await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.status === 'accepted' ? 1 : null), logId), 20000);
    R.ok('the log is accepted', acc === 1);
    await waitForUpload(PB, 30000);

    // the blaster asks for the driller's time card from the crew list (the Remind that stays)
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    await PB.locator('[data-crew-list]').waitFor({ timeout: 20000 });
    await PB.locator(`[data-crew-row="${meD.name}"]`).click();
    await PB.locator('[data-person-sheet]').waitFor({ timeout: 8000 });
    await PB.locator('[data-person-remind]').click();
    const reminded = await waitFor(() => PB.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.dayReminders.where('blastDayId').equals(id).filter((r) => r.what === 'timecard').count()), dayId).then((n) => (n === 1 ? 1 : 0)), 10000);
    R.ok('Remind for a time card still writes its one reminder', reminded === 1);
    await PB.getByRole('button', { name: 'Close' }).click();
    // and a send-back reminder as the OLD build wrote it (Beta has such rows), older than the accepted log
    await PB.evaluate(async ({ dayId, toUserId, toName }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const day = await db.blastDays.get(dayId);
      const { getSessionUser } = await import('/src/lib/session.ts');
      const me = getSessionUser();
      const at = new Date(Date.now() - 120000).toISOString();
      await db.dayReminders.add({ id: generateId(), blastDayId: dayId, jobId: day.jobId, date: day.date, toUserId, toName, fromUserId: me.id, fromName: me.name, what: 'sentback', text: 'sent your drill log back', at, createdAt: at, updatedAt: nowISO(), syncStatus: 'local' });
    }, { dayId, toUserId: meD.id, toName: meD.name });
    await waitForUpload(PB, 30000);

    // the day is filed with the office
    await PB.goto(`${WEB}/blast-day/${dayId}/submit`);
    await PB.locator('[data-preflight-file]').waitFor({ timeout: 20000 });
    await PB.locator('[data-preflight-file]').click();
    await PB.locator('[data-preflight-file]').click();
    await PB.waitForURL(new RegExp(`/blast-day/${dayId}$`), { timeout: 60000 });
    await waitForUpload(PB, 30000);
    const filed = await waitFor(() => PD.evaluate(async (id) => ((await (await import('/src/db/index.ts')).db.blastDays.get(id))?.status === 'submitted' ? 1 : null), dayId), 40000);
    R.ok('the day is filed (submitted) and the driller\'s device knows it', filed === 1);

    // the driller's home on the filed day: the time-card line, no sent-back line, no toast, nothing written
    await PD.goto(`${WEB}/`);
    await PD.locator('[data-driller-home]').waitFor({ timeout: 30000 });
    const line = await waitFor(async () => ((await PD.locator('[data-reminder-kind="timecard"]').count()) ? (await PD.locator('[data-reminders]').innerText()) : null), 30000);
    R.ok(`the time-card line shows: "${(line || '').replace(/\s+/g, ' ').slice(0, 60)}"`, /asked for your time card/.test(line || '') && (await PD.locator('[data-reminder-kind="sentback"]').count()) === 0);
    await noToasts(PD, 'the home (filed day, old send-back reminder present)');
    // he files his time card — the line resolves on read: gone, and the row is NOT written to
    await PD.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { createTimeCard, fileTimeCard } = await import('/src/hooks/useTimeCards.ts');
      const { getSessionUser } = await import('/src/lib/session.ts');
      const me = getSessionUser();
      const day = await db.blastDays.get(id);
      const cid = await createTimeCard(day, { name: me.name, userId: me.id });
      await fileTimeCard(await db.timeCards.get(cid));
    }, dayId);
    const gone = await waitFor(() => PD.locator('[data-reminders]').count().then((n) => (n === 0 ? 1 : 0)), 15000);
    R.ok('once the card is filed the line is gone', gone === 1);
    const untouched = await PD.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.dayReminders.where('blastDayId').equals(id).toArray()).map((r) => ({ what: r.what, cleared: Boolean(r.clearedAt) })), dayId);
    R.ok(`…and the list wrote nothing: ${JSON.stringify(untouched)}`, untouched.length === 2 && untouched.every((r) => !r.cleared));
    await waitForUpload(PD, 30000);
    await PD.goto(`${WEB}/drilling`);
    await PD.locator('main').waitFor({ timeout: 20000 });
    await noToasts(PD, 'Drilling');

    // a reminder on a filed day is a nudge, not a paper: the × writes once and the server keeps it
    await PB.evaluate(async ({ dayId, toUserId, toName }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const { getSessionUser } = await import('/src/lib/session.ts');
      const day = await db.blastDays.get(dayId);
      const me = getSessionUser();
      const now = nowISO();
      await db.dayReminders.add({ id: generateId(), blastDayId: dayId, jobId: day.jobId, date: day.date, toUserId, toName, fromUserId: me.id, fromName: me.name, what: 'moved', text: 'moved this day to Sep 19 (s24)', at: now, createdAt: now, updatedAt: now, syncStatus: 'local' });
    }, { dayId, toUserId: meD.id, toName: meD.name });
    await waitForUpload(PB, 30000);
    await PD.goto(`${WEB}/`);
    await PD.locator('[data-reminder-kind="moved"]').waitFor({ timeout: 30000 });
    R.ok('a "moved" line written on the FILED day reaches the driller (the server did not refuse it)', /moved this day to Sep 19/.test((await PD.locator('[data-reminders]').innerText()) || ''));
    const movedId = await PD.locator('[data-reminder-kind="moved"]').locator('xpath=ancestor::*[@data-reminder]').getAttribute('data-reminder');
    await PD.locator(`[data-reminder="${movedId}"] [data-reminder-dismiss]`).click();
    R.ok('the × hides the line at once', (await waitFor(() => PD.locator('[data-reminders]').count().then((n) => (n === 0 ? 1 : 0)), 5000)) === 1);
    await waitForUpload(PD, 30000);
    const kept = await waitFor(() => PB.evaluate(async (id) => ((await (await import('/src/db/index.ts')).db.dayReminders.get(id))?.clearedAt ? 1 : null), movedId), 30000);
    R.ok('…and the one write stands on the blaster\'s device: the filed day did not lock it', kept === 1);
    await noToasts(PD, 'the home after the ×');
    const discards = await discardsSince();
    R.ok(`the audit has no refused write from the driller's device this run (${discards.length})${discards[0] ? ` — first: ${discards[0].tableName} ${discards[0].reason}` : ''}`, discards.length === 0);

    // the daily report's rig row has no Remind any more; the home card has no stop-hours button
    await PB.goto(`${WEB}/blast-day/${dayId}?view=daily-report`);
    await PB.locator('[data-report-done], [data-derived-rig], main').first().waitFor({ timeout: 20000 });
    R.ok('the daily report offers no Remind for stop hours', (await PB.locator('[data-rig-stop-remind]').count()) === 0);
    R.ok('the driller\'s home has no "Enter … stop hours" button', (await PD.locator('[data-rig-stop-prompt]').count()) === 0);
  });

  await R.section('The timing grid follows the pattern', async () => {
    // a plan painted hole by hole: 44 of the 50 positions, no "All holes" depth; a start on
    // hole 1, two wires along the row, and an old wire into an unpainted position
    const made = await PB.evaluate(async ({ jobId, stamp }) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      const { serializeDiagram } = await import('/src/lib/shotDiagram.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const dayId = await createBlastDayWithPapers(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `s24 grid ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const skip = new Set([9, 19, 29, 39, 49, 48]);
      const overrides = {};
      for (let i = 0; i < 50; i++) if (!skip.has(i)) overrides[i] = { depth: 20 };
      const diagram = { rows: 5, cols: 10, delays: {}, wires: [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 8, to: 9 }], start: { hole: 0, leadMs: 17 }, interHoleMs: 25, plan: { overrides } };
      await db.shots.update(shot.id, { designPlan: { ...shot.designPlan, shotDiagramData: serializeDiagram(diagram) }, totals: { ...shot.totals, avgDrillDepth: 20 }, updatedAt: nowISO() });
      return { dayId, shotId: shot.id };
    }, { jobId: jobB.id, stamp });
    gridDayId = made.dayId;
    await PB.goto(`${WEB}/blast-day/${gridDayId}/design/${made.shotId}`);
    await PB.locator('[data-timing-hole]').first().waitFor({ timeout: 30000 });
    await sleep(400);
    const holes = await PB.locator('[data-timing-hole]').count();
    const out = await PB.locator('[data-left-out]').count();
    R.ok(`the timing grid draws 44 holes (${holes}) and 6 unused positions (${out}) — "44 of 44", not 50`, holes === 44 && out === 6);
    const summary = await PB.locator('[data-timing-summary]').getAttribute('data-timing-summary');
    R.ok(`the old wire into an unpainted position is ignored: 3 holes timed, not 4 (${summary})`, summary === '3');
    // an unused position cannot be tapped into the timing
    await PB.locator('[data-left-out="10"]').click({ force: true });
    await sleep(400);
    R.ok('tapping an unused position changes nothing', (await PB.locator('[data-timing-summary]').getAttribute('data-timing-summary')) === '3' && (await PB.locator('[data-left-out]').count()) === 6);
    // a painted hole still wires: 3 → 4 (adjacent, the source is the last chained hole)
    await PB.locator('[data-timing-hole="3"]').click();
    await PB.locator('[data-timing-hole="4"]').click();
    const after = await waitFor(() => PB.locator('[data-timing-summary]').getAttribute('data-timing-summary').then((v) => (v === '4' ? v : null)), 5000);
    R.ok(`a painted hole wires as before (${after} timed)`, after === '4');
    await waitForUpload(PB, 30000);
  });

  await R.section('Work days · who filed what', async () => {
    await PD.goto(`${WEB}/days?scope=all`);
    const row = PD.locator(`[data-day-row="${dayId}"]`);
    await row.waitFor({ timeout: 30000 });
    const blaster = await row.locator('[data-day-blaster]').getAttribute('data-day-blaster').catch(() => null);
    const filer = ((await row.locator('[data-day-filer]').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
    R.ok(`the filed day's row names the blaster in charge (${blaster})`, blaster === meB.name);
    R.ok(`…and who filed it, with the time: "${filer}"`, new RegExp(`filed by ${meB.name}`).test(filer) && /\d{1,2}:\d{2}/.test(filer));
    const gridRow = PD.locator(`[data-day-row="${gridDayId}"]`);
    await gridRow.waitFor({ timeout: 30000 });
    R.ok('an unfiled day names its blaster and no filer', (await gridRow.locator('[data-day-blaster]').count()) === 1 && (await gridRow.locator('[data-day-filer]').count()) === 0);
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId, gridDayId].filter(Boolean), drillLogs: [logId].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cD.close();
  await cB.close();
  return R.summary();
}

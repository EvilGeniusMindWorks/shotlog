async (page, lib) => {
  // Shot diagram fixes (Matthew, Sep 15 2026): a hole the plan left out
  // cannot be wired; Clear hole takes one hole's wires out; the pattern
  // check rings holes that fire within 8 ms of another (30 CFR 816.67);
  // Accept from the crew list files the office copy; a checklist whose
  // office copy failed can file it later.
  const { mkCtx, signIn, skipTours, sleep, WEB, browserErrors, waitForUpload } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  browserErrors({ clear: true });
  let dayId, dayId2, otherDayId, shotId, logId, checklistId, made;
  const extraLogs = [];
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

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const cD = await mkCtx(browser, { viewport: { width: 420, height: 860 } });
  const PB = await cB.newPage();
  const PD = await cD.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);

  const wiresInDb = () =>
    PB.evaluate(async (shotId) => {
      const { db } = await import('/src/db/index.ts');
      const { parseDiagram } = await import('/src/lib/shotDiagram.ts');
      const shot = await db.shots.get(shotId);
      const d = parseDiagram(shot.designPlan.shotDiagramData);
      return { wires: d.wires.length, start: d.start?.hole };
    }, shotId);
  const tap = async (n) => {
    await PB.locator(`[data-timing-hole="${n}"]`).click();
    await sleep(250);
  };

  await R.section('The timing grid refuses a hole the plan left out', async () => {
    made = await PB.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      const { serializeDiagram, emptyDiagram } = await import('/src/lib/shotDiagram.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const busy = new Set((await db.blastDays.toArray()).filter((d) => d.status === 'draft').map((d) => d.jobId));
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !busy.has(j.id) && !/^S1[124]/.test(j.name)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const id = await createBlastDayWithPapers(jobs[0].id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `diagram ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      // a 2 × 3 pattern at 20 ft; grid position 3 is "⌀ No hole"
      const d = { ...emptyDiagram(2, 3), plan: { defaultDepth: 20, overrides: { 2: { depth: 0 } } } };
      await db.shots.update(shot.id, { designPlan: { ...shot.designPlan, shotDiagramData: serializeDiagram(d) }, updatedAt: nowISO() });
      return { id, shotId: shot.id, jobId: jobs[0].id };
    }, stamp);
    dayId = made.id;
    shotId = made.shotId;
    await PB.goto(`${WEB}/blast-day/${dayId}/design/${shotId}?mode=timing`);
    await PB.locator('[data-diagram-mode="timing"]').waitFor({ timeout: 15000 });
    await sleep(600);
    R.ok('the left-out position is drawn hollow and is not a timing hole', (await PB.locator('[data-left-out="3"]').count()) === 1 && (await PB.locator('[data-timing-hole="3"]').count()) === 0);
    await tap(1);
    await tap(2);
    let w = await waitFor(() => wiresInDb().then((x) => (x.wires === 1 ? x : null)));
    R.ok('hole 1 starts the shot, hole 2 wires to it', w?.start === 0 && w?.wires === 1);
    // a tap where the left-out hole sits does nothing
    const box = await PB.locator('[data-left-out="3"] circle').boundingBox();
    await PB.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(500);
    w = await wiresInDb();
    R.ok('tapping the left-out position adds no wire', w.wires === 1);
  });

  await R.section("Clear one hole's wires without losing the rest", async () => {
    // continue the chain: 2 → 5 → 4 (hole 5 sits under hole 2)
    await tap(5);
    await tap(4);
    let w = await waitFor(() => wiresInDb().then((x) => (x.wires === 3 ? x : null)));
    R.ok('three wires: 1→2, 2→5, 5→4', w?.wires === 3);
    R.ok('while a hole is selected the Clear button names it', (await PB.locator('[data-clear-hole="4"]').count()) === 1);
    await tap(4); // deselect
    R.ok('with nothing selected the button is Clear all', (await PB.locator('[data-clear-all]').count()) === 1);
    await tap(5); // select hole 5
    await PB.locator('[data-clear-hole="5"]').waitFor({ timeout: 5000 });
    await PB.locator('[data-clear-hole="5"]').click();
    w = await waitFor(() => wiresInDb().then((x) => (x.wires === 1 ? x : null)));
    R.ok('Clear hole 5 removes its two wires and keeps 1→2', w?.wires === 1 && w?.start === 0);
    R.ok('hole 4 lost its time, holes 1 and 2 keep theirs', /2 holes timed/.test(await PB.locator('[data-pattern-check]').locator('..').innerText()));
    await PB.getByRole('button', { name: /Undo/ }).click();
    w = await waitFor(() => wiresInDb().then((x) => (x.wires === 3 ? x : null)));
    R.ok('Undo brings the two wires back', w?.wires === 3);
  });

  await R.section('The pattern check rings holes within 8 ms of each other (30 CFR 816.67)', async () => {
    R.ok('at 15 ms per hole every hole is its own delay — the check is green', (await PB.locator('[data-pattern-check]').getAttribute('data-pattern-check')) === 'clear' && (await PB.locator('[data-window-clash]').count()) === 0);
    const inc = PB.locator('input[title="Inter-hole increment (ms)"]');
    await inc.fill('5');
    await sleep(600);
    const check = PB.locator('[data-pattern-check]');
    R.ok('at 5 ms per hole the check turns red and names the rule', (await check.getAttribute('data-pattern-check')) === 'clash' && /30 CFR 816\.67/.test(await check.innerText()));
    R.ok('the crowded holes are ringed in red on the grid', (await PB.locator('[data-window-clash]').count()) >= 2 && Number(await check.getAttribute('data-pattern-clashes')) >= 2);
    await inc.fill('15');
    await sleep(600);
    R.ok('back at 15 ms the rings go and the check is green again', (await check.getAttribute('data-pattern-check')) === 'clear' && (await PB.locator('[data-window-clash]').count()) === 0);
  });

  await R.section('Accept from the crew list files the office copy', async () => {
    await signIn(PD, 'dinis');
    await skipTours(PD);
    await waitFor(() => PD.evaluate(async (id) => Boolean(await (await import('/src/db/index.ts')).db.shots.get(id)), shotId).then((x) => (x ? 1 : 0)));
    logId = await PD.evaluate(async ({ dayId, shotId, png }) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const day = await db.blastDays.get(dayId);
      const shot = await db.shots.get(shotId);
      const id = await createDrillLog(shot, dayId, day.jobId);
      const now = nowISO();
      await db.drillLogHoles.add({ id: generateId(), drillLogId: id, date: todayISO(), holeNumber: '1', angle: 0, actualDepth: 20, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      // eslint-disable-next-line no-eval
      await db.drillLogs.update(id, { signatureImage: eval(png), status: 'complete', completedAt: now, updatedAt: now });
      return id;
    }, { dayId, shotId, png: PNG });
    await waitForUpload(PD, 30000);
    await waitFor(() => PB.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.status === 'complete', logId).then((x) => (x ? 1 : 0)));
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    await PB.locator('[data-crew-list]').waitFor({ timeout: 20000 });
    const row = PB.locator('[data-crew-row]').filter({ hasText: /signed complete/ }).first();
    await row.waitFor({ timeout: 15000 });
    await row.click();
    await PB.locator('[data-person-sheet]').waitFor({ timeout: 8000 });
    await PB.locator(`[data-person-log="${logId}"]`).click();
    await PB.waitForURL(/\/submit$/, { timeout: 10000 }).catch(() => undefined);
    R.ok('Accept opens the filing screen (the same route as the review screen)', /\/submit$/.test(PB.url()) || /\/log\//.test(PB.url()));
    const filed = await waitFor(async () =>
      PB.evaluate(async (id) => {
        const { db } = await import('/src/db/index.ts');
        const log = await db.drillLogs.get(id);
        const copies = await db.submissions.filter((s) => s.type === 'drill_log' && s.sourceId === id).toArray();
        return log?.status === 'accepted' && copies.length === 1 ? { by: log.acceptedBy, title: copies[0].title } : null;
      }, logId),
      40000,
    );
    R.ok(`the log is accepted by ${filed?.by} AND has its office copy ("${filed?.title ?? ''}")`, Boolean(filed));
  });

  await R.section('A checklist whose office copy failed can file it later', async () => {
    const r = await PD.evaluate(async (dayId) => {
      const { db } = await import('/src/db/index.ts');
      const { emptyChecklist, fileChecklist } = await import('/src/hooks/useMaintenance.ts');
      const { buildHourLedger } = await import('/src/lib/hourLedger.ts');
      const day = await db.blastDays.get(dayId);
      const rig = await db.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill') && (e.status ?? 'active') === 'active').first();
      const { currentHours } = await buildHourLedger(rig);
      const start = Math.ceil(Math.max(currentHours ?? 0, rig.hourMeter ?? 0)) + 10;
      const chk = emptyChecklist(rig.id, day.jobId);
      await fileChecklist({ ...chk, startingHours: start }); // saved, but no office copy (as after a failed filing)
      return { rigId: rig.id, checklistId: chk.id };
    }, dayId);
    checklistId = r.checklistId;
    await PD.goto(`${WEB}/drill-checklist/${r.rigId}`);
    await PD.locator('[data-chk-existing]').waitFor({ timeout: 15000 });
    await PD.locator('[data-chk-file-office]').waitFor({ timeout: 8000 });
    R.ok('today\'s checklist says it never reached the office and offers to file the copy', (await PD.locator('[data-chk-file-office]').count()) === 1 && /never reached the office/.test(await PD.locator('[data-chk-existing]').innerText()));
    await PD.locator('[data-chk-file-office]').click();
    await PD.getByText(/Checklist filed/).waitFor({ timeout: 30000 });
    const copies = await PD.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.submissions.filter((s) => s.type === 'drill_checklist' && s.sourceId === id).toArray()).length, checklistId);
    R.ok('the office copy is filed', copies === 1);
    await PD.goto(`${WEB}/drill-checklist/${r.rigId}`);
    await PD.locator('[data-chk-existing]').waitFor({ timeout: 15000 });
    await sleep(800);
    R.ok('the offer is gone once the copy exists', (await PD.locator('[data-chk-file-office]').count()) === 0);
  });

  await R.section('The drill log refuses a hole number already logged, and a double tap adds one hole', async () => {
    // the shot from §4 already has its (accepted) log — a second day on another job, Barry logs the holes himself
    const made2 = await PB.evaluate(async ({ stamp, skipJob }) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const busy = new Set((await db.blastDays.toArray()).filter((d) => d.status === 'draft').map((d) => d.jobId));
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !busy.has(j.id) && j.id !== skipJob && !/^S1[124]/.test(j.name)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const id = await createBlastDayWithPapers(jobs[0].id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `holes ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const logId = await createDrillLog(shot, id, jobs[0].id);
      return { id, logId };
    }, { stamp, skipJob: made.jobId });
    dayId2 = made2.id;
    const openLog = made2.logId;
    extraLogs.push(openLog);
    await PB.goto(`${WEB}/blast-day/${dayId2}/drill-log/${openLog}`);
    await PB.locator('[data-add-hole]').waitFor({ timeout: 30000 }).catch(async () => R.note(`drill log page at ${PB.url()}: ${(await PB.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 700)}`));
    const numberInput = PB.locator('[data-hole-number]');
    await sleep(500);
    const holesOf = () => PB.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.drillLogHoles.where('drillLogId').equals(id).toArray()).map((h) => h.holeNumber).sort(), openLog);
    await PB.locator('[data-hole-depth]').fill('20');
    await sleep(200);
    const before = await PB.locator('[data-add-hole]').innerText();
    await PB.locator('[data-add-hole]').click({ clickCount: 2, delay: 40 }).catch(() => undefined);
    await sleep(1200);
    const after = await holesOf();
    R.ok(`a double tap on "${before.trim()}" logs one hole (${after.join(', ')})`, after.length === 1);
    const n = after[0];
    await numberInput.fill(n);
    await sleep(300);
    R.ok('typing a number already on the log disables Add and says why', await PB.locator('[data-add-hole]').isDisabled() && (await PB.locator('[data-add-hole-note]').count()) === 1 && new RegExp(`Hole ${n} is already`).test(await PB.locator('[data-add-hole-note]').innerText()));
    R.ok('the list still has one hole', (await holesOf()).length === 1);
  });

  await R.section("The device media store keeps bytes, reads old Blob rows, and says what failed; a card on the job's other day is named", async () => {
    const media = await PB.evaluate(async () => {
      const { putLocalMedia, getLocalMedia, deleteLocalMedia } = await import('/src/lib/localMedia.ts');
      const pdf = new Blob(['%PDF-1.4 harness74'], { type: 'application/pdf' });
      await putLocalMedia('h74-test', pdf);
      const back = await getLocalMedia('h74-test');
      const text = back ? await back.text() : '';
      // a legacy row: a Blob stored directly (how every device wrote before Sep 15)
      const dbh = await new Promise((res, rej) => { const r = indexedDB.open('shotlog-local-media', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      await new Promise((res, rej) => { const tx = dbh.transaction('media', 'readwrite'); tx.objectStore('media').put(new Blob(['legacy'], { type: 'text/plain' }), 'h74-legacy'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      dbh.close();
      const legacy = await getLocalMedia('h74-legacy');
      const legacyText = legacy ? await legacy.text() : '';
      await deleteLocalMedia('h74-test');
      await deleteLocalMedia('h74-legacy');
      return { type: back?.type, text, legacyText, stored: (await new Promise((res) => { const r = indexedDB.open('shotlog-local-media', 1); r.onsuccess = () => { const d = r.result; const q = d.transaction('media', 'readonly').objectStore('media').get('h74-test'); q.onsuccess = () => { res(q.result === undefined ? 'gone' : typeof q.result); d.close(); }; }; })) };
    });
    R.ok(`a PDF round-trips through the device store as bytes with its type (${media.type}, "${media.text}")`, media.type === 'application/pdf' && media.text === '%PDF-1.4 harness74' && media.stored === 'gone');
    R.ok('a row written the old way (a Blob) still reads back', media.legacyText === 'legacy');

    // the daily report names a card filed on the job's other day (a real second day on the job, Jan 2)
    otherDayId = await PB.evaluate(async ({ jobId, stamp }) => (await import('/src/hooks/useBlastDay.ts')).createBlastDay(jobId, '2026-01-02', undefined, { typeOfWork: 'drill_only', name: `other day ${stamp}` }), { jobId: made.jobId, stamp });
    await waitForUpload(PB, 20000).catch(() => undefined);
    await waitFor(() => PD.evaluate(async (id) => Boolean(await (await import('/src/db/index.ts')).db.blastDays.get(id)), otherDayId).then((x) => (x ? 1 : 0)));
    await PD.evaluate(async ({ otherDayId }) => {
      const { db } = await import('/src/db/index.ts');
      const { createTimeCard, fileTimeCard } = await import('/src/hooks/useTimeCards.ts');
      const { getSessionUser } = await import('/src/lib/session.ts');
      const me = getSessionUser();
      const other = await db.blastDays.get(otherDayId);
      const cid = await createTimeCard(other, { name: me.name, userId: me.id });
      await fileTimeCard(await db.timeCards.get(cid));
    }, { otherDayId });
    await waitForUpload(PD, 20000).catch(() => undefined);
    await PB.goto(`${WEB}/blast-day/${dayId}?view=daily-report`);
    const line = await waitFor(() => PB.locator('[data-no-card-yet]').innerText().then((t) => (/wrong day/.test(t) ? t : null)), 30000);
    R.ok(`"Worked today, no card yet" says where the driller's card went: "${(line ?? '').slice(0, 120)}"`, /filed a card on (\w{3}, )?Jan 2, 2026 at this job — the wrong day\?/.test(line ?? ''));
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId, dayId2, otherDayId].filter(Boolean), drillLogs: [logId, ...extraLogs].filter(Boolean), checklists: [checklistId].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cB.close();
  await cD.close();
  return R.summary();
}

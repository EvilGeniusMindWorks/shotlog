async (page, lib) => {
  // Round S9a batch 1 (2026-09-09) — the evaluation's blockers:
  //  1. a repair ticket can be resolved again (own screen, three doors)
  //  2. phone bottom sheets sit above the bottom nav (Mark complete, job picker)
  //  3. the rig's end-of-day meter has two doors (Mark complete; the daily report's rig row)
  //  4. filing pre-flight: red blocks on an unsigned shot, amber files with notes the office sees
  const { mkCtx, signIn, skipTours, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  let dayId, shotId, rigId, logId, ticketId, checklistId;

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);

  await R.section('a blaster starts a day; the driller files a checklist that opens a ticket and starts a log', async () => {
    const made = await PB.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const id = await createBlastDay(jobs[0].id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `S9a batch1 ${stamp}` });
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
    const r = await PD.evaluate(async (dayId) => {
      const { db } = await import('/src/db/index.ts');
      const { emptyChecklist, fileChecklist } = await import('/src/hooks/useMaintenance.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const { buildHourLedger } = await import('/src/lib/hourLedger.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const day = await db.blastDays.get(dayId);
      const rig = await db.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill') && (e.status ?? 'active') === 'active').first();
      const { currentHours } = await buildHourLedger(rig);
      const start = Math.ceil(Math.max(currentHours ?? 0, rig.hourMeter ?? 0)) + 10;
      const chk = emptyChecklist(rig.id, day.jobId);
      const { ticketId } = await fileChecklist({ ...chk, startingHours: start, repairsNote: 'Horn not working — needs repair', outOfService: true });
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const logId = await createDrillLog(shot, dayId, day.jobId);
      await db.drillLogs.update(logId, { drillRigEquipmentId: rig.id, updatedAt: nowISO() });
      const now = nowISO();
      await db.drillLogHoles.add({ id: generateId(), drillLogId: logId, date: todayISO(), holeNumber: '1', angle: 0, actualDepth: 18, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      const eq = await db.equipment.get(rig.id);
      return { rigId: rig.id, asset: rig.assetNumber, start, ticketId, logId, checklistId: chk.id, status: eq.status };
    }, dayId);
    rigId = r.rigId; logId = r.logId; ticketId = r.ticketId; checklistId = r.checklistId;
    R.ok(`the checklist opened ticket ${ticketId ? 'ok' : 'MISSING'} and took ${r.asset} out of service (${r.status})`, Boolean(ticketId) && r.status === 'in_shop');

    await R.section('phone · the daily report\'s rig row is the second door for the end-of-day meter', async () => {
      await PD.goto(`${WEB}/blast-day/${dayId}?view=daily-report`);
      const enter = PD.locator(`[data-rig-meter-enter="${r.asset}"]`);
      await enter.waitFor({ timeout: 10000 });
      R.ok(`the rig row reads "→ — h · enter end-of-day meter" for the driller who owns the log`, /enter end-of-day meter/i.test(await enter.innerText()));
      await enter.click();
      await PD.locator(`[data-rig-meter-input="${r.asset}"]`).fill(String(r.start + 5));
      await PD.locator(`[data-rig-meter-save="${r.asset}"]`).click();
      await sleep(800);
      const after = await PD.evaluate(async ({ logId, rigId }) => {
        const { db } = await import('/src/db/index.ts');
        return { end: (await db.drillLogs.get(logId)).endingHours, meter: (await db.equipment.get(rigId)).hourMeter };
      }, { logId, rigId });
      R.ok(`saving writes the log's endingHours (${after.end}) and moves the rig meter (${after.meter})`, after.end === r.start + 5 && after.meter === r.start + 5);
      R.ok('the row now shows the number, not the door', (await PD.locator(`[data-rig-meter-enter]`).count()) === 0 && new RegExp(`→ ${r.start + 5} h`).test(await PD.locator(`[data-derived-rig="${r.asset}"]`).innerText()));
    });

    await R.section('phone · the Mark complete sheet sits above the bottom nav — its buttons can be tapped', async () => {
      await PD.goto(`${WEB}/blast-day/${dayId}/drill-log/${logId}`);
      await PD.locator('[data-tour="log-complete"]').waitFor({ timeout: 10000 });
      await PD.locator('[data-tour="log-complete"]').click();
      const confirm = PD.locator('[data-log-complete-confirm]');
      await confirm.waitFor({ timeout: 5000 });
      const box = await confirm.boundingBox();
      const hit = await PD.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el ? Boolean(el.closest('[data-log-complete-confirm]')) : false;
      }, [box.x + box.width / 2, box.y + box.height / 2]);
      R.ok(`the Complete button is inside the viewport (bottom ${Math.round(box.y + box.height)} ≤ 844) and a tap at its centre hits it, not the nav`, box.y + box.height <= 844 && hit);
      await PD.waitForFunction(() => { const el = document.querySelector('[data-log-end-meter]'); return el && (el.getAttribute('placeholder') ?? '') !== ''; }, { timeout: 5000 }).catch(() => undefined);
      const ph = await PD.locator('[data-log-end-meter]').getAttribute('placeholder');
      R.ok(`the end-of-day meter field is on the sheet, prefilled from the ledger (${ph})`, ph != null && Number(ph) >= r.start);
      await confirm.click();
      await sleep(800);
      const st = await PD.evaluate(async (logId) => { const { db } = await import('/src/db/index.ts'); return (await db.drillLogs.get(logId)).status; }, logId);
      R.ok('tapping Complete completes the log', st === 'complete');
    });

    await cD.close();
  });

  await R.section('the shop · three doors to the ticket, and Mark resolved restores Active', async () => {
    const cM = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
    const PM = await cM.newPage();
    await signIn(PM, 'mechanic');
    await skipTours(PM);
    // door 3: the fleet row's repair badge
    await PM.goto(`${WEB}/admin/equipment`);
    await PM.locator('[data-equip-list]').waitFor({ timeout: 10000 });
    const badge = PM.locator(`[data-equip-row] [data-equip-repair]`).first();
    if (await badge.count()) {
      await badge.click();
      await PM.waitForURL(/\/tickets\//, { timeout: 8000 }).catch(() => undefined);
    }
    R.ok('the fleet row\'s "out of service" badge opens a ticket', /\/tickets\//.test(PM.url()));
    // door 2: the machine page's history row
    await PM.goto(`${WEB}/equipment/${rigId}`);
    await PM.locator('main').waitFor({ timeout: 10000 });
    const histRow = PM.getByRole('button', { name: /Repair ticket opened/ }).first();
    await histRow.waitFor({ timeout: 10000 });
    R.ok('the machine page\'s "Repair ticket opened" history row is a button that says "tap to resolve"', /tap to resolve/i.test(await histRow.innerText()));
    await histRow.click();
    await PM.waitForURL(new RegExp(`/tickets/${ticketId}`), { timeout: 8000 });
    // door 1: the shop worklist
    await PM.goto(`${WEB}/`);
    const row = PM.locator(`[data-shop-item="ticket:${ticketId}"]`);
    await row.waitFor({ timeout: 10000 });
    await row.click();
    await PM.waitForURL(new RegExp(`/tickets/${ticketId}`), { timeout: 8000 });
    await PM.locator('[data-ticket-page]').waitFor({ timeout: 8000 });
    R.ok('the ticket screen shows the driller\'s words, who opened it and that it is down', /Horn not working/.test(await PM.locator('[data-ticket-page]').innerText()) && (await PM.locator('[data-ticket-chip]').innerText()).trim() === 'down');
    R.ok('Mark resolved waits for "What was done"', await PM.locator('[data-ticket-resolve]').isDisabled());
    await PM.locator('[data-ticket-note]').fill('horn relay replaced');
    await PM.locator('[data-ticket-resolve]').click();
    await PM.waitForURL(new RegExp(`/equipment/${rigId}`), { timeout: 8000 });
    await sleep(800);
    const after = await PM.evaluate(async ({ ticketId, rigId }) => {
      const { db } = await import('/src/db/index.ts');
      const t = await db.repairTickets.get(ticketId);
      const e = await db.equipment.get(rigId);
      return { status: t.status, note: t.resolutionNote, by: t.resolvedByName, eq: e.status };
    }, { ticketId, rigId });
    R.ok(`the ticket is resolved by ${after.by} ("${after.note}") and the rig is back to ${after.eq}`, after.status === 'resolved' && after.note === 'horn relay replaced' && after.eq === 'active');
    R.ok('the resolved ticket is no longer in the worklist', (await PM.goto(`${WEB}/`), await sleep(1500), (await PM.locator(`[data-shop-item="ticket:${ticketId}"]`).count()) === 0));
    await cM.close();
  });

  await R.section('filing pre-flight · red blocks on an unsigned shot; amber files with notes the office sees', async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}/submit`);
    await PB.locator('[data-preflight]').waitFor({ timeout: 15000 });
    const red = PB.locator('[data-preflight-level="red"]');
    R.ok(`an unsigned shot is a red item ("${(await red.first().innerText()).replace(/\s+/g, " ").trim().slice(0, 40)}")`, (await red.count()) === 1 && /no blaster signature/i.test(await red.first().innerText()));
    R.ok('the file button is disabled and says why', await PB.locator('[data-preflight-file]').isDisabled() && /Fix the red items first/.test(await PB.locator('[data-preflight-file]').innerText()));
    R.ok('nothing was filed', (await PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); return (await db.blastDays.get(id)).status; }, dayId)) === 'draft');
    // sign the shot (a tiny signature image), then come back
    await PB.evaluate(async (shotId) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const c = document.createElement('canvas'); c.width = 200; c.height = 80; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 200, 80); g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, 50); g.lineTo(180, 30); g.stroke();
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      await db.shots.update(shotId, { signatureImage: blob, signedAt: nowISO(), updatedAt: nowISO() });
    }, shotId);
    await PB.goto(`${WEB}/blast-day/${dayId}/submit`);
    await PB.locator('[data-preflight]').waitFor({ timeout: 15000 });
    const ambers = await PB.locator('[data-preflight-level="amber"]').allInnerTexts();
    R.ok(`no red now; amber items: ${ambers.map((a) => a.trim().split('\n')[0]).join(' · ')}`, (await PB.locator('[data-preflight-level="red"]').count()) === 0 && ambers.some((a) => /No explosives/i.test(a)) && ambers.some((a) => /No crew/i.test(a)));
    R.ok('the button offers "File anyway"', /File anyway/.test(await PB.locator('[data-preflight-file]').innerText()));
    await PB.locator('[data-preflight-file]').click();
    R.ok('…and asks once more, naming the count', new RegExp(`Yes, file with ${ambers.length} notes?`).test(await PB.locator('[data-preflight-file]').innerText()));
    await PB.locator('[data-preflight-file]').click();
    await PB.waitForURL(new RegExp(`/blast-day/${dayId}$`), { timeout: 60000 });
    const day = await PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); return db.blastDays.get(id); }, dayId);
    R.ok(`the day is submitted with ${day.filedNotes?.length ?? 0} filed notes`, day.status === 'submitted' && (day.filedNotes?.length ?? 0) === ambers.length);
    await sleep(2500);

    const cO = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
    const PO = await cO.newPage();
    await signIn(PO, 'office');
    await skipTours(PO);
    await sleep(2500);
    await PO.goto(`${WEB}/`);
    await PO.locator(`[data-filed-notes]`).first().waitFor({ timeout: 15000 }).catch(() => undefined);
    const chips = await PO.locator('[data-filed-notes]').allInnerTexts();
    R.ok(`the office queue says "${chips[0] ?? '(none)'}"`, chips.some((c) => new RegExp(`filed with ${ambers.length} notes?`).test(c)));
    await cO.close();
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId], drillLogs: [logId], checklists: [checklistId] }).catch(() => -1);
    const cA = await mkCtx(browser);
    const PA = await cA.newPage();
    await signIn(PA, 'mark');
    await PA.evaluate(async (ticketId) => { const { db } = await import('/src/db/index.ts'); await db.repairTickets.delete(ticketId); }, ticketId).catch(() => undefined);
    await sleep(1500);
    await cA.close();
    R.ok(`cleanup removed ${removed} day(s) + the ticket`, removed >= 0);
  });
  await cB.close();
  return R.summary();
}

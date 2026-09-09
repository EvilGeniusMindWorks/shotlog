async (page, lib) => {
  // Round S9b (2026-09-09) — what the before/after re-run left:
  //  1. a number you can see is saved: checklist starting hours, the Mark complete meter and
  //     Log a service's hours start as REAL values (with a "from the meter" line), not placeholders
  //  2. "complete" means signed: the Mark complete sheet carries the signature pad; the button
  //     reads "Sign and complete" and waits for ink
  //  3. screen tours auto-run on the account's first day only
  //  Precondition: UPDATE "User" SET "toursDone"='[]' WHERE email='dinis@test.local'  (see README)
  const { mkCtx, signIn, skipTours, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  let dayId, logId, rigId, checklistId, meter;

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);
  dayId = await PB.evaluate(async (stamp) => {
    const { db } = await import('/src/db/index.ts');
    const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
    const { todayISO } = await import('/src/lib/utils.ts');
    const today = todayISO();
    const taken = new Set((await db.blastDays.filter((d) => d.date === today).toArray()).map((d) => d.jobId));
    const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !taken.has(j.id)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
    return createBlastDay(jobs[0].id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `S9b ${stamp}` });
  }, stamp);
  await sleep(2500);

  const cD = await mkCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, tourDone: false });
  const PD = await cD.newPage();
  await signIn(PD, 'dinis');
  await skipTours(PD);

  await R.section('phone · the checklist\'s starting hours ARE the meter\'s reading, and file untouched', async () => {
    const r = await PD.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { buildHourLedger } = await import('/src/lib/hourLedger.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const rig = await db.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill') && (e.status ?? 'active') === 'active').first();
      const { currentHours } = await buildHourLedger(rig);
      const meter = Math.ceil(Math.max(currentHours ?? 0, rig.hourMeter ?? 0)) + 10;
      await db.equipment.update(rig.id, { hourMeter: meter, updatedAt: nowISO() });
      return { rigId: rig.id, asset: rig.assetNumber, meter };
    });
    rigId = r.rigId; meter = r.meter;
    await PD.goto(`${WEB}/drill-checklist/${rigId}`);
    await PD.locator('[data-chk-hours]').waitFor({ timeout: 15000 });
    await PD.waitForFunction((m) => document.querySelector('[data-chk-hours]')?.value === String(m), meter, { timeout: 8000 }).catch(() => undefined);
    const val = await PD.locator('[data-chk-hours]').inputValue();
    const line = await PD.locator('[data-chk-hours-source]').innerText();
    R.ok(`starting hours start as the meter's reading (${val}) — "${line.slice(0, 50)}…"`, val === String(meter) && /from .* meter/.test(line) && /change it if the gauge/.test(line));
    // file it without touching the number
    const sign = PD.getByRole('button', { name: /Tap to sign/ });
    if (await sign.count()) {
      await sign.click();
      const canvas = PD.locator('canvas').first();
      await canvas.waitFor({ timeout: 5000 });
      const box = await canvas.boundingBox();
      await PD.mouse.move(box.x + 30, box.y + 40); await PD.mouse.down();
      for (let i = 1; i <= 20; i++) await PD.mouse.move(box.x + 30 + i * 8, box.y + 40 + Math.sin(i / 2) * 15);
      await PD.mouse.up();
      await PD.getByRole('button', { name: /Save Signature/ }).click().catch(() => undefined);
      await sleep(400);
    }
    await PD.getByRole('button', { name: /File checklist/ }).click();
    await sleep(1500);
    const stored = await PD.evaluate(async (rigId) => { const { db } = await import('/src/db/index.ts'); const c = (await db.drillChecklists.filter((x) => x.equipmentId === rigId).toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]; return { id: c?.id, start: c?.startingHours }; }, rigId);
    checklistId = stored.id;
    R.ok(`the filed checklist carries the untouched number (${stored.start})`, stored.start === meter);
  });

  await R.section('phone · Mark complete signs first — "Sign and complete" waits for ink; the meter starts at the ledger', async () => {
    logId = await PD.evaluate(async ({ dayId, rigId }) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const day = await db.blastDays.get(dayId);
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const id = await createDrillLog(shot, dayId, day.jobId);
      await db.drillLogs.update(id, { drillRigEquipmentId: rigId, updatedAt: nowISO() });
      const now = nowISO();
      await db.drillLogHoles.add({ id: generateId(), drillLogId: id, date: todayISO(), holeNumber: '1', angle: 0, actualDepth: 18, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      return id;
    }, { dayId, rigId });
    await PD.goto(`${WEB}/blast-day/${dayId}/drill-log/${logId}`);
    try {
      await PD.locator('[data-tour="log-complete"]').waitFor({ timeout: 15000 });
    } catch {
      R.note('drill log page text: ' + (await PD.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400));
      throw new Error('Mark complete button not found');
    }
    R.ok('no screen tour auto-started for an account onboarded before today', (await PD.locator('[data-tour-overlay]').count()) === 0);
    await PD.locator('[data-tour="log-complete"]').click();
    const confirm = PD.locator('[data-log-complete-confirm]');
    await confirm.waitFor({ timeout: 5000 });
    R.ok('the sheet carries the signature pad and the button reads "Sign and complete", disabled', (await PD.locator('[data-log-complete-signature]').count()) === 1 && /Sign and complete/.test(await confirm.innerText()) && (await confirm.isDisabled()));
    await PD.waitForFunction(() => (document.querySelector('[data-log-end-meter]')?.value ?? '') !== '', null, { timeout: 8000 }).catch(() => undefined);
    const endVal = await PD.locator('[data-log-end-meter]').inputValue();
    R.ok(`the end-of-day meter starts at the ledger's reading (${endVal}) with the "from the ledger" line`, Number(endVal) >= meter && /from the ledger/.test(await PD.locator('[data-log-end-meter-source]').innerText()));
    // sign inside the sheet
    await PD.locator('[data-log-complete-signature]').getByRole('button', { name: /Tap to sign/ }).click();
    const canvas = PD.locator('canvas').first();
    await canvas.waitFor({ timeout: 5000 });
    const box = await canvas.boundingBox();
    await PD.mouse.move(box.x + 30, box.y + 40); await PD.mouse.down();
    for (let i = 1; i <= 20; i++) await PD.mouse.move(box.x + 30 + i * 8, box.y + 40 + Math.sin(i / 2) * 15);
    await PD.mouse.up();
    await PD.getByRole('button', { name: /Save Signature/ }).click().catch(() => undefined);
    await sleep(600);
    await PD.waitForFunction(() => { const b = document.querySelector('[data-log-complete-confirm]'); return b && !b.disabled; }, null, { timeout: 8000 }).catch(() => undefined);
    R.ok('with ink, the button becomes "Complete" and enables', !(await confirm.isDisabled()) && /^Complete$/.test((await confirm.innerText()).trim()));
    await confirm.click();
    await sleep(1000);
    const after = await PD.evaluate(async (logId) => { const { db } = await import('/src/db/index.ts'); const l = await db.drillLogs.get(logId); return { status: l.status, signed: Boolean(l.signatureImage), end: l.endingHours }; }, logId);
    R.ok(`the log is complete, signed, with the untouched meter (${after.end})`, after.status === 'complete' && after.signed && after.end === Number(endVal));
  });
  await cD.close();

  await R.section('wide · Log a service starts at the current reading and saves untouched', async () => {
    const cM = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
    const PM = await cM.newPage();
    await signIn(PM, 'mechanic');
    await skipTours(PM);
    await PM.goto(`${WEB}/equipment/${rigId}`);
    await PM.getByRole('button', { name: /Log a service done/ }).waitFor({ timeout: 15000 });
    await PM.getByRole('button', { name: /Log a service done/ }).click();
    await PM.locator('[data-service-hours]').waitFor({ timeout: 5000 });
    const hours = await PM.locator('[data-service-hours]').inputValue();
    R.ok(`"At hours" starts at the ledger's reading (${hours}) with the line`, hours !== '' && Number(hours) >= meter && /from the ledger/.test(await PM.locator('[data-service-hours-source]').innerText()));
    const typeSel = PM.locator('[data-service-hours]').locator('xpath=ancestor::div[contains(@class,"flex")][1]//select').first();
    const opts = await typeSel.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    await typeSel.selectOption(opts[0]);
    await PM.getByRole('button', { name: 'Save', exact: true }).click();
    await sleep(800);
    const svc = await PM.evaluate(async (rigId) => { const { db } = await import('/src/db/index.ts'); const e = await db.equipment.get(rigId); return e.services?.[e.services.length - 1]; }, rigId);
    R.ok(`the service is logged at ${svc?.atHours}`, Number(hours) === svc?.atHours);
    await PM.evaluate(async ({ rigId, id }) => { const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts'); const e = await db.equipment.get(rigId); await db.equipment.update(rigId, { services: (e.services ?? []).filter((s) => s.id !== id), updatedAt: nowISO() }); }, { rigId, id: svc?.id });
    await cM.close();
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId], drillLogs: [logId], checklists: checklistId ? [checklistId] : [] }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cB.close();
  return R.summary();
}

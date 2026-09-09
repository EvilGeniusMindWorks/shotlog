async (page, lib) => {
  // Round S9a batch 3 (2026-09-09) — the small ones:
  //  8. fleet chips answer "what's down?" — In shop + Out of service is a union; Unavailable is one tap
  //  9. the plan grid has names (rows/cols buttons, row handles, holes) and the footer says how to leave a hole out
  // 10. the drilling review counts off-plan holes; a seismo reading can be edited; the form shows the distance it uses
  const { mkCtx, signIn, skipTours, waitForUpload, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  let dayId, shotId, logId, rigId;

  await R.section('fleet chips · In shop + Out of service is a union, Unavailable is that in one tap', async () => {
    const cM = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
    const PM = await cM.newPage();
    await signIn(PM, 'mechanic');
    await skipTours(PM);
    // arrange: one machine in the shop by status only, one out of service by ticket only
    const arranged = await PM.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const fleet = (await db.equipment.filter((e) => e.isActive && (e.status ?? 'active') === 'active').toArray()).sort((a, b) => a.assetNumber.localeCompare(b.assetNumber));
      const [a, b] = fleet;
      const now = nowISO();
      await db.equipment.update(a.id, { status: 'in_shop', updatedAt: now });
      const ticketId = generateId();
      await db.repairTickets.add({ id: ticketId, equipmentId: b.id, sourceType: 'manual', description: 'harness62 brake light', outOfService: true, status: 'open', openedByName: 'harness', createdAt: now, updatedAt: now, syncStatus: 'local' });
      return { shopAsset: a.assetNumber, shopId: a.id, oosAsset: b.assetNumber, oosId: b.id, ticketId };
    });
    await PM.goto(`${WEB}/admin/equipment`);
    await PM.locator('[data-equip-filters]').waitFor({ timeout: 10000 });
    const rows = async () => PM.locator('[data-equip-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-equip-row')));
    await PM.locator('[data-equip-filter="in_shop"]').click();
    await sleep(400);
    const inShop = await rows();
    await PM.locator('[data-equip-filter="oos"]').click();
    await sleep(400);
    const both = await rows();
    R.ok(`In shop shows ${inShop.length} (incl. ${arranged.shopAsset}); adding Out of service GROWS the list to ${both.length} (incl. ${arranged.oosAsset})`, inShop.includes(arranged.shopAsset) && both.length >= inShop.length && both.includes(arranged.shopAsset) && both.includes(arranged.oosAsset));
    await PM.locator('[data-equip-filter="in_shop"]').click();
    await PM.locator('[data-equip-filter="oos"]').click();
    await PM.locator('[data-equip-filter="unavailable"]').click();
    await sleep(400);
    const unavailable = await rows();
    R.ok(`Unavailable alone shows the same union (${unavailable.length})`, unavailable.length === both.length && unavailable.includes(arranged.shopAsset) && unavailable.includes(arranged.oosAsset));
    // restore
    await PM.evaluate(async ({ shopId, ticketId }) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.equipment.update(shopId, { status: 'active', updatedAt: nowISO() });
      await db.repairTickets.delete(ticketId);
    }, arranged);
    await sleep(1500);
    await cM.close();
  });

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);

  await R.section('the plan grid has names, and the keyboard can leave a hole out', async () => {
    const made = await PB.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      // a job with no day today — a stray day from another harness would make this one a "second copy" and hide the drilling view behind the merge strip
      const { todayISO } = await import('/src/lib/utils.ts');
      const today = todayISO();
      const taken = new Set((await db.blastDays.filter((d) => d.date === today).toArray()).map((d) => d.jobId));
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !taken.has(j.id)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const id = await createBlastDay(jobs[0].id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `S9a batch3 ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      return { id, shotId: shot.id };
    }, stamp);
    dayId = made.id; shotId = made.shotId;
    await PB.goto(`${WEB}/blast-day/${dayId}/design/${shotId}?mode=plan`);
    await PB.getByText('All holes (ft)').waitFor({ timeout: 15000 });
    await PB.getByText('All holes (ft)').locator('xpath=following::input[1]').fill('18');
    await sleep(600);
    R.ok('the resize buttons have names', (await PB.getByRole('button', { name: 'More rows' }).count()) === 1 && (await PB.getByRole('button', { name: 'Fewer columns' }).count()) === 1);
    await PB.getByRole('button', { name: 'Fewer rows' }).click();
    await sleep(300);
    R.ok('Fewer rows works by name (5 → 4 rows)', (await PB.locator('[data-grid-row]').count()) === 4);
    R.ok('holes and row handles are named', /^Hole 1 · 18 ft$/.test((await PB.locator('[data-grid-hole="1"]').getAttribute('aria-label')) ?? '') && /^Row 1 — paint the row$/.test((await PB.locator('[data-grid-row="1"]').getAttribute('aria-label')) ?? ''));
    R.ok('the footer says how to leave a position out', /pick ⌀ No hole first, then tap it/.test(await PB.locator('main').innerText()));
    const before = Number(((await PB.locator('main').innerText()).match(/(\d+)\s*holes to drill/) ?? [])[1]);
    await PB.getByRole('button', { name: /No hole/ }).click();
    await PB.locator('[data-grid-hole="1"]').focus();
    await PB.keyboard.press('Enter');
    await sleep(400);
    const after = Number(((await PB.locator('main').innerText()).match(/(\d+)\s*holes to drill/) ?? [])[1]);
    R.ok(`Enter on a focused hole with ⌀ No hole leaves it out (${before} → ${after}) and renames it`, after === before - 1 && /left out/.test((await PB.locator('[data-grid-hole="1"]').getAttribute('aria-label')) ?? ''));
    await PB.getByRole('button', { name: /No hole/ }).click();
    await PB.getByRole('button', { name: /Done for now/ }).click().catch(() => undefined);
    await sleep(1500);
  });

  await R.section('the drilling review counts off-plan holes', async () => {
    const cD = await mkCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const PD = await cD.newPage();
    await signIn(PD, 'dinis');
    await skipTours(PD);
    const r = await PD.evaluate(async (dayId) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const day = await db.blastDays.get(dayId);
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const rig = await db.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill')).first();
      const logId = await createDrillLog(shot, dayId, day.jobId);
      await db.drillLogs.update(logId, { drillRigEquipmentId: rig?.id, updatedAt: nowISO() });
      const now = nowISO();
      for (const n of ['2', '3', '99']) await db.drillLogHoles.add({ id: generateId(), drillLogId: logId, date: todayISO(), holeNumber: n, angle: 0, actualDepth: 18, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      return { logId, rigId: rig?.id };
    }, dayId);
    logId = r.logId; rigId = r.rigId;
    await waitForUpload(PD).catch(() => undefined);
    await sleep(1500);
    await cD.close();
    // the driller's log reaches the blaster's device a beat later — poll, reloading the view
    let seen = false;
    for (let i = 0; i < 8 && !seen; i++) {
      await PB.goto(`${WEB}/blast-day/${dayId}?view=drilling`);
      await sleep(2500);
      seen = (await PB.locator('[data-off-plan-count]').count()) > 0;
    }
    if (!seen) R.note('drilling view text: ' + (await PB.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 300));
    await PB.locator('[data-off-plan-count]').waitFor({ timeout: 5000 });
    R.ok(`the header counts ${await PB.locator('[data-off-plan-count]').getAttribute('data-off-plan-count')} off-plan hole (H-99 is not on the plan)`, (await PB.locator('[data-off-plan-count]').getAttribute('data-off-plan-count')) === '1' && /off-plan/i.test(await PB.locator('[data-off-plan-count]').innerText()));
  });

  await R.section('a seismo reading can be edited; the form shows the distance it uses and where it lives', async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}/seismo/${shotId}`);
    await PB.getByRole('button', { name: /Add Reading/ }).waitFor({ timeout: 15000 });
    await PB.getByRole('button', { name: /Add Reading/ }).click();
    const dist = PB.locator('[data-reading-distance]');
    await dist.waitFor({ timeout: 5000 });
    R.ok(`the form says "${(await dist.innerText()).replace(/\s+/g, ' ')}"`, /not set/.test(await dist.innerText()) && (await dist.getAttribute('data-reading-distance')) === 'none' && (await PB.locator('[data-reading-distance-change]').innerText()) === 'set it');
    const field = (label) => PB.locator(`div:has(> label:text-is("${label}")) input`).first();
    await field('PPV Tran (in/s)').fill('0.42');
    await field('PPV Vert (in/s)').fill('0.31');
    await field('PPV Long (in/s)').fill('0.28');
    await field('Frequency (Hz)').fill('27');
    await PB.getByRole('button', { name: 'Save Reading' }).click();
    await sleep(1200);
    await PB.locator('[data-reading-edit]').first().waitFor({ timeout: 8000 });
    const readingId = await PB.evaluate(async (shotId) => { const { db } = await import('/src/db/index.ts'); return (await db.seismoReadings.where('shotId').equals(shotId).first())?.id; }, shotId);
    await PB.locator('[data-reading-edit]').first().click();
    await PB.getByText(/Edit Reading — Graph 1/).waitFor({ timeout: 5000 });
    R.ok('Edit opens the same form, prefilled', (await field('Frequency (Hz)').inputValue()) === '27');
    await field('Frequency (Hz)').fill('31');
    await PB.getByRole('button', { name: 'Save Reading' }).click();
    await sleep(1200);
    const after = await PB.evaluate(async ({ shotId, readingId }) => { const { db } = await import('/src/db/index.ts'); const all = await db.seismoReadings.where('shotId').equals(shotId).toArray(); return { n: all.length, freq: (await db.seismoReadings.get(readingId))?.frequency }; }, { shotId, readingId });
    R.ok(`saving updates the same reading (frequency 27 → ${after.freq}), no duplicate (${after.n} reading)`, after.n === 1 && after.freq === 31);
    await PB.getByRole('button', { name: /Add Reading/ }).click();
    await PB.locator('[data-reading-distance-change]').click();
    await PB.waitForURL(new RegExp(`/blast-day/${dayId}/design/${shotId}`), { timeout: 8000 });
    R.ok('"set it" opens the design plan where the distance lives', true);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId], drillLogs: logId ? [logId] : [] }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
    void rigId;
  });
  await cB.close();
  return R.summary();
}

async (page, lib) => {
  // S9b follow-up (2026-09-09) — the two driller items before Mark's driller starts:
  //  1. a time card's hours are computed from the LATEST typed times (a fast second edit
  //     used to compute against the old value — 12.8 h for 06:00–15:00)
  //  2. the checklist's third state reads "Not done", and the items say where a fault goes
  const { mkCtx, signIn, skipTours, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  let dayId, cardId;

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
    return createBlastDay(jobs[0].id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `S9b fu ${stamp}` });
  }, stamp);
  await sleep(2500);

  const cD = await mkCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const PD = await cD.newPage();
  await signIn(PD, 'dinis');
  await skipTours(PD);

  await R.section('phone · a fast IN then OUT computes the hours from what was typed (06:00–15:00 = 9.0)', async () => {
    cardId = await PD.evaluate(async (dayId) => {
      const { db } = await import('/src/db/index.ts');
      const { createTimeCard } = await import('/src/hooks/useTimeCards.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const me = JSON.parse(localStorage.getItem('shotlog-user-info'));
      const day = await db.blastDays.get(dayId);
      const id = await createTimeCard(day, { name: me.name, userId: me.id });
      // the suggestion the re-run's driller had: an app-action time as IN
      await db.timeCards.update(id, { timeIn: '02:10', timeOut: '', straightTime: 0, updatedAt: nowISO() });
      return id;
    }, dayId);
    await PD.goto(`${WEB}/blast-day/${dayId}?view=daily-report`);
    const inputs = PD.locator('input[type="time"]');
    await inputs.first().waitFor({ timeout: 15000 });
    R.ok('the card shows IN and OUT time fields', (await inputs.count()) >= 2);
    // no waiting between the two edits — the race the re-run hit
    await inputs.nth(0).fill('06:00');
    await inputs.nth(1).fill('15:00');
    await sleep(1200);
    const card = await PD.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const c = await db.timeCards.get(id); return { in: c.timeIn, out: c.timeOut, st: c.straightTime }; }, cardId);
    R.ok(`the card reads ${card.in}–${card.out} · ST ${card.st}`, card.in === '06:00' && card.out === '15:00' && card.st === 9);
    R.ok('the screen shows 9.0, not a float', /\b9\.0\b/.test(await PD.locator('main').innerText()));
  });

  await R.section('phone · the checklist says "Not done" and where a fault goes', async () => {
    const rigId = await PD.evaluate(async () => { const { db } = await import('/src/db/index.ts'); return (await db.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill')).first())?.id; });
    await PD.goto(`${WEB}/drill-checklist/${rigId}`);
    await PD.locator('[data-chk-hint]').first().waitFor({ timeout: 15000 });
    R.ok('the items carry the hint about Repairs needed', /Repairs needed/.test(await PD.locator('[data-chk-hint]').first().innerText()) && /shop ticket/.test(await PD.locator('[data-chk-hint]').first().innerText()));
    const first = PD.locator('[data-chk-state]').first();
    const item = first.locator('xpath=ancestor::button[1]');
    await item.click(); // ✓ → N/A
    await item.click(); // N/A → Not done
    await sleep(200);
    R.ok(`two taps read "${await first.innerText()}"`, (await first.innerText()).trim() === 'Not done' && (await first.getAttribute('data-chk-state')) === 'skip');
  });

  await R.section('cleanup', async () => {
    await PD.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); await db.timeCards.delete(id); }, cardId).catch(() => undefined);
    await cD.close();
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId] }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cB.close();
  return R.summary();
}

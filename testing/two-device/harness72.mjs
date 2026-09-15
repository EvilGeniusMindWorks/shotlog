async (page, lib) => {
  // Round S14 — the hub (2026-09-14). A day opens on its tiles for a blaster,
  // a driller and the office; Start creates the paper; File this day at the
  // bottom; the crew list with Accept and Remind (and the reminder landing on
  // the driller's home); eleven people; the rig list as each rig's odometer;
  // Evette's list; the customer's address on a site.
  const { mkCtx, signIn, skipTours, sleep, WEB, browserErrors, waitForUpload } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  browserErrors({ clear: true });
  const PNG = 'new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: "image/png" })';
  let dayId, jobs, logId, meB, customerId, siteId;
  const checklistIds = [];
  const cardIds = [];
  const RIG2 = '8aceb1cb'; // a retired H33-RIG in the test company, woken for §5 and put back

  const waitFor = async (fn, timeout = 25000, every = 300) => {
    const until = Date.now() + timeout;
    let last;
    while (Date.now() < until) {
      last = await fn().catch(() => undefined);
      if (last) return last;
      await sleep(every);
    }
    return last;
  };
  const fmtH = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const rosterIds = [];
  const tileState = (P, id) => P.locator(`[data-tile="${id}"]`).first().getAttribute('data-tile-state');
  const tileAction = (P, id) => P.locator(`[data-tile="${id}"] [data-tile-action]`).first().getAttribute('data-tile-action').catch(() => null);
  const openDay = async (P) => {
    await P.goto(`${WEB}/blast-day/${dayId}`);
    await P.locator('[data-day-hub]').waitFor({ timeout: 20000 });
    await sleep(600);
  };

  const cA = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const cB = await mkCtx(browser, { viewport: { width: 420, height: 860 } });
  const PA = await cA.newPage();
  const PB = await cB.newPage();
  await signIn(PA, 'blaster');
  await skipTours(PA);
  await signIn(PB, 'dinis');
  await skipTours(PB);
  meB = await PB.evaluate(async () => (await import('/src/lib/session.ts')).getSessionUser());

  jobs = await PA.evaluate(async (floor) => {
    const { db } = await import('/src/db/index.ts');
    const busy = new Set((await db.blastDays.toArray()).filter((d) => d.date >= floor || d.status === 'draft').map((d) => d.jobId));
    return (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !busy.has(j.id) && !/^S1[124]/.test(j.name)).toArray())
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 2)
      .map((j) => ({ id: j.id, name: j.name }));
  }, lib.daysAgo(8));
  if (jobs.length < 1) throw new Error('need a free job');
  R.note(`job: ${jobs[0].name}`);

  await R.section("The day opens on its tiles: each paper's real state per role, Start creates the paper, Up next, File this day at the bottom, the blasting log keeps the spine", async () => {
    dayId = await PA.evaluate(async ({ jobId, stamp }) => (await import('/src/hooks/useBlastDay.ts')).createBlastDay(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `hub ${stamp}` }), { jobId: jobs[0].id, stamp });
    await openDay(PA);
    R.ok('the blaster lands on the tiles', (await PA.locator('[data-day-hub]').getAttribute('data-day-hub-role')) === 'field');
    R.ok('Blasting log: Not started · Start', (await tileState(PA, 'blast-log')) === 'Not started' && (await tileAction(PA, 'blast-log')) === 'Start');
    R.ok('Daily report: Not started · Start', (await tileState(PA, 'daily-report')) === 'Not started' && (await tileAction(PA, 'daily-report')) === 'Start');
    R.ok('My time card: Not filed · Open', (await tileState(PA, 'time-card')) === 'Not filed' && (await tileAction(PA, 'time-card')) === 'Open');
    R.ok('Up next sits on the Blasting log', (await PA.locator('[data-tile="blast-log"][data-up-next]').count()) === 1);
    R.ok('no File row yet — nothing to file', (await PA.locator('[data-file-row]').getAttribute('data-file-row')) === 'none');
    R.ok('the old Add Blasting Log strip is gone', (await PA.getByRole('button', { name: /Add Blasting Log/ }).count()) === 0);

    await PA.locator('[data-tile="blast-log"] [data-tile-action="Start"]').click();
    await PA.locator('[data-day-continue]').waitFor({ timeout: 15000 });
    R.ok('Start creates the log and lands inside it — the spine with Continue', (await PA.locator('[data-day-continue]').count()) === 1 && (await PA.locator('[data-tour="day-tabs"]').count()) === 1);
    await PA.locator('[data-back-to-day]').click();
    await PA.locator('[data-day-hub]').waitFor({ timeout: 10000 });
    const started = await waitFor(() => tileState(PA, 'blast-log').then((s) => (/^Started/.test(s ?? '') ? s : null)));
    R.ok(`back on the tiles the log reads "${started}" · Open`, /^Started/.test(started ?? '') && (await tileAction(PA, 'blast-log')) === 'Open');
    const blocked = await PA.locator('[data-file-row]').getAttribute('data-file-row');
    R.ok('File this day is blocked until the log is signed', blocked === 'blocked' && /log is not signed/.test(await PA.locator('[data-file-row]').innerText()));

    await PA.locator('[data-tile="daily-report"] [data-tile-action="Start"]').click();
    const rep = await waitFor(() => tileState(PA, 'daily-report').then((s) => (/^Started/.test(s ?? '') ? s : null)));
    R.ok(`Start on the Daily report creates it: "${rep}"`, /^Started/.test(rep ?? '') && (await tileAction(PA, 'daily-report')) === 'Open');
    R.ok('one daily report, one blasting log', (await PA.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); return (await db.dailyReports.where('blastDayId').equals(id).count()) + (await db.blastLogs.where('blastDayId').equals(id).count()); }, dayId)) === 2);

    await PA.evaluate(async ({ id, png }) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      // S16: the log's signature is the one signature
      // eslint-disable-next-line no-eval
      await db.blastLogs.update(log.id, { signatureImage: eval(png), signedAt: nowISO(), updatedAt: nowISO() });
    }, { id: dayId, png: PNG });
    const ready = await waitFor(() => PA.locator('[data-file-row]').getAttribute('data-file-row').then((k) => (k === 'ready' ? k : null)));
    R.ok('with the log signed, File this day appears', ready === 'ready' && (await PA.locator('[data-file-day]').count()) === 1);
    R.ok('the Blasting log tile reads Ready to file', (await tileState(PA, 'blast-log')) === 'Ready to file');
    await PA.locator('[data-tile="time-card"] [data-tile-action]').click();
    await PA.locator('[data-time-card-sheet]').waitFor({ timeout: 8000 });
    R.ok('My time card opens the cards sheet', (await PA.locator('[data-time-card-sheet]').count()) === 1);
    await PA.getByRole('button', { name: 'Back to the day' }).click();
    await waitForUpload(PA, 30000);
  });

  await R.section("The blaster's crew list: the person sheet, Accept, Remind lands on their home; eleven people: summary, filter, search", async () => {
    // Joe's side: the day's tiles for a driller, and his drill log from Start
    await waitFor(() => PB.evaluate(async (id) => Boolean(await (await import('/src/db/index.ts')).db.blastLogs.where('blastDayId').equals(id).first()), dayId).then((x) => (x ? 1 : 0)));
    await openDay(PB);
    R.ok('the driller lands on his own tiles', (await PB.locator('[data-day-hub]').getAttribute('data-day-hub-role')) === 'driller');
    R.ok('Rig checklists: none today', (await PB.locator('[data-tile="rigs"]').getAttribute('data-tile-state')) === 'none');
    R.ok('Drill log: Not started · Start', (await tileState(PB, 'drill-log')) === 'Not started' && (await tileAction(PB, 'drill-log')) === 'Start');
    R.ok("the blaster's daily report is there, read-only", /the blaster/.test(await PB.locator('[data-tile="daily-report"]').innerText()) && (await tileAction(PB, 'daily-report')) === 'View');
    R.ok('nothing about shots or explosives on the driller\'s day', (await PB.locator('[data-tile="blast-log"]').count()) === 0 && (await PB.locator('[data-file-row]').count()) === 0);
    await PB.locator('[data-tile="drill-log"] [data-tile-action="Start"]').click();
    await PB.waitForURL(/\/drill-log\//, { timeout: 15000 });
    logId = PB.url().split('/drill-log/')[1];
    R.ok('Start opens a new drill log on the day', Boolean(logId));
    await PB.evaluate(async ({ logId, png }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const now = nowISO();
      await db.drillLogHoles.add({ id: generateId(), drillLogId: logId, date: todayISO(), holeNumber: '1', angle: 0, actualDepth: 18, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      // eslint-disable-next-line no-eval
      await db.drillLogs.update(logId, { signatureImage: eval(png), updatedAt: now });
    }, { logId, png: PNG });
    await PB.reload();
    await PB.locator('[data-tour="log-complete"]').waitFor({ timeout: 15000 });
    await PB.locator('[data-tour="log-complete"]').click();
    await PB.locator('[data-log-complete-confirm]').waitFor({ timeout: 8000 });
    R.ok('Mark complete no longer asks for a meter reading', (await PB.locator('[data-log-end-meter]').count()) === 0);
    await PB.locator('[data-log-complete-confirm]').click();
    await waitFor(() => PB.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.status === 'complete', logId).then((x) => (x ? 1 : 0)));
    await waitForUpload(PB, 30000);
    await openDay(PB);
    R.ok('back on the tiles: Drill log · Signed complete', (await tileState(PB, 'drill-log')) === 'Signed complete');

    // Mark's side: the crew list
    await waitFor(() => PA.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.status === 'complete', logId).then((x) => (x ? 1 : 0)));
    await openDay(PA);
    await PA.locator('[data-crew-list]').waitFor({ timeout: 15000 });
    R.ok('one person on the crew list', (await PA.locator('[data-crew-list]').getAttribute('data-crew-count')) === '1');
    const row = PA.locator(`[data-crew-row="${meB.name}"]`);
    R.ok(`Dinis's row: log signed complete, card not filed, needs something ("${(await row.innerText()).replace(/\s+/g, ' ').slice(0, 90)}")`, (await row.getAttribute('data-crew-needs')) === '1' && /signed complete/.test(await row.innerText()) && /card not filed/.test(await row.innerText()));
    R.ok('"1 waiting on you"', /1 waiting on you/.test(await PA.locator('[data-crew-list]').innerText()));
    await row.click();
    await PA.locator('[data-person-sheet]').waitFor({ timeout: 8000 });
    R.ok('the person sheet offers Accept on the complete log', (await PA.locator('[data-person-log-action="accept"]').count()) === 1);
    await PA.locator(`[data-person-log="${logId}"]`).click();
    // Sep 15 2026: Accept files the office copy on the way (the review screen's route), then returns to the log
    const accepted = await waitFor(() => PA.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.status === 'accepted', logId).then((x) => (x ? 1 : 0)), 40000);
    R.ok('Accept accepts the drill log', accepted === 1);
    const copy = await waitFor(() => PA.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.submissions.filter((s) => s.type === 'drill_log' && s.sourceId === id).count()), logId).then((n) => (n === 1 ? 1 : 0)), 20000);
    R.ok('…and files its office copy', copy === 1);
    await openDay(PA);
    await PA.locator('[data-crew-list]').waitFor({ timeout: 15000 });
    await PA.locator(`[data-crew-row="${meB.name}"]`).click();
    await PA.locator('[data-person-sheet]').waitFor({ timeout: 8000 });
    R.ok('…and the sheet now says View', (await waitFor(() => PA.locator('[data-person-log-action="view"]').count().then((n) => (n === 1 ? 1 : 0)))) === 1);
    await PA.locator('[data-person-remind]').click();
    const reminded = await waitFor(() => PA.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.dayReminders.where('blastDayId').equals(id).count()), dayId).then((n) => (n === 1 ? 1 : 0)));
    R.ok('Remind writes one reminder', reminded === 1);
    await PA.getByRole('button', { name: 'Back to the day' }).click();
    await waitForUpload(PA, 30000);

    // Joe's home: the line, then filing the card clears it
    await PB.goto(`${WEB}/`);
    await PB.locator('[data-reminders]').waitFor({ timeout: 25000 });
    R.ok('Joe\'s home says the blaster asked for his time card', /asked for your time card/.test(await PB.locator('[data-reminders]').innerText()));
    await PB.locator('[data-reminder-open]').click();
    await PB.locator('[data-day-hub]').waitFor({ timeout: 15000 });
    R.ok('"Open my card" lands on the day (the time card tile is there)', (await PB.locator('[data-tile="time-card"]').count()) === 1);
    const cardId = await PB.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { createTimeCard, fileTimeCard } = await import('/src/hooks/useTimeCards.ts');
      const { getSessionUser } = await import('/src/lib/session.ts');
      const me = getSessionUser();
      const day = await db.blastDays.get(id);
      const cid = await createTimeCard(day, { name: me.name, userId: me.id });
      await fileTimeCard(await db.timeCards.get(cid));
      return cid;
    }, dayId);
    cardIds.push(cardId);
    await PB.goto(`${WEB}/`);
    await PB.locator('main').waitFor({ timeout: 15000 });
    R.ok('once the card is filed the reminder is gone', (await waitFor(() => PB.locator('[data-reminders]').count().then((n) => (n === 0 ? 1 : 0)), 15000)) === 1);
    await waitForUpload(PB, 30000);
    const filedRow = await waitFor(() => PA.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.timeCards.filter((c) => c.blastDayId === id && c.status === 'filed').count()) === 1;
    }, dayId).then((x) => (x ? 1 : 0)));
    await openDay(PA);
    R.ok('Mark\'s row for Dinis now reads "card filed"', filedRow === 1 && /card filed/.test(await PA.locator(`[data-crew-row="${meB.name}"]`).innerText()));

    // Eleven people: ten roster people without logins (made by the admin), a card each
    {
      const cM = await mkCtx(browser);
      const PM = await cM.newPage();
      await signIn(PM, 'mark');
      const ids = await PM.evaluate(async (stamp) => {
        const { db } = await import('/src/db/index.ts');
        const { generateId, nowISO } = await import('/src/lib/utils.ts');
        const first = ['Tony', 'Luis', 'Pat', 'Dana', 'Ari', 'Ken', 'Rosa', 'Ben', 'Cal', 'Ivy'];
        const out = [];
        for (let i = 0; i < 10; i++) {
          const id = generateId();
          const now = nowISO();
          await db.crewMembers.add({ id, name: `${first[i]} Crew${stamp.slice(-3)}`, lastName: `Crew${stamp.slice(-3)}`, licenseNumber: '', licenseState: '', isActive: true, role: 'laborer', createdAt: now, updatedAt: now, syncStatus: 'local' });
          out.push(id);
        }
        return out;
      }, stamp);
      rosterIds.push(...ids);
      await waitForUpload(PM, 30000);
      await cM.close();
    }
    await waitFor(() => PA.evaluate(async (ids) => (await (await import('/src/db/index.ts')).db.crewMembers.filter((m) => ids.includes(m.id)).count()), rosterIds).then((n) => (n === 10 ? n : null)));
    const made = await PA.evaluate(async ({ id, ids }) => {
      const { db } = await import('/src/db/index.ts');
      const { createTimeCard } = await import('/src/hooks/useTimeCards.ts');
      const day = await db.blastDays.get(id);
      const roster = await db.crewMembers.filter((m) => ids.includes(m.id)).toArray();
      const out = [];
      for (const m of roster) out.push(await createTimeCard(day, { name: m.name, crewMemberId: m.id }));
      return { ids: out, names: roster.map((m) => m.name) };
    }, { id: dayId, ids: rosterIds });
    cardIds.push(...made.ids);
    R.ok(`ten roster cards added (${made.ids.length})`, made.ids.length === 10);
    await openDay(PA);
    await waitFor(() => PA.locator('[data-crew-list]').getAttribute('data-crew-count').then((n) => (n === '11' ? n : null)));
    R.ok('eleven on the crew list', (await PA.locator('[data-crew-list]').getAttribute('data-crew-count')) === '11');
    R.ok('the summary line appears from eight', /Cards \d+ of 12 filed/.test(await PA.locator('[data-crew-summary]').innerText().catch(() => '')));
    R.ok('Needs something is the default filter and shows the ten draft cards', (await PA.locator('[data-crew-row][data-crew-needs]').count()) === 10 && (await PA.locator('[data-crew-row]').count()) === 10);
    await PA.locator('[data-crew-filter="all"]').click();
    R.ok('All shows everyone', (await PA.locator('[data-crew-row]').count()) === 11);
    await PA.locator('[data-crew-search]').fill(made.names[0].split(' ')[0]);
    await sleep(300);
    R.ok(`search narrows to "${made.names[0]}"`, (await PA.locator('[data-crew-row]').count()) >= 1 && (await PA.locator('[data-crew-row]').first().innerText()).includes(made.names[0].split(' ')[0]));
    await waitForUpload(PA, 30000);
  });

  await R.section("Rigs: today's rigs with each machine's start and stop readings, another rig, out of service; the drill log asks for no meter", async () => {
    // wake a second rig as the admin
    const cM = await mkCtx(browser);
    const PM = await cM.newPage();
    await signIn(PM, 'mark');
    await PM.evaluate(async (prefix) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const rig = (await db.equipment.toArray()).find((e) => e.id.startsWith(prefix));
      if (rig) await db.equipment.update(rig.id, { isActive: true, status: 'active', updatedAt: nowISO() });
    }, RIG2);
    await waitForUpload(PM, 30000);
    await cM.close();
    const rigs = await waitFor(() => PB.evaluate(async (prefix) => {
      const { db } = await import('/src/db/index.ts');
      const all = await db.equipment.filter((e) => e.isActive && e.category === 'rock_drill' && (e.status ?? 'active') === 'active').toArray();
      const second = all.find((e) => e.id.startsWith(prefix));
      const first = all.find((e) => !e.id.startsWith(prefix));
      return first && second ? { first: { id: first.id, asset: first.assetNumber, meter: first.hourMeter ?? 0 }, second: { id: second.id, asset: second.assetNumber, meter: second.hourMeter ?? 0 } } : null;
    }, RIG2));
    R.ok('two active rigs for the driller', Boolean(rigs?.first && rigs?.second));
    const start1 = Math.ceil(Math.max(rigs.first.meter, 0)) + 10;
    const chk1 = await PB.evaluate(async ({ rigId, jobId, start }) => {
      const { emptyChecklist, fileChecklist } = await import('/src/hooks/useMaintenance.ts');
      const c = emptyChecklist(rigId, jobId);
      await fileChecklist({ ...c, startingHours: start });
      return c.id;
    }, { rigId: rigs.first.id, jobId: jobs[0].id, start: start1 });
    checklistIds.push(chk1);
    await openDay(PB);
    R.ok('the rigs tile says running', (await PB.locator('[data-tile="rigs"]').getAttribute('data-tile-state')) === 'running');
    const row1 = PB.locator(`[data-rig-row="${rigs.first.asset}"]`);
    R.ok(`${rigs.first.asset}'s row: started · ${start1} → running`, /→ running/.test(await row1.innerText()) && (await row1.innerText()).includes(fmtH(start1)));
    await row1.click();
    await PB.locator('[data-rig-sheet]').waitFor({ timeout: 8000 });
    R.ok('the rig sheet offers Stop for the day and Out of service', (await PB.locator('[data-rig-stop]').count()) === 1 && (await PB.locator('[data-rig-down]').count()) === 1);
    await PB.locator('[data-rig-stop]').click();
    await PB.locator('[data-rig-reading-input]').waitFor({ timeout: 8000 });
    await PB.locator('[data-rig-reading-input]').fill(String(start1 - 1));
    await PB.locator('[data-rig-reading-save]').click();
    R.ok('a stop reading below the start is refused', /can't be below/.test(await PB.locator('[data-rig-reading]').innerText()));
    await PB.locator('[data-rig-reading-input]').fill(String(start1 + 6.4));
    await PB.locator('[data-rig-reading-save]').click();
    await PB.locator('[data-rig-reading]').waitFor({ state: 'detached', timeout: 8000 });
    const stopped = await waitFor(() => row1.innerText().then((t) => (/stopped/.test(t) ? t : null)));
    R.ok(`the row reads the two readings and the hours ("${(stopped ?? '').replace(/\s+/g, ' ').slice(0, 80)}")`, /6\.4 h · stopped/.test(stopped ?? '') && (stopped ?? '').includes(fmtH(start1 + 6.4)));
    R.ok('the tile says all stopped', (await PB.locator('[data-tile="rigs"]').getAttribute('data-tile-state')) === 'stopped');
    const ledger = await PB.evaluate(async (rigId) => {
      const { db } = await import('/src/db/index.ts');
      const { buildHourLedger } = await import('/src/lib/hourLedger.ts');
      const l = await buildHourLedger(await db.equipment.get(rigId));
      return { current: l.currentHours, note: l.entries[0]?.note, source: l.entries[0]?.source };
    }, rigs.first.id);
    R.ok(`the shop's ledger reads the stop as the rig's meter (${ledger.current})`, ledger.current === start1 + 6.4 && ledger.source === 'checklist' && /stopped/.test(ledger.note ?? ''));

    // a second rig, then out of service
    R.ok('"Start a checklist for another rig" is the last row', (await PB.locator('[data-rig-start]').count()) === 1 && /another rig/.test(await PB.locator('[data-rig-start]').innerText()));
    const start2 = Math.ceil(Math.max(rigs.second.meter, 0)) + 10;
    const chk2 = await PB.evaluate(async ({ rigId, jobId, start }) => {
      const { emptyChecklist, fileChecklist } = await import('/src/hooks/useMaintenance.ts');
      const c = emptyChecklist(rigId, jobId);
      await fileChecklist({ ...c, startingHours: start });
      return c.id;
    }, { rigId: rigs.second.id, jobId: jobs[0].id, start: start2 });
    checklistIds.push(chk2);
    await openDay(PB);
    const row2 = PB.locator(`[data-rig-row="${rigs.second.asset}"]`).first();
    await row2.waitFor({ timeout: 10000 });
    R.ok('two rigs on the list, the second running', (await PB.locator('[data-rig-row]').count()) === 2 && /running/.test(await row2.innerText()));
    await row2.click();
    await PB.locator('[data-rig-down]').waitFor({ timeout: 8000 });
    await PB.locator('[data-rig-down]').click();
    await PB.locator('[data-rig-reading-input]').fill(String(start2 + 2.1));
    await PB.locator('[data-rig-reading-save]').click();
    await PB.locator('[data-rig-reading]').waitFor({ state: 'detached', timeout: 8000 });
    const down = await waitFor(() => row2.innerText().then((t) => (/out of service/.test(t) ? t : null)));
    R.ok(`out of service records the reading and says so ("${(down ?? '').replace(/\s+/g, ' ').slice(0, 70)}")`, /out of service/.test(down ?? '') && (down ?? '').includes(fmtH(start2 + 2.1)));
    await waitForUpload(PB, 30000);
    const after = await PB.evaluate(async (rigId) => {
      const { db } = await import('/src/db/index.ts');
      const e = await db.equipment.get(rigId);
      const tickets = await db.repairTickets.where('equipmentId').equals(rigId).toArray();
      return { status: e?.status, open: tickets.filter((t) => t.status === 'open' && t.outOfService).length };
    }, rigs.second.id);
    R.ok('the rig is in the shop with an open ticket', after.status === 'in_shop' && after.open >= 1);
    R.ok('nothing shared: the first rig still shows its own readings', /6\.4 h/.test(await row1.innerText()));
    await PB.locator('[data-rig-start]').click();
    await PB.waitForURL(/\/drill-checklist\?job=/, { timeout: 10000 });
    R.ok('Start a checklist for another rig opens the rig picker for this job', PB.url().includes(`job=${jobs[0].id}`));
  });

  await R.section("Evette's list of today's jobs with dots, Records dots, the customer's address on a site", async () => {
    const cO = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
    const PO = await cO.newPage();
    await signIn(PO, 'office');
    await skipTours(PO);
    await PO.locator('[data-todays-jobs]').waitFor({ timeout: 20000 });
    await waitFor(() => PO.locator(`[data-job-row="hub ${stamp}"]`).count().then((n) => (n ? n : null)));
    const jobRow = PO.locator(`[data-job-row="hub ${stamp}"]`);
    R.ok('Evette sees the job on Today\'s jobs', (await jobRow.count()) === 1);
    const dots = await jobRow.locator('[data-coverage]').getAttribute('data-coverage');
    R.ok(`the four dots read the papers (${dots})`, dots === 'amber,amber,green,amber');
    R.ok('the code badge and who is on site', /DB/.test(await jobRow.innerText()) && /on site/.test(await jobRow.innerText()));
    await PO.locator('[data-jobs-search]').fill(stamp);
    await sleep(300);
    R.ok('search narrows the list to the job', (await PO.locator('[data-job-row]').count()) === 1);
    await jobRow.click();
    await PO.locator('[data-day-hub]').waitFor({ timeout: 15000 });
    R.ok('tapping opens the day\'s tiles read-only', (await PO.locator('[data-day-hub]').getAttribute('data-day-hub-role')) === 'office' && (await PO.locator('[data-tile-action="Start"]').count()) === 0 && (await PO.locator('[data-file-row]').count()) === 0);
    await PO.locator('[data-crew-list]').waitFor({ timeout: 10000 }).catch(() => undefined);
    R.ok('the office sees the crew list too, without Accept or Remind', (await PO.locator('[data-crew-list]').count()) === 1 && (await PO.locator('[data-person-remind]').count()) === 0);
    await cO.close();

    await PA.goto(`${WEB}/days`);
    await PA.locator('main').waitFor({ timeout: 15000 });
    await sleep(800);
    R.ok('the day list rows carry the same dots', (await PA.locator('[data-coverage]').count()) >= 1);

    // the customer's address on a new site
    customerId = await PA.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const id = generateId();
      const now = nowISO();
      await db.customers.add({ id, name: `Customer ${stamp}`, isActive: true, billing: { street1: '14 Industrial Dr', street2: '', city: 'Ludlow', state: 'MA', zip: '01056' }, createdAt: now, updatedAt: now, syncStatus: 'local' });
      return id;
    }, stamp);
    await PA.goto(`${WEB}/customers/${customerId}`);
    await PA.locator('main').waitFor({ timeout: 15000 });
    await PA.getByRole('button', { name: /New site/ }).first().click();
    await PA.locator('[data-new-site-form]').waitFor({ timeout: 8000 });
    R.ok('the new-site form offers "Use the customer\'s address" with the billing address', /use the customer/i.test(await PA.locator('[data-use-customer-address]').innerText()) && /14 Industrial Dr/.test(await PA.locator('[data-use-customer-address]').innerText()));
    await PA.locator('[data-use-customer-address]').click();
    R.ok('one tap fills the site\'s address', (await PA.locator('[data-use-customer-address]').getAttribute('data-same')) === '1');
    await PA.locator('[data-new-site-name]').fill(`Site ${stamp}`);
    await PA.locator('[data-new-site-create]').click();
    await PA.waitForURL(/\/sites\//, { timeout: 15000 });
    siteId = PA.url().split('/sites/')[1];
    const siteRec = await waitFor(() => PA.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.sites.get(id)), siteId).then((x) => (x ? x : null)));
    R.ok('the site carries the copied address, its own copy', siteRec?.address === '14 Industrial Dr' && siteRec?.city === 'Ludlow' && siteRec?.state === 'MA' && siteRec?.zip === '01056');
    await PA.getByText('Ground', { exact: true }).first().click().catch(() => undefined);
    await PA.locator('[data-site-address]').waitFor({ timeout: 8000 }).catch(() => undefined);
    if (await PA.locator('[data-site-address]').count()) {
      R.ok('on the site page the row reads "Using the customer\'s address"', (await PA.locator('[data-use-customer-address]').getAttribute('data-same')) === '1');
    }
    await waitForUpload(PA, 30000);
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const cM = await mkCtx(browser);
    const PM = await cM.newPage();
    await signIn(PM, 'mark');
    const done = await PM.evaluate(async ({ dayId, logId, checklistIds, cardIds, customerId, siteId, RIG2, rosterIds }) => {
      const { db, deleteWithTombstone } = await import('/src/db/index.ts');
      const { deleteDayCascade } = await import('/src/lib/lifecycle.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      let n = 0;
      // an accepted log never deletes — step it back to complete first (the approver's transition)
      if (logId && (await db.drillLogs.get(logId))?.status === 'accepted') await db.drillLogs.update(logId, { status: 'complete', updatedAt: nowISO() });
      for (const id of cardIds) if (await db.timeCards.get(id)) { await deleteWithTombstone('timeCards', id); n++; }
      for (const id of checklistIds) {
        for (const t of await db.repairTickets.filter((t) => t.sourceId === id).toArray()) await deleteWithTombstone('repairTickets', t.id);
        if (await db.drillChecklists.get(id)) { await deleteWithTombstone('drillChecklists', id); n++; }
      }
      for (const id of rosterIds) if (await db.crewMembers.get(id)) { await deleteWithTombstone('crewMembers', id); n++; }
      const rig2 = (await db.equipment.toArray()).find((e) => e.id.startsWith(RIG2));
      if (rig2) await db.equipment.update(rig2.id, { isActive: false, status: 'retired', updatedAt: nowISO() });
      const first = await db.equipment.filter((e) => e.category === 'rock_drill' && e.status === 'in_shop').toArray();
      for (const e of first) await db.equipment.update(e.id, { status: 'active', updatedAt: nowISO() });
      const day = dayId ? await db.blastDays.get(dayId) : undefined;
      if (day) { await deleteDayCascade(day); n++; }
      if (siteId && (await db.sites.get(siteId))) { await deleteWithTombstone('sites', siteId); n++; }
      if (customerId && (await db.customers.get(customerId))) { await deleteWithTombstone('customers', customerId); n++; }
      return n;
    }, { dayId, logId, checklistIds, cardIds, customerId, siteId, RIG2, rosterIds });
    await waitForUpload(PM, 40000);
    await cM.close();
    const swept = await lib.cleanupAsAdmin(browser, {}).catch(() => -1);
    R.ok(`cleanup removed ${done} record(s), swept ${swept}`, done >= 0);
  });
  await cA.close();
  await cB.close();
  return R.summary();
}

async (page, lib) => {
  // Round S17 — The driller's home, and the feedback fixes (2026-09-15)
  const { mkCtx, signIn, skipTours, sleep, WEB, browserErrors, waitForUpload } = lib;
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
  browserErrors({ clear: true });
  let dayId, dayId2, dayId3, shotId, logId, logId2, logId3, jobs, meD, extraLogs = [];
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
  if (jobs.length < 3) throw new Error('need three free jobs');
  R.note(`jobs: ${jobs.map((j) => j.name).join(' / ')}`);
  const made = await PB.evaluate(async ({ jobId, stamp }) => {
    const { db } = await import('/src/db/index.ts');
    const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
    const id = await createBlastDayWithPapers(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `s17 ${stamp}` });
    const log = await db.blastLogs.where('blastDayId').equals(id).first();
    const shot = await db.shots.where('blastLogId').equals(log.id).first();
    return { id, shotId: shot.id };
  }, { jobId: jobs[0].id, stamp });
  dayId = made.id; shotId = made.shotId;
  await waitForUpload(PB, 30000);
  await signIn(PD, 'dinis');
  await skipTours(PD);
  meD = await PD.evaluate(async () => (await import('/src/lib/session.ts')).getSessionUser());

  await R.section("A day is mine when I drilled on it: the Work days list and the home agree", async () => {
    await waitFor(() => PD.evaluate(async (id) => Boolean(await (await import('/src/db/index.ts')).db.shots.get(id)), shotId).then((x) => (x ? 1 : 0)));
    const before = await PD.evaluate(async (id) => (await (await import('/src/lib/mine.ts')).myDayIds()).has(id), dayId);
    R.note(`before his log the day ${before ? 'already counts as his (a checklist or card at that job today)' : 'is not his'}`);
    logId = await PD.evaluate(async ({ dayId, shotId }) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const day = await db.blastDays.get(dayId);
      return createDrillLog(await db.shots.get(shotId), dayId, day.jobId);
    }, { dayId, shotId });
    const after = await waitFor(() => PD.evaluate(async (id) => (await (await import('/src/lib/mine.ts')).myDayIds()).has(id), dayId).then((x) => (x ? 1 : 0)));
    R.ok('with a drill log on it, the day is his', after === 1);
    await PD.goto(`${WEB}/days`);
    await PD.locator('main').waitFor({ timeout: 15000 });
    const listed = await waitFor(() => PD.locator(`[data-day-row="${dayId}"]`).count().then((n) => (n === 1 ? 1 : 0)), 15000);
    R.ok("…and it shows under My days on the Work days list", listed === 1 && /My days/i.test(await PD.locator('body').innerText()));
  });

  await R.section("The Drilling page is the plan queue; the plans-yet line tells the truth", async () => {
    await PD.goto(`${WEB}/drilling`);
    await PD.locator('main').waitFor({ timeout: 15000 });
    await sleep(800);
    R.ok('no rig-checklist door on the Drilling page', (await PD.locator('[data-checklist-door]').count()) === 0 && (await PD.getByText(/File (another )?rig checklist/).count()) === 0);
    // a log made from a shot carries no date — the page must still know Dinis is working today
    await PD.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const now = nowISO();
      await db.drillLogs.update(id, { date: undefined, updatedAt: now });
      await db.drillLogHoles.add({ id: generateId(), drillLogId: id, date: todayISO(), holeNumber: '1', angle: 0, actualDepth: 20, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
    }, logId);
    await PD.goto(`${WEB}/drilling`);
    await PD.locator('main').waitFor({ timeout: 15000 });
    await sleep(1200);
    const text = await PD.locator('body').innerText();
    R.ok('with an open log today (no date on it) the page does not claim "No drill plans yet"', !/No drill plans yet/.test(text));
  });

  await R.section("New diagrams open at 25 ms per hole", async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}/design/${shotId}?mode=timing`);
    await PB.locator('[data-diagram-mode="timing"]').waitFor({ timeout: 15000 });
    await sleep(500);
    R.ok('a new diagram reads +25 ms/hole', (await PB.locator('input[title="Inter-hole increment (ms)"]').inputValue()) === '25');
    await PB.evaluate(async (shotId) => {
      const { db } = await import('/src/db/index.ts');
      const { serializeDiagram, emptyDiagram } = await import('/src/lib/shotDiagram.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const shot = await db.shots.get(shotId);
      const d = { ...emptyDiagram(2, 3), interHoleMs: 15, plan: { defaultDepth: 20, overrides: {} } };
      await db.shots.update(shotId, { designPlan: { ...shot.designPlan, shotDiagramData: serializeDiagram(d) }, updatedAt: nowISO() });
    }, shotId);
    await PB.reload();
    await PB.locator('[data-diagram-mode="timing"]').waitFor({ timeout: 15000 });
    await sleep(500);
    R.ok('a diagram already wired at 15 keeps 15', (await PB.locator('input[title="Inter-hole increment (ms)"]').inputValue()) === '15');
  });

  await R.section("The pattern check judges against the allowed holes per delay", async () => {
    // a second day with an undrilled 2 × 3 pattern (Dinis's hole on the first day would grey the rest); wire 1 → 2 → 3 at 15 ms
    const made2 = await PB.evaluate(async ({ jobId, stamp }) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      const { serializeDiagram, emptyDiagram } = await import('/src/lib/shotDiagram.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const id = await createBlastDayWithPapers(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `s17 timing ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const d = { ...emptyDiagram(2, 3), interHoleMs: 15, plan: { defaultDepth: 20, overrides: {} } };
      await db.shots.update(shot.id, { designPlan: { ...shot.designPlan, shotDiagramData: serializeDiagram(d) }, updatedAt: nowISO() });
      return { id, shotId: shot.id };
    }, { jobId: jobs[1].id, stamp });
    dayId2 = made2.id;
    const shot2 = made2.shotId;
    await PB.goto(`${WEB}/blast-day/${dayId2}/design/${shot2}?mode=timing`);
    await PB.locator('[data-timing-hole="1"]').waitFor({ timeout: 15000 });
    for (const n of [1, 2, 3]) { await PB.locator(`[data-timing-hole="${n}"]`).click(); await sleep(250); }
    const check = PB.locator('[data-pattern-check]');
    await check.waitFor({ timeout: 8000 });
    R.ok('no allowance on the card: neutral, "set Max holes/delay"', (await check.getAttribute('data-pattern-check')) === 'unset' && /set Max holes\/delay/.test(await check.innerText()));
    await PB.evaluate(async (shotId) => { const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts'); const s = await db.shots.get(shotId); await db.shots.update(shotId, { designPlan: { ...s.designPlan, maxHolesPerDelay: 2 }, updatedAt: nowISO() }); }, shot2);
    await waitFor(() => check.getAttribute('data-pattern-check').then((v) => (v === 'clear' ? v : null)));
    R.ok('allow 2: at 15 ms each hole is alone in its window — green with "2 allowed"', (await check.getAttribute('data-pattern-check')) === 'clear' && /2 allowed/.test(await check.innerText()));
    await PB.locator('input[title="Inter-hole increment (ms)"]').fill('3');
    const clash = await waitFor(() => check.getAttribute('data-pattern-check').then((v) => (v === 'clash' ? v : null)), 10000);
    R.ok('at 3 ms all three share a window — 3 > 2 allowed — red, ringed', clash === 'clash' && (await waitFor(() => PB.locator('[data-window-clash]').count().then((n) => (n === 3 ? n : 0)), 5000)) === 3);
    await PB.locator('input[title="Inter-hole increment (ms)"]').fill('25');
    await sleep(400);
  });

  await R.section("Diameter, burden and spacing ride at the top of the plan and reach the driller's log", async () => {
    // the second day's plan (dayId2): the shot's facts on top, the brush on the grid
    const shot2 = await PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const log = await db.blastLogs.where('blastDayId').equals(id).first(); return (await db.shots.where('blastLogId').equals(log.id).first()).id; }, dayId2);
    await PB.goto(`${WEB}/blast-day/${dayId2}/design/${shot2}?mode=plan`);
    await PB.locator('[data-shot-facts]').waitFor({ timeout: 15000 });
    const order = await PB.evaluate(() => { const f = document.querySelector('[data-shot-facts]'); const b = document.querySelector('[data-plan-brush]'); const g = document.querySelector('svg[data-diagram-grid]'); return f && b && g ? (f.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : 0) + (b.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : 0) : -1; });
    R.ok('the order on the plan: The shot, then the brush, then the grid', order === 2);
    await PB.locator('[data-shot-dia]').fill('4');
    await PB.locator('[data-shot-burden]').fill('10');
    await PB.locator('[data-shot-spacing]').fill('10');
    await PB.locator('[data-plan-depth]').fill('20');
    await sleep(600);
    const saved = await waitFor(() => PB.evaluate(async (id) => { const s = await (await import('/src/db/index.ts')).db.shots.get(id); return s.drillParams.holeDiameter === 4 && s.drillParams.burden === 10 && s.drillParams.spacing === 10 ? s.drillParams : null; }, shot2));
    R.ok('typed on the plan, saved on the shot (4 in · 10 × 10 ft)', Boolean(saved));
    const footer = await waitFor(() => PB.locator('[data-plan-footer-facts]').innerText().then((t) => (/4 in/.test(t) ? t : null)), 10000);
    R.ok(`the footer names the numbers ("${(footer ?? '').trim()}")`, /4 in · 10 × 10 ft · 20 ft/.test(footer ?? ''));
    // the driller's log starts with them and says so
    await waitFor(() => PD.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.shots.get(id))?.drillParams?.holeDiameter === 4, shot2).then((x) => (x ? 1 : 0)), 30000);
    logId2 = await PD.evaluate(async ({ dayId, shotId }) => { const { db } = await import('/src/db/index.ts'); const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts'); const day = await db.blastDays.get(dayId); return createDrillLog(await db.shots.get(shotId), dayId, day.jobId); }, { dayId: dayId2, shotId: shot2 });
    await PD.goto(`${WEB}/blast-day/${dayId2}/drill-log/${logId2}`);
    await PD.locator('[data-log-from-plan]').waitFor({ timeout: 20000 });
    const hdr = await PD.evaluate(async (id) => { const l = await (await import('/src/db/index.ts')).db.drillLogs.get(id); return [l.holeDiameter, l.burden, l.spacing]; }, logId2);
    R.ok(`Dinis's drill log header reads 4 · 10 · 10, marked "filled from the blaster's plan"`, hdr.join(',') === '4,10,10' && (await PD.locator('[data-log-from-plan]').count()) === 1);
  });

  await R.section("The driller's home: one card per job-day, plans sent to you, yesterday needs you", async () => {
    // a third day whose plan the blaster SENDS to Dinis (a log assigned to him, no holes yet)
    const made3 = await PB.evaluate(async ({ jobId, stamp, to }) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const { serializeDiagram, emptyDiagram } = await import('/src/lib/shotDiagram.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const id = await createBlastDayWithPapers(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `s17 sent ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const d = { ...emptyDiagram(2, 4), plan: { defaultDepth: 18, overrides: {} } };
      await db.shots.update(shot.id, { designPlan: { ...shot.designPlan, shotDiagramData: serializeDiagram(d) }, updatedAt: nowISO() });
      const logId = await createDrillLog(await db.shots.get(shot.id), id, jobId, to);
      return { id, logId };
    }, { jobId: jobs[2].id, stamp, to: { userId: meD.id, name: meD.name } });
    dayId3 = made3.id; logId3 = made3.logId;
    await waitForUpload(PB, 30000);
    // and Dinis's second log is yesterday's — unsigned
    await PD.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts'); const d = new Date(); d.setDate(d.getDate() - 1); const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; await db.drillLogs.update(id, { date: y, updatedAt: nowISO() }); }, logId2);
    await waitFor(() => PD.evaluate(async (id) => Boolean(await (await import('/src/db/index.ts')).db.drillLogs.get(id)), logId3).then((x) => (x ? 1 : 0)), 30000);
    await PD.goto(`${WEB}/`);
    await PD.locator('[data-driller-home]').waitFor({ timeout: 20000 });
    await waitFor(() => PD.locator('[data-job-day]').count().then((n) => (n >= 2 ? n : 0)), 20000);
    const cards = await PD.locator('[data-job-day]').allInnerTexts();
    R.note(`home cards: ${cards.length} — ${cards.map((c) => c.split('\n')[0]).slice(0, 6).join(' | ')}`);
    R.note(`home text: ${(await PD.locator('[data-driller-home]').innerText()).replace(/\s+/g, ' ').slice(0, 400)}`);
    const ours = cards.filter((t) => t.includes(stamp));
    R.ok(`Today shows one card per job-day Dinis is on (${ours.length} of this run's): the two jobs with his logs, not the sent-but-unstarted plan`, ours.length === 2 && ours.some((t) => /1 of 6 holes/.test(t)) && !ours.some((t) => /s17 sent/.test(t)) && ours.every((t) => /My time card/.test(t) && /R\d|No rig checklist/.test(t)));
    const homeText = await PD.locator('[data-driller-home]').innerText();
    R.ok('no KPIs, no "Drilling today", no My records / All work days on the home — the menu has them', !/My Drilling|Also open today|No drill plans yet|All work days|My records/.test(homeText));
    R.ok('Plans sent to you: the blaster’s plan with Start', (await PD.locator('[data-plans-sent]').count()) === 1 && (await PD.locator(`[data-plan-start="${logId3}"]`).count()) === 1 && /8 holes/.test(await PD.locator('[data-plans-sent]').innerText()));
    R.ok('Yesterday needs you: the unsigned log from yesterday, dated', (await PD.locator('[data-yesterday]').count()) === 1 && /not signed complete/.test(await PD.locator('[data-yesterday]').innerText()));
    await PD.locator(`[data-job-day="${dayId}"]`).click();
    await PD.waitForURL(new RegExp(`/blast-day/${dayId}`), { timeout: 10000 });
    R.ok("a job-day card opens that day's tiles", (await PD.locator('[data-day-hub]').waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) && (await PD.locator('[data-day-hub]').getAttribute('data-day-hub-role')) === 'driller');
    await PD.goto(`${WEB}/`);
    await PD.locator(`[data-plan-start="${logId3}"]`).waitFor({ timeout: 20000 });
    await PD.locator(`[data-plan-start="${logId3}"]`).click();
    await PD.waitForURL(/\/drill-log\//, { timeout: 10000 });
    R.ok('Start on a sent plan opens the drill log', /\/drill-log\//.test(PD.url()));
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId, dayId2, dayId3].filter(Boolean), drillLogs: [logId, logId2, logId3, ...extraLogs].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cB.close();
  await cD.close();
  return R.summary();
}

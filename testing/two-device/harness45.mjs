async (page) => {
  // Round S7d — time and the work day (2026-09-07): the day is a container;
  // the blaster owns the REPORT on any day with a blast log (a driller-
  // started drill-only day is theirs until a blaster adds the log); everyone
  // owns their own trio; Work Force is the day's time cards keyed by job +
  // date; the driller's card starts filled in from their checklist and log;
  // the rig's end-of-day meter is asked once at sign-complete and drill
  // hours on the report derive from it; today's day is OPENED, not
  // duplicated; two offline copies merge.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const API = 'http://localhost:4000';
  const WEB = 'http://localhost:5199';
  const stamp = Date.now().toString(36);

  const mkCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', '${API}');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-tour-done', '1');
      localStorage.setItem('shotlog-first-week-hidden', '1');
    `);
    return ctx;
  };
  const signIn = async (P, email, pass) => {
    await P.goto(WEB);
    await P.locator('input[type="email"]').fill(email);
    await P.locator('input[type="password"]').fill(pass);
    await P.getByRole('button', { name: 'Sign in' }).click();
    await P.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await P.waitForTimeout(3000);
  };
  const api = async (path, init = {}, token) => {
    const res = await page.request.fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      data: init.body,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  };
  const getDay = (P, id) =>
    P.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return db.blastDays.get(id);
    }, id);
  let adminTok;
  let dayId;
  let drillOnlyId;
  let dupId;
  let checklistId;
  let jobId;
  let job2Id;
  try {
    const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'mark@baystateblasting.com', password: 'dev-password-123' }) });
    adminTok = login.body.accessToken;
    const bl = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'blaster@test.local', password: 'blaster-pass-123' }) });
    const blasterId = bl.body.user.id;
    const dn = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'dinis@test.local', password: 'dinis-pass-123' }) });
    const dinisId = dn.body.user.id;

    // ── 1. blaster starts a day → authored by the blaster ───────────────
    const c1 = await mkCtx();
    const P1 = await c1.newPage();
    await signIn(P1, 'blaster@test.local', 'blaster-pass-123');
    const made = await P1.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const dayId = await createBlastDay(jobs[0].id, undefined, undefined, { name: `S7d day ${stamp}` });
      return { dayId, jobId: jobs[0].id, job2Id: jobs[1].id };
    }, stamp);
    dayId = made.dayId;
    jobId = made.jobId;
    job2Id = made.job2Id;
    const d1 = await getDay(P1, dayId);
    ok('a day the blaster starts is authored by the blaster (field bucket)', d1.authorUserId === blasterId && d1.authorBucket === 'field');
    await P1.goto(`${WEB}/blast-day/${dayId}?view=daily-report`);
    await P1.locator('[data-report-owner]').waitFor({ timeout: 8000 });
    ok('the daily report says the report is mine', (await P1.locator('[data-report-owner]').getAttribute('data-report-owner')) === 'me' && /\(you\)/.test(await P1.locator('[data-report-owner]').innerText()));
    ok('the author can edit conditions', (await P1.locator('[data-conditions-edit]').count()) === 1);
    ok('no Work Force editor — hours live on time cards', (await P1.getByRole('button', { name: /Add Worker/ }).count()) === 0 && (await P1.locator('[data-empty-add="Work Force"]').count()) === 0);
    ok('the time-cards card is the work force', /Work force · time cards/.test(await P1.locator('[data-time-cards]').innerText()));
    await P1.waitForTimeout(3000); // let the day reach the server
    await c1.close();

    // ── 2. the driller on the blaster's day: read-only report, own trio ─
    const c2 = await mkCtx();
    const P2 = await c2.newPage();
    await signIn(P2, 'dinis@test.local', 'dinis-pass-123');
    await P2.waitForTimeout(2500);
    await P2.goto(`${WEB}/blast-day/${dayId}?view=daily-report`);
    await P2.locator('[data-report-owner]').waitFor({ timeout: 8000 });
    const ownerText = await P2.locator('[data-report-owner]').innerText();
    ok('the driller sees whose report it is', (await P2.locator('[data-report-owner]').getAttribute('data-report-owner')) === 'other' && !/\(you\)/.test(ownerText) && /yours here/.test(ownerText));
    ok('the driller cannot edit the report (no conditions Edit, no Add rows)', (await P2.locator('[data-conditions-edit]').count()) === 0 && (await P2.locator('[data-empty-add]').count()) === 0);
    ok('…but can add their own card', (await P2.getByRole('button', { name: /My card/ }).count()) === 1);
    const d2 = await getDay(P2, dayId);
    ok('opening the day did NOT make it the driller\'s', d2.authorUserId === blasterId);
    // The driller's day in records: checklist (starting 500) + a drill log with a hole → sign complete with the end meter
    // Meter numbers sit ABOVE the rig's real ledger (a reading going backwards
    // is ignored by design), so the assertions hold on any dev database
    const { rigId, start, end, checklistId: ckId } = await P2.evaluate(async (dayId) => {
      const { db } = await import('/src/db/index.ts');
      const { emptyChecklist, fileChecklist } = await import('/src/hooks/useMaintenance.ts');
      const { buildHourLedger } = await import('/src/lib/hourLedger.ts');
      const day = await db.blastDays.get(dayId);
      const rig = await db.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill')).first();
      const { currentHours } = await buildHourLedger(rig);
      const start = Math.ceil(Math.max(currentHours ?? 0, rig.hourMeter ?? 0)) + 10;
      const chk = emptyChecklist(rig.id, day.jobId);
      await fileChecklist({ ...chk, startingHours: start });
      return { rigId: rig.id, start, end: start + 8, checklistId: chk.id };
    }, dayId);
    checklistId = ckId;
    const logId = await P2.evaluate(async ({ dayId, rigId }) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const day = await db.blastDays.get(dayId);
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const id = await createDrillLog(shot, dayId, day.jobId);
      await db.drillLogs.update(id, { drillRigEquipmentId: rigId, updatedAt: nowISO() });
      const now = nowISO();
      await db.drillLogHoles.add({ id: generateId(), drillLogId: id, date: todayISO(), holeNumber: '1', angle: 0, actualDepth: 20, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      return id;
    }, { dayId, rigId });
    await P2.goto(`${WEB}/blast-day/${dayId}/drill-log/${logId}`);
    await P2.locator('[data-tour="log-complete"]').waitFor({ timeout: 8000 });
    await P2.locator('[data-tour="log-complete"]').click();
    await P2.locator('[data-log-end-meter]').waitFor({ timeout: 5000 });
    // the placeholder comes from the hour ledger (a live query) — give it a beat
    await P2.waitForFunction((s) => document.querySelector('[data-log-end-meter]')?.getAttribute('placeholder') === s, String(start), { timeout: 5000 }).catch(() => undefined);
    ok(`sign-complete asks for the rig's end-of-day meter, prefilled from the ledger (${start})`, (await P2.locator('[data-log-end-meter]').getAttribute('placeholder')) === String(start));
    await P2.locator('[data-log-end-meter]').fill(String(end));
    await P2.locator('[data-log-complete-confirm]').click();
    await P2.waitForTimeout(1000);
    const after = await P2.evaluate(async ({ logId, rigId }) => {
      const { db } = await import('/src/db/index.ts');
      const { buildHourLedger } = await import('/src/lib/hourLedger.ts');
      const log = await db.drillLogs.get(logId);
      const rig = await db.equipment.get(rigId);
      const ledger = await buildHourLedger(rig);
      return { status: log.status, endingHours: log.endingHours, meter: rig.hourMeter, top: ledger.entries[0]?.source, current: ledger.currentHours };
    }, { logId, rigId });
    ok(`the log is complete with endingHours ${end}; the rig meter and ledger follow (source drill_log)`, after.status === 'complete' && after.endingHours === end && after.meter === end && after.top === 'drill_log' && after.current === end);
    // Now the driller's card starts filled in from checklist + log
    const cardId = await P2.evaluate(async (dayId) => {
      const { db } = await import('/src/db/index.ts');
      const { createTimeCard } = await import('/src/hooks/useTimeCards.ts');
      const me = JSON.parse(localStorage.getItem('shotlog-user-info'));
      const day = await db.blastDays.get(dayId);
      return createTimeCard(day, { name: me.name, userId: me.id });
    }, dayId);
    const card = await P2.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return db.timeCards.get(id);
    }, cardId);
    ok(`the driller's card is proposed from their own records (${card.suggestedFrom})`, /checklist \d\d:\d\d/.test(card.suggestedFrom ?? '') && /log signed \d\d:\d\d/.test(card.suggestedFrom ?? '') && Boolean(card.timeIn) && Boolean(card.timeOut) && card.blastDayId === dayId);
    await P2.goto(`${WEB}/blast-day/${dayId}?view=daily-report`);
    await P2.locator('[data-card-suggested]').waitFor({ timeout: 8000 });
    ok('the card shows the suggestion until edited', /Suggested from your own records/.test(await P2.locator('[data-card-suggested]').innerText()));
    // A drill-only day the driller starts is THEIRS
    drillOnlyId = await P2.evaluate(async (job2Id) => {
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      return createBlastDay(job2Id, undefined, undefined, { typeOfWork: 'drill_only', name: 'S7d driller day' });
    }, job2Id);
    const d3 = await getDay(P2, drillOnlyId);
    ok('a drill-only day the driller starts is authored by the driller', d3.authorUserId === dinisId && d3.authorBucket === 'driller');
    await P2.waitForTimeout(3500);
    await c2.close();

    // ── 3. blaster: derived rig hours, the roll-up, the takeover, join, merge ─
    const c3 = await mkCtx();
    const P3 = await c3.newPage();
    await signIn(P3, 'blaster@test.local', 'blaster-pass-123');
    await P3.waitForTimeout(2500);
    await P3.goto(`${WEB}/blast-day/${dayId}?view=daily-report`);
    await P3.locator('[data-derived-rigs]').waitFor({ timeout: 10000 });
    const derived = await P3.locator('[data-derived-rig]').first().innerText();
    ok(`drill hours on the report derive from the rig's records (${derived.replace(/\n/g, ' ')})`, derived.includes(`${start} → ${end} h`));
    ok('the daily report lists the driller\'s card (keyed by job + date)', /Dinis|Baltazar/.test(await P3.locator('[data-time-cards]').innerText()));
    ok('no-card-yet list never names someone who has a card', !/Baltazar/.test((await P3.locator('[data-no-card-yet]').count()) ? await P3.locator('[data-no-card-yet]').innerText() : ''));
    // the driller's drill-only day: still theirs when the blaster just opens it…
    await P3.goto(`${WEB}/blast-day/${drillOnlyId}`);
    await P3.locator('[data-report-owner]').waitFor({ timeout: 8000 });
    await P3.waitForTimeout(800);
    ok('the driller\'s drill-only day stays theirs when the blaster only opens it', (await P3.locator('[data-report-owner]').getAttribute('data-report-owner')) === 'other' && (await getDay(P3, drillOnlyId)).authorUserId === dinisId);
    // …and becomes the blaster's the moment the blast log is added
    await P3.getByRole('button', { name: /Add Blasting Log/ }).click();
    await P3.waitForTimeout(1200);
    const d4 = await getDay(P3, drillOnlyId);
    ok('adding the blast log hands the report to the blaster', d4.authorUserId === blasterId && d4.authorBucket === 'field' && d4.typeOfWork === 'drill_to_blast');
    // Join: the dialog offers to OPEN today's day instead of a second one
    await P3.goto(WEB);
    await P3.locator('[data-tour="fab"]').waitFor({ timeout: 10000 });
    await P3.locator('[data-tour="fab"]').click();
    await P3.locator('[data-new-day-dialog]').waitFor({ timeout: 5000 });
    // S8 Option B: the Job row opens a picker; search finds the job by id
    await P3.locator('[data-day-job]').click();
    await P3.locator('[data-pick-search]').fill(jobId);
    await P3.locator(`[data-choose-job="${jobId}"]`).waitFor({ timeout: 5000 });
    await P3.locator(`[data-choose-job="${jobId}"]`).click();
    await P3.waitForTimeout(600);
    ok('the dialog says today\'s day exists and who started it', /already has a work day/.test(await P3.locator('[data-day-exists]').innerText()) && /started by/.test(await P3.locator('[data-day-exists]').innerText()));
    await P3.locator('[data-day-open-existing]').click();
    await P3.waitForURL(new RegExp(`/blast-day/${dayId}`), { timeout: 8000 });
    ok('"Open that day" joins the existing day', true);
    // Merge: a second copy (as if another device made it offline) with a card on it
    dupId = await P3.evaluate(async ({ jobId, stamp }) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const { createTimeCard } = await import('/src/hooks/useTimeCards.ts');
      const id = await createBlastDay(jobId, undefined, undefined, { name: `S7d dup ${stamp}` });
      const day = await db.blastDays.get(id);
      const helper = await db.crewMembers.filter((m) => m.isActive && !m.userId).first();
      await createTimeCard(day, { name: helper?.name ?? 'Helper', crewMemberId: helper?.id });
      return id;
    }, { jobId, stamp });
    await P3.goto(`${WEB}/blast-day/${dayId}`);
    await P3.locator('[data-merge-strip]').waitFor({ timeout: 8000 });
    ok('two copies of the day → the merge strip appears to the author', /Two copies of this day/.test(await P3.locator('[data-merge-strip]').innerText()));
    await P3.locator('[data-merge-days]').click();
    // Long enough for the DELETE to reach the server and NOT bounce back
    // (a rejected delete would re-download the copy)
    await P3.waitForTimeout(5000);
    const merged = await P3.evaluate(async ({ dayId, dupId }) => {
      const { db } = await import('/src/db/index.ts');
      const gone = !(await db.blastDays.get(dupId));
      const cards = await db.timeCards.filter((c) => c.blastDayId === dayId).toArray();
      const logs = await db.drillLogs.where('blastDayId').equals(dayId).toArray();
      return { gone, cards: cards.length, logs: logs.length };
    }, { dayId, dupId });
    ok(`merge folded the copy in: other day gone, its card moved (${merged.cards} cards, ${merged.logs} logs on the kept day)`, merged.gone && merged.cards >= 2 && merged.logs >= 1 && (await P3.locator('[data-merge-strip]').count()) === 0);
    await P3.waitForTimeout(3000);
    await c3.close();

    // ── 4. office queue counts cards by job + date ──────────────────────
    const c4 = await mkCtx();
    const P4 = await c4.newPage();
    await signIn(P4, 'office@test.local', 'office-pass-123');
    await P4.locator('[data-office-home]').waitFor({ timeout: 10000 });
    await P4.waitForTimeout(2500);
    ok('office home renders with the S7d day model', (await P4.locator('[data-office-counter]').count()) === 5);
    await c4.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
  } finally {
    // cleanup as admin (the days + the driller's checklist stay harmless; days go)
    try {
      const c5 = await mkCtx();
      const P5 = await c5.newPage();
      await signIn(P5, 'mark@baystateblasting.com', 'dev-password-123');
      await P5.waitForTimeout(2500);
      const removed = await P5.evaluate(async ({ ids, checklistId }) => {
        const { db, deleteWithTombstone } = await import('/src/db/index.ts');
        const { deleteDayCascade } = await import('/src/lib/lifecycle.ts');
        let n = 0;
        for (const id of ids) {
          const day = id ? await db.blastDays.get(id) : undefined;
          if (day) {
            await deleteDayCascade(day);
            n++;
          }
        }
        // the harness checklist would otherwise shadow the rig's real meter
        if (checklistId && (await db.drillChecklists.get(checklistId))) await deleteWithTombstone('drillChecklists', checklistId);
        return n;
      }, { ids: [dayId, drillOnlyId, dupId], checklistId });
      await P5.waitForTimeout(3000);
      results.push(`PASS cleanup removed ${removed} harness day(s)`);
      await c5.close();
    } catch (e) {
      results.push(`FAIL cleanup ${e.message}`);
    }
  }
  return results.join('\n');
}

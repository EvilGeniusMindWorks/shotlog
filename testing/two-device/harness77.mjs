async (page, lib) => {
  // Round S18 — Typing, totals, review, and feedback from anywhere (2026-09-16)
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
  browserErrors({ clear: true });
  let dayId, shotId;

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);
  const cP = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
  const PP = await cP.newPage();
  await signIn(PP, 'blaster');
  await skipTours(PP);

  // a day of my own at a job with no day today
  const job = await PB.evaluate(async () => {
    const { db } = await import('/src/db/index.ts');
    const { todayISO } = await import('/src/lib/utils.ts');
    const taken = new Set((await db.blastDays.filter((d) => d.date === todayISO()).toArray()).map((d) => d.jobId));
    const free = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !taken.has(j.id) && !/^S1[124]/.test(j.name)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
    return free[0] ? { id: free[0].id, name: free[0].name } : null;
  });
  if (!job) throw new Error('need a free job');
  R.note(`job: ${job.name}`);
  const made = await PB.evaluate(async ({ jobId, stamp }) => {
    const { db } = await import('/src/db/index.ts');
    const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
    const id = await createBlastDayWithPapers(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `s18 ${stamp}` });
    const log = await db.blastLogs.where('blastDayId').equals(id).first();
    const shot = await db.shots.where('blastLogId').equals(log.id).first();
    return { id, shotId: shot.id };
  }, { jobId: job.id, stamp });
  dayId = made.id;
  shotId = made.shotId;
  await waitForUpload(PB, 30000);

  // type like a fast thumb: 15 ms between keys, far inside one read-back
  const typeFast = async (P, sel, text) => {
    const el = P.locator(sel).first();
    await el.click();
    await el.fill('');
    await P.keyboard.type(text, { delay: 15 });
  };
  // count saves while typing: sample the record's updatedAt every 40 ms and count distinct stamps
  const watchSaves = (P, table, id, ms = 2200) =>
    P.evaluate(async ({ t, id, ms }) => {
      const { db } = await import('/src/db/index.ts');
      const seen = new Set();
      const first = (await db[t].get(id))?.updatedAt;
      const until = Date.now() + ms;
      while (Date.now() < until) {
        const u = (await db[t].get(id))?.updatedAt;
        if (u && u !== first) seen.add(u);
        await new Promise((r) => setTimeout(r, 40));
      }
      return seen.size;
    }, { t: table, id, ms });
  const shotField = (P, pick) => P.evaluate(async ({ id, pick }) => {
    const s = await (await import('/src/db/index.ts')).db.shots.get(id);
    return pick === 'holes' ? s?.totals.numHoles : pick === 'burden' ? s?.drillParams.burden : s?.drillParams.holeDiameter;
  }, { id: shotId, pick });

  await R.section('Typing fast keeps every character and saves once per pause', async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}?view=blast-log`);
    await PB.locator('[data-total="numHoles"]').waitFor({ timeout: 20000 });
    let saves = watchSaves(PB, 'shots', shotId);
    await typeFast(PB, '[data-total="numHoles"]', '4321');
    R.ok('# Holes shows every character typed fast (4321)', (await PB.locator('[data-total="numHoles"]').inputValue()) === '4321');
    const n1 = await saves;
    R.ok(`one save for four keystrokes (${n1})`, n1 === 1);
    const holes = await waitFor(() => shotField(PB, 'holes').then((v) => (v === 4321 ? v : 0)));
    R.ok('the shot holds 4321', holes === 4321);

    saves = watchSaves(PB, 'shots', shotId);
    await typeFast(PB, '[data-dp="burden"]', '12.5');
    R.ok('Burden shows 12.5', (await PB.locator('[data-dp="burden"]').inputValue()) === '12.5');
    const n2 = await saves;
    const burden = await waitFor(() => shotField(PB, 'burden').then((v) => (v === 12.5 ? v : 0)));
    R.ok(`the shot holds burden 12.5 after one pause (${n2} save)`, burden === 12.5 && n2 === 1);

    await PB.reload();
    await PB.locator('[role="button"]:has-text("Totals")').first().waitFor({ timeout: 20000 });
    // Drill parameters and Totals fold themselves once they hold numbers — open them to read the boxes
    if (!(await PB.locator('[data-total="numHoles"]').isVisible().catch(() => false))) await PB.locator('[role="button"]:has-text("Totals")').first().click();
    if (!(await PB.locator('[data-dp="burden"]').isVisible().catch(() => false))) await PB.locator('[data-tour="shot-drill"] [role="button"]').first().click();
    await PB.locator('[data-total="numHoles"]').waitFor({ timeout: 10000 });
    await PB.locator('[data-dp="burden"]').waitFor({ timeout: 10000 });
    R.ok(
      'after a reload the boxes read 4321 and 12.5',
      (await PB.locator('[data-total="numHoles"]').inputValue()) === '4321' && (await PB.locator('[data-dp="burden"]').inputValue()) === '12.5',
    );

    // the daily report's rows and the time card
    const MAT = '[data-line-items="Materials / Onsite Repairs / Fuel"] [data-line-field="vendor"]';
    await PB.goto(`${WEB}/blast-day/${dayId}?view=daily-report`);
    await PB.locator('[data-empty-add="Materials / Onsite Repairs / Fuel"]').click();
    await PB.locator(MAT).waitFor({ timeout: 10000 });
    const matId = await PB.evaluate(async () => (await (await import('/src/db/index.ts')).db.materialEntries.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id);
    saves = watchSaves(PB, 'materialEntries', matId, 2600);
    await typeFast(PB, MAT, 'Maine Drilling & Blasting');
    R.ok('the vendor box keeps the whole name typed fast', (await PB.locator(MAT).first().inputValue()) === 'Maine Drilling & Blasting');
    const n3 = await saves;
    R.ok(`one save for the whole name (${n3})`, n3 === 1);
    const vendor = await waitFor(() =>
      PB.evaluate(async () => {
        const { db } = await import('/src/db/index.ts');
        return (await db.materialEntries.toArray()).some((x) => x.vendor === 'Maine Drilling & Blasting') ? 1 : 0;
      }),
    );
    R.ok('the row holds the vendor', vendor === 1);

    await PB.locator('[data-time-cards] button:has-text("My card")').click();
    await PB.locator('[data-card-in]').first().waitFor({ timeout: 10000 });
    await PB.locator('[data-card-in]').first().fill('06:30');
    await PB.locator('[data-card-out]').first().fill('15:00');
    await sleep(900);
    const st = await waitFor(() =>
      PB.evaluate(async (dayId) => {
        const { db } = await import('/src/db/index.ts');
        const c = (await db.timeCards.filter((c) => c.blastDayId === dayId).toArray())[0];
        return c && c.timeIn === '06:30' && c.timeOut === '15:00' ? c.straightTime : 0;
      }, dayId),
    );
    R.ok(`IN and OUT saved, straight time computed (${st} h)`, st > 0);

    await PP.goto(`${WEB}/blast-day/${dayId}?view=daily-report`);
    await PP.locator('[data-card-in]').first().waitFor({ timeout: 20000 });
    const w = await PP.locator('[data-card-in]').first().evaluate((el) => el.getBoundingClientRect().width);
    R.ok(`on a phone the IN box is ${Math.round(w)} px wide — room for "06:30 AM"`, w >= 140);

    // the design plan's number boxes (his "design number boxes" report)
    await PB.goto(`${WEB}/blast-day/${dayId}/design/${shotId}?mode=plan`);
    await PB.locator('[data-shot-facts]').waitFor({ timeout: 20000 });
    saves = watchSaves(PB, 'shots', shotId);
    await typeFast(PB, '[data-shot-dia]', '3.5');
    R.ok("the plan's Diameter box keeps 3.5", (await PB.locator('[data-shot-dia]').inputValue()) === '3.5');
    const n4 = await saves;
    const dia = await waitFor(() => shotField(PB, 'dia').then((v) => (v === 3.5 ? v : 0)));
    R.ok(`the shot holds diameter 3.5 with ${n4} save(s)`, dia === 3.5 && n4 === 1);
  });

  let paperLabel = '';
  const envOf = (P) => P.evaluate(async () => (await import('/src/lib/session.ts')).getSessionUser()?.environment ?? null);
  await R.section('The feedback bubble reaches the composer over a sheet and on a print screen, and names the paper', async () => {
    // make sure it is on (a device may have switched it off) the way a person would in Settings
    await PP.goto(`${WEB}/settings`);
    await PP.locator('[data-pref-feedback-fab]').waitFor({ timeout: 20000 });
    R.note(`company environment: ${await envOf(PP)}`);
    if (!(await PP.locator('[data-pref-feedback-fab]').isChecked())) await PP.locator('[data-pref-feedback-fab]').check();
    await PP.goto(`${WEB}/blast-day/${dayId}`);
    await PP.locator('[data-feedback-fab]').waitFor({ timeout: 20000 });
    R.ok('the bubble is on the day screen', true);
    await PP.locator('[data-day-date-button]').click();
    await PP.locator('[data-change-date]').waitFor({ timeout: 10000 });
    const covered = await PP.evaluate(() => {
      const q = document.querySelector('[data-help-button]');
      if (!q) return 'no-?';
      const r = q.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return q.contains(el) ? 'reachable' : 'covered';
    });
    R.ok(`with the sheet open the ? in the header is ${covered}`, covered === 'covered');
    const fabOnTop = await PP.evaluate(() => {
      const b = document.querySelector('[data-feedback-fab]');
      const r = b.getBoundingClientRect();
      return b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    });
    R.ok('the bubble is still on top of the sheet', fabOnTop);
    await PP.locator('[data-feedback-fab]').click();
    await PP.locator('[data-feedback-composer]').waitFor({ timeout: 25000 });
    R.ok('the composer opens over the sheet', true);
    // S19: an ordinary screen names itself ("This screen: Work day · <job> · <date>") — it arrives a beat after the sheet
    await PP.locator('[data-feedback-paper]').waitFor({ timeout: 8000 }).catch(() => {});
    const screenLine = (await PP.locator('[data-feedback-paper]').textContent().catch(() => '')) || '';
    R.ok(`an ordinary screen names itself (${screenLine.slice(0, 60)})`, /This screen: /.test(screenLine));
    R.note(`screenshot offered: ${(await PP.locator('[data-feedback-screenshot]').count()) === 1}`);
    await PP.locator('[data-feedback-composer] button:has-text("Cancel")').click();
    await PP.locator('[data-feedback-composer]').waitFor({ state: 'detached', timeout: 5000 });

    await PP.goto(`${WEB}/blast-day/${dayId}/print`);
    await PP.locator('[data-feedback-fab]').waitFor({ timeout: 20000 });
    await PP.getByText(job.name).first().waitFor({ timeout: 20000 }); // the paper itself is on screen before we tap
    R.ok('the bubble is on the print screen, which has no ? at all', (await PP.locator('[data-help-button]').count()) === 0);
    await PP.locator('[data-feedback-fab]').click();
    await PP.locator('[data-feedback-composer]').waitFor({ timeout: 25000 });
    const paperText = (await PP.locator('[data-feedback-paper]').textContent().catch(() => '')) || '';
    paperLabel = paperText.replace(/^About\s+/, '').replace(/\s+—.*$/, '').trim();
    R.ok(`the composer names the paper: "${paperLabel}"`, /^Blasting log · .+ · print$/.test(paperLabel) && paperLabel.includes(job.name));
    const msg = `harness77 ${stamp} against the print`;
    await PP.locator('[data-feedback-message]').fill(msg);
    await PP.locator('[data-feedback-send]').click();
    await PP.locator('[data-feedback-composer]').waitFor({ state: 'detached', timeout: 15000 });
    const { token, api } = await apiLogin(PP, 'mark');
    const row = await waitFor(async () => {
      const r = await api('/feedback', {}, token);
      return (r.body?.feedback ?? []).find((f) => f.message === msg);
    }, 15000);
    R.note(`server row: ${JSON.stringify(row ? { paper: row.paper, route: row.route } : { found: false })}`);
    R.ok('the report reached the server with the paper and the route', Boolean(row) && row.paper?.label === paperLabel && /\/print$/.test(row.route || ''));
    R.ok('the paper carries the record behind the print', Boolean(row?.paper?.recordId) && row.paper.recordId === dayId && row.paper.kind === 'blastLog');
  });

  await R.section('The Settings switch hides the bubble; on by default everywhere', async () => {
    await PP.evaluate(() => localStorage.removeItem('shotlog-feedback-button'));
    await PP.goto(`${WEB}/settings`);
    await PP.locator('[data-pref-feedback-fab]').waitFor({ timeout: 20000 });
    const env = await envOf(PP);
    const checked = await PP.locator('[data-pref-feedback-fab]').isChecked();
    R.ok(`with no preference the bubble is on whatever the company (${env}) — Matthew, Sep 16: everywhere`, checked === true);
    if (!checked) await PP.locator('[data-pref-feedback-fab]').check();
    await sleep(300);
    R.ok('on: the bubble shows on Settings too', (await PP.locator('[data-feedback-fab]').count()) === 1);
    await PP.locator('[data-pref-feedback-fab]').uncheck();
    await sleep(300);
    R.ok('off: the bubble is gone', (await PP.locator('[data-feedback-fab]').count()) === 0);
    await PP.locator('[data-pref-feedback-fab]').check();
    await sleep(300);
    R.ok('on: it is back', (await PP.locator('[data-feedback-fab]').count()) === 1);
    const rule = await PP.evaluate(async () => {
      const m = await import('/src/lib/feedbackFab.ts');
      return {
        prod: m.feedbackFabDefault('production'),
        beta: m.feedbackFabDefault('beta'),
        alpha: m.feedbackFabDefault('alpha'),
        bare: m.isBareRoute('/blast-day/x/print') && m.isBareRoute('/blast-day/x/print-daily') && m.isBareRoute('/blast-day/x/submit') && m.isBareRoute('/help/blaster/x') && m.isBareRoute('/drill-checklist-print/x') && !m.isBareRoute('/blast-day/x') && !m.isBareRoute('/records'),
      };
    });
    R.ok('on by default in Production, Alpha and Beta alike', rule.prod && rule.beta && rule.alpha);
    R.ok('print, filing and help screens count as bare — the bubble sits lower there', rule.bare);
  });

  // ── push 2: a plan on the shot, a driller's log, the review ─────────────
  const cD = await mkCtx(browser, { viewport: { width: 420, height: 860 } });
  const PD = await cD.newPage();
  await signIn(PD, 'dinis');
  await skipTours(PD);
  const meD = await PD.evaluate(async () => (await import('/src/lib/session.ts')).getSessionUser());
  let logId, shot2Id;
  const setPlan = (P, id, rows, cols, depth) =>
    P.evaluate(async ({ id, rows, cols, depth }) => {
      const { db } = await import('/src/db/index.ts');
      const { serializeDiagram, emptyDiagram } = await import('/src/lib/shotDiagram.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const shot = await db.shots.get(id);
      const d = { ...emptyDiagram(rows, cols), interHoleMs: 25, plan: { defaultDepth: depth, overrides: {} } };
      await db.shots.update(id, { designPlan: { ...shot.designPlan, shotDiagramData: serializeDiagram(d) }, updatedAt: nowISO() });
    }, { id, rows, cols, depth });
  const openTotals = async (P) => {
    await P.locator('[role="button"]:has-text("Totals")').first().waitFor({ timeout: 20000 });
    if (!(await P.locator('[data-totals-source]').first().isVisible().catch(() => false))) await P.locator('[role="button"]:has-text("Totals")').first().click();
    await P.locator('[data-totals-source]').first().waitFor({ timeout: 10000 });
  };
  const shotRow = (P, id) => P.evaluate(async (id) => { const s = await (await import('/src/db/index.ts')).db.shots.get(id); return s ? { holes: s.totals.numHoles, ft: s.totals.totalDrillFootage, src: s.totalsSource ?? null, time: s.time } : null; }, id);

  await R.section("The shot's totals: from the plan before drilling, from the accepted drilling after, edited by hand until you take them back", async () => {
    // his 4321 holes / 12.5 burden from §1 are typed numbers — the plan must not replace them; take them back first
    await PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts'); const s = await db.shots.get(id); await db.shots.update(id, { totals: { ...s.totals, numHoles: 0, totalDrillFootage: 0, avgDrillDepth: 0 }, totalsSource: undefined, updatedAt: nowISO() }); }, shotId);
    await setPlan(PB, shotId, 2, 10, 20); // 20 planned holes × 20 ft
    await PB.goto(`${WEB}/blast-day/${dayId}?view=blast-log`);
    await openTotals(PB);
    const fromPlan = await waitFor(() => shotRow(PB, shotId).then((r) => (r?.src === 'plan' ? r : undefined)));
    R.ok(`with a plan and no drilling the totals read from the plan: ${fromPlan?.holes} holes · ${fromPlan?.ft} ft`, fromPlan?.holes === 20 && fromPlan?.ft === 400);
    R.ok('the line under the totals says "From the plan"', /From the plan/.test((await PB.locator('[data-totals-source="plan"]').first().textContent()) || ''));

    // the driller logs 18 of the 20 and signs complete with a note
    await waitForUpload(PB, 30000);
    logId = await waitFor(() => PD.evaluate(async ({ dayId, shotId }) => {
      const { db } = await import('/src/db/index.ts');
      const shot = await db.shots.get(shotId);
      const day = await db.blastDays.get(dayId);
      if (!shot || !day) return undefined;
      const { createDrillLog, addHole } = await import('/src/hooks/useDrillLogs.ts');
      const id = await createDrillLog(shot, dayId, day.jobId);
      const log = await db.drillLogs.get(id);
      for (let n = 1; n <= 18; n++) await addHole(log, { holeNumber: String(n), actualDepth: n === 7 ? 22 : 20, angle: 0, subdrill: 0, conditions: n === 7 ? [{ code: 'W', fromFt: 0, toFt: 22 }] : [], comment: n === 7 ? 'ran wet' : '' });
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.drillLogs.update(id, { holeDiameter: 3.5, burden: 6, spacing: 6, faceHeight: 20, status: 'complete', completedAt: nowISO(), completionNote: 'hit clay in row 2', updatedAt: nowISO() });
      return id;
    }, { dayId, shotId }), 30000);
    R.ok('the driller logged 18 holes and signed complete', Boolean(logId));
    await waitForUpload(PD, 30000);
  });

  await R.section('The review: the header the driller drilled to, a list of the holes, the note, and Send back', async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}?view=drilling`);
    await PB.locator(`[data-review-log-specs="${logId}"]`).waitFor({ timeout: 25000 });
    const specs = (await PB.locator(`[data-review-log-specs="${logId}"]`).textContent()) || '';
    R.ok(`the log's line reads the driller's header: "${specs.trim()}"`, /3\.5 in/.test(specs) && /6 × 6 ft/.test(specs) && /face 20 ft/.test(specs));
    R.ok("the driller's sign-off note is on the screen", /hit clay in row 2/.test((await PB.locator(`[data-review-log-note="${logId}"]`).textContent()) || ''));
    R.ok('the grid draws every hole at one size (34 px)', (await PB.locator('[data-pattern-grid="review"] [data-cell-px="34"]').count()) === 1);
    await PB.locator('[data-review-view-pick="list"]').click();
    await PB.locator('[data-review-list]').waitFor({ timeout: 5000 });
    R.ok('List shows all 18 holes as rows', (await PB.locator('[data-review-list-row]').count()) === 18);
    const row7 = (await PB.locator('[data-review-list-row="7"]').textContent()) || '';
    R.ok(`hole 7's row carries its depth, the water and the comment: "${row7.replace(/\s+/g, ' ').trim()}"`, /22\.0 ft/.test(row7) && /Water/.test(row7) && /ran wet/.test(row7));
    await PB.locator('[data-review-view-pick="grid"]').click();
    R.ok('back to Grid', (await PB.locator('[data-pattern-grid="review"]').count()) === 1);

    await PB.locator('[data-review-sendback]').click();
    await PB.locator('[data-review-sendback-sheet]').waitFor({ timeout: 5000 });
    await PB.locator('[data-review-sendback-note]').fill('Row 2: log the actual depth per hole');
    await PB.locator('[data-review-sendback-go]').click();
    const reopened = await waitFor(() => PB.evaluate(async (id) => { const l = await (await import('/src/db/index.ts')).db.drillLogs.get(id); return l?.status === 'open' && l.reopenNote ? l.reopenNote : undefined; }, logId));
    R.ok(`the log is open again with the note: "${reopened}"`, reopened === 'Row 2: log the actual depth per hole');
    const doorGone = await waitFor(() => PB.locator('[data-review-sendback]').count().then((n) => (n === 0 ? 1 : 0)), 10000);
    R.ok('the Send back door is gone while nothing is complete', doorGone === 1);
    await waitForUpload(PB, 30000);
    await PD.goto(`${WEB}/`);
    // S24: the line comes from the log itself (the Sent back to you band), not a reminder row
    const line = await waitFor(async () => { const n = await PD.locator('[data-driller-home] [data-sent-back-band]').count(); return n ? (await PD.locator('[data-sent-back-band]').first().textContent()) : undefined; }, 30000);
    R.ok(`the driller's home says who sent it back and why: "${(line || '').replace(/\s+/g, ' ').trim().slice(0, 90)}"`, /Sent back to you/.test(line || '') && /Row 2/.test(line || '') && (await PD.locator('[data-reminder-kind="sentback"]').count()) === 0);
    await PD.goto(`${WEB}/blast-day/${dayId}/drill-log/${logId}`);
    await PD.getByText('Sent back by the blaster').first().waitFor({ timeout: 20000 });
    R.ok('the log itself shows the sent-back note on top', true);
    // the driller signs it complete again — the line on the home clears itself
    await PD.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts'); await db.drillLogs.update(id, { status: 'complete', completedAt: nowISO(), reopenNote: undefined, updatedAt: nowISO() }); }, logId);
    await PD.goto(`${WEB}/`);
    await PD.locator('[data-driller-home]').waitFor({ timeout: 20000 });
    const cleared = await waitFor(() => PD.locator('[data-sent-back-band]').count().then((n) => (n === 0 ? 1 : 0)), 15000);
    R.ok('signed complete again, the sent-back line leaves the home on its own', cleared === 1);
    await waitForUpload(PD, 30000);
  });

  await R.section('Accepting fills the totals from the drilling; a typed number holds until you take the figures back', async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}?view=drilling`);
    await PB.locator('[data-review-accept]').waitFor({ timeout: 25000 });
    const scope = (await PB.locator('[data-review-accept-scope]').textContent()) || '';
    R.ok(`the button says what it locks: "${scope.trim()}"`, /Accepting locks/.test(scope));
    await PB.locator('[data-review-accept]').click();
    const acc = await waitFor(() => PB.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.status, logId).then((v) => (v === 'accepted' ? v : undefined)));
    R.ok('the log is accepted', acc === 'accepted');
    await PB.goto(`${WEB}/blast-day/${dayId}?view=blast-log`);
    await openTotals(PB);
    const fromDrilling = await waitFor(() => shotRow(PB, shotId).then((r) => (r?.src === 'drilling' ? r : undefined)));
    R.ok(`the totals now read the drilling: ${fromDrilling?.holes} holes · ${fromDrilling?.ft} ft (18 × 20 + 2 extra)`, fromDrilling?.holes === 18 && fromDrilling?.ft === 362);
    const srcLine = (await PB.locator('[data-totals-source="drilling"]').first().textContent()) || '';
    R.ok(`the line names the source: "${srcLine.trim().slice(0, 80)}…"`, /From the accepted drilling: 18 holes · 362 ft/.test(srcLine) && /accepted/.test(srcLine));
    if (!(await PB.locator('[data-total="numHoles"]').isVisible().catch(() => false))) await PB.locator('[role="button"]:has-text("Totals")').first().click();
    await typeFast(PB, '[data-total="numHoles"]', '19');
    const edited = await waitFor(() => shotRow(PB, shotId).then((r) => (r?.src === 'edited' && r.holes === 19 ? r : undefined)));
    const useDoor = await waitFor(() => PB.locator('[data-totals-use-drilling]').count().then((n) => (n === 1 ? n : 0)), 10000);
    R.ok('a typed 19 holds and the line reads "Edited by you" with a way back', edited?.holes === 19 && useDoor === 1 && /Edited by you/.test((await PB.locator('[data-totals-source="edited"]').first().textContent()) || ''));
    await PB.locator('[data-totals-use-drilling]').click();
    const back = await waitFor(() => shotRow(PB, shotId).then((r) => (r?.src === 'drilling' && r.holes === 18 ? r : undefined)));
    R.ok("tapping \"use the drilling's figures\" brings 18 back", back?.holes === 18);
    R.ok('the review names when the log was accepted', await PB.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.acceptedAt ? true : false, logId));
  });

  await R.section('Blast mats once for the log; the time of shot on the shot header with Now', async () => {
    await PB.locator('[data-shot-time-row]').first().waitFor({ timeout: 20000 });
    R.ok('Time of shot sits on the shot header, not under Drill parameters', (await PB.locator('[data-shot-time-row] [data-shot-time]').count()) >= 1 && (await PB.locator('[data-tour="shot-drill"] [data-shot-time]').count()) === 0);
    await PB.locator('[data-shot-time-now]').first().click();
    const t = await waitFor(() => shotRow(PB, shotId).then((r) => (r?.time && /^\d{2}:\d{2}$/.test(r.time) ? r.time : undefined)));
    R.ok(`Now stamps the shot's time (${t})`, Boolean(t));
    await PB.locator('[data-log-mats]').waitFor({ timeout: 10000 });
    await PB.locator('[data-log-mats] button:has-text("Yes")').click();
    await PB.locator('[data-log-mat-count]').waitFor({ timeout: 5000 });
    await typeFast(PB, '[data-log-mat-count]', '12');
    const mats = await waitFor(() => PB.evaluate(async (dayId) => { const { db } = await import('/src/db/index.ts'); const log = await db.blastLogs.where('blastDayId').equals(dayId).first(); const u = log ? await db.explosiveUsages.where('blastLogId').equals(log.id).first() : null; return u?.blastMats === true && u.blastMatCount === 12 ? 12 : undefined; }, dayId));
    R.ok('the log holds Yes · 12 for all shots', mats === 12);
    R.ok('the shot card no longer asks about mats', (await PB.locator('[data-blast-mat-count]').count()) === 0);
    await PB.goto(`${WEB}/blast-day/${dayId}/print`);
    const printed = await waitFor(async () => { const t = ((await PB.locator('[data-print-mats]').textContent().catch(() => '')) || '').trim(); return t === 'Yes · 12' ? t : undefined; }, 20000);
    R.ok(`the print reads "Blast Mats: ${printed || '—'}" beside the lead line`, printed === 'Yes · 12');
    const legacy = await PB.evaluate(async () => { const m = await import('/src/lib/blastMats.ts'); return m.blastMatsText(undefined, [{ drillParams: { blastMats: true, blastMatCount: 3 } }, { drillParams: { blastMats: true, blastMatCount: 4 } }]); });
    R.ok(`an older log with mats per shot still prints their sum (${legacy})`, legacy === 'Yes · 7');
  });

  await R.section("A second shot: the plan door on the shot's own card, and equal grids on the review", async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}?view=blast-log`);
    await PB.locator('button:has-text("Add Shot")').waitFor({ timeout: 20000 });
    await PB.locator('button:has-text("Add Shot")').click();
    shot2Id = await waitFor(() => PB.evaluate(async (dayId) => { const { db } = await import('/src/db/index.ts'); const log = await db.blastLogs.where('blastDayId').equals(dayId).first(); const shots = (await db.shots.where('blastLogId').equals(log.id).toArray()).sort((a, b) => a.shotNumber - b.shotNumber); return shots[1]?.id; }, dayId));
    await PB.locator(`[data-build-plan-shot="${shot2Id}"]`).waitFor({ timeout: 15000 });
    R.ok('the new shot\'s Drilling row offers "Build the drill plan ›" and not "Send to drillers"', (await PB.locator(`[data-build-plan-shot="${shot2Id}"]`).count()) === 1);
    await PB.locator(`[data-build-plan-shot="${shot2Id}"]`).click();
    await PB.locator('[data-shot-facts]').waitFor({ timeout: 20000 });
    R.ok('it opens the plan builder for shot 2', new RegExp(`/design/${shot2Id}`).test(PB.url()) && /mode=plan/.test(PB.url()));
    await setPlan(PB, shot2Id, 2, 5, 18); // five columns against shot 1's ten
    await PB.goto(`${WEB}/blast-day/${dayId}?view=blast-log`);
    await PB.locator('[data-shot-time-row]').nth(1).waitFor({ timeout: 20000 });
    R.ok('with a plan, shot 2 offers Send to drillers instead', (await PB.locator(`[data-build-plan-shot="${shot2Id}"]`).count()) === 0);
    await PB.goto(`${WEB}/blast-day/${dayId}?view=drilling`);
    await waitFor(() => PB.locator('[data-pattern-grid="review"]').count().then((n) => (n === 2 ? n : 0)), 20000);
    const widths = await PB.evaluate(() => [...document.querySelectorAll('[data-pattern-grid="review"]')].map((g) => { const b = g.querySelector('[data-pattern-hole]'); return b ? Math.round(b.getBoundingClientRect().width) : 0; }));
    R.ok(`two grids (10 and 5 columns) draw holes the same size: ${widths.join(' / ')} px`, widths.length === 2 && widths[0] > 0 && Math.abs(widths[0] - widths[1]) <= 1);
    R.ok("shot 1's accepted log is untouched by shot 2's plan", (await PB.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.status, logId)) === 'accepted');
  });

  await R.section('The typical column builds from the toe up by default; the switch is remembered', async () => {
    await PB.evaluate(() => localStorage.removeItem('shotlog-column-add-at'));
    await PB.goto(`${WEB}/blast-day/${dayId}/design/${shotId}?mode=timing`);
    await PB.getByText('Typical Column', { exact: true }).first().waitFor({ timeout: 20000 });
    if (await PB.locator('button:has-text("Add Typical Column")').isVisible().catch(() => false)) await PB.locator('button:has-text("Add Typical Column")').click();
    await PB.locator('[data-column-add-at]').waitFor({ timeout: 10000 });
    R.ok('with no preference the builder starts from the toe', (await PB.locator('[data-column-add-at]').getAttribute('data-column-add-at')) === 'toe');
    for (let i = 0; i < 3; i++) { await PB.locator('button:has-text("Add Layer")').click(); await sleep(400); }
    await waitFor(() => PB.locator('[data-layer-row]').count().then((n) => (n === 3 ? n : 0)));
    const order = await PB.evaluate(() => [...document.querySelectorAll('[data-layer-row]')].map((r) => r.getAttribute('data-layer-type')));
    R.ok(`three taps from the toe up: booster first, stemming last, drawn collar-down as ${order.join(' → ')}`, order.join(',') === 'stemming,explosive,booster');
    await PB.locator('[data-column-add-at-pick="collar"]').click();
    R.ok('the switch is remembered on the device', (await PB.evaluate(() => localStorage.getItem('shotlog-column-add-at'))) === 'collar');
    await PB.locator('[data-column-add-at-pick="toe"]').click();
  });

  await R.section('The daily report can be marked done: the tile, the filing screen, and Edit again', async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}?view=daily-report`);
    await PB.locator('[data-report-done]').waitFor({ timeout: 20000 });
    await PB.locator('[data-report-done]').click();
    // the navigation round: marking it done lands on the day; the banner waits on the report itself
    await PB.waitForURL(new RegExp('/blast-day/' + dayId + '$'), { timeout: 10000 });
    R.ok('Mark done lands on the day', new URL(PB.url()).search === '');
    await PB.goto(`${WEB}/blast-day/${dayId}?view=daily-report`);
    await PB.locator('[data-report-done-banner]').waitFor({ timeout: 20000 });
    R.ok('the banner names who marked it done', /Done/.test((await PB.locator('[data-report-done-banner]').textContent()) || ''));
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    await PB.locator('[data-tile="daily-report"]').waitFor({ timeout: 20000 });
    const tile = (await PB.locator('[data-tile="daily-report"]').getAttribute('data-tile-state')) || '';
    R.ok(`the tile reads "${tile}"`, /^Done /.test(tile));
    await PB.goto(`${WEB}/blast-day/${dayId}/submit`);
    await PB.locator('[data-preflight-item="report-done"]').waitFor({ timeout: 25000 });
    const pre = (await PB.locator('[data-preflight-item="report-done"]').textContent()) || '';
    R.ok(`the filing screen shows the green line: "${pre.trim()}"`, /Daily report marked done by/.test(pre) && (await PB.locator('[data-preflight-item="report-done"]').getAttribute('data-preflight-level')) === 'ok');
    await PB.goto(`${WEB}/blast-day/${dayId}?view=daily-report`);
    await PB.locator('[data-report-undone]').waitFor({ timeout: 20000 });
    await PB.locator('[data-report-undone]').click();
    await PB.locator('[data-report-done]').waitFor({ timeout: 10000 });
    R.ok('Edit again reopens it', true);
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId].filter(Boolean), drillLogs: [logId].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cD.close();
  await cP.close();
  await cB.close();
  return R.summary();
}

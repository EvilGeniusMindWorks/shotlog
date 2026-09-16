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
    // this test company may be Production-flavoured (bubble off by default) — switch it on the way a person would in Settings
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
    R.ok('no paper is named on an ordinary screen', (await PP.locator('[data-feedback-paper]').count()) === 0);
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

  await R.section('The Settings switch hides the bubble; production stays off by default', async () => {
    await PP.evaluate(() => localStorage.removeItem('shotlog-feedback-button'));
    await PP.goto(`${WEB}/settings`);
    await PP.locator('[data-pref-feedback-fab]').waitFor({ timeout: 20000 });
    const env = await envOf(PP);
    const checked = await PP.locator('[data-pref-feedback-fab]').isChecked();
    R.ok(`with no preference the switch follows the company: ${env} → ${checked ? 'on' : 'off'}`, checked === (env !== 'production'));
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
    R.ok('Production is off by default; Alpha and Beta are on', !rule.prod && rule.beta && rule.alpha);
    R.ok('print, filing and help screens count as bare — the bubble sits lower there', rule.bare);
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cP.close();
  await cB.close();
  return R.summary();
}

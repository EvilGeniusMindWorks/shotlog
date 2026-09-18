async (page, lib) => {
  // Round S8a (Matthew's eleven, 2026-09-07): the drill plan is a path with
  // one next step everywhere — Build the drill plan → Send the plan → Drilling
  // — X n/m → Review drilling & build timing; the plan page opens in PLAN mode
  // with a pinned Send footer; the timing is built on the DRILLED pattern
  // (undrilled greyed, conditions marked) and flags later drilling changes;
  // the Send sheet's button is pinned; the feedback screenshot opens in an
  // in-app viewer; the driller with no plan is told to ask the blaster.
  const { mkCtx, signIn, skipTours, apiFor, apiLogin, waitForUpload, waitText, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const api = apiFor(page);
  const stamp = lib.stamp();
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
  let dayId, shotId, logId, feedbackId, adminTok, jobId;

  // ── §1–§5 (S23 push 2, Sep 18 2026): one flow, a week or a day — the pattern is a paper of the job.
  // "Next: build the drill plan" inside a shot is GONE (Matthew's v3 item 7); the blaster plans the drilling
  // at the job, the driller drills the pattern's one log, the blaster accepts it and makes the shot from it;
  // the timing is built on the DRILLED pattern and follows later drilling changes.
  const c1 = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
  const P1 = await c1.newPage();
  let planId, partId;
  await R.section('a new day: Continue says "Next: pick the pattern"; the shot has no build-the-plan door', async () => {
    await signIn(P1, 'blaster');
    await skipTours(P1);
    const made = await P1.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      // a job with no day today and NO pattern yet — one day per job+date (S13); the pattern is a paper of the job (S23)
      const { todayISO } = await import('/src/lib/utils.ts');
      const taken = new Set((await db.blastDays.filter((d) => d.date === todayISO()).toArray()).map((d) => d.jobId));
      const planned = new Set((await db.drillPlans.filter((p) => !p.archivedAt).toArray()).map((p) => p.jobId));
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !taken.has(j.id) && !planned.has(j.id)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const id = await createBlastDayWithPapers(jobs[0].id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `S8a plan day ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      return { id, shotId: shot.id, jobId: jobs[0].id };
    }, stamp);
    dayId = made.id;
    shotId = made.shotId;
    jobId = made.jobId;
    await P1.goto(`${WEB}/blast-day/${dayId}?view=hub`);
    await P1.locator('[data-day-continue]').waitFor({ timeout: 10000 });
    R.ok(`Continue: Next: pick the pattern ("${(await P1.locator('[data-day-continue]').innerText()).trim()}")`, /pick the pattern/i.test(await P1.locator('[data-day-continue]').innerText()));
    await P1.locator('[data-day-continue]').click();
    await P1.waitForURL(/view=blast-log/, { timeout: 8000 });
    await P1.locator('[data-shot-drilled-by-others]').first().waitFor({ timeout: 10000 });
    R.ok('the shot says "drilled by others" and has no Build-the-drill-plan door', (await P1.locator('[data-build-plan-shot]').count()) === 0 && (await P1.locator('[data-shot-drilled-by-others]').count()) === 1);
  });

  await R.section('the pattern: planned at the job (2 × 3 at 20 ft), sent from its page with the pinned Send', async () => {
    planId = await P1.evaluate(async ({ jobId, stamp }) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillPlan } = await import('/src/hooks/useDrillPlans.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const id = await createDrillPlan(jobId, `S8a pattern ${stamp}`);
      await db.drillPlans.update(id, { rows: 2, cols: 3, defaultDepth: 20, updatedAt: nowISO() });
      return id;
    }, { jobId, stamp });
    await P1.goto(`${WEB}/jobs/${jobId}/drill-plan/${planId}`);
    await P1.locator('[data-plan-page]').waitFor({ timeout: 10000 });
    await P1.waitForFunction(() => /6 holes/.test(document.querySelector('[data-plan-header-line]')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
    R.ok('Draft · 6 holes · not sent', (await P1.locator('[data-plan-page]').getAttribute('data-plan-word')) === 'Draft' && /6 holes/.test(await P1.locator('[data-plan-header-line]').innerText()));
    await P1.locator('[data-plan-send]').click();
    await P1.locator('[data-send-drillers]').waitFor({ timeout: 5000 });
    await P1.locator('[data-send-drillers] label').first().waitFor({ timeout: 8000 }); // the roster is a live query
    const boxes = await P1.evaluate(() => {
      const sheet = document.querySelector('[data-send-drillers]');
      const btn = document.querySelector('[data-send-go]');
      const s = sheet.getBoundingClientRect(), b = btn.getBoundingClientRect();
      return { sheetBottom: s.bottom, btnBottom: b.bottom, inner: window.innerHeight, list: getComputedStyle(sheet.querySelector('.overflow-auto')).overflowY };
    });
    R.ok('the Send button is on screen without scrolling (pinned under the list)', boxes.btnBottom <= boxes.sheetBottom + 1 && boxes.btnBottom <= boxes.inner && boxes.list === 'auto');
    // pick the first enrolled crew member (drillers sort first); remember the name
    const rows = P1.locator('[data-send-drillers] label');
    const n = await rows.count();
    let pickedName = '';
    for (let i = 0; i < n && !pickedName; i++) {
      const cb = rows.nth(i).locator('input[type="checkbox"]');
      if (await cb.isDisabled()) continue;
      await cb.check();
      pickedName = ((await rows.nth(i).innerText()).split('\n')[0] ?? '').trim();
    }
    const sendBtn = P1.locator('[data-send-go]');
    R.ok(`picked ${pickedName || 'nobody'} · Send enabled`, Boolean(pickedName) && (await sendBtn.isEnabled()));
    await sendBtn.click();
    await P1.waitForFunction(() => document.querySelector('[data-plan-page]')?.getAttribute('data-plan-word') === 'Sent', null, { timeout: 8000 }).catch(() => undefined);
    R.ok(`sent: the pattern reads Sent, to ${pickedName.split(' ')[0]}`, (await P1.locator('[data-plan-page]').getAttribute('data-plan-word')) === 'Sent' && new RegExp(pickedName.split(' ')[0]).test(await P1.locator('[data-plan-sent]').innerText()));
    partId = await P1.evaluate(async (planId) => (await (await import('/src/db/index.ts')).db.drillLogs.filter((l) => l.drillPlanId === planId).first())?.id, planId);
    // the day's tile reads the pattern's state; the walkthrough still waits for the pattern
    await P1.goto(`${WEB}/blast-day/${dayId}`);
    await P1.locator('[data-tile="drill-plan"]').waitFor({ timeout: 10000 });
    R.ok('the day\'s Drill plan tile reads Sent', /Sent/.test(await P1.locator('[data-tile="drill-plan"]').innerText()));
    await waitForUpload(P1);
  });

  // ── §3 the driller drills 5 of 6 and signs his part; Mark accepts and makes the shot from the pattern ──
  await R.section('the driller drills 5 of 6 (one wet) and signs his part; the last driller closes the pattern short', async () => {
    logId = await P1.evaluate(async ({ partId, planId }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const { closePlanShort } = await import('/src/hooks/useDrillPlans.ts');
      const log = await db.drillLogs.get(partId);
      for (const n of ['1', '2', '3', '4', '5']) {
        const now = nowISO();
        await db.drillLogHoles.add({ id: generateId(), drillLogId: log.id, date: todayISO(), holeNumber: n, angle: 0, actualDepth: 20, subdrill: 1, conditions: n === '2' ? [{ fromFt: 8, toFt: 12, code: 'W', note: 'water' }] : [], comment: '', drillerName: log.drillerName, createdAt: now, updatedAt: now, syncStatus: 'local' });
      }
      const c = document.createElement('canvas'); c.width = 200; c.height = 80; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 200, 80); g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 40); g.lineTo(190, 40); g.stroke();
      const sig = await new Promise((r) => c.toBlob(r, 'image/png'));
      await db.drillLogs.update(log.id, { status: 'complete', completedAt: nowISO(), signatureImage: sig, updatedAt: nowISO() });
      // hole 6 is not rock — the last driller closes the pattern short with the reason
      await closePlanShort(await db.drillPlans.get(planId), 'hole 6 is not rock');
      return log.id;
    }, { partId, planId });
    const word = await P1.evaluate(async (id) => (await (await import('/src/hooks/useDrillPlans.ts')).planProgress(id))?.word, planId);
    R.ok(`five holes logged (one wet), the part signed, the pattern closed short → ${word}`, Boolean(logId) && word === 'Drilled');
  });

  await R.section('Mark: Accept the drill log, then the shot from the pattern; the timing opens on the drilled pattern', async () => {
    await P1.goto(`${WEB}/jobs/${jobId}/drill-plan/${planId}`);
    await P1.locator('[data-plan-accept]').waitFor({ timeout: 15000 });
    await P1.locator('[data-plan-accept]').click();
    await P1.locator('[data-plan-make-shot-door]').waitFor({ timeout: 30000 });
    R.ok('accepted: the pattern page offers Make the shot', (await P1.locator('[data-plan-part-status="accepted"]').count()) === 1);
    await P1.locator('[data-plan-make-shot-door]').click();
    await P1.locator('[data-plan-make-shot-sheet]').waitFor({ timeout: 5000 });
    await P1.locator(`[data-plan-make-shot-day="${dayId}"]`).click();
    await P1.waitForURL(new RegExp(`/blast-day/${dayId}`), { timeout: 15000 });
    const fromPattern = await waitFor(() => P1.evaluate(async ({ planId, dayId }) => { const { db } = await import('/src/db/index.ts'); const log = await db.blastLogs.where('blastDayId').equals(dayId).first(); const shots = log ? await db.shots.where('blastLogId').equals(log.id).toArray() : []; const s = shots.find((x) => x.drillPlanId === planId); return s ? { id: s.id, holes: s.totals.numHoles, ft: s.totals.totalDrillFootage, n: shots.length } : null; }, { planId, dayId }), 15000);
    R.ok(`the shot comes from the pattern: ${JSON.stringify(fromPattern)}`, fromPattern && fromPattern.holes === 5 && fromPattern.ft === 100);
    shotId = fromPattern.id;
    await P1.goto(`${WEB}/blast-day/${dayId}?view=hub`);
    await waitText(P1, '[data-day-continue]', /Next: /, 15000);
    R.ok(`Continue moves on to the log ("${(await P1.locator('[data-day-continue]').innerText()).trim()}")`, /fill out|check and sign/i.test(await P1.locator('[data-day-continue]').innerText()));
    // the timing opens on the DRILLED pattern by itself: 5 of 6, the wet hole marked, hole 6 greyed
    await P1.goto(`${WEB}/blast-day/${dayId}/design/${shotId}?mode=timing&from=drilling`);
    await P1.locator('[data-as-drilled]').waitFor({ timeout: 10000 });
    await P1.waitForFunction(() => document.querySelector('[data-as-drilled]')?.getAttribute('data-as-drilled') === 'current', null, { timeout: 8000 }).catch(() => undefined);
    R.ok('timing mode, laid on the drilled pattern with no button pressed', (await P1.locator('[data-diagram-mode]').getAttribute('data-diagram-mode')) === 'timing' && (await P1.locator('[data-as-drilled]').getAttribute('data-as-drilled')) === 'current' && (await P1.locator('[data-use-drilled]').count()) === 0);
    R.ok('the undrilled hole is greyed and the wet hole marked', (await P1.locator('[data-undrilled]').count()) === 1 && (await P1.locator('[data-hole-condition="W"]').count()) === 1);
    R.ok('the pattern line counts 5 of 6 · 1 wet', /5 of 6/.test(await P1.locator('[data-as-drilled]').innerText()) && /1 wet/.test(await P1.locator('[data-as-drilled]').innerText()));
    R.ok('the page is the full design (site map, compliance, column shown)', (await P1.locator('[data-show-rest]').count()) === 0);
  });

  await R.section('drilling changes after wiring → the pattern is laid on again by itself (S20)', async () => {
    // the blaster reopens the pattern, the driller drills hole 6 after all, the blaster accepts again
    await P1.evaluate(async ({ logId, planId }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const { reopenPlan } = await import('/src/hooks/useDrillPlans.ts');
      await reopenPlan(await db.drillPlans.get(planId));
      const now = nowISO();
      await db.drillLogHoles.add({ id: generateId(), drillLogId: logId, date: todayISO(), holeNumber: '6', angle: 0, actualDepth: 20, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
    }, { logId, planId });
    await P1.waitForFunction(() => document.querySelectorAll('[data-undrilled]').length === 0 && /6 of 6/.test(document.querySelector('[data-as-drilled]')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => undefined);
    R.ok('the sixth hole joins the pattern on its own — no hole greyed, the line counts 6 of 6, no button', (await P1.locator('[data-as-drilled]').getAttribute('data-as-drilled')) === 'current' && (await P1.locator('[data-undrilled]').count()) === 0 && /6 of 6/.test(await P1.locator('[data-as-drilled]').innerText()) && (await P1.locator('[data-use-drilled]').count()) === 0);
  });

  await R.section('the Start work dialog: Name first, one Job row, pinned Start', async () => {
    await P1.goto(WEB);
    await P1.locator('[data-tour="fab"]').waitFor({ timeout: 10000 });
    await P1.locator('[data-tour="fab"]').click();
    await P1.locator('[data-fab-start-day]').click(); // S20: the + is a two-row menu (Start a day · Report an incident)
    await P1.locator('[data-new-day-dialog]').waitFor({ timeout: 5000 });
    const m = await P1.evaluate(() => {
      const dlg = document.querySelector('[data-new-day-dialog]');
      const start = document.querySelector('[data-day-start]');
      const d = dlg.getBoundingClientRect(), s = start.getBoundingClientRect();
      const order = ['[data-day-name]', '[data-day-job]', '[data-day-date]'].map((q) => document.querySelector(q)?.getBoundingClientRect().top ?? -1);
      return { fits: d.bottom <= window.innerHeight + 1 && s.bottom <= window.innerHeight + 1, order, noSelects: !document.querySelector('[data-day-customer]') && !document.querySelector('[data-day-site]') };
    });
    R.ok('the dialog and its Start button fit the phone screen', m.fits);
    R.ok('Name → Job → Date, no separate customer/site selects', m.order[0] < m.order[1] && m.order[1] < m.order[2] && m.noSelects);
    await P1.locator('[data-day-job]').click();
    await P1.locator('[data-job-picker]').waitFor({ timeout: 5000 });
    R.ok('the Job row opens the picker on Customer, with search', (await P1.locator('[data-job-picker]').getAttribute('data-pick-level')) === 'customers' && (await P1.locator('[data-pick-search]').count()) === 1);
    await P1.locator('[data-choose-customer]').first().click();
    await sleep(400);
    const lvl = await P1.locator('[data-job-picker]').getAttribute('data-pick-level').catch(() => 'closed');
    R.ok(`picking a customer narrows to its sites (or auto-fills a lone site/job) → level ${lvl}`, lvl === 'sites' || lvl === 'jobs' || lvl === 'closed');
    await P1.keyboard.press('Escape');
  });

  await R.section('a driller with no plan is told to ask the blaster', async () => {
    const copy = await P1.evaluate(async () => {
      const r = await fetch('/src/components/dashboard/RoleCards.tsx');
      return (await r.text()).includes('Ask the blaster for the job');
    });
    R.ok('the empty state names the blaster as the person to ask', copy);
  });

  await R.section('a feedback screenshot opens in the in-app viewer', async () => {
    const bl = await apiLogin(page, 'blaster');
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    feedbackId = `s8a-${stamp}-${Math.random().toString(36).slice(2, 10)}`;
    const fb = await api('/feedback', { method: 'POST', body: JSON.stringify({ id: feedbackId, kind: 'bug', message: `S8a screenshot ${stamp}`, route: '/', buildId: 'harness', online: true, screenshot: png, viewport: '390×844', standalone: false, userAgent: 'harness', errorLog: [], syncLogTail: [] }) }, bl.token);
    R.ok(`feedback filed with a screenshot (${fb.status})`, fb.status === 201 || fb.status === 200);
    adminTok = (await apiLogin(page, 'mark')).token;
    const c4 = await mkCtx(browser);
    const P4 = await c4.newPage();
    await signIn(P4, 'mark');
    await skipTours(P4);
    await P4.goto(`${WEB}/admin/feedback?id=${feedbackId}`);
    await P4.locator('[data-screenshot-open]').waitFor({ timeout: 10000 });
    R.ok('the inline preview is a button, not a link to a blank tab', (await P4.locator('a[href^="data:"]').count()) === 0);
    const pv = await P4.evaluate(() => { const f = document.querySelector('[data-screenshot-preview] .overflow-auto'); const img = f?.querySelector('img'); return { frame: f?.getBoundingClientRect().width ?? 0, img: img?.getBoundingClientRect().width ?? 0, scrolls: f ? getComputedStyle(f).overflowY === 'auto' : false }; });
    R.ok(`the preview fills its frame (${Math.round(pv.img)} of ${Math.round(pv.frame)} px) and scrolls inside it`, pv.frame > 300 && Math.abs(pv.img - pv.frame) < 4 && pv.scrolls);
    await P4.locator('[data-screenshot-open]').click();
    await P4.locator('[data-screenshot-viewer]').waitFor({ timeout: 5000 });
    R.ok('the viewer opens with the full image, Fit / Actual size and Download', (await P4.locator('[data-screenshot-full]').count()) === 1 && (await P4.locator('[data-screenshot-fit]').count()) === 1 && (await P4.locator('[data-screenshot-download]').count()) === 1);
    await P4.locator('[data-screenshot-fit]').click();
    R.ok('Actual size drops the fit constraint', /max-w-none/.test((await P4.locator('[data-screenshot-full]').getAttribute('class')) ?? ''));
    await c4.close();
  });

  const removed = await lib.cleanupAsAdmin(browser, { days: [dayId] }).catch(() => -1);
  if (feedbackId && adminTok) await api(`/feedback/${feedbackId}`, { method: 'DELETE' }, adminTok).catch(() => undefined);
  R.ok(`cleanup removed ${removed} day(s) and the feedback row`, removed >= 0);
  await c1.close();
  return R.summary();
}

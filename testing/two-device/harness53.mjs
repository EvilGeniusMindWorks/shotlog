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
  let dayId, shotId, logId, feedbackId, adminTok;

  // ── §1 Mark: a new blasting day has ONE next step — build the plan ──
  const c1 = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
  const P1 = await c1.newPage();
  await R.section('a new day: Continue says "Build the drill plan" and opens plan mode', async () => {
    await signIn(P1, 'blaster');
    await skipTours(P1);
    const made = await P1.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const id = await createBlastDay(jobs[0].id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `S8a plan day ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      return { id, shotId: shot.id };
    }, stamp);
    dayId = made.id;
    shotId = made.shotId;
    await P1.goto(`${WEB}/blast-day/${dayId}`);
    await P1.locator('[data-day-continue]').waitFor({ timeout: 10000 });
    R.ok('Continue: Build the drill plan', /Build the drill plan/.test(await P1.locator('[data-day-continue]').innerText()));
    await P1.locator('[data-day-continue]').click();
    await P1.waitForURL(/\/design\/.*mode=plan/, { timeout: 8000 });
    await P1.locator('[data-plan-footer]').waitFor({ timeout: 8000 });
    R.ok('the plan page opens in PLAN mode, titled Drill plan', (await P1.locator('[data-diagram-mode]').getAttribute('data-diagram-mode')) === 'plan' && /Drill plan/.test(await P1.locator('[data-design-title]').innerText()));
    R.ok('the rest of the shot design is folded away (one tap to show)', (await P1.locator('[data-show-rest]').count()) === 1);
    R.ok('the footer says how to get holes', (await P1.locator('[data-plan-footer]').getAttribute('data-plan-footer')) === 'empty');
  });

  await R.section('with a pattern, the footer reads Plan ready and Send is pinned', async () => {
    // Lay a 2 × 3 pattern at 20 ft straight into the shot (the paint UI is covered by harness44's tour)
    await P1.evaluate(async (shotId) => {
      const { db } = await import('/src/db/index.ts');
      const { serializeDiagram, emptyDiagram } = await import('/src/lib/shotDiagram.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const shot = await db.shots.get(shotId);
      const d = { ...emptyDiagram(2, 3), plan: { defaultDepth: 20, overrides: {} } };
      await db.shots.update(shotId, { designPlan: { ...shot.designPlan, shotDiagramData: serializeDiagram(d) }, updatedAt: nowISO() });
    }, shotId);
    await P1.waitForFunction(() => document.querySelector('[data-plan-footer]')?.getAttribute('data-plan-footer') === 'ready', null, { timeout: 8000 }).catch(() => undefined);
    R.ok('Plan ready · 6 holes · not sent', (await P1.locator('[data-plan-footer]').getAttribute('data-plan-footer')) === 'ready' && /6 holes/.test(await P1.locator('[data-plan-footer]').innerText()));
    await P1.locator('[data-plan-send]').click();
    await P1.locator('[data-send-drillers]').waitFor({ timeout: 5000 });
    await P1.locator('[data-send-drillers] label').first().waitFor({ timeout: 8000 }); // the roster is a live query
    const boxes = await P1.evaluate(() => {
      const sheet = document.querySelector('[data-send-drillers]');
      const btn = [...sheet.querySelectorAll('button')].find((b) => /Send to/.test(b.textContent ?? ''));
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
    const sendBtn = P1.locator('[data-send-drillers] button', { hasText: /Send to/ });
    R.ok(`picked ${pickedName || 'nobody'} · Send enabled`, Boolean(pickedName) && (await sendBtn.isEnabled()));
    await sendBtn.click();
    await P1.waitForURL(new RegExp('/blast-day/' + dayId + '$'), { timeout: 8000 });
    await waitText(P1, '[data-day-continue]', /Drilling —/, 8000);
    const first = pickedName.split(' ')[0];
    const label = (await P1.locator('[data-day-continue]').innerText()).trim();
    R.ok(`sending returns to the day; Continue now reads "Drilling — ${first} 0/6" (${label})`, new RegExp('Drilling — .*' + first + '.* 0/6').test(label));
    await waitForUpload(P1);
  });

  // ── §3 the driller drills 5 of 6 and finishes; Mark builds the timing on it ──
  await R.section('the driller drills 5 of 6 (one wet) and marks the log complete', async () => {
    logId = await P1.evaluate(async (shotId) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const log = (await db.drillLogs.where('shotId').equals(shotId).toArray())[0];
      for (const n of ['1', '2', '3', '4', '5']) {
        const now = nowISO();
        await db.drillLogHoles.add({ id: generateId(), drillLogId: log.id, date: todayISO(), holeNumber: n, angle: 0, actualDepth: 20, subdrill: 1, conditions: n === '2' ? [{ fromFt: 8, toFt: 12, code: 'W', note: 'water' }] : [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      }
      await db.drillLogs.update(log.id, { status: 'complete', updatedAt: nowISO() });
      return log.id;
    }, shotId);
    R.ok('five holes logged (one wet), log complete', Boolean(logId));
  });

  await R.section('Mark: Continue says review & build timing; the timing opens on the drilled pattern', async () => {
    await P1.goto(`${WEB}/blast-day/${dayId}`);
    await waitText(P1, '[data-day-continue]', /Review drilling & build timing/, 15000);
    R.ok('Continue: Review drilling & build timing', /Review drilling & build timing/.test(await P1.locator('[data-day-continue]').innerText()));
    // the readiness hand-off lands here (one line in BlastDayPage); go straight to it
    await P1.goto(`${WEB}/blast-day/${dayId}/design/${shotId}?mode=timing&from=drilling`);
    await P1.locator('[data-as-drilled]').waitFor({ timeout: 10000 });
    await P1.waitForFunction(() => document.querySelector('[data-as-drilled]')?.getAttribute('data-as-drilled') === 'current', null, { timeout: 8000 }).catch(() => undefined);
    R.ok('timing mode, built from drilling', (await P1.locator('[data-diagram-mode]').getAttribute('data-diagram-mode')) === 'timing' && (await P1.locator('[data-as-drilled]').getAttribute('data-as-drilled')) === 'current');
    R.ok('the undrilled hole is greyed and the wet hole marked', (await P1.locator('[data-undrilled]').count()) === 1 && (await P1.locator('[data-hole-condition="W"]').count()) === 1);
    R.ok('the banner counts 5 of 6 · 1 wet', /5 of 6/.test(await P1.locator('[data-as-drilled]').innerText()) && /1 wet/.test(await P1.locator('[data-as-drilled]').innerText()));
    R.ok('the page is the full design (site map, compliance, column shown)', (await P1.locator('[data-show-rest]').count()) === 0);
  });

  await R.section('drilling changes after wiring → flagged, one tap to rebuild', async () => {
    await P1.evaluate(async (logId) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const now = nowISO();
      await db.drillLogHoles.add({ id: generateId(), drillLogId: logId, date: todayISO(), holeNumber: '6', angle: 0, actualDepth: 20, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
    }, logId);
    await P1.waitForFunction(() => document.querySelector('[data-as-drilled]')?.getAttribute('data-as-drilled') === 'stale', null, { timeout: 8000 }).catch(() => undefined);
    R.ok('"drilling changed since you wired" appears', (await P1.locator('[data-as-drilled]').getAttribute('data-as-drilled')) === 'stale');
    await P1.locator('[data-use-drilled]').click();
    await P1.waitForFunction(() => document.querySelector('[data-as-drilled]')?.getAttribute('data-as-drilled') === 'current', null, { timeout: 8000 }).catch(() => undefined);
    R.ok('one tap rebuilds on the drilled pattern — no hole greyed now', (await P1.locator('[data-as-drilled]').getAttribute('data-as-drilled')) === 'current' && (await P1.locator('[data-undrilled]').count()) === 0);
  });

  await R.section('the Start work dialog: Name first, one Job row, pinned Start', async () => {
    await P1.goto(WEB);
    await P1.locator('[data-tour="fab"]').waitFor({ timeout: 10000 });
    await P1.locator('[data-tour="fab"]').click();
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

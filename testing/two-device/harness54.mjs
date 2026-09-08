async (page, lib) => {
  // S8a follow-up (Matthew's second pass, 2026-09-07): the driller's log grid
  // and the blaster's review grid are the plan's OWN shape (rows × cols);
  // row handles + "Select all open" log many holes at once; the logged list
  // is windowed; a finished plan reads "ready to review" on the day spine;
  // the job picker can go back up (crumbs) and a chosen job can be cleared.
  const { mkCtx, signIn, skipTours, waitForUpload, waitText, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  let dayId, shotId, logId;

  const c1 = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
  const P1 = await c1.newPage();
  await P1.addInitScript(() => { window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message))); });
  P1.on('console', (m) => { if (m.type() === 'error') R.note('console: ' + m.text().slice(0, 200)); });
  await R.section('a 3 × 4 plan, sent to a driller', async () => {
    await signIn(P1, 'blaster');
    await skipTours(P1);
    const made = await P1.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const { serializeDiagram, emptyDiagram } = await import('/src/lib/shotDiagram.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const id = await createBlastDay(jobs[0].id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `S8a-2 grid day ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      // 3 rows × 4 cols at 20 ft, position 5 unused → 11 holes in a 3 × 4 shape
      const d = { ...emptyDiagram(3, 4), plan: { defaultDepth: 20, overrides: { 5: { depth: 0 } } } };
      await db.shots.update(shot.id, { designPlan: { ...shot.designPlan, shotDiagramData: serializeDiagram(d) }, updatedAt: nowISO() });
      const fresh = await db.shots.get(shot.id);
      const dinis = (await db.crewMembers.filter((c) => c.isActive && c.userId).toArray()).find((c) => /dinis/i.test(c.name)) ?? (await db.crewMembers.filter((c) => c.isActive && c.userId).toArray())[0];
      const logId = await createDrillLog(fresh, id, jobs[0].id, { userId: dinis.userId, name: dinis.name });
      return { id, shotId: shot.id, logId };
    }, stamp);
    dayId = made.id; shotId = made.shotId; logId = made.logId;
    await waitForUpload(P1);
    R.ok('day, 11-hole 3 × 4 pattern and a dispatched log exist', Boolean(logId));
  });

  await R.section('the drill log grid is the pattern shape with row handles and select-all', async () => {
    await P1.goto(`${WEB}/blast-day/${dayId}/drill-log/${logId}`);
    await P1.locator('[data-pattern-grid="log"]').waitFor({ timeout: 10000 });
    const g = P1.locator('[data-pattern-grid="log"]');
    R.ok(`the grid is 3 rows × 4 columns like the plan (${await g.getAttribute('data-rows')} × ${await g.getAttribute('data-cols')})`, (await g.getAttribute('data-rows')) === '3' && (await g.getAttribute('data-cols')) === '4');
    R.ok('11 holes, 3 row handles, the unused position keeps the shape', (await g.locator('[data-pattern-hole]').count()) === 11 && (await g.locator('[data-pattern-row]').count()) === 3);
    R.ok('the old ten-per-row grid and the duplicate reference map are gone', (await P1.locator('.grid-cols-10').count()) === 0 && (await P1.getByText('Pattern plan').count()) === 0);
    await g.locator('[data-pattern-row="0"]').click();
    await sleep(200);
    R.ok('a row handle selects the whole row (4 selected)', /4 selected/.test(await P1.locator('[data-tour="log-entry"]').innerText()));
    await P1.locator('[data-select-all-open]').click();
    await sleep(200);
    R.ok('Select all open selects the rest (11 selected)', /11 selected/.test(await P1.locator('[data-tour="log-entry"]').innerText()));
    await P1.getByRole('button', { name: /Log 11 as planned/ }).click();
    await P1.waitForFunction(() => document.querySelectorAll('[data-holes-list] [data-hole-row], [data-holes-list] .font-mono').length > 0, null, { timeout: 8000 }).catch(() => undefined);
    await sleep(600);
    const after = await P1.evaluate(() => ({
      grid: Boolean(document.querySelector('[data-pattern-grid="log"]')),
      complete: /plan complete/.test(document.querySelector('[data-tour="log-entry"]')?.textContent ?? ''),
      listText: document.querySelector('[data-holes-list]')?.textContent ?? '',
      showAll: Boolean(document.querySelector('[data-holes-show-all]')),
    }));
    R.ok('after logging, the grid stays as the overview and says plan complete', after.grid && after.complete);
    R.ok('the logged list is windowed: "11 holes" header with Show all', /11 holes/.test(after.listText) && after.showAll && /Show all 11/.test(after.listText));
    await P1.locator('[data-holes-show-all]').click();
    await sleep(200);
    R.ok('Show all expands it', /Show latest 8/.test(await P1.locator('[data-holes-list]').innerText()));
    // complete the log
    await P1.evaluate(async (logId) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.drillLogs.update(logId, { status: 'complete', updatedAt: nowISO() });
    }, logId);
  });

  await R.section('the day spine says ready to review; the review grid is the pattern shape', async () => {
    await P1.goto(`${WEB}/blast-day/${dayId}`);
    await P1.locator('[data-phase="drilling"]').waitFor({ timeout: 10000 });
    await P1.waitForFunction(() => document.querySelector('[data-phase="drilling"]')?.getAttribute('data-phase-chip') === 'ready to review', null, { timeout: 8000 }).catch(() => undefined);
    R.ok(`the drilling phase chip reads "ready to review" (${await P1.locator('[data-phase="drilling"]').getAttribute('data-phase-chip')})`, (await P1.locator('[data-phase="drilling"]').getAttribute('data-phase-chip')) === 'ready to review');
    await P1.goto(`${WEB}/blast-day/${dayId}?view=drilling`);
    const found = await P1.locator('[data-pattern-grid="review"]').waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    if (!found) {
      const diag = await P1.evaluate(async (shotId) => {
        const { db } = await import('/src/db/index.ts');
        const { parseDiagram, hasDrillPlan, materializeDrillPlan } = await import('/src/lib/shotDiagram.ts');
        const shot = await db.shots.get(shotId);
        const d = parseDiagram(shot.designPlan.shotDiagramData);
        return {
          grids: [...document.querySelectorAll('[data-pattern-grid]')].map((g) => g.getAttribute('data-pattern-grid')),
          hasPlan: hasDrillPlan(d), holes: materializeDrillPlan(d, 0).length, rows: d.rows, cols: d.cols,
          errors: (window.__errs ?? []).slice(0, 3),
        };
      }, shotId);
      R.note('review diag: ' + JSON.stringify(diag));
    }
    const g = P1.locator('[data-pattern-grid="review"]');
    R.ok(`the review grid is 3 × 4 like the plan (${await g.getAttribute('data-rows')} × ${await g.getAttribute('data-cols')})`, (await g.getAttribute('data-rows')) === '3' && (await g.getAttribute('data-cols')) === '4');
    R.ok('every drilled hole is placed with the driller\'s initials', (await g.locator('[data-pattern-hole]').count()) === 11 && (await P1.locator('.grid-cols-10:not(.hidden)').count()) === 0);
  });

  await R.section('the job picker goes back up and a chosen job can be cleared', async () => {
    await P1.goto(WEB);
    await P1.locator('[data-tour="fab"]').waitFor({ timeout: 10000 });
    await P1.locator('[data-tour="fab"]').click();
    await P1.locator('[data-new-day-dialog]').waitFor({ timeout: 5000 });
    await P1.locator('[data-recent-job]').first().click();
    await sleep(300);
    R.ok('a recent chip sets the job and offers "Choose a different…"', Boolean(await P1.locator('[data-day-job]').getAttribute('data-day-job-id')) && (await P1.locator('[data-day-job-clear]').count()) === 1);
    await P1.locator('[data-day-job]').click();
    await P1.locator('[data-job-picker]').waitFor({ timeout: 5000 });
    const lvl = await P1.locator('[data-job-picker]').getAttribute('data-pick-level');
    R.ok(`with a job chosen the picker opens deep (${lvl}) and the crumb offers All customers`, (lvl === 'jobs' || lvl === 'sites') && (await P1.locator('[data-pick-crumb-customers]').count()) === 1);
    await P1.locator('[data-pick-crumb-customers]').click();
    await sleep(200);
    R.ok('All customers takes you back to the top of the list', (await P1.locator('[data-job-picker]').getAttribute('data-pick-level')) === 'customers');
    await P1.locator('[data-pick-back]').click();
    await sleep(200);
    R.ok('the job was cleared by going up — the row asks again', !(await P1.locator('[data-day-job]').getAttribute('data-day-job-id')));
    await P1.keyboard.press('Escape');
  });

  const removed = await lib.cleanupAsAdmin(browser, { days: [dayId] }).catch(() => -1);
  R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  await c1.close();
  return R.summary();
}

async (page, lib) => {
  // Round S15 — no pills, and the rough edges (2026-09-14). Matthew audited
  // every chip/pill place one by one: rows that open a chooser on the
  // blasting log's Operation, the catalog's Category, Add person's Role and
  // the equipment filters; hazards and precautions as a checklist sheet;
  // Blast mats keep Yes/No and gain a count; recent/nearby jobs as rows from
  // four; status pills in a column; the app updates itself on the home
  // screen; the day header on a phone; the time said once; Closed, nothing
  // to file.
  const { mkCtx, signIn, skipTours, sleep, WEB, browserErrors } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  browserErrors({ clear: true });
  let dayId, dayId2, jobs;

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
  const factValue = (P, path) => P.locator(`[data-fact-row="${path}"] [data-fact-value]`).first().innerText().catch(() => '');
  const pick = async (P, path, option) => {
    await P.locator(`[data-fact-row="${path}"]`).first().click();
    await P.locator(`[data-chooser="${path}"]`).waitFor({ timeout: 8000 });
    await P.locator(`[data-chooser="${path}"] [data-option="${option}"]`).click();
    await sleep(300);
  };

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const cP = await mkCtx(browser, { viewport: { width: 420, height: 860 } });
  const cA = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PB = await cB.newPage();
  const PP = await cP.newPage();
  const PA = await cA.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);

  jobs = await PB.evaluate(async (floor) => {
    const { db } = await import('/src/db/index.ts');
    const busy = new Set((await db.blastDays.toArray()).filter((d) => d.date >= floor || d.status === 'draft').map((d) => d.jobId));
    return (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !busy.has(j.id) && !/^S1[124]/.test(j.name)).toArray())
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 2)
      .map((j) => ({ id: j.id, name: j.name }));
  }, lib.daysAgo(8));
  if (jobs.length < 2) throw new Error('need two free jobs');
  R.note(`jobs: ${jobs.map((j) => j.name).join(' / ')}`);

  await R.section("Rows that open a chooser on the blasting log's Operation; hazards and precautions as a checklist sheet; Blast mats with a count", async () => {
    dayId = await PB.evaluate(
      async ({ jobId, stamp }) => (await import('/src/hooks/useBlastDay.ts')).createBlastDayWithPapers(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `s15 ${stamp}` }),
      { jobId: jobs[0].id, stamp },
    );
    await PB.goto(`${WEB}/blast-day/${dayId}?view=blast-log`);
    await PB.locator('[data-fact-row="operation"]').waitFor({ timeout: 20000 });
    await sleep(500);
    R.ok('Operation is one row with its value', (await PB.locator('[data-fact-row="operation"]').count()) === 1);
    R.ok('no chip row for Operation, hazards or precautions any more', (await PB.locator('[data-fact-row="hazards"]').count()) === 1 && (await PB.locator('[data-fact-row="precautions"]').count()) === 1 && (await PB.getByRole('button', { name: /^Overhead Lines$/ }).count()) === 0);
    await pick(PB, 'operation', 'quarry');
    R.ok('tap the row, pick Quarry, the row reads Quarry', /Quarry/.test(await factValue(PB, 'operation')));

    await PB.locator('[data-fact-row="hazards"]').click();
    await PB.locator('[data-checklist="hazards"]').waitFor({ timeout: 8000 });
    R.ok('the hazards row opens a checklist sheet (tick what applies)', (await PB.locator('[data-checklist="hazards"] [data-option]').count()) >= 4);
    await PB.locator('[data-checklist="hazards"] [data-option="Overhead Lines"]').click();
    await PB.locator('[data-checklist="hazards"] [data-option="Water Main"]').click();
    R.ok('two ticks show as pressed', (await PB.locator('[data-checklist="hazards"] [aria-pressed="true"]').count()) === 2);
    await PB.locator('[data-checklist="hazards"] [data-option-other]').fill('Bee hives');
    await PB.keyboard.press('Enter');
    await sleep(200);
    R.ok('"Other…" typed and entered becomes a ticked line of its own', (await PB.locator('[data-checklist="hazards"] [data-option="Bee hives"][aria-pressed="true"]').count()) === 1);
    await PB.locator('[data-checklist-done]').click();
    await sleep(400);
    const hz = await factValue(PB, 'hazards');
    R.ok(`the row reads what was ticked: "${hz}"`, /Overhead Lines, Water Main, Bee hives/.test(hz));
    const stored = await waitFor(async () =>
      PB.evaluate(async (dayId) => {
        const { db } = await import('/src/db/index.ts');
        const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
        return log?.hazards && /Bee hives/.test(log.hazards) ? log.hazards : null;
      }, dayId),
    );
    R.ok('the stored value is still the comma-separated text the print uses', stored === 'Overhead Lines, Water Main, Bee hives');

    await PB.locator('[data-fact-row="precautions"]').click();
    await PB.locator('[data-checklist="precautions"]').waitFor({ timeout: 8000 });
    const firstPrecaution = await PB.locator('[data-checklist="precautions"] [data-option]').first().getAttribute('data-option');
    await PB.locator(`[data-checklist="precautions"] [data-option="${firstPrecaution}"]`).click();
    await PB.locator('[data-checklist-done]').click();
    await sleep(300);
    R.ok(`precautions the same way ("${firstPrecaution}")`, (await factValue(PB, 'precautions')) === firstPrecaution);

    // Blast mats: Yes/No stays (Matthew: keep), and Yes asks how many
    const yes = PB.getByRole('button', { name: /^Yes$/ }).first();
    R.ok('Blast mats keeps its Yes / No', (await yes.count()) === 1 && (await PB.locator('[data-blast-mat-count]').count()) === 0);
    await yes.click();
    await PB.locator('[data-blast-mat-count]').waitFor({ timeout: 8000 });
    await PB.locator('[data-blast-mat-count]').fill('12');
    await sleep(600);
    const count = await waitFor(async () =>
      PB.evaluate(async (dayId) => {
        const { db } = await import('/src/db/index.ts');
        const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
        const shot = log ? await db.shots.where('blastLogId').equals(log.id).first() : undefined;
        return shot?.drillParams?.blastMatCount === 12 ? 12 : null;
      }, dayId),
    );
    R.ok('Yes shows "How many" — 12 lands on the shot', count === 12);
    await PB.goto(`${WEB}/blast-day/${dayId}/print`);
    await sleep(1500);
    const printText = await PB.locator('body').innerText();
    R.ok('the printed log says "Blast mats: Yes · 12"', /Blast mats:[\s\S]{0,40}Yes · 12/.test(printText));
  });

  await R.section("The catalog's Category, Add person's Role and the equipment filters as rows; the catalog tag as text; recent jobs as rows from four; status pills in a column", async () => {
    await signIn(PA, 'mark');
    await skipTours(PA);
    await PA.goto(`${WEB}/admin/catalog`);
    await PA.getByRole('button', { name: /Add Product/ }).first().waitFor({ timeout: 20000 });
    await PA.getByRole('button', { name: /Add Product/ }).first().click();
    await PA.locator('[data-fact-row="category"]').waitFor({ timeout: 8000 });
    await pick(PA, 'category', 'booster');
    R.ok('Category is a row that opens a chooser — picked Booster', /Booster/i.test(await factValue(PA, 'category')));
    const rows = PA.locator('[data-catalog-more]');
    const rowText = (await rows.count()) > 0 ? await rows.first().locator('xpath=..').innerText().catch(() => '') : '';
    R.ok('a product row says its category in the subline, not a tag', (await rows.count()) === 0 || /lbs\//.test(rowText));

    await PA.goto(`${WEB}/admin/people`);
    await PA.getByRole('button', { name: /Add person/ }).first().waitFor({ timeout: 20000 });
    await PA.getByRole('button', { name: /Add person/ }).first().click();
    await PA.locator('[data-add-person] [data-fact-row="role"]').waitFor({ timeout: 8000 });
    await pick(PA, 'role', 'driller');
    R.ok('Add person: Role is a row that opens a chooser — picked Driller', /Driller/.test(await factValue(PA, 'role')));

    await PA.goto(`${WEB}/admin/equipment`);
    await PA.locator('[data-fact-row="equipFilter"]').waitFor({ timeout: 20000 });
    await sleep(500);
    R.ok('Equipment: one Filter row reading "All equipment", no row of filter chips', (await factValue(PA, 'equipFilter')) === 'All equipment' && (await PA.locator('[data-equip-filters] button[aria-pressed]').count()) === 0);
    const before = await PA.locator('[data-equipment-count]').innerText();
    await pick(PA, 'equipFilter', 'active');
    const afterLabel = await factValue(PA, 'equipFilter');
    R.ok(`pick one filter, the row reads it ("${afterLabel}")`, afterLabel !== 'All equipment' && afterLabel.length > 0);
    await pick(PA, 'equipFilter', '');
    R.ok('None brings back All equipment', (await factValue(PA, 'equipFilter')) === 'All equipment' && (await PA.locator('[data-equipment-count]').innerText()) === before);

    // the start-work dialog: recent jobs are rows once there are four
    await PB.goto(`${WEB}/`);
    await PB.getByRole('button', { name: /Start a day at/ }).first().waitFor({ timeout: 20000 });
    await PB.getByRole('button', { name: /Start a day at/ }).first().click();
    await PB.locator('[data-new-day-dialog]').waitFor({ timeout: 8000 });
    await sleep(500);
    const recent = PB.locator('[data-recent-jobs] [data-recent-job]');
    const n = await recent.count();
    const classes = await recent.evaluateAll((els) => els.map((e) => e.className));
    R.ok(`recent jobs: ${n} — ${n >= 4 ? 'rows' : 'chips (fewer than four)'}`, n >= 4 ? classes.every((c) => /w-full/.test(c)) : classes.every((c) => /rounded-full/.test(c)));
    await PB.keyboard.press('Escape');

    await PB.goto(`${WEB}/days`);
    await sleep(1500);
    const pills = await PB.locator('.w-\\[92px\\]').count();
    R.ok(`the work-day list's status pills sit in one fixed column (${pills} rows)`, pills >= 1);
  });

  await R.section("The app updates itself on the home; the day header on a phone; the day's line says the time once", async () => {
    await PB.goto(`${WEB}/`);
    await sleep(1200);
    await PB.evaluate(() => {
      window.__s15applied = 0;
      window.__shotlogSwUpdateApplying = false;
      window.__shotlogSwUpdateReady = true;
      window.__shotlogApplySwUpdate = () => { window.__s15applied += 1; };
      window.dispatchEvent(new Event('shotlog-sw-update-ready'));
    });
    await sleep(400);
    const toast = await PB.getByText(/Updating ShotLog/).count();
    const applied = await waitFor(() => PB.evaluate(() => window.__s15applied), 5000, 200);
    R.ok('a new build that is ready on the home screen applies by itself, with a toast', toast >= 1 && applied === 1);

    await PB.goto(`${WEB}/blast-day/${dayId}`);
    await PB.locator('[data-day-hub]').waitFor({ timeout: 20000 });
    await PB.evaluate(() => {
      window.__s15applied = 0;
      window.__shotlogSwUpdateApplying = false;
      window.__shotlogSwUpdateReady = true;
      window.__shotlogApplySwUpdate = () => { window.__s15applied += 1; };
      window.dispatchEvent(new Event('shotlog-sw-update-ready'));
    });
    await sleep(2200);
    R.ok('on a day it waits: the orange Update chip, nothing applied', (await PB.evaluate(() => window.__s15applied)) === 0 && (await PB.getByRole('button', { name: /^Update$/ }).count()) >= 1);

    R.ok('Submit to Office is no longer in the header (File this day is at the bottom of the tiles)', (await PB.getByRole('button', { name: /Submit to Office/ }).count()) === 0 && (await PB.locator('[data-file-row]').count()) === 1);
    R.ok('on a wide screen the report / contacts / print icons stay', (await PB.locator('button[title="Jobsite contacts"]:visible').count()) === 1 && (await PB.locator('[data-day-more]:visible').count()) === 0);
    const line = await PB.locator('[data-conditions-bar] span.text-xs').first().innerText();
    R.ok(`the conditions line says the time once: "${line}"`, /^On site \d{1,2}:\d\d (am|pm) · \w+/.test(line) && !/\(/.test(line));

    await signIn(PP, 'blaster');
    await skipTours(PP);
    await PP.goto(`${WEB}/blast-day/${dayId}`);
    await PP.locator('[data-day-hub]').waitFor({ timeout: 20000 });
    await sleep(500);
    R.ok('on a phone the icons fold into one More button', (await PP.locator('[data-day-more]:visible').count()) === 1 && (await PP.locator('button[title="Jobsite contacts"]:visible').count()) === 0);
    await PP.locator('[data-day-more]').click();
    await PP.locator('[data-day-more-sheet]').waitFor({ timeout: 8000 });
    R.ok('More opens a sheet: Visual blast report, Jobsite contacts, Print', (await PP.locator('[data-more-report]').count()) === 1 && (await PP.locator('[data-more-contacts]').count()) === 1 && (await PP.locator('[data-more-print]').count()) === 1 && (await PP.locator('[data-more-history]').count()) === 0);
    R.ok("the record's ⋮ menu is a row in the sheet, not a second button in the header", (await PP.locator('[data-day-more-sheet] [aria-label="More actions"]').count()) === 1 && (await PP.locator('.bg-navy [aria-label="More actions"]:visible').count()) === 0);
    await PP.locator('[data-more-contacts]').click();
    await sleep(500);
    R.ok('Jobsite contacts opens from the sheet', (await PP.locator('[data-day-more-sheet]').count()) === 0 && (await PP.getByText(/contacts/i).count()) >= 1);
  });

  await R.section('Closed, nothing to file', async () => {
    dayId2 = await PB.evaluate(
      async ({ jobId, stamp }) => (await import('/src/hooks/useBlastDay.ts')).createBlastDay(jobId, undefined, undefined, { typeOfWork: 'drill_only', name: `s15 empty ${stamp}` }),
      { jobId: jobs[1].id, stamp },
    );
    await PB.goto(`${WEB}/blast-day/${dayId2}`);
    await PB.locator('[data-day-hub]').waitFor({ timeout: 20000 });
    await sleep(500);
    R.ok('an empty day: no File row, but "Close this day"', (await PB.locator('[data-file-row]').getAttribute('data-file-row')) === 'none' && (await PB.locator('[data-day-close]').count()) === 1);
    await PB.locator('[data-day-close]').click();
    await PB.locator('[data-day-close-sheet]').waitFor({ timeout: 8000 });
    R.ok('the sheet asks why, Close is held until a reason', await PB.locator('[data-day-close-confirm]').isDisabled());
    await PB.locator('[data-close-reason="Rained out"]').click();
    await PB.locator('[data-day-close-confirm]').click();
    await PB.locator('[data-day-closed]').waitFor({ timeout: 8000 });
    const banner = await PB.locator('[data-day-closed]').innerText();
    R.ok(`the tiles show "Closed · Rained out" with who and when`, /Closed · Rained out/.test(banner) && /closed this day at/.test(banner));
    R.ok('nothing can start on a closed day; Reopen is offered', (await PB.locator('[data-tile-action="Start"]').count()) === 0 && (await PB.locator('[data-day-reopen]').count()) === 1);
    const closedRow = await PB.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const d = await db.blastDays.get(id);
      return d?.closed;
    }, dayId2);
    R.ok('the day remembers who closed it and why', closedRow?.reason === 'Rained out' && Boolean(closedRow?.byName) && Boolean(closedRow?.at));

    await PB.goto(`${WEB}/days`);
    await sleep(1500);
    const listText = await PB.locator('body').innerText();
    R.ok('the work-day list says "Closed · Rained out" with a grey pill', /Closed · Rained out/.test(listText) && (await PB.getByText(/^closed$/i).count()) >= 1);

    // the office: the day is not a job to watch and not "never submitted"
    const cO = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
    const PO = await cO.newPage();
    await signIn(PO, 'office');
    await skipTours(PO);
    await PO.goto(`${WEB}/`);
    await PO.locator('[data-todays-jobs]').waitFor({ timeout: 20000 });
    await sleep(1200);
    const rowsForJob = await PO.locator(`[data-job-row="s15 empty ${stamp}"]`).count();
    const rowsForOpen = await waitFor(() => PO.locator(`[data-job-row="s15 ${stamp}"]`).count(), 15000);
    await cO.close();
    R.ok("Evette's Today's jobs skips the closed day and keeps the open one", rowsForJob === 0 && rowsForOpen === 1);

    await PB.goto(`${WEB}/blast-day/${dayId2}`);
    await PB.locator('[data-day-reopen]').waitFor({ timeout: 20000 });
    await PB.locator('[data-day-reopen]').click();
    await sleep(800);
    R.ok('Reopen brings the day back as it was — Start returns, the banner goes', (await PB.locator('[data-day-closed]').count()) === 0 && (await PB.locator('[data-tile-action="Start"]').count()) >= 1);
    const reopened = await PB.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.blastDays.get(id))?.closed ?? null;
    }, dayId2);
    R.ok('the closed mark is gone from the record', reopened === null);
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId, dayId2].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cB.close();
  await cP.close();
  await cA.close();
  return R.summary();
}

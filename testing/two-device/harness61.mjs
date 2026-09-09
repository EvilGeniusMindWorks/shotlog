async (page, lib) => {
  // Round S9a batch 2 (2026-09-09) — the office:
  //  1. Send Back asks for the reason on the app's own sheet and requires it; the day carries a banner
  //  2. the Approvals page is gated: the office reads, is told who approves, sees no buttons
  //  3. read-only means read-only: customer fields disabled for the office, with the line
  //  4. a discarded write is told (toast), not swallowed under a green chip
  //  5. the ask sheet stands in for native confirm() everywhere (Profile › Sign out & clear)
  const { mkCtx, signIn, skipTours, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  let dayId, shotId;
  const pollDay = async (P, id, pred, ms = 25000) => {
    const until = Date.now() + ms;
    let d;
    while (Date.now() < until) {
      d = await P.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); return db.blastDays.get(id); }, id);
      if (d && pred(d)) return d;
      await sleep(500);
    }
    return d;
  };

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);

  await R.section('a blaster files a signed day (past the pre-flight\'s amber notes)', async () => {
    const made = await PB.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const id = await createBlastDay(jobs[0].id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `S9a batch2 ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const c = document.createElement('canvas'); c.width = 200; c.height = 80; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 200, 80); g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, 50); g.lineTo(180, 30); g.stroke();
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      await db.shots.update(shot.id, { signatureImage: blob, signedAt: nowISO(), updatedAt: nowISO() });
      return { id, shotId: shot.id, jobName: jobs[0].name };
    }, stamp);
    dayId = made.id; shotId = made.shotId;
    await PB.goto(`${WEB}/blast-day/${dayId}/submit`);
    await PB.locator('[data-preflight-file]').waitFor({ timeout: 15000 });
    await PB.locator('[data-preflight-file]').click();
    await PB.locator('[data-preflight-file]').click();
    await PB.waitForURL(new RegExp(`/blast-day/${dayId}$`), { timeout: 60000 });
    const st = await PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); return (await db.blastDays.get(id)).status; }, dayId);
    R.ok('the day is submitted', st === 'submitted');
    await sleep(3000);
  });

  let supervisorName = '';
  await R.section('the supervisor sends it back — the sheet needs a reason; the day records who and when', async () => {
    const cS = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
    const PS = await cS.newPage();
    await signIn(PS, 'supervisor');
    await skipTours(PS);
    supervisorName = await PS.evaluate(() => JSON.parse(localStorage.getItem('shotlog-user-info') ?? '{}').name ?? '');
    await PS.goto(`${WEB}/admin/approvals?day=${dayId}`);
    const row = PS.locator(`[data-approval-row="${dayId}"]`);
    await row.waitFor({ timeout: 15000 });
    R.ok('the queue row says "filed with N notes"', (await row.locator('[data-filed-notes]').count()) === 1);
    await row.getByRole('button', { name: /Send Back/ }).click();
    await PS.locator('[data-ask-sheet]').waitFor({ timeout: 5000 });
    R.ok(`the ask sheet opens ("${(await PS.locator('[data-ask-title]').innerText()).slice(0, 40)}…") with Send back disabled until a reason is typed`, /Send .* back\?/.test(await PS.locator('[data-ask-title]').innerText()) && (await PS.locator('[data-ask-confirm]').isDisabled()));
    await PS.locator('[data-ask-text]').fill('seismo distance missing');
    await PS.locator('[data-ask-confirm]').click();
    await PS.locator('[data-ask-sheet]').waitFor({ state: 'detached', timeout: 5000 });
    const d = await pollDay(PS, dayId, (x) => x.status === 'draft' && Boolean(x.sendBackBy));
    R.ok(`the day is back in draft with the note, sent back by ${d.sendBackBy ?? '?'} at ${d.sendBackAt ? 'a stamped time' : '?'}`, d.status === 'draft' && d.sendBackNote === 'seismo distance missing' && d.sendBackBy === supervisorName && Boolean(d.sendBackAt));
    await cS.close();
  });

  await R.section('the blaster sees why: a banner on the day and the note on the home strip', async () => {
    await pollDay(PB, dayId, (x) => x.status === 'draft' && Boolean(x.sendBackBy));
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    const banner = PB.locator('[data-sent-back-banner]');
    await banner.waitFor({ timeout: 15000 });
    const text = await banner.innerText();
    R.ok(`the day carries the banner: "${text.replace(/\s+/g, ' ').slice(0, 90)}"`, /Sent back by/.test(text) && text.includes(supervisorName) && /seismo distance missing/.test(text) && /version 2/.test(text));
    await PB.goto(`${WEB}/`);
    await PB.getByText(/Office: .seismo distance missing/).first().waitFor({ timeout: 15000 }).catch(() => undefined);
    R.ok('the home strip quotes the office', (await PB.getByText(/Office: .seismo distance missing/).count()) >= 1);
  });

  await R.section('the office · reads the queue and is told who approves; customer fields are truly read-only; a discarded write is told', async () => {
    const cO = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
    const PO = await cO.newPage();
    await signIn(PO, 'office');
    await skipTours(PO);
    await PO.goto(`${WEB}/admin/approvals`);
    await PO.locator('[data-approvals-readonly]').waitFor({ timeout: 15000 });
    const line = await PO.locator('[data-approvals-readonly]').innerText();
    R.ok(`the Approvals page says "${line.slice(0, 60)}…" and shows no Approve / Send Back`, /approve days/i.test(line) && (await PO.getByRole('button', { name: /^Approve$|Send Back/ }).count()) === 0);
    await PO.getByText(/Sent back, waiting/).first().waitFor({ timeout: 15000 }).catch(() => undefined);
    R.ok('the office home counts the day under "Sent back, waiting"', (await PO.goto(`${WEB}/`), await sleep(1500), (await PO.getByText(/Sent back, waiting/).count()) >= 1));

    const customerId = await PO.evaluate(async () => { const { db } = await import('/src/db/index.ts'); return (await db.customers.filter((c) => c.isActive !== false).first())?.id; });
    await PO.goto(`${WEB}/customers/${customerId}`);
    await PO.locator('main').waitFor({ timeout: 15000 });
    await PO.getByText(/Company & billing/).first().click().catch(() => undefined);
    await PO.locator('[data-read-only="customers"]').first().waitFor({ timeout: 15000 });
    const roLine = await PO.locator('[data-read-only-line]').first().innerText();
    const disabled = await PO.locator('[data-read-only="customers"] fieldset[disabled] input').first().isDisabled().catch(() => false);
    R.ok(`the customer card says "${roLine}" and its fields are disabled`, /can read this/.test(roLine) && /can change it/.test(roLine) && disabled);

    // a write the office may not make — forced past the UI — is discarded by the server and TOLD
    await PO.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts'); await db.customers.update(id, { phone: '(413) 555-0000', updatedAt: nowISO() }); }, customerId);
    await PO.getByText(/Not saved — .*your role can't make/).first().waitFor({ timeout: 20000 }).catch(() => undefined);
    R.ok('a toast says the change was not saved and why', (await PO.getByText(/Not saved — .*your role can't make/).count()) >= 1);
    await cO.close();
  });

  await R.section('the ask sheet stands in for native confirm() — Profile › Sign out & clear this device', async () => {
    await PB.goto(`${WEB}/profile`);
    const btn = PB.getByRole('button', { name: /Sign out & clear this device/ });
    await btn.waitFor({ timeout: 10000 });
    await btn.click();
    await PB.locator('[data-ask-sheet]').waitFor({ timeout: 5000 });
    R.ok(`a sheet asks "${await PB.locator('[data-ask-title]').innerText()}" with a red confirm`, /Sign out and clear this device\?/.test(await PB.locator('[data-ask-title]').innerText()));
    await PB.locator('[data-ask-cancel]').click();
    await PB.locator('[data-ask-sheet]').waitFor({ state: 'detached', timeout: 5000 });
    R.ok('Cancel closes it and nothing happened (still signed in)', (await PB.locator('input[type="email"]').count()) === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId] }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
    void shotId;
  });
  await cB.close();
  return R.summary();
}

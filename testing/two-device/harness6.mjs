async (page) => {
  // Work-day generalization: driller creates a drill-only day (no blast
  // log), names it, daily report works; blaster upgrades it to blasting.
  const browser = page.context().browser();
  const results = [];
  const mk = async (name) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      localStorage.setItem('harness-device', '${name}');
    `);
    const p = await ctx.newPage();
    await p.goto('http://localhost:5199');
    return p;
  };
  const login = async (p, email, pass) => {
    await p.locator('input[type="email"]').fill(email);
    await p.locator('input[type="password"]').fill(pass);
    await p.getByRole('button', { name: 'Sign in' }).click();
    await p.waitForSelector('text=Dashboard', { timeout: 15000 });
  };
  const waitDb = async (p, expr, ms = 20000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const val = await p.evaluate(async (e) => {
        try { const db = window.shotlogDb; return await eval(e); } catch { return null; }
      }, expr);
      if (val) return val;
      await p.waitForTimeout(500);
    }
    return null;
  };

  // Driller creates a NAMED drill-only work day via the real flow
  const driller = await mk('H6-DRILLER');
  await login(driller, 'dinis@test.local', 'dinis-pass-123');
  await driller.waitForTimeout(2500);
  const job = await waitDb(driller, `db.jobs.filter(j => j.isActive).first()`);
  const dayId = await driller.evaluate(async ({ jobId }) => {
    return await window.shotlogFlows.createBlastDay(jobId, undefined, undefined, {
      typeOfWork: 'drill_only',
      name: 'Pattern for lift 2',
    });
  }, { jobId: job.id });

  const state = await driller.evaluate(async (dayId) => {
    const db = window.shotlogDb;
    const day = await db.blastDays.get(dayId);
    const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
    const report = await db.dailyReports.where('blastDayId').equals(dayId).first();
    return { name: day?.name, type: day?.typeOfWork, hasLog: !!log, hasReport: !!report };
  }, dayId);
  results.push({
    scenario: 'drill-only day: named, NO blast log, daily report present',
    pass: state.name === 'Pattern for lift 2' && state.type === 'drill_only' && !state.hasLog && state.hasReport,
    detail: JSON.stringify(state),
  });

  // Page shows the name + drill-only bar (no blast log tab), daily report renders
  await driller.goto(`http://localhost:5199/blast-day/${dayId}`);
  await driller.waitForTimeout(2000);
  const body = await driller.locator('body').innerText();
  results.push({
    scenario: 'work day page: name in header, daily-report-only mode',
    pass: body.includes('Pattern for lift 2') && body.includes('daily report only') && body.includes('Work Force'),
    detail: body.includes('Pattern for lift 2') ? 'name ok' : 'name missing',
  });

  // Driller does NOT see Add Blasting Log?? — drillers can't PUT blastLogs
  const drillerSeesUpgrade = body.includes('Add Blasting Log');
  results.push({
    scenario: 'driller cannot add a blasting log (matrix-gated button)',
    pass: !drillerSeesUpgrade,
  });

  // Blaster opens the same (synced) day and upgrades it to blasting
  const blaster = await mk('H6-BLASTER');
  await login(blaster, 'blaster@test.local', 'blaster-pass-123');
  await waitDb(blaster, `db.blastDays.get('${dayId}')`);
  await blaster.goto(`http://localhost:5199/blast-day/${dayId}`);
  await blaster.waitForSelector('text=Add Blasting Log', { timeout: 10000 });
  await blaster.getByRole('button', { name: 'Add Blasting Log' }).click();
  await blaster.waitForTimeout(2000);
  const upgraded = await blaster.evaluate(async (dayId) => {
    const db = window.shotlogDb;
    const day = await db.blastDays.get(dayId);
    const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
    const shot = log ? await db.shots.where('blastLogId').equals(log.id).first() : null;
    return { type: day?.typeOfWork, hasLog: !!log, hasShot: !!shot };
  }, dayId);
  const blasterBody = await blaster.locator('body').innerText();
  results.push({
    scenario: 'blaster upgrade: blast log + shot created, type flips, tabs appear',
    pass: upgraded.hasLog && upgraded.hasShot && upgraded.type === 'drill_to_blast' && blasterBody.includes('Blast Log'),
    detail: JSON.stringify(upgraded),
  });

  // Upgrade syncs back to the driller
  const logOnDriller = await waitDb(driller, `db.blastLogs.where('blastDayId').equals('${dayId}').first()`);
  results.push({ scenario: 'upgrade syncs to driller device', pass: !!logOnDriller });

  await driller.context().close();
  await blaster.context().close();
  return results;
}

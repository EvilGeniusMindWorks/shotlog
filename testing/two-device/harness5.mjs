async (page) => {
  // Approve-workflow harness (real creation flows): admin creates the job,
  // blaster creates + submits a blast day, supervisor approves via REST,
  // blaster is locked (UI + server), supervisor reopens, blaster edits again.
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
  const waitDb = async (p, expr, ms = 25000) => {
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

  // Admin creates the job (jobs are admin-only writes)
  const admin = await mk('H5-ADMIN');
  await login(admin, 'mark@baystateblasting.com', 'dev-password-123');
  await admin.waitForTimeout(2500);
  const jobName = 'H5 Job ' + Math.random().toString(36).slice(2, 7);
  const jobId = await admin.evaluate(async (jobName) => {
    return await window.shotlogFlows.createJob({ name: jobName, customer: 'H5 QA' });
  }, jobName);

  // Blaster gets the job via sync, creates the blast day the REAL way
  const blaster = await mk('H5-BLASTER');
  await login(blaster, 'blaster@test.local', 'blaster-pass-123');
  const jobArrived = await waitDb(blaster, `db.jobs.get('${jobId}')`);
  results.push({ scenario: 'admin-created job reaches blaster', pass: !!jobArrived });

  const dayId = await blaster.evaluate(async (jobId) => {
    return await window.shotlogFlows.createBlastDay(jobId);
  }, jobId);
  const shot = await waitDb(blaster, `db.shots.filter(s => true).first().then(async s => {
    const log = await db.blastLogs.where('blastDayId').equals('${dayId}').first();
    return log ? db.shots.where('blastLogId').equals(log.id).first() : null;
  })`);
  results.push({ scenario: 'blaster created blast day via real flow', pass: !!dayId && !!shot });

  // Blaster submits from the UI
  await blaster.goto(`http://localhost:5199/blast-day/${dayId}`);
  await blaster.getByRole('button', { name: 'Submit for Review' }).click();
  await blaster.waitForTimeout(1000);

  // Supervisor: approvals queue → offline-disable check → approve
  const sup = await mk('H5-SUP');
  await login(sup, 'supervisor@test.local', 'super-pass-123');
  const seen = await waitDb(sup, `db.blastDays.get('${dayId}').then(d => d && d.status === 'submitted' ? d : null)`);
  results.push({ scenario: 'submission reaches supervisor', pass: !!seen });

  await sup.goto('http://localhost:5199/admin/approvals');
  await sup.waitForSelector('text=Waiting for review', { timeout: 10000 });
  const queueShows = (await sup.locator('body').innerText()).includes(jobName);
  results.push({ scenario: 'approvals queue lists the day with job name', pass: queueShows });

  await sup.context().setOffline(true);
  await sup.waitForTimeout(800);
  const disabledOffline = await sup.getByRole('button', { name: 'Approve' }).first().isDisabled();
  await sup.context().setOffline(false);
  await sup.waitForTimeout(1200);
  results.push({ scenario: 'offline supervisor: approve disabled', pass: disabledOffline });

  await sup.getByRole('button', { name: 'Approve' }).first().click();
  const approvedOnBlaster = await waitDb(blaster, `db.blastDays.get('${dayId}').then(d => d && d.status === 'approved' ? d : null)`);
  results.push({ scenario: 'approval propagates to blaster', pass: !!approvedOnBlaster });

  // Blaster tampers with the shot under the approved day → server discards
  await blaster.evaluate(async (shotId) => {
    await window.shotlogDb.shots.update(shotId, { blasterNotes: 'TAMPERED', updatedAt: new Date().toISOString() });
  }, shot.id);
  await blaster.waitForTimeout(6000);
  const notesAfter = await blaster.evaluate(async (shotId) => (await window.shotlogDb.shots.get(shotId))?.blasterNotes, shot.id);
  results.push({
    scenario: 'blaster edit under approved day reverts (server lock)',
    pass: notesAfter !== 'TAMPERED',
    detail: `notes=${JSON.stringify(notesAfter)}`,
  });

  // Blaster sees the locked banner; no submit/edit affordances
  await blaster.reload();
  await blaster.waitForTimeout(2000);
  const lockShown = (await blaster.locator('body').innerText()).includes('approved and locked');
  results.push({ scenario: 'blaster sees locked banner', pass: lockShown });

  // Supervisor reopens from the blast day page; blaster can edit again
  await sup.goto(`http://localhost:5199/blast-day/${dayId}`);
  await sup.getByRole('button', { name: 'Reopen' }).click();
  const reopened = await waitDb(blaster, `db.blastDays.get('${dayId}').then(d => d && d.status === 'submitted' ? d : null)`);
  await blaster.evaluate(async (shotId) => {
    await window.shotlogDb.shots.update(shotId, { blasterNotes: 'edited after reopen', updatedAt: new Date().toISOString() });
  }, shot.id);
  const editSynced = await waitDb(sup, `db.shots.get('${shot.id}').then(s => s && s.blasterNotes === 'edited after reopen' ? s : null)`);
  results.push({ scenario: 'reopen unlocks: blaster edit syncs', pass: !!reopened && !!editSynced });

  await admin.context().close();
  await blaster.context().close();
  await sup.context().close();
  return results;
}

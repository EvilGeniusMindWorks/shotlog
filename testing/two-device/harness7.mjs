async (page) => {
  // Drill-log handoff: blaster requests drilling → driller logs holes
  // (incl. wet) via the fast-entry UI → completes → blaster sees wet-hole
  // warning + accepts → driller edits revert (lock) → print renders.
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

  // Blaster: create a blasting work day, open the shot, request drilling
  const blaster = await mk('H7-BLASTER');
  await login(blaster, 'blaster@test.local', 'blaster-pass-123');
  await blaster.waitForTimeout(2500);
  const job = await waitDb(blaster, `db.jobs.filter(j => j.isActive).first()`);
  const dayId = await blaster.evaluate(async (jobId) =>
    window.shotlogFlows.createBlastDay(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: 'H7 handoff day' }),
    job.id,
  );
  await blaster.goto(`http://localhost:5199/blast-day/${dayId}`);
  await blaster.waitForSelector('text=Shot #1', { timeout: 10000 });
  await blaster.locator('text=Shot #1').first().click();
  await blaster.waitForSelector('text=Request drilling', { timeout: 10000 });
  await blaster.getByRole('button', { name: 'Request drilling' }).click();
  await blaster.waitForSelector('text=Drill Log — Shot 1', { timeout: 10000 });
  const logUrl = blaster.url();
  const logIdMatch = logUrl.match(/drill-log\/([a-f0-9-]+)/);
  const logId = logIdMatch ? logIdMatch[1] : null;
  results.push({ scenario: 'blaster requests drilling from shot', pass: !!logId });

  // Driller opens the same log after sync and logs holes via the UI
  const driller = await mk('H7-DRILLER');
  await login(driller, 'dinis@test.local', 'dinis-pass-123');
  await waitDb(driller, `db.drillLogs.get('${logId}')`);
  await driller.goto(`http://localhost:5199/blast-day/${dayId}/drill-log/${logId}`);
  await driller.waitForSelector('text=Add hole', { timeout: 10000 });

  // Hole 1: dry, default flow — set depth 31
  await driller.locator('input[inputmode="decimal"]').first().fill('31');
  await driller.getByRole('button', { name: /Add hole/ }).click();
  await driller.waitForTimeout(400);
  // Hole 2: WET
  await driller.locator('input[inputmode="decimal"]').first().fill('31');
  await driller.getByRole('button', { name: 'Water' }).click();
  await driller.getByRole('button', { name: /Add hole/ }).click();
  await driller.waitForTimeout(400);
  // Hole 3: void
  await driller.locator('input[inputmode="decimal"]').first().fill('28');
  await driller.getByRole('button', { name: 'Void' }).click();
  await driller.getByRole('button', { name: /Add hole/ }).click();
  await driller.waitForTimeout(600);
  const holeState = await driller.evaluate(async (logId) => {
    const holes = await window.shotlogDb.drillLogHoles.where('drillLogId').equals(logId).toArray();
    return {
      count: holes.length,
      numbers: holes.map((h) => h.holeNumber).sort(),
      wet: holes.filter((h) => h.conditions.some((c) => c.code === 'W')).length,
    };
  }, logId);
  results.push({
    scenario: 'driller fast-entry: 3 holes, auto-numbered, wet flagged',
    pass: holeState.count === 3 && holeState.numbers.join(',') === '1,2,3' && holeState.wet === 1,
    detail: JSON.stringify(holeState),
  });

  // Driller marks complete
  await driller.getByRole('button', { name: 'Mark Complete' }).click();
  await driller.waitForTimeout(800);

  // Blaster sees the completed log + wet warning in the shot's drilling section
  await blaster.goto(`http://localhost:5199/blast-day/${dayId}`);
  await waitDb(blaster, `db.drillLogs.get('${logId}').then(l => l && l.status === 'complete' ? l : null)`);
  await blaster.locator('text=Shot #1').first().click();
  await blaster.waitForTimeout(1500);
  const shotBody = await blaster.locator('body').innerText();
  results.push({
    scenario: 'blaster sees completed log + wet-hole flag on shot',
    pass: /complete/.test(shotBody) && /wet hole/.test(shotBody),
  });

  // Blaster accepts from the drill log page
  await blaster.goto(`http://localhost:5199/blast-day/${dayId}/drill-log/${logId}`);
  await blaster.getByRole('button', { name: 'Accept', exact: true }).click();
  const accepted = await waitDb(driller, `db.drillLogs.get('${logId}').then(l => l && l.status === 'accepted' ? l : null)`);
  results.push({ scenario: 'accept syncs to driller', pass: !!accepted });

  // Driller tamper on accepted log reverts (server lock)
  await driller.evaluate(async (logId) => {
    const hole = (await window.shotlogDb.drillLogHoles.where('drillLogId').equals(logId).toArray())[0];
    await window.shotlogDb.drillLogHoles.update(hole.id, { actualDepth: 999, updatedAt: new Date().toISOString() });
  }, logId);
  await driller.waitForTimeout(6000);
  const depths = await driller.evaluate(async (logId) =>
    (await window.shotlogDb.drillLogHoles.where('drillLogId').equals(logId).toArray()).map((h) => h.actualDepth),
    logId,
  );
  results.push({
    scenario: 'driller edit on accepted log reverts (server lock)',
    pass: !depths.includes(999),
    detail: `depths=${JSON.stringify(depths)}`,
  });

  // Print page renders with holes + legend
  await blaster.goto(`http://localhost:5199/blast-day/${dayId}/drill-log/${logId}/print`);
  await blaster.waitForTimeout(1500);
  const printBody = await blaster.locator('body').innerText();
  results.push({
    scenario: 'print drill log renders (holes, totals, legend, acceptance)',
    pass: printBody.includes('Drill Log') && printBody.includes('Soft Rock') && printBody.includes('Accepted by'),
    detail: printBody.slice(0, 80).replace(/\n/g, ' | '),
  });

  await blaster.context().close();
  await driller.context().close();
  return results;
}

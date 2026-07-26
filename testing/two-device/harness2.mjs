async (page) => {
  const browser = page.context().browser();
  const results = [];

  // Neutralize the stale original tab (old session, dead company id) so it
  // can't pollute records again
  await page.goto('about:blank');

  // Re-find devices A and B by their localStorage marker
  const devices = {};
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (p.url() === 'about:blank') continue;
      const name = await p.evaluate(() => localStorage.getItem('harness-device')).catch(() => null);
      if (name) devices[name] = p;
    }
  }
  const a = devices['A'];
  const b = devices['B'];
  if (!a || !b) return { error: 'devices missing', found: Object.keys(devices) };

  // Reload both so the seed re-runs (their earlier optimistic seed rows
  // were dropped by the collision bug) and fresh code is loaded
  await a.reload();
  await b.reload();
  await a.waitForSelector('text=Dashboard', { timeout: 15000 });
  await b.waitForSelector('text=Dashboard', { timeout: 15000 });

  const waitDb = async (p, expr, ms = 25000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const val = await p.evaluate(async (e) => {
        const db = window.shotlogDb;
        if (!db) return null;
        try { return await eval(e); } catch { return null; }
      }, expr);
      if (val) return val;
      await p.waitForTimeout(400);
    }
    return null;
  };

  // ── S3a: seed collision fix — both devices converge on 59 products ──
  const prodA = await waitDb(a, `db.productCatalog.count().then(c => c === 59 ? c : null)`, 30000);
  const prodB = await waitDb(b, `db.productCatalog.count().then(c => c === 59 ? c : null)`, 30000);
  results.push({
    scenario: 'S3a product seed converges (59 each, no dupes)',
    pass: prodA === 59 && prodB === 59,
    detail: `A=${prodA}, B=${prodB}`,
  });

  // ── S3b: same-record simultaneous edit — both converge to ONE value ──
  const jobId = (await waitDb(a, `db.jobs.filter(j => j.name === 'Harness Job').first()`)).id;
  await Promise.all([
    a.evaluate(async (id) => { await window.shotlogDb.jobs.update(id, { kFactor: 100, updatedAt: new Date().toISOString() }); }, jobId),
    b.evaluate(async (id) => { await window.shotlogDb.jobs.update(id, { kFactor: 250, updatedAt: new Date().toISOString() }); }, jobId),
  ]);
  await a.waitForTimeout(5000);
  const kA = await a.evaluate(async (id) => (await window.shotlogDb.jobs.get(id)).kFactor, jobId);
  const kB = await b.evaluate(async (id) => (await window.shotlogDb.jobs.get(id)).kFactor, jobId);
  results.push({
    scenario: 'S3b same-record simultaneous edit converges',
    pass: kA === kB && (kA === 100 || kA === 250),
    detail: `A=${kA}, B=${kB}`,
  });

  // ── S3c: sequential same-record edit — later writer wins everywhere ──
  await a.evaluate(async (id) => { await window.shotlogDb.jobs.update(id, { kFactor: 111, updatedAt: new Date().toISOString() }); }, jobId);
  await a.waitForTimeout(3000);
  await b.evaluate(async (id) => { await window.shotlogDb.jobs.update(id, { kFactor: 222, updatedAt: new Date().toISOString() }); }, jobId);
  const seqA = await waitDb(a, `db.jobs.get('${jobId}').then(j => j.kFactor === 222 ? 222 : null)`);
  results.push({
    scenario: 'S3c sequential edit: later writer wins on both',
    pass: seqA === 222,
    detail: `A sees kFactor=${seqA ?? 'not 222'}`,
  });

  // ── S4: offline window ───────────────────────────────────────────────
  await a.context().setOffline(true);
  await a.evaluate(async () => {
    const db = window.shotlogDb;
    const now = () => new Date().toISOString();
    for (const n of ['Off-1', 'Off-2', 'Off-3']) {
      await db.crewMembers.put({ id: crypto.randomUUID(), name: n, licenseNumber: '', licenseState: '', isActive: true, createdAt: now(), updatedAt: now(), syncStatus: 'local' });
    }
  });
  await a.waitForTimeout(2500);
  const bodyA = await a.locator('body').innerText();
  const indicatorShowsWaiting = /3 change(s)? waiting/.test(bodyA) || /waiting/.test(bodyA);
  // B keeps working while A is dark
  await b.evaluate(async () => {
    const now = () => new Date().toISOString();
    await window.shotlogDb.crewMembers.put({ id: crypto.randomUUID(), name: 'Carol-during-A-offline', licenseNumber: '', licenseState: '', isActive: true, createdAt: now(), updatedAt: now(), syncStatus: 'local' });
  });
  const offNotOnB = await b.evaluate(async () => (await window.shotlogDb.crewMembers.filter((c) => c.name.startsWith('Off-')).count()));
  await a.context().setOffline(false);
  const offOnB = await waitDb(b, `db.crewMembers.filter(c => c.name.startsWith('Off-')).count().then(c => c === 3 ? 3 : null)`);
  const carolOnA = await waitDb(a, `db.crewMembers.filter(c => c.name === 'Carol-during-A-offline').first()`);
  const drainedA = await waitDb(a, `(async () => { const m = await import('/src/db/powersync/client.ts'); const r = await m.getPowerSync().getAll('SELECT COUNT(*) c FROM ps_crud'); return r[0].c === 0 ? 'drained' : null; })()`);
  results.push({
    scenario: 'S4 offline window: queue, truthful indicator, drain, converge',
    pass: indicatorShowsWaiting && offNotOnB === 0 && offOnB === 3 && !!carolOnA && drainedA === 'drained',
    detail: `indicator waiting=${indicatorShowsWaiting}, B saw 0 while offline=${offNotOnB === 0}, B got 3 after=${offOnB}, A got Carol=${!!carolOnA}, A drained=${drainedA === 'drained'}`,
  });

  return results;
}

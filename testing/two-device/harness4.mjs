async (page) => {
  // Role-enforcement harness: a BLASTER device force-writes forbidden
  // tables. Expect: upload 200 with discards (queue never wedges), the
  // optimistic local rows revert at the next checkpoint, and legitimate
  // field writes queued AFTER the forbidden ones still go through.
  const browser = page.context().browser();
  const results = [];

  const ctx = await browser.newContext();
  await ctx.addInitScript(`
    localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
    localStorage.setItem('shotlog-pin', 'harness-preseeded');
    localStorage.setItem('shotlog-last-active', String(Date.now()));
    localStorage.setItem('harness-device', 'BLASTER');
  `);
  const p = await ctx.newPage();
  const uploadResponses = [];
  p.on('response', (r) => {
    if (r.url().endsWith('/powersync/upload')) {
      r.json().then((j) => uploadResponses.push({ status: r.status(), ...j })).catch(() => {});
    }
  });
  await p.goto('http://localhost:5199');
  await p.locator('input[type="email"]').fill('blaster@test.local');
  await p.locator('input[type="password"]').fill('blaster-pass-123');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.waitForSelector('text=Dashboard', { timeout: 15000 });
  await p.waitForTimeout(4000); // let initial sync + seed-drain settle

  // Force forbidden writes THEN a legitimate write, all through the facade
  const ids = await p.evaluate(async () => {
    const db = window.shotlogDb;
    const now = new Date().toISOString();
    const forbidden1 = 'harness4-product';
    const forbidden2 = 'harness4-job';
    const legit = 'harness4-blastday';
    await db.productCatalog.put({ id: forbidden1, manufacturer: 'Evil', productName: 'Not Allowed', fullDescription: '', category: 'cartridge', weightMultiplier: 1, unitType: 'stick', sizeDescription: '', unitsPerCase: null, isActive: true, sortOrder: 999, createdAt: now, updatedAt: now, syncStatus: 'local' });
    await db.jobs.put({ id: forbidden2, name: 'Forbidden Job', customer: 'X', address: '', city: '', state: '', operation: 'construction', typeOfRock: '', typeOfTerrain: '', defaultHazards: '', defaultPrecautions: '', kFactor: 180, isActive: true, createdAt: now, updatedAt: now, syncStatus: 'local' });
    await db.blastDays.put({ id: legit, date: '2026-07-26', jobId: 'none', status: 'draft', conditions: {}, createdAt: now, updatedAt: now, syncStatus: 'local' });
    return { forbidden1, forbidden2, legit };
  });

  // Wait for queue to drain fully (proves no wedge)
  const deadline = Date.now() + 30000;
  let queued = -1;
  while (Date.now() < deadline) {
    queued = await p.evaluate(async () => {
      const m = await import('/src/db/powersync/client.ts');
      const r = await m.getPowerSync().getAll('SELECT COUNT(*) c FROM ps_crud');
      return r[0].c;
    });
    if (queued === 0) break;
    await p.waitForTimeout(500);
  }
  results.push({ scenario: 'queue drains despite forbidden ops (no wedge)', pass: queued === 0, detail: `queued=${queued}` });

  const discardTotal = uploadResponses.reduce((s, r) => s + (r.discarded ?? 0), 0);
  results.push({
    scenario: 'server reported discards with 200s (never 500)',
    pass: discardTotal >= 2 && uploadResponses.every((r) => r.status === 200),
    detail: `responses=${JSON.stringify(uploadResponses.map((r) => ({ s: r.status, d: r.discarded })))}`,
  });

  // After next checkpoint the forbidden rows must revert locally; legit persists
  await p.waitForTimeout(5000);
  const finalState = await p.evaluate(async (ids) => {
    const db = window.shotlogDb;
    return {
      product: await db.productCatalog.get(ids.forbidden1),
      job: await db.jobs.get(ids.forbidden2),
      day: await db.blastDays.get(ids.legit),
    };
  }, ids);
  results.push({
    scenario: 'forbidden writes reverted locally; legit blastDay survived',
    pass: !finalState.product && !finalState.job && !!finalState.day,
    detail: `product=${!!finalState.product} job=${!!finalState.job} day=${!!finalState.day}`,
  });

  await ctx.close();
  return results;
}

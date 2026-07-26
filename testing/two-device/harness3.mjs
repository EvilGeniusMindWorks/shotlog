async (page) => {
  const browser = page.context().browser();
  const results = [];
  const BASE = 'http://localhost:5199';

  const devices = {};
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (p.url() === 'about:blank') continue;
      const name = await p.evaluate(() => localStorage.getItem('harness-device')).catch(() => null);
      if (name) devices[name] = p;
    }
  }
  let a = devices['A'];
  const b = devices['B'];
  if (!a || !b) return { error: 'devices missing', found: Object.keys(devices) };

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

  // ── S5: kill mid-sync — offline write, page killed, queue survives ──
  const ctxA = a.context();
  await ctxA.setOffline(true);
  await a.evaluate(async () => {
    const now = () => new Date().toISOString();
    await window.shotlogDb.crewMembers.put({ id: crypto.randomUUID(), name: 'Dave-killed-mid-sync', licenseNumber: '', licenseState: '', isActive: true, createdAt: now(), updatedAt: now(), syncStatus: 'local' });
  });
  await a.close(); // kill the tab with the write still queued (while offline)
  await ctxA.setOffline(false); // signal returns AFTER the death
  const a2 = await ctxA.newPage();
  await a2.goto(BASE);
  await a2.waitForSelector('text=Dashboard', { timeout: 15000 });
  const daveLocal = await waitDb(a2, `db.crewMembers.filter(c => c.name === 'Dave-killed-mid-sync').first()`, 10000);
  const daveOnB = await waitDb(b, `db.crewMembers.filter(c => c.name === 'Dave-killed-mid-sync').first()`);
  results.push({
    scenario: 'S5 kill-mid-sync: queued write survives page death, still delivers',
    pass: !!daveLocal && !!daveOnB,
    detail: `survived locally=${!!daveLocal}, reached B=${!!daveOnB}`,
  });
  a = a2;

  // ── S6: fresh device with clock 3 DAYS BEHIND — edits still win ─────
  const ctxC = await browser.newContext();
  await ctxC.addInitScript(`
    localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
    localStorage.setItem('shotlog-pin', 'harness-preseeded');
    localStorage.setItem('shotlog-last-active', String(Date.now()));
    localStorage.setItem('harness-device', 'C');
    (() => {
      const RealDate = Date;
      const SKEW = -3 * 86400000;
      const Skewed = new Proxy(RealDate, {
        construct(target, args) {
          return args.length ? new target(...args) : new target(RealDate.now() + SKEW);
        },
        apply() { return new RealDate(RealDate.now() + SKEW).toString(); },
        get(target, prop) {
          if (prop === 'now') return () => RealDate.now() + SKEW;
          return Reflect.get(target, prop);
        },
      });
      window.Date = Skewed;
    })();
  `);
  const c = await ctxC.newPage();
  await c.goto(BASE);
  await c.locator('input[type="email"]').fill('mark@baystateblasting.com');
  await c.locator('input[type="password"]').fill('dev-password-123');
  await c.getByRole('button', { name: 'Sign in' }).click();
  await c.waitForSelector('text=Dashboard', { timeout: 15000 });
  const jobOnC = await waitDb(c, `db.jobs.filter(j => j.name === 'Harness Job').first()`, 30000);
  // C (3 days "in the past") renames the job AFTER everyone else's edits —
  // the old LWW engine would have discarded this as stale
  await c.evaluate(async (id) => {
    await window.shotlogDb.jobs.update(id, { name: 'Renamed by skewed C', updatedAt: new Date().toISOString() });
  }, jobOnC.id);
  const renamedOnA = await waitDb(a, `db.jobs.filter(j => j.name === 'Renamed by skewed C').first()`);
  const renamedOnB = await waitDb(b, `db.jobs.filter(j => j.name === 'Renamed by skewed C').first()`);
  const stampOnB = renamedOnB ? renamedOnB.updatedAt : null;
  results.push({
    scenario: 'S6 skewed clock (-3d): past-dated edit still wins everywhere',
    pass: !!renamedOnA && !!renamedOnB,
    detail: `A=${!!renamedOnA}, B=${!!renamedOnB}, payload stamp (3d old, ignored)=${stampOnB}`,
  });

  // ── Final: full dataset comparison across all three devices ─────────
  const snap = async (p) =>
    p.evaluate(async () => {
      const db = window.shotlogDb;
      const jobs = (await db.jobs.toArray()).map((j) => `${j.id}|${j.name}|${j.kFactor}`).sort();
      const crew = (await db.crewMembers.toArray()).map((c) => `${c.id}|${c.name}`).sort();
      const products = await db.productCatalog.count();
      return JSON.stringify({ jobs, crew, products });
    });
  const [sa, sb, sc] = [await snap(a), await snap(b), await snap(c)];
  results.push({
    scenario: 'FINAL all three devices hold identical data',
    pass: sa === sb && sb === sc,
    detail: sa === sb && sb === sc ? `identical (${JSON.parse(sa).crew.length} crew, ${JSON.parse(sa).products} products)` : `A=${sa}\nB=${sb}\nC=${sc}`,
  });
  return { results, deviceSnapshot: JSON.parse(sa) };
}

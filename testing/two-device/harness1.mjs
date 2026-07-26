// Two-device harness, part 1: device setup + login, fresh-device
// hydration, interleaved different-record writes.
async (page) => {
  const browser = page.context().browser();
  const BASE = 'http://localhost:5199';
  const results = [];

  const seedScript = (name) => `
    localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
    localStorage.setItem('shotlog-pin', 'harness-preseeded');
    localStorage.setItem('shotlog-last-active', String(Date.now()));
    localStorage.setItem('harness-device', '${name}');
  `;

  const newDevice = async (name) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(seedScript(name));
    const p = await ctx.newPage();
    await p.goto(BASE);
    return p;
  };

  const login = async (p) => {
    await p.locator('input[type="email"]').fill('mark@baystateblasting.com');
    await p.locator('input[type="password"]').fill('dev-password-123');
    await p.getByRole('button', { name: 'Sign in' }).click();
    await p.waitForSelector('text=Dashboard', { timeout: 15000 });
  };

  // Poll an expression against window.shotlogDb until truthy or deadline
  const waitDb = async (p, expr, ms = 20000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const val = await p.evaluate(async (e) => {
        const db = window.shotlogDb;
        if (!db) return null;
        try {
          return await eval(e);
        } catch {
          return null;
        }
      }, expr);
      if (val) return val;
      await p.waitForTimeout(400);
    }
    return null;
  };

  // ── Device A: login + create a job through the real UI ──────────────
  const a = await newDevice('A');
  await login(a);
  await a.getByRole('link', { name: 'Jobs' }).click();
  await a.getByRole('button', { name: /New Job/i }).click();
  await a.locator('input').nth(0).fill('Harness Job');
  await a.locator('input').nth(1).fill('Baystate QA');
  await a.getByRole('button', { name: 'Create Job' }).click();
  const jobOnA = await waitDb(a, `db.jobs.filter(j => j.name === 'Harness Job').first()`);
  results.push({ scenario: 'A creates job via UI', pass: !!jobOnA });

  // ── S1: fresh device B hydrates A's data ────────────────────────────
  const b = await newDevice('B');
  await login(b);
  const jobOnB = await waitDb(b, `db.jobs.filter(j => j.name === 'Harness Job').first()`);
  const productsOnB = await waitDb(
    b,
    `db.productCatalog.count().then(c => c >= 59 ? c : null)`,
  );
  results.push({
    scenario: 'S1 fresh-device hydration',
    pass: !!jobOnB,
    detail: `job ${jobOnB ? 'arrived' : 'MISSING'}, products=${productsOnB}`,
  });

  // ── S2: interleaved writes to different records ─────────────────────
  const mk = (name) =>
    `db.crewMembers.put({ id: crypto.randomUUID(), name: '${name}', licenseNumber: '',
       licenseState: '', isActive: true, createdAt: new Date().toISOString(),
       updatedAt: new Date().toISOString(), syncStatus: 'local' })`;
  await Promise.all([
    a.evaluate(async (e) => { const db = window.shotlogDb; await eval(e); }, mk('Alice-from-A')),
    b.evaluate(async (e) => { const db = window.shotlogDb; await eval(e); }, mk('Bob-from-B')),
  ]);
  const bobOnA = await waitDb(a, `db.crewMembers.filter(c => c.name === 'Bob-from-B').first()`);
  const aliceOnB = await waitDb(b, `db.crewMembers.filter(c => c.name === 'Alice-from-A').first()`);
  results.push({
    scenario: 'S2 interleaved different records',
    pass: !!bobOnA && !!aliceOnB,
    detail: `A sees Bob: ${!!bobOnA}, B sees Alice: ${!!aliceOnB}`,
  });

  return results;
}
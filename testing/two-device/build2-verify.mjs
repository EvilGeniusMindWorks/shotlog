async (page) => {
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

  const admin = await mk('B2-ADMIN');
  await login(admin, 'mark@baystateblasting.com', 'dev-password-123');
  const blaster = await mk('B2-BLASTER');
  await login(blaster, 'blaster@test.local', 'blaster-pass-123');

  // Manufacturers synced + tabs render
  const mfrs = await waitDb(admin, `db.manufacturers.count().then(c => c >= 4 ? c : null)`);
  await admin.goto('http://localhost:5199/admin/catalog');
  await admin.waitForTimeout(2000);
  await admin.locator('input[type=checkbox]').first().check(); // show retired tabs
  const body = await admin.locator('body').innerText();
  results.push({
    scenario: 'manufacturer tabs render (backfilled entities)',
    pass: mfrs >= 4 && body.includes('Austin Powder'),
    detail: `manufacturers=${mfrs}`,
  });

  // Add a manufacturer, then retire it — line vanishes from blaster picker data
  await admin.getByRole('button', { name: 'manufacturer' }).click();
  await admin.locator('div.rounded-xl', { hasText: 'New manufacturer name' }).locator('input:not([type=checkbox])').first().fill('B2R Explosives');
  await admin.getByRole('button', { name: 'Add', exact: true }).click();
  await admin.waitForTimeout(1200);
  await admin.getByRole('button', { name: 'B2R Explosives' }).click();
  await admin.getByRole('button', { name: 'Add Product' }).click();
  const form = admin.locator('div.rounded-lg.bg-gray-50');
  await form.locator('input').nth(0).fill('B2R Test Stick');
  await form.locator('input[type="number"]').fill('1.5');
  await admin.getByRole('button', { name: 'Save', exact: true }).click();
  await admin.waitForTimeout(1500);
  const onBlaster = await waitDb(blaster, `db.productCatalog.filter(p => p.productName === 'B2R Test Stick').first()`);
  results.push({ scenario: 'new manufacturer + product created via tab, syncs', pass: !!onBlaster });

  // Retire the manufacturer → blaster's picker excludes its products
  await admin.getByRole('button', { name: 'Retire', exact: true }).click();
  const retiredSynced = await waitDb(blaster, `db.manufacturers.filter(m => m.name === 'B2R Explosives' && !m.isActive).first()`);
  const pickerExcludes = await blaster.evaluate(async () => {
    const db = window.shotlogDb;
    const retired = new Set((await db.manufacturers.filter((m) => !m.isActive).toArray()).map((m) => m.id));
    const visible = await db.productCatalog
      .filter((p) => p.isActive && !(p.manufacturerId && retired.has(p.manufacturerId)))
      .toArray();
    return !visible.some((p) => p.productName === 'B2R Test Stick');
  });
  results.push({
    scenario: 'retired manufacturer hides its line from picker logic',
    pass: !!retiredSynced && pickerExcludes,
  });

  // Rename cascade: reactivate, rename, product rows follow
  await admin.getByRole('button', { name: 'Reactivate', exact: true }).first().click();
  await admin.waitForTimeout(800);
  await admin.getByRole('button', { name: 'Rename', exact: true }).click();
  const renameBox = admin.locator('div.rounded-xl', { hasText: 'Rename' }).locator('input');
  await renameBox.fill('B2R Boom Industries');
  await admin.getByRole('button', { name: 'Rename line' }).click();
  const renamed = await waitDb(blaster, `db.productCatalog.filter(p => p.productName === 'B2R Test Stick' && p.manufacturer === 'B2R Boom Industries').first()`);
  results.push({ scenario: 'rename cascades onto product rows and syncs', pass: !!renamed });

  // Bulk deactivate line
  await admin.getByRole('button', { name: 'Deactivate line' }).click();
  const lineOff = await waitDb(blaster, `db.productCatalog.filter(p => p.productName === 'B2R Test Stick' && !p.isActive).first()`);
  results.push({ scenario: 'bulk deactivate line syncs', pass: !!lineOff });

  await admin.context().close();
  await blaster.context().close();
  return results;
}

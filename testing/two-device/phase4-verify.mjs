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

  // Fresh admin device: NO client seed anymore — catalog must arrive via sync
  const admin = await mk('P4-ADMIN');
  await login(admin, 'mark@baystateblasting.com', 'dev-password-123');
  const catalogCount = await waitDb(admin, `db.productCatalog.count().then(c => c >= 59 ? c : null)`, 30000);
  results.push({
    scenario: 'fresh device: catalog arrives via sync only (client seed gone)',
    pass: catalogCount >= 59,
    detail: `count=${catalogCount}`,
  });

  // Admin adds a product from the catalog page
  await admin.goto('http://localhost:5199/admin/catalog');
  await admin.waitForTimeout(1500);
  await admin.getByRole('button', { name: 'Add Product' }).click();
  await admin.locator('input[list="catalog-manufacturers"]').fill('Test Mfr');
  const form = admin.locator('div.rounded-lg.bg-gray-50');
  await form.locator('input').nth(1).fill('P4 Verify Stick');
  await form.locator('input[type="number"]').fill('2.5');
  await admin.getByRole('button', { name: 'Save', exact: true }).click();
  await admin.waitForTimeout(2500);
  const added = (await admin.locator('body').innerText()).includes('P4 Verify Stick');
  results.push({ scenario: 'admin adds product via REST', pass: added });

  // The new product reaches a second (blaster) device's picker data
  const blaster = await mk('P4-BLASTER');
  await login(blaster, 'blaster@test.local', 'blaster-pass-123');
  const onBlaster = await waitDb(blaster, `db.productCatalog.filter(p => p.productName === 'P4 Verify Stick').first()`);
  results.push({ scenario: 'new product syncs to blaster device', pass: !!onBlaster });

  // Deactivate it — disappears from active filter everywhere
  const row = admin.locator('div.p-3', { hasText: 'P4 Verify Stick' }).first();
  await row.getByRole('button', { name: 'Deactivate' }).click();
  const deactivated = await waitDb(blaster, `db.productCatalog.filter(p => p.productName === 'P4 Verify Stick').first().then(p => p && !p.isActive ? p : null)`);
  results.push({ scenario: 'deactivation syncs to blaster', pass: !!deactivated });

  await admin.context().close();
  await blaster.context().close();
  return results;
}

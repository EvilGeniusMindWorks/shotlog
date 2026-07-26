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

  // Admin sees the Admin nav and the users page
  const a = await mk('P2-ADMIN');
  await login(a, 'mark@baystateblasting.com', 'dev-password-123');
  const hasAdminNav = await a.getByRole('link', { name: 'Admin' }).first().isVisible().catch(() => false);
  await a.goto('http://localhost:5199/admin/users');
  await a.waitForTimeout(1500);
  let body = await a.locator('body').innerText();
  results.push({
    scenario: 'admin: nav item + users list renders',
    pass: hasAdminNav && body.includes('Barry Blaster') && body.includes('mark@baystateblasting.com'),
    detail: `nav=${hasAdminNav}`,
  });

  // Edit Barry: change role to driller (inline form, REST PATCH)
  const barryRow = a.locator('div.p-3', { hasText: 'Barry Blaster' }).first();
  await barryRow.getByTitle('Edit').click();
  await a.getByRole('button', { name: 'Driller' }).click();
  await a.getByRole('button', { name: 'Save', exact: true }).click();
  await a.waitForTimeout(1500);
  body = await a.locator('body').innerText();
  const roleChanged = /Barry Blaster[\s\S]{0,200}?driller/.test(body);
  results.push({ scenario: 'admin edits role via inline form (PATCH /users/:id)', pass: roleChanged });

  // Barry's session should now be revoked: his refresh token fails.
  // (His running access token would still work up to 1h — documented.)

  // Change role back to blaster for later phases
  await barryRow.getByTitle('Edit').click();
  await a.getByRole('button', { name: 'Blaster', exact: true }).click();
  await a.getByRole('button', { name: 'Save', exact: true }).click();
  await a.waitForTimeout(1000);

  // Non-admin cannot reach /admin
  const b = await mk('P2-BLASTER');
  await login(b, 'blaster@test.local', 'blaster-pass-123');
  const blasterHasAdminNav = await b.getByRole('link', { name: 'Admin' }).first().isVisible().catch(() => false);
  await b.goto('http://localhost:5199/admin/users');
  await b.waitForTimeout(1200);
  const redirected = !b.url().includes('/admin');
  results.push({
    scenario: 'blaster: no Admin nav, /admin redirects away',
    pass: !blasterHasAdminNav && redirected,
    detail: `nav=${blasterHasAdminNav} url=${b.url()}`,
  });

  await a.context().close();
  await b.context().close();
  return results;
}

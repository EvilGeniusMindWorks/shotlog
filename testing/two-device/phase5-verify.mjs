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

  // Admin fills company details on /admin/company
  const admin = await mk('P5-ADMIN');
  await login(admin, 'mark@baystateblasting.com', 'dev-password-123');
  await admin.goto('http://localhost:5199/admin/company');
  await admin.waitForSelector('text=Company details', { timeout: 10000 });
  const section = admin.locator('section', { hasText: 'Company details' });
  const inputs = section.locator('input');
  await inputs.nth(0).fill('Baystate Blasting, Inc.');
  await inputs.nth(1).fill('D-778899'); // dealer number
  await admin.getByRole('button', { name: 'Save company details' }).click();
  await admin.waitForTimeout(1500);
  const savedMsg = (await admin.locator('body').innerText()).includes('Saved');
  results.push({ scenario: 'admin saves company settings via REST', pass: savedMsg });

  // Doc syncs to a blaster device
  const blaster = await mk('P5-BLASTER');
  await login(blaster, 'blaster@test.local', 'blaster-pass-123');
  const doc = await waitDb(blaster, `db.companySettings.get('companySettings-singleton').then(d => d && d.dealerNumber === 'D-778899' ? d : null)`);
  results.push({ scenario: 'companySettings doc syncs to field device', pass: !!doc });

  // Crew↔user linking: link Alice-from-A to Barry's account
  const users = await admin.evaluate(async () => {
    const m = await import('/src/lib/session.ts');
    const res = await m.authedFetch('/users');
    return (await res.json()).users;
  });
  const barry = users.find((u) => u.email === 'blaster@test.local');
  const crewOnAdmin = await waitDb(admin, `db.crewMembers.filter(c => c.isActive).first()`);
  if (crewOnAdmin && barry) {
    await admin.reload();
    await admin.waitForSelector('text=Crew roster', { timeout: 10000 });
    const select = admin.locator('section', { hasText: 'Crew roster' }).locator('select').first();
    await select.selectOption(barry.id);
    const linked = await waitDb(blaster, `db.crewMembers.get('${crewOnAdmin.id}').then(c => c && c.userId === '${barry.id}' ? c : null)`);
    results.push({ scenario: 'crew member linked to account, link syncs', pass: !!linked });
  } else {
    results.push({ scenario: 'crew member linked to account, link syncs', pass: false, detail: 'no crew or user found' });
  }

  await admin.context().close();
  await blaster.context().close();
  return results;
}

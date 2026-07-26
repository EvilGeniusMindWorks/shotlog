async (page) => {
  const browser = page.context().browser();
  const results = [];
  const mk = async (name, seed = true) => {
    const ctx = await browser.newContext();
    if (seed) {
      await ctx.addInitScript(`
        localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
        localStorage.setItem('shotlog-pin', 'x');
        localStorage.setItem('shotlog-last-active', String(Date.now()));
        localStorage.setItem('harness-device', '${name}');
      `);
    } else {
      await ctx.addInitScript(`localStorage.setItem('shotlog-server-url', 'http://localhost:4000');`);
    }
    const p = await ctx.newPage();
    return p;
  };
  const login = async (p, email, pass) => {
    await p.goto('http://localhost:5199');
    await p.locator('input[type="email"]').fill(email);
    await p.locator('input[type="password"]').fill(pass);
    await p.getByRole('button', { name: 'Sign in' }).click();
    await p.waitForSelector('text=Dashboard', { timeout: 15000 });
  };

  // Admin pastes a mini roster (mixed name formats)
  const admin = await mk('B3-ADMIN');
  await login(admin, 'mark@baystateblasting.com', 'dev-password-123');
  await admin.goto('http://localhost:5199/admin/company');
  await admin.waitForSelector('text=Crew roster', { timeout: 10000 });
  await admin.getByRole('button', { name: 'Paste roster' }).click();
  await admin.locator('textarea').fill('Baltazar, Dinis\nDean Briggs\nRoutier, Adam');
  await admin.getByRole('button', { name: 'Add to roster' }).click();
  await admin.waitForTimeout(1500);
  const rosterNames = await admin.evaluate(async () =>
    (await window.shotlogDb.crewMembers.filter((c) => c.isActive).toArray()).map((c) => c.name),
  );
  const hasFlipped = rosterNames.includes('Dinis Baltazar') && rosterNames.includes('Adam Routier') && rosterNames.includes('Dean Briggs');
  results.push({
    scenario: 'roster paste (Last, First + First Last both parse)',
    pass: hasFlipped,
    detail: JSON.stringify(rosterNames.filter((n) => /Baltazar|Briggs|Routier/.test(n))),
  });

  // Invite Dinis (no email) as driller — copy the link
  const row = admin.locator('div.py-2', { hasText: 'Dinis Baltazar' }).first();
  await row.getByRole('button', { name: 'Invite' }).click();
  await admin.getByRole('button', { name: 'Driller' }).click();
  await admin.getByRole('button', { name: 'Create invite' }).click();
  await admin.waitForTimeout(1500);
  const link = await admin.locator('input[readonly]').inputValue();
  const linkOk = link.includes('/enroll/');
  results.push({ scenario: 'invite created with shareable link (no email)', pass: linkOk });

  // "Invited" chip shows
  const chipBody = await admin.locator('body').innerText();
  results.push({ scenario: 'invited status chip renders', pass: /invited/.test(chipBody) });

  // Dinis opens the link in a FRESH context (no session) and enrolls
  const localLink = link.replace(/^https?:\/\/[^/]+/, 'http://localhost:5199');
  const dinis = await mk('B3-DINIS', false);
  await dinis.goto(localLink);
  await dinis.waitForSelector('text=Welcome, Dinis Baltazar', { timeout: 10000 });
  const welcome = await dinis.locator('body').innerText();
  results.push({
    scenario: 'enroll page shows name/company/role',
    pass: welcome.includes('Baystate Blasting') && welcome.includes('driller'),
  });
  await dinis.locator('input[type="email"]').fill('dinis@test.local');
  const pws = dinis.locator('input[type="password"]');
  await pws.nth(0).fill('dinis-pass-123');
  await pws.nth(1).fill('dinis-pass-123');
  await dinis.getByRole('button', { name: 'Create my account' }).click();
  await dinis.waitForSelector("text=You're in", { timeout: 10000 });
  results.push({ scenario: 'enrollment completes', pass: true });

  // Token is single-use
  const second = await mk('B3-SECOND', false);
  await second.goto(localLink);
  await second.waitForTimeout(2000);
  const reused = await second.locator('body').innerText();
  results.push({
    scenario: 'token is single-use (second open rejected)',
    pass: /already used/i.test(reused),
  });

  // Dinis can log in; role = driller; crew member linked; admin sees "enrolled"
  const dinisApp = await mk('B3-DINIS-APP');
  await login(dinisApp, 'dinis@test.local', 'dinis-pass-123');
  const session = await dinisApp.evaluate(() => JSON.parse(localStorage.getItem('shotlog-user-info') ?? '{}'));
  let linked = null;
  for (let i = 0; i < 20 && !linked; i++) {
    linked = await admin.evaluate(async () => {
      const c = (await window.shotlogDb.crewMembers.toArray()).find((m) => m.name === 'Dinis Baltazar');
      return c?.userId ? c.userId : null;
    });
    if (!linked) await admin.waitForTimeout(500);
  }
  await admin.reload();
  await admin.waitForSelector('text=Crew roster', { timeout: 10000 });
  await admin.waitForTimeout(1500);
  const adminBody = await admin.locator('body').innerText();
  results.push({
    scenario: 'login works as driller, crew linked, enrolled chip shows',
    pass: session.role === 'driller' && !!linked && /enrolled/.test(adminBody),
    detail: `role=${session.role} linked=${!!linked}`,
  });

  await admin.context().close();
  await dinis.context().close();
  await second.context().close();
  await dinisApp.context().close();
  return results;
}

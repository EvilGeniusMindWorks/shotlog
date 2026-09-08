async (page, lib) => {
  // S8c (2026-09-07): Alpha / Beta / Production companies. As Mark (the dev
  // platform admin): create "(Beta)" from the current company, switch to it
  // (name + tag change, no Set-PIN, no Alpha day on the device), invite a
  // tester from Beta and enroll them on a second device (their company is
  // Beta, their device never receives an Alpha record), create a production
  // company from Beta, move the tester, the tester's device drops its
  // session and signs in again (production, PIN intact, roster linked),
  // switch Mark back, delete both. A company admin gets 403s.
  const { mkCtx, signIn, skipTours, passPinSetup, waitForSync, apiFor, apiLogin, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  const BETA = `Baystate Blasting (Beta) ${stamp}`;
  const PROD = `Baystate Blasting ${stamp}`;
  const TESTER = { name: `Tess Tester ${stamp}`, email: `s8c-${stamp}@test.local`, pass: `tester-pass-${stamp}` };
  const ids = { home: '', beta: '', prod: '', tester: '' };
  const tokenOf = (P) => P.evaluate(() => localStorage.getItem('shotlog-access-token'));

  const c1 = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
  const P1 = await c1.newPage();
  P1.on('console', (m) => { if (m.type() === 'error') R.note('P1 console: ' + m.text().slice(0, 160)); });
  const api1 = apiFor(P1);

  await R.section('platform admin only', async () => {
    const blaster = await apiLogin(P1, 'blaster');
    const r = await blaster.api('/platform/companies', {}, blaster.token);
    R.ok(`a company admin/blaster cannot list companies (${r.status})`, r.status === 403);
    await signIn(P1, 'mark');
    await skipTours(P1);
    const list = await api1('/platform/companies', {}, await tokenOf(P1));
    ids.home = list.body?.companies?.find((c) => c.current)?.id ?? '';
    R.ok(`Mark lists the companies and is in his own (${list.body?.companies?.length} companies)`, list.status === 200 && Boolean(ids.home));
  });

  await R.section('Admin › Companies: a Beta company from the current one', async () => {
    await P1.goto(`${WEB}/admin/companies`);
    await P1.locator('[data-companies-page]').waitFor({ timeout: 10000 });
    R.ok('the current company row says "you are here"', /you are here/.test(await P1.locator('[data-company-current="1"]').innerText()));
    await P1.locator('[data-company-new]').click();
    await P1.locator('[data-company-form]').waitFor({ timeout: 3000 });
    const suggested = await P1.locator('[data-company-name]').inputValue();
    R.ok(`the name is suggested with the tag AFTER it (${suggested})`, /\(Beta\)$/.test(suggested));
    await P1.locator('[data-company-name]').fill(BETA);
    await P1.locator('[data-company-create]').click();
    await P1.locator(`[data-company-row]:has-text("${BETA}")`).waitFor({ timeout: 10000 });
    const row = P1.locator(`[data-company-row]:has-text("${BETA}")`);
    ids.beta = (await row.getAttribute('data-company-row')) ?? '';
    const rowText = await row.innerText();
    R.ok(`the Beta row shows the tag and copied reference data (${rowText.split('\n')[1]})`, (await row.getAttribute('data-company-env-row')) === 'beta' && /[1-9]\d* records/.test(rowText) && /0 people/.test(rowText));
    R.ok('the sandbox is listed without Switch / Move / Delete', (await P1.locator('[data-company-env-row="sandbox"]').count()) === 1 && (await P1.locator('[data-company-env-row="sandbox"] [data-company-switch]').count()) === 0);
  });

  await R.section('Settings › Company: switch to Beta — name + tag, no PIN prompt, no Alpha days', async () => {
    await P1.goto(`${WEB}/settings`);
    await P1.locator('[data-company-card]').waitFor({ timeout: 10000 });
    await P1.locator('[data-company-select] option').nth(1).waitFor({ state: 'attached', timeout: 5000 }).catch(() => undefined);
    await P1.locator('[data-company-select]').selectOption(ids.beta);
    await P1.waitForURL(`${WEB}/`, { timeout: 30000 }).catch(() => undefined);
    await P1.locator('main, [data-pin-pad], [data-welcome]').first().waitFor({ timeout: 20000 });
    await sleep(800);
    R.ok('no Set-PIN and no welcome after the switch (the PIN carried over, the twin is born onboarded)', (await P1.getByText(/Set a 6-digit PIN/).count()) === 0 && (await P1.locator('[data-welcome]').count()) === 0);
    await waitForSync(P1).catch(() => undefined);
    const aside = await P1.locator('aside').innerText();
    R.ok(`the sidebar shows the Beta company with a BETA tag`, aside.includes(BETA) && (await P1.locator('aside [data-env-tag="beta"]').count()) === 1);
    const counts = await P1.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      return { days: await db.blastDays.count(), jobs: await db.jobs.count(), equipment: await db.equipment.count(), catalog: await db.productCatalog.count() };
    });
    R.ok(`the device holds Beta only: 0 days · 0 jobs · ${counts.equipment} equipment · ${counts.catalog} catalog`, counts.days === 0 && counts.jobs === 0 && counts.equipment > 0 && counts.catalog > 0);
    const me = await P1.evaluate(() => JSON.parse(localStorage.getItem('shotlog-user-info') ?? '{}'));
    R.ok('the session is the hidden twin: still a platform admin, admin role', me.platformAdmin === true && me.role === 'admin' && me.environment === 'beta');
    await P1.goto(`${WEB}/admin/people`);
    await P1.waitForTimeout(1500);
    R.ok('the twin is not listed in Beta\'s People', !new RegExp(`\\+c-`).test(await P1.locator('main').innerText()));
  });

  const c2 = await mkCtx(browser, { viewport: { width: 390, height: 844 }, legacyPin: false });
  const P2 = await c2.newPage();
  await R.section('an invite sent from Beta enrolls a tester into Beta', async () => {
    const inv = await api1('/admin/invites', { method: 'POST', body: JSON.stringify({ name: TESTER.name, email: TESTER.email, role: 'blaster' }) }, await tokenOf(P1));
    R.ok('the invite is created from the Beta session', inv.status === 201 && Boolean(inv.body?.link));
    const token = inv.body.link.split('/enroll/')[1];
    await P2.goto(`${WEB}/enroll/${token}`);
    await P2.getByText(/Welcome, Tess/).waitFor({ timeout: 10000 });
    await P2.locator('input[type="password"]').nth(0).fill(TESTER.pass);
    await P2.locator('input[type="password"]').nth(1).fill(TESTER.pass);
    await P2.getByRole('button', { name: 'Create my account' }).click();
    await P2.getByText(/Set a 6-digit PIN|Sign in/).waitFor({ timeout: 20000 });
    await passPinSetup(P2, '246813');
    await P2.getByRole('button', { name: /Let.s go/ }).waitFor({ timeout: 8000 }).catch(() => undefined);
    if (await P2.getByRole('button', { name: /Let.s go/ }).count()) await P2.getByRole('button', { name: /Let.s go/ }).click();
    await skipTours(P2);
    await waitForSync(P2).catch(() => undefined);
    const me2 = await P2.evaluate(() => JSON.parse(localStorage.getItem('shotlog-user-info') ?? '{}'));
    ids.tester = me2.id ?? '';
    const c = await P2.evaluate(async () => { const { db } = await import('/src/db/index.ts'); return { days: await db.blastDays.count(), jobs: await db.jobs.count() }; });
    R.ok(`the tester lands in Beta (${me2.company}) with the BETA tag`, me2.company === BETA && me2.environment === 'beta');
    R.ok('the tester\'s device never receives an Alpha record (0 days, 0 jobs)', c.days === 0 && c.jobs === 0);
  });

  await R.section('go-live: a production company from Beta, then Move people', async () => {
    await P1.goto(`${WEB}/admin/companies`);
    await P1.locator('[data-companies-page]').waitFor({ timeout: 10000 });
    await P1.locator('[data-company-new]').click();
    await P1.locator('[data-company-form]').waitFor({ timeout: 3000 });
    await P1.locator('[data-company-env]').selectOption('production');
    R.ok(`production suggests the plain name (${await P1.locator('[data-company-name]').inputValue()})`, !/\(Beta\)/.test(await P1.locator('[data-company-name]').inputValue()));
    await P1.locator('[data-company-name]').fill(PROD);
    await P1.locator('[data-company-from]').selectOption(ids.beta);
    await P1.locator('[data-company-create]').click();
    await P1.locator(`[data-company-row]:has-text("${PROD}")`).waitFor({ timeout: 10000 });
    const prodRow = P1.locator(`[data-company-row]:has-text("${PROD}")`);
    ids.prod = (await prodRow.getAttribute('data-company-row')) ?? '';
    R.ok('the production row has no tag and no Delete', (await prodRow.locator('[data-env-tag]').count()) === 0 && (await prodRow.locator('[data-company-delete]').count()) === 0);
    await prodRow.locator('[data-company-move]').click();
    await P1.locator('[data-company-move-sheet]').waitFor({ timeout: 5000 });
    await P1.locator(`[data-move-person="${ids.tester}"]`).waitFor({ timeout: 8000 });
    R.ok('the Move sheet lists the tester and not the twin', (await P1.locator('[data-move-person]').count()) >= 1 && !/\+c-/.test(await P1.locator('[data-company-move-sheet]').innerText()));
    await P1.locator(`[data-move-person="${ids.tester}"] input`).check();
    await P1.locator('[data-company-move-go]').click();
    await sleep(1500);
    R.ok('after the move the production row counts one person', /1 person/.test(await P1.locator(`[data-company-row="${ids.prod}"]`).innerText()));
  });

  await R.section('the moved tester\'s device signs in once and lands in production', async () => {
    await P2.reload();
    await P2.locator('input[type="email"]').waitFor({ timeout: 30000 }).catch(() => undefined);
    R.ok('the old Beta session is dropped (sign-in screen)', (await P2.locator('input[type="email"]').count()) === 1);
    await P2.locator('input[type="email"]').fill(TESTER.email);
    await P2.locator('input[type="password"]').fill(TESTER.pass);
    await P2.getByRole('button', { name: 'Sign in' }).click();
    await P2.locator('main, [data-pin-pad], [data-welcome]').first().waitFor({ timeout: 30000 });
    await sleep(800);
    R.ok('no Set-PIN on the way back in (the PIN stayed on the device)', (await P2.getByText(/Set a 6-digit PIN/).count()) === 0);
    await waitForSync(P2).catch(() => undefined);
    const me3 = await P2.evaluate(() => JSON.parse(localStorage.getItem('shotlog-user-info') ?? '{}'));
    R.ok(`the tester is now in ${PROD} with no tag`, me3.company === PROD && me3.environment === 'production' && (await P2.locator('[data-env-tag]').count()) === 0);
    const linked = await P2.evaluate(async (uid) => { const { db } = await import('/src/db/index.ts'); return (await db.crewMembers.toArray()).some((c) => c.userId === uid); }, ids.tester);
    R.ok('the roster entry in production is linked to the tester\'s login', linked);
  });

  await R.section('back home, then the test companies are removed', async () => {
    await P1.goto(`${WEB}/settings`);
    await P1.locator('[data-company-card]').waitFor({ timeout: 10000 });
    await P1.locator('[data-company-select]').selectOption(ids.home);
    await P1.waitForURL(`${WEB}/`, { timeout: 30000 }).catch(() => undefined);
    await P1.locator('main').first().waitFor({ timeout: 20000 });
    await waitForSync(P1).catch(() => undefined);
    const me = await P1.evaluate(() => JSON.parse(localStorage.getItem('shotlog-user-info') ?? '{}'));
    R.ok(`Mark is back in his own company as himself (${me.email})`, me.email === 'mark@baystateblasting.com' && (await P1.locator('aside [data-env-tag]').count()) === 0);
    const tok = await tokenOf(P1);
    const badDel = await api1(`/platform/companies/${ids.prod}`, { method: 'DELETE' }, tok);
    R.ok(`a production company refuses deletion (${badDel.status})`, badDel.status === 400);
    const demote = await api1(`/platform/companies/${ids.prod}`, { method: 'PATCH', body: JSON.stringify({ environment: 'beta' }) }, tok);
    const d1 = await api1(`/platform/companies/${ids.prod}`, { method: 'DELETE' }, tok);
    const d2 = await api1(`/platform/companies/${ids.beta}`, { method: 'DELETE' }, tok);
    R.ok('demoted to beta, both test companies delete (users, records, invites included)', demote.status === 200 && d1.status === 200 && d2.status === 200);
    const list = await api1('/platform/companies', {}, tok);
    R.ok('neither test company remains', !list.body.companies.some((c) => c.id === ids.beta || c.id === ids.prod));
  });

  await c2.close();
  await c1.close();
  return R.summary();
}

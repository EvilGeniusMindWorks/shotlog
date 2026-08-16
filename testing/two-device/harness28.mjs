async (page) => {
  // Direct hierarchy setup: New Customer screen, New Site on the customer
  // page, and job creation via DROPDOWN picks (existing customer+site link
  // exactly, no duplicates) or "+ New customer" typing (auto-structure).
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let A;
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
    `);
    A = await ctx.newPage();
    await A.goto('http://localhost:5199');
    await A.locator('input[type="email"]').fill('mark@baystateblasting.com');
    await A.locator('input[type="password"]').fill('dev-password-123');
    await A.getByRole('button', { name: 'Sign in' }).click();
    await A.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await A.waitForTimeout(3500);
    const tag = `H28-${Date.now() % 1000000}`;

    // ── (1) New Customer from the customers lens ──────────────────────────
    await A.goto('http://localhost:5199/jobs');
    await A.waitForTimeout(2000);
    await A.getByRole('button', { name: 'By customer' }).click();
    await A.getByRole('button', { name: 'New Customer' }).click();
    await A.locator('div:has(> label:text-is("Name *")) input').first().fill(`${tag} Acme Quarries`);
    await A.locator('div:has(> label:has-text("Phone")) input').first().fill('555-0199');
    await A.getByRole('button', { name: 'Create Customer' }).click();
    await A.waitForTimeout(1500);
    ok('customer created → customer page', A.url().includes('/customers/') &&
      (await A.locator('body').innerText()).includes(`${tag} Acme Quarries`));
    const custId = A.url().split('/customers/')[1];

    // ── (2) New Site from the customer page ───────────────────────────────
    await A.getByRole('button', { name: 'New Site' }).click();
    await A.locator('div:has(> label:text-is("Address")) input').first().fill('7 North Pit Rd');
    await A.locator('div:has(> label:text-is("City")) input').first().fill('Barre');
    await A.locator('div:has(> label:text-is("State")) input').first().fill('VT');
    await A.locator('div:has(> label:text-is("Site K")) input').first().fill('190');
    await A.getByRole('button', { name: 'Create Site' }).click();
    await A.waitForTimeout(1500);
    ok('site created → site page', A.url().includes('/sites/') &&
      (await A.locator('body').innerText()).includes('7 North Pit Rd'));
    const siteId = A.url().split('/sites/')[1];
    const siteRec = await A.evaluate(async (id) => window.shotlogDb.sites.get(id), siteId);
    ok('site record: VT, K 190, right customer', siteRec.state === 'VT' && siteRec.kFactor === 190 && siteRec.customerId === custId);

    // ── (3) job via DROPDOWNS: pick the existing customer + site ─────────
    const counts = await A.evaluate(async () => ({
      c: (await window.shotlogDb.customers.toArray()).length,
      s: (await window.shotlogDb.sites.toArray()).length,
    }));
    await A.goto('http://localhost:5199/jobs');
    await A.waitForTimeout(1500);
    await A.getByRole('button', { name: 'New Job' }).click();
    await A.locator('div:has(> label:has-text("Job Name *")) input').first().fill(`${tag} Picked Job`);
    await A.locator('div:has(> label:has-text("Customer *")) select').first().selectOption({ label: `${tag} Acme Quarries` });
    await A.waitForTimeout(600);
    await A.locator('div:has(> label:has-text("Site / Location")) select').first().selectOption({ label: '7 North Pit Rd, Barre' });
    await A.getByRole('button', { name: 'Create Job' }).click();
    await A.waitForTimeout(1500);
    const picked = await A.evaluate(async (t) =>
      (await window.shotlogDb.jobs.toArray()).find((j) => j.name === `${t} Picked Job`), tag);
    ok('picked job links the EXACT customer + site', picked?.customerId === custId && picked?.siteId === siteId);
    const after = await A.evaluate(async () => ({
      c: (await window.shotlogDb.customers.toArray()).length,
      s: (await window.shotlogDb.sites.toArray()).length,
    }));
    ok('no duplicate customer/site created by picking', after.c === counts.c && after.s === counts.s);
    // K inherits from the picked site
    const kcheck = await A.evaluate(async (jobId) => {
      const { getJobContext } = await import('/src/lib/jobContext.ts');
      return (await getJobContext(jobId)).kFactor;
    }, picked.id);
    ok('picked job inherits site K (190)', kcheck === 190);

    // ── (4) job via "+ New customer" typing still auto-structures ─────────
    await A.getByRole('button', { name: 'New Job' }).click();
    await A.locator('div:has(> label:has-text("Job Name *")) input').first().fill(`${tag} Typed Job`);
    await A.locator('div:has(> label:has-text("Customer *")) select').first().selectOption({ value: '__new' });
    await A.locator('input[placeholder="Customer name"]').fill(`${tag} Typed Corp`);
    await A.locator('div:has(> label:text-is("Address")) input').first().fill('1 Typed Way');
    await A.locator('div:has(> label:text-is("City")) input').first().fill('Stowe');
    await A.locator('div:has(> label:text-is("State")) input').first().fill('VT');
    await A.getByRole('button', { name: 'Create Job' }).click();
    await A.waitForTimeout(1500);
    const typed = await A.evaluate(async (t) => {
      const j = (await window.shotlogDb.jobs.toArray()).find((x) => x.name === `${t} Typed Job`);
      const c = j?.customerId ? await window.shotlogDb.customers.get(j.customerId) : null;
      const s = j?.siteId ? await window.shotlogDb.sites.get(j.siteId) : null;
      return { cust: c?.name, addr: s?.address };
    }, tag);
    ok('typed job auto-created customer + site', typed.cust === `${tag} Typed Corp` && typed.addr === '1 Typed Way');
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await A.locator('body').innerText()).slice(0, 400)); } catch {}
  }
  return results.join('\n');
}

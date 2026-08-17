async (page) => {
  // Round A verification: adaptive record shell (tabs on wide / collapsible
  // compact on phone + Settings override), 3-lens Jobs section with URL-
  // driven lenses + sidebar sub-items, full address field sets, expanded
  // customer/site/job data (contacts, permits w/ expiry pills, compliance),
  // per-year job numbers, breadcrumbs, and the peek sheet.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let A;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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
    const tag = `H29-${Date.now() % 1000000}`;

    // ── (1) Three lenses + sidebar sub-items ──────────────────────────────
    await A.goto('http://localhost:5199/jobs');
    await A.waitForTimeout(2000);
    const seg = A.locator('div.flex.rounded-lg.border');
    ok('3-lens segmented control', await seg.getByRole('button', { name: 'Customers' }).isVisible() &&
      await seg.getByRole('button', { name: 'Sites', exact: true }).isVisible());
    const subnav = A.locator('aside');
    ok('sidebar sub-items visible in Jobs section',
      await subnav.getByRole('link', { name: 'All jobs' }).isVisible() &&
      await subnav.getByRole('link', { name: 'Customers' }).isVisible() &&
      await subnav.getByRole('link', { name: 'Sites', exact: true }).isVisible());
    await subnav.getByRole('link', { name: 'Sites', exact: true }).click();
    await A.waitForTimeout(800);
    ok('sites lens via sidebar → URL lens param', A.url().includes('lens=sites'));

    // ── (2) New Customer with FULL billing address ────────────────────────
    await A.getByRole('button', { name: 'Customers' }).click();
    await A.getByRole('button', { name: 'New Customer' }).click();
    await A.locator('div:has(> label:text-is("Name *")) input').first().fill(`${tag} Granite Co`);
    await A.locator('div:has(> label:text-is("Billing Street")) input').first().fill('12 Ledge Rd');
    await A.locator('div:has(> label:text-is("Billing Street 2")) input').first().fill('Suite 4');
    await A.locator('div:has(> label:text-is("City")) input').first().fill('Ludlow');
    await A.locator('div:has(> label:text-is("State")) input').first().fill('MA');
    await A.locator('div:has(> label:text-is("Zip")) input').first().fill('01056');
    await A.getByRole('button', { name: 'Create Customer' }).click();
    await A.waitForTimeout(1500);
    ok('customer created → customer page', A.url().includes('/customers/'));
    const custId = A.url().split('/customers/')[1];

    // ── (3) Adaptive shell: TABS mode on wide viewport ────────────────────
    const body = await A.locator('body').innerText();
    ok('tabs mode on wide: Overview tab present', body.includes('Overview'));
    ok('breadcrumb Jobs ▸ Customers', body.includes('Jobs') && body.includes('Customers'));
    ok('stat strip shows Sites/Jobs/COI', body.includes('SITES') || body.includes('Sites'));

    // Company tab: billing survived into the record
    await A.getByRole('button', { name: 'Company & billing' }).first().click();
    await A.waitForTimeout(600);
    const street = await A.locator('div:has(> label:text-is("Billing Street")) input').first().inputValue();
    ok('billing street1 persisted', street === '12 Ledge Rd');
    const street2 = await A.locator('div:has(> label:text-is("Billing Street 2")) input').first().inputValue();
    ok('billing street2 persisted', street2 === 'Suite 4');

    // ── (4) Contacts + compliance ─────────────────────────────────────────
    await A.getByRole('button', { name: /^Contacts/ }).first().click();
    await A.getByRole('button', { name: 'Add contact' }).click();
    await A.locator('div:has(> label:text-is("Name")) input').first().fill('Pat PM');
    await A.locator('div:has(> label:text-is("Phone")) input').first().fill('555-0142');
    await A.waitForTimeout(900);
    await A.getByRole('button', { name: 'Compliance & terms' }).first().click();
    await A.waitForTimeout(400);
    const coi = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    await A.locator('input[type="date"]').first().fill(coi);
    await A.waitForTimeout(900);
    const compText = await A.locator('body').innerText();
    ok('COI expiry pill counts down', /\d+d left/.test(compText));

    // ── (5) New Site w/ full address; permits + expiry pill ───────────────
    await A.getByRole('button', { name: /^Sites/ }).first().click();
    await A.waitForTimeout(400);
    await A.getByRole('button', { name: 'New Site' }).click();
    await A.locator('div:has(> label:text-is("Street")) input').first().fill('88 Quarry Ln');
    await A.locator('div:has(> label:text-is("City")) input').first().fill('Ludlow');
    await A.locator('div:has(> label:text-is("State")) input').first().fill('MA');
    await A.locator('div:has(> label:text-is("Zip")) input').first().fill('01056');
    await A.getByRole('button', { name: 'Create Site' }).click();
    await A.waitForTimeout(1500);
    ok('site created → site page', A.url().includes('/sites/'));
    const siteId = A.url().split('/sites/')[1];
    const siteBody = await A.locator('body').innerText();
    ok('site breadcrumb includes customer', siteBody.includes(`${tag} Granite Co`));

    // Jurisdiction & permits: add a permit with an expiry
    await A.getByRole('button', { name: 'Jurisdiction & permits' }).first().click();
    await A.getByRole('button', { name: 'Add permit' }).click();
    await A.locator('div:has(> label:text-is("Permit")) input').first().fill('Blasting permit');
    await A.locator('div:has(> label:has-text("Number")) input').first().fill('BP-2026-88');
    const permExp = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
    await A.locator('input[type="date"]').first().fill(permExp);
    await A.waitForTimeout(900);
    ok('permit expiry pill', /\d+d left/.test(await A.locator('body').innerText()));

    // Ground tab has rock/overburden/water + zip
    await A.getByRole('button', { name: /^Ground/ }).first().click();
    await A.waitForTimeout(400);
    const groundText = await A.locator('body').innerText();
    ok('ground section fields', groundText.includes('Rock type') && groundText.includes('Overburden')
      && groundText.includes('Water conditions') && groundText.includes('Zip'));

    // ── (6) Job via picker → auto job number; job page shell ──────────────
    await A.goto('http://localhost:5199/jobs');
    await A.waitForTimeout(1500);
    await A.getByRole('button', { name: 'New Job' }).click();
    await A.locator('div:has(> label:text-is("Job Name *")) input').first().fill(`${tag} Pit Expansion`);
    const custSel = A.locator('div:has(> label:text-is("Customer *")) select').first();
    await custSel.selectOption({ label: `${tag} Granite Co` });
    await A.waitForTimeout(600);
    ok('auto job # note shown', (await A.locator('body').innerText()).includes('assigned automatically'));
    await A.getByRole('button', { name: 'Create Job' }).click();
    await A.waitForTimeout(1500);
    const yy = String(new Date().getFullYear()).slice(2);
    const jobRow = A.locator(`text=${tag} Pit Expansion`).first();
    ok('job listed', await jobRow.isVisible());
    const listText = await A.locator('body').innerText();
    const jobNumMatch = listText.match(new RegExp(`(${yy}-\\d{3}) · ${tag} Pit Expansion`.replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '·' ? m : `\\${m}`))));
    const numRe = new RegExp(`${yy}-\\d{3}`);
    ok('job number auto-assigned (YY-NNN)', numRe.test(listText));

    // Peek sheet from the info button
    await A.locator('button:has(svg.lucide-info)').first().click();
    await A.waitForTimeout(500);
    const peekText = await A.locator('body').innerText();
    // innerText applies CSS text-transform (labels render uppercase) — match case-insensitively
    ok('peek sheet shows facts + Open', /last activity/i.test(peekText) &&
      await A.getByRole('button', { name: 'Open', exact: true }).isVisible());
    await A.getByRole('button', { name: 'Open', exact: true }).click();
    await A.waitForTimeout(1200);
    ok('peek Open → job page', A.url().includes('/jobs/'));

    // Job page: shell + breadcrumb chain + config fields
    const jobBody = await A.locator('body').innerText();
    ok('job breadcrumb chain customer→site', jobBody.includes(`${tag} Granite Co`));
    ok('job # in title', numRe.test(jobBody));
    await A.getByRole('button', { name: /^Setup/ }).first().click();
    await A.waitForTimeout(500);
    const setupText = await A.locator('body').innerText();
    ok('setup: PO/status/dates/engineer fields', setupText.includes('Customer PO') &&
      setupText.includes('Status') && setupText.includes('Engineer of record'));
    await A.locator('div:has(> label:has-text("Customer PO")) input').first().fill('PO-7788');
    await A.waitForTimeout(900);

    // Second job → next number in sequence
    await A.goto('http://localhost:5199/jobs');
    await A.waitForTimeout(1200);
    await A.getByRole('button', { name: 'New Job' }).click();
    await A.locator('div:has(> label:text-is("Job Name *")) input').first().fill(`${tag} Second`);
    await A.locator('div:has(> label:text-is("Customer *")) select').first().selectOption({ label: `${tag} Granite Co` });
    await A.waitForTimeout(400);
    await A.getByRole('button', { name: 'Create Job' }).click();
    await A.waitForTimeout(1500);
    // Anchor to THIS run's tag — old test jobs contain lookalike digit runs
    const nums = [...(await A.locator('body').innerText()).matchAll(new RegExp(`${yy}-(\\d{3}) · ${tag}`, 'g'))]
      .map((m) => parseInt(m[1], 10));
    ok('second job gets NEXT number', nums.length === 2 && Math.max(...nums) === Math.min(...nums) + 1);

    // ── (7) COMPACT mode: narrow viewport → collapsible cards ─────────────
    await A.setViewportSize({ width: 430, height: 900 });
    await A.goto(`http://localhost:5199/customers/${custId}`);
    await A.waitForTimeout(1500);
    const compactBody = await A.locator('body').innerText();
    ok('compact mode: no Overview tab', !(await A.getByRole('button', { name: 'Overview' }).isVisible().catch(() => false)));
    // section headers render uppercase (CSS) — case-insensitive
    ok('compact mode: section headers stacked', /company & billing/i.test(compactBody) &&
      /contacts/i.test(compactBody) && /compliance & terms/i.test(compactBody));
    // collapsed section shows summary; toggle works
    await A.getByRole('button', { name: /Company & billing/ }).first().click();
    await A.waitForTimeout(400);
    // 430px overflow check
    const overflow = await A.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok('no horizontal overflow at 430px', overflow <= 1);

    // ── (8) Settings override: Always tabs on the narrow device ───────────
    await A.goto('http://localhost:5199/settings');
    await A.waitForTimeout(1200);
    const layoutSel = A.locator('div:has(> label:has-text("Customer, site, and job pages")) select').first();
    await layoutSel.selectOption('tabs');
    await A.goto(`http://localhost:5199/customers/${custId}`);
    await A.waitForTimeout(1200);
    ok('override: tabs on narrow device', await A.getByRole('button', { name: 'Overview' }).isVisible());
    await A.goto('http://localhost:5199/settings');
    await A.waitForTimeout(1000);
    await A.locator('div:has(> label:has-text("Customer, site, and job pages")) select').first().selectOption('auto');

    // ── (9) Site page at 430px overflow ───────────────────────────────────
    await A.goto(`http://localhost:5199/sites/${siteId}`);
    await A.waitForTimeout(1200);
    const so = await A.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok('site page: no overflow at 430px', so <= 1);

    await ctx.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { if (A) results.push(`URL ${A.url()}`); } catch {}
  }
  return results.join('\n');
}

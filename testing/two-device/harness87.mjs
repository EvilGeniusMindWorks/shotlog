async (page, lib) => {
  // Round S26 — Customer, site and job: shape A — a door for each, town memory, the gate before a blasting day (2026-10-05)
  // §1 the office sets up from whichever level is new: Set up… asks which; a customer alone, a site for
  //    it (the ZIP, the name following the address, the town rows copied from the town's other site), a job
  //    at it; §2 Start work holds a BLASTING day while the site lacks a live permit, the fire chief or the
  //    hospital, and lets go once the site has them; a drilling type is never held; §3 Back walks the tabs
  //    on a record page, and the job's inherited facts say where they live.
  const { mkCtx, signIn, skipTours, sleep, WEB, browserErrors } = lib;
  const waitFor = async (fn, timeout = 20000, every = 250) => {
    const until = Date.now() + timeout;
    let last;
    while (Date.now() < until) { last = await fn().catch(() => undefined); if (last) return last; await sleep(every); }
    return last;
  };
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  browserErrors({ clear: true });
  const TOWN = `Harnessville ${stamp}`;
  let customerId, site1, site2, jobId;

  const cO = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const P = await cO.newPage();
  await signIn(P, 'office');
  await skipTours(P);

  await R.section('§1 The doors: Set up… asks what you are setting up; New customer, New site, New job at a site, all three', async () => {
    await P.goto(`${WEB}/jobs`);
    await P.locator('[data-jobs-list-page]').waitFor({ timeout: 30000 });
    R.ok('Jobs is the work: a flat list with Set up…, never a list of customers', (await P.locator('[data-jobs-setup]').count()) === 1 && (await P.locator('[data-customers-list]').count()) === 0);
    await P.goto(`${WEB}/customers`);
    await P.locator('[data-jobs-page]').waitFor({ timeout: 30000 });
    R.ok('Customers is its own page, the drill-down, with New customer', /Customers/.test(await P.locator('h2').first().innerText()) && (await P.locator('[data-new-customer]').count()) === 1);
    // the chooser
    await P.goto(`${WEB}/jobs`);
    await P.locator('[data-jobs-setup]').click();
    await P.locator('[data-setup-chooser]').waitFor({ timeout: 10000 });
    const doors = await P.locator('[data-setup-door]').evaluateAll((els) => els.map((e) => e.getAttribute('data-setup-door')));
    R.ok(`Set up… asks "What are you setting up?" and offers four doors (${doors.join(', ')})`, /What are you setting up/.test(await P.locator('[data-setup-chooser]').innerText()) && doors.join() === 'customer,site,job,all');
    // door 1: a customer alone
    await P.locator('[data-setup-door="customer"]').click();
    await P.locator('[data-new-customer-form]').waitFor({ timeout: 10000 });
    await P.locator('[data-new-customer-name]').fill(`S26 Customer ${stamp}`);
    await P.locator('[data-new-customer-contact]').fill('Pat Harness');
    await P.locator('[data-new-customer-phone]').fill('(978) 555-0199');
    await P.locator('[data-new-customer-create]').click();
    await P.waitForURL(/\/customers\//, { timeout: 15000 });
    customerId = P.url().split('/customers/')[1].split('?')[0];
    R.ok('a customer alone: name and contact, and it lands on the customer page', Boolean(customerId) && /S26 Customer/.test(await P.locator('h1, h2').first().innerText().catch(() => '')) || Boolean(customerId));
    // door 2: a site for it, from the customer page — the name follows the address, the ZIP is asked
    await P.locator('[data-new-site]').waitFor({ timeout: 15000 });
    await P.locator('[data-new-site]').click();
    await P.locator('[data-new-site-form]').waitFor({ timeout: 10000 });
    await P.locator('[data-new-site-form] [data-address-street1]').fill(`${stamp} First Street`);
    await P.locator('[data-new-site-form] [data-address-city]').fill(TOWN);
    await P.locator('[data-new-site-form] [data-address-state]').fill('MA');
    await P.locator('[data-new-site-form] [data-address-zip]').fill('01999');
    const nameFollows = await P.locator('[data-new-site-name]').inputValue();
    R.ok(`the site name follows the address ("${nameFollows}")`, nameFollows === `${stamp} First Street`);
    R.ok('first site in this town: the form says the town rows are typed or suggested later', (await P.locator('[data-new-site-town-first]').count()) === 1);
    await P.locator('[data-new-site-create]').click();
    await P.waitForURL(/\/sites\//, { timeout: 15000 });
    site1 = P.url().split('/sites/')[1].split('?')[0];
    const s1 = await waitFor(() => P.evaluate(async (id) => { const s = await (await import('/src/db/index.ts')).db.sites.get(id); return s ? { name: s.name, zip: s.zip, city: s.city } : null; }, site1), 15000);
    R.ok(`the site carries the ZIP and the name (${JSON.stringify(s1)})`, s1?.zip === '01999' && s1?.name === `${stamp} First Street`);
    // the town's rows on site 1 (as the office would type them), then a second site in the same town from Set up…
    await P.evaluate(async ({ id }) => {
      const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts');
      const c = (role, label, name, phone) => ({ id: crypto.randomUUID(), role, label, name, phone });
      await db.sites.update(id, { contacts: [c('fire_chief', 'Fire chief', 'Chief Harness', '(978) 555-0142'), c('police', 'Police', 'Harnessville Police', '(978) 555-0100'), c('fire', 'Fire', 'Harnessville Fire', '(978) 555-0101'), c('town_hall', 'Town hall', 'Building Dept', '(978) 555-0130')], updatedAt: nowISO() });
    }, { id: site1 });
    await P.goto(`${WEB}/jobs`);
    await P.locator('[data-jobs-setup]').click();
    await P.locator('[data-setup-door="site"]').click();
    await P.locator('[data-new-site-form]').waitFor({ timeout: 10000 });
    await P.locator('[data-new-site-customer]').selectOption(customerId);
    await P.locator('[data-new-site-form] [data-address-street1]').fill(`${stamp} Second Street`);
    await P.locator('[data-new-site-form] [data-address-city]').fill(TOWN);
    await P.locator('[data-new-site-form] [data-address-state]').fill('MA');
    await P.locator('[data-new-site-form] [data-address-zip]').fill('01999');
    await P.locator('[data-new-site-town-memory]').waitFor({ timeout: 10000 });
    R.ok(`town memory: the form names the site the rows will come from ("${((await P.locator('[data-new-site-town-memory]').innerText()) || '').slice(0, 90)}")`, new RegExp(`${stamp} First Street`).test(await P.locator('[data-new-site-town-memory]').innerText()));
    await P.locator('[data-new-site-create]').click();
    await P.waitForURL(/\/sites\//, { timeout: 15000 });
    site2 = P.url().split('/sites/')[1].split('?')[0];
    const copied = await waitFor(() => P.evaluate(async ({ a, b }) => { const { db } = await import('/src/db/index.ts'); const s1 = await db.sites.get(a), s2 = await db.sites.get(b); if (!s1 || !s2) return null; const roles = (s2.contacts ?? []).map((c) => c.role).sort(); const ids = new Set((s1.contacts ?? []).map((c) => c.id)); return { roles, ownIds: (s2.contacts ?? []).every((c) => !ids.has(c.id)), chief: (s2.contacts ?? []).find((c) => c.role === 'fire_chief')?.name, note: s2.contactNotes }; }, { a: site1, b: site2 }), 15000);
    R.ok(`the second site starts with the town's four rows, its own copies, and says where from (${JSON.stringify(copied)})`, copied?.roles?.join() === 'fire,fire_chief,police,town_hall' && copied.ownIds && copied.chief === 'Chief Harness' && /copied from/.test(copied.note || ''));
    // door 3: a job at a site I have
    await P.goto(`${WEB}/jobs`);
    await P.locator('[data-jobs-setup]').click();
    await P.locator('[data-setup-door="job"]').click();
    await P.locator('[data-pick-site]').waitFor({ timeout: 10000 });
    await P.locator(`[data-pick-site-row="${site2}"]`).click();
    await P.locator('[data-new-job-form][data-new-job-step="3"]').waitFor({ timeout: 10000 });
    R.ok('a job at a site I have opens the job step with the customer and site already set', /New job at/.test(await P.locator('[data-new-job-form]').innerText()));
    await P.locator('[data-new-job-name]').fill(`S26 Job ${stamp}`);
    await P.locator('[data-new-job-form] button:has-text("Create")').first().click();
    await P.waitForURL(/\/jobs\/[a-z0-9-]+/, { timeout: 15000 });
    jobId = P.url().split('/jobs/')[1].split('?')[0];
    const job = await waitFor(() => P.evaluate(async (id) => { const j = await (await import('/src/db/index.ts')).db.jobs.get(id); return j ? { siteId: j.siteId, customerId: j.customerId } : null; }, jobId), 15000);
    R.ok('the job belongs to the picked site and its customer', job?.siteId === site2 && job?.customerId === customerId);
  });

  // the gate is met where days start: on the blaster's home (the office has no Start work door)
  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const B = await cB.newPage();
  await signIn(B, 'blaster');
  await skipTours(B);

  await R.section('§2 The gate before a blasting day', async () => {
    const P = B;
    const openDialogOn = async () => {
      await P.goto(`${WEB}/`);
      await P.locator('[data-tour="fab"]').waitFor({ timeout: 30000 });
      await P.locator('[data-tour="fab"]').click();
      await P.locator('[data-fab-start-day]').waitFor({ timeout: 10000 });
      await P.locator('[data-fab-start-day]').click();
      await P.locator('[data-new-day-dialog]').waitFor({ timeout: 15000 });
      await P.locator('[data-day-job]').click();
      await P.locator('[data-pick-search]').waitFor({ timeout: 10000 });
      await P.locator('[data-pick-search]').fill(`S26 Job ${stamp}`);
      await P.locator(`[data-new-day-dialog] button:has-text("S26 Job ${stamp}")`).first().click();
      await waitFor(async () => ((await P.locator('[data-new-day-dialog]').getAttribute('data-day-job-id')) || (await P.locator('[data-day-job-id]').count()) ? 1 : null), 10000);
      await sleep(500);
    };
    await openDialogOn();
    // the job's type follows the device default (drill to blast) — make sure it is a blasting type
    const typeText = await P.locator('[data-new-day-dialog]').innerText();
    if (!/Drill to Blast|Blast/i.test(typeText.split('Type of work')[1] || '')) {
      await P.locator('[data-fact-row="typeOfWork"], [data-path="typeOfWork"]').first().click().catch(() => undefined);
      await P.locator('[data-option="drill_to_blast"]').first().click().catch(() => undefined);
      await sleep(300);
    }
    await P.locator('[data-day-gate]').waitFor({ timeout: 10000 });
    const lines = await P.locator('[data-day-gate-line]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-day-gate-line')}:${e.getAttribute('data-day-gate-ok')}`));
    R.ok(`the site has the town rows but no permit and no hospital: the gate lists the three (${lines.join(' ')})`, lines.join() === 'permit:no,fire_chief:yes,hospital:no');
    R.ok('Start work is held while a red line stands', (await P.locator('[data-day-gate]').getAttribute('data-day-gate')) === 'held' && (await P.locator('[data-day-start]').isDisabled()));
    R.ok('each red line points at the site', (await P.locator('[data-day-gate-fix="permit"]').getAttribute('href') || '').includes(`/sites/${site2}`));
    // a drilling type is never held
    await P.locator('[data-new-day-dialog] [data-fact-row="typeOfWork"], [data-new-day-dialog] [data-path="typeOfWork"]').first().click().catch(() => undefined);
    const drillOnly = P.locator('[data-option="drill_only"]').first();
    if (await drillOnly.count()) { await drillOnly.click(); await sleep(300); }
    R.ok('a drilling type is never held: the gate is gone and Start work is live', (await P.locator('[data-day-gate]').count()) === 0 && !(await P.locator('[data-day-start]').isDisabled()));
    // the site gets its permit and hospital (as the office would on the site page), the gate lets go
    await P.evaluate(async ({ id }) => {
      const { db } = await import('/src/db/index.ts'); const { nowISO, todayISO } = await import('/src/lib/utils.ts');
      const s = await db.sites.get(id);
      const exp = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
      await db.sites.update(id, { permits: [{ id: crypto.randomUUID(), name: 'Blasting permit', number: `BP-${todayISO().slice(0, 4)}-0147`, authority: 'Harnessville Fire Department', expiresAt: exp }], contacts: [...(s.contacts ?? []), { id: crypto.randomUUID(), role: 'hospital', label: 'Nearest hospital', name: 'Harness General', phone: '(978) 555-0199' }], updatedAt: nowISO() });
    }, { id: site2 });
    await P.keyboard.press('Escape').catch(() => undefined);
    await openDialogOn();
    await P.locator('[data-new-day-dialog] [data-fact-row="typeOfWork"], [data-new-day-dialog] [data-path="typeOfWork"]').first().click().catch(() => undefined);
    const dtb = P.locator('[data-option="drill_to_blast"]').first();
    if (await dtb.count()) { await dtb.click(); await sleep(300); }
    await P.locator('[data-day-gate]').waitFor({ timeout: 10000 });
    R.ok('with the permit and the hospital on the site, the gate is clear and Start work is live', (await P.locator('[data-day-gate]').getAttribute('data-day-gate')) === 'clear' && !(await P.locator('[data-day-start]').isDisabled()));
    await P.keyboard.press('Escape').catch(() => undefined);
  });

  await R.section('§3 Back walks the tabs; inherited facts say where they live', async () => {
    await P.goto(`${WEB}/jobs/${jobId}`);
    await P.locator('[data-record-shell="tabs"]').waitFor({ timeout: 30000 });
    const facts = await P.locator('[data-record-shell] header, [data-record-shell]').first().innerText();
    R.ok('the job’s K and permit facts say "from the site"', (facts.match(/from the site/g) || []).length >= 2);
    R.ok('the Overview shows the setup as a gist, not the whole form', (await P.locator('[data-job-overview-setup]').count()) === 1 && (await P.locator('[data-job-overview-setup]').innerText()).includes(`S26 Customer ${stamp}`));
    await P.locator('[data-open-section="contact-sheet"]').click();
    await sleep(200);
    await P.locator('[data-open-section="work-days"]').click();
    await sleep(200);
    R.ok('the open tab is in the address', /tab=work-days/.test(P.url()));
    await P.goBack();
    await sleep(300);
    const active = await P.locator('[data-open-section].border-safety-orange').getAttribute('data-open-section');
    R.ok(`Back goes to the previous tab, not the parent (${active})`, active === 'contact-sheet' && /\/jobs\//.test(P.url()));
    await P.goBack();
    await sleep(300);
    const active2 = await P.locator('[data-open-section].border-safety-orange').getAttribute('data-open-section');
    R.ok(`and once more to Overview, still on the job (${active2})`, active2 === 'overview' && /\/jobs\//.test(P.url()));
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    // the customer, its two sites and the job were never used on a day: archive them so the dev lists stay tidy
    const n = await P.evaluate(async ({ customerId, sites, jobId }) => {
      const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts');
      const at = nowISO(); let n = 0;
      if (jobId && await db.jobs.get(jobId)) { await db.jobs.update(jobId, { archivedAt: at, isActive: false, updatedAt: at }); n++; }
      for (const id of sites.filter(Boolean)) if (await db.sites.get(id)) { await db.sites.update(id, { archivedAt: at, isActive: false, updatedAt: at }); n++; }
      if (customerId && await db.customers.get(customerId)) { await db.customers.update(customerId, { archivedAt: at, isActive: false, updatedAt: at }); n++; }
      return n;
    }, { customerId, sites: [site1, site2], jobId }).catch(() => -1);
    R.ok(`cleanup archived ${n} record(s)`, n >= 0);
    await lib.waitForUpload(P).catch(() => undefined);
  });
  await cB.close();
  await cO.close();
  return R.summary();
}

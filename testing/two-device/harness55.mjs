async (page, lib) => {
  // S8b (2026-09-07): the Jobs section is a drill-down — Jobs lands on
  // CUSTOMERS; a customer's page puts its About cards first, then its sites;
  // a site's page puts About first, then its jobs; lists are windowed; one
  // search finds customers, sites and jobs with their path. Wide screens use
  // the same pages (Wide 1 · Pages). Equipment: four grouped tabs with
  // counts, type chips, search across groups, stacking filter chips
  // (repair open · out of service · due), the repair queue gone from here.
  const { mkCtx, signIn, skipTours, waitForUpload, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  const made = { customerId: '', siteId: '', jobIds: [], equipIds: [], ticketId: '' };
  const before = (P, a, b) => P.evaluate(([a, b]) => {
    const x = document.querySelector(a), y = document.querySelector(b);
    return Boolean(x && y && (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING));
  }, [a, b]);

  const c1 = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
  const P1 = await c1.newPage();
  P1.on('console', (m) => { if (m.type() === 'error') R.note('console: ' + m.text().slice(0, 160)); });

  await R.section('a customer with a site, two jobs, and three assets (one out of service)', async () => {
    await signIn(P1, 'blaster');
    await skipTours(P1);
    Object.assign(made, await P1.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createCustomer, createSite } = await import('/src/lib/jobContext.ts');
      const { createJob } = await import('/src/hooks/useBlastDay.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const customerId = await createCustomer({ name: `S8b Co ${stamp}`, phone: '(413) 555-0100', notes: '', billing: { street1: '1 Ledge Rd', street2: '', city: 'Richmond', state: 'MA', zip: '01254' } });
      const siteId = await createSite(customerId, { name: `S8b Pit ${stamp}`, address: '2 Quarry Rd', city: 'Richmond', state: 'MA', kFactor: 160 });
      const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const soon = new Date(); soon.setDate(soon.getDate() + 10);
      await db.sites.update(siteId, { permits: [{ id: generateId(), name: 'Blasting permit', number: 'RCH-1', expiresAt: localISO(soon) }], accessNotes: 'Gate code 4471', jurisdiction: 'Town of Richmond FD', rockType: 'granite', updatedAt: nowISO() });
      const base = { customerId, siteId, customer: `S8b Co ${stamp}`, address: '2 Quarry Rd', city: 'Richmond', state: 'MA', kFactor: 160, operation: 'quarry', typeOfRock: 'granite', typeOfTerrain: 'bench', customerPO: '' };
      const jobIds = [await createJob({ ...base, name: `S8b Job A ${stamp}` }), await createJob({ ...base, name: `S8b Job B ${stamp}` })];
      return { customerId, siteId, jobIds };
    }, stamp));
    await waitForUpload(P1);
    R.ok('customer, site and two jobs exist', Boolean(made.customerId && made.siteId && made.jobIds.length === 2));
  });

  await R.section('phone: Jobs lands on customers, windowed; one search finds all three kinds', async () => {
    await P1.goto(`${WEB}/jobs`);
    await P1.locator('[data-customers-list]').waitFor({ timeout: 10000 });
    await sleep(400);
    const rows = await P1.locator('[data-customers-list] [data-list-row]').count();
    R.ok(`Jobs lands on the customers list, windowed to 15 with Show all (${rows} rows)`, rows <= 15 && (await P1.locator('[data-customers-more]').count()) === 1);
    R.ok('the Customers · Sites · Jobs switch and the sort menu are gone', (await P1.locator('[data-lens-tabs]').count()) === 0 && (await P1.locator('[data-jobs-sort]').count()) === 0);
    await P1.locator('[data-jobs-search]').fill(stamp);
    await P1.locator('[data-jobs-results]').waitFor({ timeout: 5000 });
    await sleep(300);
    const res = await P1.locator('[data-jobs-results]').innerText();
    R.ok('the search groups its hits: Jobs · 2, Sites · 1, Customers · 1', /Jobs · 2/i.test(res) && /Sites · 1/i.test(res) && /Customers · 1/i.test(res));
    R.ok('a job hit shows its path (customer › site)', new RegExp(`job · S8b Co ${stamp} › S8b Pit ${stamp}`).test(res));
    await P1.locator(`[data-jobs-results] [data-list-row="${made.siteId}"]`).click();
    await P1.waitForURL(/\/sites\//, { timeout: 5000 });
    R.ok('tapping a site hit opens the site page', P1.url().includes(`/sites/${made.siteId}`));
    await P1.goto(`${WEB}/jobs?lens=customers`);
    await P1.locator('[data-customers-list]').waitFor({ timeout: 10000 });
    R.ok('an old ?lens= link still lands on the customers list', (await P1.locator('[data-customers-list]').count()) === 1);
  });

  await R.section('phone: the customer page — About cards first, then its sites', async () => {
    await P1.goto(`${WEB}/customers/${made.customerId}`);
    await P1.locator('[data-customer-sites]').waitFor({ timeout: 10000 });
    await sleep(300);
    const cards = await P1.locator('[data-about-card]').allInnerTexts();
    R.ok(`three About cards (${cards.map((c) => c.split('\n')[0]).join(' · ')})`, (await P1.locator('[data-about-card="company"]').count()) === 1 && (await P1.locator('[data-about-card="contacts"]').count()) === 1 && (await P1.locator('[data-about-card="compliance"]').count()) === 1);
    R.ok('the About cards come BEFORE the sites list', await before(P1, '[data-about-cards]', '[data-customer-sites]'));
    R.ok('the sites list comes before the full edit sections', await before(P1, '[data-customer-sites]', '[data-record-section="company"]'));
    R.ok('the full sections start collapsed (no inputs showing)', (await P1.locator('[data-record-section="company"] input').count()) === 0);
    await P1.locator('[data-about-card="contacts"]').click();
    await sleep(400);
    R.ok('tapping an About card opens that section', /No contacts yet|Add contact/.test(await P1.locator('[data-record-section="contacts"]').innerText()));
    const siteRow = P1.locator(`[data-customer-sites] [data-list-row="${made.siteId}"]`);
    const siteText = await siteRow.innerText();
    R.ok(`the site row reads town · K · permit countdown (${siteText.replace(/\n/g, ' | ')})`, /Richmond, MA · K 160 · permit 10d/.test(siteText));
    await P1.locator('[data-new-site]').click();
    await P1.locator('[data-new-site-form]').waitFor({ timeout: 3000 });
    R.ok('+ New site opens the form with the customer already set', new RegExp(`New site for S8b Co ${stamp}`).test(await P1.locator('[data-new-site-form]').innerText()));
    await P1.getByRole('button', { name: 'Cancel' }).first().click();
    await siteRow.click();
    await P1.waitForURL(/\/sites\//, { timeout: 5000 });
    R.ok('tapping the site row opens the site page', P1.url().includes(`/sites/${made.siteId}`));
  });

  await R.section('phone: the site page — About first, then its jobs; + New job is preset', async () => {
    await P1.locator('[data-site-jobs]').waitFor({ timeout: 10000 });
    await sleep(300);
    R.ok('four About cards: Ground · Jurisdiction & permits · Access & safety · Contacts', ['ground', 'jurisdiction', 'access', 'contacts'].every(async (id) => (await P1.locator(`[data-about-card="${id}"]`).count()) === 1) && (await P1.locator('[data-about-card]').count()) === 4);
    R.ok('the About cards come BEFORE the jobs list', await before(P1, '[data-about-cards]', '[data-site-jobs]'));
    R.ok('the permits card shows the countdown and the jurisdiction', /permit 10d[\s\S]*Town of Richmond FD/.test(await P1.locator('[data-about-card="jurisdiction"]').innerText()));
    R.ok('the ground card shows K and rock', /K 160 · granite/.test(await P1.locator('[data-about-card="ground"]').innerText()));
    R.ok('both jobs are listed with their numbers', (await P1.locator('[data-site-jobs] [data-list-row]').count()) === 2 && /\d\d-\d{3}/.test(await P1.locator('[data-site-jobs]').innerText()));
    await P1.locator('[data-new-job]').click();
    await P1.locator('[data-new-job-form]').waitFor({ timeout: 3000 });
    await sleep(500);
    const pickedCustomer = await P1.locator('[data-new-job-form] [data-pick-customer]').inputValue().catch(() => '');
    R.ok(`+ New job opens the one New job form with the customer already set (${pickedCustomer === made.customerId ? 'yes' : pickedCustomer || 'blank'})`, pickedCustomer === made.customerId);
    await P1.locator('[data-new-job-name]').fill(`S8b Job C ${stamp}`);
    await P1.locator('[data-new-job-create]').click();
    await P1.waitForURL(/\/jobs\/[a-z0-9-]+$/, { timeout: 8000 });
    made.jobIds.push(P1.url().split('/jobs/')[1]);
    await lib.waitText(P1, `S8b Co ${stamp}`, 8000).catch(() => undefined);
    R.ok('the new job opens with its breadcrumb through the customer and site', new RegExp(`S8b Co ${stamp}`).test(await P1.locator('body').innerText()) && /\/jobs\//.test(P1.url()));
    const newJob = await P1.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const j = await db.jobs.get(id); return { customer: j?.customer, city: j?.city, k: j?.kFactor }; }, made.jobIds[2]);
    R.ok(`the job made from the site carries the site's facts (${newJob.customer} · ${newJob.city} · K ${newJob.k})`, newJob.customer === `S8b Co ${stamp}` && newJob.city === 'Richmond' && newJob.k === 160);
    await waitForUpload(P1);
  });

  await R.section('wide: the same pages — About cards across the top, the list below, no sub-items', async () => {
    const c2 = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
    const P2 = await c2.newPage();
    await signIn(P2, 'blaster');
    await skipTours(P2);
    await P2.goto(`${WEB}/jobs`);
    await P2.locator('[data-customers-list]').waitFor({ timeout: 10000 });
    R.ok('the sidebar has no All jobs / Customers / Sites sub-items', (await P2.locator('aside').getByRole('link', { name: 'All jobs' }).count()) === 0 && (await P2.locator('aside').getByRole('link', { name: 'Sites', exact: true }).count()) === 0);
    await P2.goto(`${WEB}/customers/${made.customerId}`);
    await P2.locator('[data-customer-sites]').waitFor({ timeout: 10000 });
    await sleep(300);
    R.ok('wide: About cards across the top, the sites list below them', (await P2.locator('[data-about-card]').count()) === 3 && (await before(P2, '[data-about-cards]', '[data-customer-sites]')));
    R.ok('wide: the tab bar still opens a section in full', (await P2.getByRole('button', { name: /^Contacts/ }).count()) >= 1);
    await P2.getByRole('button', { name: /^Compliance/ }).first().click();
    await sleep(300);
    R.ok('the Compliance tab shows the full form', /Payment terms/.test(await P2.locator('main').innerText()));
    await P2.goto(`${WEB}/sites/${made.siteId}`);
    await P2.locator('[data-site-jobs]').waitFor({ timeout: 10000 });
    R.ok('wide site page: four About cards, then the jobs (now three)', (await P2.locator('[data-about-card]').count()) === 4 && (await P2.locator('[data-site-jobs] [data-list-row]').count()) === 3);
    await c2.close();
  });

  // Equipment is admin/supervisor/mechanic-writable (the matrix rejects a
  // blaster's upload), so the assets and the ticket are made as Mark
  const c3 = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
  const P3 = await c3.newPage();
  await R.section('equipment (admin, wide): grouped tabs, type chips, search, filters — no repair queue', async () => {
    await signIn(P3, 'mark');
    await skipTours(P3);
    Object.assign(made, await P3.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const now = nowISO();
      const due = new Date(); due.setDate(due.getDate() + 5);
      const mk = (assetNumber, description, category, extra = {}) => ({ id: generateId(), createdAt: now, updatedAt: now, syncStatus: 'local', assetNumber, description, category, isActive: true, status: 'active', ...extra });
      const eq = [mk(`S8B-R1-${stamp}`, 'S8b Sandvik DX800', 'rock_drill', { status: 'in_shop' }), mk(`S8B-P1-${stamp}`, 'S8b Ford F-250', 'pickup', { dotInspectionDue: localISO(due) }), mk(`S8B-X1-${stamp}`, 'S8b Chevy van', 'vehicle')];
      for (const e of eq) await db.equipment.put(e);
      const ticketId = generateId();
      await db.repairTickets.put({ id: ticketId, createdAt: now, updatedAt: now, syncStatus: 'local', equipmentId: eq[0].id, sourceType: 'manual', description: 'S8b hydraulic leak', outOfService: true, status: 'open', openedByName: 'Harness' });
      return { equipIds: eq.map((e) => e.id), ticketId };
    }, stamp));
    await waitForUpload(P3);
    R.ok('three assets and an open out-of-service ticket exist (made by the admin)', made.equipIds.length === 3 && Boolean(made.ticketId));
    await P3.goto(`${WEB}/admin/equipment`);
    await P3.locator('[data-equip-tabs]').waitFor({ timeout: 10000 });
    await sleep(500);
    const tabs = await P3.locator('[data-equip-tab]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-equip-tab')}:${e.getAttribute('data-count')}`));
    R.ok(`tabs: All · Drilling · Trucks & trailers · … with counts (${tabs.join(' ')})`, tabs.some((t) => t.startsWith('all:')) && tabs.some((t) => t.startsWith('drilling:')) && tabs.some((t) => t.startsWith('trucks:')));
    R.ok('the repair queue is not on this page', (await P3.getByText(/Repair queue/).count()) === 0);
    await P3.locator('[data-equip-tab="drilling"]').click();
    await sleep(200);
    const drillCats = await P3.locator('[data-equip-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-equip-cat')));
    R.ok(`the Drilling tab shows only drilling types (${[...new Set(drillCats)].join(', ')})`, drillCats.length > 0 && drillCats.every((c) => ['rock_drill', 'compressor', 'bore_tracking', 'equip_drill'].includes(c)));
    R.ok('type chips narrow the tab further', (await P3.locator('[data-equip-types] [data-equip-type]').count()) >= 2);
    await P3.locator('[data-equip-type="rock_drill"]').click();
    await sleep(200);
    R.ok('a type chip leaves only that type', (await P3.locator('[data-equip-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-equip-cat')))).every((c) => c === 'rock_drill'));
    await P3.locator('[data-equip-tab="all"]').click();
    await P3.locator('[data-equip-filter="repair"]').click();
    await sleep(200);
    const repairRows = await P3.locator('[data-equip-row]').count();
    R.ok(`Repair open drops the list to ticketed assets, header reads "N of M" (${repairRows} rows · ${await P3.locator('[data-equipment-count]').innerText()})`, repairRows >= 1 && (await P3.locator('[data-equip-row] [data-equip-repair]').count()) === repairRows && / of /.test(await P3.locator('[data-equipment-count]').innerText()));
    await P3.locator('[data-equip-filter="oos"]').click();
    await sleep(200);
    R.ok('Out of service stacks on it: the S8b drill is there, marked out of service', /out of service/.test(await P3.locator(`[data-equip-row="S8B-R1-${stamp}"]`).innerText()));
    R.ok('the tab counts follow the filters', (await P3.locator('[data-equip-tab="trucks"]').getAttribute('data-count')) === '0');
    await P3.locator('[data-equip-clear]').click();
    await sleep(200);
    R.ok('Clear resets the header to the plain total', !/ of /.test(await P3.locator('[data-equipment-count]').innerText()));
    await P3.locator('[data-equip-filter="due"]').click();
    await sleep(200);
    R.ok('Due ≤30 d finds the pickup with DOT due in 5 days', (await P3.locator(`[data-equip-row="S8B-P1-${stamp}"]`).count()) === 1);
    await P3.locator('[data-equip-clear]').click();
    await P3.locator('[data-equip-tab="trucks"]').click();
    await P3.locator('[data-equip-search]').fill('S8b ');
    await sleep(300);
    R.ok('search spans every group (3 S8b assets from a Trucks tab) and says so', (await P3.locator('[data-equip-row]').count()) === 3 && /searching all groups/.test(await P3.locator('[data-equip-tabs]').innerText()));
    R.ok('a legacy-bucket asset carries "legacy — set the type"', /legacy — set the type/.test(await P3.locator(`[data-equip-row="S8B-X1-${stamp}"]`).innerText()));
    await P3.locator('[data-equip-search]').fill('');
    await P3.locator('[data-equip-tab="trucks"]').click();
    await P3.locator('[data-equip-new]').click();
    await sleep(200);
    const preset = await P3.locator('select').filter({ hasText: 'Pickups & Trucks' }).first().inputValue().catch(() => '');
    R.ok(`+ New on the Trucks tab presets the type (${preset})`, preset === 'pickup');
  });

  await R.section('equipment on a phone (the mechanic\'s Fleet): tabs scroll, filters wrap', async () => {
    const c4 = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
    const P4 = await c4.newPage();
    await signIn(P4, 'mechanic');
    await skipTours(P4);
    await P4.goto(`${WEB}/admin/equipment`);
    await P4.locator('[data-equip-tabs]').waitFor({ timeout: 10000 });
    await sleep(300);
    const fits = await P4.evaluate(() => {
      const main = document.querySelector('main');
      return main ? main.scrollWidth <= main.clientWidth + 1 : false;
    });
    R.ok('the page does not scroll sideways on a phone', fits);
    await P4.locator('[data-equip-filter="oos"]').click();
    await sleep(200);
    R.ok('Out of service is one tap for the mechanic too', (await P4.locator(`[data-equip-row="S8B-R1-${stamp}"]`).count()) === 1);
    await c4.close();
  });

  await R.section('cleanup', async () => {
    const n1 = await P1.evaluate(async (made) => {
      const { db, deleteWithTombstone } = await import('/src/db/index.ts');
      let n = 0;
      for (const id of made.jobIds) if (await db.jobs.get(id)) { await deleteWithTombstone('jobs', id); n++; }
      if (await db.sites.get(made.siteId)) { await deleteWithTombstone('sites', made.siteId); n++; }
      if (await db.customers.get(made.customerId)) { await deleteWithTombstone('customers', made.customerId); n++; }
      return n;
    }, made);
    await waitForUpload(P1);
    const n2 = await P3.evaluate(async (made) => {
      const { db, deleteWithTombstone } = await import('/src/db/index.ts');
      let n = 0;
      if (await db.repairTickets.get(made.ticketId)) { await deleteWithTombstone('repairTickets', made.ticketId); n++; }
      for (const id of made.equipIds) if (await db.equipment.get(id)) { await deleteWithTombstone('equipment', id); n++; }
      return n;
    }, made);
    await waitForUpload(P3);
    R.ok(`removed ${n1} job-side and ${n2} equipment-side harness records`, n1 === 5 && n2 === 4);
  });

  await c3.close();
  await c1.close();
  return R.summary();
}

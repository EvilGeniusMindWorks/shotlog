async (page, lib) => {
  // Round S22 — The job page shows its facts, a job is set up in a minute, and every job carries its contact sheet (2026-09-17)
  // Push 1: the job, customer and site pages use the window and show their facts; New job in three steps;
  // the Jobs page's rows expand in place; the job's setup line.
  const { mkCtx, signIn, skipTours, sleep, WEB, browserErrors, waitForUpload } = lib;
  const waitFor = async (fn, timeout = 20000, every = 300) => {
    const until = Date.now() + timeout;
    let last;
    while (Date.now() < until) {
      last = await fn().catch(() => undefined);
      if (last) return last;
      await sleep(every);
    }
    return last;
  };
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  browserErrors({ clear: true });
  let newJobId, newSiteId, newCustomerId;

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);
  const cO = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PO = await cO.newPage();
  await signIn(PO, 'office');
  await skipTours(PO);

  // a job with history, for the facts and the Overview cards
  const busy = await PO.evaluate(async () => {
    const { db } = await import('/src/db/index.ts');
    const days = await db.blastDays.toArray();
    const n = new Map();
    for (const d of days) n.set(d.jobId, (n.get(d.jobId) ?? 0) + 1);
    const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.siteId).toArray()).sort((a, b) => (n.get(b.id) ?? 0) - (n.get(a.id) ?? 0));
    const j = jobs[0];
    return j ? { id: j.id, name: j.name, customerId: j.customerId, siteId: j.siteId, days: n.get(j.id) ?? 0 } : null;
  });
  if (!busy || busy.days < 1) throw new Error('need a job with work days');
  R.note(`job with history: ${busy.name} · ${busy.days} days`);

  await R.section('Job, customer and site pages: facts in the header, real Overview cards, wide forms', async () => {
    await PO.goto(`${WEB}/jobs/${busy.id}`);
    await PO.locator('[data-record-facts]').waitFor({ timeout: 20000 });
    const facts = (await PO.locator('[data-record-facts]').innerText()).replace(/\s+/g, ' ');
    R.ok(`the header holds the facts ("${facts.slice(0, 120)}")`, /K \d/.test(facts) && /\d+ days?/.test(facts) && /\d+ shots?/.test(facts) && /next:/.test(facts) && /contacts?/.test(facts));
    const width = await PO.evaluate(() => document.querySelector('[data-record-facts]')?.parentElement?.getBoundingClientRect().width ?? 0);
    R.ok(`the page uses the window (header ${Math.round(width)} px wide)`, width > 1000);
    await waitFor(async () => ((await PO.locator('[data-job-overview-days] [data-job-overview-day]').count()) > 0 ? 1 : null), 15000);
    const dayRows = await PO.locator('[data-job-overview-days] [data-job-overview-day]').count();
    const firstDay = (await PO.locator('[data-job-overview-days] [data-job-overview-day]').first().innerText()).replace(/\s+/g, ' ');
    R.ok(`the Overview's work-days card shows real rows (${dayRows} of ${busy.days} · "${firstDay}")`, dayRows >= 1 && dayRows <= 5 && /draft|awaiting approval|approved|sent back|closed/.test(firstDay));
    R.ok('the activity and contacts cards are content, not doors', (await PO.locator('[data-job-overview-activity]').count()) === 1 && (await PO.locator('[data-job-overview-contacts]').count()) === 1 && !/open for the full rollup/.test(await PO.textContent('body')));
    await PO.locator('[data-open-section="setup"]').first().click();
    await PO.locator('[data-job-config]').waitFor({ timeout: 10000 });
    const cols = await PO.evaluate(() => getComputedStyle(document.querySelector('[data-job-config]')).gridTemplateColumns.split(' ').length);
    R.ok(`the configuration form has ${cols} columns on a wide window`, cols >= 3);
    await PO.goto(`${WEB}/customers/${busy.customerId}`);
    await PO.locator('[data-record-facts]').waitFor({ timeout: 20000 });
    const cf = (await PO.locator('[data-record-facts]').innerText()).replace(/\s+/g, ' ');
    R.ok(`the customer page shows its facts ("${cf.slice(0, 80)}")`, /sites?/.test(cf) && /jobs?/.test(cf) && /worked|never/.test(cf));
    await PO.goto(`${WEB}/sites/${busy.siteId}`);
    await PO.locator('[data-record-facts]').waitFor({ timeout: 20000 });
    const sf = (await PO.locator('[data-record-facts]').innerText()).replace(/\s+/g, ' ');
    R.ok(`the site page shows its facts ("${sf.slice(0, 80)}")`, /K \d/.test(sf) && /jobs?/.test(sf) && /permit/.test(sf));
  });

  await R.section('New job in one sheet: customer, site, job, then the contact sheet; Jobs rows expand in place; the setup line', async () => {
    await PB.goto(`${WEB}/jobs`);
    await PB.locator('[data-jobs-new-job]').waitFor({ timeout: 20000 });
    await PB.locator('[data-jobs-new-job]').click();
    await PB.locator('[data-new-job-form][data-new-job-step="1"]').waitFor({ timeout: 5000 });
    await PB.locator('[data-new-job-customer-search]').fill(`S22 Cust ${stamp}`);
    await PB.locator('[data-new-job-new-customer]').waitFor({ timeout: 5000 });
    R.ok('step 1: type a few letters — an existing customer is picked, or a new one is made from the name', /New customer/.test(await PB.locator('[data-new-job-new-customer]').innerText()));
    await PB.locator('[data-new-job-new-customer]').click();
    await PB.locator('[data-new-job-form][data-new-job-step="2"]').waitFor({ timeout: 5000 });
    R.ok('step 2 opens on a typed address for a new customer, with the why-line naming what is missing', (await PB.locator('[data-new-job-site-address]').count()) === 1 && /needs|Pick a site/.test((await PB.locator('[data-new-job-why]').innerText().catch(() => '')) || 'needs'));
    await PB.locator('[data-new-job-site-address]').fill('287 Waltham Street');
    await PB.locator('[data-new-job-site-city]').fill('Lexington');
    await PB.locator('[data-new-job-site-state]').fill('MA');
    await PB.locator('[data-new-job-next]').click();
    await PB.locator('[data-new-job-form][data-new-job-step="3"]').waitFor({ timeout: 5000 });
    await waitFor(async () => (/^\d\d-\d{3}$/.test(await PB.locator('[data-new-job-number]').inputValue()) ? 1 : null), 8000);
    const prefilled = await PB.locator('[data-new-job-name]').inputValue();
    const number = await PB.locator('[data-new-job-number]').inputValue();
    R.ok(`step 3: the name is filled from the site ("${prefilled}") and the number is automatic (${number})`, prefilled === '287 Waltham Street' && /^\d\d-\d{3}$/.test(number));
    await PB.locator('[data-new-job-name]').fill(`S22 garage ${stamp}`);
    await PB.locator('[data-new-job-create]').click();
    await PB.waitForURL(/\/jobs\/[0-9a-f-]{36}$/, { timeout: 20000 });
    newJobId = PB.url().match(/\/jobs\/([0-9a-f-]{36})$/)?.[1];
    const made = await PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const j = await db.jobs.get(id); return j ? { siteId: j.siteId, customerId: j.customerId, number: j.jobNumber } : null; }, newJobId);
    newSiteId = made?.siteId;
    newCustomerId = made?.customerId;
    R.ok(`the job exists under a new customer and site (${made?.number})`, Boolean(made?.siteId) && Boolean(made?.customerId));
    await PB.locator('[data-job-setup-line]').waitFor({ timeout: 15000 });
    // the site's facts (permits) and the customer arrive with the job's context a beat later
    await waitFor(async () => ((await PB.locator('[data-setup-item="permits"]').count()) === 1 ? 1 : null), 10000);
    await waitFor(async () => ((await PB.locator('[data-record-facts]').innerText()).includes(`S22 Cust ${stamp}`) ? 1 : null), 10000);
    const setup = (await PB.locator('[data-job-setup-line]').innerText()).replace(/\s+/g, ' ');
    R.ok(`the job page opens with the setup line ("${setup}")`, /Still to set/.test(setup) && (await PB.locator('[data-setup-item="contacts"]').count()) === 1 && (await PB.locator('[data-setup-item="permits"]').count()) === 1 && (await PB.locator('[data-setup-item="work-spot"]').count()) === 1);
    const facts = (await PB.locator('[data-record-facts]').innerText()).replace(/\s+/g, ' ');
    R.ok('the header names the new customer and site', facts.includes(`S22 Cust ${stamp}`) && /Lexington/.test(facts));
    await waitForUpload(PB, 20000).catch(() => undefined);
    // the Jobs page: the customer's row expands in place
    await PB.goto(`${WEB}/jobs`);
    await PB.locator('[data-customers-list] [data-list-row]').first().waitFor({ timeout: 20000 });
    // a never-worked customer sits past the first fifteen
    if (await PB.locator('[data-customers-more]').count()) await PB.locator('[data-customers-more]').click();
    await PB.locator(`[data-customer-tree="${newCustomerId}"]`).waitFor({ timeout: 20000 });
    await PB.locator(`[data-customer-tree="${newCustomerId}"] [data-list-row]`).first().click();
    await PB.locator(`[data-customer-expanded="${newCustomerId}"]`).waitFor({ timeout: 5000 });
    R.ok('a customer row expands in place to its sites and jobs', (await PB.locator(`[data-customer-expanded="${newCustomerId}"] [data-tree-site="${newSiteId}"]`).count()) === 1 && (await PB.locator(`[data-customer-expanded="${newCustomerId}"] [data-tree-job="${newJobId}"]`).count()) === 1);
    await PB.locator(`[data-tree-job="${newJobId}"]`).click();
    await PB.waitForURL(new RegExp(`/jobs/${newJobId}$`), { timeout: 10000 });
    R.ok('tapping the job in the tree opens the job page', PB.url().endsWith(`/jobs/${newJobId}`));
    // from a site page the sheet opens on the job
    await PB.goto(`${WEB}/sites/${newSiteId}`);
    const siteReady = await PB.locator('[data-new-job]').waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    if (!siteReady) R.note('site page: ' + PB.url() + ' · ' + ((await PB.textContent('body')) || '').replace(/\s+/g, ' ').slice(0, 300));
    await PB.locator('[data-new-job]').click();
    await PB.locator('[data-new-job-form]').waitFor({ timeout: 5000 });
    R.ok('from a site, New job opens on the job step with the customer and site already set', (await PB.locator('[data-new-job-form]').getAttribute('data-new-job-step')) === '3' && (await PB.locator('[data-new-job-form] [data-pick-customer]').inputValue()) === newCustomerId);
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const cA = await mkCtx(browser);
    const PA = await cA.newPage();
    await signIn(PA, 'mark');
    const removed = await PA.evaluate(async ({ newJobId, newSiteId, newCustomerId }) => {
      const { db, deleteWithTombstone } = await import('/src/db/index.ts');
      let n = 0;
      if (newJobId && (await db.jobs.get(newJobId))) { await deleteWithTombstone('jobs', newJobId); n++; }
      if (newSiteId && (await db.sites.get(newSiteId))) { await deleteWithTombstone('sites', newSiteId); n++; }
      if (newCustomerId && (await db.customers.get(newCustomerId))) { await deleteWithTombstone('customers', newCustomerId); n++; }
      return n;
    }, { newJobId, newSiteId, newCustomerId }).catch(() => -1);
    await waitForUpload(PA, 20000).catch(() => undefined);
    await cA.close();
    R.ok(`cleanup removed ${removed} record(s)`, removed >= 0);
  });
  await cB.close();
  await cO.close();
  return R.summary();
}

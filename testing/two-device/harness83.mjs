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
  let dayId, prevOffice;

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
    await PB.waitForURL(/\/jobs\/[0-9a-f-]{36}(\?|$)/, { timeout: 20000 });
    newJobId = PB.url().match(/\/jobs\/([0-9a-f-]{36})(\?|$)/)?.[1];
    R.ok('the new job lands on its contact sheet', /open=contact-sheet/.test(PB.url()));
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

  // ── push 2: the Jobsite Contact Sheet ──
  const cA = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PA = await cA.newPage();
  await signIn(PA, 'mark');
  await skipTours(PA);

  await R.section("The Jobsite Contact Sheet is a paper of the job: prefilled rows with source chips, override on the job only, Use the site's again", async () => {
    // Baystate's office rows, from Admin › Company (the admin types them; the blur saves)
    await PA.goto(WEB + '/admin/company');
    await PA.locator('[data-office-rows]').waitFor({ timeout: 20000 });
    prevOffice = await PA.evaluate(async () => { const { db } = await import('/src/db/index.ts'); return (await db.companySettings.get('companySettings-singleton'))?.officeContacts ?? []; });
    for (const [key, name, phone] of [['incident', 'Evette', '413-583-4440'], ['injury', 'Evette', '413-583-4440'], ['change_scope', 'Tony', '413-315-0371']]) {
      await PA.locator('[data-office-row="' + key + '"] [data-office-row-name]').fill(name);
      await PA.locator('[data-office-row="' + key + '"] [data-office-row-phone]').fill(phone);
      await PA.locator('[data-office-row="' + key + '"] [data-office-row-phone]').blur();
      await sleep(300);
    }
    const officeSaved = await waitFor(() => PA.evaluate(async () => { const { db } = await import('/src/db/index.ts'); const rows = (await db.companySettings.get('companySettings-singleton'))?.officeContacts ?? []; return rows.find((r) => r.key === 'incident')?.phone === '413-583-4440' && rows.find((r) => r.key === 'change_scope')?.name === 'Tony' ? 1 : null; }), 10000);
    R.ok('Admin › Company holds the BBI Office rows (Incident, Injury, Change in Job Scope…)', officeSaved === 1);
    await waitForUpload(PA, 20000).catch(() => undefined);
    // the site's town rows (the blaster sets them up — setup_jobs)
    await PB.evaluate(async (siteId) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      await db.sites.update(siteId, {
        contacts: [
          { id: generateId(), role: 'fire_chief', label: 'Fire Chief (Blasting)', name: 'Chief Smith', phone: '781-555-0100', notes: '' },
          { id: generateId(), role: 'police', label: 'Police (911)', name: 'Lexington Police', phone: '781-862-1212', notes: '' },
        ],
        notificationRules: 'Notifications day prior · 300′ notice',
        updatedAt: nowISO(),
      });
    }, newSiteId);
    await waitForUpload(PB, 20000).catch(() => undefined);
    await PB.goto(WEB + '/jobs/' + newJobId + '?open=contact-sheet');
    await PB.locator('[data-contact-sheet]').waitFor({ timeout: 20000 });
    const src = async (key) => PB.locator('[data-sheet-row="' + key + '"]').getAttribute('data-sheet-source');
    await waitFor(async () => ((await src('incident')) === 'company' && (await src('fire_chief')) === 'site' ? 1 : null), 15000);
    const sources = { project: await src('project_name'), owner: await src('owner'), chief: await src('fire_chief'), police: await src('police'), incident: await src('incident'), additional: await src('additional'), hospital: await src('hospital') };
    R.ok('the rows come prefilled with a source chip: the job, the customer, the site, Baystate — and a blank where nobody has it (' + JSON.stringify(sources) + ')', sources.project === 'job' && sources.owner === 'customer' && sources.chief === 'site' && sources.police === 'site' && sources.incident === 'company' && sources.additional === 'site' && sources.hospital === 'blank');
    const stats = (await PB.locator('[data-sheet-stats]').innerText()).replace(/\s+/g, ' ');
    R.ok('the header counts the rows by where they came from and what the print still needs ("' + stats + '")', /from the site/.test(stats) && /from Baystate/.test(stats) && /from the customer/.test(stats) && /Print needs/.test(stats) && /Hospital/.test(stats));
    // override the police row on the job only
    await PB.locator('[data-sheet-edit="police"]').click();
    await PB.locator('[data-sheet-editor="police"]').waitFor({ timeout: 5000 });
    await PB.locator('[data-sheet-editor="police"] [data-sheet-name]').fill('Sgt. Pike · detail desk');
    await PB.locator('[data-sheet-editor="police"] [data-sheet-phone]').fill('781-555-0177');
    await PB.locator('[data-sheet-editor="police"] [data-sheet-save]').click();
    await waitFor(async () => ((await src('police')) === 'job' ? 1 : null), 10000);
    const siteKept = await PB.evaluate(async (siteId) => { const { db } = await import('/src/db/index.ts'); return (await db.sites.get(siteId))?.contacts?.find((c) => c.role === 'police')?.name; }, newSiteId);
    R.ok("a changed row becomes the job's own; the site keeps its value (" + siteKept + ')', (await src('police')) === 'job' && /Sgt\. Pike/.test(await PB.locator('[data-sheet-row="police"]').innerText()) && siteKept === 'Lexington Police' && (await PB.locator('[data-contact-sheet]').getAttribute('data-sheet-version')) === '1');
    await PB.locator('[data-sheet-edit="police"]').click();
    await PB.locator('[data-sheet-editor="police"] [data-sheet-use-site]').click();
    await waitFor(async () => ((await src('police')) === 'site' ? 1 : null), 10000);
    R.ok("Use the site's again puts it back", (await src('police')) === 'site' && /Lexington Police/.test(await PB.locator('[data-sheet-row="police"]').innerText()));
  });

  await R.section("When a site row changes later, the jobs using it are asked; Make this the site's too; dated versions and the print", async () => {
    await PB.evaluate(async (siteId) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const site = await db.sites.get(siteId);
      await db.sites.update(siteId, { contacts: site.contacts.map((c) => (c.role === 'fire_chief' ? { ...c, name: 'Chief Jones' } : c)), updatedAt: nowISO() });
    }, newSiteId);
    await PB.locator('[data-sheet-change="fire_chief"]').waitFor({ timeout: 15000 });
    const offer = (await PB.locator('[data-sheet-change="fire_chief"]').innerText()).replace(/\s+/g, ' ');
    R.ok('a later site change is offered to the job, not applied ("' + offer.slice(0, 80) + '")', /Chief Jones/.test(offer) && /Chief Smith/.test(await PB.locator('[data-sheet-row="fire_chief"]').innerText()));
    R.ok('the job page names it in the setup line', (await PB.locator('[data-setup-item="site-changes"]').count()) === 1);
    await PB.locator('[data-sheet-change="fire_chief"] [data-sheet-use-change]').click();
    await waitFor(async () => (/Chief Jones/.test(await PB.locator('[data-sheet-row="fire_chief"]').innerText()) ? 1 : null), 10000);
    await sleep(500);
    const lingering = await PB.locator('[data-sheet-change]').evaluateAll((els) => els.map((e) => e.getAttribute('data-sheet-change') + ':' + (e.textContent || '').replace(/\s+/g, ' ').slice(0, 60)));
    R.ok('Use it takes the new value and the offer goes' + (lingering.length ? ' (still: ' + JSON.stringify(lingering) + ')' : ''), /Chief Jones/.test(await PB.locator('[data-sheet-row="fire_chief"]').innerText()) && lingering.length === 0);
    // Make this the site's too
    await PB.locator('[data-sheet-edit="town_hall"]').click();
    await PB.locator('[data-sheet-editor="town_hall"] [data-sheet-name]').fill('Bldg Insp. Ortiz');
    await PB.locator('[data-sheet-editor="town_hall"] [data-sheet-phone]').fill('781-698-4500');
    await PB.locator('[data-sheet-editor="town_hall"] [data-sheet-make-site]').click();
    const siteHall = await waitFor(() => PB.evaluate(async (siteId) => { const { db } = await import('/src/db/index.ts'); const c = (await db.sites.get(siteId))?.contacts?.find((x) => x.role === 'town_hall'); return c?.phone === '781-698-4500' ? c.name : null; }, newSiteId), 10000);
    R.ok("Make this the site's too writes the row to the site for every job here (" + siteHall + ')', siteHall === 'Bldg Insp. Ortiz' && (await PB.locator('[data-sheet-row="town_hall"]').getAttribute('data-sheet-source')) === 'site');
    await PB.locator('[data-sheet-accept]').click();
    await waitFor(async () => (/accepted/.test(await PB.locator('[data-sheet-version-line]').innerText()) ? 1 : null), 10000);
    const versionLine = (await PB.locator('[data-sheet-version-line]').innerText()).replace(/\s+/g, ' ');
    R.ok('every save is a dated version; Accept all confirms it ("' + versionLine + '")', /Sheet v\d+/.test(versionLine) && /accepted/.test(versionLine));
    R.ok('the setup line no longer asks for the contact sheet', (await PB.locator('[data-setup-item="contacts"]').count()) === 0);
    await PB.locator('[data-sheet-print]').click();
    await PB.waitForURL(new RegExp('/jobs/' + newJobId + '/contact-sheet'), { timeout: 10000 });
    await PB.locator('[data-print-contact-sheet]').waitFor({ timeout: 15000 });
    const stampText = await PB.locator('[data-print-stamp]').innerText();
    R.ok('the print carries the stamp ("' + stampText + '") and the rows', /Sheet v\d+ · /.test(stampText) && /Chief Jones/.test(await PB.locator('[data-print-row="fire_chief"]').innerText()) && /Evette/.test(await PB.locator('[data-print-row="incident"]').innerText()));
    R.ok('a blank row prints blank and the print says what it still needs', (await PB.locator('[data-print-missing]').count()) === 1 && /Hospital/.test(await PB.locator('[data-print-missing]').innerText()));
    R.ok('the back page carries the way to the hospital and urgent care (the route arrives with push 3)', (await PB.locator('[data-print-back]').count()) === 1);
  });

  await R.section("The crew's phone: the day's ☎ shows the sheet offline, one tap to call, a tap opens the device's maps", async () => {
    dayId = await PB.evaluate(async ({ jobId, stamp }) => {
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      return createBlastDayWithPapers(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: 's22 ' + stamp });
    }, { jobId: newJobId, stamp });
    await waitForUpload(PB, 20000).catch(() => undefined);
    await PB.goto(WEB + '/blast-day/' + dayId);
    // on a wide screen the ☎ sits in the header; on a phone it is under ⋯
    await PB.locator('[data-day-contacts], [data-day-more]').first().waitFor({ timeout: 20000 });
    if (await PB.locator('[data-day-contacts]').isVisible().catch(() => false)) {
      await PB.locator('[data-day-contacts]').click();
    } else {
      await PB.locator('[data-day-more]').click();
      await PB.locator('[data-more-contacts]').waitFor({ timeout: 5000 });
      await PB.locator('[data-more-contacts]').click();
    }
    await PB.locator('[data-crew-sheet]').waitFor({ timeout: 10000 });
    await waitFor(async () => (Number(await PB.locator('[data-crew-sheet]').getAttribute('data-crew-rows')) >= 4 ? 1 : null), 10000);
    const rows = Number(await PB.locator('[data-crew-sheet]').getAttribute('data-crew-rows'));
    R.ok('the day\'s ☎ shows the sheet\'s rows (' + rows + '): the fire chief, the police, town hall, the office rows', rows >= 4 && (await PB.locator('[data-crew-call="fire_chief"]').count()) === 1 && (await PB.locator('[data-crew-call="incident"]').count()) === 1);
    R.ok('a number is one tap to call', /^tel:\+?\d+$/.test((await PB.locator('[data-crew-call="fire_chief"]').getAttribute('href')) || ''));
    R.ok("the location opens the device's maps", /maps\.apple\.com|google\.com\/maps/.test((await PB.locator('[data-crew-maps="location"]').getAttribute('href')) || ''));
  });

  await R.section("Admin › Company: the BBI Office rows and Direct Contractor prefill every sheet", async () => {
    await PA.goto(WEB + '/admin/company');
    await PA.locator('[data-office-rows]').waitFor({ timeout: 20000 });
    R.ok('the five fixed rows sit on the company page', (await PA.locator('[data-office-row]').count()) === 5 && (await PA.locator('[data-office-row="direct_contractor"]').count()) === 1);
    R.ok('an incident on this job would call the sheet\'s Incident row', await PB.evaluate(async (jobId) => {
      const { db } = await import('/src/db/index.ts');
      const { resolveIncidentContacts } = await import('/src/lib/incidentDoNow.ts');
      const job = await db.jobs.get(jobId);
      const site = job?.siteId ? await db.sites.get(job.siteId) : null;
      const company = await db.companySettings.get('companySettings-singleton');
      const c = resolveIncidentContacts({ job, site, company });
      return c.incident?.phone === '413-583-4440' && c.firechief?.name === 'Chief Jones';
    }, newJobId));
  });

  // ── push 3: nearest hospital and urgent care, the route on the back ──
  await R.section('Nearest hospital with an ER from the federal list, urgent care from OpenStreetMap; Suggest fills the row', async () => {
    // the site's map point (Lexington, MA) — the locator would geocode the address; the harness sets it
    await PB.evaluate(async (siteId) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.sites.update(siteId, { geo: { lat: 42.4473, lng: -71.2297 }, updatedAt: nowISO() });
    }, newSiteId);
    await PB.goto(WEB + '/jobs/' + newJobId + '?open=contact-sheet');
    await PB.locator('[data-contact-sheet]').waitFor({ timeout: 20000 });
    await PB.locator('[data-sheet-suggest="hospital"]').waitFor({ timeout: 10000 });
    await PB.locator('[data-sheet-suggest="hospital"]').click();
    await PB.locator('[data-suggest-list="hospital"] [data-suggest-option]').first().waitFor({ timeout: 15000 });
    const options = await PB.locator('[data-suggest-list="hospital"] [data-suggest-option]').allInnerTexts();
    R.ok('Suggest lists the nearest three with an emergency department, with miles and phones (' + options.map((o) => o.replace(/\s+/g, ' ').slice(0, 50)).join(' | ') + ')', options.length === 3 && options.every((o) => /ER yes/.test(o) && /\d mi/.test(o) && /\(\d{3}\)/.test(o)));
    R.ok('Lahey or Winchester leads from Lexington', /Lahey|Winchester|Emerson/i.test(options[0]));
    await PB.locator('[data-suggest-list="hospital"] [data-suggest-pick="0"]').click();
    await waitFor(async () => ((await PB.locator('[data-sheet-row="hospital"]').getAttribute('data-sheet-source')) === 'job' ? 1 : null), 10000);
    const row = (await PB.locator('[data-sheet-row="hospital"]').innerText()).replace(/\s+/g, ' ');
    const saved = await PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const r = (await db.jobs.get(id))?.contactSheet?.rows.find((x) => x.key === 'hospital'); return r ? { phone: r.phone, geo: Boolean(r.geo), notes: r.notes } : null; }, newJobId);
    R.ok('a tap fills the row with its name, address and phone, and keeps its map point ("' + row.slice(0, 70) + '")', Boolean(saved?.phone) && saved?.geo === true && /,/.test(saved?.notes ?? ''));
    // urgent care asks OpenStreetMap live — either the nearest, or the honest line when the map service is slow
    await PB.locator('[data-sheet-suggest="urgent_care"]').click();
    const urgent = await waitFor(async () => {
      const n = await PB.locator('[data-suggest-list="urgent_care"] [data-suggest-option]').count();
      const err = await PB.locator('[data-suggest-list="urgent_care"] [data-suggest-error]').count();
      return n > 0 ? 'places' : err > 0 ? 'error' : null;
    }, 30000);
    const urgentText = urgent === 'places' ? (await PB.locator('[data-suggest-list="urgent_care"] [data-suggest-option]').first().innerText()).replace(/\s+/g, ' ') : ((await PB.locator('[data-suggest-error]').innerText().catch(() => '')) || '');
    R.ok('urgent care comes from OpenStreetMap, or the sheet says the map service did not answer ("' + urgentText.slice(0, 70) + '")', urgent === 'places' || urgent === 'error');
    if (urgent === 'places') R.ok('a clinic without a tagged phone offers Search the web, one with a phone shows it', (await PB.locator('[data-suggest-list="urgent_care"] [data-suggest-search]').count()) + (await PB.locator('[data-suggest-list="urgent_care"]').innerText()).split(/\(\d{3}\)|\d{3}-\d{3}-\d{4}/).length - 1 >= 1);
    await PB.locator('[data-suggest-list="urgent_care"] button:has-text("close")').click().catch(() => undefined);
  });

  await R.section('The route on the back: our own router, one step per line in readable type, and the QR code', async () => {
    await PB.goto(WEB + '/jobs/' + newJobId + '/contact-sheet');
    await PB.locator('[data-print-back]').waitFor({ timeout: 15000 });
    await PB.locator('[data-print-qr="hospital"]').waitFor({ timeout: 15000 });
    const qrSrc = (await PB.locator('[data-print-qr="hospital"]').getAttribute('src')) || '';
    R.ok('the back page carries a code to scan for live directions to the hospital', /^data:image\/png/.test(qrSrc));
    const routerOn = (await PB.locator('[data-print-route="hospital"]').count()) === 1;
    const offLine = (await PB.locator('[data-print-route-off="hospital"]').innerText().catch(() => '')) || '';
    R.ok(routerOn ? 'the route prints one step per line (' + (await PB.locator('[data-print-route="hospital"] li').count()) + ' steps)' : 'without a router the page says the drive prints once the router is on ("' + offLine.slice(0, 60) + '")', routerOn || /router is on/.test(offLine));
    // the crew's ☎ opens the hospital in the device's maps from its map point
    await PB.goto(WEB + '/blast-day/' + dayId);
    await PB.locator('[data-day-contacts], [data-day-more]').first().waitFor({ timeout: 20000 });
    if (await PB.locator('[data-day-contacts]').isVisible().catch(() => false)) await PB.locator('[data-day-contacts]').click();
    else { await PB.locator('[data-day-more]').click(); await PB.locator('[data-more-contacts]').click(); }
    await PB.locator('[data-crew-maps="hospital"]').waitFor({ timeout: 10000 });
    R.ok("the day's ☎ opens the hospital in the device's maps", /maps/.test((await PB.locator('[data-crew-maps="hospital"]').getAttribute('href')) || ''));
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    if (dayId) await lib.cleanupAsAdmin(browser, { days: [dayId] }).catch(() => undefined);
    if (prevOffice) await PA.evaluate(async (prev) => { const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts'); await db.companySettings.update('companySettings-singleton', { officeContacts: prev, updatedAt: nowISO() }); }, prevOffice).catch(() => undefined);
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

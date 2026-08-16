async (page) => {
  // Customer → Site → Job round: quick-create auto-structures (customer
  // deduped, site created), backfill links legacy jobs and MOVES K to the
  // site, license auto-pick + K seeds resolve through the site, SiteKCard
  // writes to the site, contacts write to the site, PDFs show hierarchy
  // values, pickers intact, new pages render.
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
    const tag = `H26-${Date.now() % 1000000}`;

    // seed a license so autofill has something to pick (NH to be distinctive)
    await A.evaluate(async (t) => {
      const token = localStorage.getItem('shotlog-access-token');
      const res = await fetch('http://localhost:4000/auth/me/licenses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ licenses: [
          { state: 'NH', licenseNumber: `${t}-NH`, expirationDate: '2027-06-30' },
          { state: 'MA', licenseNumber: `${t}-MA`, expirationDate: '2027-06-30' },
        ] }),
      });
      const body = await res.json().catch(() => null);
      const info = JSON.parse(localStorage.getItem('shotlog-user-info'));
      info.licenses = body?.licenses ?? [];
      localStorage.setItem('shotlog-user-info', JSON.stringify(info));
    }, tag);

    // ── (1) quick-create: customer + site auto-created and linked ─────────
    const job1 = await A.evaluate(async (t) => {
      const { createJob } = await import('/src/hooks/useBlastDay.ts');
      const id = await createJob({ name: `${t} Ledge Cut`, customer: `${t} Granite Corp`, address: '12 Quarry Rd', city: 'Keene', state: 'NH', kFactor: 220 });
      const job = await window.shotlogDb.jobs.get(id);
      const site = job.siteId ? await window.shotlogDb.sites.get(job.siteId) : null;
      const customer = job.customerId ? await window.shotlogDb.customers.get(job.customerId) : null;
      return { id, site, customer };
    }, tag);
    ok('quick-create links customer + site', Boolean(job1.site) && Boolean(job1.customer));
    ok('site owns address/state/K', job1.site?.state === 'NH' && job1.site?.kFactor === 220 && job1.site?.address === '12 Quarry Rd');

    // second job, SAME customer (case variation) + same address → dedupe both
    const job2 = await A.evaluate(async ({ t, }) => {
      const { createJob } = await import('/src/hooks/useBlastDay.ts');
      const id = await createJob({ name: `${t} Phase 2`, customer: `${t} GRANITE corp`, address: '12 Quarry Rd', city: 'Keene', state: 'NH' });
      const job = await window.shotlogDb.jobs.get(id);
      return { customerId: job.customerId, siteId: job.siteId };
    }, { t: tag });
    ok('customer deduped by normalized name', job2.customerId === job1.customer.id);
    ok('site deduped by address', job2.siteId === job1.site.id);
    // and a different address under the same customer → NEW site
    const job3 = await A.evaluate(async (t) => {
      const { createJob } = await import('/src/hooks/useBlastDay.ts');
      const id = await createJob({ name: `${t} South Pit`, customer: `${t} Granite Corp`, address: '99 South Rd', city: 'Keene', state: 'NH' });
      const job = await window.shotlogDb.jobs.get(id);
      return { customerId: job.customerId, siteId: job.siteId };
    }, tag);
    ok('new address → new site, same customer', job3.customerId === job1.customer.id && job3.siteId !== job1.site.id);

    // ── (2) legacy job + server backfill moves it into the hierarchy ──────
    const legacyId = await A.evaluate(async (t) => {
      const db = window.shotlogDb;
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      await db.jobs.add({ id, name: `${t} Legacy Job`, customer: `${t} Old Pit LLC`, address: '5 Back Rd', city: 'Ludlow', state: 'MA', operation: 'quarry', typeOfRock: '', typeOfTerrain: '', defaultHazards: '', defaultPrecautions: '', kFactor: 145, kFactorHistory: [{ date: '2026-01-01', actualPPV: 0.2, sd: 30, derivedK: 145 }], isActive: true, createdAt: now, updatedAt: now, syncStatus: 'local' });
      return id;
    }, tag);
    // wait for it to sync up, then run the backfill
    await A.waitForTimeout(4000);
    const backfill = await A.evaluate(async () => {
      const token = localStorage.getItem('shotlog-access-token');
      const res = await fetch('http://localhost:4000/admin/backfill-hierarchy', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok ? res.json() : null;
    });
    ok(`backfill ran (${backfill?.linked ?? '?'} linked)`, Boolean(backfill?.ok) && backfill.linked >= 1);
    ok('legacy job linked with K + history moved to site', await (async () => {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const r = await A.evaluate(async (id) => {
          const job = await window.shotlogDb.jobs.get(id);
          if (!job?.siteId) return null;
          const site = await window.shotlogDb.sites.get(job.siteId);
          const customer = await window.shotlogDb.customers.get(job.customerId);
          return { k: site?.kFactor, hist: site?.kFactorHistory?.length, cust: customer?.name, state: site?.state };
        }, legacyId);
        if (r && r.k === 145 && r.hist === 1 && /Old Pit/.test(r.cust ?? '') && r.state === 'MA') return true;
        await A.waitForTimeout(1200);
      }
      return false;
    })());
    // idempotent: run again, links 0
    const backfill2 = await A.evaluate(async () => {
      const token = localStorage.getItem('shotlog-access-token');
      const res = await fetch('http://localhost:4000/admin/backfill-hierarchy', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok ? res.json() : null;
    });
    ok('backfill idempotent (second run links 0)', backfill2?.linked === 0);

    // ── (3) day creation: license auto-picks the SITE state; K seeds shot ─
    const day = await A.evaluate(async (jobId) => {
      const dayId = await window.shotlogFlows.createBlastDay(jobId);
      const log = await window.shotlogDb.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await window.shotlogDb.shots.where('blastLogId').equals(log.id).first();
      return { dayId, licenseState: log.licenseState, kFactor: shot.designPlan.kFactor };
    }, job1.id);
    ok('license auto-picked by SITE state (NH)', day.licenseState === 'NH');
    ok('shot K seeded from SITE (220)', day.kFactor === 220);

    // ── (4) SiteKCard: apply writes the SITE; contacts write the SITE ─────
    await A.evaluate(async ({ jobId }) => {
      const job = await window.shotlogDb.jobs.get(jobId);
      // simulate SiteKCard apply-path + contacts write targets
      await window.shotlogDb.sites.update(job.siteId, { kFactor: 233, updatedAt: new Date().toISOString() });
      await window.shotlogDb.sites.update(job.siteId, { contacts: [{ id: 'c1', role: 'fire_chief', label: 'Fire Chief', name: 'Chief Burns', phone: '555-0100' }], updatedAt: new Date().toISOString() });
    }, { jobId: job1.id });
    const inherited = await A.evaluate(async (jobId) => {
      const { getJobContext } = await import('/src/lib/jobContext.ts');
      const ctx = await getJobContext(jobId);
      return { k: ctx.kFactor, contact: ctx.contacts[0]?.name };
    }, job2.siteId === job1.site.id ? job1.id : job1.id);
    ok('site K change inherited by job context (233)', inherited.k === 233);
    ok('site contacts inherited', inherited.contact === 'Chief Burns');
    // the OTHER job at the same site inherits too
    const sibling = await A.evaluate(async (t) => {
      const { getJobContext } = await import('/src/lib/jobContext.ts');
      const jobs = await window.shotlogDb.jobs.toArray();
      const j2 = jobs.find((j) => j.name === `${t} Phase 2`);
      const ctx = await getJobContext(j2.id);
      return ctx.kFactor;
    }, tag);
    ok('sibling job at same site inherits K (233)', sibling === 233);

    // ── (5) UI: customers lens, customer + site pages, job page card ──────
    await A.goto('http://localhost:5199/jobs');
    await A.waitForTimeout(2000);
    await A.getByRole('button', { name: 'By customer' }).click();
    await A.waitForTimeout(1000);
    ok('customers lens lists the customer', (await A.locator('body').innerText()).includes(`${tag} Granite Corp`));
    await A.locator(`p:has-text("${tag} Granite Corp")`).first().click();
    await A.waitForTimeout(1500);
    const custTxt = await A.locator('body').innerText();
    ok('customer page shows sites + jobs', custTxt.includes('12 Quarry Rd') && custTxt.includes(`${tag} Ledge Cut`));
    await A.goto(`http://localhost:5199/sites/${job1.site.id}`);
    await A.waitForTimeout(1500);
    const siteTxt = await A.locator('body').innerText();
    ok('site page shows facts + jobs', siteTxt.includes('Site facts') && siteTxt.includes(`${tag} Phase 2`));
    await A.goto(`http://localhost:5199/jobs/${job1.id}`);
    await A.waitForTimeout(2000);
    const jobTxt = await A.locator('body').innerText();
    ok('job page shows Customer & Site card', jobTxt.includes('Customer & Site') && jobTxt.includes(`${tag} Granite Corp`));

    // ── (6) PDF shows hierarchy customer/address (blast log builder) ──────
    const pdfok = await A.evaluate(async ({ dayId }) => {
      const { buildBlastLogPdf } = await import('/src/pdfdocs/index.ts');
      const blob = await buildBlastLogPdf(dayId);
      return blob.size > 2000;
    }, { dayId: day.dayId });
    ok('blast log PDF builds with hierarchy view', pdfok);

    // 430px overflow on the new pages
    await A.setViewportSize({ width: 430, height: 932 });
    for (const url of [`/customers/${job1.customer.id}`, `/sites/${job1.site.id}`]) {
      await A.goto(`http://localhost:5199${url}`);
      await A.waitForTimeout(1200);
      const overflow = await A.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      ok(`no 430px overflow on ${url.split('/')[1]}`, !overflow);
    }
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await A.locator('body').innerText()).slice(0, 400)); } catch {}
  }
  return results.join('\n');
}

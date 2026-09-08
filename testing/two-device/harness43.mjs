async (page) => {
  // Round S7b — hierarchy + day dialog + Settings + sign-out + records by
  // bucket (2026-09-07): the New work day dialog reads Name → Recent →
  // Customer → Site → Job → Date → Type → Copy; a lone site/job fills in;
  // type follows the last day, else the job's default, else the device,
  // else the role; one New job flow (Customer → Site → Job) from the
  // dialog and the Jobs lens; lens tabs Customers · Sites · Jobs; Settings
  // reorganised with no Log out; Profile signs out; Records opens on the
  // bucket's own paper with "Show everything" one tap away.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const API = 'http://localhost:4000';
  const WEB = 'http://localhost:5199';
  const tag = Date.now().toString().slice(-5);

  const mkCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', '${API}');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-tour-done', '1');
      localStorage.setItem('shotlog-first-week-hidden', '1');
    `);
    return ctx;
  };
  const signIn = async (P, email, pass) => {
    await P.goto(WEB);
    await P.locator('input[type="email"]').fill(email);
    await P.locator('input[type="password"]').fill(pass);
    await P.getByRole('button', { name: 'Sign in' }).click();
    await P.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await P.waitForTimeout(2500);
  };
  const openDialog = async (P) => {
    await P.goto(WEB);
    await P.locator('[data-tour="fab"]').waitFor({ timeout: 10000 });
    await P.locator('[data-tour="fab"]').click();
    await P.locator('[data-new-day-dialog]').waitFor({ timeout: 5000 });
    await P.waitForTimeout(600);
  };
  const selectedChip = async (P) =>
    (await P.locator('[data-new-day-dialog] button.bg-navy').allInnerTexts()).join('|');
  const order = async (P, selectors) => {
    const idx = [];
    for (const s of selectors) idx.push(await P.locator(s).first().evaluate((el) => Array.from(document.querySelectorAll('*')).indexOf(el)));
    return idx.every((v, i) => i === 0 || v > idx[i - 1]);
  };
  try {
    // ── A. blaster: the dialog order, the cascade, the type prefill ─────
    const c1 = await mkCtx();
    const P1 = await c1.newPage();
    await signIn(P1, 'blaster@test.local', 'blaster-pass-123');
    // Fixture: one customer with ONE site and ONE job (blasters may create jobs)
    const fx = await P1.evaluate(async (tag) => {
      const { createJob } = await import('/src/hooks/useBlastDay.ts');
      const { db } = await import('/src/db/index.ts');
      const jobId = await createJob({
        name: `S7b solo job ${tag}`, customer: `S7b Solo Co ${tag}`, address: '1 Solo Rd', city: 'Lee', state: 'MA', kFactor: 160,
        operation: 'trench', typeOfRock: 'Shale', typeOfTerrain: 'Flat',
      });
      const job = await db.jobs.get(jobId);
      return { jobId, customerId: job.customerId, siteId: job.siteId, jobNumber: job.jobNumber };
    }, tag);
    await openDialog(P1);
    const dlg = P1.locator('[data-new-day-dialog]');
    // S8 Option B: Name first, then ONE Job row that opens the Customer › Site › Job picker
    ok('dialog order: Name → Job → Date → Type of work',
      await order(P1, ['[data-day-name]', '[data-day-job]', '[data-day-date]', '[data-new-day-dialog] button.bg-navy']));
    await P1.locator('[data-day-job]').click();
    await P1.locator('[data-job-picker]').waitFor({ timeout: 5000 });
    ok('the picker opens on Customer', (await P1.locator('[data-job-picker]').getAttribute('data-pick-level')) === 'customers');
    await P1.locator(`[data-choose-customer="${fx.customerId}"]`).waitFor({ timeout: 5000 });
    await P1.locator(`[data-choose-customer="${fx.customerId}"]`).click();
    await P1.waitForTimeout(800);
    ok('a customer with one site fills the site in', (await P1.locator('[data-day-job]').getAttribute('data-day-site-id')) === fx.siteId);
    ok('a site with one job fills the job in — and the picker closes', (await P1.locator('[data-day-job]').getAttribute('data-day-job-id')) === fx.jobId && (await P1.locator('[data-job-picker]').count()) === 0);
    ok('type of work follows the role for a job with no days and no default (Drill to Blast)', /Drill to Blast/.test(await selectedChip(P1)));
    ok('Copy from previous is absent for a job with no days', (await P1.locator('[data-day-copy]').count()) === 0);
    // The job's own default type takes over
    await P1.evaluate(async (jobId) => {
      const { db } = await import('/src/db/index.ts');
      await db.jobs.update(jobId, { defaultTypeOfWork: 'drill_to_excavate' });
    }, fx.jobId);
    await P1.keyboard.press('Escape');
    await openDialog(P1);
    await P1.locator('[data-day-job]').click();
    await P1.locator(`[data-choose-customer="${fx.customerId}"]`).click();
    await P1.waitForTimeout(600);
    ok("the job's default type of work prefills (Drill to Excavate)", /Drill to Excavate/.test(await selectedChip(P1)));
    await P1.locator('[data-day-name]').fill('S7b first day');
    await P1.locator('[data-day-start]').click();
    await P1.waitForURL(/blast-day\//, { timeout: 10000 });
    const day1 = await P1.evaluate(async (jobId) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.blastDays.where('jobId').equals(jobId).toArray())[0];
    }, fx.jobId);
    ok('the day was created with that type', day1?.typeOfWork === 'drill_to_excavate' && day1?.name === 'S7b first day');
    // Now the LAST day wins over the job default; copy defaults to it
    await P1.evaluate(async (jobId) => {
      const { db } = await import('/src/db/index.ts');
      await db.jobs.update(jobId, { defaultTypeOfWork: 'blasting' });
    }, fx.jobId);
    await openDialog(P1);
    await P1.locator(`[data-recent-job="${fx.jobNumber}"]`).waitFor({ timeout: 5000 });
    await P1.locator(`[data-recent-job="${fx.jobNumber}"]`).click();
    await P1.waitForTimeout(600);
    ok('a Recent chip selects the job and fills customer + site', (await P1.locator('[data-day-job]').getAttribute('data-day-job-id')) === fx.jobId && (await P1.locator('[data-day-job]').getAttribute('data-day-customer-id')) === fx.customerId);
    ok("the job's LAST day beats its default (Drill to Excavate, not Blasting)", /Drill to Excavate/.test(await selectedChip(P1)));
    // S7 follow-up (Matthew): copying is opt-in — the select starts blank
    ok('Copy from previous is offered but starts BLANK', (await P1.locator('[data-day-copy]').count()) === 1 && (await P1.locator('[data-day-copy]').inputValue()) === '');
    await P1.locator('[data-day-copy]').selectOption(day1.id);
    await P1.waitForTimeout(300);
    ok('non-blasting type: only Crew & Equipment is offered to copy', (await dlg.locator('input[type="checkbox"]').count()) === 1);
    ok('same-date warning shows for a second day today', /already has a work day on this date/.test(await dlg.innerText()));
    // New job from inside the dialog: Customer → Site → Job, customer carried over
    // + New job lives inside the picker, at the site level, customer and site carried over
    await P1.locator('[data-day-job]').click();
    await P1.locator('[data-job-picker]').waitFor({ timeout: 5000 });
    await P1.locator('[data-pick-new-job]').click();
    await P1.locator('[data-new-job-form]').waitFor({ timeout: 5000 });
    await P1.locator(`[data-new-job-form] [data-pick-customer] option[value="${fx.customerId}"]`).waitFor({ state: 'attached', timeout: 5000 });
    await P1.waitForTimeout(300);
    ok('New job form opens inside the dialog with the customer carried over', (await P1.locator('[data-new-job-form] [data-pick-customer]').inputValue()) === fx.customerId);
    ok('New job form order: customer/site before the job name', await order(P1, ['[data-new-job-form] [data-pick-customer]', '[data-new-job-form] [data-pick-site]', '[data-new-job-name]']));
    await P1.locator('[data-new-job-name]').fill(`S7b second job ${tag}`);
    await P1.locator('[data-new-job-work]').selectOption('crushing');
    await P1.locator('[data-new-job-create]').click();
    await P1.waitForTimeout(800);
    const newJob = await P1.evaluate(async (tag) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.jobs.toArray()).find((j) => j.name === `S7b second job ${tag}`);
    }, tag);
    ok('the new job exists under the same customer + site with its default type', Boolean(newJob) && newJob.customerId === fx.customerId && newJob.siteId === fx.siteId && newJob.defaultTypeOfWork === 'crushing' && /^\d\d-\d{3}$/.test(newJob.jobNumber ?? ''));
    await P1.waitForFunction((id) => document.querySelector('[data-day-job]')?.getAttribute('data-day-job-id') === id, newJob?.id, { timeout: 6000 }).catch(() => undefined);
    await P1.waitForTimeout(400);
    ok('the dialog now has the new job selected and its default type', (await P1.locator('[data-day-job]').getAttribute('data-day-job-id')) === newJob?.id && /Crushing/.test(await selectedChip(P1)) && (await P1.locator('[data-job-picker]').count()) === 0);
    await P1.keyboard.press('Escape');
    // Device preference: what a new day starts as
    await P1.goto(`${WEB}/settings`);
    await P1.locator('[data-pref-work-type]').waitFor({ timeout: 8000 });
    await P1.locator('[data-pref-work-type]').selectOption('hauling');
    await P1.evaluate(async (tag) => {
      const { createJob } = await import('/src/hooks/useBlastDay.ts');
      await createJob({ name: `S7b plain job ${tag}`, customer: `S7b Plain Co ${tag}`, address: '2 Plain Rd', city: 'Lee', state: 'MA', kFactor: 160 });
    }, tag);
    await openDialog(P1);
    const plainCustomer = await P1.evaluate(async (tag) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.customers.toArray()).find((c) => c.name === `S7b Plain Co ${tag}`)?.id;
    }, tag);
    await P1.locator('[data-day-job]').click();
    await P1.locator(`[data-choose-customer="${plainCustomer}"]`).click();
    await P1.waitForTimeout(600);
    ok("the device's default type of work applies when job and last day say nothing (Hauling)", /Hauling/.test(await selectedChip(P1)));
    await P1.keyboard.press('Escape');
    await P1.evaluate(() => localStorage.removeItem('shotlog-default-work-type'));

    // ── B. Jobs lens + Settings + Profile ───────────────────────────────
    await P1.goto(`${WEB}/jobs`);
    await P1.waitForTimeout(1500);
    ok('S8b: Jobs lands on the customers list (no lens tabs)', (await P1.locator('[data-customers-list]').count()) === 1 && (await P1.locator('[data-lens-tabs]').count()) === 0);
    const siteId = await P1.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const s = (await db.sites.toArray()).find((x) => !x.archivedAt && x.customerId);
      return s?.id ?? '';
    });
    await P1.goto(`${WEB}/sites/${siteId}`);
    await P1.locator('[data-new-job]').waitFor({ timeout: 8000 });
    await P1.locator('[data-new-job]').click();
    await P1.locator('[data-new-job-form]').waitFor({ timeout: 5000 });
    ok('a site\'s + New job uses the same New job form (customer/site first)', await order(P1, ['[data-new-job-form] [data-pick-customer]', '[data-new-job-name]']));
    await P1.goto(`${WEB}/settings`);
    await P1.locator('[data-settings-page]').waitFor({ timeout: 8000 });
    const settings = await P1.locator('[data-settings-page]').innerText();
    ok('Settings has no Log out', !/Log out/i.test(settings));
    ok('Settings order: You → Preferences → Help → Data & device (last)', await order(P1, ['[data-you-card]', '[data-preferences-card]', '[data-help-card]', '[data-data-device-card]']));
    ok('Data & device holds Reset local data, Export and the build', (await P1.locator('[data-settings-reset]').count()) === 1 && (await P1.locator('[data-settings-export]').count()) === 1 && /Build /.test(await P1.locator('[data-data-device-card]').innerText()));
    ok('You card links to the profile', (await P1.locator('[data-settings-profile]').getAttribute('href')) === '/profile');
    ok('no usual-rig preference for a blaster', (await P1.locator('[data-pref-usual-rig]').count()) === 0);
    await P1.locator('[data-theme-choice="dark"]').click();
    await P1.waitForTimeout(300);
    const darkOn = await P1.evaluate(() => document.documentElement.classList.contains('dark'));
    const railSays = await P1.locator('aside').innerText();
    ok('dark mode from Settings applies and the rail toggle follows', darkOn && /Light mode/.test(railSays));
    await P1.locator('[data-theme-choice="light"]').click();
    await P1.waitForTimeout(300);
    ok('back to light', !(await P1.evaluate(() => document.documentElement.classList.contains('dark'))));
    await P1.goto(`${WEB}/profile`);
    await P1.locator('[data-profile-sign-out]').waitFor({ timeout: 8000 });
    ok('My Profile is where Sign Out lives', (await P1.locator('[data-profile-sign-out]').count()) === 1);
    // Records: field bucket opens on its own paper
    await P1.goto(`${WEB}/records`);
    await P1.locator('[data-records-facets]').waitFor({ timeout: 10000 });
    await P1.waitForTimeout(1500);
    const fieldKinds = await P1.locator('[data-records-facets] [data-facet-kind]').count();
    ok(`field bucket opens on blast logs · daily reports · drill logs · incidents (${fieldKinds})`, fieldKinds === 4 && (await P1.locator('[data-records-scope-toggle="everything"]').count()) === 1);
    await P1.locator('[data-records-scope-toggle="everything"]').click();
    await P1.waitForTimeout(400);
    ok('Show everything lists all nine kinds', (await P1.locator('[data-records-facets] [data-facet-kind]').count()) === 9);
    await c1.close();

    // ── C. driller + mechanic + office buckets ──────────────────────────
    const c2 = await mkCtx();
    const P2 = await c2.newPage();
    await signIn(P2, 'dinis@test.local', 'dinis-pass-123');
    await P2.goto(`${WEB}/settings`);
    await P2.locator('[data-preferences-card]').waitFor({ timeout: 8000 });
    ok('driller Preferences offers the usual rig', (await P2.locator('[data-pref-usual-rig]').count()) === 1);
    await P2.goto(`${WEB}/records`);
    await P2.locator('[data-records-facets]').waitFor({ timeout: 10000 });
    await P2.waitForTimeout(1500);
    const dk = await P2.locator('[data-records-facets] [data-facet-kind]').allInnerTexts();
    ok(`driller bucket: drill logs · checklists · time cards (${dk.map((t) => t.split('\n')[0]).join(', ')})`, dk.length === 3 && /Drill Log/.test(dk[0]) && /Checklist/.test(dk[1]) && /Time Card/.test(dk[2]));
    await c2.close();

    const c3 = await mkCtx();
    const P3 = await c3.newPage();
    await signIn(P3, 'mechanic@test.local', 'mech-pass-1234');
    await P3.goto(`${WEB}/records`);
    await P3.locator('[data-records-facets]').waitFor({ timeout: 10000 });
    await P3.waitForTimeout(1500);
    const mk = await P3.locator('[data-records-facets] [data-facet-kind]').allInnerTexts();
    ok(`mechanic bucket: checklists · repair tickets · services · hour corrections (${mk.map((t) => t.split('\n')[0]).join(', ')})`, mk.length === 4 && /Checklist/.test(mk[0]) && /Repair Ticket/.test(mk[1]) && /Service/.test(mk[2]) && /Hour Correction/.test(mk[3]));
    await c3.close();

    const c4 = await mkCtx();
    const P4 = await c4.newPage();
    await signIn(P4, 'office@test.local', 'office-pass-123');
    await P4.goto(`${WEB}/records`);
    await P4.locator('[data-records-facets]').waitFor({ timeout: 10000 });
    await P4.waitForTimeout(1500);
    ok('office sees everything, no default filter', (await P4.locator('[data-records-facets] [data-facet-kind]').count()) === 9 && (await P4.locator('[data-records-scope-toggle]').count()) === 0);
    ok('office Settings has no Log out either', !/Log out/i.test(await (await P4.goto(`${WEB}/settings`), P4.locator('[data-settings-page]')).innerText()));
    await c4.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
  }
  return results.join('\n');
}

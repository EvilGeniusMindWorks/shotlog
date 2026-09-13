async (page, lib) => {
  // Round S11 — the first week's small fixes (2026-09-13): a job always has a
  // real site (and can be moved), four-decimal weights, the first-week card's
  // exits, nearby jobs with the job's work spot, and the crash inbox that
  // needs no vendor — web crash, server crash, decoded trace, admin tab.
  const { mkCtx, signIn, skipTours, sleep, WEB, browserErrors, apiLogin } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  browserErrors({ clear: true });
  const days = [];
  const restore = { sites: [] };
  let jobId, siteAId, siteBId, siteNoPointId, jobNoPointId, custId;
  let dayId;
  let webCode, webCrashId, serverCode, decodeCode;
  const fingerprints = new Set();

  // Near = the phone stands 0.07 mi from site A. No tiles, no real geocoder.
  const HERE = { latitude: 42.441, longitude: -72.63 };
  const cB = await mkCtx(browser, {
    viewport: { width: 1280, height: 900 },
    permissions: ['geolocation'],
    geolocation: { ...HERE, accuracy: 12 },
  });
  await cB.route(/basemap\.nationalmap\.gov|tile\.openstreetmap\.org|arcgisonline\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }),
  );
  await cB.route('**/nominatim.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);
  const { token: adminToken, api } = await apiLogin(PB, 'mark');
  const { token: blasterToken } = await apiLogin(PB, 'blaster');

  await R.section('A job needs a site (required field, no nameless customer, move job to another site)', async () => {
    const r = await PB.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createJob } = await import('/src/hooks/useBlastDay.ts');
      const { ensureCustomerAndSite, createSite } = await import('/src/lib/jobContext.ts');
      const { pickWhyNot, emptyPick } = await import('/src/components/forms/CustomerSitePicker.tsx');
      const ghostsBefore = (await db.customers.filter((c) => !c.name.trim()).count()) + (await db.sites.filter((s) => !s.name.trim() && !s.address.trim()).count());
      // A customer with TWO sites — the case that bit Mark (one site auto-picks)
      const { customerId, siteId: siteA } = await ensureCustomerAndSite({ customerName: `S11 Customer ${stamp}`, siteName: `S11 Site A ${stamp}`, address: '1 Quarry Rd', city: 'Richmond', state: 'MA' });
      const siteB = await createSite(customerId, { name: `S11 Site B ${stamp}`, address: '2 Ledge Ln', city: 'Granby', state: 'MA' });
      // The bug's exact call: customer picked, site left at "Pick site…", legacy customer string empty
      let refused = '';
      try {
        await createJob({ name: `S11 no-site ${stamp}`, customer: '', customerId, siteId: undefined, address: '', city: '', state: '' });
      } catch (e) {
        refused = e.message;
      }
      let ghostRefused = '';
      try {
        await ensureCustomerAndSite({ customerName: '', address: '', city: '', state: '' });
      } catch (e) {
        ghostRefused = e.message;
      }
      const ghostsAfter = (await db.customers.filter((c) => !c.name.trim()).count()) + (await db.sites.filter((s) => !s.name.trim() && !s.address.trim()).count());
      const whyNoSite = pickWhyNot({ ...emptyPick({ customerId }), customerName: 'x' });
      const whyPartial = pickWhyNot({ ...emptyPick({ customerId }), customerName: 'x', siteName: 'Pit', address: '', state: 'MA' });
      const whyOk = pickWhyNot({ ...emptyPick({ customerId }), customerName: 'x', siteName: 'Pit', address: '5 Main', state: 'MA' });
      // A good job on site A; typed new site under the picked customer also works
      const jobId = await createJob({ name: `S11 job ${stamp}`, customer: '', customerId, siteId: siteA, address: '', city: '', state: '' });
      const typedJob = await createJob({ name: `S11 typed-site ${stamp}`, customer: '', customerId, siteId: undefined, siteName: `S11 Site C ${stamp}`, address: '3 Bench Way', city: 'Ludlow', state: 'MA' });
      const typed = await db.jobs.get(typedJob);
      const typedSite = typed?.siteId ? await db.sites.get(typed.siteId) : null;
      return { refused, ghostRefused, ghostsBefore, ghostsAfter, whyNoSite, whyPartial, whyOk, jobId, siteA, siteB, customerId, typedSiteName: typedSite?.name ?? null, typedSiteCustomer: typedSite?.customerId === customerId };
    }, stamp);
    jobId = r.jobId; siteAId = r.siteA; siteBId = r.siteB; custId = r.customerId;
    R.ok(`the bug's call is refused: "${r.refused}"`, /needs a site/i.test(r.refused));
    R.ok(`a nameless customer is refused: "${r.ghostRefused}"`, /needs a name/i.test(r.ghostRefused));
    R.ok('no ghost customer or site was created', r.ghostsAfter === r.ghostsBefore);
    R.ok(`Create's why-line with no site: "${r.whyNoSite}"`, /pick a site/i.test(r.whyNoSite ?? ''));
    R.ok(`why-line with a half-typed site names the missing part: "${r.whyPartial}"`, /address/i.test(r.whyPartial ?? ''));
    R.ok('name + state + address is enough', r.whyOk === null);
    R.ok('a typed new site is created under the picked customer', r.typedSiteName?.includes('Site C') && r.typedSiteCustomer);

    // Move the job to site B from the job page
    await PB.goto(`${WEB}/jobs/${jobId}`);
    await PB.locator('[data-job-move]').waitFor({ timeout: 15000 });
    await PB.locator('[data-job-move]').click();
    await PB.locator('[data-job-move-sheet]').waitFor({ timeout: 5000 });
    await PB.locator('[data-job-move-search]').fill(`Site B ${stamp}`);
    await PB.locator(`[data-job-move-site="${siteBId}"]`).click();
    await PB.locator('[data-job-move-confirm]').click();
    await sleep(800);
    const moved = await PB.evaluate(async ({ jobId, siteA }) => {
      const { db } = await import('/src/db/index.ts');
      const { countLifecycleChildren } = await import('/src/lib/lifecycle.ts');
      const j = await db.jobs.get(jobId);
      const s = await db.sites.get(j.siteId);
      const oldSiteChildren = (await countLifecycleChildren('sites', siteA)).reduce((n, c) => n + (c.count ?? 0), 0);
      return { siteId: j.siteId, address: j.address, customerId: j.customerId, siteCustomer: s?.customerId, oldSiteChildren };
    }, { jobId, siteA: siteAId });
    R.ok('the job now sits on site B and its mirrored address follows', moved.siteId === siteBId && /Ledge/.test(moved.address));
    R.ok('the job\'s customer is the site\'s customer', moved.customerId === moved.siteCustomer);
    R.ok('site A is now unused — the existing delete-if-never-used rule allows it', moved.oldSiteChildren === 0);
    R.ok('the job page shows "Where the work is"', await PB.locator('[data-job-location]').count() > 0);
  });

  await R.section('Weights to four decimals on screen, print and PDF; PF from exact pounds', async () => {
    const pure = await PB.evaluate(async () => {
      const f = await import('/src/lib/format.ts');
      return { a: f.fmtLbs(25), b: f.fmtLbs(1233.6215), c: f.fmtLbsCsv(1233.6215), d: f.fmtMultiplier(3.3333000000000004), e: f.fmtMultiplier(1), g: f.fmtPF(0.6168) };
    });
    R.ok(`whole pounds read 25.0000 (${pure.a})`, pure.a === '25.0000');
    R.ok(`thousands separated (${pure.b})`, pure.b === '1,233.6215');
    R.ok(`CSV has no commas (${pure.c})`, pure.c === '1233.6215');
    R.ok(`a catalog multiplier reads as written (${pure.d}, ${pure.e})`, pure.d === '3.3333' && pure.e === '1');
    R.ok(`PF stays two decimals (${pure.g})`, pure.g === '0.62');
    const made = await PB.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const { todayISO, nowISO, generateId } = await import('/src/lib/utils.ts');
      const today = todayISO();
      const taken = new Set((await db.blastDays.filter((d) => d.date === today).toArray()).map((d) => d.jobId));
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !taken.has(j.id) && Boolean(j.siteId) && !j.name.startsWith('S11')).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const job = jobs[0];
      const id = await createBlastDay(job.id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `S11 weights ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      await db.shots.update(shot.id, { totals: { ...shot.totals, totalYardsShot: 2000 }, updatedAt: nowISO() });
      const products = [{ productId: 'harness', productName: 'Harness Stick', manufacturer: 'Harness', category: 'high_explosive', quantity: 19, unitType: 'stick', weightMultiplier: 2.6315, totalWeight: 19 * 2.6315, shotAllocations: { [shot.id]: 19 } }];
      const existing = await db.explosiveUsages.where('blastLogId').equals(log.id).first();
      if (existing) await db.explosiveUsages.update(existing.id, { products, totalPoundsShot: 19 * 2.6315, updatedAt: nowISO() });
      else await db.explosiveUsages.add({ id: generateId(), blastLogId: log.id, products, totalPoundsShot: 19 * 2.6315, detonators: [], leadLine: 0, coverType: '', createdAt: nowISO(), updatedAt: nowISO(), syncStatus: 'local' });
      return { id };
    }, stamp);
    dayId = made.id; days.push(dayId);
    await PB.goto(`${WEB}/blast-day/${dayId}/print`);
    await sleep(1500);
    const text = await PB.locator('body').innerText();
    R.ok('the printed blasting log shows 49.9985 lbs', text.includes('49.9985'));
    R.ok('the PF line divides the exact pounds (49.9985 ÷ 2,000)', /49\.9985\s*(lbs?\s*)?[÷/]/.test(text));
    R.ok('no one-decimal "50.0" remains on the page', !/\b50\.0\b/.test(text));
  });

  await R.section('First-week card leaves on done / first filed day / 14 days, back from ? menu', async () => {
    const rules = await PB.evaluate(async () => {
      const { firstWeekExit } = await import('/src/components/guidance/FirstWeekCard.tsx');
      const now = new Date('2026-09-20T12:00:00Z');
      return {
        fresh: firstWeekExit('2026-09-13T08:00:00Z', false, now),
        filed: firstWeekExit('2026-09-13T08:00:00Z', true, now),
        old: firstWeekExit('2026-09-01T08:00:00Z', false, now),
        unknown: firstWeekExit(null, false, now),
      };
    });
    R.ok(`a week in, unfiled: stays and says when it goes ("${rules.fresh.until}")`, !rules.fresh.leave && /Sep 27/.test(rules.fresh.until));
    R.ok('after the first filed day: leaves', rules.filed.leave);
    R.ok('after 14 days: leaves', rules.old.leave);
    R.ok('no first-sign-in stamp: stays until a filed day', !rules.unknown.leave && /first day/.test(rules.unknown.until));
    // This blaster has filed days, so the card is gone — the ? menu brings it back
    await PB.goto(`${WEB}/`);
    await PB.locator('main').waitFor({ timeout: 15000 });
    await sleep(600);
    R.ok('the card is not on the home of someone who has filed', (await PB.locator('[data-first-week]').count()) === 0);
    const helpBtn = PB.locator('button:has(svg.lucide-circle-help), button:has(.lucide-circle-help)').first();
    let viaMenu = false;
    if (await helpBtn.count()) {
      await helpBtn.click();
      const item = PB.locator('[data-help-first-week]');
      if (await item.count()) {
        await item.click();
        viaMenu = true;
      }
    }
    if (!viaMenu) await PB.evaluate(async () => (await import('/src/components/guidance/FirstWeekCard.tsx')).showFirstWeekCard());
    await PB.locator('[data-first-week]').waitFor({ timeout: 5000 }).catch(() => undefined);
    R.ok(`the card is back (${viaMenu ? 'from the ? menu' : 'by the same call the menu makes'})`, (await PB.locator('[data-first-week]').count()) === 1);
    R.ok('and says it stays by request', /by request/i.test(await PB.locator('[data-first-week-until]').innerText().catch(() => '')));
    await PB.locator('[data-first-week-hide]').click();
    await sleep(300);
    R.ok('Hide puts it away again', (await PB.locator('[data-first-week]').count()) === 0);
  });

  await R.section("Nearby jobs in the Which job? sheet, save the site's spot", async () => {
    const seeded = await PB.evaluate(async ({ stamp, siteB, custId }) => {
      const { db } = await import('/src/db/index.ts');
      const { createJob } = await import('/src/hooks/useBlastDay.ts');
      const { ensureCustomerAndSite } = await import('/src/lib/jobContext.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      // site B (our job) is 0.07 mi from the phone; a far site 100 mi away
      const b = await db.sites.get(siteB);
      await db.sites.update(siteB, { geo: { lat: 42.44, lng: -72.63 }, updatedAt: nowISO() });
      const far = await ensureCustomerAndSite({ customerName: `S11 Far ${stamp}`, siteName: `S11 Far site ${stamp}`, address: '9 North Rd', city: 'Concord', state: 'NH' });
      await db.sites.update(far.siteId, { geo: { lat: 43.5, lng: -71.0 }, updatedAt: nowISO() });
      const farJob = await createJob({ name: `S11 far job ${stamp}`, customer: '', customerId: far.customerId, siteId: far.siteId, address: '', city: '', state: '' });
      // a job whose site has no address and no point: the offer case
      const none = await ensureCustomerAndSite({ customerName: `S11 Customer ${stamp}`, siteName: `S11 Nowhere ${stamp}`, address: '', city: '', state: 'MA' });
      const noneJob = await createJob({ name: `S11 nowhere job ${stamp}`, customer: '', customerId: none.customerId, siteId: none.siteId, address: '', city: '', state: '' });
      return { farJob, noneJob, noneSite: none.siteId, hadGeo: b?.geo ?? null };
    }, { stamp, siteB: siteBId, custId });
    jobNoPointId = seeded.noneJob; siteNoPointId = seeded.noneSite;
    await PB.goto(`${WEB}/`);
    await PB.locator('main').waitFor({ timeout: 15000 });
    await sleep(500);
    await PB.locator('button:has-text("Start work at")').first().click();
    await PB.locator('[data-day-job]').waitFor({ timeout: 8000 });
    await PB.locator('[data-day-job]').click();
    await PB.locator('[data-pick-nearby-block]').waitFor({ timeout: 8000 });
    await PB.locator('[data-pick-gps-line]').filter({ hasText: /ft/ }).waitFor({ timeout: 8000 }).catch(() => undefined);
    R.ok('"Use my location" is on and has a fix', /ft/.test(await PB.locator('[data-pick-gps-line]').innerText().catch(() => '')));
    const nearChip = PB.locator(`[data-pick-nearby="${jobId}"]`);
    await nearChip.waitFor({ timeout: 8000 }).catch(() => undefined); // the chips land a beat after the fix (site lookups)
    R.ok(`our job (0.07 mi away) is a Nearby chip (${await nearChip.count()} chip(s); ${await PB.locator('[data-pick-nearby]').count()} nearby in all)`, (await nearChip.count()) >= 1);
    R.ok(`with its distance (${await nearChip.locator('[data-pick-nearby-miles]').innerText().catch(() => '—')})`, /here|0\.\d mi/.test(await nearChip.locator('[data-pick-nearby-miles]').innerText().catch(() => '')));
    R.ok('the far job (100 mi) is not a Nearby chip', (await PB.locator(`[data-pick-nearby="${seeded.farJob}"]`).count()) === 0);
    R.ok('nothing was picked for us', (await PB.locator('[data-day-job-id]').getAttribute('data-day-job-id').catch(() => '')) === '' || (await PB.locator('[data-day-job]').count()) === 0);
    // The offer: a job with no point at all, picked through search
    await PB.locator('[data-pick-search]').fill(`nowhere job ${stamp}`);
    await PB.locator(`[data-choose-job="${jobNoPointId}"]`).click();
    await PB.locator('[data-day-spot-offer]').waitFor({ timeout: 5000 });
    R.ok('a job with no point offers to save where I am standing', /where you're standing/i.test(await PB.locator('[data-day-spot-offer]').innerText()));
    await PB.locator('[data-day-spot-offer-save]').click();
    await PB.locator('[data-day-spot-saved]').waitFor({ timeout: 5000 });
    const after = await PB.evaluate(async (jobId) => {
      const { db } = await import('/src/db/index.ts');
      const j = await db.jobs.get(jobId);
      return { spot: j?.workSpot ?? null };
    }, jobNoPointId);
    R.ok(`the job's work spot is saved from GPS (${after.spot ? `${after.spot.lat.toFixed(3)}, ${after.spot.lng.toFixed(3)}` : 'none'})`, after.spot?.source === 'gps' && Math.abs(after.spot.lat - HERE.latitude) < 0.001);
    await PB.keyboard.press('Escape').catch(() => undefined);
    await PB.goto(`${WEB}/`);
    await PB.locator('main').waitFor({ timeout: 15000 });
    // The job page: previous job's spot offered to a sibling; the design page saves to the job
    const sibling = await PB.evaluate(async ({ jobId, siteId }) => {
      const { db } = await import('/src/db/index.ts');
      const { createJob } = await import('/src/hooks/useBlastDay.ts');
      const { siblingWorkSpot } = await import('/src/lib/siteGeo.ts');
      const site = await db.sites.get(siteId);
      const j2 = await createJob({ name: `S11 sibling ${Date.now()}`, customer: '', customerId: site.customerId, siteId, address: '', city: '', state: '' });
      const s = await siblingWorkSpot(await db.jobs.get(j2));
      return { offered: s?.job.id ?? null };
    }, { jobId: jobNoPointId, siteId: siteNoPointId });
    R.ok("a new job at the same site is offered the previous job's spot", sibling.offered === jobNoPointId);
  });

  await R.section('Crash reporting: a thrown error reaches the reporter (stub) on web and API', async () => {
    // (a) a web error, no Report tap
    await PB.goto(`${WEB}/jobs`);
    await PB.locator('main').waitFor({ timeout: 15000 });
    await PB.evaluate((stamp) => {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error(`S11 harness crash ${stamp}`), message: `S11 harness crash ${stamp}` }));
    }, stamp);
    await sleep(500);
    const body = await PB.locator('body').innerText();
    const m = /Report code ([A-Z2-9]{6})/.exec(body);
    webCode = m?.[1] ?? null;
    R.ok(`the toast carries a six-character report code (${webCode ?? 'none'})`, Boolean(webCode));
    let group = null;
    for (let i = 0; i < 20 && !group; i++) {
      const r = await api('/feedback/crashes', {}, adminToken);
      group = (r.body?.groups ?? []).find((g) => g.title.includes(`S11 harness crash ${stamp}`)) ?? null;
      if (!group) await sleep(500);
    }
    if (group) fingerprints.add(group.fingerprint);
    R.ok('the crash is a line in Admin › Crashes within seconds, without a Report tap', Boolean(group) && group.side === 'web' && group.count === 1);
    const one = await api(`/feedback/code/${webCode}`, {}, adminToken);
    webCrashId = one.body?.crash?.id ?? null;
    R.ok('the report code finds it', one.status === 200 && one.body?.crash?.reportCode === webCode);
    R.ok('with breadcrumbs (the screens opened before it)', /BREADCRUMBS/.test(one.body?.bundle ?? '') && /nav\s+\/jobs/.test(one.body?.bundle ?? ''));
    R.ok('and who, which build, which screen', /Who:\s+.*blaster/i.test(one.body?.bundle ?? '') && /Where:\s+\/jobs/.test(one.body?.bundle ?? ''));
    // the same error again is one line, count 2 (a second device would count too)
    await PB.evaluate((stamp) => {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error(`S11 harness crash ${stamp}`), message: `S11 harness crash ${stamp}` }));
    }, stamp);
    await sleep(1200);
    const again = await api('/feedback/crashes', {}, adminToken);
    const g2 = (again.body?.groups ?? []).find((g) => g.fingerprint === group?.fingerprint);
    R.ok('a repeat on the same device within five minutes is throttled (still one report)', g2?.count === 1);
    // a person's words attach to the crash
    const words = await api('/feedback', { method: 'POST', body: JSON.stringify({ id: `s11words${stamp}`, kind: 'crash', message: 'I tapped Jobs and it went white', parentId: webCrashId }) }, blasterToken);
    const withWords = await api(`/feedback/code/${webCode}`, {}, adminToken);
    R.ok('a person\'s words attach to the same crash', words.status === 201 && (withWords.body?.words ?? []).some((w) => /went white/.test(w.message)));

    // (b) a server failure
    const srv = await api('/platform/crash-test', { method: 'POST', body: '{}' }, adminToken);
    serverCode = srv.body?.reportCode ?? null;
    R.ok(`a route that throws answers 500 with a report code (${serverCode ?? 'none'})`, srv.status === 500 && Boolean(serverCode));
    const srvRow = await api(`/feedback/code/${serverCode}`, {}, adminToken);
    if (srvRow.body?.crash?.fingerprint) fingerprints.add(srvRow.body.crash.fingerprint);
    R.ok('it is a server-side line with a readable trace', srvRow.body?.crash?.crash?.kind === 'server' && /crash-test|index\.ts/.test(srvRow.body?.bundle ?? ''));

    // (c) a minified trace decodes through this build's source map
    const buildId = `harness-${stamp}`;
    const map = JSON.stringify({ version: 3, file: 'h.js', sources: ['../../src/harness.ts'], names: ['boom'], mappings: 'AAAAA' });
    const up = await PB.request.fetch(`${lib.API}/platform/sourcemaps`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer dev-sourcemap-token' }, data: { buildId, files: [{ file: 'h.js', map }] } });
    R.ok('the build can upload its source maps', up.status() === 200);
    const dec = await api('/feedback', { method: 'POST', body: JSON.stringify({ id: `s11decode${stamp}`, kind: 'crash', auto: true, message: `S11 decode ${stamp}`, buildId, route: '/x', crash: { kind: 'error', message: `S11 decode ${stamp}`, stack: `Error: S11 decode ${stamp}\n    at boom (http://localhost/assets/h.js:1:5)` } }) }, blasterToken);
    decodeCode = dec.body?.reportCode ?? null;
    if (dec.body?.fingerprint) fingerprints.add(dec.body.fingerprint);
    const decRow = await api(`/feedback/code/${decodeCode}`, {}, adminToken);
    const frame = decRow.body?.crash?.crash?.frames?.[0];
    R.ok(`the minified frame reads as the real file (${frame?.source ?? '?'}:${frame?.sourceLine ?? '?'} ${frame?.sourceFn ?? ''})`, frame?.source === 'src/harness.ts' && frame?.sourceLine === 1 && frame?.sourceFn === 'boom');
    R.ok('the bundle says so', /decoded from source maps/.test(decRow.body?.bundle ?? ''));

    // (d) Admin › Feedback › Crashes, apart from feedback
    const cA = await mkCtx(browser);
    const PA = await cA.newPage();
    await signIn(PA, 'mark');
    await skipTours(PA);
    await PA.goto(`${WEB}/admin/feedback?tab=crashes`);
    await PA.locator('[data-admin-crashes]').waitFor({ timeout: 15000 });
    await sleep(800);
    const row = PA.locator('[data-crash-group]').filter({ hasText: `S11 harness crash ${stamp}` }).first();
    R.ok('the Crashes tab lists the problem', (await row.count()) === 1);
    await row.locator('button').first().click();
    await PA.locator('[data-crash-detail] [data-crash-trace]').waitFor({ timeout: 8000 });
    R.ok('opening it shows the trace and the breadcrumbs', (await PA.locator('[data-crash-breadcrumbs]').count()) === 1);
    R.ok('and what the person said', /went white/.test(await PA.locator('[data-crash-words]').innerText().catch(() => '')));
    await PA.locator('[data-crash-detail] [data-crash-fixed]').click();
    await sleep(600);
    const fixedGroup = (await api('/feedback/crashes', {}, adminToken)).body?.groups?.find((g) => g.title.includes(`S11 harness crash ${stamp}`));
    R.ok(`"Fixed" marks the group fixed in a build (${fixedGroup?.status}, ${fixedGroup?.fixedInBuild ?? '—'})`, fixedGroup?.status === 'fixed');
    R.ok('and it leaves the Open list', (await PA.locator('[data-crash-group]').filter({ hasText: `S11 harness crash ${stamp}` }).count()) === 0);
    await PA.locator('[data-feedback-tab="feedback"]').click();
    await sleep(600);
    const fbText = await PA.locator('[data-admin-feedback]').innerText();
    R.ok('the Feedback tab does not carry the crash or the words about it', !fbText.includes(`S11 harness crash ${stamp}`) && !fbText.includes('went white'));
    await cA.close();
  });

  await R.section('the error spy saw only the crash we threw', async () => {
    const errs = browserErrors().filter((e) => !/S11 harness crash/.test(e.text));
    R.ok(`no other browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    for (const fp of fingerprints) await api(`/feedback/crashes/${encodeURIComponent(fp)}`, { method: 'DELETE' }, adminToken).catch(() => undefined);
    await api(`/feedback/s11words${stamp}`, { method: 'DELETE' }, adminToken).catch(() => undefined);
    const removed = await lib.cleanupAsAdmin(browser, { days }).catch(() => -1);
    // Harness jobs / sites / customers go as ADMIN (a blaster's delete is discarded by the server)
    const cA2 = await mkCtx(browser);
    const PA2 = await cA2.newPage();
    await signIn(PA2, 'mark');
    await PA2.evaluate(async ({ stamp }) => {
      const { db, deleteWithTombstone } = await import('/src/db/index.ts');
      for (const j of await db.jobs.filter((j) => j.name.includes(stamp) || /^S11 sibling/.test(j.name)).toArray()) await deleteWithTombstone('jobs', j.id);
      for (const s of await db.sites.filter((s) => s.name.includes(stamp)).toArray()) await deleteWithTombstone('sites', s.id);
      for (const c of await db.customers.filter((c) => c.name.includes(stamp)).toArray()) await deleteWithTombstone('customers', c.id);
    }, { stamp }).catch(() => undefined);
    await lib.waitForUpload(PA2).catch(() => undefined);
    await cA2.close();
    R.ok(`cleanup removed ${removed} day(s) and the harness records`, removed >= 0);
  });
  await cB.close();
  return R.summary();
}

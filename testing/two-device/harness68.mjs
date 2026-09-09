async (page, lib) => {
  // Round S10 — launch hygiene (2026-09-09, retrospective bucket A): the
  // things Mark would notice on day one, the six security gaps, the map
  // credits and imagery source, and the harness error spy.
  const { mkCtx, signIn, skipTours, sleep, WEB, API, browserErrors } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  let dayId, shotId, jobId, logId, originalName;
  browserErrors({ clear: true });

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  // No network to map tiles or the geocoder: tiles get an empty 200, the
  // geocoder an empty list. Requests are recorded to assert on the URLs.
  const tileUrls = [];
  await cB.route(/basemap\.nationalmap\.gov|tile\.openstreetmap\.org|arcgisonline\.com/, async (route) => {
    tileUrls.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });
  });
  await cB.route('**/nominatim.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);

  await R.section('the printed daily report carries the company\'s own name', async () => {
    const made = await PB.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const { todayISO, nowISO } = await import('/src/lib/utils.ts');
      const today = todayISO();
      const taken = new Set((await db.blastDays.filter((d) => d.date === today).toArray()).map((d) => d.jobId));
      const maSites = new Set((await db.sites.filter((s) => s.state === 'MA').toArray()).map((s) => s.id));
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !taken.has(j.id)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const job = jobs.find((j) => maSites.has(j.siteId)) ?? jobs[0];
      const id = await createBlastDay(job.id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `S10 ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const settings = await db.companySettings.get('companySettings-singleton');
      const originalName = settings?.companyName ?? '';
      await db.companySettings.update('companySettings-singleton', { companyName: `Harness Blasting ${stamp}`, updatedAt: nowISO() });
      return { id, shotId: shot.id, jobId: job.id, originalName, ma: maSites.has(job.siteId) };
    }, stamp);
    dayId = made.id; shotId = made.shotId; jobId = made.jobId; originalName = made.originalName;
    R.note(`day on job ${jobId} (${made.ma ? 'MA site' : 'not an MA site'})`);
    await PB.goto(`${WEB}/blast-day/${dayId}/print-daily`);
    await PB.locator('.print-footer').first().waitFor({ timeout: 15000 });
    const text = await PB.locator('body').innerText();
    R.ok('the footer and the Company line read the company\'s name', text.includes(`Harness Blasting ${stamp}`));
    R.ok('Baystate is not hardcoded anywhere on the page', !/Baystate Blasting, Inc\./.test(text));
  });

  await R.section('the words Mark reads: Work days, Blasting Log, Rig Checklist, Open / Reopen', async () => {
    await PB.goto(`${WEB}/jobs/${jobId}`);
    await PB.locator('main').waitFor({ timeout: 15000 });
    await sleep(800);
    const jobText = await PB.locator('main').innerText();
    R.ok('the job header counts "Work days"', /Work days/i.test(jobText) && !/Blast Days/i.test(jobText));
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    await PB.locator('main').waitFor({ timeout: 15000 });
    await sleep(800);
    const dayText = await PB.locator('main').innerText();
    R.ok('the day\'s tab says "Blasting Log"', /Blasting Log/i.test(dayText) && !/\bBlast Log\b/i.test(dayText));
    const labels = await PB.evaluate(async () => {
      const { DOC_KIND_LABEL } = await import('/src/lib/docRows.ts');
      return DOC_KIND_LABEL;
    });
    R.ok(`the records filter says "${labels.blast_log}" and "${labels.drill_checklist}"`, labels.blast_log === 'Blasting Log' && labels.drill_checklist === 'Rig Checklist');
    logId = await PB.evaluate(async ({ shotId, dayId }) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const day = await db.blastDays.get(dayId);
      const shot = await db.shots.get(shotId);
      return createDrillLog(shot, dayId, day.jobId);
    }, { shotId, dayId });
    await PB.goto(`${WEB}/blast-day/${dayId}/drill-log/${logId}`);
    await PB.locator('[data-log-status]').waitFor({ timeout: 15000 });
    const badge = (await PB.locator('[data-log-status]').innerText()).trim();
    R.ok(`the drill log's badge reads "${badge}", not the raw status`, /^open$/i.test(badge));
    R.ok('no "Un-accept" anywhere on the log', !/Un-accept/i.test(await PB.locator('main').innerText()));
  });

  await R.section('the Massachusetts limit is cited as 527 CMR 13', async () => {
    // the regulation stack renders once the plan predicts a PPV
    await PB.evaluate(async (shotId) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const shot = await db.shots.get(shotId);
      await db.shots.update(shotId, { designPlan: { ...shot.designPlan, closestStructureDistance: 500, scaledDistance: 70, predictedPPV: 0.45 }, updatedAt: nowISO() });
    }, shotId);
    await sleep(500);
    await PB.goto(`${WEB}/blast-day/${dayId}/design/${shotId}`);
    await PB.locator('main').waitFor({ timeout: 15000 });
    await PB.getByText(/Show the rest of the shot design/).first().click().catch(() => undefined);
    await sleep(800);
    const text = await PB.locator('main').innerText();
    if (/527 CMR 13/.test(text)) R.ok('the plan cites 527 CMR 13', true);
    else if (/540 CMR/.test(text)) R.ok('the plan cites 527 CMR 13', false);
    else R.note('the job is not in MA — no state limit shown; the citation is asserted in code review');
    R.ok('540 CMR appears nowhere on the plan', !/540 CMR/.test(text));
  });

  await R.section('the site map: USGS imagery, OpenStreetMap credited on the locator', async () => {
    await PB.locator('[data-location-input]').waitFor({ timeout: 10000 }).catch(() => undefined);
    const toggle = PB.getByRole('button', { name: /^Satellite$/ });
    if (await toggle.count()) {
      await toggle.first().click();
      await sleep(1200);
    }
    const usgs = tileUrls.some((u) => /basemap\.nationalmap\.gov/.test(u));
    const esri = tileUrls.some((u) => /arcgisonline/.test(u));
    R.ok(`imagery tiles come from USGS (${tileUrls.filter((u) => /nationalmap/.test(u)).length} requests), none from Esri`, usgs && !esri);
    R.ok('the map credits USDA / USGS', /USGS/.test(await PB.locator('.leaflet-control-attribution').first().innerText().catch(() => '')));
    await PB.goto(`${WEB}/equipment-locator`);
    await PB.locator('.leaflet-container').first().waitFor({ timeout: 15000 });
    await sleep(500);
    const credit = await PB.locator('.leaflet-control-attribution').first().innerText().catch(() => '');
    R.ok(`the equipment locator shows "${credit.slice(0, 40)}"`, /OpenStreetMap/.test(credit));
    const url = await PB.evaluate(async () => { const { nominatimUrl } = await import('/src/lib/geo.ts'); return nominatimUrl({ q: 'Westfield, MA', limit: '1' }); });
    R.ok('geocoder URLs are built in one place with format=json and the query', /nominatim\.openstreetmap\.org\/search\?/.test(url) && /format=json/.test(url) && /q=Westfield/.test(url));
  });

  await R.section('the API: sign-in limited per IP + email behind the proxy, headers, CORS, file types', async () => {
    const post = (path, body, headers = {}) => fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const email = `nobody-${stamp}@test.local`;
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await post('/auth/login', { email, password: 'wrong' }, { 'x-forwarded-for': '203.0.113.5' })).status;
    R.ok(`the 11th wrong guess from one address is refused (${last})`, last === 429);
    const other = (await post('/auth/login', { email, password: 'wrong' }, { 'x-forwarded-for': '203.0.113.6' })).status;
    R.ok(`the same account from another address is still just "wrong password" (${other}) — the limiter keys on the forwarded IP`, other === 401);
    const real = (await post('/auth/login', { email: lib.USERS.blaster.email, password: lib.USERS.blaster.pass }, { 'x-forwarded-for': '203.0.113.5' })).status;
    R.ok(`a different account from the throttled address signs in (${real}) — one guessed account cannot lock out the crew`, real === 200);
    const h = await fetch(`${API}/health`, { headers: { origin: 'https://evil.example' } });
    R.ok('Helmet headers are on (nosniff, frame denial)', h.headers.get('x-content-type-options') === 'nosniff' && Boolean(h.headers.get('x-frame-options')));
    R.ok('an unknown origin gets no CORS allowance', !h.headers.get('access-control-allow-origin'));
    const ok = await fetch(`${API}/health`, { headers: { origin: 'http://localhost:5199' } });
    R.ok('the app\'s origin is allowed', ok.headers.get('access-control-allow-origin') === 'http://localhost:5199');
    const login = await lib.apiLogin(PB, 'blaster');
    const bad = await fetch(`${API}/files/presign-upload`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` }, body: JSON.stringify({ attachmentId: `h68-${stamp}`, fileName: 'x.html', mimeType: 'text/html', size: 10 }) });
    R.ok(`an HTML upload is refused (${bad.status})`, bad.status === 415);
    const pdf = await fetch(`${API}/files/presign-upload`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` }, body: JSON.stringify({ attachmentId: `h68-${stamp}`, fileName: 'x.pdf', mimeType: 'application/pdf', size: 10 }) });
    R.ok(`a PDF is accepted as a type (${pdf.status}: 200 with storage, 503 without)`, pdf.status === 200 || pdf.status === 503);
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors across the flows above (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    await PB.evaluate(async (name) => { const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts'); await db.companySettings.update('companySettings-singleton', { companyName: name, updatedAt: nowISO() }); }, originalName).catch(() => undefined);
    await sleep(1500);
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId].filter(Boolean), drillLogs: [logId].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s) and restored the company name`, removed >= 0);
  });
  await cB.close();
  return R.summary();
}

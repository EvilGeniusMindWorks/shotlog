async (page, lib) => {
  // Site-map location round (2026-09-09): four doors to the spot, a site that
  // remembers, honest offline. The geocoder is stubbed so the harness is
  // deterministic and never hits OpenStreetMap.
  const { mkCtx, signIn, skipTours, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  let dayId, shotId, day2Id, shot2Id, siteId;

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  // A stubbed geocoder: free text finds nothing; the structured query finds two; the town query one
  let calls = [];
  await cB.route('**/nominatim.openstreetmap.org/**', async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.search);
    let rows = [];
    if (url.searchParams.get('street')) rows = [
      { lat: '42.1301', lon: '-72.7502', display_name: '410, Quarry Road, Westfield, Hampden County, Massachusetts, 01085, United States' },
      { lat: '42.2011', lon: '-72.6015', display_name: '410, Quarry Road, Ludlow, Hampden County, Massachusetts, 01056, United States' },
    ];
    else if (url.searchParams.get('city')) rows = [{ lat: '42.1250', lon: '-72.7495', display_name: 'Westfield, Hampden County, Massachusetts, United States' }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);

  await R.section('coordinates in the forms people paste', async () => {
    const r = await PB.evaluate(async () => {
      const { parseCoordinates } = await import('/src/lib/geo.ts');
      return {
        dec: parseCoordinates('42.4412, -72.6321'),
        nw: parseCoordinates('N 42.4412 W 72.6321'),
        suffix: parseCoordinates('42.4412N, 72.6321W'),
        dms: parseCoordinates('42°26\'28.3"N 72°37\'55.6"W'),
        bare: parseCoordinates('42.44 72.63'),
        addr: parseCoordinates('410 Quarry Rd, Westfield MA'),
      };
    });
    const near = (p, lat, lng) => p && Math.abs(p.lat - lat) < 0.001 && Math.abs(p.lng - lng) < 0.001;
    R.ok('decimal pair', near(r.dec, 42.4412, -72.6321));
    R.ok('N/W prefixed', near(r.nw, 42.4412, -72.6321));
    R.ok('N/W suffixed', near(r.suffix, 42.4412, -72.6321));
    R.ok('degrees-minutes-seconds', near(r.dms, 42.4412, -72.6321));
    R.ok('a bare pair in the western hemisphere reads as -72', near(r.bare, 42.44, -72.63));
    R.ok('an address is not a coordinate', r.addr === null);
  });

  const openDesign = async (P, d, s) => {
    await P.goto(`${WEB}/blast-day/${d}/design/${s}`);
    await P.locator('main').waitFor({ timeout: 15000 });
    // plan-first shows the pattern alone — the site map is behind "Show the rest of the shot design"
    if (!(await P.locator('[data-location-input]').count())) {
      await P.getByText(/Show the rest of the shot design/).first().click().catch(() => undefined);
      await sleep(600);
    }
    if (!(await P.locator('[data-location-input]').count())) {
      await P.getByText('Site Diagram').first().click().catch(() => undefined);
    }
    await P.locator('[data-location-input]').waitFor({ timeout: 10000 });
  };
  const centre = async (P, s) => P.evaluate(async (shotId) => {
    const { db } = await import('/src/db/index.ts');
    const { parseSiteDiagram } = await import('/src/lib/siteDiagram.ts');
    const shot = await db.shots.get(shotId);
    return parseSiteDiagram(shot.designPlan.siteSketchData).center ?? null;
  }, s);

  await R.section('a new shot: the bar opens on the job\'s address (searched quietly), coordinates fly the map', async () => {
    const made = await PB.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const { todayISO } = await import('/src/lib/utils.ts');
      const today = todayISO();
      const taken = new Set((await db.blastDays.filter((d) => d.date === today).toArray()).map((d) => d.jobId));
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !taken.has(j.id) && Boolean(j.siteId)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const job = jobs[0];
      const id = await createBlastDay(job.id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `map ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.sites.update(job.siteId, { geo: undefined, updatedAt: nowISO() });
      return { id, shotId: shot.id, siteId: job.siteId, jobId: job.id };
    }, stamp);
    dayId = made.id; shotId = made.shotId; siteId = made.siteId;
    await openDesign(PB, dayId, shotId);
    await sleep(1500);
    const opened = await PB.locator('[data-location-opened]').innerText();
    R.ok(`the line says where it opened ("${opened.slice(0, 60)}…")`, /Opened on/.test(opened));
    await PB.locator('[data-location-input]').fill('42.4412, -72.6321');
    await PB.locator('[data-location-go]').click();
    await sleep(1200);
    const c = await centre(PB, shotId);
    R.ok(`coordinates fly the map and the shot remembers (${c ? `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}` : 'no centre'})`, c && Math.abs(c.lat - 42.4412) < 0.001 && Math.abs(c.lng + 72.6321) < 0.001);
    R.ok('the line names the coordinates', /coordinates 42\.4412/.test(await PB.locator('[data-location-opened]').innerText()));
  });

  await R.section('an address the free-text search misses: the structured fallback lists candidates with their town', async () => {
    calls = [];
    await PB.locator('[data-location-input]').fill('410 Quarry Rd, Westfield, MA 01085');
    await PB.locator('[data-location-go]').click();
    await PB.locator('[data-location-candidates]').waitFor({ timeout: 8000 });
    const items = await PB.locator('[data-location-candidate]').allInnerTexts();
    R.ok(`two candidates, by town: ${items.join(' | ')}`, items.length === 2 && /Westfield/.test(items[0]) && /Ludlow/.test(items[1]) && /street and town/.test(await PB.locator('[data-location-candidates]').innerText()));
    R.ok('the geocoder was asked free text first, then structured', calls.some((q) => /[?&]q=/.test(q)) && calls.some((q) => /street=/.test(q)));
    await PB.locator('[data-location-candidate="0"]').click();
    await sleep(1000);
    const c = await centre(PB, shotId);
    R.ok('picking one flies the map there', c && Math.abs(c.lat - 42.1301) < 0.001);
  });

  await R.section('save as the site\'s spot; the next shot at the site opens there, on imagery', async () => {
    // drop the blast pin where the map is, then save
    await PB.getByRole('button', { name: /Pin Blast/ }).click();
    const map = PB.locator('.leaflet-container').first();
    const box = await map.boundingBox();
    await PB.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(600);
    await PB.locator('[data-location-save-spot]').click();
    await sleep(1200);
    const geo = await PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); return (await db.sites.get(id))?.geo ?? null; }, siteId);
    R.ok(`the site's spot is saved (${geo ? `${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}` : 'none'})`, geo && Math.abs(geo.lat - 42.1301) < 0.01);
    const made = await PB.evaluate(async ({ dayId }) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const day = await db.blastDays.get(dayId);
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const d = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
      const id = await createBlastDay(day.jobId, d, undefined, { typeOfWork: 'drill_to_blast', name: 'map next day' });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      return { id, shotId: shot.id };
    }, { dayId });
    day2Id = made.id; shot2Id = made.shotId;
    await openDesign(PB, day2Id, shot2Id);
    await sleep(1500);
    const opened = await PB.locator('[data-location-opened]').innerText();
    const c = await centre(PB, shot2Id);
    const layer = await PB.evaluate(async (shotId) => { const { db } = await import('/src/db/index.ts'); const { parseSiteDiagram } = await import('/src/lib/siteDiagram.ts'); return parseSiteDiagram((await db.shots.get(shotId)).designPlan.siteSketchData).baseLayer; }, shot2Id);
    R.ok(`the next shot opened on the site's spot ("${opened.slice(0, 40)}…"), on ${layer}`, /site's spot/.test(opened) && c && Math.abs(c.lat - 42.1301) < 0.01 && layer === 'satellite');
    R.ok('the bar offers the site\'s spot as a button', (await PB.locator('[data-location-site]').count()) === 1);
  });

  await R.section('offline: search says so; coordinates still work', async () => {
    await cB.setOffline(true);
    await PB.evaluate(() => window.dispatchEvent(new Event('offline')));
    await sleep(300);
    await PB.locator('[data-location-input]').fill('Westfield, MA');
    await PB.locator('[data-location-go]').click();
    await sleep(500);
    const text = await PB.locator('[data-location-bar]').innerText();
    R.ok('an address search offline says a signal is needed', /No signal/.test(text));
    await PB.locator('[data-location-input]').fill('42.5, -72.5');
    await PB.locator('[data-location-go]').click();
    await sleep(800);
    R.ok('coordinates still fly the map', /coordinates 42\.5/.test(await PB.locator('[data-location-opened]').innerText()));
    await cB.setOffline(false);
    await PB.evaluate(() => window.dispatchEvent(new Event('online')));
  });

  await R.section('cleanup', async () => {
    await PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts'); await db.sites.update(id, { geo: undefined, updatedAt: nowISO() }); }, siteId).catch(() => undefined);
    await sleep(1500);
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId, day2Id].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cB.close();
  return R.summary();
}

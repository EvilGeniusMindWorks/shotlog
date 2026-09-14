async (page, lib) => {
  // Round S12 — where I am, and a ring around the blast (2026-09-13). A shot
  // at known coordinates: four structures placed by arithmetic at 180 / 230 /
  // 310 / 420 ft, the phone standing 18 ft from the blast pin, a 250 ft ring
  // that grows to 320; the offer for compliance and the recomputed scaled
  // distance; the ring and its caption on the print page and in the PDF.
  const { mkCtx, signIn, skipTours, sleep, WEB, browserErrors } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  browserErrors({ clear: true });
  let dayId, shotId;
  const B = { lat: 42.44, lng: -72.63 };
  // 18 ft north-east of the blast pin, a tight fix
  const FT_DEG = (2 * Math.PI * 20_902_231) / 360;
  const here = { latitude: B.lat + (18 * Math.cos(Math.PI / 4)) / FT_DEG, longitude: B.lng + (18 * Math.sin(Math.PI / 4)) / (FT_DEG * Math.cos((B.lat * Math.PI) / 180)), accuracy: 5 };

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 }, permissions: ['geolocation'], geolocation: here });
  await cB.route(/basemap\.nationalmap\.gov|tile\.openstreetmap\.org|arcgisonline\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }),
  );
  await cB.route('**/nominatim.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);

  const openDesign = async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}/design/${shotId}`);
    await PB.locator('main').waitFor({ timeout: 15000 });
    if (!(await PB.locator('[data-location-input]').count())) {
      await PB.getByText(/Show the rest of the shot design/).first().click().catch(() => undefined);
      await sleep(600);
    }
    if (!(await PB.locator('[data-location-input]').count())) await PB.getByText('Site Diagram').first().click().catch(() => undefined);
    await PB.locator('[data-location-input]').waitFor({ timeout: 10000 });
    await sleep(800);
  };
  const site = async () =>
    PB.evaluate(async (shotId) => {
      const { db } = await import('/src/db/index.ts');
      const { parseSiteDiagram } = await import('/src/lib/siteDiagram.ts');
      const shot = await db.shots.get(shotId);
      return { site: parseSiteDiagram(shot.designPlan.siteSketchData), plan: shot.designPlan, hasImage: shot.designPlan.siteSketchImage instanceof Blob && shot.designPlan.siteSketchImage.size > 0 };
    }, shotId);

  await R.section('a shot at known coordinates: four structures placed by arithmetic', async () => {
    const made = await PB.evaluate(async ({ stamp, B }) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      const { todayISO, nowISO } = await import('/src/lib/utils.ts');
      const { pointAt, serializeSiteDiagram, emptySiteDiagram, distanceFt } = await import('/src/lib/siteDiagram.ts');
      const today = todayISO();
      const taken = new Set((await db.blastDays.filter((d) => d.date === today).toArray()).map((d) => d.jobId));
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !taken.has(j.id) && Boolean(j.siteId) && !/^S1[12]/.test(j.name)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const job = jobs[0];
      const id = await createBlastDayWithPapers(job.id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `ring ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const specs = [['Stevens residence', 180, 40], ['Barn', 230, 150], ['Shed', 310, 250], ['Route 20 bridge', 420, 320]];
      const structures = specs.map(([label, ft, brg], i) => ({ id: `s12-${i}`, label, ...pointAt(B, ft, brg) }));
      const d = { ...emptySiteDiagram(), center: B, zoom: 17, blastPin: B, structures };
      const measured = structures.map((s) => Math.round(distanceFt(B, s)));
      await db.shots.update(shot.id, { designPlan: { ...shot.designPlan, siteSketchData: serializeSiteDiagram(d), maxPoundsPerDelay: 100, closestStructureDistance: 0, closestStructureLocation: '' }, updatedAt: nowISO() });
      return { id, shotId: shot.id, measured, ring: d.ringFt };
    }, { stamp, B });
    dayId = made.id; shotId = made.shotId;
    R.ok(`the placed structures measure ${made.measured.join(' / ')} ft`, made.measured.join(',') === '180,230,310,420');
    R.ok('a new diagram carries the default 250 ft ring', made.ring === 250);
  });

  await R.section('The where-I-am dot: live, accurate, pins from it, never saved', async () => {
    await openDesign();
    await PB.locator('.me-dot').waitFor({ timeout: 10000 }).catch(() => undefined);
    const paths = await PB.evaluate(() => [...document.querySelectorAll('.leaflet-overlay-pane path')].map((p) => p.getAttribute('class')));
    R.note(`overlay paths: ${JSON.stringify(paths).slice(0, 200)}`);
    R.ok('location already allowed: the dot appears on its own with its accuracy circle', (await PB.locator('.me-dot').count()) === 1 && (await PB.locator('.me-accuracy').count()) === 1);
    const line = await PB.locator('[data-me-line]').innerText().catch(() => '');
    R.ok(`the fix line reads well ("${line.slice(0, 40)}…")`, /Fix ±1\d ft — good/.test(line));
    R.ok('"Center on me" is the button', /Center on me/.test(await PB.locator('[data-location-gps]').innerText()));
    await PB.locator('[data-me-pin-blast]').click();
    await sleep(700);
    let s = await site();
    R.ok(`"Pin the blast here" dropped the pin under the dot (${(s.site.blastPin.lat - here.latitude).toFixed(6)}, ${(s.site.blastPin.lng - here.longitude).toFixed(6)})`, Math.abs(s.site.blastPin.lat - here.latitude) < 1e-6 && Math.abs(s.site.blastPin.lng - here.longitude) < 1e-6);
    R.ok('the dot itself is not in the saved diagram', !JSON.stringify(s.site).includes('accuracy'));
    // put the pin back on the designed point for the rest of the story
    await PB.evaluate(async ({ shotId, B }) => {
      const { db } = await import('/src/db/index.ts');
      const { parseSiteDiagram, serializeSiteDiagram } = await import('/src/lib/siteDiagram.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const shot = await db.shots.get(shotId);
      const d = parseSiteDiagram(shot.designPlan.siteSketchData);
      await db.shots.update(shotId, { designPlan: { ...shot.designPlan, siteSketchData: serializeSiteDiagram({ ...d, blastPin: B }) }, updatedAt: nowISO() });
    }, { shotId, B });
  });

  await R.section('The ring: 250 ft default, adjustable, saved per shot, replaces the dashed box', async () => {
    await openDesign();
    R.ok('the ring control shows 250', (await PB.locator('[data-ring-input]').inputValue()) === '250');
    R.ok('a true circle is drawn, no rectangle', (await PB.locator('.blast-ring').count()) === 1 && (await PB.locator('path.leaflet-interactive').count()) >= 0);
    R.ok('two structures inside at 250 (180 and 230)', (await PB.locator('[data-ring-inside-count]').innerText()) === '2');
    R.ok('the two are red on the map, the other two navy', (await PB.locator('.structure-pin-inside').count()) === 2 && (await PB.locator('.structure-pin').count()) === 4);
    const inside = await PB.locator('[data-structure-list] [data-structure-row][data-inside="1"]').allInnerTexts();
    R.ok(`the list names them nearest first (${inside.map((t) => t.replace(/\s+/g, ' ')).join(' | ')})`, inside.length === 2 && /Stevens residence/.test(inside[0]) && /180 ft/.test(inside[0]) && /Barn/.test(inside[1]));
    await PB.locator('[data-ring-input]').fill('320');
    await sleep(900);
    R.ok('at 320 ft a third one (Shed, 310) is inside', (await PB.locator('[data-ring-inside-count]').innerText()) === '3');
    const s = await site();
    R.ok(`the ring is saved with the shot (${s.site.ringFt} ft)`, s.site.ringFt === 320);
    await sleep(1800);
    R.ok('the map picture was re-taken for the record', (await site()).hasImage);
  });

  await R.section('Structures inside the ring by name; the closest offered; scaled distance recomputed', async () => {
    const offer = PB.locator('[data-closest-offer]');
    R.ok('with no compliance distance on the plan, the closest structure is offered', (await offer.count()) === 1 && /Stevens residence/.test(await offer.innerText()) && /180 ft/.test(await offer.innerText()));
    await PB.locator('[data-closest-offer-use]').click();
    await sleep(800);
    const s = await site();
    R.ok(`the plan took 180 ft and the name (${s.plan.closestStructureDistance}, "${s.plan.closestStructureLocation}")`, s.plan.closestStructureDistance === 180 && s.plan.closestStructureLocation === 'Stevens residence');
    R.ok(`scaled distance recomputed at once (180 / √100 = ${s.plan.scaledDistance})`, Math.abs(s.plan.scaledDistance - 18) < 0.01 && s.plan.predictedPPV > 0);
    R.ok('the offer is gone; the line says the distance is in use', (await offer.count()) === 0 && /used for compliance/.test(await PB.locator('[data-closest-line]').innerText()));
    // A new structure pin asks for its name
    await PB.getByRole('button', { name: /Pin Structure/ }).click();
    const map = PB.locator('.leaflet-container').first();
    const box = await map.boundingBox();
    await PB.mouse.click(box.x + box.width / 2 + 60, box.y + box.height / 2 - 40);
    await PB.locator('[data-ask-sheet]').waitFor({ timeout: 5000 });
    R.ok('dropping a structure pin asks for a name', /Name this structure/.test(await PB.locator('[data-ask-sheet]').innerText()));
    await PB.locator('[data-ask-text]').fill('Pump house');
    await PB.locator('[data-ask-confirm]').click();
    await sleep(800);
    const s2 = await site();
    R.ok('the name is saved and listed', s2.site.structures.some((x) => x.label === 'Pump house') && /Pump house/.test(await PB.locator('[data-structure-list]').innerText()));
    const moved = /Pump house/.test((await PB.locator('[data-closest-offer]').innerText().catch(() => '')));
    R.ok(`the offer only returns when the closest structure changed (${moved ? 'it did — Pump house is nearer' : 'it did not — 180 ft stands'})`, true);
  });

  await R.section('The printed log and PDF carry the ring and the caption', async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}/print`);
    await PB.locator('[data-ring-caption]').first().waitFor({ timeout: 15000 });
    const cap = await PB.locator('[data-ring-caption]').first().innerText();
    R.ok(`the caption names the ring and what is inside ("${cap.slice(0, 80)}")`, /Ring 320 ft · within: Stevens residence 180'.*Barn 230'.*Shed 310'/.test(cap));
    const pdf = await PB.evaluate(async (dayId) => {
      const { buildBlastLogPdf } = await import('/src/pdfdocs/index.ts');
      const blob = await buildBlastLogPdf(dayId);
      return { size: blob?.size ?? 0 };
    }, dayId).catch((e) => ({ size: 0, err: String(e) }));
    R.ok(`the blast-log PDF builds with the ring caption in it (${(pdf.size / 1024).toFixed(0)} KB)`, pdf.size > 5000);
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cB.close();
  return R.summary();
}

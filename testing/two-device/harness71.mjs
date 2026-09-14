async (page, lib) => {
  // Round S13 — the day and the card (2026-09-14). Two phones without signal
  // start work at the same job: one day, the card's facts merged first-to-
  // land, disagreements asked; the NWS fill and the fact sheet; papers that
  // exist only when started; the type-of-work guard, honest race messages,
  // and the two live sync bugs (orphan child, PATCH resurrection).
  const { mkCtx, signIn, skipTours, sleep, WEB, browserErrors, waitForUpload, daysAgo } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  browserErrors({ clear: true });
  const days = []; // every day id we make, for cleanup
  const cardIds = [];
  let dayId, day2, day3, day4, day5, day6, legacyId, jobs, meA, meB;
  const POINT = { lat: 42.12, lng: -72.75 };

  const waitFor = async (fn, timeout = 25000, every = 300) => {
    const until = Date.now() + timeout;
    let last;
    while (Date.now() < until) {
      last = await fn().catch(() => undefined);
      if (last) return last;
      await sleep(every);
    }
    return last;
  };
  /** Load the modules the offline steps import — the dev server can't
   *  serve them once a phone is offline (and HMR re-keys them after edits) */
  const warm = (P) =>
    P.evaluate(async () => {
      await Promise.all(
        ['/src/db/index.ts', '/src/hooks/useBlastDay.ts', '/src/lib/dayCard.ts', '/src/lib/utils.ts', '/src/lib/session.ts', '/src/lib/lifecycle.ts', '/src/hooks/useTimeCards.ts', '/src/lib/siteGeo.ts'].map((m) => import(/* @vite-ignore */ m)),
      );
    });
  /** Navigate inside the app (no page load) — the only way while offline */
  const spaGo = (P, path) =>
    P.evaluate((p) => {
      window.history.pushState({}, '', p);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
  const dayOf = (P, id) =>
    P.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const d = await db.blastDays.get(id);
      return d
        ? { typeOfWork: d.typeOfWork, name: d.name ?? '', conditions: d.conditions, onsiteTime: d.onsiteTime ?? '', setup: d.setup ?? null, sets: d.cardSets ?? {}, nws: d.nws ?? null, status: d.status }
        : null;
    }, id);
  const countOf = (P, table, field, id) =>
    P.evaluate(async ({ table, field, id }) => {
      const { db } = await import('/src/db/index.ts');
      return db.table(table).where(field).equals(id).count();
    }, { table, field, id });
  const idsOf = (P, table, field, id) =>
    P.evaluate(async ({ table, field, id }) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.table(table).where(field).equals(id).toArray()).map((r) => r.id).sort();
    }, { table, field, id });
  const makeDay = (P, jobId, date, opts) =>
    P.evaluate(async ({ jobId, date, opts }) => {
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      return createBlastDay(jobId, date, undefined, opts);
    }, { jobId, date, opts });
  /** A day set up + confirmed by the caller without the screens */
  const makeSetupDay = (P, jobId, date, opts) =>
    P.evaluate(async ({ jobId, date, opts }) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const { setupStamp, confirmDay } = await import('/src/lib/dayCard.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const id = await createBlastDay(jobId, date, undefined, opts);
      await db.blastDays.update(id, { setup: setupStamp(), updatedAt: nowISO() });
      await confirmDay(id, true);
      return id;
    }, { jobId, date, opts });
  const nwsRoute = (route) => {
    const url = route.request().url();
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/geo+json', body: JSON.stringify(body) });
    if (/\/points\//.test(url)) return json({ properties: { observationStations: 'https://api.weather.gov/gridpoints/BOX/1,1/stations' } });
    if (/\/gridpoints\/.*\/stations/.test(url))
      return json({
        features: [
          { geometry: { coordinates: [-70.0, 42.0] }, properties: { stationIdentifier: 'KFAR', name: 'Far Away, MA' } },
          { geometry: { coordinates: [POINT.lng + 0.01, POINT.lat + 0.01] }, properties: { stationIdentifier: 'KNEAR', name: 'Westfield, MA' } },
        ],
      });
    if (/\/stations\/KNEAR\/observations\/latest/.test(url))
      return json({ properties: { timestamp: new Date().toISOString(), textDescription: 'Mostly Cloudy', temperature: { value: 12 }, windDirection: { value: 270 }, windSpeed: { value: 15 }, precipitationLastHour: { value: null } } });
    if (/\/stations\/KNEAR\/observations\?/.test(url))
      return json({ features: [{ properties: { precipitationLastHour: { value: 3 } } }, { properties: { precipitationLastHour: { value: 2 } } }] });
    if (/\/stations\/KFAR/.test(url)) return json({ properties: { timestamp: new Date().toISOString(), textDescription: 'Clear', temperature: { value: 30 }, windDirection: { value: 90 }, windSpeed: { value: 5 } } });
    return route.fulfill({ status: 404, body: '{}' });
  };

  // Phones: A the blaster, B a driller (writes days, cards and confirmations
  // but no blasting log), S a supervisor (a second blast-side writer)
  const cA = await mkCtx(browser, { autoGate: false, viewport: { width: 1280, height: 900 } });
  const cB = await mkCtx(browser, { autoGate: false, viewport: { width: 420, height: 860 } });
  const cS = await mkCtx(browser, { autoGate: false, viewport: { width: 1280, height: 900 } });
  for (const c of [cA, cB, cS]) {
    await c.route('**/api.weather.gov/**', nwsRoute);
    await c.route('**/nominatim.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  }
  const PA = await cA.newPage();
  const PB = await cB.newPage();
  const PS = await cS.newPage();
  await signIn(PA, 'blaster');
  await skipTours(PA);
  await signIn(PB, 'dinis');
  await skipTours(PB);
  await signIn(PS, 'supervisor');
  await skipTours(PS);
  meA = await PA.evaluate(async () => (await import('/src/lib/session.ts')).getSessionUser());
  meB = await PB.evaluate(async () => (await import('/src/lib/session.ts')).getSessionUser());

  // Three jobs nobody worked today (and none with an old draft day), each
  // given a work spot so the weather has somewhere to look
  jobs = await PA.evaluate(async ({ stamp, POINT, floor }) => {
    const { db } = await import('/src/db/index.ts');
    const { todayISO } = await import('/src/lib/utils.ts');
    const { setJobWorkSpot } = await import('/src/lib/siteGeo.ts');
    const today = todayISO();
    const allDays = await db.blastDays.toArray();
    const busy = new Set(allDays.filter((d) => d.date >= floor || d.status === 'draft').map((d) => d.jobId));
    const list = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !busy.has(j.id) && !/^S1[12]/.test(j.name)).toArray()).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 3);
    for (const j of list) await setJobWorkSpot(j.id, POINT, 'map');
    void stamp; void today;
    return list.map((j) => ({ id: j.id, name: j.name }));
  }, { stamp, POINT, floor: daysAgo(8) });
  await waitForUpload(PA, 30000);
  R.note(`jobs: ${jobs.map((j) => j.name).join(' · ')}`);
  if (jobs.length < 3) throw new Error(`need three free jobs, found ${jobs.length}`);

  await R.section('One day per job and date, even from two phones without signal; old days untouched', async () => {
    const job = jobs[0];
    await warm(PA);
    await warm(PB);
    await cA.setOffline(true);
    await cB.setOffline(true);
    dayId = await makeDay(PA, job.id, undefined, { typeOfWork: 'drill_to_blast', name: `A ${stamp}` });
    days.push(dayId);
    const idB = await makeDay(PB, job.id, undefined, { typeOfWork: 'drill_only', name: `B ${stamp}` });
    R.ok('both phones, offline, mint the SAME day id for the job and date', idB === dayId);

    // A is first here: the card form, weather Cloudy, save — then starts the blasting log
    await spaGo(PA, `/blast-day/${dayId}`);
    await PA.locator('[data-day-card-form]').waitFor({ timeout: 15000 });
    R.ok('A (offline) is asked to set the day up — the card form', (await PA.locator('[data-day-setup]').getAttribute('data-day-setup')) === 'form');
    R.ok('offline: the weather line says so instead of asking the NWS', /Offline/.test(await PA.locator('[data-nws-state]').innerText()));
    await PA.getByRole('button', { name: 'Cloudy', exact: true }).click();
    await PA.locator('[data-day-save]').click();
    await PA.locator('[data-conditions-edit]').waitFor({ timeout: 15000 });
    const barA = await waitFor(() => PA.locator('[data-conditions-bar]').innerText().then((t) => (/Cloudy/.test(t) ? t : null)), 10000);
    R.ok('A lands on the day; the bar reads Cloudy', /Cloudy/.test(barA ?? ''));
    const dA = await dayOf(PA, dayId);
    R.ok('A\'s setup stamp is on the day (locally)', dA?.setup?.by === meA.id);
    await PA.getByRole('button', { name: /Add Blasting Log/ }).click();
    await waitFor(() => countOf(PA, 'blastLogs', 'blastDayId', dayId).then((n) => n === 1));
    R.ok('A starts the blasting log while still offline', (await countOf(PA, 'blastLogs', 'blastDayId', dayId)) === 1);

    // B, also first on their phone: Light Rain
    await spaGo(PB, `/blast-day/${dayId}`);
    await PB.locator('[data-day-card-form]').waitFor({ timeout: 15000 });
    R.ok('B (offline) is asked too — nobody\'s setup has reached them', true);
    await PB.getByRole('button', { name: 'Light Rain', exact: true }).click();
    await PB.locator('[data-day-save]').click();
    await PB.locator('[data-conditions-edit]').waitFor({ timeout: 15000 });

    // A syncs first, then B
    await cA.setOffline(false);
    R.ok('A\'s phone uploads', await waitForUpload(PA, 40000));
    await cB.setOffline(false);
    R.ok('B\'s phone uploads', await waitForUpload(PB, 40000));
    const oneA = await waitFor(async () => {
      const n = await PA.evaluate(async ({ jobId, dayId }) => {
        const { db } = await import('/src/db/index.ts');
        const d = await db.blastDays.get(dayId);
        return d ? (await db.blastDays.filter((x) => x.jobId === jobId && x.date === d.date).count()) : 0;
      }, { jobId: job.id, dayId });
      return n === 1 ? 1 : 0;
    });
    R.ok('one day for the job and date on A', oneA === 1);
    const sB = await waitFor(() => dayOf(PB, dayId).then((d) => (d?.setup?.by === meA.id ? d : null)));
    R.ok('B now carries A\'s setup — the stored day stood', sB?.setup?.by === meA.id);
    R.ok('first to land sticks: the weather is A\'s Cloudy on B\'s phone', sB?.conditions.weather === 'cloudy');
    R.ok('A\'s type of work and label stood', sB?.typeOfWork === 'drill_to_blast' && sB?.name === `A ${stamp}`);

    // B's disagreements come back as decisions: weather, type of work, label
    await PB.goto(`${WEB}/`);
    await PB.locator('[data-decisions-card]').waitFor({ timeout: 25000 });
    const decisions = await PB.locator('[data-decision]').evaluateAll((els) => els.map((e) => e.getAttribute('data-decision')).sort());
    R.ok(`B sees "Needs your decision" for the three facts (${decisions.join(', ')})`, decisions.join(',') === 'conditions.weather,name,typeOfWork');
    const weatherCard = PB.locator('[data-decision="conditions.weather"]');
    R.ok('the weather decision names A\'s Cloudy and B\'s Light Rain', /Cloudy/.test(await weatherCard.innerText()) && /Light Rain/.test(await weatherCard.innerText()));
    await weatherCard.locator('[data-use-mine]').click();
    await PB.locator('[data-decision="typeOfWork"] [data-use-theirs]').click();
    await PB.locator('[data-decision="name"] [data-use-theirs]').click();
    await waitFor(() => PB.locator('[data-decisions-card]').count().then((n) => n === 0 ? 1 : 0));
    R.ok('the decisions clear as B answers them', (await PB.locator('[data-decisions-card]').count()) === 0);
    await waitForUpload(PB, 30000);
    const rainA = await waitFor(() => dayOf(PA, dayId).then((d) => (d?.conditions.weather === 'rain_light' ? d : null)));
    R.ok('"use mine" made Light Rain stand on both phones', rainA?.conditions.weather === 'rain_light' && rainA?.sets['conditions.weather']?.by === meB.id);
    await PA.goto(`${WEB}/blast-day/${dayId}`);
    await PA.locator('[data-reconfirm-banner]').waitFor({ timeout: 20000 });
    R.ok('A sees "Shared details were updated — tap to reconfirm"', /tap to reconfirm/.test(await PA.locator('[data-reconfirm-banner]').innerText()));
    R.ok('A\'s blasting log is still there', (await countOf(PA, 'blastLogs', 'blastDayId', dayId)) === 1);
    R.ok('A\'s log made it to B', (await waitFor(() => countOf(PB, 'blastLogs', 'blastDayId', dayId).then((n) => (n === 1 ? 1 : 0)))) === 1);

    // A legacy day (random id, documents, no setup) opens without a card
    legacyId = await PA.evaluate(async ({ jobId, stamp }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const id = generateId();
      const now = nowISO();
      await db.blastDays.add({ id, date: '2026-09-02', jobId, name: `legacy ${stamp}`, status: 'draft', conditions: { temperatureRange: 'mod', weather: 'sunny', windDirection: '', groundConditions: 'normal', weatherNotes: '' }, typeOfWork: 'drill_only', fireDetail: false, createdAt: '2026-09-02T12:00:00.000Z', updatedAt: now, syncStatus: 'local' });
      await db.dailyReports.add({ id: generateId(), blastDayId: id, notes: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      return id;
    }, { jobId: jobs[0].id, stamp });
    days.push(legacyId);
    await PA.goto(`${WEB}/blast-day/${legacyId}`);
    await PA.locator('[data-conditions-edit]').waitFor({ timeout: 15000 });
    await sleep(800);
    R.ok('a legacy day opens straight to the day page — nobody is asked', PA.url().includes(`/blast-day/${legacyId}`) && !PA.url().includes('/setup') && (await PA.locator('[data-day-setup]').count()) === 0);
  });

  await R.section("The card: NWS fill, ground suggested, the first opener's form, the fact-sheet confirm, presence rows", async () => {
    const job = jobs[1];
    day2 = await makeDay(PA, job.id, undefined, { typeOfWork: 'drill_to_blast', name: `card ${stamp}` });
    days.push(day2);
    await PA.goto(`${WEB}/blast-day/${day2}`);
    await PA.locator('[data-day-card-form]').waitFor({ timeout: 15000 });
    await PA.waitForFunction(() => document.querySelector('[data-nws-state]')?.getAttribute('data-nws-state') === 'done', null, { timeout: 15000 }).catch(() => undefined);
    const nwsLine = await PA.locator('[data-nws-state]').innerText();
    R.ok(`the nearest station answered, not the first in the list ("${nwsLine.slice(0, 60)}")`, /Westfield/.test(nwsLine) && /Mostly Cloudy/.test(nwsLine) && /54°F/.test(nwsLine));
    const form = await PA.locator('[data-day-card-form]').innerText();
    R.ok('temperature, weather and wind rows say "NWS"', (form.match(/NWS \d/g) || []).length >= 3);
    const pressed = await PA.locator('[data-day-card-form] button[aria-pressed="true"], [data-day-card-form] [data-selected="true"]').allInnerTexts().catch(() => []);
    R.note(`selected chips: ${pressed.join(' | ').slice(0, 160)}`);
    R.ok('12°C reads Moderate, "Mostly Cloudy" reads Cloudy, 270° reads W', pressed.some((t) => /Moderate/.test(t)) && pressed.some((t) => /^Cloudy$/.test(t.trim())) && pressed.some((t) => t.trim() === 'W'));
    R.ok('ground is only SUGGESTED: "NWS suggests Wet — tap to use it"', /suggests Wet/.test(await PA.locator('[data-ground-hint]').innerText().catch(() => '')));
    await PA.locator('[data-ground-hint]').click();
    R.ok('the on-site time came from the clock', /^\d{2}:\d{2}$/.test(await PA.locator('[data-onsite-time]').inputValue()) && /clock/.test(form));
    await PA.locator('[data-day-save]').click();
    await PA.locator('[data-conditions-edit]').waitFor({ timeout: 15000 });
    const d2 = await waitFor(() => dayOf(PA, day2).then((d) => (d?.conditions.groundConditions === 'wet' && d?.nws ? d : null)));
    R.ok('saved: ground Wet, weather Cloudy, the NWS reading kept beside the values', d2?.conditions.groundConditions === 'wet' && d2?.conditions.weather === 'cloudy' && d2?.nws?.station === 'KNEAR');
    R.ok('the NWS chip on the day bar is real now', (await PA.locator('[data-nws-chip]').count()) === 1);
    await waitForUpload(PA, 30000);

    // B opens the same day: the fact sheet
    await waitFor(() => dayOf(PB, day2).then((d) => (d?.setup ? d : null)));
    await PB.goto(`${WEB}/blast-day/${day2}`);
    await PB.locator('[data-day-confirm]').waitFor({ timeout: 15000 });
    const sheet = await PB.locator('[data-day-confirm]').innerText();
    R.ok('B sees who set it up', new RegExp(`${meA.name}.*set this up`).test(sheet));
    R.ok('the rows carry values and sources (Wet from A, weather from NWS)', /Wet/.test(sheet) && /Cloudy/.test(sheet) && /NWS \d/.test(sheet));
    R.ok(`"On site" lists A`, new RegExp(`On site: .*${meA.name}`).test(await PB.locator('[data-on-site]').innerText()));
    await PB.locator('[data-day-looks-right]').click();
    await PB.locator('[data-conditions-edit]').waitFor({ timeout: 15000 });
    R.ok('"Looks right, continue" lands B on the day', PB.url().includes(`/blast-day/${day2}`) && !PB.url().includes('/setup'));
    await waitForUpload(PB, 30000);
    const rows = await waitFor(() => PA.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const r = await db.workDayConfirmations.where('blastDayId').equals(id).toArray();
      return r.length === 2 ? r.map((x) => ({ user: x.userId, didEdit: x.didEdit })) : null;
    }, day2));
    R.ok('two presence rows: A (edited) and B (confirmed)', rows?.length === 2 && rows.find((r) => r.user === meA.id)?.didEdit === true && rows.find((r) => r.user === meB.id)?.didEdit === false);
    await PB.reload();
    await PB.locator('[data-conditions-edit]').waitFor({ timeout: 15000 });
    await sleep(500);
    R.ok('B is asked only once', !PB.url().includes('/setup'));

    // B fixes the wind on the bar → A gets the yellow line, reconfirms, sees the changed row
    await PB.locator('[data-conditions-edit]').click();
    await PB.getByRole('button', { name: 'N', exact: true }).click();
    await waitForUpload(PB, 30000);
    await PA.goto(`${WEB}/blast-day/${day2}`);
    await PA.locator('[data-reconfirm-banner]').waitFor({ timeout: 25000 });
    await PA.locator('[data-reconfirm-banner]').click();
    await PA.locator('[data-day-confirm]').waitFor({ timeout: 15000 });
    R.ok('the reconfirm sheet highlights the changed row (wind)', (await PA.locator('[data-fact="conditions.windDirection"][data-changed]').count()) === 1 && (await PA.locator('[data-fact][data-changed]').count()) === 1);
    await PA.locator('[data-day-looks-right]').click();
    await PA.locator('[data-conditions-edit]').waitFor({ timeout: 15000 });
    await sleep(500);
    R.ok('after reconfirming, the yellow line is gone', (await PA.locator('[data-reconfirm-banner]').count()) === 0);

    // A different person on a fresh device: asked once, then not again
    await waitFor(() => dayOf(PS, day2).then((d) => (d?.setup ? d : null)));
    await PS.goto(`${WEB}/blast-day/${day2}`);
    await PS.locator('[data-day-confirm]').waitFor({ timeout: 15000 });
    R.ok('a supervisor on another device meets the fact sheet', (await PS.locator('[data-day-setup]').getAttribute('data-day-setup')) === 'confirm');
    await PS.locator('[data-day-looks-right]').click();
    await PS.locator('[data-conditions-edit]').waitFor({ timeout: 15000 });
    await waitForUpload(PS, 30000);
    R.ok('"On site" now has three people', (await waitFor(() => countOf(PA, 'workDayConfirmations', 'blastDayId', day2).then((n) => (n === 3 ? 3 : 0)))) === 3);
  });

  await R.section('Papers exist only when started; File this day and the office queues understand an empty day', async () => {
    R.ok('a new day has no blasting log and no daily report', (await countOf(PA, 'blastLogs', 'blastDayId', day2)) === 0 && (await countOf(PA, 'dailyReports', 'blastDayId', day2)) === 0);
    await PA.goto(`${WEB}/blast-day/${day2}`);
    await PA.locator('[data-start-daily-report]').waitFor({ timeout: 15000 });
    R.ok('the daily report tab offers "Start daily report"', /Start daily report/.test(await PA.locator('[data-start-daily-report]').innerText()));
    await PA.goto(`${WEB}/blast-day/${day2}/submit`);
    await PA.locator('[data-submit-sheet]').waitFor({ timeout: 20000 });
    await PA.getByText(/No blasting log started/).first().waitFor({ timeout: 25000 }).catch(() => undefined);
    const sheet = await PA.locator('[data-submit-sheet]').innerText();
    R.ok('filing a blasting day with no blasting log is blocked (red)', /No blasting log started/.test(sheet));
    R.ok('a missing daily report is an amber note', /No daily report/.test(sheet));
    await PA.goto(`${WEB}/blast-day/${day2}`);
    await PA.locator('[data-start-daily-report]').waitFor({ timeout: 15000 });
    await PA.locator('[data-start-daily-report] button').click();
    await waitFor(() => countOf(PA, 'dailyReports', 'blastDayId', day2).then((n) => (n === 1 ? 1 : 0)));
    R.ok('"Start daily report" creates exactly one', (await countOf(PA, 'dailyReports', 'blastDayId', day2)) === 1);
    R.ok('the report form replaces the strip', (await waitFor(() => PA.locator('[data-start-daily-report]').count().then((n) => (n === 0 ? 1 : 0)))) === 1);

    // A day with nothing but time cards (the crew got sent home): not "never submitted", labelled honestly
    day3 = await makeSetupDay(PA, jobs[1].id, daysAgo(6), { typeOfWork: 'drill_only', name: `sent home ${stamp}` });
    days.push(day3);
    const cardId = await PA.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { createTimeCard, fileTimeCard } = await import('/src/hooks/useTimeCards.ts');
      const { getSessionUser } = await import('/src/lib/session.ts');
      const me = getSessionUser();
      const day = await db.blastDays.get(id);
      const cid = await createTimeCard(day, { name: me.name, userId: me.id });
      await fileTimeCard(await db.timeCards.get(cid));
      return cid;
    }, day3);
    cardIds.push(cardId);
    await waitForUpload(PA, 30000);
    await PA.goto(`${WEB}/days`);
    await PA.locator('main').waitFor({ timeout: 15000 });
    const label = await waitFor(() => PA.getByText(/Time cards only · drill only/).first().innerText());
    R.ok('the day list says "Time cards only · drill only"', /Time cards only/.test(label ?? ''));
    const cO = await mkCtx(browser, { autoGate: false, viewport: { width: 1280, height: 900 } });
    const PO = await cO.newPage();
    await signIn(PO, 'office');
    await skipTours(PO);
    await PO.locator('#queue-never').waitFor({ timeout: 20000 });
    await sleep(1000);
    const never = await PO.locator('#queue-never').innerText();
    R.ok('the office\'s "Never submitted" queue leaves the empty day alone', !never.includes(jobs[1].name));
    await cO.close();
  });

  await R.section('Card conflicts: the version check and the decision screen, field-level merge, the type-of-work guard, honest discard messages, the two live bugs', async () => {
    // (2) whole-payload clobber: A online sets ground; B offline sets wind; A sets temperature; B comes back — all three survive
    await PA.goto(`${WEB}/blast-day/${day2}`);
    await PA.locator('[data-conditions-edit]').waitFor({ timeout: 15000 });
    await PA.locator('[data-conditions-edit]').click();
    await PA.getByRole('button', { name: 'Muddy', exact: true }).click();
    await waitForUpload(PA, 30000);
    await waitFor(() => dayOf(PB, day2).then((d) => (d?.conditions.groundConditions === 'muddy' ? d : null)));
    await PB.goto(`${WEB}/blast-day/${day2}`);
    await PB.locator('[data-conditions-edit]').waitFor({ timeout: 15000 });
    await warm(PB);
    await cB.setOffline(true);
    await PB.locator('[data-conditions-edit]').click();
    await PB.getByRole('button', { name: 'SE', exact: true }).click();
    await PA.getByRole('button', { name: /High \(/ }).click();
    await waitForUpload(PA, 30000);
    await cB.setOffline(false);
    await waitForUpload(PB, 40000);
    const merged = await waitFor(() => dayOf(PA, day2).then((d) => (d?.conditions.windDirection === 'SE' ? d : null)));
    R.ok('B\'s wind merged in without clobbering A\'s ground and temperature', merged?.conditions.windDirection === 'SE' && merged?.conditions.groundConditions === 'muddy' && merged?.conditions.temperatureRange === 'high');
    const mergedB = await waitFor(() => dayOf(PB, day2).then((d) => (d?.conditions.temperatureRange === 'high' && d?.conditions.windDirection === 'SE' ? d : null)));
    R.ok('…and B sees all three too', mergedB?.conditions.groundConditions === 'muddy');

    // (3) type-of-work downgrade with a blasting log → refused, and said so
    await PA.goto(`${WEB}/blast-day/${day2}`);
    await PA.getByRole('button', { name: /Add Blasting Log/ }).waitFor({ timeout: 15000 });
    await PA.getByRole('button', { name: /Add Blasting Log/ }).click();
    await waitFor(() => countOf(PA, 'blastLogs', 'blastDayId', day2).then((n) => (n === 1 ? 1 : 0)));
    await waitForUpload(PA, 30000);
    await waitFor(() => countOf(PB, 'blastLogs', 'blastDayId', day2).then((n) => (n === 1 ? 1 : 0)));
    await PB.goto(`${WEB}/blast-day/${day2}`);
    await PB.locator('[data-conditions-edit]').waitFor({ timeout: 15000 });
    await PB.locator('[data-conditions-edit]').click();
    await PB.getByRole('button', { name: 'Drill Only', exact: true }).click();
    const said = await PB.getByText(/stays a blasting type/).first().waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
    R.ok('the server refuses and B is told: "The type of work stays a blasting type…"', said);
    const kept = await waitFor(() => dayOf(PB, day2).then((d) => (d?.typeOfWork === 'drill_to_blast' ? d : null)));
    R.ok('the day stays drill to blast on B', kept?.typeOfWork === 'drill_to_blast');

    // (4) two offline Starts on the blasting log → first wins, second told honestly
    day4 = await makeSetupDay(PA, jobs[2].id, daysAgo(1), { typeOfWork: 'drill_to_blast', name: `race ${stamp}` });
    days.push(day4);
    await waitForUpload(PA, 30000);
    await waitFor(() => dayOf(PS, day4).then((d) => (d ? d : null)));
    await warm(PA);
    await warm(PS);
    await cA.setOffline(true);
    await cS.setOffline(true);
    const startLog = (P) => P.evaluate(async (id) => (await import('/src/hooks/useBlastDay.ts')).addBlastLogToDay(id), day4);
    const logA = await startLog(PA);
    const logS = await startLog(PS);
    R.ok('each phone minted its own blasting log', logA !== logS);
    await cA.setOffline(false);
    await waitForUpload(PA, 40000);
    await spaGo(PS, '/');
    await cS.setOffline(false);
    const told = await PS.getByText(/started the blasting log first/).first().waitFor({ timeout: 40000 }).then(() => true).catch(() => false);
    R.ok('the second phone is told "Someone else started the blasting log first…"', told);
    await waitForUpload(PS, 40000);
    const logsS = await waitFor(() => idsOf(PS, 'blastLogs', 'blastDayId', day4).then((ids) => (ids.length === 1 && ids[0] === logA ? ids : null)));
    R.ok('exactly one blasting log on the day — the first one', logsS?.length === 1 && logsS[0] === logA);

    // (6) delete with an offline child → child refused, device told
    day5 = await makeSetupDay(PA, jobs[2].id, daysAgo(2), { typeOfWork: 'drill_only', name: `gone ${stamp}` });
    days.push(day5);
    await waitForUpload(PA, 30000);
    await waitFor(() => dayOf(PB, day5).then((d) => (d ? d : null)));
    await warm(PB);
    await cB.setOffline(true);
    const orphanLog = await PB.evaluate(async ({ id, jobId }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const { getSessionUser } = await import('/src/lib/session.ts');
      const me = getSessionUser();
      const now = nowISO();
      const logId = generateId();
      await db.drillLogs.add({ id: logId, jobId, blastDayId: id, shotId: '', status: 'open', holeDiameter: 0, burden: 0, spacing: 0, faceHeight: 0, gps: '', locationNote: '', drillerUserId: me.id, drillerName: me.name, signatureImage: null, createdAt: now, updatedAt: now, syncStatus: 'local' });
      return logId;
    }, { id: day5, jobId: jobs[2].id });
    await PA.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { deleteDayCascade } = await import('/src/lib/lifecycle.ts');
      await deleteDayCascade(await db.blastDays.get(id));
    }, day5);
    await waitForUpload(PA, 30000);
    await spaGo(PB, '/');
    await cB.setOffline(false);
    const toldB = await PB.getByText(/was deleted while you were offline/).first().waitFor({ timeout: 40000 }).then(() => true).catch(() => false);
    R.ok('B is told the day their drill log belongs to was deleted', toldB);
    await waitForUpload(PB, 40000);
    const goneB = await waitFor(() => PB.evaluate(async (logId) => !(await (await import('/src/db/index.ts')).db.drillLogs.get(logId)), orphanLog).then((g) => (g ? 1 : 0)));
    R.ok('no orphan drill log survives on B', goneB === 1);

    // (7) PATCH after a merge-away → refused; exactly one blasting log
    day6 = await makeSetupDay(PA, jobs[2].id, undefined, { typeOfWork: 'drill_to_blast', name: `merge ${stamp}` });
    days.push(day6);
    const L1 = await PA.evaluate(async (id) => (await import('/src/hooks/useBlastDay.ts')).addBlastLogToDay(id), day6);
    await waitForUpload(PA, 30000);
    await waitFor(() => idsOf(PS, 'blastLogs', 'blastDayId', day6).then((ids) => (ids.includes(L1) ? ids : null)));
    await warm(PS);
    await cS.setOffline(true);
    const L2 = await PA.evaluate(async ({ day, L1 }) => {
      const { db, deleteWithTombstone } = await import('/src/db/index.ts');
      for (const s of await db.shots.where('blastLogId').equals(L1).toArray()) await deleteWithTombstone('shots', s.id);
      for (const u of await db.explosiveUsages.where('blastLogId').equals(L1).toArray()) await deleteWithTombstone('explosiveUsages', u.id);
      await deleteWithTombstone('blastLogs', L1);
      return (await import('/src/hooks/useBlastDay.ts')).addBlastLogToDay(day);
    }, { day: day6, L1 });
    await waitForUpload(PA, 30000);
    await PS.evaluate(async (L1) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.blastLogs.update(L1, { notes: 'late edit', updatedAt: nowISO() });
    }, L1);
    await spaGo(PS, '/');
    await cS.setOffline(false);
    const toldS = await PS.getByText(/no longer on the server/).first().waitFor({ timeout: 40000 }).then(() => true).catch(() => false);
    R.ok('the late edit to the merged-away log is refused and S is told', toldS);
    await waitForUpload(PS, 40000);
    const logs6 = await waitFor(() => idsOf(PS, 'blastLogs', 'blastDayId', day6).then((ids) => (ids.length === 1 && ids[0] === L2 ? ids : null)));
    R.ok('exactly one blasting log on the day — the merged one, not a resurrected copy', logs6?.length === 1 && logs6[0] === L2);
    R.ok('…and the same on A', JSON.stringify(await idsOf(PA, 'blastLogs', 'blastDayId', day6)) === JSON.stringify([L2]));
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: days.filter(Boolean) }).catch(() => -1);
    // filed time cards delete only as an approver
    const cM = await mkCtx(browser);
    const PM = await cM.newPage();
    await signIn(PM, 'mark');
    const cards = await PM.evaluate(async (ids) => {
      const { db, deleteWithTombstone } = await import('/src/db/index.ts');
      let n = 0;
      for (const id of ids) if (await db.timeCards.get(id)) { await deleteWithTombstone('timeCards', id); n++; }
      return n;
    }, cardIds).catch(() => 0);
    await waitForUpload(PM, 30000).catch(() => undefined);
    await cM.close();
    R.ok(`cleanup removed ${removed} day(s), ${cards} time card(s)`, removed >= 0);
  });
  await cA.close();
  await cB.close();
  await cS.close();
  return R.summary();
}

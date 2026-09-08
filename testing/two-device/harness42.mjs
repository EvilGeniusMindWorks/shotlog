async (page) => {
  // Round S7a — rehearsal data (2026-09-07): Start copies the platform
  // admin's company (fleet, roster without logins, catalog) unless told to
  // start empty; "Add sample data" loads a connected week; every role finds
  // real work; the driller files a checklist with nothing else and the
  // usual rig follows the account. The source company is never written.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const API = 'http://localhost:4000';
  const WEB = 'http://localhost:5199';

  const mkCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', '${API}');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      if (!localStorage.getItem('shotlog-rehearsal')) localStorage.setItem('shotlog-pin', 'x');
    `);
    return ctx;
  };
  const signIn = async (P, email, pass) => {
    await P.goto(WEB);
    await P.locator('input[type="email"]').fill(email);
    await P.locator('input[type="password"]').fill(pass);
    await P.getByRole('button', { name: 'Sign in' }).click();
    await P.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await P.waitForTimeout(1500);
  };
  const api = async (path, init = {}, token) => {
    const res = await page.request.fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      data: init.body,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return { status: res.status(), body: await res.json().catch(() => null) };
  };
  const enterPin = async (P) => {
    for (const d of '123456123456') await P.getByRole('button', { name: d, exact: true }).click();
    await P.waitForTimeout(800);
  };
  // Start a rehearsal from Settings and get through PIN → welcome → tour
  const rehearse = async (P, role, withData) => {
    await P.goto(`${WEB}/settings`);
    await P.locator('[data-rehearsal-card]').waitFor({ timeout: 10000 });
    const box = P.locator('[data-rehearsal-with-data]');
    if ((await box.isChecked()) !== withData) await box.click();
    await P.locator(`[data-rehearse-as="${role}"]`).click();
    await P.getByText(/Set a 6-digit PIN/).waitFor({ timeout: 25000 });
    await enterPin(P);
    await P.getByRole('button', { name: /Let.s go/ }).click();
    await P.locator('[data-tour-overlay]').waitFor({ timeout: 8000 });
    await P.locator('[data-tour-skip]').click();
    await P.waitForTimeout(800);
  };
  const addSample = async (P) => {
    await P.locator('[data-rehearsal-sample]').click();
    await P.getByText(/Added a week/).waitFor({ timeout: 20000 });
    await P.waitForTimeout(4000); // sync down
  };
  const end = async (P) => {
    await P.goto(WEB);
    await P.waitForTimeout(1200);
    await P.locator('[data-rehearsal-end]').click();
    await P.waitForTimeout(4000);
  };
  try {
    const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'mark@baystateblasting.com', password: 'dev-password-123' }) });
    const adminTok = login.body.accessToken;
    const before = await api('/platform/rehearsal/status', {}, adminTok);
    const homeBefore = before.body?.home?.records ?? -1;
    ok(`status reports the home company (${homeBefore} records)`, homeBefore > 0);

    // ── 1. driller, WITH the company's data ─────────────────────────────
    const c1 = await mkCtx();
    const P1 = await c1.newPage();
    await signIn(P1, 'mark@baystateblasting.com', 'dev-password-123');
    await rehearse(P1, 'driller', true);
    ok('driller rehearsal running', (await P1.locator('[data-rehearsal-bar="driller"]').count()) === 1);
    const st0 = await api('/platform/rehearsal/status', {}, adminTok);
    ok('Start copied the fleet and the roster (no logins) but no jobs', (st0.body.tables.equipment ?? 0) > 0 && (st0.body.tables.crewMembers ?? 0) > 6 && !st0.body.tables.jobs);
    // Checklist with nothing else: the tile opens the picker (no plan, no job)
    await P1.goto(`${WEB}/drilling`);
    await P1.locator('[data-checklist-door]').waitFor({ timeout: 8000 });
    ok('Drilling tab has a Rig checklist door before any plan exists', /File rig checklist/.test(await P1.locator('[data-checklist-door]').innerText()));
    await P1.locator('[data-checklist-door]').click();
    await P1.waitForURL(/drill-checklist$/, { timeout: 8000 });
    await P1.locator('[data-rig-field]').waitFor({ timeout: 5000 });
    ok('the form asks which rig first — nothing preselected', (await P1.locator('[data-chk-pick-first]').count()) === 1);
    await P1.locator('[data-rig-all-toggle]').click();
    await P1.locator('[data-rig-all] [data-rig-chip]').first().waitFor({ timeout: 8000 });
    const options = await P1.locator('[data-rig-all] [data-rig-chip]').count();
    ok(`the fleet list shows the copied drills (${options})`, options > 0);
    const pickedAsset = await P1.locator('[data-rig-all] [data-rig-chip]').first().getAttribute('data-rig-chip');
    await P1.locator('[data-rig-all] [data-rig-chip]').first().click();
    await P1.waitForTimeout(600);
    ok('tapping a rig makes the form that rig\'s, no save', (await P1.locator('[data-chk-rig-selected]').getAttribute('data-chk-rig-selected')) === pickedAsset && (await P1.locator('[data-chk-hours]').count()) === 1);
    ok('checklist opens with no job attached ("No job — just the rig")', (await P1.locator('[data-checklist-job]').inputValue()) === '');
    const usual = await P1.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const me = JSON.parse(localStorage.getItem('shotlog-user-info') ?? '{}');
      return (await db.equipment.filter((e) => e.assignedUserId === me.id).toArray()).map((e) => e.assetNumber);
    });
    ok('browsing the rigs writes nothing to the account (usual rig only on file)', usual.length === 0);
    // Now the week
    await addSample(P1);
    await P1.goto(WEB);
    await P1.waitForTimeout(2500);
    const home1 = await P1.locator('main').innerText();
    // (innerText carries CSS uppercase on eyebrows — match case-insensitively)
    ok('driller home shows the plan sent to them, half drilled', /Bench 3 east/i.test(home1) && /13 holes/.test(home1) && /13\/31/.test(home1));
    ok('driller home does not claim "no open drill plans" while one is half drilled', !/No open drill plans/.test(home1));
    await P1.goto(`${WEB}/drilling`);
    await P1.waitForTimeout(1500);
    const door = await P1.locator('[data-checklist-door]').innerText();
    ok('checklist door still reads as the action (not filed today)', /File rig checklist/.test(door));
    await P1.locator('[data-checklist-door]').click();
    await P1.waitForURL(/drill-checklist$/, { timeout: 8000 });
    await P1.locator('[data-rig-chip][data-rig-reason="today\'s log"]').waitFor({ timeout: 8000 });
    ok('the quick picks lead with the rig from today\'s drill log', (await P1.locator('[data-rig-quick] [data-rig-chip]').first().getAttribute('data-rig-reason')) === "today's log");
    await P1.locator('[data-rig-chip][data-rig-reason="today\'s log"]').click();
    await P1.waitForTimeout(1000);
    const sel = P1.locator('[data-checklist-job]');
    const selText = await sel.locator('option:checked').innerText();
    ok(`job is prefilled from today's drilling, still optional (${selText})`, /26-001/.test(selText));
    const st1 = await api('/platform/rehearsal/status', {}, adminTok);
    const t = st1.body.tables;
    ok('sample week on the server: 2 jobs · plan · 2 logs · 34 holes · 2 days · 3 cards · 3 checklists · ticket · incident',
      t.jobs === 2 && t.drillPlans === 1 && t.drillLogs === 2 && t.drillLogHoles === 34 && t.blastDays === 2 && t.timeCards === 3 && t.drillChecklists === 3 && t.repairTickets === 1 && t.incidents === 1 && t.seismoReadings === 1);
    ok('a second Add is a no-op', (await api('/platform/rehearsal/sample', { method: 'POST', body: '{}' }, await P1.evaluate(() => localStorage.getItem('shotlog-access-token')))).body.existing === true);
    await end(P1);
    ok('End → back to Mark', /Baystate/.test(await P1.locator('aside').innerText()));
    await c1.close();

    // ── 2. mechanic, EMPTY start → the shop finds three things to work ──
    const c2 = await mkCtx();
    const P2 = await c2.newPage();
    await signIn(P2, 'mark@baystateblasting.com', 'dev-password-123');
    await rehearse(P2, 'mechanic', false);
    const st2 = await api('/platform/rehearsal/status', {}, adminTok);
    ok('Start empty copies nothing (roster of six only)', !st2.body.tables.equipment && st2.body.tables.crewMembers === 6);
    await addSample(P2);
    await P2.goto(WEB);
    await P2.waitForTimeout(2500);
    const shop = await P2.locator('main').innerText();
    ok('shop worklist: the leak ticket + service due', /Hydraulic leak/.test(shop) && /due/i.test(shop));
    ok('a rig is in the shop', /in shop|In shop/i.test(shop) || /R-101/.test(shop));
    await end(P2);
    await c2.close();

    // ── 3. office → the queue has a day, cards and a claim ──────────────
    const c3 = await mkCtx();
    const P3 = await c3.newPage();
    await signIn(P3, 'mark@baystateblasting.com', 'dev-password-123');
    await rehearse(P3, 'office', true);
    await addSample(P3);
    await P3.goto(WEB);
    await P3.locator('[data-office-home]').waitFor({ timeout: 8000 });
    await P3.waitForTimeout(2000);
    const approvals = await P3.locator('#queue-approvals').innerText();
    const cards = await P3.locator('#queue-cards').innerText();
    const incidents = await P3.locator('#queue-incidents').innerText();
    ok('queue: yesterday\'s day awaits approval', /Bench 2 lift 4|Ledgeville/.test(approvals));
    ok('queue: three filed cards to approve (initials + ST/OT)', /R\. Blaster 8\/0\.5/.test(cards) && /R\. Driller 8\/1/.test(cards) && /R\. Supervisor/.test(cards) && /3 cards/.test(cards));
    ok('queue: the cracked-window claim is open', /open incidents · 1/i.test(incidents) && /1 open or in review/.test(incidents));
    ok('queue: the day row says what is attached', /1 shot · 3 time cards · rig checklist ✓ · drill log ✓/.test(approvals));
    ok('queue: the culvert permit and COI are expiring', /CH-26-031/.test(await P3.locator('#queue-expiring').innerText()));
    await end(P3);
    await c3.close();

    // ── 4. blaster → today's draft + yesterday submitted ────────────────
    const c4 = await mkCtx();
    const P4 = await c4.newPage();
    await signIn(P4, 'mark@baystateblasting.com', 'dev-password-123');
    await rehearse(P4, 'blaster', true);
    await addSample(P4);
    await P4.goto(WEB);
    await P4.waitForTimeout(2500);
    const bhome = await P4.locator('main').innerText();
    // S8: a fresh drill-to-blast day's first step is the drill plan ("Build the drill plan"); a shot already loaded keeps "Continue — Shot 1"
    ok('blaster home: today\'s draft at the culvert with a Continue', /Route 3 culvert · 26-007/.test(bhome) && /Build the drill plan|Continue — Shot 1/.test(bhome));
    ok('blaster home: yesterday at the pit, submitted, with the explosives total', /Ledgeville Pit — Phase 1/.test(bhome) && /1 shot · [\d,]+ lbs/.test(bhome) && /submitted/.test(bhome));
    await P4.goto(`${WEB}/days`);
    await P4.waitForTimeout(2500);
    const days = await P4.locator('main').innerText();
    ok('work days: yesterday submitted, today draft', /Ledgeville Pit/.test(days) && /submitted/.test(days) && /Route 3 culvert/.test(days) && /draft/.test(days));
    await end(P4);
    await c4.close();

    const after = await api('/platform/rehearsal/status', {}, adminTok);
    ok(`the home company was never written (${homeBefore} → ${after.body.home.records})`, after.body.home.records === homeBefore);
    ok('sandbox wiped after the last End', !after.body.tables.jobs && after.body.tables.crewMembers === 6);
  } catch (e) {
    results.push(`ERROR ${e.message}`);
  }
  return results.join('\n');
}

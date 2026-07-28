async (page) => {
  // Offline-trust round: truthful chip states, data fully visible offline,
  // offline writes queue + drain on reconnect (watchdog), session-expired
  // banner keeps the app usable, skeletons prevent the "No jobs yet" flash.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let dev;
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
    `);
    dev = await ctx.newPage();
    await dev.goto('http://localhost:5199');
    await dev.locator('input[type="email"]').fill('mark@baystateblasting.com');
    await dev.locator('input[type="password"]').fill('dev-password-123');
    await dev.getByRole('button', { name: 'Sign in' }).click();
    await dev.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await dev.waitForTimeout(4000);

    const bodyHas = async (t) => (await dev.locator('body').innerText()).includes(t);
    const waitBody = async (t, ms = 20000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (await bodyHas(t)) return true;
        await dev.waitForTimeout(500);
      }
      return false;
    };

    // ── 1. Connected: chip says all saved ─────────────────────────────────
    ok('chip: All changes saved (connected)', await waitBody('All changes saved'));

    // Warm the /jobs route's dev modules — while offline the dev server can't
    // serve lazy imports (prod SW precaches everything; dev has no SW)
    await dev.goto('http://localhost:5199/jobs');
    await dev.waitForTimeout(2000);
    await dev.goto('http://localhost:5199/');
    await dev.waitForTimeout(1500);

    // ── 2. Offline: truthful label + data still fully visible ─────────────
    await ctx.setOffline(true);
    ok('chip: Offline — saved on this device', await waitBody('Offline — saved on this device'));
    // client-side navigation (sidebar link) — no network involved
    await dev.locator('a[href="/jobs"]').first().click();
    await dev.waitForTimeout(2500);
    const jobsVisibleOffline = await dev.evaluate(async () => {
      const jobs = await window.shotlogDb.jobs.toArray();
      const shown = document.body.innerText;
      return jobs.length > 0 && jobs.some((j) => shown.includes(j.name));
    });
    ok('local data fully visible while offline', jobsVisibleOffline);

    // ── 3. Offline write queues ───────────────────────────────────────────
    const tag = `H16-${Date.now() % 1000000}`;
    await dev.evaluate(async (t) => {
      await window.shotlogFlows.createJob({ name: `${t} Offline Job`, customer: 'H16' });
    }, tag);
    await dev.waitForTimeout(1500);
    // open the sync panel from the chip and read the queued count
    await dev.locator('button[title="Sync status — tap for details"]').first().click();
    await dev.waitForTimeout(800);
    const queuedTxt = await dev.locator('text=Waiting to send').locator('..').innerText();
    const queuedN = parseInt(queuedTxt.replace(/\D+/g, ''), 10) || 0;
    ok(`offline write queued (panel shows ${queuedN})`, queuedN > 0);

    // ── 4. Back online: watchdog reconnects, queue drains ─────────────────
    await ctx.setOffline(false);
    const drained = await (async () => {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const txt = await dev.locator('body').innerText();
        if (txt.includes('All changes saved')) return true;
        await dev.waitForTimeout(1000);
      }
      return false;
    })();
    ok('reconnect + queue drained to All changes saved', drained);
    await dev.keyboard.press('Escape').catch(() => undefined);
    await dev.locator('button[aria-label="Close"]').click().catch(() => undefined);

    // ── 5. Session expired: banner + app still fully usable (online again) ─
    await dev.evaluate(() => localStorage.setItem('shotlog-session-expired', '1'));
    await dev.goto('http://localhost:5199/jobs');
    await dev.waitForTimeout(2500);
    ok('expired banner shown', await bodyHas('Syncing paused — sign in when you have signal'));
    const dataWithExpired = await dev.evaluate(async () => {
      const jobs = await window.shotlogDb.jobs.toArray();
      return jobs.length > 0 && jobs.some((j) => document.body.innerText.includes(j.name));
    });
    ok('data + app fully usable while expired', dataWithExpired);
    ok('chip: Syncing paused — sign in', await bodyHas('Syncing paused — sign in'));
    await dev.evaluate(() => localStorage.removeItem('shotlog-session-expired'));

    // ── 6. Skeletons: never flash "No jobs yet" during hydration ──────────
    const p2 = await ctx.newPage();
    await p2.goto('http://localhost:5199/jobs');
    let flashed = false;
    for (let i = 0; i < 25; i++) {
      const txt = await p2.evaluate(() => document.body.innerText).catch(() => '');
      if (txt.includes('No jobs yet')) {
        flashed = true;
        break;
      }
      await p2.waitForTimeout(120);
    }
    ok('no "No jobs yet" flash during hydration', !flashed);
    const settled = await p2.evaluate(async () => {
      const jobs = await window.shotlogDb.jobs.toArray();
      return jobs.length > 0 && jobs.some((j) => document.body.innerText.includes(j.name));
    });
    ok('jobs render after hydration', settled);
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await dev.locator('body').innerText()).slice(0, 300)); } catch {}
  }
  return results.join('\n');
}

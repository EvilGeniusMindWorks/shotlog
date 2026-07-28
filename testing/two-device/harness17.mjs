async (page) => {
  // Doc-first round: launcher tiles find-or-create today's day (never
  // duplicate), Daily Report tile lands on the daily tab, Drill Plan tile
  // upgrades a drill-only day and opens the editor, DrillPlanCard sits at the
  // top of the day page with send-to-drillers co-located, driller Drill Log
  // tile self-starts a log, and the launcher passes the 430px overflow rule.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let admin, blaster, driller, mob;
  try {
    const mk = async (viewport) => {
      const ctx = await browser.newContext(viewport ? { viewport } : {});
      await ctx.addInitScript(`
        localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
        localStorage.setItem('shotlog-pin', 'x');
        localStorage.setItem('shotlog-last-active', String(Date.now()));
      `);
      const p = await ctx.newPage();
      await p.goto('http://localhost:5199');
      return p;
    };
    const login = async (p, email, pass) => {
      await p.locator('input[type="email"]').fill(email);
      await p.locator('input[type="password"]').fill(pass);
      await p.getByRole('button', { name: 'Sign in' }).click();
      await p.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
      await p.waitForTimeout(3500);
    };
    const waitFor = async (p, fn, arg, ms = 30000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (await p.evaluate(fn, arg).catch(() => false)) return true;
        await p.waitForTimeout(500);
      }
      return false;
    };
    const tag = `H17-${Date.now() % 1000000}`;
    // Job-pick rows live in the sheet overlay; day cards elsewhere also carry
    // job names, so clicks must be scoped to the overlay
    const pickJob = async (p, name) => {
      await p
        .locator('div.fixed.inset-0')
        .getByRole('button', { name: new RegExp(name) })
        .first()
        .click();
    };

    // ── Admin creates two fresh jobs (jobs are admin-only writes) ─────────
    admin = await mk(null);
    await login(admin, 'mark@baystateblasting.com', 'dev-password-123');
    const jobs = await admin.evaluate(async (t) => {
      const a = await window.shotlogFlows.createJob({ name: `${t} Alpha Job`, customer: 'H17' });
      const b = await window.shotlogFlows.createJob({ name: `${t} Bravo Job`, customer: 'H17' });
      return { a, b };
    }, tag);

    // ── Blaster: launcher visible, Blast Day tile find-or-create ──────────
    blaster = await mk(null);
    await login(blaster, 'blaster@test.local', 'blaster-pass-123');
    ok('jobs synced to blaster', await waitFor(blaster, async (id) =>
      Boolean(await window.shotlogDb.jobs.get(id)), jobs.b, 45000));
    await blaster.goto('http://localhost:5199/');
    await blaster.waitForTimeout(2500);
    // CSS uppercases the heading — innerText reflects the transform
    ok('Start grid on blaster dashboard', /start something/i.test(await blaster.locator('body').innerText()));

    await blaster.getByRole('button', { name: /Blast Day/ }).click();
    await blaster.waitForTimeout(800);
    await pickJob(blaster, `${tag} Alpha Job`);
    await blaster.waitForURL(/blast-day\//, { timeout: 15000 });
    const dayA1 = blaster.url().match(/blast-day\/([0-9a-f-]+)/)[1];
    ok('Blast Day tile created + opened a day', Boolean(dayA1));

    await blaster.goto('http://localhost:5199/');
    await blaster.waitForTimeout(2000);
    await blaster.getByRole('button', { name: /Blast Day/ }).click();
    await blaster.waitForTimeout(800);
    await pickJob(blaster, `${tag} Alpha Job`);
    await blaster.waitForURL(/blast-day\//, { timeout: 15000 });
    const dayA2 = blaster.url().match(/blast-day\/([0-9a-f-]+)/)[1];
    const dayCount = await blaster.evaluate(async (jobId) => {
      const days = await window.shotlogDb.blastDays.where('jobId').equals(jobId).toArray();
      return days.length;
    }, jobs.a);
    ok(`second tap reuses the SAME day (${dayCount} day total)`, dayA1 === dayA2 && dayCount === 1);

    // ── Daily Report tile → drill_only day, daily tab content ─────────────
    await blaster.goto('http://localhost:5199/');
    await blaster.waitForTimeout(2000);
    await blaster.getByRole('button', { name: /Daily Report/ }).click();
    await blaster.waitForTimeout(800);
    await pickJob(blaster, `${tag} Bravo Job`);
    await blaster.waitForURL(/blast-day\//, { timeout: 15000 });
    await blaster.waitForTimeout(2000);
    const dayB = blaster.url().match(/blast-day\/([0-9a-f-]+)/)[1];
    const bState = await blaster.evaluate(async (dayId) => {
      const day = await window.shotlogDb.blastDays.get(dayId);
      return { type: day?.typeOfWork, body: document.body.innerText.includes('Work Force') };
    }, dayB);
    ok('Daily Report tile → drill_only day + daily tab', bState.type === 'drill_only' && bState.body);

    // ── Drill Plan tile → upgrades Bravo's day, lands in the editor ───────
    await blaster.goto('http://localhost:5199/');
    await blaster.waitForTimeout(2000);
    await blaster.getByRole('button', { name: /Drill Plan/ }).click();
    await blaster.waitForTimeout(800);
    await pickJob(blaster, `${tag} Bravo Job`);
    await blaster.waitForURL(/\/design\//, { timeout: 15000 });
    const upgraded = await blaster.evaluate(async (dayId) => {
      const log = await window.shotlogDb.blastLogs.where('blastDayId').equals(dayId).first();
      const day = await window.shotlogDb.blastDays.get(dayId);
      return Boolean(log) && day.typeOfWork === 'drill_to_blast';
    }, dayB);
    ok('Drill Plan tile upgraded the day + opened editor', upgraded);

    // ── DrillPlanCard: seed a plan on Alpha, send from the TOP of the page ─
    await blaster.evaluate(async (dayId) => {
      const db = window.shotlogDb;
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      await db.shots.update(shot.id, {
        designPlan: {
          ...shot.designPlan,
          shotDiagramData: JSON.stringify({
            rows: 3, cols: 4, delays: {}, wires: [], interHoleMs: 15,
            plan: { defaultDepth: 12, overrides: {} },
          }),
        },
        updatedAt: new Date().toISOString(),
      });
    }, dayA1);
    await blaster.goto(`http://localhost:5199/blast-day/${dayA1}`);
    await blaster.waitForTimeout(2500);
    const cardTxt = await blaster.locator('body').innerText();
    ok('DrillPlanCard shows plan ready + not sent', cardTxt.includes('Drill Plan') && cardTxt.includes('Plan ready — not sent'));
    ok('12 holes planned shown', cardTxt.includes('12 holes planned'));

    const dinisUserId = await admin.evaluate(async () => {
      const crew = await window.shotlogDb.crewMembers.toArray();
      return crew.find((c) => c.name.toLowerCase().includes('dinis'))?.userId ?? null;
    });
    await blaster.getByRole('button', { name: 'Send to drillers' }).first().click();
    await blaster.waitForTimeout(1000);
    // check the first enabled row mentioning dinis
    const dinisRow = blaster.locator('label').filter({ hasText: /dinis/i }).first();
    await dinisRow.locator('input[type="checkbox"]').check();
    await blaster.getByRole('button', { name: /Send to 1/ }).click();
    await blaster.waitForTimeout(2000);
    const afterSend = await blaster.locator('body').innerText();
    ok('card shows driller row with open badge', /dinis/i.test(afterSend) && afterSend.includes('open'));

    // ── Driller: Drill Log tile self-starts a log ─────────────────────────
    driller = await mk(null);
    await login(driller, 'dinis@test.local', 'dinis-pass-123');
    await driller.goto('http://localhost:5199/');
    await driller.waitForTimeout(2500);
    ok('Start grid on driller home', /start something/i.test(await driller.locator('body').innerText()));
    await driller.getByRole('button', { name: /Drill Log/ }).first().click();
    await driller.waitForTimeout(800);
    await pickJob(driller, `${tag} Bravo Job`);
    await driller.waitForURL(/drill-log\//, { timeout: 20000 });
    const selfLog = await driller.evaluate(async () => {
      const url = location.pathname.match(/drill-log\/([0-9a-f-]+)/);
      if (!url) return null;
      return window.shotlogDb.drillLogs.get(url[1]);
    });
    ok('driller tile self-started a log on today\'s day', Boolean(selfLog) && !selfLog.assignedBy);

    // ── 430px overflow rule on the new surfaces ───────────────────────────
    mob = await mk({ width: 430, height: 932 });
    await login(mob, 'blaster@test.local', 'blaster-pass-123');
    const scan = async () =>
      mob.evaluate(() => {
        const iw = window.innerWidth;
        const main = document.querySelector('main');
        return (
          document.documentElement.scrollWidth > iw + 1 ||
          Boolean(main && main.scrollWidth > main.clientWidth + 1)
        );
      });
    await mob.goto('http://localhost:5199/');
    await mob.waitForTimeout(2500);
    results.push((await scan()) ? 'OVERFLOW dashboard+grid' : 'PASS no-overflow dashboard+grid');
    await mob.goto(`http://localhost:5199/blast-day/${dayA1}`);
    await mob.waitForTimeout(2500);
    results.push((await scan()) ? 'OVERFLOW day page+card' : 'PASS no-overflow day page+card');
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try {
      results.push('STATE ' + (await (driller ?? blaster ?? admin).locator('body').innerText()).slice(0, 400));
    } catch {}
  }
  return results.join('\n');
}

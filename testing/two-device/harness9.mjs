async (page) => {
  // Per-hole drill plans + driller self-service:
  //   blaster authors a plan (default depth + one deep/angled exception) →
  //   driller sees Ready to drill, one-taps holes to plan (auto-advance,
  //   planned fields stored), logs one short+wet hole → blaster's second
  //   log claims only remaining holes → complete → review card flags the
  //   short hole → accept → print shows Plan column. Separately: driller
  //   creates a drill-only day from the FAB, /days works, rig picker opens.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let blaster, driller;
  try {

  const mk = async (name) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      localStorage.setItem('harness-device', '${name}');
    `);
    const p = await ctx.newPage();
    await p.goto('http://localhost:5199');
    return p;
  };
  const login = async (p, email, pass) => {
    await p.locator('input[type="email"]').fill(email);
    await p.locator('input[type="password"]').fill(pass);
    await p.getByRole('button', { name: 'Sign in' }).click();
    await p.waitForSelector('text=Dashboard', { timeout: 15000 });
  };
  const waitDb = async (p, expr, ms = 25000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const val = await p.evaluate(async (e) => {
        try { const db = window.shotlogDb; return await eval(e); } catch { return null; }
      }, expr);
      if (val) return val;
      await p.waitForTimeout(500);
    }
    return null;
  };
  const bodyOf = async (p) => (await p.locator('body').innerText()).toLowerCase();
  // Vite dev server occasionally 400s a navigation after many HMR cycles — retry
  const goto = async (p, url) => {
    for (let i = 0; i < 3; i++) {
      try { await p.goto(url); return; } catch (e) { if (i === 2) throw e; await p.waitForTimeout(1500); }
    }
  };

  // ── Blaster: job + blasting work day + plan ─────────────────────────────
  blaster = await mk('H9-BLASTER');
  await login(blaster, 'blaster@test.local', 'blaster-pass-123');
  await blaster.waitForTimeout(2000);

  const tag = `H9-${Date.now() % 1000000}`; // fresh names each run — old aborted-run artifacts can't collide
  // Jobs are admin-only reference data (a blaster-created job would be
  // silently discarded server-side) — use an existing synced job
  const ids = await blaster.evaluate(async (t) => {
    const db = window.shotlogDb;
    const job = await db.jobs.filter((j) => j.isActive).first();
    if (!job) return { error: 'no active job in local dev db' };
    const f = window.shotlogFlows;
    const dayId = await f.createBlastDay(job.id, new Date().toISOString().slice(0, 10), undefined, {
      typeOfWork: 'drill_to_blast',
      name: `${t} plan day`,
    });
    const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
    const shot = await db.shots.where('blastLogId').equals(log.id).first();
    return { jobId: job.id, jobLabel: `${job.name} — ${job.customer}`, dayId, shotId: shot.id };
  }, tag);
  ok('flows created day/shot on existing job', Boolean(ids.shotId));
  if (ids.error) throw new Error(ids.error);

  // Author the plan in the designer: 1×6 grid, default 16, hole 1 → 18.5 @ 15°
  await goto(blaster, `http://localhost:5199/blast-day/${ids.dayId}/design/${ids.shotId}`);
  await blaster.waitForSelector('text=/shot diagram/i', { timeout: 15000 });
  const rowMinus = blaster.locator('span:has-text("Rows:") button').first();
  const colMinus = blaster.locator('span:has-text("Cols:") button').first();
  for (let i = 0; i < 4; i++) await rowMinus.click();
  for (let i = 0; i < 4; i++) await colMinus.click();
  await blaster.getByRole('button', { name: /drill plan/i }).click();
  await blaster.locator('div.bg-orange-50 input').fill('16');
  await blaster.locator('svg g.cursor-pointer').first().click();
  const panel = blaster.locator('div.border-navy');
  await panel.locator('input').nth(0).fill('18.5');
  await panel.locator('input').nth(1).fill('15');
  await blaster.waitForTimeout(800); // debounced flush is 400ms
  ok('exception counted', (await bodyOf(blaster)).includes('1 exception'));
  const savedPlan = await waitDb(
    blaster,
    `db.shots.get('${ids.shotId}').then(s => s.designPlan.shotDiagramData?.includes('"plan"') && JSON.parse(s.designPlan.shotDiagramData))`,
  );
  ok('plan persisted (rows 1, cols 6, override on hole 1)',
    savedPlan && savedPlan.rows === 1 && savedPlan.cols === 6 &&
    savedPlan.plan?.defaultDepth === 16 && savedPlan.plan?.overrides?.['0']?.depth === 18.5);

  // ── Driller: Ready to drill → plan-guided logging ───────────────────────
  driller = await mk('H9-DRILLER');
  await login(driller, 'dinis@test.local', 'dinis-pass-123');
  const synced = await waitDb(
    driller,
    `db.shots.get('${ids.shotId}').then(s => s && s.designPlan.shotDiagramData?.includes('"plan"'))`,
    45000, // first login hydrates the whole company dataset
  );
  ok('plan synced to driller device', Boolean(synced));
  await goto(driller, 'http://localhost:5199/');
  await driller.waitForTimeout(1500);
  const dBody = await bodyOf(driller);
  ok('ready-to-drill card shows the shot', dBody.includes('ready to drill') && dBody.includes(`${tag.toLowerCase()} plan day`));

  await driller.locator(`button:has-text("${tag} plan day"):has-text("Start")`).first().click();
  await driller.waitForSelector('text=/drill log/i', { timeout: 15000 });
  await driller.waitForTimeout(1200);
  const entry1 = await bodyOf(driller);
  ok('progress reads 0 of 6', entry1.includes('0</b> of 6'.toLowerCase()) || entry1.includes('0 of 6'));
  const hole1Btn = driller.getByRole('button', { name: /add hole 1/i });
  ok('one-tap button offers plan depth 18.5', (await hole1Btn.innerText()).includes('18.5'));
  await hole1Btn.click(); // hole 1 to plan
  await driller.waitForTimeout(600);
  const hole2Btn = driller.getByRole('button', { name: /add hole 2/i });
  ok('auto-advanced to hole 2 at default 16', (await hole2Btn.innerText()).includes('16'));
  // hole 2: deliberately short (13 ft) and wet
  await driller.locator('input[placeholder="16"]').fill('13');
  await driller.getByRole('button', { name: /water/i }).click();
  await driller.getByRole('button', { name: /add hole 2/i }).click();
  await driller.waitForTimeout(600);
  await driller.getByRole('button', { name: /add hole 3/i }).click(); // hole 3 to plan
  await driller.waitForTimeout(600);

  const drillerLogId = await driller.evaluate(async (shotId) => {
    const db = window.shotlogDb;
    const logs = await db.drillLogs.where('shotId').equals(shotId).toArray();
    return logs[0]?.id;
  }, ids.shotId);
  const holesOf = `db.drillLogs.where('shotId').equals('${ids.shotId}').toArray().then(async (logs) => {
    const all = [];
    for (const l of logs) all.push(...await db.drillLogHoles.where('drillLogId').equals(l.id).toArray());
    return all;
  })`;
  const h1 = await waitDb(driller, `${holesOf}.then(hs => { const h = hs.find(x => x.holeNumber === '1'); return h && JSON.stringify(h); })`);
  const h1p = h1 ? JSON.parse(h1) : null;
  ok('hole 1 stored with plan snapshot (18.5 ft, 15°)',
    h1p && h1p.actualDepth === 18.5 && h1p.angle === 15 && h1p.plannedDepth === 18.5 && h1p.plannedAngle === 15);
  const h2raw = await waitDb(driller, `${holesOf}.then(hs => { const h = hs.find(x => x.holeNumber === '2'); return h && JSON.stringify(h); })`);
  const h2 = h2raw ? JSON.parse(h2raw) : null;
  ok('hole 2 stored short + wet with planned 16',
    h2 && h2.actualDepth === 13 && h2.plannedDepth === 16 && h2.conditions.some((c) => c.code === 'W'));

  // ── Blaster's second log claims only remaining holes (4,5,6) ────────────
  await waitDb(blaster, `${holesOf}.then(hs => hs.length >= 3)`);
  await goto(blaster, `http://localhost:5199/blast-day/${ids.dayId}`);
  await blaster.waitForTimeout(1500);
  // The first-shot auto-expand races the live query on reload — expand by hand
  if (!(await blaster.getByRole('button', { name: /new drill log/i }).isVisible().catch(() => false))) {
    await blaster.getByRole('button', { name: /shot #1/i }).first().click();
    await blaster.waitForTimeout(500);
  }
  await blaster.getByRole('button', { name: /new drill log/i }).click();
  await blaster.waitForSelector('text=/pattern:/i', { timeout: 15000 });
  await blaster.waitForTimeout(1200);
  const holeInput = blaster.locator('div.border-safety-orange\\/40 input').first();
  ok('second log claims next unclaimed hole 4', (await holeInput.inputValue()) === '4');
  for (const n of [4, 5, 6]) {
    await blaster.getByRole('button', { name: new RegExp(`add hole ${n}`, 'i') }).click();
    await blaster.waitForTimeout(500);
  }
  const done = await bodyOf(blaster);
  ok('plan complete after 6 of 6', done.includes('plan complete'));

  // ── Complete → review flags → accept → print ────────────────────────────
  await driller.getByRole('button', { name: /mark complete/i }).click();
  await driller.waitForTimeout(800);
  await waitDb(blaster, `db.drillLogs.get('${drillerLogId}').then(l => l && l.status === 'complete')`);
  await goto(blaster, `http://localhost:5199/blast-day/${ids.dayId}/drill-log/${drillerLogId}`);
  await blaster.waitForSelector('text=/review against plan/i', { timeout: 15000 });
  const review = await bodyOf(blaster);
  ok('review: 6 of 6 drilled, none undrilled', review.includes('6 of 6 plan holes drilled') && !review.includes('not drilled'));
  ok('review flags the short hole (−3.0)', review.includes('hole 2') && review.includes('13 ft') && review.includes('-3.0'));
  ok('review surfaces wet hole', review.includes('1 wet'));
  await blaster.getByRole('button', { name: /^accept$/i }).click();
  await blaster.waitForTimeout(800);
  ok('accepted banner shown', (await bodyOf(blaster)).includes('accepted by'));

  await goto(blaster, `http://localhost:5199/blast-day/${ids.dayId}/drill-log/${drillerLogId}/print`);
  await blaster.waitForSelector('text=/drill log/i', { timeout: 15000 });
  const print = await bodyOf(blaster);
  ok('print has Plan column + deviation mark', print.includes('plan (ft)') && print.includes('⚠'));

  // ── Driller self-service: FAB day, /days, rig picker ────────────────────
  await goto(driller, 'http://localhost:5199/');
  await driller.waitForTimeout(1000);
  await driller.locator('button[title="New Work Day"]').click();
  await driller.waitForSelector('text=/new work day/i', { timeout: 10000 });
  const dlg = await bodyOf(driller);
  ok('dialog defaults visible (drill only chip present)', dlg.includes('drill only'));
  await driller.locator('select').first().selectOption(ids.jobId);
  await driller.getByRole('button', { name: /create work day/i }).click();
  await driller.waitForTimeout(1500);
  const newDay = await driller.evaluate(async () => {
    const db = window.shotlogDb;
    const days = await db.blastDays.filter((d) => d.typeOfWork === 'drill_only').toArray();
    return days.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  });
  ok('driller created a drill_only day (no blast log)', Boolean(newDay) &&
    !(await driller.evaluate(async (id) => Boolean(await window.shotlogDb.blastLogs.where('blastDayId').equals(id).first()), newDay?.id)));

  await goto(driller, 'http://localhost:5199/');
  await driller.waitForTimeout(800);
  await driller.getByRole('button', { name: /all work days/i }).click();
  await driller.waitForTimeout(800);
  ok('all work days lands on /days with the list', driller.url().includes('/days') && (await bodyOf(driller)).includes('work days'));

  await goto(driller, 'http://localhost:5199/');
  await driller.waitForTimeout(800);
  await driller.getByRole('button', { name: /rig checklist/i }).click();
  await driller.waitForTimeout(500);
  const picker = await bodyOf(driller);
  ok('rig picker opens', picker.includes('which rig'));

  } catch (err) {
    results.push(`ABORT ${String(err).split('\n')[0]}`);
    for (const [label, p] of [['blaster', blaster], ['driller', driller]]) {
      if (!p) continue;
      try {
        const body = (await p.locator('body').innerText()).slice(0, 600).replace(/\n+/g, ' | ');
        results.push(`STATE ${label} @ ${p.url()} :: ${body}`);
      } catch { /* page gone */ }
    }
  }
  try { await blaster?.context().close(); } catch {}
  try { await driller?.context().close(); } catch {}
  return results.join('\n');
}

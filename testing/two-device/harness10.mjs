async (page) => {
  // Dispatch + full-featured driller: blaster sends a plan to a specific
  // driller → "Assigned to you" → driller completes WITH a note → blaster
  // sees it, sends back with a reason → driller sees "sent back", completes
  // again (reason cleared) → accept → My Logs page recall + search → print
  // page has Save PDF + Print → unsent-plan alerts fire.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let admin, blaster, driller;
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
    const bodyOf = async (p) => (await p.locator('body').innerText()).toLowerCase();
    const goto = async (p, url) => {
      for (let i = 0; i < 3; i++) {
        try { await p.goto(url); return; } catch (e) { if (i === 2) throw e; await p.waitForTimeout(1500); }
      }
    };
    const waitFor = async (p, fn, arg, ms = 30000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (await p.evaluate(fn, arg).catch(() => false)) return true;
        await p.waitForTimeout(500);
      }
      return false;
    };

    const tag = `H10-${Date.now() % 1000000}`;

    // Driller logs in first so we can learn their user id
    driller = await mk('H10-DRILLER');
    await login(driller, 'dinis@test.local', 'dinis-pass-123');
    const dinisId = await driller.evaluate(
      () => JSON.parse(localStorage.getItem('shotlog-user-info')).id,
    );

    // Admin puts Dinis on the roster as a driller (registry write)
    admin = await mk('H10-ADMIN');
    await login(admin, 'mark@baystateblasting.com', 'dev-password-123');
    await admin.waitForTimeout(2000);
    await admin.evaluate(async ({ t, dinisId }) => {
      const now = new Date().toISOString();
      await window.shotlogDb.crewMembers.add({
        id: `${t}-crew-dinis`,
        name: `${t} Dinis`,
        licenseNumber: '',
        licenseState: '',
        isActive: true,
        userId: dinisId,
        role: 'driller',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'local',
      });
    }, { t: tag, dinisId });

    // Blaster: day + shot + small plan, then DISPATCH to Dinis
    blaster = await mk('H10-BLASTER');
    await login(blaster, 'blaster@test.local', 'blaster-pass-123');
    await blaster.waitForTimeout(2000);
    const ids = await blaster.evaluate(async (t) => {
      const db = window.shotlogDb;
      const job = await db.jobs.filter((j) => j.isActive).first();
      const dayId = await window.shotlogFlows.createBlastDay(job.id, new Date().toISOString().slice(0, 10), undefined, { typeOfWork: 'drill_to_blast', name: `${t} dispatch day` });
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      return { jobId: job.id, dayId, shotId: shot.id };
    }, tag);
    await goto(blaster, `http://localhost:5199/blast-day/${ids.dayId}/design/${ids.shotId}`);
    await blaster.waitForSelector('text=/shot diagram/i', { timeout: 15000 });
    for (let i = 0; i < 4; i++)
      await blaster.locator('span:has-text("Rows:") button').first().click({ timeout: 8000 });
    for (let i = 0; i < 6; i++)
      await blaster.locator('span:has-text("Cols:") button').first().click({ timeout: 8000 });
    await blaster.getByRole('button', { name: /drill plan/i }).click({ timeout: 8000 });
    await blaster.locator('div.bg-orange-50 input').first().fill('16');
    await blaster.waitForTimeout(900);

    // Wait for the crew record to sync to the blaster's device, then Send
    ok('roster record synced to blaster', await waitFor(blaster, async (id) =>
      Boolean(await window.shotlogDb.crewMembers.get(id)), `${tag}-crew-dinis`));
    await goto(blaster, `http://localhost:5199/blast-day/${ids.dayId}`);
    await blaster.waitForTimeout(1500);
    if (!(await blaster.getByRole('button', { name: /send to drillers/i }).isVisible().catch(() => false))) {
      await blaster.getByRole('button', { name: /shot #1/i }).first().click();
      await blaster.waitForTimeout(500);
    }
    await blaster.getByRole('button', { name: /send to drillers/i }).click({ timeout: 8000 });
    await blaster.waitForSelector('text=/send drill plan to/i', { timeout: 8000 });
    const modal = await bodyOf(blaster);
    ok('picker lists the driller with role', modal.includes(`${tag.toLowerCase()} dinis`) && modal.includes('driller'));
    await blaster.locator(`label:has-text("${tag} Dinis") input[type="checkbox"]`).check();
    await blaster.getByRole('button', { name: /send to 1/i }).click();
    await blaster.waitForTimeout(1200);
    ok('section shows sent-by row', (await bodyOf(blaster)).includes('sent by barry'));

    // Driller: Assigned to you → open → drill → complete WITH note
    ok('assigned log synced to driller', await waitFor(driller, async (shotId) =>
      (await window.shotlogDb.drillLogs.where('shotId').equals(shotId).count()) > 0, ids.shotId));
    await goto(driller, 'http://localhost:5199/');
    await driller.waitForTimeout(1500);
    const dHome = await bodyOf(driller);
    ok('Assigned-to-you card with sender', dHome.includes('assigned to you') && dHome.includes('sent by barry'));
    await driller.locator('button:has-text("Open")').first().click({ timeout: 8000 });
    await driller.waitForSelector('text=/pattern plan/i', { timeout: 15000 });
    await driller.waitForTimeout(1000);
    ok('log opens as the driller\'s own', (await bodyOf(driller)).includes('dinis baltazar'));
    for (const n of [1, 2, 3, 4]) {
      await driller.getByRole('button', { name: new RegExp(`add hole ${n}`, 'i') }).click({ timeout: 8000 });
      await driller.waitForTimeout(400);
    }
    await driller.getByRole('button', { name: /mark complete/i }).click();
    await driller.waitForSelector('text=/anything the blaster should know/i', { timeout: 8000 });
    await driller.locator('div.fixed input').fill('row 1 ran wet, watch the toe');
    await driller.getByRole('button', { name: /^complete$/i }).click();
    await driller.waitForTimeout(1000);
    ok('log marked complete', (await bodyOf(driller)).includes('complete'));

    // Blaster: sees the note, sends back with a reason
    const logId = await blaster.evaluate(async (shotId) => {
      const logs = await window.shotlogDb.drillLogs.where('shotId').equals(shotId).toArray();
      return logs[0]?.id;
    }, ids.shotId);
    ok('completion synced to blaster', await waitFor(blaster, async (id) =>
      (await window.shotlogDb.drillLogs.get(id))?.status === 'complete', logId));
    await goto(blaster, `http://localhost:5199/blast-day/${ids.dayId}/drill-log/${logId}`);
    await blaster.waitForSelector('text=/review against plan/i', { timeout: 15000 });
    ok('blaster sees the driller note', (await bodyOf(blaster)).includes('row 1 ran wet'));
    await blaster.getByRole('button', { name: /reopen/i }).click();
    await blaster.waitForSelector('text=/what needs fixing/i', { timeout: 8000 });
    await blaster.locator('div.fixed input').fill('hole 2 short — re-drill');
    await blaster.getByRole('button', { name: /send back/i }).click();
    await blaster.waitForTimeout(1000);

    // Driller: sees "sent back", completes again → reason cleared
    ok('reopen synced to driller', await waitFor(driller, async (id) =>
      (await window.shotlogDb.drillLogs.get(id))?.reopenNote?.length > 0, logId));
    await goto(driller, `http://localhost:5199/blast-day/${ids.dayId}/drill-log/${logId}`);
    await driller.waitForSelector('text=/sent back by the blaster/i', { timeout: 15000 });
    ok('driller sees the send-back reason', (await bodyOf(driller)).includes('hole 2 short'));
    await driller.getByRole('button', { name: /mark complete/i }).click();
    await driller.waitForSelector('text=/anything the blaster should know/i', { timeout: 8000 });
    await driller.getByRole('button', { name: /^complete$/i }).click();
    await driller.waitForTimeout(1000);
    const cleared = await driller.evaluate(async (id) => {
      const l = await window.shotlogDb.drillLogs.get(id);
      return l.status === 'complete' && !l.reopenNote;
    }, logId);
    ok('second complete clears the sent-back reason', cleared);

    // Blaster accepts
    await waitFor(blaster, async (id) =>
      (await window.shotlogDb.drillLogs.get(id))?.status === 'complete', logId);
    await goto(blaster, `http://localhost:5199/blast-day/${ids.dayId}/drill-log/${logId}`);
    await blaster.waitForSelector('text=/review against plan/i', { timeout: 15000 });
    await blaster.getByRole('button', { name: /^accept$/i }).click();
    await blaster.waitForTimeout(1000);

    // Driller recall: My Logs page + search + stats
    await goto(driller, 'http://localhost:5199/drill-logs');
    await driller.waitForSelector('text=/my drill logs/i', { timeout: 15000 });
    await driller.waitForTimeout(1500);
    const logsPage = await bodyOf(driller);
    ok('My Logs lists the log', logsPage.includes(`${tag.toLowerCase()} dispatch day`));
    await driller.locator('input[placeholder*="Search"]').fill('zzz-no-match');
    await driller.waitForTimeout(400);
    ok('search filters to none', (await bodyOf(driller)).includes('no logs match'));
    await driller.locator('input[placeholder*="Search"]').fill(tag.toLowerCase());
    await driller.waitForTimeout(400);
    ok('search finds by day name', (await bodyOf(driller)).includes('dispatch day'));
    await goto(driller, 'http://localhost:5199/');
    await driller.waitForTimeout(1200);
    const home2 = await bodyOf(driller);
    ok('stats strip shows footage', /\b6[0-9]\b.*ft this week|ft this week/.test(home2) && !home2.includes('0\nft this week'));
    ok('recent logs card present', home2.includes('recent logs'));

    // Print page: Save PDF + Print buttons (blast-log parity)
    await goto(driller, `http://localhost:5199/blast-day/${ids.dayId}/drill-log/${logId}/print`);
    await driller.waitForSelector('text=/drill log/i', { timeout: 15000 });
    const printBody = await bodyOf(driller);
    ok('print page has Save PDF and Print', printBody.includes('save pdf') && printBody.includes('print'));

    // Unsent-plan alerts: a second planned shot nobody was sent
    const ids2 = await blaster.evaluate(async (t) => {
      const db = window.shotlogDb;
      const job = await db.jobs.filter((j) => j.isActive).first();
      const dayId = await window.shotlogFlows.createBlastDay(job.id, new Date().toISOString().slice(0, 10), undefined, { typeOfWork: 'drill_to_blast', name: `${t} unsent day` });
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      // author a plan directly (same shape the designer writes)
      await db.shots.update(shot.id, {
        designPlan: { ...shot.designPlan, shotDiagramData: JSON.stringify({ rows: 1, cols: 4, delays: {}, wires: [], interHoleMs: 15, plan: { defaultDepth: 12, overrides: {} } }) },
        updatedAt: new Date().toISOString(),
      });
      return { dayId };
    }, tag);
    await goto(blaster, 'http://localhost:5199/');
    await blaster.waitForTimeout(1500);
    ok('TodayCard flags drill plan not sent', (await bodyOf(blaster)).includes('drill plan not sent'));
    await goto(blaster, `http://localhost:5199/blast-day/${ids2.dayId}`);
    await blaster.waitForTimeout(1500);
    ok('shot header flags plan not sent', (await bodyOf(blaster)).includes('plan not sent'));
  } catch (err) {
    results.push(`ABORT ${String(err).split('\n')[0]}`);
    for (const [label, p] of [['blaster', blaster], ['driller', driller], ['admin', admin]]) {
      if (!p) continue;
      try { results.push(`STATE ${label} @ ${p.url()} :: ${(await p.locator('body').innerText()).slice(0, 350).replace(/\n+/g, ' | ')}`); } catch {}
    }
  }
  try { await admin?.context().close(); } catch {}
  try { await blaster?.context().close(); } catch {}
  try { await driller?.context().close(); } catch {}
  return results.join('\n');
}

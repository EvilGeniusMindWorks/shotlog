async (page) => {
  // First-class ops: top-level Records (company lenses + drill-log backfill),
  // mechanic shop board (checklist feed, fleet strip), equipment history
  // timeline + status control, registry-linked daily-report equipment picker.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let blaster, driller, mech, admin;
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
    const tag = `H12-${Date.now() % 1000000}`;

    // ── Blaster: day + drill log w/ rig + daily-report equipment via picker
    blaster = await mk('H12-BLASTER');
    await login(blaster, 'blaster@test.local', 'blaster-pass-123');
    await blaster.waitForTimeout(2000);
    const ids = await blaster.evaluate(async (t) => {
      const db = window.shotlogDb;
      const job = await db.jobs.filter((j) => j.isActive).first();
      const rig = await db.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill')).first();
      const dayId = await window.shotlogFlows.createBlastDay(job.id, new Date().toISOString().slice(0, 10), undefined, { typeOfWork: 'drill_to_blast', name: `${t} ops day` });
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const report = await db.dailyReports.where('blastDayId').equals(dayId).first();
      // drill log with the rig attached + one hole
      const now = new Date().toISOString();
      const dlId = `${t}-dl`;
      await db.drillLogs.add({ id: dlId, jobId: job.id, blastDayId: dayId, shotId: shot.id, status: 'open', holeDiameter: 3, burden: 8, spacing: 9, faceHeight: 16, gps: '', locationNote: '', drillerUserId: '', drillerName: 'Barry Blaster', drillRigEquipmentId: rig.id, signatureImage: null, createdAt: now, updatedAt: now, syncStatus: 'local' });
      await db.drillLogHoles.add({ id: `${t}-h1`, drillLogId: dlId, date: now.slice(0, 10), holeNumber: '1', angle: 0, actualDepth: 16, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      return { jobId: job.id, rigId: rig.id, rigAsset: rig.assetNumber, dayId, shotId: shot.id, reportId: report.id, dlId };
    }, tag);

    // daily-report equipment entry: seed an empty row, then use the NEW
    // registry picker in the UI on that row
    ids.eeId = await blaster.evaluate(async (reportId) => {
      const now = new Date().toISOString();
      const id = 'h12-ee-' + Date.now();
      await window.shotlogDb.equipmentEntries.add({
        id, dailyReportId: reportId, category: 'vehicle',
        assetNumber: '', hoursStart: 0, hoursEnd: 0,
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      return id;
    }, ids.reportId);
    // auto-populated rows now carry the registry link out of the box
    const autoLinked = await blaster.evaluate(async (reportId) => {
      const rows = await window.shotlogDb.equipmentEntries.where('dailyReportId').equals(reportId).toArray();
      return { total: rows.length, linked: rows.filter((r) => r.equipmentId).length };
    }, ids.reportId);
    ok('auto-populated equipment rows carry equipmentId', autoLinked.total > 1 && autoLinked.linked >= autoLinked.total - 1);
    await goto(blaster, `http://localhost:5199/blast-day/${ids.dayId}`);
    await blaster.waitForTimeout(1200);
    await blaster.getByRole('button', { name: /daily report/i }).first().click();
    await blaster.waitForTimeout(1000);
    // the seeded blank row is the only select CURRENTLY showing "Pick asset…"
    const pickerIdx = await blaster.evaluate(() =>
      [...document.querySelectorAll('select')].findIndex(
        (s) => s.options[s.selectedIndex]?.label === 'Pick asset…',
      ),
    );
    ok('blank row shows the registry picker', pickerIdx >= 0);
    await blaster.locator('select').nth(pickerIdx).selectOption(ids.rigId);
    await blaster.waitForTimeout(800);
    const entry = await blaster.evaluate(async (eeId) => {
      const e = await window.shotlogDb.equipmentEntries.get(eeId);
      return e && { equipmentId: e.equipmentId, assetNumber: e.assetNumber, category: e.category };
    }, ids.eeId);
    ok('picker stamped equipmentId + asset number + bucket',
      entry?.equipmentId === ids.rigId && entry?.assetNumber === ids.rigAsset && entry?.category === 'equip_drill');

    // ── Driller files a checklist with a repairs note (ticket) ───────────
    driller = await mk('H12-DRILLER');
    await login(driller, 'dinis@test.local', 'dinis-pass-123');
    await driller.waitForTimeout(2500);
    const clId = await driller.evaluate(async ({ rigId, t }) => {
      const db = window.shotlogDb;
      // fresh day guard: remove today's checklist for the rig if a prior
      // harness filed one (registry roles can't; driller local delete is
      // enough for UI since server keeps it — instead just file directly)
      return null;
    }, { rigId: ids.rigId, t: tag }).catch(() => null);
    await goto(driller, `http://localhost:5199/drill-checklist/${ids.rigId}`);
    await driller.waitForTimeout(1200);
    let checklistFiled = false;
    const noteBox = driller.locator('textarea, input').filter({ hasText: '' });
    const fileBtn = driller.getByRole('button', { name: /file checklist/i });
    if (await fileBtn.isVisible().catch(() => false)) {
      const repairs = driller.locator('textarea');
      if (await repairs.count()) await repairs.first().fill(`${tag} blowout cooler weak`);
      await fileBtn.click();
      await driller.waitForSelector('text=/checklist filed/i', { timeout: 60000 });
      checklistFiled = true;
      await driller.getByRole('button', { name: /^done$/i }).click();
    } else {
      results.push('SKIP checklist already filed today for this rig');
    }

    // ── Mechanic shop board ──────────────────────────────────────────────
    mech = await mk('H12-MECH');
    await login(mech, 'mechanic@test.local', 'mech-pass-1234');
    await waitFor(mech, async (rigId) =>
      (await window.shotlogDb.drillChecklists.filter((c) => c.equipmentId === rigId).count()) > 0, ids.rigId, 45000);
    await goto(mech, 'http://localhost:5199/');
    await mech.waitForTimeout(1500);
    const shop = await bodyOf(mech);
    ok('shop board renders queue + feed + fleet', shop.includes('my shop') && shop.includes('checklists from the field') && shop.includes('fleet'));
    if (checklistFiled) ok('feed flags the repairs note', shop.includes('blowout cooler weak'));
    // checklist feed → full detail view
    await mech.locator('button:has-text("view ›")').first().click();
    await mech.waitForSelector('text=/rock drill checklist/i', { timeout: 15000 });
    const detail = await bodyOf(mech);
    ok('full checklist detail (all checks visible)', detail.includes('engine oil') && detail.includes('emergency stop') && detail.includes('operator signature'));
    // fleet chip → equipment page (fresh home load — print pages sit
    // outside the shell, so back-navigation is unreliable in automation)
    await goto(mech, 'http://localhost:5199/');
    await mech.waitForTimeout(1200);
    await mech.locator(`div:has(> p:text-is("Fleet")) button:has-text("${ids.rigAsset}")`).first().click({ timeout: 8000 })
      .catch(() => mech.locator(`button:has-text("${ids.rigAsset}")`).last().click({ timeout: 8000 }));
    await mech.waitForSelector('text=/history/i', { timeout: 15000 });
    await mech.waitForTimeout(1500);
    const eq = await bodyOf(mech);
    ok('equipment history shows drill log + daily report + checklist', eq.includes('drill log —') && eq.includes('used on') && eq.includes('checklist —'));
    ok('status control present', eq.includes('active') && eq.includes('in shop') && eq.includes('retired'));
    // status flip in_shop → active
    await mech.getByRole('button', { name: /in shop/i }).click();
    await mech.waitForTimeout(600);
    const flipped = await mech.evaluate(async (id) => (await window.shotlogDb.equipment.get(id))?.status, ids.rigId);
    ok('status chip flips to in_shop', flipped === 'in_shop');
    await mech.getByRole('button', { name: /active/i }).first().click();
    await mech.waitForTimeout(600);
    const restored = await mech.evaluate(async (id) => (await window.shotlogDb.equipment.get(id))?.status, ids.rigId);
    ok('status restored to active', restored === 'active');

    // ── Admin: top-level Records + lenses + drill-log backfill ───────────
    admin = await mk('H12-ADMIN');
    await login(admin, 'mark@baystateblasting.com', 'dev-password-123');
    await admin.waitForTimeout(2000);
    const nav = await admin.locator('aside nav').innerText();
    ok('Records is in the main nav', /records/i.test(nav));
    // simulate a legacy accepted-unfiled drill log via LEGAL transitions
    // (open→accepted directly would be discarded by the server and reverted)
    await waitFor(admin, async (id) => Boolean(await window.shotlogDb.drillLogs.get(id)), ids.dlId, 45000);
    await admin.evaluate(async (id) => {
      await window.shotlogDb.drillLogs.update(id, { status: 'complete', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }, ids.dlId);
    await admin.waitForTimeout(1500);
    await admin.evaluate(async (id) => {
      await window.shotlogDb.drillLogs.update(id, { status: 'accepted', acceptedBy: 'Legacy', acceptedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }, ids.dlId);
    await admin.waitForTimeout(1500);
    await goto(admin, 'http://localhost:5199/records');
    await admin.waitForSelector('text=/all documents/i', { timeout: 15000 });
    await admin.waitForTimeout(1000);
    ok('company records with lenses', (await bodyOf(admin)).includes('filed') && (await bodyOf(admin)).includes('all documents'));
    await admin.getByRole('button', { name: /all documents/i }).click();
    await admin.waitForTimeout(2500);
    const allDocs = await bodyOf(admin);
    ok('all-documents lists company docs incl. the drill log', allDocs.includes(`${tag.toLowerCase()} ops day`) && allDocs.includes('drill log'));
    ok('backfill action offered on accepted-unfiled log', allDocs.includes('file to office'));
    // click THE tagged row's File button — other pre-archive legacy logs
    // also offer one, and .first() may grab theirs
    await admin
      .locator('div.flex.items-center')
      .filter({ hasText: `${tag} ops day` })
      .getByRole('button', { name: 'File to office' })
      .first()
      .click();
    await admin.waitForSelector('text=/accepting & filing/i', { timeout: 15000 });
    ok('backfill filed the office copy', await waitFor(admin, async (id) =>
      (await window.shotlogDb.submissions.filter((s) => s.sourceId === id).count()) === 1, ids.dlId, 60000));
    const still = await admin.evaluate(async (id) => (await window.shotlogDb.drillLogs.get(id))?.acceptedBy, ids.dlId);
    ok('backfill preserved original acceptance', still === 'Legacy');
    // admin home: latest filings card
    await goto(admin, 'http://localhost:5199/');
    await admin.waitForTimeout(1500);
    ok('admin home shows Latest filings', (await bodyOf(admin)).includes('latest filings'));
    // admin equipment registry row click-through
    await goto(admin, 'http://localhost:5199/admin/equipment');
    await admin.waitForTimeout(1500);
    await admin.locator(`button:has-text("${ids.rigAsset}")`).first().click();
    await admin.waitForSelector('text=/history/i', { timeout: 15000 });
    ok('registry row opens equipment history', (await bodyOf(admin)).includes('history'));
  } catch (err) {
    results.push(`ABORT ${String(err).split('\n')[0]}`);
    for (const [label, p] of [['blaster', blaster], ['driller', driller], ['mech', mech], ['admin', admin]]) {
      if (!p) continue;
      try { results.push(`STATE ${label} @ ${p.url()} :: ${(await p.locator('body').innerText()).slice(0, 300).replace(/\n+/g, ' | ')}`); } catch {}
    }
  }
  for (const p of [blaster, driller, mech, admin]) {
    try { await p?.context().close(); } catch {}
  }
  return results.join('\n');
}

async (page) => {
  // Submit-to-Office archive: day submit files blast log + daily report PDFs
  // with a frozen attachment and locks the day; server discards edits to a
  // filed day AND re-PUTs of a submission (write-once); supervisor unlock →
  // resubmit files v2; drill log accept, checklist filing, and incident
  // send-to-office each file their PDF; office Records tab lists everything;
  // My Records shows filed chips.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let blaster, supervisor, driller, admin;
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

    const tag = `H11-${Date.now() % 1000000}`;

    // ── Blaster: day + attachment → Submit to Office ─────────────────────
    blaster = await mk('H11-BLASTER');
    await login(blaster, 'blaster@test.local', 'blaster-pass-123');
    await blaster.waitForTimeout(2000);
    const ids = await blaster.evaluate(async (t) => {
      const db = window.shotlogDb;
      const job = await db.jobs.filter((j) => j.isActive).first();
      const dayId = await window.shotlogFlows.createBlastDay(job.id, new Date().toISOString().slice(0, 10), undefined, { typeOfWork: 'drill_to_blast', name: `${t} archive day` });
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      // small generated photo attachment
      const canvas = document.createElement('canvas');
      canvas.width = 400; canvas.height = 300;
      const g = canvas.getContext('2d');
      g.fillStyle = '#dd6b20'; g.fillRect(0, 0, 400, 300);
      g.fillStyle = '#fff'; g.font = '30px sans-serif'; g.fillText(t, 20, 150);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
      const now = new Date().toISOString();
      await db.attachments.add({ id: `${t}-att`, parentId: dayId, parentType: 'blast_day', fileName: 'h11-photo.jpg', mimeType: 'image/jpeg', data: blob, createdAt: now, updatedAt: now, syncStatus: 'local' });
      const report = await db.dailyReports.where('blastDayId').equals(dayId).first();
      return { jobId: job.id, dayId, blastLogId: log.id, shotId: shot.id, reportId: report?.id };
    }, tag);

    await goto(blaster, `http://localhost:5199/blast-day/${ids.dayId}`);
    await blaster.waitForTimeout(1200);
    await blaster.getByRole('button', { name: /submit to office/i }).click();
    await blaster.waitForSelector('text=/filing to the office/i', { timeout: 10000 });
    // PDF generation of 4 pages takes a bit
    await blaster.waitForSelector('text=/filed with the office/i', { timeout: 60000 });
    ok('day submitted with lock banner', true);
    const subs1 = await blaster.evaluate(async (dayId) => {
      const subs = await window.shotlogDb.submissions.filter((s) => s.blastDayId === dayId).toArray();
      return subs.map((s) => ({ type: s.type, v: s.version, pdf: s.pdf?.size ?? 0, assets: s.assets.length, id: s.id }));
    }, ids.dayId);
    ok('blast log + daily report filed', subs1.length === 2 && subs1.some((s) => s.type === 'blast_log') && subs1.some((s) => s.type === 'daily_report'));
    ok('PDFs are real and attachment frozen',
      subs1.every((s) => s.pdf > 10000) && subs1.find((s) => s.type === 'blast_log')?.assets === 1);

    // ── Server enforcement: locked-day edit + submission re-PUT discarded ─
    // (runs after the supervisor's device confirms the server saw
    // status=submitted — probing earlier races the upload queue)
    supervisor = await mk('H11-SUPER');
    await login(supervisor, 'supervisor@test.local', 'super-pass-123');
    await waitFor(supervisor, async (id) => (await window.shotlogDb.blastDays.get(id))?.status === 'submitted', ids.dayId, 45000);
    const subId = subs1[0]?.id;
    const probe = await blaster.evaluate(async ({ subId, reportId, dayId }) => {
      const token = localStorage.getItem('shotlog-access-token');
      const res = await fetch('http://localhost:4000/powersync/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ops: [
            { op: 'PUT', id: subId, data: { table_name: 'submissions', payload: JSON.stringify({ title: 'FORGED' }) } },
            // realistic PATCH: the facade always sends the full payload,
            // so blastDayId is present for the lock chain to resolve
            { op: 'PATCH', id: reportId, data: { table_name: 'dailyReports', payload: JSON.stringify({ blastDayId: dayId, notes: 'sneaky edit' }) } },
          ],
        }),
      });
      return res.json();
    }, { subId, reportId: ids.reportId, dayId: ids.dayId });
    ok('server discards submission re-PUT + locked-day edit', probe.ok === true && probe.discarded === 2);

    // ── Supervisor unlocks → blaster resubmits → v2 ──────────────────────
    await goto(supervisor, `http://localhost:5199/blast-day/${ids.dayId}`);
    await supervisor.waitForTimeout(1200);
    await supervisor.getByRole('button', { name: /send back/i }).click();
    await supervisor.waitForTimeout(1500);
    ok('supervisor unlocked (back to draft)', await waitFor(blaster, async (id) =>
      (await window.shotlogDb.blastDays.get(id))?.status === 'draft', ids.dayId));
    await goto(blaster, `http://localhost:5199/blast-day/${ids.dayId}`);
    await blaster.waitForTimeout(1000);
    await blaster.getByRole('button', { name: /submit to office/i }).click();
    await blaster.waitForSelector('text=/filed with the office/i', { timeout: 60000 });
    const v2 = await blaster.evaluate(async (logId) => {
      const subs = await window.shotlogDb.submissions.filter((s) => s.sourceId === logId).toArray();
      return subs.map((s) => s.version).sort();
    }, ids.blastLogId);
    ok('resubmit filed v2 (v1 kept)', v2.length === 2 && v2[0] === 1 && v2[1] === 2);

    // ── Drill log: complete + Accept & File ──────────────────────────────
    const day2 = await blaster.evaluate(async (t) => {
      const db = window.shotlogDb;
      const job = await db.jobs.filter((j) => j.isActive).first();
      const dayId = await window.shotlogFlows.createBlastDay(job.id, new Date().toISOString().slice(0, 10), undefined, { typeOfWork: 'drill_to_blast', name: `${t} drill day` });
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      return { dayId, shotId: shot.id };
    }, tag);
    await goto(blaster, `http://localhost:5199/blast-day/${day2.dayId}`);
    await blaster.waitForTimeout(1200);
    if (!(await blaster.getByRole('button', { name: /^log$/i }).isVisible().catch(() => false))) {
      await blaster.getByRole('button', { name: /shot #1/i }).first().click();
      await blaster.waitForTimeout(500);
    }
    await blaster.getByRole('button', { name: /^log$/i }).click();
    await blaster.waitForSelector('text=/hole #/i', { timeout: 15000 });
    await blaster.waitForTimeout(800);
    await blaster.locator('div.border-safety-orange\\/40 input').nth(1).fill('14');
    await blaster.getByRole('button', { name: /add hole/i }).click();
    await blaster.waitForTimeout(600);
    await blaster.getByRole('button', { name: /mark complete/i }).click();
    await blaster.waitForSelector('text=/anything the blaster should know/i', { timeout: 8000 });
    await blaster.getByRole('button', { name: /^complete$/i }).click();
    await blaster.waitForTimeout(800);
    await blaster.getByRole('button', { name: /accept & file/i }).click();
    // Poll the db, not the page text — the print sheet under the overlay
    // already contains "Accepted by (blaster):" so text matching lies
    ok('accept filed the drill log PDF', await waitFor(blaster, async (dayId) =>
      (await window.shotlogDb.submissions.filter((s) => s.type === 'drill_log' && s.blastDayId === dayId).toArray()).length === 1, day2.dayId, 60000));

    // ── Checklist: driller files → auto-archives ─────────────────────────
    driller = await mk('H11-DRILLER');
    await login(driller, 'dinis@test.local', 'dinis-pass-123');
    await driller.waitForTimeout(2500);
    const rigId = await driller.evaluate(async () =>
      (await window.shotlogDb.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill')).first())?.id);
    await goto(driller, `http://localhost:5199/drill-checklist/${rigId}`);
    await driller.waitForTimeout(1200);
    const fileBtn = driller.getByRole('button', { name: /file checklist/i });
    if (await fileBtn.isVisible().catch(() => false)) {
      await fileBtn.click();
      await driller.waitForSelector('text=/checklist filed/i', { timeout: 60000 });
      ok('checklist auto-filed to office', true);
      await driller.getByRole('button', { name: /^done$/i }).click();
    } else {
      // today's checklist already exists from an earlier harness run — file
      // a submission check against any existing checklist instead
      results.push('SKIP checklist file button (already filed today)');
    }
    const clSub = await driller.evaluate(async () =>
      (await window.shotlogDb.submissions.filter((s) => s.type === 'drill_checklist').toArray()).length);
    ok('checklist submission exists', clSub >= 1);

    // ── Incident: send to office files the PDF ───────────────────────────
    const incidentId = await blaster.evaluate(async (t) => {
      const db = window.shotlogDb;
      const now = new Date().toISOString();
      const id = `${t}-incident`;
      await db.incidents.add({
        id, type: 'asset', status: 'open', date: now.slice(0, 10), time: '09:30',
        description: `${t} cracked mirror on service truck`, reportedByName: 'Barry Blaster',
        assetIncidentKind: 'equipment_accident', policeCalled: false,
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      return id;
    }, tag);
    await goto(blaster, `http://localhost:5199/incident/${incidentId}`);
    await blaster.waitForTimeout(1000);
    await blaster.getByRole('button', { name: /send to office/i }).click();
    await blaster.waitForSelector('text=/office review/i', { timeout: 60000 });
    const incSub = await blaster.evaluate(async (id) =>
      (await window.shotlogDb.submissions.filter((s) => s.type === 'incident' && s.sourceId === id).toArray()).length, incidentId);
    ok('incident filed on send-to-office', incSub === 1);

    // ── Office Records tab (admin) ───────────────────────────────────────
    admin = await mk('H11-ADMIN');
    await login(admin, 'mark@baystateblasting.com', 'dev-password-123');
    ok('records synced to office device', await waitFor(admin, async (t) =>
      (await window.shotlogDb.submissions.toArray()).filter((s) => (s.title + s.date).length && s.createdAt).length >= 5, tag, 60000));
    await goto(admin, 'http://localhost:5199/admin/records');
    await admin.waitForTimeout(2000);
    const recBody = await bodyOf(admin);
    ok('Records tab lists filed docs', recBody.includes('blast log') && recBody.includes('daily report') && recBody.includes('rig checklist') && recBody.includes('incident'));
    ok('v2 badge shown', recBody.includes('v2'));
    ok('View/PDF controls present', recBody.includes('view') && recBody.includes('pdf'));
    await admin.locator('button:has-text("Drill Log")').first().click();
    await admin.waitForTimeout(600);
    const filtered = await bodyOf(admin);
    ok('type filter narrows to drill logs', filtered.includes('drill log —') && !filtered.includes('rig checklist —'));

    // ── My Records: filed chips ──────────────────────────────────────────
    await goto(blaster, 'http://localhost:5199/records');
    await blaster.waitForTimeout(1500);
    const myRec = await bodyOf(blaster);
    ok('blaster My Records shows filed chips', myRec.includes('my records') && myRec.includes('filed v'));
    await goto(driller, 'http://localhost:5199/records');
    await driller.waitForTimeout(1500);
    const dRec = await bodyOf(driller);
    ok('driller My Records lists checklist', dRec.includes('rig checklist'));
  } catch (err) {
    results.push(`ABORT ${String(err).split('\n')[0]}`);
    for (const [label, p] of [['blaster', blaster], ['supervisor', supervisor], ['driller', driller], ['admin', admin]]) {
      if (!p) continue;
      try { results.push(`STATE ${label} @ ${p.url()} :: ${(await p.locator('body').innerText()).slice(0, 300).replace(/\n+/g, ' | ')}`); } catch {}
    }
  }
  for (const p of [blaster, supervisor, driller, admin]) {
    try { await p?.context().close(); } catch {}
  }
  return results.join('\n');
}

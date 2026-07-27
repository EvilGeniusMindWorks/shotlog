async (page) => {
  // Job & person hubs: worked-hours rollups (auto-populate rows with empty
  // times must NOT count), blaster sign-off stamps blasterUserId, person page
  // stats/jobs/documents + teammate privacy, job Activity view (crew,
  // equipment, documents), and name links (roster + drill log header).
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let blaster, driller, admin;
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
    const tag = `H13-${Date.now() % 1000000}`;

    // ── Driller identity + roster entry ─────────────────────────────────
    driller = await mk('H13-DRILLER');
    await login(driller, 'dinis@test.local', 'dinis-pass-123');
    const dinisUserId = await driller.evaluate(
      () => JSON.parse(localStorage.getItem('shotlog-user-info')).id,
    );

    // ── Admin creates a FRESH job (jobs are admin-only; a shared job would
    //    pollute the Activity crew rollup with prior harness runs) ────────
    admin = await mk('H13-ADMIN');
    await login(admin, 'mark@baystateblasting.com', 'dev-password-123');
    await admin.waitForTimeout(2000);
    const freshJobId = await admin.evaluate(async (t) =>
      window.shotlogFlows.createJob({ name: `${t} Job`, customer: 'H13 Customer' }), tag);

    // ── Blaster: day, worked-hours on ONE crew row, blast log sign-off,
    //    drill log for dinis ─────────────────────────────────────────────
    blaster = await mk('H13-BLASTER');
    await login(blaster, 'blaster@test.local', 'blaster-pass-123');
    await blaster.waitForTimeout(2000);
    // seed a license so the sign-off chip exists (updates server + session)
    await blaster.evaluate(async (t) => {
      const token = localStorage.getItem('shotlog-access-token');
      const res = await fetch('http://localhost:4000/auth/me/licenses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ licenses: [{ state: 'MA', licenseNumber: `${t}-LIC`, expirationDate: '2027-06-30' }] }),
      });
      const body = await res.json().catch(() => null);
      const info = JSON.parse(localStorage.getItem('shotlog-user-info'));
      info.licenses = body?.licenses ?? [{ state: 'MA', licenseNumber: `${t}-LIC`, expirationDate: '2027-06-30' }];
      localStorage.setItem('shotlog-user-info', JSON.stringify(info));
    }, tag);
    ok('fresh job synced to blaster', await waitFor(blaster, async (id) =>
      Boolean(await window.shotlogDb.jobs.get(id)), freshJobId, 45000));
    const ids = await blaster.evaluate(async ({ t, dinisUserId, freshJobId }) => {
      const db = window.shotlogDb;
      const job = await db.jobs.get(freshJobId);
      const rig = await db.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill')).first();
      const now = new Date().toISOString();
      // roster entry for dinis (fresh tagged one so matching is deterministic)
      const crewId = `${t}-crew`;
      // NOTE: crewMembers PUT is registry-only — create as blaster would be
      // discarded. Use an existing linked crew member if present, else the
      // admin device creates it later; here we look one up.
      const existing = await db.crewMembers.filter((c) => c.userId === dinisUserId).first();
      const dayId = await window.shotlogFlows.createBlastDay(job.id, new Date().toISOString().slice(0, 10), undefined, { typeOfWork: 'drill_to_blast', name: `${t} hub day` });
      const report = await db.dailyReports.where('blastDayId').equals(dayId).first();
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      // drill log owned by dinis, one hole (footage 16)
      const dlId = `${t}-dl`;
      await db.drillLogs.add({ id: dlId, jobId: job.id, blastDayId: dayId, shotId: shot.id, status: 'open', holeDiameter: 3, burden: 8, spacing: 9, faceHeight: 16, gps: '', locationNote: '', drillerUserId: dinisUserId, drillerName: 'Dinis Baltazar', drillRigEquipmentId: rig.id, signatureImage: null, createdAt: now, updatedAt: now, syncStatus: 'local' });
      await db.drillLogHoles.add({ id: `${t}-h1`, drillLogId: dlId, date: now.slice(0, 10), holeNumber: '1', angle: 0, actualDepth: 16, subdrill: 0, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      return { jobId: job.id, jobName: job.name, rigId: rig.id, rigAsset: rig.assetNumber, dayId, reportId: report.id, blastLogId: log.id, dlId, existingCrewId: existing?.id ?? null };
    }, { t: tag, dinisUserId, freshJobId });

    // crew rows auto-populated with crewMemberId; give DINIS hours only
    const crewRow = await blaster.evaluate(async ({ reportId }) => {
      const db = window.shotlogDb;
      const rows = await db.workForceEntries.where('dailyReportId').equals(reportId).toArray();
      const linked = rows.filter((r) => r.crewMemberId).length;
      const dinisRow = rows.find((r) => /dinis/i.test(r.workerName));
      if (dinisRow) {
        await db.workForceEntries.update(dinisRow.id, { timeIn: '07:00', timeOut: '15:30', straightTime: 8, overtime: 0.5, updatedAt: new Date().toISOString() });
      }
      return { total: rows.length, linked, hasDinis: Boolean(dinisRow), dinisCrewMemberId: dinisRow?.crewMemberId ?? null };
    }, { reportId: ids.reportId });
    ok('auto-populated crew rows carry crewMemberId', crewRow.total > 1 && crewRow.linked >= crewRow.total - 1);
    ok('dinis row found + hours set', crewRow.hasDinis);
    const dinisCrewId = crewRow.dinisCrewMemberId ?? ids.existingCrewId;

    // blaster signs the blast log via the license chip (stamps blasterUserId)
    await goto(blaster, `http://localhost:5199/blast-day/${ids.dayId}`);
    await blaster.waitForTimeout(1500);
    const chip = blaster.locator('button:has-text("MA ·"), button:has-text("· ")').filter({ hasText: '·' }).first();
    // find the sign-off license chip robustly: it lives in the Blast Log tab
    const signed = await blaster.evaluate(async ({ blastLogId }) => {
      // fall back to a direct field check after UI attempt below
      return (await window.shotlogDb.blastLogs.get(blastLogId))?.blasterUserId ?? null;
    }, { blastLogId: ids.blastLogId });
    if (!signed) {
      const licChips = blaster.locator('button').filter({ hasText: /^[A-Z]{2} · / });
      if (await licChips.count()) {
        await licChips.first().click();
        await blaster.waitForTimeout(800);
      }
    }
    const blasterStamp = await blaster.evaluate(async (id) => {
      const b = await window.shotlogDb.blastLogs.get(id);
      return { userId: b?.blasterUserId ?? null, name: b?.blasterName ?? '' };
    }, ids.blastLogId);
    ok('license chip stamps blasterUserId', Boolean(blasterStamp.userId) && blasterStamp.name.length > 0);

    // ── Admin: person page for dinis ────────────────────────────────────
    ok('day synced to admin', await waitFor(admin, async (id) =>
      Boolean(await window.shotlogDb.blastDays.get(id)), ids.dayId, 45000));
    await waitFor(admin, async (id) => Boolean(await window.shotlogDb.drillLogs.get(id)), ids.dlId, 30000);
    // resolve dinis' roster id on the admin device
    const crewId = await admin.evaluate(async (userId) =>
      (await window.shotlogDb.crewMembers.filter((c) => c.userId === userId).first())?.id ?? null, dinisUserId);
    if (!crewId) {
      results.push('SKIP no roster entry linked to dinis — person page checks skipped');
    } else {
      await goto(admin, `http://localhost:5199/crew/${crewId}`);
      await admin.waitForSelector('text=/jobs worked/i', { timeout: 15000 });
      await admin.waitForTimeout(2500);
      const person = await bodyOf(admin);
      ok('person page shows stats strip', person.includes('days worked') && person.includes('hours'));
      ok('person stats count the worked day + footage', person.includes('ft drilled'));
      ok('jobs worked lists the job', person.includes(ids.jobName.toLowerCase()));
      ok('documents list includes their drill log', person.includes('drill log'));
    }

    // ── Job Activity view ───────────────────────────────────────────────
    await goto(admin, `http://localhost:5199/jobs/${ids.jobId}`);
    await admin.waitForSelector('text=/activity/i', { timeout: 15000 });
    await admin.getByRole('button', { name: /^activity$/i }).click();
    await admin.waitForTimeout(3000);
    const act = await bodyOf(admin);
    ok('activity totals render', act.includes('ft drilled') && act.includes('open incidents'));
    ok('crew card shows ONLY worked members with hours', act.includes('dinis') && act.includes('hrs') && !act.includes('not on roster'));
    // fresh job: only dinis got hours — Barry (idle roster member, blaster
    // of the day but zero workforce hours) must NOT appear in the crew card
    ok('idle roster members excluded from crew card', !act.includes('barry'));
    ok('equipment-used chips include the rig', act.includes(ids.rigAsset.toLowerCase()));
    ok('documents card lists job docs', act.includes('blast log —') && act.includes('drill log'));

    // ── Name links ──────────────────────────────────────────────────────
    if (crewId) {
      await goto(admin, 'http://localhost:5199/admin/company');
      await admin.waitForTimeout(2000);
      await admin.locator('button:has-text("Dinis")').first().click();
      await admin.waitForTimeout(1500);
      ok('roster name links to person page', admin.url().includes(`/crew/`));
      // drill log header name link
      await goto(admin, `http://localhost:5199/blast-day/${ids.dayId}/drill-log/${ids.dlId}`);
      await admin.waitForTimeout(2000);
      await admin.locator('p button:has-text("Dinis")').first().click();
      await admin.waitForTimeout(1200);
      ok('drill log header name links to person page', admin.url().includes('/crew/'));
    }

    // ── Teammate privacy: driller opens ANOTHER member's page ───────────
    const otherCrewId = await driller.evaluate(async (userId) => {
      const all = await window.shotlogDb.crewMembers.toArray();
      return all.find((c) => c.userId && c.userId !== userId)?.id ?? null;
    }, dinisUserId);
    if (otherCrewId && crewId) {
      await goto(driller, `http://localhost:5199/crew/${otherCrewId}`);
      await driller.waitForTimeout(2000);
      const teammate = await bodyOf(driller);
      ok('teammate view hides stats + jobs', !teammate.includes('days worked') && !teammate.includes('jobs worked') && teammate.includes('documents'));
      await goto(driller, `http://localhost:5199/crew/${crewId}`);
      await driller.waitForTimeout(2500);
      ok('own page shows full stats', (await bodyOf(driller)).includes('days worked'));
    } else {
      results.push('SKIP teammate privacy (no second enrolled crew member)');
    }
  } catch (err) {
    results.push(`ABORT ${String(err).split('\n')[0]}`);
    for (const [label, p] of [['blaster', blaster], ['driller', driller], ['admin', admin]]) {
      if (!p) continue;
      try { results.push(`STATE ${label} @ ${p.url()} :: ${(await p.locator('body').innerText()).slice(0, 300).replace(/\n+/g, ' | ')}`); } catch {}
    }
  }
  for (const p of [blaster, driller, admin]) {
    try { await p?.context().close(); } catch {}
  }
  return results.join('\n');
}

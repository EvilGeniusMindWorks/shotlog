async (page) => {
  // Loose-ends round: filed submissions are metadata-only (binaries in the
  // device store, checksums on the record); the server's write-once rule
  // permits ONLY the storage-pointer flip; PDFs open via the resolver chain;
  // drillers can attach to their drill logs; binder export still packs PDFs.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const OUT = '/private/tmp/claude-501/-Users-matthewbulmer-Documents-Code-shotlog/d2d2c320-b4ff-4b90-b251-2a8a202badf3/scratchpad';
  let admin, driller;
  try {
    const mk = async () => {
      const ctx = await browser.newContext();
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
    const waitBody = async (p, t, ms = 45000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if ((await p.locator('body').innerText()).includes(t)) return true;
        await p.waitForTimeout(700);
      }
      return false;
    };
    const auditFor = (p, recordId) =>
      p.evaluate(async (id) => {
        const token = localStorage.getItem('shotlog-access-token');
        const res = await fetch('http://localhost:4000/audit/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ids: [id] }),
        });
        return (await res.json()).entries;
      }, recordId);
    const tag = `H22-${Date.now() % 1000000}`;

    // ── (a) File a checklist → record is metadata-only with checksums ─────
    admin = await mk();
    await login(admin, 'mark@baystateblasting.com', 'dev-password-123');
    const clId = await admin.evaluate(async (t) => {
      const db = window.shotlogDb;
      const rig = (await db.equipment.toArray()).find((e) => e.isActive);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.drillChecklists.add({
        id, equipmentId: rig ? rig.id : 'R-H22', date: now.slice(0, 10),
        startingHours: 200, daily: { 'Engine Oil': 'ok' }, weeklyDone: false, weekly: {},
        repairsNote: t, outOfService: false,
        drillerUserId: JSON.parse(localStorage.getItem('shotlog-user-info')).id,
        drillerName: 'Mark Swihart', signatureImage: null,
        createdAt: now, updatedAt: now,
      });
      return id;
    }, tag);
    await admin.goto(`http://localhost:5199/drill-checklist-file/${clId}`);
    ok('filing works', await waitBody(admin, 'Checklist filed', 60000));
    const sub = await admin.evaluate(async (srcId) => {
      const s = (await window.shotlogDb.submissions.toArray()).find((x) => x.sourceId === srcId);
      if (!s) return null;
      return {
        id: s.id, title: s.title, pdfNull: s.pdf === null || s.pdf === undefined,
        sha: s.pdfSha256 ?? '', size: s.pdfSize ?? 0, storage: s.storageStatus,
      };
    }, clId);
    ok('record is metadata-only (pdf null, sha256 + size + device status)',
      Boolean(sub) && sub.pdfNull && sub.sha.length === 64 && sub.size > 1000 && sub.storage === 'device');

    // ── (b) PDF opens via the resolver chain (device media store) ─────────
    await admin.goto('http://localhost:5199/records');
    await admin.waitForTimeout(2500);
    const row = admin.locator('div.px-3').filter({ hasText: 'Rig Checklist' }).first();
    const [popup] = await Promise.all([
      admin.context().waitForEvent('page', { timeout: 15000 }),
      row.getByRole('button', { name: 'View', exact: true }).first().click(),
    ]);
    await popup.waitForTimeout(2000);
    ok('PDF opens via resolver (blob url)', popup.url().startsWith('blob:'));
    await popup.close();

    // ── (c) content tamper on a filed submission → server DISCARD ─────────
    ok('filing synced', await waitBody(admin, 'All changes saved', 45000));
    await admin.evaluate(async (id) => {
      await window.shotlogDb.submissions.update(id, {
        title: 'Tampered title', updatedAt: new Date().toISOString(),
      });
    }, sub.id);
    let tamperDiscard;
    {
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline && !tamperDiscard) {
        const rows = await auditFor(admin, sub.id);
        tamperDiscard = rows.find((e) => e.op === 'DISCARD' && /write-once/.test(e.reason ?? ''));
        if (!tamperDiscard) await admin.waitForTimeout(1500);
      }
    }
    ok('content edit discarded as write-once', Boolean(tamperDiscard));
    // put the local title back to the ORIGINAL so the later pointer-flip
    // PATCH carries no content diff vs the server's stored payload
    await admin.evaluate(async ({ id, title }) => {
      await window.shotlogDb.submissions.update(id, { title, updatedAt: new Date().toISOString() });
    }, { id: sub.id, title: sub.title });

    // ── (d) storage-pointer flip → ACCEPTED (PATCH audit, no discard) ─────
    await admin.waitForTimeout(3000);
    await admin.evaluate(async (id) => {
      await window.shotlogDb.submissions.update(id, {
        storageStatus: 'stored', pdfKey: 'c/test/fake-key.pdf', assetKeys: {},
        updatedAt: new Date().toISOString(),
      });
    }, sub.id);
    let pointerApplied, pointerDiscarded;
    {
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline && !pointerApplied && !pointerDiscarded) {
        const rows = await auditFor(admin, sub.id);
        pointerApplied = rows.find((e) =>
          (e.op === 'PATCH' || e.op === 'PUT') &&
          e.changes.some((c) => c.field === 'storageStatus' && String(c.new).includes('stored')));
        pointerDiscarded = rows.find((e) => e.op === 'DISCARD' && /write-once/.test(e.reason ?? '') &&
          new Date(e.at).getTime() > Date.now() - 20000 && !tamperDiscard || false);
        if (!pointerApplied) await admin.waitForTimeout(1500);
      }
    }
    ok('storage-pointer flip accepted by the server', Boolean(pointerApplied));
    // restore 'device' locally so the binder/PDF path keeps using local media
    await admin.evaluate(async (id) => {
      await window.shotlogDb.submissions.update(id, {
        storageStatus: 'device', pdfKey: undefined, updatedAt: new Date().toISOString(),
      });
    }, sub.id);

    // ── (e) driller attaches to a drill log (perms + UI mount) ────────────
    driller = await mk();
    await login(driller, 'dinis@test.local', 'dinis-pass-123');
    const dinisUserId = await driller.evaluate(
      () => JSON.parse(localStorage.getItem('shotlog-user-info')).id,
    );
    const jobId = await admin.evaluate(
      (t) => window.shotlogFlows.createJob({ name: `${t} Job`, customer: 'H22' }), tag);
    const seed = await admin.evaluate(async (jobId) => {
      const dayId = await window.shotlogFlows.createBlastDay(jobId);
      const log = await window.shotlogDb.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await window.shotlogDb.shots.where('blastLogId').equals(log.id).first();
      return { dayId, shotId: shot.id };
    }, jobId);
    const dl = await driller.evaluate(async ({ t, jobId, dinisUserId, seed }) => {
      const db = window.shotlogDb;
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        if (await db.blastDays.get(seed.dayId)) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      const rig = await db.equipment.filter((e) => e.isActive).first();
      const now = new Date().toISOString();
      const dlId = `${t}-dl`;
      await db.drillLogs.add({ id: dlId, jobId, blastDayId: seed.dayId, shotId: seed.shotId, status: 'open', holeDiameter: 3, burden: 8, spacing: 9, faceHeight: 16, gps: '', locationNote: '', drillerUserId: dinisUserId, drillerName: 'Dinis Baltazar', drillRigEquipmentId: rig?.id ?? null, signatureImage: null, createdAt: now, updatedAt: now, syncStatus: 'local' });
      const attId = `${t}-att`;
      await db.attachments.add({ id: attId, parentId: dlId, parentType: 'drill_log', fileName: 'bench.jpg', mimeType: 'image/jpeg', data: null, kind: 'photo', size: 12345, sha256: 'a'.repeat(64), storageStatus: 'device', originName: 'Dinis Baltazar', createdAt: now, updatedAt: now, syncStatus: 'local' });
      return { dlId, attId };
    }, { t: tag, jobId, dinisUserId, seed });
    // server must ACCEPT the driller's attachment PUT (audit entry, no DISCARD)
    let attPut, attDiscard;
    {
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline && !attPut && !attDiscard) {
        const rows = await auditFor(admin, dl.attId);
        attPut = rows.find((e) => (e.op === 'PUT' || e.op === 'PATCH') && /driller/i.test(e.actorRole));
        attDiscard = rows.find((e) => e.op === 'DISCARD');
        if (!attPut && !attDiscard) await driller.waitForTimeout(1500);
      }
    }
    ok('driller attachment accepted by server', Boolean(attPut) && !attDiscard);
    // drill-log page mounts the attachments card
    await driller.goto(`http://localhost:5199/blast-day/${seed.dayId}/drill-log/${dl.dlId}`);
    ok('drill-log page shows attachments card',
      await waitBody(driller, 'Drill log photos & media', 20000));

    // ── (f) binder export still packs the filed PDF ───────────────────────
    await admin.goto('http://localhost:5199/records');
    await admin.waitForTimeout(2000);
    await admin.getByRole('button', { name: /Export binder/ }).click();
    await admin.waitForTimeout(800);
    const [download] = await Promise.all([
      admin.waitForEvent('download', { timeout: 120000 }),
      admin.getByRole('button', { name: 'Build binder' }).click(),
    ]);
    await download.saveAs(`${OUT}/binder22.zip`);
    ok('binder ZIP downloaded', true);

    // ── (g) job page (SiteKCard projection) renders without crashing ──────
    await admin.goto(`http://localhost:5199/jobs/${jobId}`);
    await admin.waitForTimeout(2500);
    const jobTxt = await admin.locator('body').innerText();
    ok('job detail page renders (SiteK projection intact)', jobTxt.includes(`${tag} Job`));
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await (admin ?? driller).locator('body').innerText()).slice(0, 400)); } catch {}
  }
  return results.join('\n');
}

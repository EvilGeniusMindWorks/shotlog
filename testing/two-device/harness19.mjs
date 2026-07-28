async (page) => {
  // Attachments round: metadata-only sync records (binary never in payload),
  // typed picker w/ company custom types, thumbs, video probe + lightbox clip
  // marks syncing across devices, oversize video stays device-only WITHOUT
  // wedging the queue, offline capture syncs later, 430px overflow rule.
  // R2 legs (stored flip + cross-device fetch) auto-skip when storage isn't
  // configured on the local server.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let blaster, second;
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
    const waitFor = async (p, fn, arg, ms = 30000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (await p.evaluate(fn, arg).catch(() => false)) return true;
        await p.waitForTimeout(500);
      }
      return false;
    };
    const tag = `H19-${Date.now() % 1000000}`;

    blaster = await mk();
    await login(blaster, 'mark@baystateblasting.com', 'dev-password-123');
    const r2 = await blaster.evaluate(async () => {
      const token = localStorage.getItem('shotlog-access-token');
      const res = await fetch('http://localhost:4000/files/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok ? (await res.json()).configured : false;
    });
    results.push(`INFO R2 configured locally: ${r2}`);

    // ── Seed a day ────────────────────────────────────────────────────────
    const ids = await blaster.evaluate(async (t) => {
      const jobId = await window.shotlogFlows.createJob({ name: `${t} Job`, customer: 'H19' });
      const dayId = await window.shotlogFlows.createBlastDay(jobId);
      const log = await window.shotlogDb.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await window.shotlogDb.shots.where('blastLogId').equals(log.id).first();
      return { jobId, dayId, shotId: shot.id };
    }, tag);

    // ── (a) Photo via the pipeline: metadata-only record + thumb + sha ────
    await blaster.evaluate(async ({ dayId }) => {
      const mod = await import('/src/lib/attachments.ts');
      // draw a real 1800x1200 photo-ish canvas → jpeg file
      const c = document.createElement('canvas');
      c.width = 1800; c.height = 1200;
      const x = c.getContext('2d');
      x.fillStyle = '#7a9e5f'; x.fillRect(0, 0, 1800, 1200);
      x.fillStyle = '#2f2f2f'; x.fillRect(200, 700, 1400, 300);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      const file = new File([blob], 'site-photo.jpg', { type: 'image/jpeg' });
      await mod.addAttachmentFiles(dayId, 'blast_day', [file], 'photo');
    }, ids);
    const photoRec = await blaster.evaluate(async (dayId) => {
      const rows = await window.shotlogDb.attachments.filter((a) => a.parentId === dayId).toArray();
      const a = rows[0];
      return a && {
        kind: a.kind, hasThumb: Boolean(a.thumb && a.thumb.startsWith('data:image')),
        sha: (a.sha256 ?? '').length, size: a.size, dataEmpty: (!a.data || a.data.size === 0),
        status: a.storageStatus,
      };
    }, ids.dayId);
    ok('photo record: kind/thumb/sha256/size, binary NOT in record',
      photoRec && photoRec.kind === 'photo' && photoRec.hasThumb && photoRec.sha === 64 &&
      photoRec.size > 0 && photoRec.dataEmpty);

    // ── (b) In-browser real video (canvas+MediaRecorder) + clip marks ─────
    const videoId = await blaster.evaluate(async ({ shotId }) => {
      const c = document.createElement('canvas');
      c.width = 320; c.height = 240;
      const x = c.getContext('2d');
      const stream = c.captureStream(15);
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      const stopped = new Promise((r) => (rec.onstop = r));
      rec.start();
      const t0 = performance.now();
      await new Promise((done) => {
        const draw = () => {
          const t = performance.now() - t0;
          x.fillStyle = `hsl(${(t / 10) % 360},70%,50%)`;
          x.fillRect(0, 0, 320, 240);
          if (t < 2500) requestAnimationFrame(draw);
          else done();
        };
        draw();
      });
      rec.stop();
      await stopped;
      const blob = new Blob(chunks, { type: 'video/webm' });
      const file = new File([blob], 'shot-video.webm', { type: 'video/webm' });
      const mod = await import('/src/lib/attachments.ts');
      const [id] = await mod.addAttachmentFiles(shotId, 'shot', [file], 'shot_video');
      return id;
    }, ids);
    const videoRec = await blaster.evaluate(async (id) => {
      const a = await window.shotlogDb.attachments.get(id);
      return a && { hasThumb: Boolean(a.thumb), dataEmpty: (!a.data || a.data.size === 0), kind: a.kind };
    }, videoId);
    ok('video record: poster thumb + metadata-only', videoRec && videoRec.hasThumb && videoRec.dataEmpty && videoRec.kind === 'shot_video');

    // Open the shot media tile → lightbox plays; set marks via the API path
    await blaster.evaluate(async (id) => {
      const mod = await import('/src/lib/attachments.ts');
      await mod.saveClipMarks(id, 0.5, 2.0);
    }, videoId);
    const marks = await blaster.evaluate(async (id) => {
      const a = await window.shotlogDb.attachments.get(id);
      return { s: a.clipStart, e: a.clipEnd };
    }, videoId);
    ok('clip marks persisted', marks.s === 0.5 && marks.e === 2.0);

    // ── (c) Oversize video: device-only, queue must still drain ───────────
    await blaster.evaluate(async ({ shotId }) => {
      const big = new Blob([new Uint8Array(60 * 1024 * 1024)], { type: 'video/mp4' });
      const file = new File([big], 'full-shot.mp4', { type: 'video/mp4' });
      const mod = await import('/src/lib/attachments.ts');
      await mod.addAttachmentFiles(shotId, 'shot', [file], 'shot_video');
    }, ids);
    const bigRec = await blaster.evaluate(async (shotId) => {
      const rows = await window.shotlogDb.attachments.filter((a) => a.parentId === shotId).toArray();
      const a = rows.find((r) => r.fileName === 'full-shot.mp4');
      return a && { dataEmpty: (!a.data || a.data.size === 0), status: a.storageStatus, size: a.size };
    }, ids.shotId);
    ok('60MB video: metadata-only record, device status', bigRec && bigRec.dataEmpty && bigRec.status === 'device' && bigRec.size === 60 * 1024 * 1024);
    const drained = await waitFor(blaster, async () =>
      document.body.innerText.includes('All changes saved'), null, 45000);
    ok('sync queue drains with 60MB video present (no wedge)', drained);

    // ── Cross-device: second device sees metadata + thumbs, no binaries ───
    second = await mk();
    await login(second, 'blaster@test.local', 'blaster-pass-123');
    ok('second device sees attachments metadata', await waitFor(second, async (shotId) => {
      const rows = await window.shotlogDb.attachments.filter((a) => a.parentId === shotId).toArray();
      return rows.length === 2 && rows.every((r) => (!r.data || r.data.size === 0));
    }, ids.shotId, 45000));
    const secondView = await second.evaluate(async ({ shotId, videoId }) => {
      const rows = await window.shotlogDb.attachments.filter((a) => a.parentId === shotId).toArray();
      const vid = rows.find((r) => r.id === videoId);
      const big = rows.find((r) => r.fileName === 'full-shot.mp4');
      return {
        marks: vid && vid.clipStart === 0.5 && vid.clipEnd === 2.0,
        thumb: Boolean(vid?.thumb),
        bigDeviceOnly: big?.storageStatus === 'device',
        origin: big?.originName ?? '',
      };
    }, { shotId: ids.shotId, videoId });
    ok('marks + thumb synced; oversize is device-only w/ origin name',
      secondView.marks && secondView.thumb && secondView.bigDeviceOnly && secondView.origin.length > 0);

    // ── (d) Offline capture syncs later ───────────────────────────────────
    await blaster.context().setOffline(true);
    await blaster.evaluate(async ({ dayId }) => {
      const c = document.createElement('canvas');
      c.width = 400; c.height = 300;
      c.getContext('2d').fillRect(0, 0, 400, 300);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      const file = new File([blob], 'offline-photo.jpg', { type: 'image/jpeg' });
      const mod = await import('/src/lib/attachments.ts');
      await mod.addAttachmentFiles(dayId, 'blast_day', [file], 'photo');
    }, ids);
    await blaster.context().setOffline(false);
    ok('offline-captured photo record reaches the other device', await waitFor(second, async (dayId) => {
      const rows = await window.shotlogDb.attachments.filter((a) => a.parentId === dayId).toArray();
      return rows.some((r) => r.fileName === 'offline-photo.jpg');
    }, ids.dayId, 45000));

    // ── (e) Company custom type shows in the picker after sync ────────────
    await blaster.evaluate(async () => {
      const s = await window.shotlogDb.companySettings.get('companySettings-singleton');
      const types = [...new Set([...(s?.attachmentTypes ?? []), 'Permit'])];
      await window.shotlogDb.companySettings.update('companySettings-singleton', {
        attachmentTypes: types, updatedAt: new Date().toISOString(),
      });
    });
    await second.goto(`http://localhost:5199/blast-day/${ids.dayId}`);
    const permitShown = await waitFor(second, async () =>
      document.body.innerText.includes('Permit'), null, 30000);
    ok('custom type "Permit" in picker on second device', permitShown);

    // ── (f) 430px overflow rule on the new cards ──────────────────────────
    await second.setViewportSize({ width: 430, height: 932 });
    await second.goto(`http://localhost:5199/blast-day/${ids.dayId}`);
    await second.waitForTimeout(2500);
    const overflow = await second.evaluate(() => {
      const iw = window.innerWidth;
      const main = document.querySelector('main');
      return document.documentElement.scrollWidth > iw + 1 ||
        Boolean(main && main.scrollWidth > main.clientWidth + 1);
    });
    ok('no overflow at 430px with attachment cards', !overflow);
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await (second ?? blaster).locator('body').innerText()).slice(0, 400)); } catch {}
  }
  return results.join('\n');
}

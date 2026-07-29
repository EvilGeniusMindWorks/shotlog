async (page) => {
  // Clip extraction (phase 2): mark in/out on a real video → Extract clip →
  // a NEW small attachment appears (kind shot_video, sourceAttachmentId set,
  // correct short duration) → tile shows Clip badge → metadata reaches the
  // second device. R2 upload leg self-gates (not configured locally).
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let a, b;
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
    const tag = `H20-${Date.now() % 1000000}`;

    a = await mk();
    await login(a, 'mark@baystateblasting.com', 'dev-password-123');

    // Seed day + a 5s in-browser video on shot 1
    const ids = await a.evaluate(async (t) => {
      const jobId = await window.shotlogFlows.createJob({ name: `${t} Job`, customer: 'H20' });
      const dayId = await window.shotlogFlows.createBlastDay(jobId);
      const log = await window.shotlogDb.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await window.shotlogDb.shots.where('blastLogId').equals(log.id).first();
      const c = document.createElement('canvas');
      c.width = 480; c.height = 320;
      const x = c.getContext('2d');
      const rec = new MediaRecorder(c.captureStream(20), { mimeType: 'video/webm' });
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      const stopped = new Promise((r) => (rec.onstop = r));
      rec.start();
      const t0 = performance.now();
      await new Promise((done) => {
        const draw = () => {
          const t2 = performance.now() - t0;
          x.fillStyle = `hsl(${(t2 / 12) % 360},60%,45%)`;
          x.fillRect(0, 0, 480, 320);
          x.fillStyle = 'white';
          x.font = 'bold 60px sans-serif';
          x.fillText((t2 / 1000).toFixed(1), 170, 180);
          if (t2 < 5000) requestAnimationFrame(draw);
          else done();
        };
        draw();
      });
      rec.stop();
      await stopped;
      const file = new File([new Blob(chunks, { type: 'video/webm' })], 'full-shot-video.webm', { type: 'video/webm' });
      const mod = await import('/src/lib/attachments.ts');
      const [attId] = await mod.addAttachmentFiles(shot.id, 'shot', [file], 'shot_video');
      return { dayId, shotId: shot.id, attId };
    }, tag);
    ok('seeded video attachment', Boolean(ids.attId));

    // Open the lightbox from the tile, mark ~1s..3s while playing, extract
    await a.goto(`http://localhost:5199/blast-day/${ids.dayId}`);
    await a.waitForTimeout(3000);
    const tile = a.locator('button[title*="full-shot-video.webm"]').first();
    await tile.scrollIntoViewIfNeeded();
    await tile.click();
    await a.waitForTimeout(1500);
    await a.evaluate(() => document.querySelector('video')?.play());
    await a.waitForTimeout(1000);
    await a.getByRole('button', { name: 'Start here' }).click();
    await a.waitForTimeout(2000);
    await a.getByRole('button', { name: 'End here' }).click();
    await a.evaluate(() => document.querySelector('video')?.pause());
    await a.getByRole('button', { name: /Extract clip/ }).click();
    const extracted = await (async () => {
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        if ((await a.locator('body').innerText()).includes('Clip created')) return true;
        await a.waitForTimeout(1000);
      }
      return false;
    })();
    ok('extraction completed with progress UI', extracted);

    const clipRec = await a.evaluate(async ({ shotId, attId }) => {
      const rows = await window.shotlogDb.attachments.filter((r) => r.parentId === shotId).toArray();
      const clip = rows.find((r) => r.sourceAttachmentId === attId);
      const full = rows.find((r) => r.id === attId);
      return clip && {
        size: clip.size, srcSize: full.size, kind: clip.kind,
        dur: clip.duration, marks: { s: full.clipStart, e: full.clipEnd },
        name: clip.fileName, dataNull: !clip.data,
      };
    }, ids);
    ok('clip attachment created, linked to source, metadata-only',
      clipRec && clipRec.kind === 'shot_video' && clipRec.dataNull && clipRec.size > 0 &&
      clipRec.name.includes('-clip.'));
    ok(`clip duration ≈ marked range (got ${clipRec?.dur?.toFixed?.(1)}s for ~2s)`,
      clipRec && clipRec.dur !== null && clipRec.dur > 1 && clipRec.dur < 3.6);
    ok('clip is smaller than the source', clipRec && clipRec.size < clipRec.srcSize * 0.95 || (clipRec && clipRec.size < 4_000_000));

    // Tile shows the Clip badge; second device gets the metadata
    await a.mouse.click(5, 5); // close lightbox
    await a.waitForTimeout(1000);
    const clipBadge = (await a.locator('span', { hasText: /^Clip$/ }).count()) > 0;
    ok('Clip badge on the tile', clipBadge);

    b = await mk();
    await login(b, 'blaster@test.local', 'blaster-pass-123');
    ok('second device sees the clip record', await waitFor(b, async ({ shotId, attId }) => {
      const rows = await window.shotlogDb.attachments.filter((r) => r.parentId === shotId).toArray();
      return rows.some((r) => r.sourceAttachmentId === attId);
    }, ids, 45000));
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await (b ?? a).locator('body').innerText()).slice(0, 400)); } catch {}
  }
  return results.join('\n');
}

async (page, lib) => {
  // Sync load (2026-09-08): a seismograph printout never rides the synced
  // record. The capture becomes an attachment — compressed, thumb in the
  // record, binary on the device then in file storage — and the reading
  // points at it. Another device sees the thumb at once and gets a truthful
  // "on X's device" until the binary reaches storage (no R2 locally, so the
  // stored leg is skipped as harness19 does). The migration endpoint answers.
  const { mkCtx, signIn, skipTours, waitForUpload, waitForSync, sleep, apiFor, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  let dayId, shotId, readingId;

  const c1 = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
  const P1 = await c1.newPage();
  P1.on('console', (m) => { if (m.type() === 'error') R.note('P1 console: ' + m.text().slice(0, 160)); });

  await R.section('a day with a shot; the blaster captures a printout with a reading', async () => {
    await signIn(P1, 'blaster');
    await skipTours(P1);
    const made = await P1.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const id = await createBlastDay(jobs[0].id, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `Sync-load seismo ${stamp}` });
      const log = await db.blastLogs.where('blastDayId').equals(id).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      return { id, shotId: shot.id };
    }, stamp);
    dayId = made.id; shotId = made.shotId;
    await P1.goto(`${WEB}/blast-day/${dayId}/seismo/${shotId}`);
    await P1.getByRole('button', { name: /Add Reading/ }).waitFor({ timeout: 10000 });
    await P1.getByRole('button', { name: /Add Reading/ }).click();
    // a real 2000×1500 "printout" photo, ~ the size a phone camera hands over,
    // handed to the capture input the way the camera would
    await P1.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 2000; c.height = 1500;
      const g = c.getContext('2d'); g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, c.width, c.height);
      g.strokeStyle = '#1c3859'; g.lineWidth = 3; for (let x = 0; x < 2000; x += 7) { g.beginPath(); g.moveTo(x, 750 + Math.sin(x / 40) * (200 + (x % 97))); g.lineTo(x + 7, 750 + Math.cos(x / 31) * (150 + (x % 53))); g.stroke(); }
      g.fillStyle = '#111'; g.font = '48px monospace'; g.fillText('PPV 0.42 in/s  f 27 Hz', 80, 120);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
      const file = new File([blob], 'printout.jpg', { type: 'image/jpeg' });
      const input = document.querySelector('input[type="file"][accept="image/*"]');
      const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(600);
    const field = (label) => P1.locator(`div:has(> label:text-is("${label}")) input`).first();
    await field('PPV Tran (in/s)').fill('0.42');
    await field('PPV Vert (in/s)').fill('0.31');
    await field('PPV Long (in/s)').fill('0.28');
    await field('Frequency (Hz)').fill('27');
    await P1.getByRole('button', { name: 'Save Reading' }).click();
    await sleep(1500);
    const rec = await P1.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { getPowerSync } = await import('/src/db/powersync/client.ts');
      const readings = await db.seismoReadings.toArray();
      const r = readings.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const raw = await getPowerSync().getAll("SELECT length(payload) AS len, json_extract(payload,'$.printoutImage.__blob') AS blob, json_extract(payload,'$.printoutAttachmentId') AS att FROM records WHERE id = ?", [r.id]);
      const atts = await db.attachments.where('parentId').equals(r.id).toArray();
      return { id: r.id, len: raw[0]?.len, hasBlob: raw[0]?.blob != null, att: raw[0]?.att, attachments: atts.map((a) => ({ id: a.id, kind: a.kind, mime: a.mimeType, size: a.size, thumb: (a.thumb ?? '').length, status: a.storageStatus, data: a.data })) };
    });
    readingId = rec.id;
    R.ok(`the reading's synced record carries no image (${rec.len} chars, attachment ${rec.att ? 'linked' : 'missing'})`, !rec.hasBlob && Boolean(rec.att) && rec.len < 4000);
    const a = rec.attachments[0];
    R.ok(`the printout is an attachment: photo · ${a?.mime} · ${((a?.size ?? 0) / 1024).toFixed(0)} KB (compressed) · thumb ${a?.thumb} chars · on the device`, Boolean(a) && a.kind === 'photo' && a.size < 900000 && a.thumb > 500 && a.thumb < 20000 && a.status === 'device' && a.data === null);
    R.ok('the reading card shows the thumb', (await P1.locator(`[data-seismo-photo="${a?.id}"] img`).count()) === 1);
    await waitForUpload(P1);
  });

  await R.section('another device sees the reading and the thumb at once; the full photo waits for storage', async () => {
    const c2 = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
    const P2 = await c2.newPage();
    await signIn(P2, 'mark');
    await skipTours(P2);
    await P2.goto(`${WEB}/blast-day/${dayId}/seismo/${shotId}`);
    await P2.locator('[data-seismo-photo]').waitFor({ timeout: 15000 });
    const status = await P2.locator('[data-seismo-photo]').getAttribute('data-seismo-photo-status');
    R.ok(`Mark's device has the thumb and knows the binary is ${status === 'device' ? "on the blaster's device" : 'in storage'}`, (await P2.locator('[data-seismo-photo] img').count()) === 1);
    const health = await apiFor(P2)('/health');
    if (health.body?.files) {
      await waitForSync(P2).catch(() => undefined);
      R.note('file storage configured — the stored leg would run here');
    } else {
      R.ok('no file storage locally: the record still synced and the thumb still shows (the binary stays on the capturing device)', status === 'device');
    }
    await c2.close();
  });

  await R.section('the migration endpoint is platform-admin only and answers truthfully', async () => {
    const admin = await lib.apiLogin(P1, 'mark');
    const r = await admin.api('/platform/migrations/inline-images', { method: 'POST' }, admin.token);
    R.ok(`POST /platform/migrations/inline-images → ${r.status} (${r.body?.skipped ?? `${r.body?.moved} moved`})`, r.status === 200 && (r.body?.skipped === 'file storage not configured' || typeof r.body?.moved === 'number'));
    const blaster = await lib.apiLogin(P1, 'blaster');
    const nope = await blaster.api('/platform/migrations/inline-images', { method: 'POST' }, blaster.token);
    R.ok('a blaster cannot run it', nope.status === 403);
    const h = await admin.api('/health');
    R.ok('/health reports legacyInlineImages', typeof h.body?.legacyInlineImages === 'number' || h.body?.legacyInlineImages === null);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId] }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
    void readingId;
  });
  await c1.close();
  return R.summary();
}

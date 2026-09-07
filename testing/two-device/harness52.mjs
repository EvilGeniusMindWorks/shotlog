async (page, lib) => {
  // Twenty seconds of syncing (Matthew, 2026-09-07; plan artifact 742b52b4,
  // all Build): sign-out keeps the company's copy so the next sign-in from
  // the same company is instant; "Sign out & clear this device" still
  // wipes; the chip never says Synced while the first download runs; the
  // storage-engine selector is gone; Settings says where filed PDFs live;
  // /health reports file storage and the legacy inline-PDF count.
  const { mkCtx, signIn, skipTours, apiFor, waitForSync, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const api = apiFor(page);

  await R.section('/health reports file storage + legacy inline PDFs', async () => {
    const h = await api('/health');
    R.ok(`health carries files (${h.body?.files}) and legacyInlinePdfs (${h.body?.legacyInlinePdfs})`, typeof h.body?.files === 'boolean' && typeof h.body?.legacyInlinePdfs === 'number');
  });

  await R.section('the chip is truthful while the first download runs (pure rule)', async () => {
    const ctx = await mkCtx(browser);
    const P = await ctx.newPage();
    await P.goto(WEB);
    const r = await P.evaluate(async () => {
      const { deriveSyncState } = await import('/src/lib/syncState.ts');
      const base = { online: true, connected: true, connecting: false, uploading: false, downloading: true, queued: 0, expired: false };
      return {
        mid: deriveSyncState({ ...base, hasSynced: false, progress: 0.62 }),
        unknown: deriveSyncState({ ...base, hasSynced: false, downloading: false }),
        done: deriveSyncState({ ...base, hasSynced: true, downloading: false }),
      };
    });
    R.ok(`62% into a first download the chip says so (${r.mid.short} · ${r.mid.label})`, r.mid.kind === 'syncing' && r.mid.short === '62%');
    R.ok('before the first download completes it never says Synced', r.unknown.kind === 'syncing' && r.unknown.short === 'Downloading');
    R.ok('after it completes, Synced', r.done.kind === 'synced');
    await ctx.close();
  });

  const ctx = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
  const P = await ctx.newPage();
  let recordsBefore = 0;
  const count = () => P.evaluate(async () => (await import('/src/db/powersync/client.ts')).getPowerSync().getAll('SELECT count(*) AS n FROM records').then((r) => r[0]?.n ?? 0));
  const firstSyncLines = () => P.evaluate(async () => (await import('/src/lib/syncLog.ts')).getSyncLog().filter((e) => e.msg.startsWith('first sync done')).length);

  await R.section('a fresh device downloads once and remembers whose copy it holds', async () => {
    await signIn(P, 'blaster');
    await skipTours(P);
    recordsBefore = await count();
    const marker = await P.evaluate(() => localStorage.getItem('shotlog-replica-cid'));
    R.ok(`first sync landed ${recordsBefore} records and the copy is tagged with the company (${marker ? 'yes' : 'no'})`, recordsBefore > 0 && Boolean(marker));
    R.ok('one "first sync done" line in the log', (await firstSyncLines()) === 1);
  });

  await R.section('Sign Out keeps the copy; a colleague signs in instantly', async () => {
    await P.goto(`${WEB}/profile`);
    await P.locator('[data-profile-sign-out]').click();
    await P.locator('input[type="email"]').waitFor({ timeout: 15000 });
    const kept = await P.evaluate(() => Boolean(localStorage.getItem('shotlog-replica-cid')) && !localStorage.getItem('shotlog-access-token'));
    R.ok('signed out: session gone, company tag kept', kept);
    const t0 = Date.now();
    await signIn(P, 'dinis', { sync: false }); // sets a PIN if asked (PIN is per account)
    // the kept copy reports hasSynced immediately — no first-sync strip
    await P.locator('main, [data-tour-overlay]').first().waitFor({ timeout: 15000 });
    const strip = await P.locator('[data-first-sync-strip]').count();
    const synced = await P.evaluate(async () => (await import('/src/db/powersync/client.ts')).getPowerSync().currentStatus?.hasSynced === true);
    const n = await count();
    R.ok(`Dinis is in after ${Date.now() - t0} ms with the company already on the device (${n} records, no first-sync strip)`, strip === 0 && n >= recordsBefore - 50 && synced);
    R.ok('no second "first sync done" line — nothing was re-downloaded', (await firstSyncLines()) === 1);
    await skipTours(P);
  });

  await R.section('Settings: selector gone, file-storage line present', async () => {
    await P.goto(`${WEB}/settings`);
    await P.locator('[data-data-device-card]').waitFor({ timeout: 10000 });
    await P.locator('[data-files-status]').waitFor({ timeout: 8000 }).catch(() => undefined);
    const files = await P.locator('[data-files-status]').getAttribute('data-files-status').catch(() => null);
    R.ok('the storage-engine selector is gone', (await P.locator('[data-storage-engine-select]').count()) === 0);
    R.ok(`Settings says where filed PDFs live (file storage ${files})`, files === 'on' || files === 'off');
    R.ok('the last first-sync timing is still shown for diagnosis', (await P.locator('[data-first-sync]').count()) === 1);
  });

  await R.section('"Sign out & clear this device" really wipes; the next sign-in downloads again', async () => {
    await P.goto(`${WEB}/profile`);
    P.once('dialog', (d) => void d.accept());
    await P.locator('[data-profile-sign-out-clear]').click();
    await P.locator('input[type="email"]').waitFor({ timeout: 20000 });
    await sleep(500);
    const marker = await P.evaluate(() => localStorage.getItem('shotlog-replica-cid'));
    R.ok('the company tag is gone with the copy', !marker);
    await signIn(P, 'blaster', { sync: false });
    await waitForSync(P, 60000);
    await skipTours(P);
    R.ok('a second "first sync done" line — the download happened again, as asked', (await firstSyncLines()) === 2);
    R.ok(`the copy is back (${await count()} records)`, (await count()) > 0);
  });

  await ctx.close();
  return R.summary();
}

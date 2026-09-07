async (page, lib) => {
  // Storage-engine measurement (Matthew, 2026-09-07): IndexedDB-backed
  // SQLite (the SDK default) vs OPFS. For each engine, a FRESH device signs
  // in and we time the first full download of the company, then a read
  // workload (what the home and Days list run) and a small write workload
  // (start + delete a day, ten times). Numbers land as NOTE lines so the
  // runner prints them; run under both engines:
  //   node testing/run.mjs 51            (Chromium)
  //   node testing/run.mjs 51 --webkit   (Safari's engine)
  const { mkCtx, signIn, skipTours, waitForSync, sleep } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const ua = await page.evaluate(() => navigator.userAgent);
  const engineName = /WebKit\/6/.test(ua) && !/Chrome|Chromium/.test(ua) ? 'WebKit' : 'Chromium';
  R.note(`browser: ${engineName}`);
  const results = {};
  let createdDayIds = [];

  for (const engine of ['idb', 'opfs']) {
    await R.section(`first sync + workloads · ${engine}`, async () => {
      const ctx = await mkCtx(browser, {
        viewport: { width: 390, height: 844 },
        extra: `localStorage.setItem('shotlog-storage-engine', '${engine}');`,
      });
      const P = await ctx.newPage();
      const t0 = Date.now();
      await signIn(P, 'blaster', { sync: false });
      await waitForSync(P, 180000);
      const firstSyncMs = Date.now() - t0;
      await skipTours(P);
      const info = await P.evaluate(async () => {
        const { getPowerSync, storageEngine } = await import('/src/db/powersync/client.ts');
        const { getSyncLog } = await import('/src/lib/syncLog.ts');
        const n = (await getPowerSync().getAll('SELECT count(*) AS n FROM records'))[0]?.n ?? 0;
        const bytes = (await getPowerSync().getAll('SELECT sum(length(payload)) AS b FROM records'))[0]?.b ?? 0;
        const line = [...getSyncLog()].reverse().find((e) => e.msg.startsWith('first sync done'))?.msg ?? '';
        return { engineUsed: storageEngine(), n, mb: (bytes / 1048576).toFixed(1), line };
      });
      if (info.engineUsed !== engine) {
        // the boot preflight downgraded (OPFS not openable here) — not a failure, a finding
        const why = await P.evaluate(async () => (await import('/src/lib/syncLog.ts')).getSyncLog().map((e) => e.msg).filter((m) => /OPFS unavailable/.test(m)).pop() ?? '');
        R.note(`${engineName}: ${engine} not available — device fell back to ${info.engineUsed} (${why})`);
        R.ok(`fallback still reached a first sync (${info.n} records)`, info.n > 0);
        await ctx.close();
        return;
      }
      R.ok(`device really ran on ${engine}`, info.engineUsed === engine);
      // Read workload: what the field home and the Days list run, 5×
      const read = await P.evaluate(async () => {
        const { db } = await import('/src/db/index.ts');
        const { myDayIds } = await import('/src/lib/mine.ts');
        const { getPowerSync } = await import('/src/db/powersync/client.ts');
        const t = performance.now();
        for (let i = 0; i < 5; i++) {
          await myDayIds();
          await db.jobs.toArray();
          await db.blastDays.orderBy('date').reverse().toArray();
          await getPowerSync().getAll(`SELECT id, json_extract(payload,'$.blastDayId') AS dayId FROM records WHERE table_name = 'blastLogs'`);
          await getPowerSync().getAll(`SELECT id, json_extract(payload,'$.blastLogId') AS logId, json_extract(payload,'$.totals.numHoles') AS numHoles FROM records WHERE table_name = 'shots'`);
        }
        return Math.round(performance.now() - t);
      });
      // Write workload: start a day and delete it, 10× (local latency only)
      const write = await P.evaluate(async () => {
        const { db } = await import('/src/db/index.ts');
        const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
        const { deleteDayCascade } = await import('/src/lib/lifecycle.ts');
        const jobs = await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray();
        const ids = [];
        const t = performance.now();
        for (let i = 0; i < 10; i++) {
          const id = await createBlastDay(jobs[0].id, undefined, undefined, { name: `S9 bench ${i}` });
          ids.push(id);
          const day = await db.blastDays.get(id);
          if (day) await deleteDayCascade(day);
        }
        return { ms: Math.round(performance.now() - t), ids };
      });
      createdDayIds = createdDayIds.concat(write.ids);
      results[engine] = { firstSyncMs, read, write: write.ms, n: info.n, mb: info.mb };
      R.note(`${engineName} · ${engine}: first sync ${(firstSyncMs / 1000).toFixed(1)}s for ${info.n} records (${info.mb} MB) · read workload ×5 ${read} ms · write workload ×10 ${write.ms} ms · log: "${info.line}"`);
      R.ok(`first sync completed on ${engine}`, info.n > 0);
      await lib.waitForUpload(P).catch(() => undefined);
      await sleep(500);
      await ctx.close();
    });
  }

  if (results.idb && results.opfs) {
    const ratio = (a, b) => (b > 0 ? (a / b).toFixed(2) : '∞');
    R.note(`${engineName} · OPFS vs IndexedDB — first sync ${ratio(results.idb.firstSyncMs, results.opfs.firstSyncMs)}× faster · reads ${ratio(results.idb.read, results.opfs.read)}× · writes ${ratio(results.idb.write, results.opfs.write)}×`);
  }
  // the bench days were deleted locally; make sure nothing lingers server-side
  const removed = await lib.cleanupAsAdmin(browser, { days: createdDayIds }).catch(() => -1);
  R.ok(`cleanup: ${removed} stray bench day(s) removed`, removed >= 0);
  return R.summary();
}

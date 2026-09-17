async (page, lib) => {
  // Round S20 — The field: copies that reach the office, sent-back logs, rigs on Mark complete, checklist hours, the shot plan following the drilling, incidents on the day (2026-09-17)
  const { mkCtx, signIn, skipTours, sleep, WEB, API, browserErrors, waitForUpload, daysAgo } = lib;
  const waitFor = async (fn, timeout = 20000, every = 300) => {
    const until = Date.now() + timeout;
    let last;
    while (Date.now() < until) {
      last = await fn().catch(() => undefined);
      if (last) return last;
      await sleep(every);
    }
    return last;
  };
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  browserErrors({ clear: true });
  const today = daysAgo(0);
  let dayId, shotId, blastLogId, readingId, attId, subId, drillLogId, oldDayId, ydayDayId, drillDayId, drillShotId;
  let jobA, jobB, rigs;

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);
  const cD = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PD = await cD.newPage();
  await signIn(PD, 'dinis');
  await skipTours(PD);

  // two jobs with no open day and no drill log today, plus the drills
  const picked = await PB.evaluate(async (today) => {
    const { db } = await import('/src/db/index.ts');
    // no open draft anywhere, and no day at all dated today: a day's id is deterministic per job+date, so a
    // filed leftover from an earlier run would come back instead of a fresh draft
    const open = new Set((await db.blastDays.filter((d) => (d.status === 'draft' && !d.closed) || d.date === today).toArray()).map((d) => d.jobId));
    const logsToday = new Set((await db.drillLogs.filter((l) => (l.date ?? l.createdAt.slice(0, 10)) === today).toArray()).map((l) => l.jobId));
    const free = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !open.has(j.id) && !logsToday.has(j.id) && !/^S1[124]/.test(j.name)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
    const drills = (await db.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill')).toArray()).sort((a, b) =>
      a.assetNumber.localeCompare(b.assetNumber, undefined, { numeric: true }),
    );
    return { jobs: free.slice(0, 2).map((j) => ({ id: j.id, name: j.name })), rigs: drills.map((e) => ({ id: e.id, asset: e.assetNumber })) };
  }, today);
  if (picked.jobs.length < 2 || picked.rigs.length === 0) throw new Error('need two jobs with no open day and at least one drill');
  [jobA, jobB] = picked.jobs;
  rigs = picked.rigs;
  R.note(`jobs: ${jobA.name} / ${jobB.name} · rig ${rigs[0].asset}`);

  const sigBlob = `(async () => { const c = document.createElement('canvas'); c.width = 200; c.height = 80; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 200, 80); g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, 50); g.lineTo(180, 30); g.stroke(); return new Promise((r) => c.toBlob(r, 'image/png')); })()`;

  await R.section('A filed blasting log with a seismo photo: the PDF counts the moment it lands, the stored photo is reused', async () => {
    // the blaster's day with a shot, a seismo reading and its printout photo — the photo already in storage on its own
    const made = await PB.evaluate(
      async ({ jobId, stamp, sigBlob }) => {
        const { db } = await import('/src/db/index.ts');
        const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
        const { addAttachmentFiles } = await import('/src/lib/attachments.ts');
        const { generateId, nowISO } = await import('/src/lib/utils.ts');
        const now = nowISO();
        const dayId = await createBlastDayWithPapers(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `s20 ${stamp}` });
        const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
        const shot = await db.shots.where('blastLogId').equals(log.id).first();
        const readingId = generateId();
        await db.seismoReadings.add({ id: readingId, shotId: shot.id, graphNumber: 2, seismographId: 'BE-1234', ppvTran: 0.12, ppvVert: 0.15, ppvLong: 0.1, peakVectorSum: 0.18, frequency: 31, airOverpressure: 120, maxAccelTran: 0, maxAccelVert: 0, maxAccelLong: 0, maxDisplacementTran: 0, maxDisplacementVert: 0, maxDisplacementLong: 0, operator: 'Barry', location: 'Route 3 pump house', notes: '', complianceStatus: 'compliant', createdAt: now, updatedAt: now, syncStatus: 'local' });
        const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d'); g.fillStyle = '#ddd'; g.fillRect(0, 0, 320, 240); g.fillStyle = '#000'; g.font = '20px sans-serif'; g.fillText('seismo printout', 20, 60);
        const jpeg = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
        const [attId] = await addAttachmentFiles(readingId, 'seismo_reading', [new File([jpeg], 'IMG_3911.jpeg', { type: 'image/jpeg' })], 'seismo_printout');
        // the photo reached storage on its own (as every Beta photo had)
        await db.attachments.update(attId, { storageStatus: 'stored', storageKey: `c/test/a/${attId}/IMG_3911.jpeg`, updatedAt: nowISO() });
        const sig = await eval(sigBlob);
        await db.blastLogs.update(log.id, { signatureImage: sig, signedAt: nowISO(), updatedAt: nowISO() });
        return { dayId, shotId: shot.id, blastLogId: log.id, readingId, attId };
      },
      { jobId: jobA.id, stamp, sigBlob },
    );
    ({ dayId, shotId, blastLogId, readingId, attId } = made);
    await waitForUpload(PB, 30000);
    await lib.finishPapers(PB, dayId);
    await PB.goto(`${WEB}/blast-day/${dayId}/submit`);
    await PB.locator('[data-preflight-file]').waitFor({ timeout: 20000 });
    await PB.locator('[data-preflight-file]').click();
    await PB.locator('[data-preflight-file]').click();
    await PB.waitForURL(new RegExp(`/blast-day/${dayId}$`), { timeout: 60000 });
    const sub = await waitFor(() => PB.evaluate(async (dayId) => {
      const { db } = await import('/src/db/index.ts');
      const s = await db.submissions.filter((x) => x.blastDayId === dayId && x.type === 'blast_log').first();
      return s ? { id: s.id, status: s.storageStatus, assets: s.assets } : null;
    }, dayId), 30000);
    subId = sub?.id;
    R.ok(`the blasting log filed with its photo (${sub?.assets?.length ?? 0} asset)`, Boolean(subId) && (sub?.assets?.length ?? 0) === 1);
    // reproduce Beta: the frozen photo copy is not on this device
    await PB.evaluate(async ({ subId, attId }) => {
      const { deleteLocalMedia } = await import('/src/lib/localMedia.ts');
      const { subAssetKey } = await import('/src/lib/archive.ts');
      await deleteLocalMedia(subAssetKey(subId, attId));
    }, { subId, attId });
    // storage is not configured locally: stand in for it — presign hands out a key, the PUT is accepted
    const cors = { 'access-control-allow-origin': 'http://localhost:5199', 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'PUT, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization' };
    await PB.route('**/files/presign-upload', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ url: `${API}/__s20_put`, key: `c/test/a/${body.attachmentId}/${body.fileName}` }) });
    });
    await PB.route('**/__s20_put', (route) => route.fulfill({ status: 200, headers: cors, body: '' }));
    const after = await waitFor(async () => {
      const r = await PB.evaluate(async (subId) => {
        const { runFileUploader } = await import('/src/lib/fileUploader.ts');
        await runFileUploader();
        const { db } = await import('/src/db/index.ts');
        const s = await db.submissions.get(subId);
        return s?.storageStatus === 'stored' ? { status: s.storageStatus, pdfKey: s.pdfKey, assetKeys: s.assetKeys ?? {} } : null;
      }, subId);
      return r;
    }, 30000, 700);
    await PB.unroute('**/files/presign-upload');
    await PB.unroute('**/__s20_put');
    R.ok('the copy reads "stored" with its PDF pointer once the PDF is up', after?.status === 'stored' && typeof after?.pdfKey === 'string' && after.pdfKey.includes('sub-pdf-'));
    R.ok('the photo was not waited for: it points at the attachment already in storage', after?.assetKeys?.[attId] === `c/test/a/${attId}/IMG_3911.jpeg`);
  });

  await R.section("The copy carries each attachment's context", async () => {
    const ctx = await PB.evaluate(async (subId) => (await (await import('/src/db/index.ts')).db.submissions.get(subId))?.assets?.[0]?.context, subId);
    R.ok(`where it hangs: "${ctx?.hangsOn ?? ''}"`, /Shot \d+ › Seismo reading 2/.test(ctx?.hangsOn ?? '') && /pump house/.test(ctx?.hangsOn ?? '') && /PPV 0\.18/.test(ctx?.hangsOn ?? ''));
    R.ok('its kind, who took it and when ride along', ctx?.kind === 'seismo_printout' && typeof ctx?.capturedAt === 'string' && ctx.capturedAt.length > 10);
  });

  await R.section('Mark complete needs a rig', async () => {
    // a day of its own for the drilling: the §1 day is filed, and a filed day's family is locked
    const made = await PB.evaluate(
      async ({ jobId, stamp }) => {
        const { db } = await import('/src/db/index.ts');
        const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
        const dayId = await createBlastDayWithPapers(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `s20 drill ${stamp}` });
        const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
        const shot = await db.shots.where('blastLogId').equals(log.id).first();
        return { dayId, shotId: shot.id };
      },
      { jobId: jobB.id, stamp },
    );
    drillDayId = made.dayId;
    drillShotId = made.shotId;
    await waitForUpload(PB, 30000);
    // the driller starts the shot's drill log with no rig, logs two holes and signs
    await waitFor(() => PD.evaluate(async ({ dayId, shotId }) => { const { db } = await import('/src/db/index.ts'); return Boolean((await db.blastDays.get(dayId)) && (await db.shots.get(shotId))); }, { dayId: drillDayId, shotId: drillShotId }), 40000);
    drillLogId = await PD.evaluate(async ({ shotId, dayId, jobId, sigBlob }) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const shot = await db.shots.get(shotId);
      const logId = await createDrillLog(shot, dayId, jobId);
      const now = nowISO();
      for (let i = 1; i <= 2; i++) await db.drillLogHoles.add({ id: generateId(), drillLogId: logId, date: todayISO(), holeNumber: String(i), angle: 0, actualDepth: 20, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local' });
      const sig = await eval(sigBlob);
      await db.drillLogs.update(logId, { drillRigEquipmentId: undefined, signatureImage: sig, updatedAt: now });
      return logId;
    }, { shotId: drillShotId, dayId: drillDayId, jobId: jobB.id, sigBlob });
    // the day's card gate asks once per job-day (S13) — answer it on the day first, or its
    // replace-navigation remounts the log page and takes the open sheet with it
    await PD.goto(`${WEB}/blast-day/${drillDayId}`);
    await PD.locator('[data-tile="rigs"]').waitFor({ timeout: 40000 });
    await PD.goto(`${WEB}/blast-day/${drillDayId}/drill-log/${drillLogId}`);
    await PD.locator('[data-log-complete-bottom]').waitFor({ timeout: 30000 });
    await sleep(800);
    await PD.locator('[data-log-complete-bottom]').click();
    await PD.locator('[data-log-complete-rig]').waitFor({ timeout: 10000 });
    const ask = (await PD.locator('[data-log-complete-rig]').textContent()) || '';
    R.ok(`the sheet asks "Which rig drilled it?"`, ask.includes('Which rig drilled it?'));
    const btn = PD.locator('[data-log-complete-confirm]');
    await btn.waitFor({ state: 'attached', timeout: 10000 });
    R.ok('the button waits: "Pick the rig first", disabled', (await btn.isDisabled()) && /Pick the rig first/.test((await btn.textContent()) || ''));
    await PD.locator('[data-log-complete-rig-select]').selectOption(rigs[0].id);
    await waitFor(async () => ((await btn.isDisabled()) ? null : 1), 10000);
    R.ok(`with the rig picked the button reads Complete`, !(await btn.isDisabled()) && /^Complete/.test(((await btn.textContent()) || '').trim()));
    await btn.click();
    await PD.waitForURL(new RegExp(`/blast-day/${drillDayId}(\\?|$)`), { timeout: 20000 });
    const log = await PD.evaluate(async (id) => { const l = await (await import('/src/db/index.ts')).db.drillLogs.get(id); return { status: l?.status, rig: l?.drillRigEquipmentId }; }, drillLogId);
    R.ok('the log is complete with its rig', log.status === 'complete' && log.rig === rigs[0].id);
    await waitForUpload(PD, 30000);
  });

  await R.section('A sent-back drill log shows on Drilling and the home', async () => {
    // the blaster sends it back with a note from Review drilling
    await waitFor(() => PB.evaluate(async (id) => ((await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.status === 'complete' ? 1 : null), drillLogId), 30000);
    await PB.goto(`${WEB}/blast-day/${drillDayId}?view=drilling`);
    await PB.locator('[data-review-sendback]').first().waitFor({ timeout: 30000 });
    await PB.locator('[data-review-sendback]').first().click();
    await PB.locator('[data-review-sendback-sheet]').waitFor({ timeout: 10000 });
    const box = PB.locator(`[data-review-sendback-log="${drillLogId}"]`);
    if ((await box.count()) && !(await box.isChecked().catch(() => true))) await box.check();
    await PB.locator('[data-review-sendback-note]').fill(`s20 ${stamp}: holes 1–2 read 20′, the plan says 22′`);
    await PB.locator('[data-review-sendback-go]').click();
    await waitForUpload(PB, 30000);
    await waitFor(() => PD.evaluate(async (id) => ((await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.sentBackAt ? 1 : null), drillLogId), 30000);
    await PD.goto(`${WEB}/drilling`);
    await PD.locator('[data-sent-back-band]').waitFor({ timeout: 30000 });
    const band = (await PD.locator('[data-sent-back-band]').textContent()) || '';
    R.ok(`Drilling opens on "Sent back to you" with the note: "${band.slice(0, 90)}"`, /Sent back to you · 1/.test(band) && band.includes(`s20 ${stamp}`) && /2 holes/.test(band));
    R.ok('the band is the first thing on the page', (await PD.evaluate(() => { const b = document.querySelector('[data-sent-back-band]'); const a = document.querySelector('[data-plans-sent], .rounded-xl.border-2.border-navy'); return !a || b.getBoundingClientRect().top < a.getBoundingClientRect().top; })));
    await PD.goto(`${WEB}/`);
    await PD.locator('[data-driller-home] [data-sent-back-band]').waitFor({ timeout: 30000 });
    R.ok('the home carries the same band, first', (await PD.locator('[data-driller-home] > :first-child').getAttribute('data-sent-back-band')) !== null);
    R.ok('it is not also listed under Plans sent to you', (await PD.locator(`[data-plan-start="${drillLogId}"]`).count()) === 0);
    // open the log from the band, mark it complete again — the band goes
    await PD.locator(`[data-sent-back="${drillLogId}"]`).click();
    await PD.locator('[data-log-complete-bottom]').waitFor({ timeout: 30000 });
    await PD.locator('[data-log-complete-bottom]').click();
    await PD.locator('[data-log-complete-confirm]').waitFor({ timeout: 10000 });
    await PD.locator('[data-log-complete-confirm]').click();
    // opened sideways from the home's band, finishing lands back on the home (the navigation round's rule)
    await PD.waitForURL((u) => !u.pathname.includes('/drill-log/'), { timeout: 20000 });
    await PD.goto(`${WEB}/drilling`);
    await sleep(1500);
    R.ok('marked complete again, the band is gone', (await PD.locator('[data-sent-back-band]').count()) === 0);
    await waitForUpload(PD, 30000);
  });

  await R.section('Needs attention is one line, with the age setting', async () => {
    const cA = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
    const PA = await cA.newPage();
    await signIn(PA, 'mark');
    await skipTours(PA);
    const setStale = async (n) => {
      await PA.goto(`${WEB}/admin/company`);
      await PA.locator('[data-home-stale-days]').waitFor({ timeout: 30000 });
      await PA.locator('[data-home-stale-days]').fill(String(n));
      await PA.locator('[data-home-stale-days]').press('Tab');
      await waitForUpload(PA, 30000);
      const seen = await waitFor(() => PB.evaluate(async (n) => ((await (await import('/src/db/index.ts')).db.companySettings.get('companySettings-singleton'))?.homeStaleDraftDays === n ? 1 : null), n), 40000);
      return Boolean(seen);
    };
    R.ok('the company setting starts at 2 days', await setStale(2));
    const ids = await PB.evaluate(async ({ jobId, stamp, old, yday }) => {
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      const oldId = await createBlastDayWithPapers(jobId, old, undefined, { typeOfWork: 'drill_to_blast', name: `s20 old ${stamp}` });
      const ydayId = await createBlastDayWithPapers(jobId, yday, undefined, { typeOfWork: 'drill_to_blast', name: `s20 yday ${stamp}` });
      return { oldId, ydayId };
    }, { jobId: jobB.id, stamp, old: daysAgo(5), yday: daysAgo(1) });
    ({ oldId: oldDayId, ydayId: ydayDayId } = ids);
    await PB.goto(`${WEB}/`);
    await PB.locator('[data-attention-drafts]').waitFor({ timeout: 30000 });
    const line = (await PB.locator('[data-attention-drafts]').textContent()) || '';
    R.ok(`the drafts fold into one line: "${line.slice(0, 60)}"`, /unfiled day/.test(line) && /oldest/.test(line));
    R.ok('no draft row is listed before the tap', (await PB.locator(`[data-attention-row="dr-${oldDayId}"]`).count()) === 0);
    await PB.locator('[data-attention-drafts]').click();
    await PB.locator('[data-attention-drafts-open]').waitFor({ timeout: 5000 });
    if ((await PB.locator(`[data-attention-row="dr-${oldDayId}"]`).count()) !== 1) {
      const diag = await PB.evaluate(async (id) => {
        const { db } = await import('/src/db/index.ts');
        const d = await db.blastDays.get(id);
        return { day: d ? { status: d.status, date: d.date, closed: d.closed, by: d.authorUserId ?? null, sendBack: d.sendBackNote ?? null } : null, rows: [...document.querySelectorAll('[data-attention-row]')].map((e) => e.getAttribute('data-attention-row')).slice(0, 12), scope: document.querySelector('[data-home-scope]')?.getAttribute('data-home-scope') };
      }, oldDayId);
      R.note(`diag: ${JSON.stringify(diag)}`);
    }
    R.ok('open, the five-day-old draft is listed', (await PB.locator(`[data-attention-row="dr-${oldDayId}"]`).count()) === 1);
    R.ok("yesterday's draft is not — it is just work in progress", (await PB.locator(`[data-attention-row="dr-${ydayDayId}"]`).count()) === 0);
    // the company setting: an admin counts a draft as unfiled only after 10 days
    R.ok('an admin sets it to 10 days in Admin › Company and the blaster\'s device hears it', await setStale(10));
    await PB.goto(`${WEB}/`);
    await PB.locator('[data-today-empty], [data-needs-attention], [data-home-scope]').first().waitFor({ timeout: 30000 });
    await sleep(1200);
    if (await PB.locator('[data-attention-drafts]').count()) await PB.locator('[data-attention-drafts]').click();
    R.ok('at 10 days the five-day-old draft no longer counts', (await PB.locator(`[data-attention-row="dr-${oldDayId}"]`).count()) === 0);
    R.ok('back to 2 days', await setStale(2));
    await cA.close();
  });

  await R.section('The screen tours are gone; Help keeps About this screen', async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    await PB.locator('aside [data-help-button]').waitFor({ timeout: 30000 });
    await PB.locator('aside [data-help-button]').click();
    await sleep(400);
    R.ok('no "Show me your work day" in the ? menu', (await PB.locator('[data-help-screen-tour]').count()) === 0);
    R.ok('About this screen is still there', (await PB.locator('[data-help-coach]').count()) >= 1);
    await PB.keyboard.press('Escape');
  });

  await R.section('Checklist hours: start and stop, one paper', async () => {
    R.note('push 2 — not built yet');
  });

  await R.section('The daily report reads rig hours from the checklist; File this day waits', async () => {
    R.note('push 2 — not built yet');
  });

  await R.section('The shot plan follows the accepted drilling', async () => {
    R.note('push 2 — not built yet');
  });

  await R.section('Incidents: the tile, the + door, Injury and Near miss, Do now and the call log', async () => {
    R.note('push 3 — not built yet');
  });

  await R.section('The office may file an incident; a refused write says so', async () => {
    R.note('push 3 — not built yet');
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId, drillDayId, oldDayId, ydayDayId].filter(Boolean), drillLogs: [drillLogId].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cB.close();
  await cD.close();
  return R.summary();
}

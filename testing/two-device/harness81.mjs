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
  let dayId, shotId, blastLogId, readingId, attId, subId, drillLogId, oldDayId, ydayDayId, drillDayId, drillShotId, chkId;
  let PA, cA2, seeded, injuryId, nearMissId;
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
    for (const c of await db.drillChecklists.filter((c) => c.date === today && Boolean(c.jobId)).toArray()) logsToday.add(c.jobId);
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
    // the local storage stand-in (lib): the PDF is accepted, the photo already sits in storage
    const stopStandIn = await lib.storageStandIn(PB, { tag: 's20' });
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
    await stopStandIn();
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
    await sleep(800);
    chkId = await PD.evaluate(async ({ rigId, date, jobId }) => { const { db } = await import('/src/db/index.ts'); return (await db.drillChecklists.filter((c) => c.equipmentId === rigId && c.date === date && c.jobId === jobId).toArray())[0]?.id; }, { rigId: rigs[0].id, date: today, jobId: jobB.id });
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

  await R.section('Checklist hours: start and stop, one paper — saved in the morning, nothing "running"', async () => {
    // leftovers: a checklist is one per rig per job-day, so earlier runs' checklists for this rig today go first
    const stale = await PB.evaluate(async ({ rigId, date }) => (await (await import('/src/db/index.ts')).db.drillChecklists.filter((c) => c.equipmentId === rigId && c.date === date).toArray()).map((c) => c.id), { rigId: rigs[0].id, date: today });
    if (stale.length) {
      await lib.cleanupAsAdmin(browser, { checklists: stale, sweep: false });
      await waitFor(() => PD.evaluate(async ({ rigId, date }) => ((await (await import('/src/db/index.ts')).db.drillChecklists.filter((c) => c.equipmentId === rigId && c.date === date).toArray()).length === 0 ? 1 : null), { rigId: rigs[0].id, date: today }), 30000);
      R.note(`cleared ${stale.length} leftover checklist(s) for ${rigs[0].asset} today`);
    }
    // the driller starts the checklist from the drilling day's own tile (jobB, today) with only the start hours —
    // through the door, as he does, so Save's "back" knows the day is behind it
    await PD.goto(`${WEB}/blast-day/${drillDayId}`);
    await PD.locator('[data-rig-start]').waitFor({ timeout: 30000 });
    await PD.locator('[data-rig-start]').click();
    await PD.waitForURL(/\/drill-checklist\?/, { timeout: 15000 });
    await PD.locator('[data-rig-field]').waitFor({ timeout: 30000 });
    const chip = PD.locator(`[data-rig-chip="${rigs[0].asset}"]`);
    if (!(await chip.first().isVisible().catch(() => false))) { await PD.locator('[data-rig-all-toggle]').click(); await chip.first().waitFor({ timeout: 5000 }); }
    await chip.first().click();
    await PD.locator('[data-chk-hours-box]').waitFor({ timeout: 15000 });
    R.ok('the hours box has Start and Stop side by side', (await PD.locator('[data-chk-hours]').count()) === 1 && (await PD.locator('[data-chk-stop-hours]').count()) === 1);
    await PD.locator('[data-chk-hours]').fill('1500');
    await sleep(300);
    const btn = PD.locator('[data-chk-file]');
    R.ok(`with no stop hours the button saves for later: "${((await btn.innerText()) || '').trim().slice(0, 50)}"`, (await btn.getAttribute('data-chk-file-mode')) === 'save' && /Save checklist/.test(await btn.innerText()));
    await btn.click();
    await PD.waitForURL(new RegExp(`/blast-day/${drillDayId}(\\?|$)`), { timeout: 20000 });
    await waitForUpload(PD, 30000);
    await PD.locator('[data-tile="rigs"][data-tile-state="open"]').waitFor({ timeout: 30000 });
    const row = (await PD.locator(`[data-rig-row="${rigs[0].asset}"]`).innerText()) || '';
    R.ok(`saving lands on the day; the rig row reads "stop hours missing", never "running" ("${row.replace(/\s+/g, ' ').slice(0, 70)}")`, /walk-around/.test(row) && /stop hours missing/.test(row) && !/running/i.test(row));
    R.ok('the tile counts it as waiting', /waiting for stop hours/.test((await PD.locator('[data-tile="rigs"]').innerText()) || ''));
    await PD.locator(`[data-rig-row="${rigs[0].asset}"]`).click();
    await PD.locator('[data-rig-sheet]').waitFor({ timeout: 10000 });
    R.ok('the rig sheet offers "Enter the stop hours", not Stop for the day', /Enter the stop hours/.test((await PD.locator('[data-rig-stop]').innerText()) || '') && !/Stop for the day/.test((await PD.locator('[data-rig-sheet]').innerText()) || ''));
    await PD.keyboard.press('Escape');
    // the driller's home (S24): the rig line says "stop hours missing"; no "Enter … stop hours" button
    await PD.goto(`${WEB}/`);
    await PD.locator('[data-driller-home]').waitFor({ timeout: 30000 });
    await waitForUpload(PD, 20000);
    const card = PD.locator(`[data-job-day="${drillDayId}"]`);
    await card.waitFor({ timeout: 20000 });
    R.ok(`the home card's rig line reads "stop hours missing", with no stop-hours button (S24)`, /stop hours missing/.test((await card.innerText()) || '') && (await PD.locator('[data-rig-stop-prompt]').count()) === 0);
  });

  await R.section('The daily report waits on the driller for the stop hours (no Remind since S24); File this day waits; then the row reads the hours', async () => {
    await waitFor(() => PB.evaluate(async ({ rigId, date }) => { const { db } = await import('/src/db/index.ts'); return (await db.drillChecklists.filter((c) => c.equipmentId === rigId && c.date === date).toArray()).length ? 1 : null; }, { rigId: rigs[0].id, date: today }), 30000);
    await PB.goto(`${WEB}/blast-day/${drillDayId}?view=daily-report`);
    const waiting = PB.locator(`[data-rig-stop-waiting="${rigs[0].asset}"]`);
    await waiting.waitFor({ timeout: 30000 });
    R.ok(`the blaster's report row waits: "${((await waiting.innerText()) || '').replace(/\s+/g, ' ').slice(0, 70)}"`, /stop hours not entered yet/.test(await waiting.innerText()) && /waiting on/.test(await waiting.innerText()) && (await PB.locator('[data-rig-meter-enter]').count()) === 0);
    R.ok('the row has no Remind (S24: the blaster sees it and calls)', (await PB.locator('[data-rig-stop-remind]').count()) === 0);
    await PB.goto(`${WEB}/blast-day/${drillDayId}/submit`);
    await PB.locator('[data-preflight-item]').first().waitFor({ timeout: 30000 });
    const amber = PB.locator('[data-preflight-item^="rigstop-"]');
    R.ok(`File this day carries an amber line: "${((await amber.first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 60)}"`, (await amber.count()) === 1 && (await amber.first().getAttribute('data-preflight-level')) === 'amber');
    // the driller completes the paper through the report's own door
    await PD.goto(`${WEB}/blast-day/${drillDayId}?view=daily-report`);
    const door = PD.locator(`[data-rig-stop-door="${rigs[0].asset}"]`);
    await door.waitFor({ timeout: 30000 });
    await door.click();
    await PD.locator('[data-chk-complete-panel]').waitFor({ timeout: 20000 });
    await PD.locator('[data-chk-stop-hours]').fill('1499');
    await PD.locator('[data-chk-complete]').click();
    await PD.locator('[data-chk-stop-error]').waitFor({ timeout: 5000 });
    R.ok('a stop below the start is refused', /can't be below/.test((await PD.locator('[data-chk-stop-error]').innerText()) || ''));
    await PD.locator('[data-chk-stop-hours]').fill('1507.5');
    await PD.locator('[data-chk-complete]').click();
    await PD.waitForURL(/\/drill-checklist-file\//, { timeout: 20000 });
    await PD.locator('button:has-text("Done")').first().waitFor({ timeout: 30000 });
    await waitForUpload(PD, 30000);
    await waitFor(() => PB.evaluate(async ({ rigId, date }) => { const { db } = await import('/src/db/index.ts'); const c = (await db.drillChecklists.filter((c) => c.equipmentId === rigId && c.date === date).toArray())[0]; return c?.stopHours === 1507.5 ? 1 : null; }, { rigId: rigs[0].id, date: today }), 40000);
    await PB.goto(`${WEB}/blast-day/${drillDayId}?view=daily-report`);
    const rowB = PB.locator(`[data-derived-rig="${rigs[0].asset}"]`);
    await rowB.waitFor({ timeout: 30000 });
    R.ok(`the blaster's row now reads the hours ("${((await rowB.innerText()) || '').replace(/\s+/g, ' ').slice(0, 60)}")`, /1500.*→.*1507\.5/.test(((await rowB.innerText()) || '').replace(/,/g, '')) && (await PB.locator('[data-rig-stop-waiting]').count()) === 0);
    // the rig list lives on the driller's day (the blaster reads the hours on the report)
    await PD.goto(`${WEB}/blast-day/${drillDayId}`);
    await PD.locator('[data-tile="rigs"][data-tile-state="complete"]').waitFor({ timeout: 30000 });
    R.ok('the driller\'s day tile reads complete with the hours used', /7\.5 h · filed/.test((await PD.locator(`[data-rig-row="${rigs[0].asset}"]`).innerText()) || ''));
  });

  await R.section('The shot plan follows the accepted drilling; the deviations are named', async () => {
    // the blaster lays a 2×3 plan with timing on holes 1–3; the driller drills 1–5 (3 short), skips 6, adds 7
    const shotId2 = await PB.evaluate(async ({ dayId }) => {
      const { db } = await import('/src/db/index.ts');
      const { serializeDiagram } = await import('/src/lib/shotDiagram.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const diagram = { rows: 2, cols: 3, delays: {}, wires: [{ from: 0, to: 1 }, { from: 1, to: 2 }], start: { hole: 0, leadMs: 0 }, interHoleMs: 25, plan: { defaultDepth: 20, overrides: {} } };
      await db.shots.update(shot.id, { designPlan: { ...shot.designPlan, shotDiagramData: serializeDiagram(diagram) }, totals: { ...shot.totals, avgDrillDepth: 20 }, updatedAt: nowISO() });
      return shot.id;
    }, { dayId: drillDayId });
    await waitForUpload(PB, 20000);
    await waitFor(() => PD.evaluate(async (id) => { const s = await (await import('/src/db/index.ts')).db.shots.get(id); return s?.designPlan?.shotDiagramData?.includes('"rows":2') ? 1 : null; }, shotId2), 30000);
    // the driller's log on this shot already exists from §3 (2 holes) — reshape it to the story
    await PD.evaluate(async ({ logId, rigId }) => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO, todayISO } = await import('/src/lib/utils.ts');
      const now = nowISO();
      for (const h of await db.drillLogHoles.where('drillLogId').equals(logId).toArray()) await db.drillLogHoles.delete(h.id);
      const add = (n, depth, extra = {}) => db.drillLogHoles.add({ id: generateId(), drillLogId: logId, date: todayISO(), holeNumber: String(n), angle: 0, actualDepth: depth, plannedDepth: 20, plannedAngle: 0, subdrill: 1, conditions: [], comment: '', createdAt: now, updatedAt: now, syncStatus: 'local', ...extra });
      await add(1, 20); await add(2, 20); await add(3, 18); await add(4, 20); await add(5, 20); await add(6, 0, { skipped: true }); await add(7, 20);
      await db.drillLogs.update(logId, { drillRigEquipmentId: rigId, status: 'complete', completedAt: now, updatedAt: now });
    }, { logId: drillLogId, rigId: rigs[0].id });
    await waitForUpload(PD, 30000);
    await waitFor(() => PB.evaluate(async (id) => ((await (await import('/src/db/index.ts')).db.drillLogHoles.where('drillLogId').equals(id).toArray()).length === 7 ? 1 : null), drillLogId), 40000);
    // the blaster accepts the drilling
    await PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts'); await db.drillLogs.update(id, { status: 'accepted', acceptedAt: nowISO(), updatedAt: nowISO() }); }, drillLogId);
    await PB.goto(`${WEB}/blast-day/${drillDayId}/design/${shotId2}?mode=timing`);
    const line = PB.locator('[data-as-drilled="current"]');
    await line.waitFor({ timeout: 30000 });
    R.ok(`the pattern line reads as drilled, with the count and the time ("${((await line.innerText()) || '').replace(/\s+/g, ' ').slice(0, 80)}")`, /as drilled/.test(await line.innerText()) && /of 6 holes/.test(await line.innerText()) && /accepted/.test(await line.innerText()));
    R.ok('there is no "Build timing from drilling" button any more', (await PB.locator('[data-use-drilled]').count()) === 0 && !/Build timing from drilling/.test((await PB.textContent('body')) || ''));
    await PB.locator('[data-drilling-deviations]').waitFor({ timeout: 15000 });
    const dev = async (k) => ((await PB.locator(`[data-drilling-deviation="${k}"]`).innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
    R.ok(`the added hole is named ("${(await dev('added')).slice(0, 60)}")`, /Hole 7 was added/.test(await dev('added')));
    R.ok(`the short hole is named with both depths ("${(await dev('depth-18|20')).slice(0, 60)}")`, /Hole 3 is drilled 18′, the plan says 20′/.test(await dev('depth-18|20')));
    R.ok(`the drilled holes with no delay are named ("${(await dev('no-delay')).slice(0, 60)}")`, /2 drilled holes have no delay yet \(4, 5\)/.test(await dev('no-delay')));
    R.ok('nothing is red: the timing kept its delays on drilled holes and dropped the skipped one', (await PB.locator('[data-deviation-level="red"]').count()) === 0);
    await sleep(1500); // the auto-laid pattern flushes to the record
    // Check and sign carries the same, amber
    await PB.goto(`${WEB}/blast-day/${drillDayId}?view=check`);
    const item = PB.locator(`[data-check-item="dev-${shotId2}"]`);
    await item.waitFor({ timeout: 30000 });
    R.ok(`Check and sign names the deviations, amber ("${((await item.innerText()) || '').replace(/\s+/g, ' ').slice(0, 70)}")`, (await item.getAttribute('data-check-level')) === 'amber' && /3 drilling deviations/.test(await item.innerText()));
  });

  await R.section('Incidents: the tile, the + door, Injury and Near miss, Do now and the call log', async () => {
    // the office's rows and the site's town rows the Do now list reads (an admin writes both)
    cA2 = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
    PA = await cA2.newPage();
    await signIn(PA, 'mark');
    await skipTours(PA);
    seeded = await PA.evaluate(async ({ jobId }) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO, generateId } = await import('/src/lib/utils.ts');
      const cs = await db.companySettings.get('companySettings-singleton');
      const prevOffice = cs?.officeContacts ?? [];
      await db.companySettings.update('companySettings-singleton', { officeContacts: [{ id: generateId(), label: 'Injury (s20)', name: 'Evette', phone: '413-583-4440' }, { id: generateId(), label: 'Incident (s20)', name: 'Evette', phone: '413-583-4440' }, ...prevOffice.filter((c) => !/\(s20\)$/.test(c.label))], updatedAt: nowISO() });
      const job = await db.jobs.get(jobId);
      const site = job?.siteId ? await db.sites.get(job.siteId) : null;
      const prevSite = site?.contacts ?? [];
      if (site) await db.sites.update(site.id, { contacts: [{ id: generateId(), role: 'hospital', label: 'Hospital (911)', name: 'Lahey Hospital', phone: '781-372-7000' }, { id: generateId(), role: 'urgent_care', label: 'Urgent Care Facility', name: 'CareWell Lexington', phone: '781-590-3329' }, ...prevSite.filter((c) => !/Lahey|CareWell/.test(c.name))], updatedAt: nowISO() });
      return { siteId: site?.id ?? null, prevOffice, prevSite };
    }, { jobId: jobB.id });
    await waitForUpload(PA, 30000);
    await waitFor(() => PB.evaluate(async () => ((await (await import('/src/db/index.ts')).db.companySettings.get('companySettings-singleton'))?.officeContacts?.some((c) => c.label === 'Injury (s20)') ? 1 : null)), 40000);
    // the day's tile
    await PB.goto(`${WEB}/blast-day/${drillDayId}`);
    const tile = PB.locator('[data-tile="incidents"]');
    await tile.waitFor({ timeout: 30000 });
    R.ok(`the day has an Incidents tile: "${((await tile.innerText()) || '').replace(/\s+/g, ' ').slice(0, 60)}"`, /None today/.test(await tile.innerText()) && /Report an incident/.test(await tile.innerText()));
    await tile.locator('[data-tile-action]').click();
    await PB.locator('[data-report-incident]').waitFor({ timeout: 10000 });
    R.ok('the sheet knows the day and asks the kind — Injury and Near miss are among them', (await PB.locator('[data-report-incident-days]').count()) === 0 && (await PB.locator('[data-report-incident-kind="injury"]').count()) === 1 && (await PB.locator('[data-report-incident-kind="near_miss"]').count()) === 1);
    await PB.locator('[data-report-incident-kind="injury"]').click();
    await PB.waitForURL(/\/incident\/[0-9a-f-]+$/, { timeout: 15000 });
    injuryId = PB.url().match(/\/incident\/([0-9a-f-]+)$/)?.[1];
    const rec = await PB.evaluate(async (id) => { const i = await (await import('/src/db/index.ts')).db.incidents.get(id); return { type: i?.type, day: i?.blastDayId, job: i?.jobId, customer: i?.customerId, site: i?.siteId }; }, injuryId);
    R.ok('the incident carries the day, its job, customer and site', rec.type === 'injury' && rec.day === drillDayId && rec.job === jobB.id && Boolean(rec.customer) && Boolean(rec.site));
    await PB.locator('[data-do-now="injury"]').waitFor({ timeout: 15000 });
    // the job, its site and the company's rows are live queries — the names arrive a beat after the strip
    await waitFor(async () => (/Evette/.test((await PB.locator('[data-do-now-step="injury"]').innerText().catch(() => '')) || '') ? 1 : null), 20000);
    await waitFor(async () => (/Lahey/.test((await PB.locator('[data-do-now-step="hospital"]').innerText().catch(() => '')) || '') ? 1 : null), 20000);
    const injuryStep = (await PB.locator('[data-do-now-step="injury"]').innerText()) || '';
    R.ok(`Do now names the office's Injury contact from the sheet ("${injuryStep.replace(/\s+/g, ' ').slice(0, 60)}")`, /Call Evette 413-583-4440/.test(injuryStep));
    const hospStep = (await PB.locator('[data-do-now-step="hospital"]').innerText()) || '';
    R.ok(`…and the site's hospital ("${hospStep.replace(/\s+/g, ' ').slice(0, 60)}")`, /Lahey Hospital 781-372-7000/.test(hospStep));
    // Call: the phone would dial; here the tap is what we can see — it records the confirmation with the time
    await PB.evaluate(() => { const a = document.querySelector('[data-do-now-call="injury"]'); a.addEventListener('click', (e) => e.preventDefault(), { once: true }); a.click(); });
    await PB.locator('[data-do-now-when="injury"]').waitFor({ timeout: 10000 });
    R.ok(`the tap is logged as called, with the time ("${((await PB.locator('[data-do-now-when="injury"]').innerText()) || '').trim()}")`, /called \d{1,2}:\d{2}/.test((await PB.locator('[data-do-now-when="injury"]').innerText()) || ''));
    await PB.locator('[data-do-now-confirm="scene"]').click();
    await PB.locator('[data-do-now-when="scene"]').waitFor({ timeout: 10000 });
    R.ok('Done logs a plain confirmation', /done \d{1,2}:\d{2}/.test((await PB.locator('[data-do-now-when="scene"]').innerText()) || ''));
    await PB.locator('[data-injury-name]').fill('Lisa Vital');
    await PB.locator('[data-injury-body-part]').fill('left wrist');
    await PB.locator('textarea').first().fill(`s20 ${stamp}: slipped on the mat pile at 10:40, landed on the left wrist`);
    await sleep(800);
    await PB.getByRole('button', { name: /Send to Office/ }).click();
    await PB.waitForURL(new RegExp(`/incident/${injuryId}$`), { timeout: 40000 });
    await waitFor(() => PB.evaluate(async (id) => ((await (await import('/src/db/index.ts')).db.incidents.get(id))?.status === 'office_review' ? 1 : null), injuryId), 30000);
    const filed = await PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const s = (await db.submissions.filter((x) => x.type === 'incident' && x.sourceId === id).toArray())[0]; return s ? { day: s.blastDayId, job: s.jobId, title: s.title } : null; }, injuryId);
    R.ok(`Send to Office files the report as a paper of the day ("${filed?.title ?? ''}")`, filed?.day === drillDayId && filed?.job === jobB.id && /Injury Report/.test(filed?.title ?? ''));
    await PB.goto(`${WEB}/incident/${injuryId}/print`);
    await PB.locator('[data-print-call-log]').waitFor({ timeout: 20000 });
    R.ok('the printed report carries "Who was told, and when"', /Evette/.test(await PB.locator('[data-print-call-log]').innerText()) && /Call Evette/.test(await PB.locator('[data-print-call-log]').innerText()));
    await PB.goto(`${WEB}/blast-day/${drillDayId}`);
    await tile.waitFor({ timeout: 30000 });
    R.ok(`the day's tile counts it ("${((await tile.innerText()) || '').replace(/\s+/g, ' ').slice(0, 70)}")`, /1 · Injury/.test(await tile.innerText()) && /sent to the office/.test(await tile.innerText()));
    // the home's + offers Report an incident, and asks which day
    await PB.goto(`${WEB}/`);
    await PB.locator('[data-tour="fab"]').waitFor({ timeout: 20000 });
    await PB.locator('[data-tour="fab"]').click();
    await PB.locator('[data-fab-menu]').waitFor({ timeout: 10000 });
    R.ok('the + offers Start a day and Report an incident', (await PB.locator('[data-fab-start-day]').count()) === 1 && (await PB.locator('[data-fab-report-incident]').count()) === 1);
    await PB.locator('[data-fab-report-incident]').click();
    await PB.locator('[data-report-incident-days]').waitFor({ timeout: 10000 });
    await PB.locator(`[data-report-incident-day="${drillDayId}"]`).waitFor({ timeout: 10000 }).catch(() => undefined); // the day list is a live query
    R.ok('it asks which day, with today\'s and "Not tied to a work day"', (await PB.locator(`[data-report-incident-day="${drillDayId}"]`).count()) === 1 && (await PB.locator('[data-report-incident-day="none"]').count()) === 1);
    await PB.locator('[data-report-incident] button:has-text("Close")').click();
  });

  await R.section('The office may file an incident, and sees the field\'s in review', async () => {
    const cO = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
    const PO = await cO.newPage();
    await signIn(PO, 'office');
    await skipTours(PO);
    await PO.goto(`${WEB}/admin/incidents`);
    await PO.locator('[data-admin-new-incident]').waitFor({ timeout: 30000 });
    await waitFor(async () => (/Injury/.test((await PO.locator('main').innerText().catch(() => '')) || '') ? 1 : null), 30000);
    R.ok('the office list shows the blaster\'s injury in review', /Injury/.test((await PO.locator('main').innerText()) || '') && /office review|In office review/.test((await PO.locator('main').innerText()) || ''));
    await PO.locator('[data-admin-new-incident]').click();
    await PO.locator('[data-report-incident-days]').waitFor({ timeout: 10000 });
    await PO.locator('[data-report-incident-day="none"]').click();
    await PO.locator('[data-report-incident-kind="near_miss"]').click();
    await PO.waitForURL(/\/incident\/[0-9a-f-]+$/, { timeout: 15000 });
    nearMissId = PO.url().match(/\/incident\/([0-9a-f-]+)$/)?.[1];
    await PO.locator('[data-incident-near-miss]').waitFor({ timeout: 15000 });
    await PO.locator('textarea').first().fill(`s20 ${stamp}: office-filed near miss`);
    await waitForUpload(PO, 30000);
    // the server accepted it: the blaster's device receives it (Sep 16: the office's creates were refused by role)
    const arrived = await waitFor(() => PB.evaluate(async (id) => ((await (await import('/src/db/index.ts')).db.incidents.get(id)) ? 1 : null), nearMissId), 40000);
    R.ok('the office\'s incident is accepted by the server and reaches the field', arrived === 1);
    await cO.close();
  });

  await R.section('A plan painted on the big grid is the painted holes (Beta, Sep 17: 12 became 50)', async () => {
    // a second shot on the drill day: 12 holes painted on the default 5 × 10 grid, no "All holes" depth,
    // and the shot carries an average drill depth of 12 — exactly Mark's Lex Terrace plan
    const shotId3 = await PB.evaluate(async ({ dayId }) => {
      const { db } = await import('/src/db/index.ts');
      const { addShot } = await import('/src/hooks/useBlastDay.ts');
      const { serializeDiagram } = await import('/src/lib/shotDiagram.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const id = await addShot(log.id);
      const shot = await db.shots.get(id);
      const overrides = {};
      for (const idx of [0, 1, 2, 3, 10, 11, 12, 13, 20, 21, 22, 23]) overrides[idx] = { depth: 12 };
      const diagram = { rows: 5, cols: 10, delays: {}, wires: [], interHoleMs: 25, plan: { overrides } };
      await db.shots.update(id, { designPlan: { ...shot.designPlan, shotDiagramData: serializeDiagram(diagram) }, totals: { ...shot.totals, avgDrillDepth: 12 }, updatedAt: nowISO() });
      return id;
    }, { dayId: drillDayId });
    await PB.goto(WEB + '/blast-day/' + drillDayId + '/design/' + shotId3 + '?mode=plan');
    await PB.locator('[data-plan-hole-count]').waitFor({ timeout: 30000 });
    const count = await PB.locator('[data-plan-hole-count]').getAttribute('data-plan-hole-count');
    R.ok('the editor counts the painted holes, not the grid (' + count + ' holes to drill)', count === '12');
    const leftOut = await PB.locator('[data-grid-hole][aria-label*="left out"]').count();
    R.ok('the other 38 positions draw as unused (' + leftOut + ')', leftOut === 38);
    R.ok('the plan says so in words', /Only the 12 painted holes are the plan/.test((await PB.locator('[data-plan-painted-note]').innerText().catch(() => '')) || ''));
    const footer = ((await PB.locator('[data-plan-footer]').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
    R.ok('the footer sends a 12-hole plan ("' + footer.slice(0, 40) + '")', /Plan ready · 12 holes/.test(footer));
    // the driller's view of the same shot reads the same plan
    const drillerSees = await PD.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      const { getShotPlan } = await import('/src/hooks/useDrillLogs.ts');
      const until = Date.now() + 20000;
      while (Date.now() < until) { const s = await db.shots.get(id); if (s?.designPlan?.shotDiagramData?.includes('"rows":5')) return getShotPlan(s)?.length ?? 0; await new Promise((r) => setTimeout(r, 400)); }
      return -1;
    }, shotId3);
    R.ok('the driller gets 12 holes, numbered 1–12 (' + drillerSees + ')', drillerSees === 12);
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    if (PA && seeded) {
      await PA.evaluate(async ({ seeded, ids }) => {
        const { db, deleteWithTombstone } = await import('/src/db/index.ts');
        const { nowISO } = await import('/src/lib/utils.ts');
        await db.companySettings.update('companySettings-singleton', { officeContacts: seeded.prevOffice, updatedAt: nowISO() });
        if (seeded.siteId) await db.sites.update(seeded.siteId, { contacts: seeded.prevSite, updatedAt: nowISO() });
        for (const id of ids.filter(Boolean)) if (await db.incidents.get(id)) await deleteWithTombstone('incidents', id);
      }, { seeded, ids: [injuryId, nearMissId] }).catch(() => undefined);
      await waitForUpload(PA, 30000).catch(() => undefined);
      await cA2.close();
    }
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId, drillDayId, oldDayId, ydayDayId].filter(Boolean), drillLogs: [drillLogId].filter(Boolean), checklists: [chkId].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cB.close();
  await cD.close();
  return R.summary();
}

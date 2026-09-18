async (page, lib) => {
  // Round S23 — Drilling over days: the pattern as a paper of the job, one drill log per pattern, the shot from the drilled pattern (2026-09-18)
  // Push 1 (§1–§4): Monday the blaster draws the pattern from the + and sends it; the day's Drill plan tile
  // reads its state; the driller Continues ONE drill log over days with the rig on every hole and changes
  // rigs mid-pattern; a second driller's part joins the count; the pattern turns Drilled by itself at the
  // full count; the blaster's home shows the pace and Accept the drill log files the parts; the rig
  // checklist is one screen whose Complete needs start, stop and signature, and File this day waits for it.
  const { mkCtx, signIn, skipTours, sleep, WEB, browserErrors, waitForUpload } = lib;
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
  const today = new Date().toISOString().slice(0, 10);
  browserErrors({ clear: true });
  let dayId, planId, planId2, partId, partId2, shotId, jobA, meB, meD, rigs;

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);
  const cD = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PD = await cD.newPage();
  await signIn(PD, 'dinis');
  await skipTours(PD);
  meB = await PB.evaluate(async () => (await import('/src/lib/session.ts')).getSessionUser());
  meD = await PD.evaluate(async () => (await import('/src/lib/session.ts')).getSessionUser());

  // a job with a site and no day today (one day per job per date; filed days from earlier runs stay),
  // picked from the END of the list so older harnesses' pickers never meet it
  const picked = await PB.evaluate(async (today) => {
    const { db } = await import('/src/db/index.ts');
    const open = new Set((await db.blastDays.filter((d) => (d.status === 'draft' && !d.closed) || d.date === today).toArray()).map((d) => d.jobId));
    // a pattern with parts cannot be deleted (accepted logs are records), so earlier runs leave theirs
    // behind — this run wants a job with no pattern at all
    const planned = new Set((await db.drillPlans.filter((p) => !p.archivedAt).toArray()).map((p) => p.jobId));
    const free = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !open.has(j.id) && !planned.has(j.id) && j.siteId && !/^S1[124]/.test(j.name)).toArray()).sort((a, b) => b.name.localeCompare(a.name));
    return free.slice(2, 3).map((j) => ({ id: j.id, name: j.name }));
  }, today);
  if (picked.length < 1) throw new Error('need a job with a site and no day today');
  [jobA] = picked;
  // the dev fleet has one active rock drill; a retired H33-RIG is woken as the admin for the rig change
  // (harness72 does the same) and put back at cleanup
  const RIG2 = '8aceb1cb';
  {
    const cM = await mkCtx(browser);
    const PM = await cM.newPage();
    await signIn(PM, 'mark');
    await PM.evaluate(async (prefix) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const rig = (await db.equipment.toArray()).find((e) => e.id.startsWith(prefix));
      if (rig && !(rig.isActive && (rig.status ?? 'active') === 'active')) await db.equipment.update(rig.id, { isActive: true, status: 'active', updatedAt: nowISO() });
    }, RIG2);
    await waitForUpload(PM, 30000);
    await cM.close();
  }
  rigs = await waitFor(() => PB.evaluate(async (prefix) => {
    const { db } = await import('/src/db/index.ts');
    const all = (await db.equipment.filter((e) => e.isActive && e.category === 'rock_drill' && (e.status ?? 'active') === 'active').toArray()).sort((a, b) => a.assetNumber.localeCompare(b.assetNumber, undefined, { numeric: true }));
    const second = all.find((e) => e.id.startsWith(prefix));
    const first = all.find((e) => !e.id.startsWith(prefix));
    return first && second ? [first, second].map((e) => ({ id: e.id, asset: e.assetNumber, meter: e.hourMeter ?? 0 })) : null;
  }, RIG2), 40000);
  if (!rigs || rigs.length < 2) throw new Error('need two active rock drills');
  R.note(`job: ${jobA.name} · rigs ${rigs[0].asset}, ${rigs[1].asset} · blaster ${meB.name} · driller ${meD.name}`);
  // leftover checklists for these rigs today would collide (one per rig per job-day)
  const stale = await PB.evaluate(async ({ ids, date }) => (await (await import('/src/db/index.ts')).db.drillChecklists.filter((c) => ids.includes(c.equipmentId) && c.date === date).toArray()).map((c) => c.id), { ids: rigs.map((r) => r.id), date: today });
  if (stale.length) { await lib.cleanupAsAdmin(browser, { checklists: stale, sweep: false }); R.note(`cleared ${stale.length} leftover checklist(s)`); }

  await R.section("The pattern as a paper of the job · the Drill plan tile · the +", async () => {
    // Monday: the blaster plans the drilling from the + — no blasting log, no day needed
    await PB.goto(`${WEB}/`);
    await PB.locator('[data-tour="fab"]').waitFor({ timeout: 30000 });
    await PB.locator('[data-tour="fab"]').click();
    await PB.locator('[data-fab-plan-drilling]').waitFor({ timeout: 10000 });
    await PB.locator('[data-fab-plan-drilling]').click();
    await PB.locator('[data-plan-drilling-sheet]').waitFor({ timeout: 10000 });
    await PB.locator('[data-plan-drilling-search]').fill(jobA.name.slice(0, 12));
    await PB.locator(`[data-plan-drilling-job="${jobA.id}"]`).click();
    await PB.waitForURL(/\/drill-plan\//, { timeout: 20000 });
    await PB.locator('[data-plan-page]').waitFor({ timeout: 20000 });
    planId = await PB.locator('[data-plan-page]').getAttribute('data-plan-page');
    R.ok('the + plans the drilling at a job: a new pattern, a paper of the job, Draft', (await PB.locator('[data-plan-page]').getAttribute('data-plan-word')) === 'Draft' && (await PB.locator('[data-plan-grid-editable]').getAttribute('data-plan-grid-editable')) === '1');
    // 4 × 11 at 20 ft = 44 holes (the numbers, as the editor would write them)
    await PB.evaluate(async ({ planId, stamp }) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      await db.drillPlans.update(planId, { name: `Bench 1 ${stamp}`, rows: 4, cols: 11, defaultDepth: 20, holeDiameter: 3.5, burden: 6, spacing: 7, updatedAt: nowISO() });
    }, { planId, stamp });
    await waitFor(async () => (/44 holes/.test((await PB.locator('[data-plan-header-line]').innerText()) || '') ? 1 : null), 10000);
    // Send it — to Dinis
    await PB.locator('[data-plan-send]').click();
    await PB.locator('[data-send-drillers]').waitFor({ timeout: 10000 });
    await PB.locator(`[data-send-driller="${meD.name}"]`).check();
    await PB.locator('[data-send-go]').click();
    await waitFor(async () => ((await PB.locator('[data-plan-page]').getAttribute('data-plan-word')) === 'Sent' ? 1 : null), 15000);
    const sent = ((await PB.locator('[data-plan-sent]').innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
    R.ok(`sent: the paper says when, to whom, by whom ("${sent.slice(0, 70)}")`, (await PB.locator('[data-plan-page]').getAttribute('data-plan-word')) === 'Sent' && new RegExp(`to ${meD.name}`).test(sent) && new RegExp(`by ${meB.name}`).test(sent));
    partId = await PB.evaluate(async ({ planId, userId }) => (await (await import('/src/db/index.ts')).db.drillLogs.filter((l) => l.drillPlanId === planId && l.drillerUserId === userId).first())?.id, { planId, userId: meD.id });
    R.ok('one drill log for the pattern: Dinis has his part', Boolean(partId));
    await waitForUpload(PB, 30000);
    // the day's tile reads the pattern's state (the blaster's day at the job)
    dayId = await PB.evaluate(async ({ jobId, stamp }) => {
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      return createBlastDay(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: `s23 ${stamp}` });
    }, { jobId: jobA.id, stamp });
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    const tile = PB.locator('[data-tile="drill-plan"]');
    await tile.waitFor({ timeout: 30000 });
    R.ok(`the day's Drill plan tile reads the pattern's state: "${((await tile.innerText()) || '').replace(/\s+/g, ' ').slice(0, 70)}"`, /Sent/.test(await tile.innerText()) && new RegExp(`to ${meD.name.split(/\s+/)[0]}`).test(await tile.innerText()));
    await tile.locator('[data-tile-action]').click();
    await PB.waitForURL(new RegExp(`/drill-plan/${planId}`), { timeout: 15000 });
    R.ok('the tile opens the pattern', true);
    await waitForUpload(PB, 30000);
  });

  await R.section('One drill log per pattern · Continue · parts and signatures · rigs on every hole · Change rig', async () => {
    // the driller: the pattern is under Assigned to you on Drilling (door B); its row opens his part
    await waitFor(() => PD.evaluate(async (id) => (Boolean(await (await import('/src/db/index.ts')).db.drillLogs.get(id)) ? 1 : null), partId), 40000);
    await PD.goto(`${WEB}/drilling`);
    await PD.locator(`[data-plan-start="${partId}"], button:has-text("${'Bench 1 ' + stamp}")`).first().waitFor({ timeout: 30000 });
    await PD.locator(`[data-plan-start="${partId}"], button:has-text("${'Bench 1 ' + stamp}")`).first().click();
    await PD.waitForURL(new RegExp(`/log/${partId}`), { timeout: 20000 });
    await PD.locator('[data-log-end-of-day]').waitFor({ timeout: 30000 });
    R.ok('the part opens with the end-of-day buttons (Done for today · My part is done), no Mark complete', (await PD.locator('[data-log-done-today]').count()) === 1 && (await PD.locator('[data-log-part-done]').count()) === 1 && (await PD.locator('[data-log-complete-bottom]').count()) === 0);
    // his rig, then three holes to plan
    await PD.locator('[data-log-rig]').selectOption(rigs[0].id);
    await waitFor(() => PD.evaluate(async ({ id, rigId }) => ((await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.drillRigEquipmentId === rigId ? 1 : null), { id: partId, rigId: rigs[0].id }), 10000);
    for (let i = 0; i < 3; i++) {
      await PD.locator('[data-add-hole]').waitFor({ timeout: 10000 });
      await waitFor(async () => (!(await PD.locator('[data-add-hole]').isDisabled()) ? 1 : null), 10000);
      await PD.locator('[data-add-hole]').click();
      await sleep(500);
    }
    const holesA = await waitFor(() => PD.evaluate(async (id) => { const hs = (await (await import('/src/db/index.ts')).db.drillLogHoles.where('drillLogId').equals(id).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); return hs.length === 3 ? hs.map((h) => ({ n: h.holeNumber, rig: h.rigAsset, who: h.drillerName, date: h.date })) : null; }, partId), 15000);
    R.ok(`three holes, each carrying the driller, the rig and the date (${JSON.stringify(holesA)})`, Array.isArray(holesA) && holesA.every((h) => h.rig === rigs[0].asset && h.who === meD.name && h.date === today));
    // Change rig: the old rig has no checklist today, so only the new rig's checklist opens
    await PD.locator('[data-log-change-rig]').click();
    await PD.locator('[data-log-rig-change-sheet]').waitFor({ timeout: 10000 });
    await PD.locator('[data-log-rig-change-to]').selectOption(rigs[1].id);
    await PD.locator('[data-log-rig-change-go]').click();
    await PD.waitForURL(new RegExp(`/drill-checklist/${rigs[1].id}`), { timeout: 20000 });
    await PD.locator('[data-chk-hours-box]').waitFor({ timeout: 30000 });
    R.ok(`Change rig opens ${rigs[1].asset}'s checklist for its start hours`, /\?job=/.test(PD.url()));
    const start2 = Math.ceil(Math.max(rigs[1].meter, 0)) + 10;
    await PD.locator('[data-chk-hours]').fill(String(start2));
    await sleep(300);
    R.ok('the morning save asks start hours and the checks only (Save · stop hours later)', (await PD.locator('[data-chk-file]').getAttribute('data-chk-file-mode')) === 'save');
    await PD.locator('[data-chk-file]').click();
    await PD.waitForURL(new RegExp(`/log/${partId}`), { timeout: 20000 }).catch(() => undefined);
    if (!new RegExp(`/log/${partId}`).test(PD.url())) await PD.goto(`${WEB}/jobs/${jobA.id}/drill-plan/${planId}/log/${partId}`);
    await PD.locator('[data-log-end-of-day]').waitFor({ timeout: 30000 });
    R.ok(`the log now names the change (${((await PD.locator('[data-log-rig-changes]').innerText().catch(() => '')) || '').trim()})`, (await PD.locator('[data-log-rig-changes]').count()) === 1 && new RegExp(`${rigs[0].asset} → ${rigs[1].asset}`).test((await PD.locator('[data-log-rig-changes]').innerText()) || ''));
    await waitFor(async () => (!(await PD.locator('[data-add-hole]').isDisabled()) ? 1 : null), 10000);
    await PD.locator('[data-add-hole]').click();
    const hole4 = await waitFor(() => PD.evaluate(async (id) => { const hs = (await (await import('/src/db/index.ts')).db.drillLogHoles.where('drillLogId').equals(id).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); return hs.length === 4 ? hs[3].rigAsset : null; }, partId), 15000);
    R.ok(`the fourth hole carries the new rig (${hole4})`, hole4 === rigs[1].asset);
    await waitForUpload(PD, 30000);
    // a second driller's part: the blaster sends the pattern to Mark, whose part drills two holes
    const mark = (await lib.apiLogin(PB, 'mark')).user;
    partId2 = await PB.evaluate(async ({ planId, mark }) => {
      const { db } = await import('/src/db/index.ts');
      const { sendPlan } = await import('/src/hooks/useDrillPlans.ts');
      const { addHole } = await import('/src/hooks/useDrillLogs.ts');
      const plan = await db.drillPlans.get(planId);
      await sendPlan(plan, [{ userId: mark.id, name: mark.name }]);
      const part = await db.drillLogs.filter((l) => l.drillPlanId === planId && l.drillerUserId === mark.id).first();
      if (!part) throw new Error('no part for Mark');
      for (const n of ['5', '6']) await addHole(part, { holeNumber: n, actualDepth: 20, angle: 0, subdrill: 1, conditions: n === '6' ? [{ fromFt: 8, toFt: 8, code: 'W' }] : [], comment: '', plannedDepth: 20 });
      return part.id;
    }, { planId, mark: { id: mark.id, name: mark.name } });
    await waitForUpload(PB, 30000);
    // Dinis's log header reads the whole pattern
    const line = await waitFor(async () => { const t = ((await PD.locator('[data-log-header-line]').innerText()) || '').replace(/\s+/g, ' '); return /pattern 6 of 44/.test(t) ? t : null; }, 40000);
    R.ok(`the part's header reads the pattern's count across drillers: "${(line || '').slice(0, 90)}"`, /pattern 6 of 44 · you 4 · Mark 2/.test(line || ''));
    // the end of the day: the buttons wait for the rig checklist (saved this morning, no stop hours, unsigned)
    const gate = PD.locator('[data-log-checklist-gate]');
    await gate.waitFor({ timeout: 15000 });
    R.ok(`Done for today and My part is done wait for the checklist: "${((await gate.innerText()) || '').replace(/\s+/g, ' ').slice(0, 80)}"`, (await gate.getAttribute('data-log-checklist-gate')) === 'incomplete' && /stop hours and signature/.test(await gate.innerText()) && (await PD.locator('[data-log-done-today]').isDisabled()) && (await PD.locator('[data-log-part-done]').isDisabled()));
    await waitForUpload(PD, 30000);
  });

  await R.section('The rig checklist as one screen · Complete needs start, stop and signature · the log\'s end of day waits for it', async () => {
    // the gate's line opens the same checklist — the one screen — for the stop hours and the signature
    await PD.locator('[data-log-checklist-gate]').click();
    await PD.waitForURL(new RegExp(`/drill-checklist/${rigs[1].id}`), { timeout: 20000 });
    await PD.locator('[data-chk-continuing]').waitFor({ timeout: 30000 });
    R.ok('the morning checklist opens as the form it was saved from — no separate stop-hours panel', (await PD.locator('[data-chk-complete-panel]').count()) === 0 && (await PD.locator('[data-chk-hours-box]').count()) === 1 && /walk-around saved/.test(await PD.locator('[data-chk-continuing]').innerText()));
    const start2 = Number(await PD.locator('[data-chk-hours]').inputValue());
    await PD.locator('[data-chk-stop-hours]').fill(String(start2 + 6.5));
    await sleep(300);
    R.ok('with the stop hours the button reads Complete, and says what is still missing', (await PD.locator('[data-chk-file]').getAttribute('data-chk-file-mode')) === 'complete' && /signature/.test((await PD.locator('[data-chk-missing]').innerText().catch(() => '')) || ''));
    await PD.locator('[data-chk-complete]').click();
    await PD.locator('[data-chk-sign-error]').waitFor({ timeout: 5000 });
    R.ok('Complete without the signature is refused', /Sign it/.test(await PD.locator('[data-chk-sign-error]').innerText()));
    // File this day waits for it too: the driller's own checklist is a red line
    const drillerDay = await PD.evaluate(async ({ jobId, date }) => (await (await import('/src/db/index.ts')).db.blastDays.filter((d) => d.jobId === jobId && d.date === date).first())?.id, { jobId: jobA.id, date: today });
    R.ok('the driller has a job-day at the pattern\'s job today (his checklist and card live on it)', Boolean(drillerDay));
    await PD.goto(`${WEB}/blast-day/${drillerDay}/submit`);
    await PD.locator('[data-preflight]').waitFor({ timeout: 30000 });
    const red = PD.locator('[data-preflight-item^="checklist-"]');
    R.ok(`File this day carries a red line for his incomplete checklist: "${((await red.first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 80)}"`, (await red.count()) === 1 && (await red.first().getAttribute('data-preflight-level')) === 'red' && /stop hours|signature/.test((await red.first().innerText()) || ''));
    // back on the checklist: sign, complete — it files
    await PD.goto(`${WEB}/drill-checklist/${rigs[1].id}?job=${jobA.id}&date=${today}&day=${drillerDay}`);
    await PD.locator('[data-chk-continuing]').waitFor({ timeout: 30000 });
    await PD.locator('[data-chk-stop-hours]').fill(String(start2 + 6.5));
    await lib.signPad(PD);
    await PD.locator('[data-chk-complete]').click();
    await PD.waitForURL(/\/drill-checklist-file\//, { timeout: 20000 });
    await PD.locator('button:has-text("Done")').first().waitFor({ timeout: 30000 });
    const done = await PD.evaluate(async ({ rigId, date }) => { const c = (await (await import('/src/db/index.ts')).db.drillChecklists.filter((c) => c.equipmentId === rigId && c.date === date).toArray())[0]; return c ? { stop: c.stopHours, signed: Boolean(c.signatureImage), filed: Boolean(c.filedAt) } : null; }, { rigId: rigs[1].id, date: today });
    R.ok(`signed and complete, the checklist files (${JSON.stringify(done)})`, done && done.stop === start2 + 6.5 && done.signed && done.filed);
    await waitForUpload(PD, 30000);
    await PD.goto(`${WEB}/blast-day/${drillerDay}/submit`);
    await PD.locator('[data-preflight]').waitFor({ timeout: 30000 });
    R.ok('the red line is gone from File this day', (await PD.locator('[data-preflight-item^="checklist-"]').count()) === 0);
    // and the part's end-of-day buttons are live again
    await PD.goto(`${WEB}/jobs/${jobA.id}/drill-plan/${planId}/log/${partId}`);
    await PD.locator('[data-log-end-of-day]').waitFor({ timeout: 30000 });
    await waitFor(async () => ((await PD.locator('[data-log-checklist-gate]').count()) === 0 ? 1 : null), 15000);
    R.ok('with the checklist complete, Done for today and My part is done are live', (await PD.locator('[data-log-checklist-gate]').count()) === 0 && !(await PD.locator('[data-log-done-today]').isDisabled()));
    await PD.locator('[data-log-done-today]').click();
    await PD.waitForURL((u) => !u.pathname.includes(`/log/${partId}`), { timeout: 15000 });
    const still = await PD.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.drillLogs.get(id))?.status, partId);
    R.ok('Done for today leaves the part open for tomorrow', still === 'open');
  });

  await R.section("Drilled by itself · the blaster's home with the pace · Accept the drill log", async () => {
    // the blaster's home: Drilling now, with the count and the pace
    await PB.goto(`${WEB}/`);
    const row = PB.locator(`[data-drilling-row="${planId}"]`);
    await row.waitFor({ timeout: 30000 });
    R.ok(`the home's Drilling band: "${((await row.innerText()) || '').replace(/\s+/g, ' ').slice(0, 100)}"`, (await row.getAttribute('data-drilling-word')) === 'Drilling' && /6 of 44/.test(await row.innerText()) && /at this pace, drilled/.test(await row.innerText()));
    const pace = await PB.evaluate(async (id) => (await (await import('/src/hooks/useDrillPlans.ts')).planProgress(id))?.pace, planId);
    R.ok(`the pace: ${pace?.perDay} holes a day so far, ${pace?.remaining} to go, drilled ${pace?.expectedWord}`, pace && pace.remaining === 38 && pace.expected > today);
    // Mark's part drills through to hole 43 (as his device would)
    await PB.evaluate(async (partId) => {
      const { db } = await import('/src/db/index.ts');
      const { addHole } = await import('/src/hooks/useDrillLogs.ts');
      const part = await db.drillLogs.get(partId);
      for (let n = 7; n <= 43; n++) await addHole(part, { holeNumber: String(n), actualDepth: 20, angle: 0, subdrill: 1, conditions: [], comment: '', plannedDepth: 20 });
    }, partId2);
    await waitForUpload(PB, 60000);
    // Dinis continues from his home card (door A) and drills the last hole — the pattern turns Drilled by itself
    await waitFor(() => PD.evaluate(async (id) => ((await (await import('/src/hooks/useDrillPlans.ts')).planProgress(id))?.drilling.totalHoles === 43 ? 1 : null), planId), 60000);
    await PD.goto(`${WEB}/`);
    await PD.locator('[data-driller-home]').waitFor({ timeout: 30000 });
    const cont = PD.locator(`[data-job-day-continue="${partId}"]`);
    await cont.waitFor({ timeout: 30000 });
    R.ok('the home card offers Continue drilling straight into his part (door A)', true);
    await cont.click();
    await PD.waitForURL(new RegExp(`/log/${partId}`), { timeout: 15000 });
    await PD.locator('[data-add-hole]').waitFor({ timeout: 30000 });
    await waitFor(async () => (/44/.test(await PD.locator('[data-hole-number]').inputValue()) ? 1 : null), 15000);
    await PD.locator('[data-add-hole]').click();
    const drilled = await waitFor(() => PD.evaluate(async (id) => { const p = await (await import('/src/db/index.ts')).db.drillPlans.get(id); return p?.status === 'complete' && p.drilledAt ? 1 : null; }, planId), 20000);
    R.ok('hole 44 in: the pattern turns Drilled by itself, with the time', drilled === 1);
    await PD.locator('[data-log-plan-drilled]').waitFor({ timeout: 15000 });
    R.ok('his log says the pattern is drilled', /pattern is drilled/.test(await PD.locator('[data-log-plan-drilled]').innerText()));
    // he signs his part once — My part is done
    await PD.locator('[data-log-part-done]').click();
    await PD.locator('[data-log-complete-confirm]').waitFor({ state: 'attached', timeout: 10000 });
    await lib.signPad(PD, PD.locator('[data-log-complete-signature]'));
    await waitFor(async () => (!(await PD.locator('[data-log-complete-confirm]').isDisabled()) ? 1 : null), 10000);
    R.ok('the button reads "My part is done"', /My part is done/.test((await PD.locator('[data-log-complete-confirm]').innerText()) || ''));
    await PD.locator('[data-log-complete-confirm]').click();
    await PD.waitForURL((u) => !u.pathname.includes(`/log/${partId}`), { timeout: 20000 });
    const signed = await PD.evaluate(async (id) => { const l = await (await import('/src/db/index.ts')).db.drillLogs.get(id); return l ? { status: l.status, signed: Boolean(l.signatureImage) } : null; }, partId);
    R.ok('his part is signed complete, once', signed?.status === 'complete' && signed?.signed);
    await waitForUpload(PD, 30000);
    // Mark signs his (as his device would); the blaster's home says Drilled and waiting; Accept files both parts
    await PB.evaluate(async (partId) => { const { db } = await import('/src/db/index.ts'); const { nowISO } = await import('/src/lib/utils.ts'); const c = document.createElement('canvas'); c.width = 200; c.height = 80; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 200, 80); g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 40); g.lineTo(190, 40); g.stroke(); const sig = await new Promise((r) => c.toBlob(r, 'image/png')); await db.drillLogs.update(partId, { status: 'complete', completedAt: nowISO(), signatureImage: sig, updatedAt: nowISO() }); }, partId2);
    await waitFor(() => PB.evaluate(async (id) => ((await (await import('/src/hooks/useDrillPlans.ts')).planProgress(id))?.waiting === 2 ? 1 : null), planId), 40000);
    await PB.goto(`${WEB}/`);
    await row.waitFor({ timeout: 30000 });
    R.ok(`the home reads Drilled and waiting: "${((await row.innerText()) || '').replace(/\s+/g, ' ').slice(0, 90)}"`, (await row.getAttribute('data-drilling-word')) === 'Drilled' && /2 parts to accept/.test(await row.innerText()));
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    const tile = PB.locator('[data-tile="drill-plan"]');
    await tile.waitFor({ timeout: 30000 });
    R.ok(`the day's tile reads Drilled ("${((await tile.innerText()) || '').replace(/\s+/g, ' ').slice(0, 60)}")`, /Drilled/.test(await tile.innerText()) && /44 of 44/.test(await tile.innerText()));
    await row.click().catch(() => undefined);
    await PB.goto(`${WEB}/jobs/${jobA.id}/drill-plan/${planId}`);
    await PB.locator('[data-plan-review]').waitFor({ timeout: 30000 });
    R.ok('the review names the water hole first', (await PB.locator('[data-plan-water]').count()) === 1 && /1 wet/.test(await PB.locator('[data-plan-water]').innerText()));
    R.ok('the pattern is locked once drilled (the grid is read-only; Change the plan is the door)', (await PB.locator('[data-plan-grid-editable]').getAttribute('data-plan-grid-editable')) === '0');
    await PB.locator('[data-plan-accept]').waitFor({ timeout: 15000 });
    R.ok('Accept the drill log is one tap for both signed parts', /2 parts signed/.test(await PB.locator('[data-plan-accept]').innerText()));
    await PB.locator('[data-plan-accept]').click();
    // push 2: ONE office copy per pattern — the sheet with every part's holes and signatures, under the first part
    const accepted = await waitFor(() => PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const parts = await db.drillLogs.filter((l) => l.drillPlanId === id).toArray(); const subs = await db.submissions.filter((s) => s.type === 'drill_log' && parts.some((p) => p.id === s.sourceId)).toArray(); return parts.every((p) => p.status === 'accepted') && subs.length === 1 ? { parts: parts.length, subs: subs.length, title: subs[0].title } : null; }, planId), 60000);
    R.ok(`both parts accepted and ONE office copy filed with the pattern (${JSON.stringify(accepted)})`, accepted?.parts === 2 && accepted?.subs === 1 && /Bench 1/.test(accepted?.title ?? ''));
    R.ok('the pattern still reads Drilled — Shot waits for the shot', (await waitFor(async () => ((await PB.locator('[data-plan-page]').getAttribute('data-plan-word')) === 'Drilled' ? 'Drilled' : null), 10000)) === 'Drilled');
    await waitForUpload(PB, 30000);
  });

  await R.section('Friday · the shot from one pattern or several · the three doors', async () => {
    // door A: the day's tile offers the shot from the drilled, accepted pattern
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    const makeShot = PB.locator(`[data-plan-make-shot="${planId}"]`);
    await makeShot.waitFor({ timeout: 30000 });
    R.ok(`the Drill plan tile offers the shot: "${((await makeShot.innerText()) || '').trim()}"`, /Make Shot 1 from Bench 1/.test((await makeShot.innerText()) || ''));
    await makeShot.click();
    await PB.locator('[data-shot-pattern-facts]').first().waitFor({ timeout: 30000 });
    shotId = await PB.locator('[data-shot-pattern-facts]').first().evaluate((e) => e.closest('[data-shot-card]')?.getAttribute('data-shot-card') ?? '');
    const made = await PB.evaluate(async (planId) => { const { db } = await import('/src/db/index.ts'); const s = await db.shots.filter((x) => x.drillPlanId === planId).first(); return s ? { holes: s.totals.numHoles, ft: s.totals.totalDrillFootage, avg: s.totals.avgDrillDepth, dia: s.drillParams.holeDiameter, b: s.drillParams.burden, sp: s.drillParams.spacing, src: s.totalsSource, hasDiagram: /"rows":4/.test(s.designPlan.shotDiagramData ?? '') } : null; }, planId);
    R.ok(`the shot carries the pattern: ${JSON.stringify(made)}`, made && made.holes === 44 && made.ft === 880 && made.avg === 20 && made.dia === 3.5 && made.b === 6 && made.sp === 7 && made.src === 'drilling' && made.hasDiagram);
    const word = await PB.evaluate(async (id) => (await (await import('/src/hooks/useDrillPlans.ts')).planProgress(id))?.word, planId);
    R.ok(`one pattern, one shot: the pattern now reads ${word}`, word === 'Shot');
    // door C is gone for a pattern already shot
    await PB.goto(`${WEB}/jobs/${jobA.id}/drill-plan/${planId}`);
    await PB.locator('[data-plan-page]').waitFor({ timeout: 20000 });
    await waitFor(async () => ((await PB.locator('[data-plan-page]').getAttribute('data-plan-word')) === 'Shot' ? 1 : null), 15000);
    R.ok('the pattern page has no Make the shot door once shot', (await PB.locator('[data-plan-make-shot-door]').count()) === 0 && (await PB.locator('[data-plan-page]').getAttribute('data-plan-word')) === 'Shot');
    // door B: Add shot lists the job's patterns — a second, unsent one is listed but cannot be picked
    planId2 = await PB.evaluate(async ({ jobId, stamp }) => { const { createDrillPlan } = await import('/src/hooks/useDrillPlans.ts'); return createDrillPlan(jobId, `Bench 2 ${stamp}`); }, { jobId: jobA.id, stamp });
    await PB.goto(`${WEB}/blast-day/${dayId}?view=blast-log`);
    await PB.locator('[data-add-shot]').waitFor({ timeout: 30000 });
    await PB.locator('[data-add-shot]').click();
    await PB.locator('[data-pattern-pick-sheet]').waitFor({ timeout: 10000 });
    const row2 = PB.locator(`[data-pattern-pick="${planId2}"]`);
    await row2.waitFor({ timeout: 10000 });
    R.ok(`Add shot lists the second pattern, not pickable, with the reason ("${((await row2.innerText()) || '').replace(/\s+/g, ' ').slice(0, 60)}")`, (await row2.getAttribute('data-pattern-pick-ready')) === '0' && /draft/.test(await row2.innerText()) && (await PB.locator(`[data-pattern-pick="${planId}"]`).count()) === 0);
    await PB.locator('[data-pattern-pick-blank]').click();
    const two = await waitFor(() => PB.evaluate(async (dayId) => { const { db } = await import('/src/db/index.ts'); const log = await db.blastLogs.where('blastDayId').equals(dayId).first(); const n = log ? await db.shots.where('blastLogId').equals(log.id).count() : 0; return n === 2 ? n : null; }, dayId), 15000);
    R.ok('Drilled by others adds a blank second shot', two === 2);
    await waitForUpload(PB, 30000);
  });

  await R.section("The shot's drilling card · the blasting log's lines · the drill log sheet", async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}?view=blast-log`);
    const facts = PB.locator(`[data-shot-pattern-facts="${planId}"]`);
    await facts.waitFor({ timeout: 30000 });
    const fact = async (k) => ((await facts.locator(`[data-shot-fact="${k}"]`).innerText()) || '').replace(/\s+/g, ' ');
    R.ok(`the drilling card is facts: plan "${await fact('plan')}"`, /Bench 1/.test(await fact('plan')) && /Shot/.test(await fact('plan')));
    R.ok(`…the drill log's parts with rigs and signed dates: "${(await fact('log')).slice(0, 90)}"`, new RegExp(`${meD.name.split(/\\s+/)[0]}.*\\(${rigs[0].asset}, ${rigs[1].asset}\\).*signed`).test(await fact('log')) && /Mark/.test(await fact('log')));
    R.ok(`…the holes and footage: "${await fact('holes')}"`, /44 of 44 · 880 ft/.test(await fact('holes')));
    R.ok(`…off-plan and water: "${await fact('flags')}"`, /0 off-plan · 1 wet/.test(await fact('flags')));
    R.ok(`…who accepted: "${await fact('accepted')}"`, new RegExp(meB.name).test(await fact('accepted')));
    R.ok('no "Build the drill plan" door inside the shot', (await PB.locator('[data-build-plan-shot]').count()) === 0);
    // the second (blank) shot offers the job's patterns instead — open its card first
    const toggle2 = PB.locator('[data-shot-toggle]').nth(1);
    if ((await toggle2.getAttribute('data-shot-expanded')) === '0') await toggle2.click({ position: { x: 24, y: 16 } });
    await waitFor(async () => ((await toggle2.getAttribute('data-shot-expanded')) === '1' ? 1 : null), 5000);
    await PB.locator('[data-shot-from-pattern]').waitFor({ timeout: 10000 }).catch(() => undefined);
    R.ok('the blank shot offers "From a drilled pattern…" (the job has a pattern)', (await PB.locator('[data-shot-from-pattern]').count()) === 1);
    // the blasting log's printed drilling lines
    await PB.goto(`${WEB}/blast-day/${dayId}/print`);
    await PB.locator('[data-print-pattern-lines]').waitFor({ timeout: 30000 });
    const printText = ((await PB.locator('.page').first().innerText()) || '').replace(/\s+/g, ' ');
    R.ok('the printed blasting log carries the pattern lines: Drill plan, Drilled, Drill log, Holes drilled, Off-plan / water, Drilling accepted', /Drill plan:/.test(printText) && /Bench 1/.test(printText) && /Drill log:/.test(printText) && /Holes drilled:/.test(printText) && /44 of 44/.test(printText) && /Drilling accepted:/.test(printText));
    // the drill log sheet: one sheet per pattern, every part, Driller and Rig columns, a signature per part
    await PB.goto(`${WEB}/jobs/${jobA.id}/drill-plan/${planId}/log/${partId}/print`);
    await PB.locator('[data-print-pattern]').waitFor({ timeout: 30000 });
    await waitFor(async () => ((await PB.locator('[data-print-hole]').count()) === 44 ? 1 : null), 15000);
    const hole4 = PB.locator('[data-print-hole="4"]');
    R.ok('the sheet lists every hole of the pattern (44) with Driller and Rig columns', (await PB.locator('[data-print-hole]').count()) === 44 && (await PB.locator('[data-print-hole="1"] [data-print-hole-driller]').innerText()) === meD.name.split(/\s+/)[0] && (await hole4.locator('[data-print-hole-rig]').innerText()) === rigs[1].asset && (await PB.locator('[data-print-hole="5"] [data-print-hole-driller]').innerText()) === 'Mark');
    R.ok('one signature block per part, and the blaster\'s acceptance', (await PB.locator('[data-print-signatures]').getAttribute('data-print-signatures')) === '2' && (await PB.locator('[data-print-part]').count()) === 2 && (await PB.locator('[data-print-part] img').count()) === 2);
  });

  await R.section('One flow · Records lines and the pattern node · older shots as filed', async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}?view=walkthrough`);
    await PB.locator('[data-phase="plan"]').waitFor({ timeout: 30000 });
    const phase = ((await PB.locator('[data-phase="plan"]').innerText()) || '').replace(/\s+/g, ' ');
    R.ok(`the walkthrough's first step is the Pattern, done: "${phase.slice(0, 70)}"`, /Pattern/.test(phase) && /Bench 1/.test(phase) && /drilled/.test(phase));
    const cont = ((await PB.locator('[data-day-continue]').innerText().catch(() => '')) || '').trim();
    R.ok(`Continue never says "build the drill plan" ("${cont}")`, !/build the drill plan/i.test(cont));
    // Records: the pattern's own dated line and the pattern node in the tree with the plan and its parts
    await PB.goto(`${WEB}/records`);
    await PB.locator('[data-records-tree]').waitFor({ timeout: 30000 });
    const node = PB.locator(`[data-tree-node="p:${jobA.id}:${planId}"]`);
    await node.waitFor({ timeout: 20000 });
    R.ok(`the tree has a pattern node under the job: "${((await node.innerText()) || '').replace(/\s+/g, ' ')}"`, /Pattern · Bench 1/.test(await node.innerText()) && Number(await node.getAttribute('data-tree-count')) >= 3);
    await node.click();
    await PB.locator(`[data-records-row="dp-${planId}"]`).waitFor({ timeout: 20000 });
    const planRow = ((await PB.locator(`[data-records-row="dp-${planId}"]`).innerText()) || '').replace(/\s+/g, ' ');
    R.ok(`the pattern's own line, dated when sent, says Shot: "${planRow.slice(0, 90)}"`, /Bench 1/.test(planRow) && /Shot/.test(planRow) && (await PB.locator(`[data-records-row="dl-${partId}"]`).count()) === 1 && (await PB.locator(`[data-records-row="dl-${partId2}"]`).count()) === 1);
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const chks = await PB.evaluate(async ({ ids, date }) => (await (await import('/src/db/index.ts')).db.drillChecklists.filter((c) => ids.includes(c.equipmentId) && c.date === date).toArray()).map((c) => c.id), { ids: rigs.map((r) => r.id), date: today }).catch(() => []);
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId].filter(Boolean), drillLogs: [partId, partId2].filter(Boolean), drillPlans: [planId, planId2].filter(Boolean), checklists: chks }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
    // the woken rig goes back to retired
    const cM = await mkCtx(browser);
    const PM = await cM.newPage();
    await signIn(PM, 'mark');
    await PM.evaluate(async (prefix) => {
      const { db } = await import('/src/db/index.ts');
      const { nowISO } = await import('/src/lib/utils.ts');
      const rig = (await db.equipment.toArray()).find((e) => e.id.startsWith(prefix));
      if (rig) await db.equipment.update(rig.id, { isActive: false, status: 'retired', updatedAt: nowISO() });
    }, RIG2);
    await waitForUpload(PM, 30000);
    await cM.close();
  });
  await cD.close();
  await cB.close();
  return R.summary();
}

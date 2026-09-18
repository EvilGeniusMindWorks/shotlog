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
  let dayId, planId, partId, partId2, jobA, meB, meD, rigs;

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
    const free = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !open.has(j.id) && j.siteId && !/^S1[124]/.test(j.name)).toArray()).sort((a, b) => b.name.localeCompare(a.name));
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
    const accepted = await waitFor(() => PB.evaluate(async (id) => { const { db } = await import('/src/db/index.ts'); const parts = await db.drillLogs.filter((l) => l.drillPlanId === id).toArray(); const subs = await db.submissions.filter((s) => s.type === 'drill_log' && parts.some((p) => p.id === s.sourceId)).toArray(); return parts.every((p) => p.status === 'accepted') && subs.length === 2 ? { parts: parts.length, subs: subs.length } : null; }, planId), 60000);
    R.ok(`both parts accepted and their office copies filed with the pattern (${JSON.stringify(accepted)})`, accepted?.parts === 2 && accepted?.subs === 2);
    R.ok('the pattern still reads Drilled — the word for Shot waits for the shot (push 2)', (await waitFor(async () => ((await PB.locator('[data-plan-page]').getAttribute('data-plan-word')) === 'Drilled' ? 'Drilled' : null), 10000)) === 'Drilled');
    await waitForUpload(PB, 30000);
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const chks = await PB.evaluate(async ({ ids, date }) => (await (await import('/src/db/index.ts')).db.drillChecklists.filter((c) => ids.includes(c.equipmentId) && c.date === date).toArray()).map((c) => c.id), { ids: rigs.map((r) => r.id), date: today }).catch(() => []);
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId].filter(Boolean), drillLogs: [partId, partId2].filter(Boolean), drillPlans: [planId].filter(Boolean), checklists: chks }).catch(() => -1);
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

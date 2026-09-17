async (page, lib) => {
  // Round S19 — The checklist on its day, the hours row, AM/PM, pay yards, and a tidier inbox (2026-09-16)
  const { mkCtx, signIn, skipTours, sleep, WEB, browserErrors, waitForUpload, apiLogin, daysAgo } = lib;
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
  const yday = daysAgo(1);
  const today = daysAgo(0);
  const fmt = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  let dayId;
  const checklistIds = [];
  let jobA, jobB, rigs;

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PB = await cB.newPage();
  await signIn(PB, 'blaster');
  await skipTours(PB);
  // the driller on the window Matthew used: wide, short
  const cD = await mkCtx(browser, { viewport: { width: 1382, height: 682 } });
  const PD = await cD.newPage();
  await signIn(PD, 'dinis');
  await skipTours(PD);

  // two jobs with no open day on ANY date, and the drills
  const picked = await PB.evaluate(async () => {
    const { db } = await import('/src/db/index.ts');
    const open = new Set((await db.blastDays.filter((d) => d.status === 'draft' && !d.closed).toArray()).map((d) => d.jobId));
    const free = (await db.jobs.filter((j) => !j.archivedAt && j.isActive && !open.has(j.id) && !/^S1[124]/.test(j.name)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
    const drills = (await db.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill')).toArray()).sort((a, b) =>
      a.assetNumber.localeCompare(b.assetNumber, undefined, { numeric: true }),
    );
    return { jobs: free.slice(0, 2).map((j) => ({ id: j.id, name: j.name })), rigs: drills.map((e) => ({ id: e.id, asset: e.assetNumber })) };
  });
  if (picked.jobs.length < 2 || picked.rigs.length === 0) throw new Error('need two jobs with no open day and at least one drill');
  [jobA, jobB] = picked.jobs;
  rigs = picked.rigs;
  R.note(`jobs: ${jobA.name} / ${jobB.name} · rigs ${rigs.map((r) => r.asset).slice(0, 3).join(', ')} · the day is ${yday}`);

  // the blaster starts a day dated YESTERDAY at job A — S16's "not today" — with its papers
  dayId = await PB.evaluate(
    async ({ jobId, date, stamp }) => {
      const { createBlastDayWithPapers } = await import('/src/hooks/useBlastDay.ts');
      return createBlastDayWithPapers(jobId, date, undefined, { typeOfWork: 'drill_to_blast', name: `s19 ${stamp}` });
    },
    { jobId: jobA.id, date: yday, stamp },
  );
  await waitForUpload(PB, 30000);

  const pickRig = async (P, asset) => {
    const chip = P.locator(`[data-rig-chip="${asset}"]`);
    if (!(await chip.first().isVisible().catch(() => false))) {
      await P.locator('[data-rig-all-toggle]').click();
      await chip.first().waitFor({ timeout: 5000 });
    }
    await chip.first().click();
  };

  await R.section('A checklist started from a not-today day is dated for that day and shows on its tiles', async () => {
    // the driller opens the day (the card's gate puts him on it), then goes to the rig with no date handed over:
    // the day he is on at job A is yesterday's, so the checklist follows it
    await PD.goto(`${WEB}/blast-day/${dayId}`);
    await PD.locator('[data-tile="rigs"]').waitFor({ timeout: 40000 });
    await waitForUpload(PD, 20000);
    await PD.goto(`${WEB}/drill-checklist?job=${jobA.id}`);
    await PD.locator('[data-rig-field]').waitFor({ timeout: 40000 });
    await pickRig(PD, rigs[0].asset);
    await PD.locator('[data-chk-for-day="hint"]').waitFor({ timeout: 15000 });
    const hint = (await PD.locator('[data-chk-for-day="hint"]').textContent()) || '';
    R.ok(`from the rig, the checklist follows the open day at the job: "${hint.slice(0, 70)}"`, hint.includes(fmt(yday)) && hint.includes('the day you are on'));
    R.ok('the header agrees', ((await PD.locator('[data-chk-rig-selected]').textContent()) || '').includes(fmt(yday)));
    // then the day's own door
    await PD.goto(`${WEB}/blast-day/${dayId}`);
    await PD.locator('[data-tile="rigs"]').waitFor({ timeout: 40000 });
    const before = (await PD.locator('[data-tile="rigs"]').textContent()) || '';
    R.ok(`the tile counts its own day: "None on ${fmt(yday)}"`, before.includes(`None on ${fmt(yday)}`));
    await PD.locator('[data-rig-start]').click();
    await PD.waitForURL(/\/drill-checklist\?/, { timeout: 10000 });
    R.ok('the door hands over the date and the day', PD.url().includes(`date=${yday}`) && PD.url().includes(`day=${dayId}`));
    await pickRig(PD, rigs[0].asset);
    await PD.locator('[data-chk-for-day="door"]').waitFor({ timeout: 10000 });
    const forDay = (await PD.locator('[data-chk-for-day="door"]').textContent()) || '';
    R.ok(`the line says which day: "${forDay.slice(0, 70)}"`, forDay.includes(fmt(yday)) && forDay.includes(jobA.name));
    const header = (await PD.locator('[data-chk-rig-selected]').textContent()) || '';
    R.ok('the header shows that day, not today', header.includes(fmt(yday)));
    await PD.locator('[data-chk-hours]').fill('1400');
    await PD.locator('[data-chk-stop-hours]').fill('1405'); // S20: start AND stop → complete and file in one go
    await PD.locator('[data-chk-file]').click();
    await PD.waitForURL(/\/drill-checklist-file\//, { timeout: 15000 });
    const id = PD.url().match(/drill-checklist-file\/([^/?]+)/)?.[1];
    if (id) checklistIds.push(id);
    await PD.locator('button:has-text("Done")').first().waitFor({ timeout: 30000 });
    const filedOn = await PD.evaluate(async (id) => (await (await import('/src/db/index.ts')).db.drillChecklists.get(id))?.date, id);
    R.ok(`the filed checklist is dated ${filedOn}`, filedOn === yday);
    await waitForUpload(PD, 20000);
    await PD.goto(`${WEB}/blast-day/${dayId}`);
    await PD.locator('[data-tile="rigs"][data-tile-state="complete"]').waitFor({ timeout: 30000 });
    R.ok('back on the day, the Rig checklists tile shows the rig, complete', (await PD.locator(`[data-rig-row="${rigs[0].asset}"]`).count()) === 1);
  });

  await R.section("The checklist never guesses: from the rig it follows the day the driller is on at the job", async () => {
    // job A has exactly one open day (yesterday's): the same rig → the notice names that date
    await PD.goto(`${WEB}/drill-checklist?job=${jobA.id}`);
    await PD.locator('[data-rig-field]').waitFor({ timeout: 20000 });
    await pickRig(PD, rigs[0].asset);
    await PD.locator('[data-chk-existing]').waitFor({ timeout: 10000 });
    const notice = (await PD.locator('[data-chk-existing]').textContent()) || '';
    R.ok(`the notice names the day it means: "${notice.slice(0, 80)}"`, notice.includes(`a checklist for ${fmt(yday)}`));
    // job B has no open day: today, and no line
    await PD.goto(`${WEB}/drill-checklist?job=${jobB.id}`);
    await PD.locator('[data-rig-field]').waitFor({ timeout: 20000 });
    await pickRig(PD, rigs[0].asset);
    await PD.locator('[data-tour="chk-hours"]').waitFor({ timeout: 10000 });
    R.ok('a job with no open day: no "for the work day" line', (await PD.locator('[data-chk-for-day]').count()) === 0);
    R.ok('and the checklist is for today', ((await PD.locator('[data-chk-rig-selected]').textContent()) || '').includes(fmt(today)));
  });

  await R.section('Starting hours has its own row and the carried-answers note sits on the Daily checks card', async () => {
    // job B on yesterday's date with the rig that already has yesterday's checklist at job A → answers carry over
    await PD.goto(`${WEB}/drill-checklist?job=${jobB.id}&date=${yday}`);
    await PD.locator('[data-rig-field]').waitFor({ timeout: 20000 });
    await pickRig(PD, rigs[0].asset);
    await PD.locator('[data-tour="chk-daily"] [data-chk-carried]').waitFor({ timeout: 10000 });
    const carried = (await PD.locator('[data-tour="chk-daily"] [data-chk-carried]').textContent()) || '';
    R.ok(`the carried note is on the Daily card and names the job: "${carried.slice(0, 70)}"`, carried.includes(jobA.name) && carried.includes('the earlier checklist'));
    R.ok('nothing shares the hours row', (await PD.locator('[data-tour="chk-hours"] [data-chk-carried]').count()) === 0);
    const box = await PD.locator('[data-chk-hours]').boundingBox();
    const src = await PD.locator('[data-chk-hours-source]').boundingBox();
    R.ok(`the hours box is ${Math.round(box?.width ?? 0)} px wide`, (box?.width ?? 0) >= 150);
    R.ok('the meter line sits under the box, not beside it', Boolean(box && src) && src.y >= box.y + box.height - 1);
  });

  await R.section('IN and OUT share a row of their own inside a narrow sheet in a wide window', async () => {
    await PB.goto(`${WEB}/blast-day/${dayId}`);
    await PB.locator('[data-tile="time-card"]').waitFor({ timeout: 30000 });
    await PB.locator('[data-tile="time-card"] [data-tile-action]').click();
    await PB.locator('[data-time-card-sheet]').waitFor({ timeout: 10000 });
    const my = PB.locator('[data-time-card-sheet] button:has-text("My card")');
    if (await my.count()) await my.click();
    await PB.locator('[data-time-card-sheet] [data-card-in]').first().waitFor({ timeout: 10000 });
    const inB = await PB.locator('[data-time-card-sheet] [data-card-in]').first().boundingBox();
    const outB = await PB.locator('[data-time-card-sheet] [data-card-out]').first().boundingBox();
    const otB = await PB.locator('[data-time-card-sheet] [data-card-ot]').first().boundingBox();
    const sheetW = (await PB.locator('[data-time-card-sheet]').boundingBox())?.width ?? 0;
    R.ok(`the sheet is ${Math.round(sheetW)} px wide in a 1280 px window`, sheetW > 0 && sheetW < 520);
    R.ok(`IN is ${Math.round(inB?.width ?? 0)} px wide — room for "6:30 PM"`, (inB?.width ?? 0) >= 140);
    R.ok('IN and OUT sit on one row', Boolean(inB && outB) && Math.abs(inB.y - outB.y) < 2 && outB.x > inB.x);
    R.ok('OT sits on the row below', Boolean(inB && otB) && otB.y > inB.y + inB.height - 1);
  });

  let shotId;
  await R.section('Pay yards fills itself from square feet, depth and sub drill, and a typed number holds', async () => {
    shotId = await PB.evaluate(async (dayId) => {
      const { db } = await import('/src/db/index.ts');
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      return (await db.shots.where('blastLogId').equals(log.id).first())?.id;
    }, dayId);
    await PB.goto(`${WEB}/blast-day/${dayId}?view=blast-log`);
    await PB.locator('[data-dp="burden"]').waitFor({ timeout: 30000 });
    const type = async (sel, v) => {
      await PB.locator(sel).first().fill(String(v));
      await PB.locator(sel).first().blur();
      // the box writes once after a pause; the next box must not race that write
      await sleep(800);
    };
    await type('[data-dp="burden"]', 5);
    await type('[data-dp="spacing"]', 5);
    await type('[data-dp="subDrill"]', 2);
    await type('[data-total="numHoles"]', 44);
    await type('[data-total="totalDrillFootage"]', 1408);
    const pay = await waitFor(async () => {
      const v = await PB.locator('[data-total="totalPayYards"]').inputValue();
      return v === '1222' ? v : null;
    }, 10000);
    R.ok(`pay yards reads ${pay ?? (await PB.locator('[data-total="totalPayYards"]').inputValue())} — 1,100 sq ft × (32 − 2) ÷ 27`, pay === '1222');
    R.ok('yards shot still reads 1304', ((await PB.textContent('body')) || '').includes('1304'));
    const line = (await PB.locator('[data-pay-yards-line]').textContent().catch(() => '')) || '';
    R.ok(`the line explains it: "${line}"`, /Pay yards to grade: 1,100 sq ft × \(32\.0 − 2 ft sub drill\) ÷ 27/.test(line));
    await type('[data-total="totalPayYards"]', 1300);
    await waitFor(async () => ((await PB.locator('[data-pay-yards-line]').getAttribute('data-pay-yards-line')) === 'typed' ? 1 : null), 8000);
    R.ok('a typed number marks the line "typed by you"', (await PB.locator('[data-pay-yards-line]').getAttribute('data-pay-yards-line')) === 'typed');
    await type('[data-total="totalDrillFootage"]', 1500);
    await sleep(900);
    const held = await PB.evaluate(async (id) => {
      const s = await (await import('/src/db/index.ts')).db.shots.get(id);
      return { pay: s?.totals.totalPayYards, typed: s?.totals.payYardsTyped, footage: s?.totals.totalDrillFootage };
    }, shotId);
    R.ok(`after changing the footage (${held.footage}) the typed pay yards hold (${held.pay})`, held.pay === 1300 && held.typed === true && held.footage === 1500);
    R.ok('the box still shows 1300', (await PB.locator('[data-total="totalPayYards"]').inputValue()) === '1300');
  });

  let rowTiles, rowLog, mark;
  await R.section('A feedback report names its screen; the inbox shows person and screen with the date on its own', async () => {
    const send = async (url, msg) => {
      await PB.goto(url);
      await PB.locator('[data-feedback-fab]').waitFor({ timeout: 30000 });
      await PB.locator('[data-feedback-fab]').click();
      await PB.locator('[data-feedback-composer]').waitFor({ timeout: 25000 });
      await PB.locator('[data-feedback-paper]').waitFor({ timeout: 10000 }).catch(() => {});
      const label = ((await PB.locator('[data-feedback-paper]').textContent().catch(() => '')) || '').replace(/^This screen:\s*/, '').trim();
      await PB.locator('[data-feedback-message]').fill(msg);
      await PB.locator('[data-feedback-send]').click();
      await PB.locator('[data-feedback-composer]').waitFor({ state: 'detached', timeout: 15000 });
      return label;
    };
    const tilesLabel = await send(`${WEB}/blast-day/${dayId}`, `s19 ${stamp} from the tiles`);
    R.ok(`the tiles name themselves: "${tilesLabel}"`, tilesLabel.startsWith('Work day') && tilesLabel.includes(jobA.name) && tilesLabel.includes(fmt(yday)));
    const logLabel = await send(`${WEB}/blast-day/${dayId}?view=blast-log`, `s19 ${stamp} from the log`);
    R.ok(`the blasting log names itself: "${logLabel}"`, logLabel.startsWith('Blasting log') && logLabel.includes(jobA.name));
    mark = await apiLogin(PB, 'mark');
    const rows = await waitFor(async () => {
      const r = await mark.api('/feedback', {}, mark.token);
      const list = r.body?.feedback ?? [];
      const a = list.find((f) => f.message === `s19 ${stamp} from the tiles`);
      const b = list.find((f) => f.message === `s19 ${stamp} from the log`);
      return a && b ? { a, b } : null;
    }, 20000);
    rowTiles = rows?.a;
    rowLog = rows?.b;
    R.ok('both reports reached the server carrying the screen name', Boolean(rowTiles && rowLog) && rowTiles.paper?.label === tilesLabel && rowTiles.paper?.kind === 'screen' && rowLog.paper?.label === logLabel);
  });

  const cM = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PM = await cM.newPage();
  await R.section('Tick several reports, then Mark seen, Mark done or Delete', async () => {
    await signIn(PM, 'mark');
    await skipTours(PM);
    await PM.goto(`${WEB}/admin/feedback`);
    await PM.locator(`[data-feedback-row="${rowTiles.id}"]`).waitFor({ timeout: 30000 });
    const meta = (await PM.locator(`[data-feedback-row="${rowTiles.id}"] [data-feedback-meta]`).textContent()) || '';
    R.ok(`the row reads person · screen: "${meta.trim().slice(0, 80)}"`, meta.includes(rowTiles.userName) && meta.includes(`Work day · ${jobA.name}`) && !meta.includes('/blast-day/'));
    const when = (await PM.locator(`[data-feedback-row="${rowTiles.id}"] [data-feedback-when]`).textContent()) || '';
    R.ok(`the time sits on its own at the right ("${when.trim()}")`, /\d/.test(when) && (await PM.locator(`[data-feedback-row="${rowTiles.id}"] [data-feedback-when]`).isVisible()));
    // an older row with no screen name gets one from its address
    const oldest = await PM.evaluate(async () => (await import('/src/lib/screenName.ts')).screenNameFromRoute('/blast-day/d3bf612c-c7e5-59a3-902d-58cf3453431b?view=daily-report'));
    R.ok(`an address alone still names a screen (${oldest})`, oldest === 'Daily report');
    await PM.locator(`[data-feedback-pick="${rowTiles.id}"]`).check();
    await PM.locator(`[data-feedback-pick="${rowLog.id}"]`).check();
    R.ok('two ticked', ((await PM.locator('[data-feedback-bulk-count]').textContent()) || '').trim() === '2 selected');
    await PM.locator('[data-feedback-bulk-seen]').click();
    const seen = await waitFor(async () => {
      const r = await mark.api('/feedback', {}, mark.token);
      const list = r.body?.feedback ?? [];
      const a = list.find((f) => f.id === rowTiles.id);
      const b = list.find((f) => f.id === rowLog.id);
      return a?.status === 'seen' && b?.status === 'seen' ? 1 : null;
    }, 15000);
    R.ok('Mark seen marked both on the server', seen === 1);
    R.ok('the badges read seen', ((await PM.locator(`[data-feedback-row="${rowTiles.id}"]`).textContent()) || '').includes('seen') && ((await PM.locator(`[data-feedback-row="${rowLog.id}"]`).textContent()) || '').includes('seen'));
    R.ok('the selection cleared after the action', (await PM.locator('[data-feedback-bulk-count]').count()) === 0);
    await PM.locator(`[data-feedback-pick="${rowTiles.id}"]`).check();
    await PM.locator(`[data-feedback-pick="${rowLog.id}"]`).check();
    await PM.locator('[data-feedback-bulk-delete]').click();
    const confirm = (await PM.locator('[data-feedback-bulk-confirm]').textContent()) || '';
    R.ok(`Delete asks once with the count: "${confirm.trim().slice(0, 60)}"`, confirm.includes('Delete 2 reports?'));
    await PM.locator('[data-feedback-bulk-confirm-yes]').click();
    await PM.locator(`[data-feedback-row="${rowTiles.id}"]`).waitFor({ state: 'detached', timeout: 15000 });
    const gone = await waitFor(async () => {
      const r = await mark.api('/feedback', {}, mark.token);
      const list = r.body?.feedback ?? [];
      return list.some((f) => f.id === rowTiles.id || f.id === rowLog.id) ? null : 1;
    }, 15000);
    R.ok('both rows are gone from the server', gone === 1);
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId].filter(Boolean), checklists: checklistIds }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cM.close();
  await cD.close();
  await cB.close();
  return R.summary();
}

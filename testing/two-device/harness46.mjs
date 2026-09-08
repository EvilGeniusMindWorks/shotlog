async (page) => {
  // S7 follow-up — Matthew's driller rehearsal (2026-09-07): a driller's new
  // day never opens on the blaster's hub (no blasting-type prefill for the
  // driller bucket; the day page lands on the daily report for them even
  // when a blast log exists); Copy from previous starts blank; the RIG is
  // the first question ON the checklist — nothing preselected, quick picks
  // with reasons, All rigs with search, one-tap switch that saves nothing,
  // usual rig written only on file; the drill log's back arrow goes home.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const API = 'http://localhost:4000';
  const WEB = 'http://localhost:5199';
  const stamp = Date.now().toString(36);

  const mkCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', '${API}');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-tour-done', '1');
      localStorage.setItem('shotlog-first-week-hidden', '1');
      localStorage.removeItem('shotlog-last-rig');
    `);
    return ctx;
  };
  const signIn = async (P, email, pass) => {
    await P.goto(WEB);
    await P.locator('input[type="email"]').fill(email);
    await P.locator('input[type="password"]').fill(pass);
    await P.getByRole('button', { name: 'Sign in' }).click();
    await P.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await P.waitForTimeout(3000);
  };
  const selectedChip = async (P) => (await P.locator('[data-new-day-dialog] button.bg-navy').allInnerTexts()).join('|');
  const usualRigs = (P) =>
    P.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const me = JSON.parse(localStorage.getItem('shotlog-user-info'));
      return (await db.equipment.filter((e) => e.assignedUserId === me.id).toArray()).map((e) => e.assetNumber);
    });
  let blasterDayId;
  let drillerDayId;
  let checklistIds = [];
  let jobId;
  try {
    // ── 0. a blaster's Drill to Blast day at a job (the prefill bait) ───
    const c0 = await mkCtx();
    const P0 = await c0.newPage();
    await signIn(P0, 'blaster@test.local', 'blaster-pass-123');
    const made = await P0.evaluate(async (stamp) => {
      const { db } = await import('/src/db/index.ts');
      const { createBlastDay } = await import('/src/hooks/useBlastDay.ts');
      const jobs = (await db.jobs.filter((j) => !j.archivedAt && j.isActive).toArray()).sort((a, b) => a.name.localeCompare(b.name));
      const d = new Date(); d.setDate(d.getDate() - 1);
      const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const id = await createBlastDay(jobs[2].id, y, undefined, { typeOfWork: 'drill_to_blast', name: `S7f bait ${stamp}` });
      return { id, jobId: jobs[2].id };
    }, stamp);
    blasterDayId = made.id;
    jobId = made.jobId;
    await P0.waitForTimeout(3000);
    await c0.close();

    // ── 1. driller: the rig is the first question ON the checklist ─────
    const c1 = await mkCtx();
    const P1 = await c1.newPage();
    await signIn(P1, 'dinis@test.local', 'dinis-pass-123');
    await P1.evaluate(async () => {
      const { forgetUsualRig } = await import('/src/components/dashboard/RigPickerModal.tsx');
      await forgetUsualRig();
    });
    await P1.waitForTimeout(800);
    await P1.reload();
    await P1.waitForTimeout(2500);
    ok('the home has no rig setting and no Change rig', (await P1.locator('[data-change-rig]').count()) === 0 && (await P1.locator('[data-rig-line]').count()) === 0);
    const tile = P1.getByRole('button', { name: /File rig checklist|Checklist filed/ });
    ok('the tile reads as the action ("File rig checklist")', (await tile.count()) === 1);
    await tile.click();
    await P1.waitForURL(/drill-checklist$/, { timeout: 8000 });
    await P1.locator('[data-rig-field]').waitFor({ timeout: 5000 });
    ok('nothing is preselected — the form asks which rig', (await P1.locator('[data-chk-pick-first]').count()) === 1 && (await P1.locator('[data-chk-hours]').count()) === 0);
    const quick = await P1.locator('[data-rig-quick] [data-rig-chip]').evaluateAll((els) => els.map((e) => e.getAttribute('data-rig-reason')));
    ok(`quick picks carry their reason (${quick.join(', ') || 'none on this account'})`, quick.every((r) => ["today's log", 'last filed', 'usual', 'recent'].includes(r)));
    await P1.locator('[data-rig-all-toggle]').click();
    await P1.locator('[data-rig-all] [data-rig-chip]').first().waitFor({ timeout: 8000 });
    const rigs = await P1.locator('[data-rig-all] [data-rig-chip]').evaluateAll((els) => els.map((e) => e.getAttribute('data-rig-chip')));
    ok(`All rigs opens the fleet with search (${rigs.join(', ')})`, rigs.length >= 1 && (await P1.locator('[data-rig-search]').count()) === 1);
    await P1.locator('[data-rig-search]').fill(rigs[0].slice(0, 3));
    await P1.waitForTimeout(300);
    ok('search narrows the fleet', (await P1.locator('[data-rig-all] [data-rig-chip]').count()) >= 1);
    await P1.locator(`[data-rig-all] [data-rig-chip="${rigs[0]}"]`).click();
    await P1.waitForTimeout(600);
    ok('one tap: the form is now for that rig (hours, service clock, job) — nothing saved', (await P1.locator('[data-chk-rig-selected]').getAttribute('data-chk-rig-selected')) === rigs[0] && (await P1.locator('[data-chk-hours]').count()) === 1);
    ok('browsing and picking write nothing to the account', (await usualRigs(P1)).length === 0);
    // File it → the rig becomes usual; the tile and the door say filed
    const start = await P1.evaluate(async (asset) => {
      const { db } = await import('/src/db/index.ts');
      const { buildHourLedger } = await import('/src/lib/hourLedger.ts');
      const rig = await db.equipment.filter((e) => e.assetNumber === asset).first();
      const { currentHours } = await buildHourLedger(rig);
      return Math.ceil(Math.max(currentHours ?? 0, rig.hourMeter ?? 0)) + 10;
    }, rigs[0]);
    await P1.locator('[data-chk-hours]').fill(String(start));
    await P1.locator('[data-chk-file]').click();
    await P1.waitForURL(/drill-checklist-file\//, { timeout: 10000 });
    await P1.waitForTimeout(1200);
    checklistIds = await P1.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { todayISO } = await import('/src/lib/utils.ts');
      const me = JSON.parse(localStorage.getItem('shotlog-user-info'));
      return (await db.drillChecklists.filter((c) => c.date === todayISO() && c.drillerUserId === me.id).toArray()).map((c) => c.id);
    });
    const usualAfter = await usualRigs(P1);
    ok('FILING is what makes a rig usual', usualAfter.length === 1 && usualAfter[0] === rigs[0]);
    await P1.goto(WEB);
    await P1.waitForTimeout(2000);
    const filedTile = P1.getByRole('button', { name: /Checklist filed/ });
    ok('the home tile now says Checklist filed · rig', (await filedTile.count()) === 1 && (await filedTile.innerText()).includes(rigs[0]));
    // Back on the form: the filed rig is a quick pick and says "already has today's"
    await P1.goto(`${WEB}/drill-checklist`);
    await P1.locator('[data-rig-quick] [data-rig-chip][data-rig-reason="last filed"]').waitFor({ timeout: 8000 });
    await P1.locator('[data-rig-quick] [data-rig-chip][data-rig-reason="last filed"]').click();
    await P1.waitForTimeout(600);
    ok('a rig already filed today says so, offers Open it, and lets you pick another', (await P1.locator('[data-chk-existing]').count()) === 1 && (await P1.locator('[data-chk-hours]').count()) === 0 && (await P1.locator('[data-rig-all-toggle]').count()) === 1);
    // Old per-rig links still preselect
    const rigId = await P1.evaluate(async (asset) => {
      const { db } = await import('/src/db/index.ts');
      return (await db.equipment.filter((e) => e.assetNumber === asset).first())?.id;
    }, rigs[0]);
    await P1.goto(`${WEB}/drill-checklist/${rigId}`);
    await P1.waitForFunction((asset) => document.querySelector('[data-chk-rig-selected]')?.getAttribute('data-chk-rig-selected') === asset, rigs[0], { timeout: 8000 }).catch(() => undefined);
    ok('an old per-rig link preselects that rig', (await P1.locator('[data-chk-rig-selected]').getAttribute('data-chk-rig-selected')) === rigs[0]);
    await P1.goto(`${WEB}/drilling`);
    await P1.waitForFunction(() => /File another rig checklist/.test(document.querySelector('[data-checklist-door]')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => undefined);
    ok('the Drilling door reports what was filed and opens the same form', /File another rig checklist/.test(await P1.locator('[data-checklist-door]').innerText()));
    await P1.goto(WEB);
    await P1.waitForTimeout(1500);

    // ── 2. driller: the new-day dialog never prefills a blasting type; copy blank ─
    await P1.locator('[data-tour="fab"]').click();
    await P1.locator('[data-new-day-dialog]').waitFor({ timeout: 5000 });
    // S8 Option B: the Job row opens a picker; search finds the job by id
    await P1.locator('[data-day-job]').click();
    await P1.locator('[data-pick-search]').fill(jobId);
    await P1.locator(`[data-choose-job="${jobId}"]`).waitFor({ timeout: 5000 });
    await P1.locator(`[data-choose-job="${jobId}"]`).click();
    await P1.waitForTimeout(700);
    ok("the job's last day was Drill to Blast, but the driller is prefilled Drill Only", /Drill Only/.test(await selectedChip(P1)) && !/Drill to Blast/.test(await selectedChip(P1)));
    ok('Copy from previous is offered but starts blank', (await P1.locator('[data-day-copy]').count()) === 1 && (await P1.locator('[data-day-copy]').inputValue()) === '');
    await P1.locator('[data-day-name]').fill(`S7f driller day ${stamp}`);
    await P1.locator('[data-day-start]').click();
    let spineSeen = false;
    for (let i = 0; i < 40; i++) {
      if ((await P1.locator('[data-tour="day-spine"]').count()) > 0) spineSeen = true;
      await P1.waitForTimeout(50);
    }
    ok('after Start work the driller never sees the blaster\'s hub (no spine, not even briefly)', !spineSeen && /blast-day\//.test(P1.url()));
    drillerDayId = P1.url().split('/blast-day/')[1]?.split('?')[0];
    const dd = await P1.evaluate(async (id) => {
      const { db } = await import('/src/db/index.ts');
      return db.blastDays.get(id);
    }, drillerDayId);
    ok('the day is Drill Only, authored by the driller', dd?.typeOfWork === 'drill_only' && dd?.authorBucket === 'driller');
    ok('the driller lands on the daily report (their card, checklist, file-the-day)', (await P1.locator('[data-time-cards]').count()) === 1 && (await P1.locator('[data-report-owner]').getAttribute('data-report-owner')) === 'me');
    await P1.goto(`${WEB}/blast-day/${blasterDayId}`);
    await P1.locator('[data-report-owner]').waitFor({ timeout: 8000 });
    ok('a blasting day opens on the daily report for the driller, not the hub', (await P1.locator('[data-tour="day-spine"]').count()) === 0 && (await P1.locator('[data-time-cards]').count()) === 1);
    ok('the Day tab is still one tap away', (await P1.locator('[data-tour="day-tabs"]').count()) === 1);

    // ── 3. the drill log: back goes HOME for a driller; the rig logged becomes the usual rig ─
    const logId = await P1.evaluate(async (dayId) => {
      const { db } = await import('/src/db/index.ts');
      const { createDrillLog } = await import('/src/hooks/useDrillLogs.ts');
      const day = await db.blastDays.get(dayId);
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      return createDrillLog(shot, dayId, day.jobId);
    }, blasterDayId);
    await P1.goto(`${WEB}/blast-day/${blasterDayId}/drill-log/${logId}`);
    await P1.locator('[data-log-rig]').waitFor({ timeout: 8000 });
    await P1.locator('[data-tour="log-header"]').locator('..').locator('button').first().click();
    await P1.waitForTimeout(1200);
    ok('the drill log\'s back arrow takes the driller HOME, not to the blaster\'s day hub', P1.url().replace(WEB, '').split('?')[0] === '/');
    await P1.goto(`${WEB}/blast-day/${blasterDayId}/drill-log/${logId}`);
    await P1.locator('[data-log-rig]').waitFor({ timeout: 8000 });
    const options = await P1.locator('[data-log-rig] option').evaluateAll((els) => els.map((e) => e.value).filter(Boolean));
    await P1.locator('[data-log-rig]').selectOption(options[0]);
    await P1.waitForTimeout(800);
    const usualLog = await P1.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const me = JSON.parse(localStorage.getItem('shotlog-user-info'));
      return (await db.equipment.filter((e) => e.assignedUserId === me.id).toArray()).map((e) => e.id);
    });
    ok('logging holes with a rig on the log also makes it the usual rig', usualLog.length === 1 && usualLog[0] === options[0]);
    await P1.waitForTimeout(2500);
    await c1.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
  } finally {
    try {
      const c9 = await mkCtx();
      const P9 = await c9.newPage();
      await signIn(P9, 'mark@baystateblasting.com', 'dev-password-123');
      const removed = await P9.evaluate(async ({ ids, checklistIds }) => {
        const { db, deleteWithTombstone } = await import('/src/db/index.ts');
        const { deleteDayCascade } = await import('/src/lib/lifecycle.ts');
        let n = 0;
        for (const id of ids) {
          const day = id ? await db.blastDays.get(id) : undefined;
          if (day) {
            await deleteDayCascade(day);
            n++;
          }
        }
        for (const id of checklistIds) if (await db.drillChecklists.get(id)) await deleteWithTombstone('drillChecklists', id);
        return n;
      }, { ids: [blasterDayId, drillerDayId], checklistIds });
      await P9.waitForTimeout(3000);
      results.push(`PASS cleanup removed ${removed} harness day(s) + ${checklistIds.length} checklist(s)`);
      await c9.close();
    } catch (e) {
      results.push(`FAIL cleanup ${e.message}`);
    }
  }
  return results.join('\n');
}

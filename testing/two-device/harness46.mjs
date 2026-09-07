async (page) => {
  // S7 follow-up — Matthew's driller rehearsal (2026-09-07): a driller's new
  // day never opens on the blaster's hub (no blasting-type prefill for the
  // driller bucket; the day page lands on the daily report for them even
  // when a blast log exists); Copy from previous starts blank; the checklist
  // door and its rig are obvious — a rig line under the trio with "Change
  // rig", "Change rig" on the checklist itself, and the rig logged on a
  // drill log becomes the usual rig.
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
  let blasterDayId;
  let drillerDayId;
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
      // yesterday's blasting day so "the job's last day" is Drill to Blast
      const d = new Date(); d.setDate(d.getDate() - 1);
      const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const id = await createBlastDay(jobs[2].id, y, undefined, { typeOfWork: 'drill_to_blast', name: `S7f bait ${stamp}` });
      return { id, jobId: jobs[2].id };
    }, stamp);
    blasterDayId = made.id;
    jobId = made.jobId;
    await P0.waitForTimeout(3000);
    await c0.close();

    // ── 1. driller: usual rig, change rig, checklist door ───────────────
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
    // With the usual rig forgotten, the line falls back to the rig on my most
    // recent drill log (the rig follows the work) — either way it must SAY
    // which rig, or say none and offer Pick rig
    const line0 = await P1.locator('[data-rig-line]').innerText();
    const btn0 = await P1.locator('[data-change-rig]').innerText();
    ok(`the home states the checklist rig or the lack of one (${line0.replace(/\n/g, ' ')})`, (/Checklist rig:/.test(line0) && /Change rig/.test(btn0)) || (/No rig picked yet/.test(line0) && /Pick rig/.test(btn0)));
    await P1.locator('[data-change-rig]').click();
    await P1.locator('[data-rig-picker]').waitFor({ timeout: 5000 });
    await P1.locator('[data-rig-option]').first().waitFor({ timeout: 8000 });
    const rigs = await P1.locator('[data-rig-option]').evaluateAll((els) => els.map((e) => e.getAttribute('data-rig-option')));
    ok(`picker lists the drills (${rigs.join(', ')})`, rigs.length >= 1);
    await P1.locator('[data-rig-option]').first().click();
    await P1.waitForURL(/drill-checklist\//, { timeout: 8000 });
    ok('picking a rig from the home opens ITS checklist', /drill-checklist\//.test(P1.url()));
    await P1.locator('[data-checklist-change-rig]').waitFor({ timeout: 8000 }).catch(() => undefined);
    ok('the checklist header offers Change rig', (await P1.locator('[data-checklist-change-rig]').count()) === 1);
    const firstUrl = P1.url();
    if (rigs.length > 1) {
      await P1.locator('[data-checklist-change-rig]').click();
      await P1.locator('[data-rig-option]').nth(1).waitFor({ timeout: 5000 });
      await P1.locator('[data-rig-option]').nth(1).click();
      await P1.waitForTimeout(800);
      ok('Change rig on the checklist switches to the other rig', P1.url() !== firstUrl && /drill-checklist\//.test(P1.url()));
    } else {
      ok('Change rig on the checklist (one rig in this registry — skipped)', true);
    }
    await P1.goto(WEB);
    await P1.waitForTimeout(2000);
    const line1 = await P1.locator('[data-rig-line]').innerText();
    ok(`the home now names the checklist rig (${line1.replace(/\n/g, ' ')})`, /Checklist rig:/.test(line1) && /Change rig/.test(await P1.locator('[data-change-rig]').innerText()));

    // ── 2. driller: the new-day dialog never prefills a blasting type; copy blank ─
    await P1.locator('[data-tour="fab"]').click();
    await P1.locator('[data-new-day-dialog]').waitFor({ timeout: 5000 });
    await P1.locator(`[data-day-job] option[value="${jobId}"]`).waitFor({ state: 'attached', timeout: 5000 });
    await P1.locator('[data-day-job]').selectOption(jobId);
    await P1.waitForTimeout(700);
    ok("the job's last day was Drill to Blast, but the driller is prefilled Drill Only", /Drill Only/.test(await selectedChip(P1)) && !/Drill to Blast/.test(await selectedChip(P1)));
    ok('Copy from previous is offered but starts blank', (await P1.locator('[data-day-copy]').count()) === 1 && (await P1.locator('[data-day-copy]').inputValue()) === '');
    await P1.locator('[data-day-name]').fill(`S7f driller day ${stamp}`);
    await P1.locator('[data-day-start]').click();
    // Watch the first two seconds after Start work: the blaster's spine must never appear
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
    // Even a BLASTING day (the blaster's) opens on the daily report for the driller
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
    if (rigs.length > 1) {
      const options = await P1.locator('[data-log-rig] option').evaluateAll((els) => els.map((e) => e.value).filter(Boolean));
      await P1.locator('[data-log-rig]').selectOption(options[0]);
      await P1.waitForTimeout(800);
      const usual = await P1.evaluate(async () => {
        const { db } = await import('/src/db/index.ts');
        const me = JSON.parse(localStorage.getItem('shotlog-user-info'));
        return (await db.equipment.filter((e) => e.assignedUserId === me.id).toArray()).map((e) => e.id);
      });
      ok('picking the rig on a drill log makes it the usual rig (one usual rig, the one logged)', usual.length === 1 && usual[0] === options[0]);
    } else {
      ok('drill-log rig → usual rig (one rig in this registry — skipped)', true);
    }
    await P1.waitForTimeout(2500);
    await c1.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
  } finally {
    try {
      const c9 = await mkCtx();
      const P9 = await c9.newPage();
      await signIn(P9, 'mark@baystateblasting.com', 'dev-password-123');
      const removed = await P9.evaluate(async (ids) => {
        const { db } = await import('/src/db/index.ts');
        const { deleteDayCascade } = await import('/src/lib/lifecycle.ts');
        let n = 0;
        for (const id of ids) {
          const day = id ? await db.blastDays.get(id) : undefined;
          if (day) {
            await deleteDayCascade(day);
            n++;
          }
        }
        return n;
      }, [blasterDayId, drillerDayId]);
      await P9.waitForTimeout(3000);
      results.push(`PASS cleanup removed ${removed} harness day(s)`);
      await c9.close();
    } catch (e) {
      results.push(`FAIL cleanup ${e.message}`);
    }
  }
  return results.join('\n');
}

async (page) => {
  // Audit round: field edits become server audit entries w/ actor + diff;
  // day History sheet renders them in plain speech; Audit lens filters by
  // person; locked-day edits appear as DISCARD w/ reason; binder export
  // downloads a ZIP (validated afterwards by a node script); 430px rule.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const OUT = '/private/tmp/claude-501/-Users-matthewbulmer-Documents-Code-shotlog/d2d2c320-b4ff-4b90-b251-2a8a202badf3/scratchpad';
  let blaster, admin;
  try {
    const mk = async () => {
      const ctx = await browser.newContext();
      await ctx.addInitScript(`
        localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
        localStorage.setItem('shotlog-pin', 'x');
        localStorage.setItem('shotlog-last-active', String(Date.now()));
      `);
      const p = await ctx.newPage();
      await p.goto('http://localhost:5199');
      return p;
    };
    const login = async (p, email, pass) => {
      await p.locator('input[type="email"]').fill(email);
      await p.locator('input[type="password"]').fill(pass);
      await p.getByRole('button', { name: 'Sign in' }).click();
      await p.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
      await p.waitForTimeout(3500);
    };
    const waitBody = async (p, t, ms = 30000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if ((await p.locator('body').innerText()).includes(t)) return true;
        await p.waitForTimeout(700);
      }
      return false;
    };
    const tag = `H21-${Date.now() % 1000000}`;

    // ── Admin seeds a job; blaster makes auditable edits ──────────────────
    admin = await mk();
    await login(admin, 'mark@baystateblasting.com', 'dev-password-123');
    const jobId = await admin.evaluate(
      (t) => window.shotlogFlows.createJob({ name: `${t} Job`, customer: 'H21' }),
      tag,
    );

    blaster = await mk();
    await login(blaster, 'blaster@test.local', 'blaster-pass-123');
    const ids = await blaster.evaluate(async (jobId) => {
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        if (await window.shotlogDb.jobs.get(jobId)) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      const dayId = await window.shotlogFlows.createBlastDay(jobId);
      const log = await window.shotlogDb.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await window.shotlogDb.shots.where('blastLogId').equals(log.id).first();
      return { dayId, logId: log.id, shotId: shot.id };
    }, jobId);
    // Wait for the creation batch to land, THEN make the edit (separate op)
    ok('creation synced', await waitBody(blaster, 'All changes saved', 45000));
    await blaster.evaluate(async ({ shotId }) => {
      const shot = await window.shotlogDb.shots.get(shotId);
      await window.shotlogDb.shots.update(shotId, {
        drillParams: { ...shot.drillParams, burden: 5 },
        updatedAt: new Date().toISOString(),
      });
    }, ids);
    ok('edit synced', await waitBody(blaster, 'All changes saved', 45000));

    // ── (a) Poll the SERVER until the expected entries exist (screen text
    //     races — 'All changes saved' can be stale when the check runs) ────
    const fetchShotAudit = async () =>
      admin.evaluate(async (shotId) => {
        const token = localStorage.getItem('shotlog-access-token');
        const res = await fetch('http://localhost:4000/audit/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ids: [shotId] }),
        });
        return (await res.json()).entries;
      }, ids.shotId);
    let created, edited;
    {
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline && !(created && edited)) {
        const rows = await fetchShotAudit();
        created = rows.find((e) => e.changes.some((c) => c.note === 'created'));
        edited = rows.find((e) =>
          e.changes.some((c) => c.field === 'drillParams' && String(c.new).includes('"burden":5')),
        );
        if (created && edited) break;
        await admin.waitForTimeout(1500);
      }
    }
    ok('shot creation audited with actor', Boolean(created) && created.actorName.length > 0);
    ok('burden edit audited as drillParams diff by the blaster',
      Boolean(edited) && /blaster/i.test(edited.actorRole));

    // ── (b) Day History sheet (admin) in plain speech ─────────────────────
    await admin.goto(`http://localhost:5199/blast-day/${ids.dayId}`);
    await admin.waitForTimeout(3000);
    await admin.locator('button[title="Change history"]').click();
    ok('History sheet lists the edit in plain speech',
      await waitBody(admin, 'Drill params', 20000));
    ok('History sheet shows created entries', (await admin.locator('body').innerText()).includes('created'));
    await admin.mouse.click(5, 5);

    // ── (c) Audit lens + person filter ────────────────────────────────────
    await admin.goto('http://localhost:5199/records');
    await admin.waitForTimeout(2000);
    await admin.getByRole('button', { name: 'Audit', exact: true }).click();
    ok('Audit lens loads entries', await waitBody(admin, 'Drill params', 20000));
    // filter to the blaster
    const blasterName = await blaster.evaluate(
      () => JSON.parse(localStorage.getItem('shotlog-user-info')).name,
    );
    await admin.locator('main select').first().selectOption({ label: blasterName });
    await admin.waitForTimeout(2000);
    const lensTxt = await admin.locator('body').innerText();
    ok('person filter narrows to the blaster', lensTxt.includes(blasterName) && lensTxt.includes('Drill params'));

    // ── (d) Locked-day edit → DISCARD with reason ─────────────────────────
    await blaster.evaluate(async ({ dayId }) => {
      await window.shotlogDb.blastDays.update(dayId, {
        status: 'submitted',
        updatedAt: new Date().toISOString(),
      });
    }, ids);
    ok('submit synced', await waitBody(blaster, 'All changes saved', 45000));
    await blaster.evaluate(async ({ logId }) => {
      await window.shotlogDb.blastLogs.update(logId, {
        typeOfRock: 'Sneaky Edit Granite',
        updatedAt: new Date().toISOString(),
      });
    }, ids);
    let discard;
    {
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline && !discard) {
        const rows = await admin.evaluate(async (logId) => {
          const token = localStorage.getItem('shotlog-access-token');
          const res = await fetch('http://localhost:4000/audit/records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ids: [logId] }),
          });
          return (await res.json()).entries;
        }, ids.logId);
        discard = rows.find((e) => e.op === 'DISCARD');
        if (!discard) await admin.waitForTimeout(1500);
      }
    }
    ok('DISCARD entry with locked reason', Boolean(discard) && /locked/.test(discard.reason ?? ''));

    // ── (e) Binder export downloads a ZIP ─────────────────────────────────
    await admin.goto('http://localhost:5199/records');
    await admin.waitForTimeout(2000);
    await admin.getByRole('button', { name: /Export binder/ }).click();
    await admin.waitForTimeout(800);
    const [download] = await Promise.all([
      admin.context().waitForEvent('page').catch(() => null), // ignore popups
      admin.waitForEvent('download', { timeout: 120000 }),
      admin.getByRole('button', { name: 'Build binder' }).click(),
    ]).then((r) => [r[1]]);
    await download.saveAs(`${OUT}/binder.zip`);
    ok('binder ZIP downloaded', true);

    // ── (f) 430px overflow rule on the Audit lens ─────────────────────────
    await admin.setViewportSize({ width: 430, height: 932 });
    await admin.goto('http://localhost:5199/records');
    await admin.waitForTimeout(2000);
    await admin.getByRole('button', { name: 'Audit', exact: true }).click();
    await admin.waitForTimeout(2500);
    const overflow = await admin.evaluate(() => {
      const iw = window.innerWidth;
      const main = document.querySelector('main');
      return document.documentElement.scrollWidth > iw + 1 ||
        Boolean(main && main.scrollWidth > main.clientWidth + 1);
    });
    ok('no overflow at 430px on Audit lens', !overflow);
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await (admin ?? blaster).locator('body').innerText()).slice(0, 400)); } catch {}
  }
  return results.join('\n');
}

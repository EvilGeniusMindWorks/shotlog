async (page) => {
  // Quick-wins round: workforce roster picker (crewMemberId stamp + Other
  // fallback), grouped equipment picker + bucket chip, Shot #1 expanded on a
  // fresh load, and a phone-portrait overflow scan across all core routes.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let dev, mob;
  try {
    const mk = async (viewport) => {
      const ctx = await browser.newContext(viewport ? { viewport } : {});
      await ctx.addInitScript(`
        localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
        localStorage.setItem('shotlog-pin', 'x');
        localStorage.setItem('shotlog-last-active', String(Date.now()));
      `);
      const p = await ctx.newPage();
      await p.goto('http://localhost:5199');
      await p.locator('input[type="email"]').fill('mark@baystateblasting.com');
      await p.locator('input[type="password"]').fill('dev-password-123');
      await p.getByRole('button', { name: 'Sign in' }).click();
      // Sidebar 'Dashboard' link is hidden on phone widths — wait for the
      // login form to go away instead
      await p.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
      await p.waitForTimeout(3000);
      return p;
    };
    const tag = `H15-${Date.now() % 1000000}`;
    dev = await mk(null);

    // ── Seed: job + day (auto-populates roster crew + registry equipment) ──
    const ids = await dev.evaluate(async (t) => {
      const db = window.shotlogDb;
      const jobId = await window.shotlogFlows.createJob({ name: `${t} Job`, customer: 'H15 Customer' });
      const dayId = await window.shotlogFlows.createBlastDay(jobId);
      const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
      const shot = await db.shots.where('blastLogId').equals(log.id).first();
      const dr = await db.dailyReports.where('blastDayId').equals(dayId).first();
      const roster = (await db.crewMembers.toArray()).filter((m) => m.isActive);
      const equip = (await db.equipment.toArray()).filter((e) => e.isActive);
      const crewOne = roster[0] ?? null;
      return { jobId, dayId, logId: log.id, shotId: shot?.id, drId: dr.id, crewOne, nEquip: equip.length, eqOne: equip[0]?.id };
    }, tag);
    ok('seeded day', Boolean(ids.dayId && ids.drId));

    // ── Shot #1 expanded on FRESH page load (hydration race fix) ──────────
    await dev.goto(`http://localhost:5199/blast-day/${ids.dayId}`);
    await dev.waitForTimeout(4000);
    const shotOpen = await dev.evaluate(() => {
      // 'Drill Parameters' subsection only renders when the shot card is expanded
      return document.body.innerText.includes('Drill Parameters');
    });
    ok('Shot #1 expanded without a click on fresh load', shotOpen);

    // ── Daily report: roster picker stamps crewMemberId ───────────────────
    await dev.getByText('Daily Report', { exact: true }).first().click();
    await dev.waitForTimeout(1000);
    await dev.getByRole('button', { name: /Add Worker/ }).click();
    await dev.waitForTimeout(800);
    if (ids.crewOne) {
      const newRow = await dev.evaluate(async (drId) => {
        const rows = await window.shotlogDb.workForceEntries.where('dailyReportId').equals(drId).toArray();
        return rows.find((r) => !r.workerName && !r.crewMemberId)?.id;
      }, ids.drId);
      // The blank row's select — pick the roster member by label
      const rowSel = dev.locator('select').filter({ hasText: 'Other / not on roster' }).last();
      await rowSel.selectOption(ids.crewOne.id);
      await dev.waitForTimeout(800);
      const stamped = await dev.evaluate(async ({ drId, id }) => {
        const rows = await window.shotlogDb.workForceEntries.where('dailyReportId').equals(drId).toArray();
        return rows.some((r) => r.crewMemberId === id.cid && r.workerName === id.name);
      }, { drId: ids.drId, id: { cid: ids.crewOne.id, name: ids.crewOne.name } });
      ok('roster pick stamps crewMemberId + name', stamped);
      // Switch that row to Other → free-text input appears, crewMemberId cleared
      await rowSel.selectOption('__other');
      await dev.waitForTimeout(800);
      const otherState = await dev.evaluate(async (drId) => {
        const rows = await window.shotlogDb.workForceEntries.where('dailyReportId').equals(drId).toArray();
        return rows.some((r) => !r.crewMemberId && r.workerName === '');
      }, ids.drId);
      const freeInput = await dev.locator('input[placeholder="Worker name"]').count();
      ok('Other clears crewMemberId + shows free text', otherState && freeInput > 0);
      void newRow;
    } else {
      results.push('SKIP roster picker (empty roster)');
    }

    // ── Equipment: grouped picker + bucket chip ───────────────────────────
    if (ids.nEquip > 0) {
      const hasGroups = await dev.evaluate(() => {
        const sels = [...document.querySelectorAll('select')];
        return sels.some((s) => s.querySelector('optgroup') && [...s.options].some((o) => o.value === '__other'));
      });
      ok('equipment select grouped by category', hasGroups);
      // Pick the first grouped asset in the first equipment row and check chip
      const picked = await dev.evaluate(async (eqOne) => {
        const sels = [...document.querySelectorAll('select')].filter(
          (s) => s.querySelector('optgroup') && [...s.options].some((o) => o.value === '__other'),
        );
        const sel = sels[0];
        if (!sel) return { done: false };
        sel.value = eqOne;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return { done: true };
      }, ids.eqOne);
      await dev.waitForTimeout(1000);
      const chipShown = await dev.evaluate(() => {
        const chips = [...document.querySelectorAll('span')].map((s) => s.textContent?.trim());
        return chips.some((t) => t === 'Vehicles' || t === 'Equip / Drills' || t === 'Mats / Seismo');
      });
      ok('picked row shows bucket chip', picked.done && chipShown);
    } else {
      results.push('SKIP equipment picker (empty registry)');
    }

    // ── Phone-portrait overflow scan (iPhone 17 Pro Max ~430 logical px) ──
    mob = await mk({ width: 430, height: 932 });
    const routes = [
      '/', '/days', '/jobs', `/jobs/${ids.jobId}`, '/reference', '/settings', '/profile',
      `/blast-day/${ids.dayId}`, `/blast-day/${ids.dayId}/design/${ids.shotId}`,
      `/blast-day/${ids.dayId}/seismo/${ids.shotId}`, '/records', '/drill-logs',
      ...(ids.eqOne ? [`/equipment/${ids.eqOne}`] : []),
      ...(ids.crewOne ? [`/crew/${ids.crewOne.id}`] : []),
      '/admin', '/admin/users', '/admin/catalog', '/admin/equipment', '/admin/incidents', '/admin/company',
      // /blast-day/:id/report intentionally excluded: paper-simulation preview
      // (7.7in .page layout, same family as the print pages)
    ];
    const scan = async () =>
      mob.evaluate(() => {
        const iw = window.innerWidth;
        const doc = document.documentElement;
        const main = document.querySelector('main');
        const stretched = doc.scrollWidth > iw + 1;
        const mainScrolls = Boolean(main && main.scrollWidth > main.clientWidth + 1);
        if (!stretched && !mainScrolls) return null;
        const offenders = [];
        for (const el of document.querySelectorAll('main *')) {
          const r = el.getBoundingClientRect();
          if (r.right > iw + 1 && r.width > 40) {
            // Contained-scroll widgets are fine; main's own overflow doesn't count
            let a = el.parentElement, contained = false;
            while (a && a !== main) {
              const s = getComputedStyle(a);
              if (/(auto|scroll)/.test(s.overflowX)) { contained = true; break; }
              a = a.parentElement;
            }
            if (!contained) {
              const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).split(' ').slice(0, 3).join('.');
              offenders.push(`${el.tagName.toLowerCase()}.${cls}(${Math.round(r.width)})`);
            }
          }
        }
        return { scrollWidth: Math.max(doc.scrollWidth, main?.scrollWidth ?? 0), iw, offenders: [...new Set(offenders)].slice(0, 5) };
      });
    for (const route of routes) {
      await mob.goto(`http://localhost:5199${route}`);
      await mob.waitForTimeout(2500);
      const res = await scan();
      if (res) results.push(`OVERFLOW ${route} sw=${res.scrollWidth}/${res.iw} :: ${res.offenders.join(' | ')}`);
      else results.push(`PASS no-overflow ${route}`);
    }
    // Daily Report tab on mobile too (the row grids live there)
    await mob.goto(`http://localhost:5199/blast-day/${ids.dayId}`);
    await mob.waitForTimeout(3000);
    await mob.getByText('Daily Report', { exact: true }).first().click();
    await mob.waitForTimeout(1500);
    const drScan = await scan();
    if (drScan) results.push(`OVERFLOW daily-report-tab sw=${drScan.scrollWidth}/${drScan.iw} :: ${drScan.offenders.join(' | ')}`);
    else results.push('PASS no-overflow daily-report-tab');
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await (mob ?? dev).locator('body').innerText()).slice(0, 300)); } catch {}
  }
  return results.join('\n');
}

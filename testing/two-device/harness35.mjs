async (page) => {
  // Round 5 — smart-list remnants: /days month-grouped, Jobs lens search,
  // DocList windowing (My Records + company book), job-detail work-day
  // windowing, View-as listing custom roles.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const mkCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
      localStorage.setItem('shotlog-tour-done', '1');
    `);
    return ctx;
  };
  const login = async (p, email, pass) => {
    await p.goto('http://localhost:5199');
    await p.locator('input[type="email"]').fill(email);
    await p.locator('input[type="password"]').fill(pass);
    await p.getByRole('button', { name: 'Sign in' }).click();
    await p.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await p.waitForTimeout(3500);
  };
  let A, ctxA;
  try {
    ctxA = await mkCtx();
    A = await ctxA.newPage();
    await login(A, 'mark@baystateblasting.com', 'dev-password-123');

    // ── (1) /days is the month-grouped list ─────────────────────────────
    await A.goto('http://localhost:5199/days');
    await A.waitForTimeout(2500);
    const days1 = await A.locator('body').innerText();
    ok('/days shows month groups with counts', /August 2026 · \d+ day/i.test(days1));
    ok('/days has older months collapsed', /July 2026 · \d+ day/i.test(days1));
    // July rows hidden until the month expands
    const julyRowVisible = /Mon, Jul|Tue, Jul|Wed, Jul|Thu, Jul|Fri, Jul|Sat, Jul|Sun, Jul/.test(days1);
    ok('older month rows stay behind the fold', !julyRowVisible);
    await A.getByText(/July 2026 · \d+ day/).first().click();
    await A.waitForTimeout(600);
    const days2 = await A.locator('body').innerText();
    ok('tapping a month expands its days',
      /Mon, Jul|Tue, Jul|Wed, Jul|Thu, Jul|Fri, Jul|Sat, Jul|Sun, Jul/.test(days2));

    // ── (2) Jobs lens search filters rows ───────────────────────────────
    await A.goto('http://localhost:5199/jobs');
    await A.waitForTimeout(2000);
    const jobsAll = await A.locator('body').innerText();
    const firstJobName = await A.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const jobs = await db.jobs.filter((j) => j.isActive && !j.archivedAt).toArray();
      return jobs[0]?.name ?? '';
    });
    const needle = firstJobName.split(' ')[0];
    await A.locator('input[placeholder="Search jobs…"]').fill(needle);
    await A.waitForTimeout(600);
    const jobsFiltered = await A.locator('body').innerText();
    ok('jobs search narrows the list',
      jobsFiltered.length < jobsAll.length && jobsFiltered.includes(firstJobName));

    // ── (3) DocList windowing on the company book ───────────────────────
    await A.goto('http://localhost:5199/records');
    await A.waitForTimeout(2500);
    // the DocList lives under the 'All documents' lens (default is Filed)
    await A.getByRole('button', { name: 'All documents' }).click();
    await A.waitForTimeout(1500);
    const docCount = await A.evaluate(async () => {
      const { buildDocRows } = await import('/src/lib/docRows.ts');
      const rows = await buildDocRows({ scope: 'company', role: 'admin' });
      return rows.length;
    });
    const rec1 = await A.locator('body').innerText();
    if (docCount > 15) {
      ok('company book windowed with Show-all', /Show all \d+ documents/i.test(rec1));
      await A.getByText(/Show all \d+ documents/).first().click();
      await A.waitForTimeout(600);
      const rec2 = await A.locator('body').innerText();
      ok('Show-all expands the window', !/Show all \d+ documents/i.test(rec2));
    } else {
      ok(`company book windowed with Show-all (only ${docCount} docs — window not needed)`, true);
      ok('Show-all expands the window (skipped — under window)', true);
    }

    // ── (4) Job-detail work days windowed ───────────────────────────────
    const busiest = await A.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const days = await db.blastDays.toArray();
      const byJob = new Map();
      for (const d of days) byJob.set(d.jobId, (byJob.get(d.jobId) ?? 0) + 1);
      const top = [...byJob.entries()].sort((a, b) => b[1] - a[1])[0];
      return top ? { jobId: top[0], n: top[1] } : null;
    });
    if (busiest && busiest.n > 8) {
      await A.goto(`http://localhost:5199/jobs/${busiest.jobId}`);
      await A.waitForTimeout(2500);
      // the section may be behind a tab — open Work days if present
      const tab = A.getByRole('button', { name: /Work days/i }).first();
      if (await tab.count()) await tab.click();
      await A.waitForTimeout(800);
      const jd = await A.locator('body').innerText();
      ok('job work-day list windowed', /Show all \d+ days/i.test(jd));
    } else {
      ok('job work-day list windowed (skipped — busiest job under window)', true);
    }

    // ── (5) View-as lists custom roles ──────────────────────────────────
    const defId = await A.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const { generateId, nowISO } = await import('/src/lib/utils.ts');
      const id = generateId();
      await db.roleDefinitions.add({
        id, key: 'swamper', name: 'Swamper', capabilities: ['author_field_reports'],
        homeDashboard: 'field', createdAt: nowISO(), updatedAt: nowISO(), syncStatus: 'local',
      });
      return id;
    });
    await A.waitForTimeout(1500);
    const hasSwamper = await A.evaluate(
      () => [...document.querySelectorAll('option')].some((o) => o.textContent?.trim() === 'Swamper'),
    );
    ok('View-as select lists the custom role', hasSwamper);
    await A.evaluate(async (id) => {
      const { deleteWithTombstone } = await import('/src/db/index.ts');
      await deleteWithTombstone('roleDefinitions', id);
    }, defId);
    await A.waitForTimeout(2500);

    await ctxA.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { if (A) results.push(`A URL ${A.url()}`); } catch {}
  }
  return results.join('\n');
}

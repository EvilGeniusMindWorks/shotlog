async (page) => {
  // Persona walkthrough instrumentation (audit round): for every persona,
  // visit their screens and measure content depth (screens of scroll),
  // list-row counts, and whether the screen offers search/filter. Feeds
  // the walkthrough audit + smart-list prioritization.
  const browser = page.context().browser();
  const out = [];
  const mkCtx = async (w = 1280, h = 900) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
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
  const measure = (route) => ({
    route,
    fn: () => {
      const main = document.querySelector('main');
      const el = main ?? document.documentElement;
      const rows = el.querySelectorAll(
        '[class*="min-h-[44px]"], [class*="rounded-lg border"], [class*="rounded-xl border"]',
      ).length;
      return {
        scroll: el.scrollHeight,
        vh: window.innerHeight,
        rows,
        search: !!el.querySelector('input[placeholder*="earch"], input[type="search"]'),
        chars: (el.innerText ?? '').length,
      };
    },
  });

  try {
    // Resolve shared record ids once (same company data for everyone)
    const ctx0 = await mkCtx();
    const P0 = await ctx0.newPage();
    await login(P0, 'mark@baystateblasting.com', 'dev-password-123');
    const ids = await P0.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const days = (await db.blastDays.toArray()).sort((a, b) => b.date.localeCompare(a.date));
      const day = days[0];
      const jobs = await db.jobs.toArray();
      const jobDayCount = new Map();
      for (const d of days) jobDayCount.set(d.jobId, (jobDayCount.get(d.jobId) ?? 0) + 1);
      const busiestJob = [...jobDayCount.entries()].sort((a, b) => b[1] - a[1])[0];
      const customers = await db.customers.toArray();
      const sites = await db.sites.toArray();
      const equipment = await db.equipment.toArray();
      const plans = (await db.drillPlans.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const logs = (await db.drillLogs.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const planLog = logs.find((l) => l.drillPlanId);
      return {
        dayId: day?.id,
        busiestJobId: busiestJob?.[0],
        busiestJobDays: busiestJob?.[1],
        totalDays: days.length,
        totalJobs: jobs.length,
        customerId: customers[0]?.id,
        siteId: sites[0]?.id,
        equipmentId: equipment[0]?.id,
        planId: plans[0]?.id,
        planJobId: plans[0]?.jobId,
        planLogId: planLog?.id,
        planLogPlanId: planLog?.drillPlanId,
        planLogJobId: planLog?.jobId,
      };
    });
    out.push(`IDS ${JSON.stringify(ids)}`);
    await ctx0.close();

    const PERSONAS = [
      {
        name: 'blaster', email: 'blaster@test.local', pass: 'blaster-pass-123',
        routes: ['/', '/days', '/records', '/jobs', '/reference',
          `/blast-day/${ids.dayId}`, `/jobs/${ids.busiestJobId}`],
      },
      {
        name: 'driller', email: 'dinis@test.local', pass: 'dinis-pass-123',
        routes: ['/', '/days', '/records', '/jobs',
          ...(ids.planId ? [`/jobs/${ids.planJobId}/drill-plan/${ids.planId}`] : []),
          ...(ids.planLogId ? [`/jobs/${ids.planLogJobId}/drill-plan/${ids.planLogPlanId}/log/${ids.planLogId}`] : [])],
      },
      {
        name: 'mechanic', email: 'mechanic@test.local', pass: 'mech-pass-1234',
        routes: ['/', '/admin/equipment', `/equipment/${ids.equipmentId}`, '/records', '/jobs'],
      },
      {
        name: 'supervisor', email: 'supervisor@test.local', pass: 'super-pass-123',
        routes: ['/', '/days', '/admin/people', '/admin/approvals', '/records', '/jobs'],
      },
      {
        name: 'office', email: 'office@test.local', pass: 'office-pass-123',
        routes: ['/', '/records', '/admin/incidents', '/jobs'],
      },
      {
        name: 'admin', email: 'mark@baystateblasting.com', pass: 'dev-password-123',
        routes: ['/', '/admin/people', '/admin/approvals', '/admin/catalog', '/admin/roles',
          '/admin/company', '/jobs', '/jobs?lens=customers', '/jobs?lens=sites', '/records',
          `/jobs/${ids.busiestJobId}`, `/customers/${ids.customerId}`, `/sites/${ids.siteId}`],
      },
    ];

    for (const p of PERSONAS) {
      const ctx = await mkCtx();
      const P = await ctx.newPage();
      await login(P, p.email, p.pass);
      for (const route of p.routes) {
        await P.goto(`http://localhost:5199${route}`);
        await P.waitForTimeout(1600);
        const m = await P.evaluate(measure(route).fn);
        out.push(
          `${p.name} ${route} | ${(m.scroll / m.vh).toFixed(1)} screens | ${m.rows} rows | search=${m.search ? 'Y' : 'n'} | ${m.chars} chars`,
        );
      }
      // phone-width dashboard for the field personas
      if (p.name === 'blaster' || p.name === 'driller') {
        await P.setViewportSize({ width: 430, height: 900 });
        await P.goto('http://localhost:5199/');
        await P.waitForTimeout(1600);
        const m = await P.evaluate(measure('/').fn);
        out.push(`${p.name} /@430px | ${(m.scroll / m.vh).toFixed(1)} screens | ${m.rows} rows`);
      }
      await ctx.close();
    }
  } catch (e) {
    out.push(`ERROR ${e.message}`);
  }
  return out.join('\n');
}

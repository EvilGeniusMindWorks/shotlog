async (page) => {
  // Nav round — role-specific rails (approved 2026-08-18): the rail names
  // each persona's nouns on one shared rhythm; Dashboard keeps its name;
  // admin console untouched; /drilling is the driller's thin page.
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
  const railFor = async (email, pass) => {
    const ctx = await mkCtx();
    const P = await ctx.newPage();
    await P.goto('http://localhost:5199');
    await P.locator('input[type="email"]').fill(email);
    await P.locator('input[type="password"]').fill(pass);
    await P.getByRole('button', { name: 'Sign in' }).click();
    await P.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await P.waitForTimeout(4000);
    const rail = await P.locator('aside').innerText();
    return { ctx, P, rail };
  };
  try {
    // Canonicalize dev passwords first (earlier harnesses may have reset
    // them) — dinis + mechanic via admin REST
    {
      const a0 = await railFor('mark@baystateblasting.com', 'dev-password-123');
      await a0.P.evaluate(async () => {
        const { authedFetch } = await import('/src/lib/session.ts');
        const { users } = await (await authedFetch('/users')).json();
        const reset = async (frag, pw) => {
          const u = users.find((x) => x.email.includes(frag));
          if (u)
            await authedFetch(`/users/${u.id}/reset-password`, {
              method: 'POST',
              body: JSON.stringify({ tempPassword: pw }),
            });
        };
        await reset('dinis@', 'dinis-pass-123');
        await reset('mechanic@', 'mech-pass-1234');
      });
      await a0.ctx.close();
    }

    // ── blaster: field rail, no Approvals ───────────────────────────────
    const b = await railFor('blaster@test.local', 'blaster-pass-123');
    ok('blaster rail: Dashboard · Work days · Jobs · My records · Reference',
      ['Dashboard', 'Work days', 'Jobs', 'My records', 'Reference'].every((x) => b.rail.includes(x)));
    ok('blaster rail: no Approvals, no Admin', !b.rail.includes('Approvals') && !b.rail.includes('Admin'));
    await b.ctx.close();

    // ── supervisor: field rail + Approvals + company Records ────────────
    const s = await railFor('supervisor@test.local', 'super-pass-123');
    ok('supervisor rail gains Approvals + Records label',
      s.rail.includes('Approvals') && s.rail.includes('Records') && !s.rail.includes('My records'));
    ok('supervisor keeps the Admin door', s.rail.includes('Admin'));
    await s.ctx.close();

    // ── driller: Drilling slot + thin page ──────────────────────────────
    const d = await railFor('dinis@test.local', 'dinis-pass-123');
    ok('driller rail: Dashboard · Drilling · Work days · My records',
      ['Dashboard', 'Drilling', 'Work days', 'My records'].every((x) => d.rail.includes(x)));
    ok('driller rail drops Jobs + Reference + Admin',
      !d.rail.includes('Jobs') && !d.rail.includes('Reference') && !d.rail.includes('Admin'));
    await d.P.goto('http://localhost:5199/drilling');
    await d.P.waitForTimeout(2500);
    const drillingBody = await d.P.locator('body').innerText();
    ok('/drilling is the thin work page',
      /Drilling/i.test(drillingBody) &&
      /(Open drill plans|Ready to drill|Assigned to you|No open drill plans)/i.test(drillingBody));
    await d.ctx.close();

    // ── mechanic: shop rail, Admin retired ──────────────────────────────
    const m = await railFor('mechanic@test.local', 'mech-pass-1234');
    ok('mechanic rail: Shop · Fleet · Locator · Records',
      ['Shop', 'Fleet', 'Locator', 'Records'].every((x) => m.rail.includes(x)));
    ok('mechanic rail: Admin door retired (Fleet promoted)',
      !m.rail.includes('Admin') && !m.rail.includes('Reference') && !m.rail.includes('Jobs'));
    await m.P.getByRole('link', { name: 'Fleet' }).click();
    await m.P.waitForTimeout(2000);
    ok('Fleet lands on the registry', m.P.url().includes('/admin/equipment'));
    await m.ctx.close();

    // ── office: provisional rail ────────────────────────────────────────
    const o = await railFor('office@test.local', 'office-pass-123');
    ok('office rail: Dashboard · Records · Jobs · Incidents',
      ['Dashboard', 'Records', 'Jobs', 'Incidents'].every((x) => o.rail.includes(x)));
    ok('office rail drops Reference + Admin', !o.rail.includes('Reference') && !o.rail.includes('Admin'));
    await o.ctx.close();

    // ── admin: classic rail untouched (fold-in deferred) ────────────────
    const a = await railFor('mark@baystateblasting.com', 'dev-password-123');
    ok('admin rail unchanged: Dashboard · Records · Jobs · Reference · Admin',
      ['Dashboard', 'Records', 'Jobs', 'Reference', 'Admin'].every((x) => a.rail.includes(x)));
    await a.ctx.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
  }
  return results.join('\n');
}

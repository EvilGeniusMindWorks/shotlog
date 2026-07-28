async (page) => {
  // Prod verification of the doc-first round: Start grid on the (view-as
  // blaster) dashboard, job sheet opens, DrillPlanCard on the real day page.
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const JOB = 'f0bd051f-36aa-4634-a8f3-9efa5dbb5571';
  let p;
  try {
    const ctx = await page.context().browser().newContext();
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', 'https://shotlogserver-production.up.railway.app');
      localStorage.setItem('shotlog-access-token', '__TOKEN__');
      localStorage.setItem('shotlog-refresh-token', 'probe-not-a-real-refresh-token');
      localStorage.setItem('shotlog-user-email', 'mark@baystateblasting.com');
      localStorage.setItem('shotlog-user-info', JSON.stringify({
        id: 'f0894fa6-1a84-48fa-b31f-628937f64677',
        name: 'Mark Swihart', email: 'mark@baystateblasting.com', role: 'admin',
        companyId: '00000000-0000-4000-8000-000000000001',
        companyName: 'Baystate Blasting, Inc.', licenses: [],
      }));
      localStorage.setItem('shotlog-view-role', 'blaster');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
    `);
    p = await ctx.newPage();
    await p.goto('https://shotlog-app.vercel.app');
    await p.waitForTimeout(12000); // hydration

    const body = await p.locator('body').innerText();
    ok('Start grid live in prod (view-as blaster)', /start something/i.test(body));
    ok('tiles present', body.includes('Blast Day') && body.includes('Drill Plan') && body.includes('Rig Checklist'));

    // Tile → job sheet opens (no create — close it right after)
    await p.getByRole('button', { name: /Blast Day/ }).click();
    await p.waitForTimeout(1200);
    const sheet = await p.locator('body').innerText();
    ok('job sheet opens with real jobs', sheet.includes('Which job?') && sheet.includes('Route 3'));
    await p.keyboard.press('Escape').catch(() => undefined);
    await p.mouse.click(10, 10); // dismiss overlay

    // Real day page shows the DrillPlanCard
    await p.goto(`https://shotlog-app.vercel.app/jobs/${JOB}`);
    await p.waitForTimeout(4000);
    await p.getByText(/Jul 24|07\/24|7\/24\/2026/).first().click();
    await p.waitForURL(/blast-day\//, { timeout: 15000 });
    await p.waitForTimeout(4000);
    const dayTxt = await p.locator('body').innerText();
    ok('DrillPlanCard on real day page', dayTxt.includes('Drill Plan'));
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await p.locator('body').innerText()).slice(0, 300)); } catch {}
  }
  return results.join('\n');
}

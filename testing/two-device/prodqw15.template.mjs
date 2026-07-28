async (page) => {
  // Prod verification of the quick-wins round at iPhone-portrait width:
  // no sideways scroll on core routes, Shot #1 expanded on the real 07/24 day,
  // roster picker + grouped equipment picker present on the daily report.
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const JOB = 'f0bd051f-36aa-4634-a8f3-9efa5dbb5571';
  let mob;
  try {
    const ctx = await page.context().browser().newContext({ viewport: { width: 430, height: 932 } });
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
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
    `);
    mob = await ctx.newPage();
    await mob.goto('https://shotlog-app.vercel.app');
    await mob.waitForTimeout(10000); // PowerSync hydration

    const scan = async () =>
      mob.evaluate(() => {
        const iw = window.innerWidth;
        const doc = document.documentElement;
        const main = document.querySelector('main');
        return doc.scrollWidth > iw + 1 || Boolean(main && main.scrollWidth > main.clientWidth + 1);
      });

    results.push((await scan()) ? 'OVERFLOW /' : 'PASS no-overflow /');

    await mob.goto(`https://shotlog-app.vercel.app/jobs/${JOB}`);
    await mob.waitForTimeout(4000);
    results.push((await scan()) ? 'OVERFLOW /jobs/:id' : 'PASS no-overflow /jobs/:id');

    await mob.getByText(/Jul 24|07\/24|7\/24\/2026/).first().click();
    await mob.waitForURL(/blast-day\//, { timeout: 15000 });
    await mob.waitForTimeout(4000);
    results.push((await scan()) ? 'OVERFLOW day page' : 'PASS no-overflow day page');
    ok('Shot #1 expanded on real day', await mob.evaluate(() => document.body.innerText.includes('Drill Parameters')));

    await mob.getByText('Daily Report', { exact: true }).first().click();
    await mob.waitForTimeout(2500);
    results.push((await scan()) ? 'OVERFLOW daily report tab' : 'PASS no-overflow daily report tab');
    const pickers = await mob.evaluate(() => {
      const sels = [...document.querySelectorAll('select')];
      return {
        roster: sels.some((s) => [...s.options].some((o) => o.textContent?.includes('Other / not on roster'))),
        grouped: sels.some((s) => s.querySelector('optgroup')),
      };
    });
    ok('roster picker live in prod', pickers.roster);
    ok('grouped equipment picker live in prod', pickers.grouped);
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await mob.locator('body').innerText()).slice(0, 300)); } catch {}
  }
  return results.join('\n');
}

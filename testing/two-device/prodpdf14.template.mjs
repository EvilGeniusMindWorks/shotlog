async (page) => {
  // Prod verification of the PDF polish round: regenerate the REAL Route 3
  // Widening 07/24 blast log + daily report PDFs on shotlog-app.vercel.app.
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const OUT = '/private/tmp/claude-501/-Users-matthewbulmer-Documents-Code-shotlog/d2d2c320-b4ff-4b90-b251-2a8a202badf3/scratchpad';
  const JOB = 'f0bd051f-36aa-4634-a8f3-9efa5dbb5571';
  let dev;
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
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
    `);
    dev = await ctx.newPage();
    await dev.goto('https://shotlog-app.vercel.app');
    await dev.waitForSelector('text=Dashboard', { timeout: 30000 });
    await dev.waitForTimeout(8000); // PowerSync hydration

    await dev.goto(`https://shotlog-app.vercel.app/jobs/${JOB}`);
    await dev.waitForTimeout(3000);
    // Day-history rows are click-handlers, not anchors — click and read URL
    await dev.getByText(/Jul 24|07\/24|7\/24\/2026/).first().click();
    await dev.waitForURL(/blast-day\//, { timeout: 15000 });
    const dayId = dev.url().match(/blast-day\/([0-9a-f-]+)/)[1];
    ok('found 07/24 day on job page', Boolean(dayId));

    const grab = async (route, outName, readySel) => {
      await dev.goto(`https://shotlog-app.vercel.app${route}`);
      await dev.waitForSelector(readySel, { timeout: 20000 });
      await dev.waitForTimeout(3000);
      const [download] = await Promise.all([
        dev.waitForEvent('download', { timeout: 120000 }),
        dev.getByRole('button', { name: 'Save PDF' }).click(),
      ]);
      await download.saveAs(`${OUT}/${outName}`);
    };
    await grab(`/blast-day/${dayId}/print`, 'prod-blast-log.pdf', 'text=Blasting Log');
    ok('prod blast log PDF downloaded', true);
    await grab(`/blast-day/${dayId}/print-daily`, 'prod-daily-report.pdf', 'text=DAILY REPORT');
    ok('prod daily report PDF downloaded', true);
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await dev.locator('body').innerText()).slice(0, 300)); } catch {}
  }
  return results.join('\n');
}

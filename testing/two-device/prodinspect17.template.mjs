async (page) => {
  // Inspect prod: active job count + any day created TODAY (Jul 28) that my
  // probe tap may have created. Report only — no writes.
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
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
    `);
    p = await ctx.newPage();
    await p.goto('https://shotlog-app.vercel.app');
    await p.waitForTimeout(12000);
    const report = await p.evaluate(async () => {
      // dev hooks absent in prod — use raw IndexedDB? No: PowerSync SQLite.
      // The app exposes nothing; read via the page's own modules is not
      // possible here. Fall back to UI: count jobs page rows + days list.
      return null;
    });
    void report;
    await p.goto('https://shotlog-app.vercel.app/jobs');
    await p.waitForTimeout(4000);
    const jobsTxt = await p.locator('body').innerText();
    await p.goto('https://shotlog-app.vercel.app/days');
    await p.waitForTimeout(4000);
    const daysTxt = await p.locator('body').innerText();
    return JSON.stringify({
      jobsPage: jobsTxt.slice(0, 800),
      daysPage: daysTxt.slice(0, 1200),
    });
  } catch (e) {
    return `ERROR ${e.message}`;
  }
}

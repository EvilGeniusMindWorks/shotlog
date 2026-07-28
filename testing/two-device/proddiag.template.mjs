async (page) => {
  // Live diagnosis: does a fresh prod session connect? Read chip state, sync
  // panel, and the connection event log (shipped in the offline-trust round).
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
    const consoleMsgs = [];
    p.on('console', (m) => {
      const t = m.text();
      if (/powersync|sync|error|fail|token/i.test(t)) consoleMsgs.push(t.slice(0, 200));
    });
    await p.goto('https://shotlog-app.vercel.app');
    await p.waitForTimeout(20000); // give the stream time to connect or fail

    const chipTxt = await p
      .locator('button[title="Sync status — tap for details"]')
      .first()
      .innerText();
    const log = await p.evaluate(() => localStorage.getItem('shotlog-sync-log'));
    return JSON.stringify(
      { chip: chipTxt, syncLog: JSON.parse(log ?? '[]').slice(-12), console: consoleMsgs.slice(-15) },
      null,
      2,
    );
  } catch (e) {
    return `ERROR ${e.message}`;
  }
}

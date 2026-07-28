async (page) => {
  // Prod verification of the offline-trust round: truthful SyncChip live,
  // panel opens with Reconnect + connection log, data renders (no regression).
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
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
    await p.waitForTimeout(12000); // hydration + stream connect

    const body = await p.locator('body').innerText();
    ok('SyncChip shows a truthful state', /All changes saved|Syncing|Can't reach server|Connecting/.test(body));
    ok('dashboard data rendered', body.includes('Route 3') || body.includes('Active Jobs'));

    await p.locator('button[title="Sync status — tap for details"]').first().click();
    await p.waitForTimeout(1500);
    const panel = await p.locator('body').innerText();
    ok('sync panel: queued + last synced + log', panel.includes('Waiting to send') && panel.includes('Last synced'));
    ok('connected in prod (panel state)', panel.includes('All changes saved'));
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await p.locator('body').innerText()).slice(0, 300)); } catch {}
  }
  return results.join('\n');
}

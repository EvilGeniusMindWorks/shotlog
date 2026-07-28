async (page) => {
  // Prod UI verification: Audit lens renders the probe's entries in plain
  // speech; binder export button present on the Filed lens.
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
    await p.goto('https://shotlog-app.vercel.app/records');
    await p.waitForTimeout(10000);
    const filedTxt = await p.locator('body').innerText();
    ok('binder export button on Filed lens', /export binder/i.test(filedTxt));
    await p.getByRole('button', { name: 'Audit', exact: true }).click();
    await p.waitForTimeout(5000);
    const txt = await p.locator('body').innerText();
    ok('Audit lens renders entries', /created|→/.test(txt));
    ok('probe diff in plain speech', txt.includes('Probe: 1 → 2'));
    ok('deletion entry shown', txt.includes('deleted'));
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await p.locator('body').innerText()).slice(0, 300)); } catch {}
  }
  return results.join('\n');
}

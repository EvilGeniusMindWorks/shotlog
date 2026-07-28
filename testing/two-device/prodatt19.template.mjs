async (page) => {
  // Prod verification, real UI: attach a photo on device A → uploader lands it
  // in R2 (cloud badge) → device B sees the thumb and opens the full image via
  // presigned download → cleanup (remove the probe photo).
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const JOB = 'f0bd051f-36aa-4634-a8f3-9efa5dbb5571';
  const PNG_PATH =
    '/private/tmp/claude-501/-Users-matthewbulmer-Documents-Code-shotlog/d2d2c320-b4ff-4b90-b251-2a8a202badf3/scratchpad/probe-roundtrip.png';
  let a, b;
  const mk = async (ctx0) => {
    const ctx = await ctx0.browser().newContext();
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
    const p = await ctx.newPage();
    p.on('dialog', (d) => void d.accept());
    await p.goto('https://shotlog-app.vercel.app');
    await p.waitForTimeout(12000);
    return p;
  };
  const openDay = async (p) => {
    await p.goto(`https://shotlog-app.vercel.app/jobs/${JOB}`);
    await p.waitForTimeout(4000);
    await p.getByText(/Jul 24|07\/24|7\/24\/2026/).first().click();
    await p.waitForURL(/blast-day\//, { timeout: 15000 });
    await p.waitForTimeout(4000);
  };
  try {
    a = await mk(page.context());
    await openDay(a);
    // Attach through the real card input (day-level Attachments card)
    const input = a.locator('input[type="file"][multiple]').first();
    await input.setInputFiles(PNG_PATH);
    await a.waitForTimeout(3000);
    const tile = a.locator('button[title*="probe-roundtrip.png"]').first();
    ok('tile renders after capture', (await tile.count()) > 0);
    // Cloud badge = uploaded to R2
    const stored = await (async () => {
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        if ((await a.locator('[title="Backed up"]').count()) > 0) return true;
        await a.waitForTimeout(1500);
      }
      return false;
    })();
    ok('uploader landed it in R2 (cloud badge)', stored);

    // Device B: fresh profile — thumb via sync, full image via presign
    b = await mk(page.context());
    await openDay(b);
    const tileB = b.locator('button[title*="probe-roundtrip.png"]').first();
    const seen = await (async () => {
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        if ((await tileB.count()) > 0) return true;
        await b.waitForTimeout(1500);
        await b.reload();
        await b.waitForTimeout(3000);
      }
      return false;
    })();
    ok('device B sees the attachment tile', seen);
    if (seen) {
      await tileB.scrollIntoViewIfNeeded();
      await tileB.click();
      await b.waitForTimeout(4000);
      const imgShown = await b.evaluate(() => {
        const img = document.querySelector('.fixed.inset-0 img');
        return Boolean(img && img.src.startsWith('blob:'));
      });
      ok('device B opened the full image from R2', imgShown);
      await b.keyboard.press('Escape').catch(() => undefined);
      await b.mouse.click(5, 5);
    }

    // Cleanup: remove the probe photo (Remove button is group-hover; force)
    await a.locator('button[title="Remove"]').first().click({ force: true });
    await a.waitForTimeout(2500);
    ok('probe photo removed', (await a.locator('button[title*="probe-roundtrip.png"]').count()) === 0);
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await (b ?? a).locator('body').innerText()).slice(0, 300)); } catch {}
  }
  return results.join('\n');
}

async (page) => {
  // Brand switch (2026-09-07): the final-kit mark (mushroom cloud + shockwave
  // on a navy tile) is the one logo everywhere — favicon, PWA/home-screen
  // icons, sidebar + mobile header, sign-in / enroll / reset frames, the
  // install card, the invite email header. Static assets must be served.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  const API = 'http://localhost:4000';
  const WEB = 'http://localhost:5199';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(`
    localStorage.setItem('shotlog-server-url', '${API}');
    localStorage.setItem('shotlog-last-active', String(Date.now()));
    localStorage.setItem('shotlog-pin', 'x');
    localStorage.setItem('shotlog-tour-done', '1');
    localStorage.setItem('shotlog-first-week-hidden', '1');
  `);
  const P = await ctx.newPage();
  try {
    await P.goto(WEB);
    await P.locator('input[type="email"]').waitFor({ timeout: 15000 });
    const assets = await P.evaluate(async () => {
      const urls = ['/favicon.svg', '/favicon.ico', '/icon-192.png', '/icon-512.png', '/icon-512-maskable.png', '/apple-touch-icon.png', '/shotlog-lockup-dark.png', '/shotlog-icon.svg'];
      const out = {};
      for (const u of urls) out[u] = (await fetch(u)).status;
      return out;
    });
    ok(`every brand asset is served (${Object.values(assets).join(',')})`, Object.values(assets).every((s) => s === 200));
    const head = await P.evaluate(() => ({
      theme: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
      svg: document.querySelector('link[rel="icon"][type="image/svg+xml"]')?.getAttribute('href'),
      ico: document.querySelector('link[rel="icon"][sizes="48x48"]')?.getAttribute('href'),
      touch: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
    }));
    ok('head: brand navy theme-color, svg + ico favicons, apple-touch-icon', head.theme === '#1C3859' && head.svg === '/favicon.svg' && head.ico === '/favicon.ico' && head.touch === '/apple-touch-icon.png');
    // sign-in frame: tile + SHOTLOG, no trace of the old crosshair mark
    const signin = await P.locator('main, body').first().innerHTML();
    ok('sign-in frame shows the new tile (navy #1C3859 rounded square) and SHOTLOG', /fill="#1C3859"/.test(signin) && /SHOT<span/.test(signin) && !/#DD6B20/.test(signin));
    await P.screenshot({ path: '.playwright-mcp/brand-login.png' });
    await P.locator('input[type="email"]').fill('mark@baystateblasting.com');
    await P.locator('input[type="password"]').fill('dev-password-123');
    await P.getByRole('button', { name: 'Sign in' }).click();
    await P.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await P.waitForTimeout(2500);
    if (await P.getByRole('button', { name: /Let.s go/ }).count()) {
      await P.getByRole('button', { name: /Let.s go/ }).click();
      await P.waitForTimeout(600);
    }
    if (await P.locator('[data-tour-skip]').count()) await P.locator('[data-tour-skip]').click();
    await P.waitForTimeout(500);
    ok('desktop sidebar carries the brand logo', (await P.locator('aside [data-brand-logo]').count()) === 1);
    ok('no old orange crosshair mark anywhere in the shell', (await P.locator('rect[fill="#DD6B20"]').count()) === 0);
    await P.screenshot({ path: '.playwright-mcp/brand-shell.png' });
    await P.setViewportSize({ width: 420, height: 800 });
    await P.waitForTimeout(400);
    ok('mobile header carries the brand logo', (await P.locator('header [data-brand-logo]').count()) === 1);
    await P.screenshot({ path: '.playwright-mcp/brand-mobile.png' });
    // Settings › Install card shows the real app icon (the tile) so people know what to look for
    await P.setViewportSize({ width: 1280, height: 800 });
    await P.goto(`${WEB}/settings`);
    await P.waitForTimeout(1500);
    const card = P.locator('[data-install-card]');
    if (await card.count()) {
      ok('install card shows the app tile', (await card.locator('svg rect[fill="#1C3859"]').count()) === 1);
    } else {
      results.push('SKIP install card not offered in this browser (no beforeinstallprompt) — tile checked on the welcome screen path in harness37');
    }
    // enroll + reset frames render the logo before any token check
    await P.goto(`${WEB}/enroll/not-a-real-token`);
    await P.waitForTimeout(1200);
    ok('enroll page shows the brand logo', (await P.locator('[data-brand-logo]').count()) === 1);
    await P.goto(`${WEB}/reset/not-a-real-token`);
    await P.waitForTimeout(1200);
    ok('reset page shows the brand logo', (await P.locator('[data-brand-logo]').count()) === 1);
    // invite email header carries the lockup image hosted on the app
    const tok = await P.evaluate(() => localStorage.getItem('shotlog-access-token'));
    const preview = await page.request.fetch(`${API}/health`);
    ok('api reachable for the email check', preview.ok());
    const mail = await P.evaluate(async () => {
      // the server renders the same layout for invites; ask the debug endpoint if present
      const r = await fetch('http://localhost:4000/auth/debug/mail-preview').catch(() => null);
      return r && r.ok ? r.text() : null;
    });
    if (mail) ok('email header uses the hosted lockup', /shotlog-lockup-dark\.png/.test(mail));
    else results.push('SKIP no mail preview endpoint — email layout checked by unit read (email.ts uses /shotlog-lockup-dark.png)');
    void tok;
  } catch (e) {
    results.push(`ERROR ${e.message}`);
  } finally {
    await ctx.close();
  }
  return results.join('\n');
}

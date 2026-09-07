async (page, lib) => {
  // Installed-app safe areas (Matthew, 2026-09-07): as a PWA the page runs
  // edge to edge, so the mobile header and bottom nav pad by the device's
  // safe-area insets (status bar / notch / home indicator / corners).
  // Desktop Chromium reports every inset as 0, so this proves the WIRING
  // (viewport-fit, the metas, the strip, the padding classes) and that the
  // phone layout is unchanged in a browser — the phone look is Matthew's.
  const { mkCtx, signIn, skipTours, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();

  await R.section('head: viewport-fit=cover + installed-app metas', async () => {
    const ctx = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
    const P = await ctx.newPage();
    await P.goto(WEB);
    const head = await P.evaluate(() => ({
      viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
      capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content'),
      statusBar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute('content'),
      title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content'),
      vars: getComputedStyle(document.documentElement).getPropertyValue('--sab').trim(),
    }));
    R.ok('viewport asks for edge-to-edge (viewport-fit=cover)', /viewport-fit=cover/.test(head.viewport));
    R.ok('iOS: web-app capable, translucent status bar, titled ShotLog', head.capable === 'yes' && head.statusBar === 'black-translucent' && head.title === 'ShotLog');
    R.ok(`safe-area variables are defined on :root (--sab = "${head.vars}")`, head.vars.length > 0);
    await ctx.close();
  });

  await R.section('phone layout: strip above the header, padded nav, lifted FAB', async () => {
    const ctx = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
    const P = await ctx.newPage();
    await signIn(P, 'blaster');
    await skipTours(P);
    await P.locator('[data-tour="nav"]').waitFor({ timeout: 10000 });
    const m = await P.evaluate(() => {
      const strip = document.querySelector('[data-safe-top]');
      const header = document.querySelector('header');
      const nav = document.querySelector('[data-tour="nav"]');
      const main = document.querySelector('main');
      const fab = document.querySelector('[data-tour="fab"]');
      const cs = (el) => (el ? getComputedStyle(el) : null);
      return {
        strip: Boolean(strip), stripH: strip?.getBoundingClientRect().height, stripBg: cs(strip)?.backgroundColor,
        headerBg: cs(header)?.backgroundColor, headerTop: header?.getBoundingClientRect().top,
        navBottom: nav?.getBoundingClientRect().bottom, navPad: cs(nav)?.paddingBottom, navH: nav?.getBoundingClientRect().height,
        mainPad: cs(main)?.paddingBottom,
        fabBottom: fab ? window.innerHeight - fab.getBoundingClientRect().bottom : null,
        innerH: window.innerHeight,
      };
    });
    R.ok('the navy status-bar strip exists above the header and is 0 px tall in a browser', m.strip && m.stripH === 0 && m.stripBg === m.headerBg);
    R.ok('in a browser the header still starts at the very top (nothing moved)', m.headerTop === 0);
    // 64 px of nav + its 1 px top border
    R.ok(`the bottom nav pads by the inset (0 px here) and still hugs the bottom edge`, m.navPad === '0px' && Math.round(m.navBottom) === m.innerH && Math.round(m.navH) === 65);
    R.ok(`main content keeps its 5 rem clearance under the nav (${m.mainPad})`, parseFloat(m.mainPad) >= 80);
    R.ok(`the + button keeps its 6 rem clearance above the nav (${m.fabBottom} px)`, m.fabBottom !== null && Math.round(m.fabBottom) === 96);
    await P.screenshot({ path: '.playwright-mcp/safe-area-browser.png' });
    // Simulate a phone's insets by overriding the variables the utilities read:
    // the same classes must move the bars by exactly that much
    await P.addStyleTag({ content: ':root{--sat:47px;--sab:34px;--sal:0px;--sar:0px}' });
    await P.waitForTimeout(200);
    const s = await P.evaluate(() => {
      const strip = document.querySelector('[data-safe-top]');
      const header = document.querySelector('header');
      const nav = document.querySelector('[data-tour="nav"]');
      const fab = document.querySelector('[data-tour="fab"]');
      const icons = nav ? [...nav.querySelectorAll('a')].map((a) => a.getBoundingClientRect().bottom) : [];
      return {
        mainPad: getComputedStyle(document.querySelector('main')).paddingBottom,
        stripH: strip?.getBoundingClientRect().height,
        headerTop: header?.getBoundingClientRect().top,
        navH: nav?.getBoundingClientRect().height,
        iconsBottom: Math.max(...icons),
        fabBottom: fab ? window.innerHeight - fab.getBoundingClientRect().bottom : null,
        innerH: window.innerHeight,
      };
    });
    R.ok(`with a 47 px status bar the header drops below it (strip ${s.stripH} px, header top ${s.headerTop} px)`, s.stripH === 47 && s.headerTop === 47);
    R.ok(`with a 34 px home-indicator zone the nav grows (${s.navH} px) and its icons end ≥ 34 px above the edge (icons end ${Math.round(s.iconsBottom)} of ${s.innerH})`, Math.round(s.navH) === 99 && Math.round(s.innerH - s.iconsBottom) >= 34);
    R.ok(`content clearance grows with it (${s.mainPad})`, Math.round(parseFloat(s.mainPad)) === 114);
    R.ok(`the + button rises by the same 34 px (${s.fabBottom} px from the edge)`, Math.round(s.fabBottom) === 130);
    await P.screenshot({ path: '.playwright-mcp/safe-area-installed.png' });
    await ctx.close();
  });

  return R.summary();
}

async (page, lib) => {
  // Installed-app safe areas (Matthew, 2026-09-07, second pass after his
  // phone screenshot): as a PWA the page runs edge to edge, so the mobile
  // header and bottom nav pad by the device's safe-area insets. The nav is
  // a SHORT tab bar (labels just above the home-indicator zone, no dead
  // band), the header keeps its 1 rem side padding plus any side inset,
  // and its icons are 24 px. Desktop Chromium reports every inset as 0,
  // so §2 proves the wiring and §3 simulates a phone's insets by
  // overriding the variables the utilities read.
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

  const ctx = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
  const P = await ctx.newPage();
  const measure = () =>
    P.evaluate(() => {
      const strip = document.querySelector('[data-safe-top]');
      const header = document.querySelector('header');
      const nav = document.querySelector('[data-tour="nav"]');
      const main = document.querySelector('main');
      const fab = document.querySelector('[data-tour="fab"]');
      const cs = (el) => (el ? getComputedStyle(el) : null);
      const links = nav ? [...nav.querySelectorAll('a')] : [];
      const icons = header ? [...header.querySelectorAll('button svg')].map((s) => s.getBoundingClientRect().height) : [];
      return {
        strip: Boolean(strip), stripH: strip?.getBoundingClientRect().height ?? -1, stripBg: cs(strip)?.backgroundColor,
        headerBg: cs(header)?.backgroundColor, headerTop: header?.getBoundingClientRect().top,
        headerPadL: parseFloat(cs(header)?.paddingLeft ?? '0'), headerPadR: parseFloat(cs(header)?.paddingRight ?? '0'),
        headerIconMin: Math.min(...icons),
        navBottom: nav?.getBoundingClientRect().bottom, navPad: parseFloat(cs(nav)?.paddingBottom ?? '0'), navH: nav?.getBoundingClientRect().height,
        labelsEnd: Math.max(...links.map((a) => a.getBoundingClientRect().bottom)),
        mainPad: parseFloat(cs(main)?.paddingBottom ?? '0'),
        fabBottom: fab ? window.innerHeight - fab.getBoundingClientRect().bottom : null,
        innerH: window.innerHeight,
      };
    });

  await R.section('in a browser: nothing at the edges moves, bars are compact', async () => {
    await signIn(P, 'blaster');
    await skipTours(P);
    await P.locator('[data-tour="nav"]').waitFor({ timeout: 10000 });
    const m = await measure();
    R.ok('the navy status-bar strip exists above the header and is 0 px tall in a browser', m.strip && m.stripH === 0 && m.stripBg === m.headerBg);
    R.ok('the header starts at the very top and keeps its 1 rem side padding', m.headerTop === 0 && m.headerPadL === 16 && m.headerPadR === 16);
    R.ok(`header icons are 24 px (smallest ${m.headerIconMin} px)`, m.headerIconMin >= 24);
    R.ok(`the nav hugs the bottom edge with 0.5 rem under the labels (pad ${m.navPad} px, height ${Math.round(m.navH)} px)`, Math.round(m.navBottom) === m.innerH && m.navPad === 8 && m.navH < 80);
    R.ok(`labels end just above the nav's bottom padding (${Math.round(m.innerH - m.labelsEnd)} px from the edge)`, Math.round(m.innerH - m.labelsEnd) >= 8 && Math.round(m.innerH - m.labelsEnd) <= 12);
    R.ok(`main content clears the nav (${m.mainPad} px ≥ nav ${Math.round(m.navH)} px)`, m.mainPad >= m.navH);
    R.ok(`the + button sits clear of the nav (${Math.round(m.fabBottom)} px from the edge)`, m.fabBottom !== null && m.fabBottom > m.navH + 16);
    await P.screenshot({ path: '.playwright-mcp/safe-area-browser.png' });
  });

  await R.section('installed (simulated 47/34 px insets): everything pads by exactly the inset', async () => {
    await P.addStyleTag({ content: ':root{--sat:47px;--sab:34px;--sal:0px;--sar:0px}' });
    await P.waitForTimeout(200);
    const s = await measure();
    R.ok(`the header drops below a 47 px status bar (strip ${s.stripH} px, header top ${s.headerTop} px)`, s.stripH === 47 && s.headerTop === 47);
    R.ok(`the nav pads by the 34 px home-indicator zone (pad ${s.navPad} px)`, s.navPad === 34);
    R.ok(`labels end just above the zone (${Math.round(s.innerH - s.labelsEnd)} px from the edge) — no dead band`, Math.round(s.innerH - s.labelsEnd) >= 34 && Math.round(s.innerH - s.labelsEnd) <= 38);
    R.ok(`main content clearance grows with it (${s.mainPad} px ≥ nav ${Math.round(s.navH)} px)`, s.mainPad >= s.navH);
    R.ok(`the + button rises by the same 34 px (${Math.round(s.fabBottom)} px from the edge)`, s.fabBottom > s.navH + 16);
    await P.screenshot({ path: '.playwright-mcp/safe-area-installed.png' });
    // landscape corners: side insets pad the header, never squeeze it to the edge
    await P.addStyleTag({ content: ':root{--sal:44px;--sar:44px}' });
    await P.waitForTimeout(150);
    const l = await measure();
    R.ok(`a 44 px side inset adds to the header's padding (${l.headerPadL}/${l.headerPadR} px)`, l.headerPadL === 60 && l.headerPadR === 60);
    await ctx.close();
  });

  return R.summary();
}

async (page, lib) => {
  // The help guide (S8 item 2, plan 16b5f92f, 2026-09-08): public /help
  // without a session; sections › pages › page on a phone; TOC · page ·
  // on-this-page on a wide screen; search; draft and planned banners;
  // the three doors (? menu, About this screen, Settings); route → page.
  const { mkCtx, signIn, skipTours, sleep, WEB } = lib;
  const browser = page.context().browser();
  const R = lib.report();

  await R.section('public: the guide opens without signing in', async () => {
    const c0 = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
    const P0 = await c0.newPage();
    await P0.goto(`${WEB}/help`);
    await P0.locator('[data-help-home]').waitFor({ timeout: 15000 });
    R.ok('/help renders the landing with no session (no sign-in form)', (await P0.locator('input[type="email"]').count()) === 0 && (await P0.locator('[data-help-section-link]').count()) >= 8);
    R.ok('the header offers Sign in, not Back to ShotLog', (await P0.locator('[data-help-to-app]').innerText()) === 'Sign in');
    await P0.locator('[data-help-section-link="start-here"]').click();
    await P0.locator('[data-help-section="start-here"]').waitFor({ timeout: 5000 });
    R.ok('Start here lists its eight pages (What\'s new joined in S10)', (await P0.locator('[data-help-page-link]').count()) === 8);
    await P0.locator('[data-help-page-link="your-pin"]').click();
    await P0.locator('[data-help-article="your-pin"]').waitFor({ timeout: 5000 });
    const art = await P0.locator('[data-help-article]').innerText();
    R.ok('a page renders its headings and text', /Why a PIN and not the password/.test(art) && /Forgot it/.test(art));
    R.ok('"On this page" chips on the phone', (await P0.locator('[data-help-onthis] a').count()) >= 3);
    R.ok('a draft page says so, with a feedback link', (await P0.locator('[data-help-status="draft"]').count()) === 1);
    R.ok('prev / next walk the section', (await P0.locator('[data-help-prev]').count()) === 1 && (await P0.locator('[data-help-next]').count()) === 1);
    await P0.locator('[data-help-back]').click();
    await P0.locator('[data-help-section="start-here"]').waitFor({ timeout: 5000 });
    R.ok('back goes up one level', true);
    await P0.goto(`${WEB}/help/driller/the-drill-log`);
    await P0.locator('[data-help-article="the-drill-log"]').waitFor({ timeout: 8000 });
    const all = await P0.evaluate(async () => { const { HELP_PAGES } = await import('/src/help/index.ts'); return { n: HELP_PAGES.length, planned: HELP_PAGES.filter((p) => p.status === 'planned').length, sections: new Set(HELP_PAGES.map((p) => p.section)).size }; });
    R.ok(`every page is written: ${all.n} pages in ${all.sections} sections, none planned`, all.n >= 59 && all.planned === 0 && all.sections === 9);
    await P0.goto(`${WEB}/help`);
    await P0.locator('[data-help-search]').locator('visible=true').first().fill('pin');
    await sleep(400);
    await P0.locator('[data-help-results]').waitFor({ timeout: 5000 });
    const hits = await P0.locator('[data-help-hit]').evaluateAll((els) => els.map((e) => e.getAttribute('data-help-hit')));
    R.ok(`search "pin" leads with Your PIN (${hits.slice(0, 3).join(', ')})`, hits[0] === 'your-pin' && hits.includes('forgot-pin'));
    await P0.locator('[data-help-hit="your-pin"]').click();
    await P0.locator('[data-help-article="your-pin"]').waitFor({ timeout: 5000 });
    R.ok('a hit opens the page', true);
    await c0.close();
  });

  await R.section('wide: table of contents, page, on-this-page', async () => {
    const c1 = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
    const P1 = await c1.newPage();
    await P1.goto(`${WEB}/help/blaster/filing-the-day`);
    await P1.locator('[data-help-article="filing-the-day"]').waitFor({ timeout: 15000 });
    R.ok('the TOC lists every section, with only the current one open', (await P1.locator('[data-help-toc-section]').count()) === 9 && (await P1.locator('[data-help-toc-section][data-open="1"]').count()) === 1 && (await P1.locator('[data-help-toc-section="blaster"] a').count()) === 14);
    await P1.locator('[data-help-toc-section="shop"] button').click();
    await sleep(200);
    R.ok('tapping another section opens it and closes the current one', (await P1.locator('[data-help-toc-section="shop"][data-open="1"]').count()) === 1 && (await P1.locator('[data-help-toc-section="blaster"][data-open="1"]').count()) === 0);
    R.ok('On this page sits on the right', (await P1.locator('[data-help-onthis-wide] a').count()) >= 3);
    R.ok('the article has real headings and a tip', /Before you file/.test(await P1.locator('[data-help-article]').innerText()) && (await P1.locator('.help-doc blockquote').count()) >= 1);
    await c1.close();
  });

  await R.section('signed in: the ? menu, About this screen and Settings open the guide at the right page', async () => {
    const c2 = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
    const P2 = await c2.newPage();
    await signIn(P2, 'blaster');
    await skipTours(P2);
    await P2.goto(`${WEB}/jobs`);
    await P2.locator('[data-customers-list]').waitFor({ timeout: 15000 });
    // wide: the sidebar row expands an inline sub-menu (like the old Jobs
    // sub-items): About this screen · Help guide · Walkthrough · Send feedback
    await P2.locator('aside [data-help-button]').click();
    await P2.locator('[data-help-submenu]').waitFor({ timeout: 3000 });
    R.ok('the sidebar Help & feedback expands inline — no popover, no navigation', (await P2.locator('[data-help-submenu] [data-help-guide]').count()) === 1 && (await P2.locator('[data-help-submenu] [data-help-coach]').count()) === 1 && (await P2.locator('[data-help-submenu] [data-help-walkthrough]').count()) === 1 && (await P2.locator('[data-help-submenu] [data-help-feedback]').count()) === 1 && P2.url().endsWith('/jobs'));
    await P2.locator('[data-help-submenu] [data-help-coach]').click();
    await P2.locator('[data-coach-sheet]').waitFor({ timeout: 3000 });
    R.ok('About this screen opens for Jobs with "Read more in the guide"', /Jobs/.test(await P2.locator('[data-coach-sheet] h2').innerText()) && (await P2.locator('[data-coach-guide]').count()) === 1);
    await P2.locator('[data-coach-guide]').click();
    await P2.locator('[data-help-article="jobs-customers-sites"]').waitFor({ timeout: 8000 });
    R.ok('it opens the Jobs page of the guide in the app', P2.url().includes('/help/blaster/jobs-customers-sites'));
    R.ok('signed in, the header offers Back to ShotLog', (await P2.locator('[data-help-to-app]').innerText()) === 'Back to ShotLog');
    await P2.locator('[data-help-to-app]').click();
    await P2.locator('[data-tour="home"], main').first().waitFor({ timeout: 10000 });
    R.ok('Back to ShotLog returns to the app without a reload', !P2.url().includes('/help'));
    // phone: the header ? popover still has Help guide and About this screen → Read more
    const c3 = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
    const P3 = await c3.newPage();
    await signIn(P3, 'blaster');
    await skipTours(P3);
    await P3.goto(`${WEB}/jobs`);
    await P3.locator('[data-customers-list]').waitFor({ timeout: 15000 });
    await P3.locator('header [data-help-button]').click();
    await P3.locator('[data-help-menu]').waitFor({ timeout: 3000 });
    R.ok('phone: the ? menu has a Help guide entry', (await P3.locator('[data-help-guide]').count()) === 1);
    await P3.locator('[data-help-coach]').click();
    await P3.locator('[data-coach-sheet]').waitFor({ timeout: 3000 });
    R.ok('phone: About this screen offers "Read more in the guide" for Jobs', /Read more in the guide: Jobs, customers and sites/.test(await P3.locator('[data-coach-sheet]').innerText()));
    await P3.locator('[data-coach-guide]').click();
    await P3.locator('[data-help-article="jobs-customers-sites"]').waitFor({ timeout: 8000 });
    R.ok('it opens the Jobs page of the guide in the app', P3.url().includes('/help/blaster/jobs-customers-sites'));
    await c3.close();
    await P2.goto(`${WEB}/settings`);
    await P2.locator('[data-settings-help-guide]').waitFor({ timeout: 10000 });
    await P2.locator('[data-settings-help-guide]').click();
    await P2.locator('[data-help-home]').waitFor({ timeout: 8000 });
    R.ok('Settings › Help guide opens the landing', true);
    const mapped = await P2.evaluate(async () => {
      const { helpForRoute } = await import('/src/help/index.ts');
      return {
        day: helpForRoute('/blast-day/abc')?.slug, blastLog: helpForRoute('/blast-day/abc', '?view=blast-log')?.slug, submit: helpForRoute('/blast-day/abc/submit')?.slug, fleet: helpForRoute('/admin/equipment')?.slug, none: helpForRoute('/nowhere'),
      };
    });
    R.ok(`routes map to pages (day → ${mapped.day}, blast-log → ${mapped.blastLog}, submit → ${mapped.submit}, fleet → ${mapped.fleet})`, mapped.day === 'the-work-day' && mapped.blastLog === 'blasting-log-shots' && mapped.submit === 'filing-the-day' && mapped.fleet === 'fleet' && mapped.none === null);
    await c2.close();
  });

  return R.summary();
}

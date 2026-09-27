async (page, lib) => {
  // Round S25 — The brochure and the product page (2026-09-27)
  // §1 a stranger opens /brochure with no account: the product page, not a sign-in;
  // §2 every picture on it is a real frame the page can fetch, and the PDF is there;
  // §3 the printed piece at /brochure/print is four Letter pages from the same words.
  const { mkCtx, sleep, WEB, browserErrors } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  browserErrors({ clear: true });

  // a bare context: no session, no PIN, no server url — a visitor, not a crew member
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const P = await ctx.newPage();
  const status = async (url) => { const r = await P.request.fetch(url); return { status: r.status(), type: r.headers()['content-type'] || '' }; };

  await R.section('§1 The product page opens without a sign-in, on a phone', async () => {
    await P.goto(`${WEB}/brochure`);
    await P.locator('[data-brochure-h1]').waitFor({ timeout: 30000 });
    R.ok('no sign-in form, no app shell: the page is the brochure', (await P.locator('input[type="email"]').count()) === 0 && (await P.locator('[data-tour="fab"]').count()) === 0 && (await P.locator('[data-brochure]').count()) === 1);
    const h1 = ((await P.locator('[data-brochure-h1]').innerText()) || '').trim();
    R.ok(`the headline Matthew picked ("${h1.slice(0, 50)}…")`, /working day, on one device/.test(h1));
    R.ok('the six steps of the day are there', (await P.locator('[data-brochure-step]').count()) === 6);
    const before = await P.locator('[data-brochure-step-frame]').getAttribute('src');
    await P.locator('[data-brochure-next]').click();
    await sleep(200);
    const after = await P.locator('[data-brochure-step-frame]').getAttribute('src');
    R.ok(`Next moves the phone to the second step (${(after || '').split('/').pop()})`, before !== after && /drill-log/.test(after || ''));
    const wide = await P.evaluate(() => document.documentElement.scrollWidth);
    R.ok(`nothing scrolls sideways at phone width (${wide}px)`, wide <= 390);
    R.ok('the phone number dials and the email opens a message', /^tel:/.test((await P.locator('[data-brochure-phone]').getAttribute('href')) || '') && /^mailto:info@evilgenius\.io/.test((await P.locator('[data-brochure-email]').getAttribute('href')) || ''));
    R.ok('the title names the product for the browser tab', /ShotLog/.test(await P.title()));
    R.ok('no company is named on the page', !/Baystate/i.test(await P.locator('body').innerText()));
  });

  await R.section('§2 Every picture is a real frame the page can fetch, and the PDF is there', async () => {
    const srcs = await P.evaluate(() => [...new Set([...document.querySelectorAll('[data-brochure] img')].map((i) => i.getAttribute('src')).filter((s) => s && s.startsWith('/brochure/')))]);
    const results = [];
    for (const s of srcs) results.push({ s, ...(await status(`${WEB}${s}`)) });
    const bad = results.filter((r) => r.status !== 200);
    R.ok(`${srcs.length} frames referenced, ${results.length - bad.length} served${bad[0] ? ` — first missing: ${bad[0].s}` : ''}`, srcs.length >= 14 && bad.length === 0);
    const pdf = await status(`${WEB}${(await P.locator('[data-brochure-pdf]').getAttribute('href')) || '/brochure/ShotLog-Brochure.pdf'}`);
    R.ok(`the brochure PDF is served as a PDF (${pdf.status} ${pdf.type.split(';')[0]})`, pdf.status === 200 && /pdf/.test(pdf.type));
  });

  await R.section('§3 The printed piece is four Letter pages from the same words', async () => {
    const wideCtx = await mkCtx(browser, { viewport: { width: 900, height: 1100 }, legacyPin: false, tourDone: false, firstWeekHidden: false, nagSnoozed: false, autoGate: false });
    const W = await wideCtx.newPage();
    await W.goto(`${WEB}/brochure/print`);
    await W.locator('[data-print-page="back"]').waitFor({ timeout: 30000 });
    const pages = await W.locator('[data-print-page]').count();
    R.ok(`four pages: cover, two inside, back (${pages})`, pages === 4);
    const cover = await W.locator('[data-print-page="cover"]').innerText();
    R.ok('the cover carries the page headline', /working day, on one device/.test(cover));
    const back = await W.locator('[data-print-page="back"]').innerText();
    R.ok('the back carries the phone number, the email and the record strip', /877-EVIL-PRO/.test(back) && /info@evilgenius\.io/.test(back) && /Built for the record/.test(back));
    const fit = await W.evaluate(() => [...document.querySelectorAll('[data-print-page]')].map((pg) => {
      const top = pg.getBoundingClientRect().top;
      const bottoms = [...pg.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent?.trim()).map((e) => e.getBoundingClientRect().bottom - top);
      return Math.round(Math.max(...bottoms));
    }));
    R.ok(`every page's text ends inside the page (${fit.join(', ')} px of 1056)`, fit.every((b) => b <= 1056));
    await wideCtx.close();
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await ctx.close();
  return R.summary();
}

async (page, lib) => {
  // Round S27 — Settings you can see the whole of: Admin › Company as a menu, one setting per screen (2026-10-05)
  const { mkCtx, signIn, skipTours, sleep, waitForUpload, WEB, browserErrors } = lib;
  const waitFor = async (fn, timeout = 20000, every = 250) => {
    const t0 = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() - t0 > timeout) throw new Error('waitFor timed out');
      await sleep(every);
    }
  };
  const browser = page.context().browser();
  const R = lib.report();
  browserErrors({ clear: true });

  // Evette on a phone: the list, then one setting at a time
  const cP = await mkCtx(browser, { viewport: { width: 390, height: 844 } });
  const PP = await cP.newPage();
  await signIn(PP, 'office');
  await skipTours(PP);

  await R.section('§1 the Company tab opens on a list of settings with a gist of each, and a row opens that setting alone with Back', async () => {
    await PP.goto(`${WEB}/admin/company`);
    await PP.locator('[data-company-settings]').waitFor({ timeout: 30000 });
    R.ok('on a phone the Company tab is the list, nothing else', (await PP.locator('[data-company-layout]').getAttribute('data-company-layout')) === 'stack' && (await PP.locator('[data-approvals-matrix]').count()) === 0 && (await PP.locator('[data-company-details]').count()) === 0);
    const rows = await PP.locator('[data-company-setting]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-company-setting'), (e.querySelector('[data-company-gist]')?.textContent || '').trim()]));
    R.ok(`seven settings, each with a gist of its value (${rows.map((r) => r[0]).join(', ')})`, rows.length === 7 && rows.every((r) => r[1].length > 0) && rows.map((r) => r[0]).join() === 'details,approvals,routing,home,attachments,pre-blast,setup-fields');
    const sf = rows.find((r) => r[0] === 'setup-fields')[1];
    R.ok(`the Setup fields row reads its counts ("${sf}")`, /\d+ fields · \d+ asked at setup · \d+ hold a blasting day/.test(sf));
    const fit = await PP.evaluate(() => ({ h: document.scrollingElement.scrollHeight, w: window.innerHeight }));
    R.ok(`the whole list fits on the phone's screen (${fit.h} of ${fit.w} px)`, fit.h <= fit.w + 40);
    await PP.locator('[data-company-setting="approvals"]').click();
    await PP.waitForURL(/\/admin\/company\/approvals$/, { timeout: 10000 });
    await PP.locator('[data-approvals-matrix]').waitFor({ timeout: 15000 });
    R.ok('tapping Approvals opens only that setting, with Back to the list on top', (await PP.locator('[data-company-pane]').getAttribute('data-company-pane')) === 'approvals' && (await PP.locator('[data-company-settings]').count()) === 0 && (await PP.locator('[data-company-back]').count()) === 1 && (await PP.locator('[data-company-details]').count()) === 0);
    await PP.locator('[data-company-back]').click();
    await PP.waitForURL(/\/admin\/company$/, { timeout: 10000 });
    await PP.locator('[data-company-settings]').waitFor({ timeout: 10000 });
    R.ok('Back is the list again', (await PP.locator('[data-company-setting]').count()) === 7);
    await PP.locator('[data-company-setting="setup-fields"]').click();
    await PP.waitForURL(/\/admin\/company\/setup-fields$/, { timeout: 10000 });
    await PP.locator('[data-setup-fields]').waitFor({ timeout: 15000 });
    R.ok('Setup fields opens the same way and carries its own Back on a phone', (await PP.locator('[data-setup-fields-back]').isVisible()) && (await PP.locator('[data-company-settings]').count()) === 0);
  });

  // Mark on a desktop: the list stays, the setting opens beside it
  const cM = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PM = await cM.newPage();
  await signIn(PM, 'mark');
  await skipTours(PM);

  await R.section('§2 on a desktop the list stays on the left and the setting opens on the right', async () => {
    await PM.goto(`${WEB}/admin/company`);
    await PM.locator('[data-company-settings]').waitFor({ timeout: 30000 });
    await PM.locator('[data-company-details]').waitFor({ timeout: 15000 });
    R.ok('the Company tab opens split: the list on the left, Company details already open on the right', (await PM.locator('[data-company-layout]').getAttribute('data-company-layout')) === 'split' && (await PM.locator('[data-company-setting="details"]').getAttribute('data-company-current')) === 'yes');
    const box = await PM.locator('[data-company-settings]').boundingBox();
    const pane = await PM.locator('[data-company-pane]').boundingBox();
    R.ok(`the list sits left of the setting (${Math.round(box.x)} < ${Math.round(pane.x)})`, box && pane && box.x + box.width <= pane.x + 1);
    await PM.locator('[data-company-setting="setup-fields"]').click();
    await PM.waitForURL(/\/admin\/company\/setup-fields$/, { timeout: 10000 });
    await PM.locator('[data-setup-fields]').waitFor({ timeout: 15000 });
    R.ok('Setup fields opens on the right; the list stays and lights the row', (await PM.locator('[data-company-settings]').count()) === 1 && (await PM.locator('[data-company-setting="setup-fields"]').getAttribute('data-company-current')) === 'yes' && (await PM.locator('[data-company-setting="details"]').getAttribute('data-company-current')) === 'no');
    R.ok('no Back link doubles the list on a desktop', !(await PM.locator('[data-setup-fields-back]').isVisible()) && (await PM.locator('[data-company-back]').count()) === 0);
    R.ok('Company stays the lit tab', (await PM.locator('a.border-safety-orange').innerText()).trim() === 'Company');
    await PM.goBack();
    await PM.waitForURL(/\/admin\/company$/, { timeout: 10000 });
    await PM.locator('[data-company-details]').waitFor({ timeout: 10000 });
    R.ok('the browser Back returns to the list with Company details open', (await PM.locator('[data-company-setting="details"]').getAttribute('data-company-current')) === 'yes');
  });

  await R.section('§3 every setting still works where it now lives: details, approvals, routing, home, attachments, pre-blast, setup fields', async () => {
    const at = async (key, hook) => {
      await PM.goto(`${WEB}/admin/company/${key}`);
      await PM.locator(hook).first().waitFor({ timeout: 15000 });
      return (await PM.locator('[data-company-pane]').getAttribute('data-company-pane')) === key && (await PM.locator(hook).count()) >= 1;
    };
    R.ok('Approvals is the matrix', await at('approvals', '[data-approvals-matrix] [data-matrix-cell]'));
    R.ok('Office routing is the five rows', (await at('routing', '[data-office-row]')) && (await PM.locator('[data-office-row]').count()) === 5);
    R.ok('Attachment types is its list', await at('attachments', '[data-company-pane="attachments"] input'));
    R.ok('Pre-blast checklist is its text, no longer called a placeholder', (await at('pre-blast', '[data-company-pane="pre-blast"] textarea')) && !/placeholder/i.test(await PM.locator('[data-company-pane]').innerText()));
    R.ok('Company details is the form with Save', (await at('details', '[data-company-details]')) && (await PM.getByRole('button', { name: /Save company details/ }).count()) === 1);
    // a change shows in the list's gist at once
    R.ok('The home screen is the unfiled-after field', await at('home', '[data-home-stale-days]'));
    const before = Number(await PM.locator('[data-home-stale-days]').inputValue());
    const next = before === 3 ? 4 : 3;
    await PM.locator('[data-home-stale-days]').fill(String(next));
    await PM.locator('[data-home-stale-days]').press('Tab');
    await waitFor(async () => (new RegExp(`after ${next} days`).test(await PM.locator('[data-company-setting="home"] [data-company-gist]').innerText()) ? 1 : null), 10000);
    R.ok(`the list's gist follows the change at once ("after ${next} days")`, new RegExp(`after ${next} days`).test(await PM.locator('[data-company-setting="home"] [data-company-gist]').innerText()));
    await PM.locator('[data-home-stale-days]').fill(String(before));
    await PM.locator('[data-home-stale-days]').press('Tab');
    await waitForUpload(PM, 20000).catch(() => undefined);
    await sleep(300);
    R.ok('nothing on the Company tab is a long page: the tallest setting screen is under three screens', await (async () => {
      let worst = 0;
      for (const k of ['details', 'approvals', 'routing', 'home', 'attachments', 'pre-blast']) {
        await PM.goto(`${WEB}/admin/company/${k}`);
        await PM.locator(`[data-company-pane="${k}"]`).waitFor({ timeout: 15000 });
        await sleep(150);
        const h = await PM.evaluate(() => document.scrollingElement.scrollHeight / window.innerHeight);
        worst = Math.max(worst, h);
      }
      return worst < 3;
    })());
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await cP.close();
  await cM.close();
  return R.summary();
}

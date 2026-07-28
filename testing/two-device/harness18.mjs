async (page) => {
  // Submission-memory hotfix: list views use blob-free summaries; PDFs open
  // on demand (Safari-safe pre-opened window). Verify filing still works,
  // every rewired surface lists + opens the PDF, and attachments expand.
  const browser = page.context().browser();
  const results = [];
  const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  let dev;
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript(`
      localStorage.setItem('shotlog-server-url', 'http://localhost:4000');
      localStorage.setItem('shotlog-pin', 'x');
      localStorage.setItem('shotlog-last-active', String(Date.now()));
    `);
    dev = await ctx.newPage();
    await dev.goto('http://localhost:5199');
    await dev.locator('input[type="email"]').fill('mark@baystateblasting.com');
    await dev.locator('input[type="password"]').fill('dev-password-123');
    await dev.getByRole('button', { name: 'Sign in' }).click();
    await dev.locator('input[type="email"]').waitFor({ state: 'detached', timeout: 15000 });
    await dev.waitForTimeout(3500);

    const tag = `H18-${Date.now() % 1000000}`;

    // ── File a checklist (real fileSubmission path incl. nextSubmissionVersion) ──
    const clId = await dev.evaluate(async (t) => {
      const db = window.shotlogDb;
      const rig = (await db.equipment.toArray()).find((e) => e.isActive);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.drillChecklists.add({
        id, equipmentId: rig ? rig.id : 'R-H18', date: new Date().toISOString().slice(0, 10),
        startingHours: 100, daily: { 'Engine Oil': 'ok' }, weeklyDone: false, weekly: {},
        repairsNote: t, outOfService: false,
        drillerUserId: JSON.parse(localStorage.getItem('shotlog-user-info')).id,
        drillerName: 'Mark Swihart', signatureImage: null,
        createdAt: now, updatedAt: now,
      });
      return id;
    }, tag);
    await dev.goto(`http://localhost:5199/drill-checklist-file/${clId}`);
    const filedOk = await (async () => {
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        if ((await dev.locator('body').innerText()).includes('Checklist filed')) return true;
        await dev.waitForTimeout(1000);
      }
      return false;
    })();
    ok('filing still works (checklist filed)', filedOk);
    const subCount = await dev.evaluate(
      async (id) =>
        (await window.shotlogDb.submissions.toArray()).filter((s) => s.sourceId === id).length,
      clId,
    );
    ok('submission record written', subCount === 1);

    // ── Filed lens lists it; View opens the PDF in a popup ────────────────
    await dev.goto('http://localhost:5199/records');
    await dev.waitForTimeout(2500);
    const filedTxt = await dev.locator('body').innerText();
    ok('Filed lens lists the new copy', filedTxt.includes('Rock drill checklist') || filedTxt.includes('Rig Checklist'));
    const row = dev.locator('div.px-3').filter({ hasText: 'Rig Checklist' }).first();
    const [popup] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 15000 }),
      row.getByRole('button', { name: 'View', exact: true }).first().click(),
    ]);
    await popup.waitForTimeout(2000);
    const popupUrl = popup.url();
    ok('View opens the PDF blob on demand', popupUrl.startsWith('blob:'));
    await popup.close();

    // ── Latest filings on the admin dashboard ─────────────────────────────
    await dev.goto('http://localhost:5199/');
    await dev.waitForTimeout(2500);
    const dashTxt = await dev.locator('body').innerText();
    ok('latest filings card lists rows', /latest filings/i.test(dashTxt) && dashTxt.includes('PDF ›'));
    const [popup2] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 15000 }),
      dev.locator('button').filter({ hasText: 'PDF ›' }).first().click(),
    ]);
    await popup2.waitForTimeout(2000);
    ok('dashboard filing opens PDF on demand', popup2.url().startsWith('blob:'));
    await popup2.close();

    // ── All-documents lens filed chip ─────────────────────────────────────
    await dev.goto('http://localhost:5199/records');
    await dev.waitForTimeout(2000);
    await dev.getByRole('button', { name: /All documents/ }).click();
    await dev.waitForTimeout(2000);
    const allTxt = await dev.locator('body').innerText();
    ok('All-documents lens shows filed chips', /filed v\d/.test(allTxt));
    const [popup3] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 15000 }),
      dev.locator('button').filter({ hasText: /^filed v\d+$/ }).first().click(),
    ]);
    await popup3.waitForTimeout(2000);
    ok('filed chip opens PDF on demand', popup3.url().startsWith('blob:'));
    await popup3.close();
  } catch (e) {
    results.push(`ERROR ${e.message}`);
    try { results.push('STATE ' + (await dev.locator('body').innerText()).slice(0, 400)); } catch {}
  }
  return results.join('\n');
}

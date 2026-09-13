async (page, lib) => {
  // Round S11 — the first week's small fixes (2026-09-13)
  const { mkCtx, signIn, skipTours, sleep, WEB, API, browserErrors } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  browserErrors({ clear: true });
  let dayId;

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PB = await cB.newPage();
  await signIn(PB, "blaster");
  await skipTours(PB);

  await R.section("A job needs a site (required field, no nameless customer, move job to another site)", async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });

  await R.section("Weights to four decimals on screen, print and PDF; PF from exact pounds", async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });

  await R.section("First-week card leaves on done / first filed day / 14 days, back from ? menu", async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });

  await R.section("Nearby jobs in the Which job? sheet, save the site's spot", async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });

  await R.section("Crash reporting: a thrown error reaches the reporter (stub) on web and API", async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });

  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(`no browser errors (${errs.length})${errs[0] ? ` — first: ${errs[0].text.slice(0, 120)}` : ''}`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId].filter(Boolean) }).catch(() => -1);
    R.ok(`cleanup removed ${removed} day(s)`, removed >= 0);
  });
  await cB.close();
  return R.summary();
}

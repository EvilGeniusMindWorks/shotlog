async (page, lib) => {
  // Round S13 — the day and the card (2026-09-14)
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

  await R.section("One day per job and date, even from two phones without signal; old days untouched", async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });

  await R.section("The card: NWS fill, ground suggested, the first opener's form, the fact-sheet confirm, presence rows", async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });

  await R.section("Papers exist only when started; File this day and the office queues understand an empty day", async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });

  await R.section("Card conflicts: the version check and the decision screen, field-level merge, the type-of-work guard, honest discard messages, the two live bugs", async () => {
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

async (page, lib) => {
  // Round S23 — Drilling over days: the pattern as a paper of the job, one drill log per pattern, the shot from the drilled pattern (2026-09-18)
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

  await R.section("The pattern as a paper of the job · the Drill plan tile · the +", async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });

  await R.section("One drill log per pattern · Continue · parts and signatures · rigs on every hole · Change rig", async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });

  await R.section("Drilled by itself · the blaster's home with the pace · Accept the drill log", async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });

  await R.section("The rig checklist as one screen · Complete needs start, stop and signature · the log's end of day waits for it", async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });

  await R.section("Friday · the shot from one pattern or several · the three doors", async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });

  await R.section("The shot's drilling card · the blasting log's lines · the drill log sheet", async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });

  await R.section("One flow · Records lines and the pattern node · older shots as filed", async () => {
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

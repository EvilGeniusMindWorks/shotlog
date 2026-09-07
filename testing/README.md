# Testing

Browser harnesses live in `two-device/` — one file per round or fix, each a
bare `async (page, lib) => { … }` expression that drives several isolated
browser contexts ("devices") against the full local stack and returns
`PASS`/`FAIL` lines. They are the interleaved, multi-device tests Matthew
asked for: realistic timing, not clean paths.

## Run them

```bash
npm run e2e -- 49              # one harness, prints FAIL/ERROR/SKIP + a summary line
npm run e2e -- 49 -v           # …and every PASS line
npm run e2e -- 49 --only 2,5   # only §2 and §5 (harnesses written on lib.report sections)
npm run e2e -- 37 45 46 -p     # several in parallel (own page each, shared browser)
npm run e2e -- 49 --headed     # watch it
```

`node testing/run.mjs …` is the same thing. Exit code 1 on any FAIL/ERROR.
Typical times on the local stack: 15–60 s per harness; five in parallel
in about a minute. (Through the Playwright MCP each took 2–4 minutes and
echoed its whole script — do not go back to that path for regressions.)

## Write one

Start from `two-device/harness49.mjs`. Import nothing — the runner passes
`lib` (`two-device/lib.mjs`):

- `lib.report()` → `R.ok(name, cond)`, `R.section(name, fn)`, `R.summary()`.
  Sections are independent chapters; errors are recorded and the next
  section still runs; `--only` selects by number or name.
- `lib.mkCtx(browser, opts)` — a fresh device with the usual localStorage
  seeds (server URL, legacy PIN so sign-in lands in the app, tours done,
  first-week card hidden, profile nag snoozed). `legacyPin: false` to
  exercise the PIN screens.
- `lib.signIn(P, 'blaster')` — signs in and waits for the FIRST SYNC to
  finish (`waitForSync`), never a fixed sleep. `lib.USERS` has the dev logins.
- `lib.waitText(P, selector, /re/)`, `lib.waitForUpload(P)` (local writes
  drained to the server before another device looks), `lib.skipTours(P)`,
  `lib.pinKeys(P)`.
- `lib.apiFor(page)` / `lib.apiLogin(page, 'mark')` for server calls;
  `lib.cleanupAsAdmin(browser, { days, drillLogs, drillPlans, checklists })`
  and `lib.deactivateUsers(...)` for teardown.

Rules that cost reruns when broken: assert on what the UI shows (day rows
show JOB names, not day names); a drill plan has no holes until it has a
`defaultDepth`; a fresh device mid-sync needs `waitText`/`waitForSync`, not a
clock; every harness cleans up what it created.

## Local stack

```bash
docker compose -f infra/powersync/docker-compose.yml up -d
# API (from apps/server) — tsx WATCH: server edits apply without a restart
AUTH_DEBUG_LINKS=1 DATABASE_URL=postgresql://postgres:spikepass@localhost:5434/shotlog \
  JWT_SECRET=dev-only-secret-change-in-production ADMIN_EMAIL=mark@baystateblasting.com \
  ADMIN_PASSWORD=dev-password-123 PORT=4000 npx tsx watch src/index.ts
npm run dev -w apps/web -- --port 5199 --strictPort
npm run typecheck:web            # incremental (~1 s warm)
```

Pre-steps some harnesses need are noted at the top of each file (e.g.
harness44 resets `User.toursDone` for the dev accounts).

Older files (`two-device/harness1–3`, `audit-sweep.mjs`, `build1-verify.mjs`)
predate the runner; `two-device/README.md` describes the original sync
cutover gate they were written for.

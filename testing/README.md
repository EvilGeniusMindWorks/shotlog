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

`node testing/run.mjs …` is the same thing.

**Pre-push hook** (`git config core.hooksPath .githooks`, once per clone): typechecks the web app and runs the harnesses mapped to the changed files in `harness-map.json` (serially, up to six) when the local API is up. `SKIP_HOOK=1 git push` bypasses. New harnesses: `node scripts/harness-new.mjs "<title>" --sections "a|b" --files "x,y"` (file, README line, map entry). Deploys: `node scripts/deploy.mjs --message-file … --markers …` (see .claude/skills). Exit code 1 on any FAIL/ERROR.
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
harness44 resets `User.toursDone` for the dev accounts — run the SQL
*before* starting it). Run harness42 (rehearsal) alone: it asserts the home
company's record count never changes, so any harness writing in parallel
fails it.

Older files (`two-device/harness1–3`, `audit-sweep.mjs`, `build1-verify.mjs`)
predate the runner; `two-device/README.md` describes the original sync
cutover gate they were written for.

## Ops scripts (S8d)

- `node testing/probe/probe.mjs` — the uptime probe (local stack by default; `API_URL`/`WEB_URL` to aim it). Scheduled every 10 min by `.github/workflows/uptime-probe.yml`.
- `DEVICES=4 MINUTES=1 node testing/load/loadtest.mjs` — the load / soak test against the local stack (platform admin = mark). Manual workflow: `.github/workflows/load-test.yml`. Details: docs/ops-probe-and-load.md.

## Help guide screenshots

- `node testing/help-shots.mjs [names…]` — re-captures the guide's screenshots from the dev app at phone width into `apps/web/public/help-img/`. Run it whenever a screen changes.
- harness39 (walkthrough) needs the driller's tour reset first: `UPDATE "User" SET "tourDoneAt"=NULL WHERE email='dinis@test.local'` (other harnesses' skipTours mark it done).

## Persona evaluation harness (`testing/eval/`, Sep 8 2026)

Agents play crew roles through a real browser, one isolated context per "device", and can only act through a tiny CLI — never through selectors or scripts they could not see. Every command is logged so tap counts are measured, not self-reported.

- `node testing/eval/browser-server.mjs` — the daemon (port 4790). Devices: `phone` 390×844, `tablet` 800×1280, `wide` 1280×800, all at scale 1 so a screenshot pixel is a tap unit.
- `node testing/eval/b.mjs <session> <op> …` — open · snapshot · click · fill · type · press · select · check · upload · tap x y · scroll · wait · back · screenshot · sign · downloads. See `AGENT-README.md` (what the agents are given).
- `node testing/eval/setup.mjs` — two Beta companies from Baystate's reference data, Granite Ridge / Ledgeville seeded server-side (`seed-hierarchy.mts`), one invitation per cast member, media assets. Refuses to run while `out/setup.json` exists (`--force` to rebuild, `--clean` to delete the eval companies).
- `node testing/eval/admin.mjs backfill-roster A|B` — the admin repairs "Mark" performs mid-run.
- `node testing/eval/briefs.mjs <A|B> <barry-am|dinis|barry-pm|sam|evette|barry-refile|judge>` — the accepted briefs with links and paths filled in; the same text drives a re-run after fixes.
- Outputs in `testing/eval/out/`: `<arm>-<who>.md` records, `<session>.log.jsonl` tap logs, `run-notes.md` (coordinator's interventions and artifacts), `verified.md` (code checks), `judge.md`.

Lessons from the first run: tell agents explicitly never to run other scripts (one re-ran setup and wiped the run); keep screenshots at 1:1; make text matching tolerant of curly quotes and dashes; enrol the driller before the blaster sends the plan; invited people need roster rows.

## Round S9a harnesses (Sep 9 2026)

- `60` — the evaluation's blockers: ticket resolve from three doors; phone bottom sheets above the nav (Mark complete); the rig meter's two doors; filing pre-flight (red blocks, amber files with notes the office sees). Needs the local API (checklist → ticket, submit → PDFs).
- `61` — the office: Send Back on the ask sheet with a required reason, `sendBackBy`/`At` stamped by the server (needs the local API), the day banner and home strip; the Approvals page gated for the office; customer cards truly read-only; a discarded write toasts; the ask sheet in place of native confirm().
- `62` — fleet chips OR within "what's down?"; the design grid's names and keyboard; off-plan count in the drilling review; seismo reading Edit and the distance line. Picks a job with no day today (a stray day makes the harness day a "second copy" and hides the drilling view behind the merge strip).
- Known stale: `45` §"Open that day" join step errors before and after S9a (pre-existing); `26` §"By customer" click predates the S8b Jobs drill-down (its PDF sections still pass).

### Running an evaluation unattended (S9a harness item)

- `node testing/eval/run.mjs --arms A,B --steps full` — the whole day; `--steps after` — the S9a before/after chain (Dinis enrols → the coordinator enrols Barry by API, links the roster and seeds the rehearsal week onto the company → Dinis finishes the pattern → Sam works the shop); `--steps dinis,sam` — partial chains. Each step is a headless `claude -p` (`--model sonnet` by default, `--max-turns 300`); the coordinator watches the company's records in Postgres for the state the next step needs and releases it. Set `EVAL_RUN=after` (and start the daemon with `EVAL_OUT=testing/eval/out/after`) to keep a re-run's records apart.
- Snapshots end with a numbered list of everything tappable — agents say `click 12`, `fill 7 …`; native dialogs are shown as `!!! DIALOG` and must be answered (`dialog accept [text]` / `dialog dismiss`).
- `setup.mjs --force --lean` prunes the copied dev roster to a dozen real-looking names; `seed-hierarchy.mts <cid> --lean-only` does it on an existing company.
- Briefs for the snapshot chain: `dinis-enrol`, `dinis-after`, `sam-after`; the comparison: `judge-after`.
- `63` — S9b: suggested meters are real values (checklist starting hours, Mark complete meter, Log a service); Mark complete signs inside the sheet ("Sign and complete"); screen tours do not auto-run after the first day. Precondition: `UPDATE "User" SET "toursDone"='[]' WHERE email='dinis@test.local'`.
- `64` — compliance badges carry the "advisory" label while the USBM curve is unreviewed (`COMPLIANCE_ADVISORY`).
- `65` — driller items: a time card's hours from the latest typed times (fast IN then OUT); the checklist's "Not done" state and the Repairs-needed hint.
- `66` — stray drill logs: no second log on an accepted shot; an empty open log does not move the day's phase; the drill log page's ⋯ › Delete (as an admin).
- `67` — site map location bar: coordinates in the forms people paste (decimal, N/W prefixed or suffixed, DMS); a new shot opens on the job's address (searched quietly); the structured fallback lists candidates by town; Save as the site's spot → the next shot at the site opens there on imagery; offline says "No signal". The geocoder is stubbed with `context.route` so nothing reaches OpenStreetMap.
- `68` — S10 launch hygiene: the printed daily report carries the company's own name; Work days / Blasting Log / Rig Checklist / Open–Complete–Accepted / Reopen labels; 527 CMR 13 on the plan; sign-in rate limit per IP+email behind `trust proxy` (X-Forwarded-For), Helmet headers, CORS allowlist (needs `ALLOWED_ORIGINS` in the local .env), presign refuses non-media types; the equipment locator shows the OSM credit; the satellite layer is USGS; Nominatim URLs carry the app's identity; the error spy sees nothing during the run. Tiles and geocoder stubbed.

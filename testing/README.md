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
npm run e2e -- 37 62 64 -p     # several in parallel (own page each, shared browser)
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

Pre-steps some harnesses need are noted at the top of each file. (harness44,
the S7c screen tours, was retired with S20 when the tours went — harness81 §6
checks they are gone.) Run harness42 (rehearsal) alone: it asserts the home
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
- Retired Sep 17 2026 (they failed on rounds that rewrote their screens, and later harnesses tell those stories now): `43` (S7b new-day dialog order and cascade — the dialog was rebuilt in S15/S16; harness73/75), `45` (S7d report ownership, derived rig hours and the join step — the day card gate, the one-paper checklist and the S20 stop hours changed all of it; harness71/72/78/81), `46` (the rig as the first question on the checklist and the old "File rig checklist" tile — S14/S19/S20; harness72/78/81). `30` and `54` were refreshed the same day (a Foreman left by an earlier run, the walkthrough's spine and its "Signed complete" chip, S11's site rule).
- Known stale: `26` §"By customer" click predates the S8b Jobs drill-down (its PDF sections still pass); `40` "office home ≤ 3 screens" measures 3.9–4.0 since S14 put Today's jobs above the queues (its records, phone and admin checks pass; S21 refreshed its row taps for the drawer).

### Running an evaluation unattended (S9a harness item)

- `node testing/eval/run.mjs --arms A,B --steps full` — the whole day; `--steps after` — the S9a before/after chain (Dinis enrols → the coordinator enrols Barry by API, links the roster and seeds the rehearsal week onto the company → Dinis finishes the pattern → Sam works the shop); `--steps dinis,sam` — partial chains. Each step is a headless `claude -p` (`--model sonnet` by default, `--max-turns 300`); the coordinator watches the company's records in Postgres for the state the next step needs and releases it. Set `EVAL_RUN=after` (and start the daemon with `EVAL_OUT=testing/eval/out/after`) to keep a re-run's records apart.
- Snapshots end with a numbered list of everything tappable — agents say `click 12`, `fill 7 …`; native dialogs are shown as `!!! DIALOG` and must be answered (`dialog accept [text]` / `dialog dismiss`).
- `setup.mjs --force --lean` prunes the copied dev roster to a dozen real-looking names; `seed-hierarchy.mts <cid> --lean-only` does it on an existing company.
- Briefs for the snapshot chain: `dinis-enrol`, `dinis-after`, `sam-after`; the comparison: `judge-after`.
- `63` — S9b: suggested meters are real values (checklist starting hours, Mark complete meter, Log a service); Mark complete signs inside the sheet ("Sign and complete"); screen tours do not auto-run after the first day. Precondition: `UPDATE "User" SET "toursDone"='[]' WHERE email='dinis@test.local'`.
- `64` — compliance badges carry the "advisory" label while the USBM curve is unreviewed (`COMPLIANCE_ADVISORY`).
- `65` — driller items: a time card's hours from the latest typed times (fast IN then OUT); the checklist's "Not done" state and the Repairs-needed hint.
- `66` — stray drill logs: no second log on an accepted shot; an empty open log does not move the day's phase; the drill log page's ⋯ › Delete (as an admin).
- `67` — site map location bar: coordinates in the forms people paste (decimal, N/W prefixed or suffixed, DMS); a new shot opens on the job's address (searched quietly); the structured fallback lists candidates by town; Save as this job's work spot (S11 shape B) → the next shot on the job opens there on imagery, the bar offers "Work spot"; offline says "No signal". The geocoder is stubbed with `context.route` so nothing reaches OpenStreetMap.
- `68` — S10 launch hygiene: the printed daily report carries the company's own name; Work days / Blasting Log / Rig Checklist / Open–Complete–Accepted / Reopen labels; 527 CMR 13 on the plan; sign-in rate limit per IP+email behind `trust proxy` (X-Forwarded-For), Helmet headers, CORS allowlist (needs `ALLOWED_ORIGINS` in the local .env), presign refuses non-media types; the equipment locator shows the OSM credit; the satellite layer is USGS; Nominatim URLs carry the app's identity; the error spy sees nothing during the run. Tiles and geocoder stubbed.
- `69` — Round S11 — the first week's small fixes: the ghost-site call is refused and Create's why-line names what is missing, a job moves to another site (customer follows, the old site becomes deletable); weights read 25.0000 / 1,233.6215 everywhere and the printed PF line divides the exact pounds; the first-week card's three exits and its return from the ? menu; the day dialog's "Use my location" with Nearby chips (0.07 mi flagged, 100 mi not) and the save-where-I-stand offer for a job with no point, the previous job's spot offered to a sibling; crash inbox — a thrown web error reaches Admin › Crashes with a report code and breadcrumbs without a Report tap, repeats throttle, a person's words attach, a server route that throws lands as a server line, a minified frame decodes through an uploaded source map, the Crashes tab shows trace/breadcrumbs/words and Fixed, and the Feedback tab stays clean.
- `70` — Round S12 — where I am, and a ring around the blast: four structures placed by arithmetic at 180/230/310/420 ft; a stubbed fix 18 ft from the blast pin draws the dot and its accuracy circle on its own (location already allowed), "Pin the blast here" drops the pin under it, nothing of the dot is saved; the ring defaults to 250 (two inside, red on the map, listed nearest first), grows to 320 (three inside), is saved with the shot and re-takes the map picture; the closest structure is offered and using it sets 180 ft + the name and recomputes the scaled distance (180/√100 = 18); a dropped pin asks for its name; the print page's caption reads "Ring 320 ft · within: …" and the PDF builds.
- `71` — Round S13 — the day and the card: One day per job and date, even from two phones without signal; old days untouched; The card: NWS fill, ground suggested, the first opener's form, the fact-sheet confirm, presence rows; Papers exist only when started; File this day and the office queues understand an empty day; Card conflicts: the version check and the decision screen, field-level merge, the type-of-work guard, honest discard messages, the two live bugs.
- `72` — Round S14 — the hub: The day opens on its tiles: each paper's real state per role, Start creates the paper, Up next, File this day at the bottom, the blasting log keeps the spine; The blaster's crew list: the person sheet, Accept, Remind lands on their home; eleven people: summary, filter, search; Rigs: today's rigs with each machine's start and stop readings, another rig, out of service; the drill log asks for no meter; Evette's list of today's jobs with dots, Records dots, the customer's address on a site.
- `73` — Round S15 — no pills, and the rough edges: Rows that open a chooser on the blasting log's Operation, the catalog's Category, Add person's Role and the equipment filters; Blast mats with a count; Hazards and precautions as a checklist sheet; recent and nearby jobs as rows from four; the catalog tag as text; status pills in a column; The app updates itself on the home; the day header on a phone; the day's line says the time once; Closed, nothing to file.
- `74` — Shot diagram: left-out holes stay unwired, Clear hole, the 8 ms pattern check; Accept files the office copy; the checklist's office copy can be refiled: The timing grid refuses a hole the plan left out; Clear one hole's wires without losing the rest; The pattern check rings holes within 8 ms of each other (30 CFR 816.67); Accept from the crew list files the office copy; A checklist whose office copy failed can file it later.
- `75` — Round S16 — A job on a date, and moving it: One log, one blaster, one signature: the tiles and the filing screen agree; Change the date from the header: the sheet, what moves, the blocks, the trail; The amber not-today date and the Start-work date row; A rig checklist per job-day, prefilled from the morning; The File button's quiet line and Start a day at a job.
- `76` — Round S17 — The driller's home, and the feedback fixes: A day is mine when I drilled on it: the Work days list and the home agree; The Drilling page is the plan queue; the plans-yet line tells the truth; New diagrams open at 25 ms per hole; The pattern check judges against the allowed holes per delay; Diameter, burden and spacing ride at the top of the plan and reach the driller's log; The driller's home: one card per job-day, plans sent to you, yesterday needs you.
- `77` — Round S18 — Typing, totals, review, and feedback from anywhere: Typing fast keeps every character and saves once per pause; The feedback bubble reaches the composer over a sheet and on a print screen, and names the paper; The Settings switch hides the bubble; on by default everywhere.
- `78` — Round S19 — The checklist on its day, the hours row, AM/PM, pay yards, and a tidier inbox: A checklist started from a not-today day is dated for that day and shows on its tiles; The checklist never guesses: from the rig it follows the day the driller is on at the job; Starting hours has its own row and the carried-answers note sits on the Daily checks card; IN and OUT share a row of their own inside a narrow sheet in a wide window; Pay yards fills itself from square feet, depth and sub drill, and a typed number holds; A feedback report names its screen; the inbox shows person and screen with the date on its own; Tick several reports, then Mark seen, Mark done or Delete.
- `79` — Navigation round, push 1 — the arrow says where it goes: From Work days, Records and a job into the day: the arrow returns to where you came from; Inside the day: Blasting log → Design plan → the arrow lands on the Blasting log; the tabs are real steps the back gesture walks; The driller: home card → day → drill log → the arrow reads the day; Mark complete lands on the day; The rig checklist from the day: Done lands on the day with the rig row; from the rig, Done lands on the rig; Mark the daily report done lands on the day; sheets say Close and the back gesture closes them first; A fresh open and a print screen: up the map, labelled.
- `80` — Navigation round, push 2 — the walkthrough tab: The Blasting log tile opens the Walkthrough tab; two tabs, no Daily report tab; ?view=hub still lands there; The six steps through a day: plan → sent → drilling waiting → review → fill → check → sign → complete, one ring, Continue reads Next: …; Check and sign: seismo readings are required, each red line is a door, Complete lands on the day and the tile reads Complete; File this day waits for the log complete and the report done; the pre-flight says so; The home's Continue and the walkthrough agree; the arrow from Check and sign returns to the Walkthrough.
- `81` — Round S20 — the field (three pushes): a filed blasting log with a seismo photo reaches the office (the PDF counts the moment it lands, a stored photo is reused); the copy carries each attachment's context; Mark complete needs a rig; a sent-back drill log shows first on Drilling and the home; Needs attention is one line with the age setting; the screen tours are gone; checklist hours are one paper saved in the morning (nothing "running") and completed with the stop hours from the day's tile, the home card or the daily report (which waits, with Remind, for the blaster); File this day waits amber; the shot plan follows the accepted drilling and names its deviations; incidents on the day (the tile, the + door, Injury and Near miss, Do now with the call log) and the office files one.
- `82` — Round S21 — Records that fill the window, attachments under the PDF, and the approval process: the page does not scroll (the list does) and uses the window; two-line rows with the particulars and the paper-clip count; the Columns menu and Density, remembered; the tree (customer › site › job › day) with counts that respect the chips, Hide the tree; the drawer preview over the list's right half (Close, the back gesture), Open in a window; the filmstrip with each attachment's context, the kind chips, the lightbox; Export binder on a node with the per-paper index and attachments-index.csv; the approval matrix (office ticked everywhere, admin locked, a tick grants the capability); the queue's columns and Mine; the review screen (papers left, PDF + filmstrip right, Send back a time card with a note, refiled · waiting, Approve, Approve the day); the filer's home row, File row line and "Approved by" banner; Records' Approved by column; the server refuses a role the matrix does not tick (403); Print pack. Needs the local API (the review decisions are REST).
- `83` — Round S22 — the job page shows its facts, a job is set up in a minute, and every job carries its contact sheet: the record pages use the window and the header holds the facts, real Overview cards, a 3–4 column form; New job in three steps (a typed customer, a typed address, the name from the site, the number automatic), the setup line, the Jobs page's rows expanding in place, New job from a site opening on the job step; the contact sheet prefilled with source chips (job · customer · site · Baystate · blank), an override kept on the job, Use the site's again, a later site change offered (Use it / Keep ours) and named in the setup line, Make this the site's too, dated versions + Accept all, the print's stamp, blanks and missing rows; the crew's ☎ on the day (tap to call, maps links); Admin › Company's five office rows; the Do now lists reading the sheet; Suggest on the hospital row (the nearest three with an ER from the bundled federal list, miles and phones; a tap fills the row and keeps the map point) and on the urgent care row (OpenStreetMap live, or the honest line when it does not answer; Search the web for an untagged phone); the print's back page with the scan-for-directions code and the route line (one step per line when ROUTER_URL points at the router, else "prints once the router is on"). Needs the local API.
- `84` — Round S24 — The open feedback: reminders, the timing grid, who filed: a send-back writes no reminder row (the driller's home has ONE sent-back line, from the log itself); Remind for a time card still writes its one reminder; a day filed with a time-card reminder and an old send-back reminder on it → the driller's home shows the time-card line, no toast, and filing the card resolves it on read (the rows are not written to); a "moved" reminder written on the FILED day reaches the driller, the × hides it at once and the one write stands (a filed day does not lock a nudge); the audit has no refused write from the driller's device; no Remind on the daily report's rig row, no "Enter … stop hours" button on the home card; a plan painted hole by hole (44 of 50) draws 44 timing holes and 6 unused positions, an old wire into an unpainted position is ignored (3 timed, not 4), an unused position cannot be tapped, a painted hole still wires; Work days · Everyone names the blaster in charge and "filed by … 1:49 pm" on the filed day, no filer on the unfiled one. Needs the local API (the audit read).
- `85` — Round S23 — Drilling over days (push 1, §1–§4): the + plans the drilling at a job (a new pattern, Draft, the grid editable); Send names the driller and the paper says when, to whom, by whom; one drill log per pattern (the driller's part); the day's Drill plan tile reads the pattern's state and opens it; the part opens with Done for today · My part is done (no Mark complete); holes carry the driller, the rig and the date; Change rig opens the new rig's checklist for its start hours (the morning save asks start hours and the checks only), the log names the change and the next hole carries the new rig; a second driller's part joins the count ("pattern 6 of 44 · you 4 · Mark 2"); the end-of-day buttons wait for the rig checklist; the morning checklist opens as the one form again (no stop-hours panel), Complete says what is missing and refuses without the signature, File this day carries a red line for the driller's own incomplete checklist, signed and complete it files and the line goes; Done for today leaves the part open; the blaster's home's Drilling band with the count, the footage and the pace; the home card's Continue drilling (door A); hole 44 turns the pattern Drilled by itself; My part is done signs once; Drilled and waiting with the parts to accept; the day's tile reads Drilled 44 of 44; the review names the water hole; the pattern is locked once drilled; Accept the drill log accepts both parts and files their office copies. Needs the local API; wakes the retired H33-RIG as harness72 does. Push 2 (§5–§7): Accept files ONE office copy per pattern; the day's Drill plan tile offers "Make Shot 1 from Bench 1" (door A) and the shot carries the pattern (44 holes, 880 ft, the header numbers, the layout, totals from the drilling); the pattern reads Shot and its page loses the Make the shot door (one pattern, one shot); Add shot lists a second, unsent pattern as not pickable with the reason and "Drilled by others" adds a blank shot (door B); the shot's drilling card is facts (plan, the parts with rigs and signed dates, holes and footage, off-plan and water, who accepted), no Build-the-drill-plan door, the blank shot offers "From a drilled pattern…"; the printed blasting log carries the pattern lines; the drill log sheet lists all 44 holes with Driller and Rig columns and one signature block per part; the walkthrough's first step is the Pattern (done) and Continue never says "build the drill plan"; Records has the pattern node under the job with the plan's own dated line (Shot) and its parts.

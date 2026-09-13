# The queue — accepted, not yet scheduled

Items Matthew has agreed to that wait for their round. Source: the Sep 9 2026
retrospective (artifact a4bb3fdc). Bucket A shipped as round S10. When an item
is built, move its line to docs/decisions.md with the round that shipped it.

## B — the two weeks after Mark's first day

- Crash reporting on the live app and the API (Sentry, free tier), with the
  Express global error handler; today a crash reaches Matthew only if someone
  taps Report.
- ~~Four shortcuts~~ SHIPPED Sep 9 evening (see decisions.md): /round, /deploy,
  /harness-new + pre-push hook, /release-notes + the first What's new page.
- Open items move to GitHub Issues; decisions.md keeps decisions only.
- Testing layers: property tests (fast-check) over calculations, hole
  distribution and the status-transition graphs; the permission contract
  suite (every role × every table × op on the upload path, every route) in
  CI on push; the random-tap crawler's first version nightly.
- Approve / Send Back become capability-aware on the admin route (admin.ts
  uses the fixed-role check; the sync path already uses roleDefs).
- Emergency contacts on the day page resolve through the site (legacy jobs
  show the job's stale list).
- K factor shows its source on the plan ("K 160 · from site").
- Writing: backup & restore runbook with one rehearsed restore into a scratch
  database; lost-device procedure; the "when the app doesn't work" paragraph
  with Matthew's number and hours; a one-page service agreement draft for a
  lawyer (ownership of records, advisory compliance badges, cancellation).
- R2: enable the bucket lock (S10 made the uploader lock-safe); a weekly copy
  of the bucket to a second bucket from a scheduled GitHub job.
- Web app CSP: ship report-only first, read the reports, then enforce.

## C — before a second company (the Production gate)

- One formatting module under the Print pages and pdfdocs so a printed report
  and its PDF cannot disagree (labels already diverge: MOD vs Moderate).
- SQLite expression indexes on the payload's hot keys and SQL-side ordering;
  split RoleCards (six homes, N+1 inside live queries).
- Remove the legacy Job fields after the hierarchy backfill; fold
  blasterProfiles into User; drop SyncRecord, Tombstone, prototype.html.
- PIN hashed server-side and out of session responses; /health split into a
  public liveness probe and an authenticated diagnostic; the upload path
  re-reads the user's company.
- Screenshot baselines nightly; the agent eval nightly on tiered models with
  per-step timeouts and stale-ref detection; archive harnesses 1–9 and migrate
  10/30/45 to lib.mjs.
- A one-day external penetration test ($2–4k) scoped to auth, cross-company
  sync isolation and file presigning.
- Paid map/geocoder plan (OSM tile policy discourages heavy commercial use).
- Export-everything before a Production company can be deleted; retention
  floors documented and enforced (ATF 5 y, MSHA 3 y, DOT 90 d).
- Cost sheet and a floor price; "ShotLog" trademark clearance; the signed
  service agreement; sunlight-and-gloves session on the real tablet.

## Backlog — raised during Mark and Joe's testing (freeze from Sep 9 2026 evening)

Running list. Nothing here is scheduled; Matthew decides when the freeze lifts and what
becomes a round. Each item says what the app does today so the plan starts from facts.

- **Documents that stand on their own for a day (Matthew, Sep 10 2026).** A gas-main
  leak stopped drilling and blasting; Mark and Joe still had a day to account for, so
  the only paper that day is time cards. Today: every work day carries a daily report,
  and blasting-type days add a blast log; a driller's own time card can exist without a
  day (his home "My hours"), but a blaster's time cards live on the day's daily report,
  so a "time cards only" day means creating a work day of a non-blasting type first.
  Ask: let the drill report, daily log, blast report and time cards each be started and
  finished independently on a date, while anything they share (job, crew, hours,
  equipment, pattern) is entered once and flows to the others. Plan-first: map which
  facts each paper needs, which are shared, and what "a day with only time cards" looks
  like on the dashboard and in Records. Related root question: WorkDay-vs-BlastDay
  in docs/paper-forms-analysis.md.
- **First-week checklist (Mark, Sep 10 2026): "will it always show up?"** Today it
  stays on the home screen until every item on it is done, or until Hide is tapped on
  that device; it is not time-limited. Consider: hide itself after the first filed day
  or after 14 days, and say so on the card.
- **A job can be created with a customer but no site, and the app invents a nameless
  customer and site for it (Matthew, Sep 10 2026; reproduced locally).** Path: Start work
  → Which job? → tap a customer → "+ New job for <customer>" → the Site field says
  "Pick site…" and is not required → Create is enabled. `createJob` then sees no siteId
  and calls `ensureCustomerAndSite` with the picker's customerName, which is EMPTY on
  that path (the dialog passes only customerId), so it creates a customer named "" and
  a site named "" with no address, and the job's siteId points at that site while its
  customerId points at the real customer. On the Customers page it reads as a site
  with no customer. Fix (when the freeze lifts): (1) the Site field is required —
  pick one or "+ New site" with a name/address; (2) `createJob` resolves the picked
  customer by id, never by a name that may be blank, and never creates a customer
  with an empty name; (3) a one-time cleanup in Beta: repoint the job to the real site
  and delete the blank customer/site (platform admin). Harness: create through the
  dialog with no site → refused; through "+ New site" → site under the picked customer.
- **Explosive weights to the decimal (Mark, Sep 13 2026).** Today each line's weight is
  quantity × the catalog multiplier kept at full precision, but every place it is shown
  rounds to one decimal: the usage form's line and total, the blast log PDF's total,
  and the powder-factor line rounds pounds to a whole number before dividing. A
  multiplier like 2.6315 lb/stick × 19 sticks = 49.9985 shows as 50.0. Ask: show and
  print weights to the precision the paper carries (two decimals unless Mark says the
  catalog needs more), keep full precision in the stored number, and compute PF from
  the unrounded pounds. Decision for Mark: two decimals everywhere, or four on the
  line and two on totals?
- **Where I am, and a ring around the blast (Mark, Sep 13 2026).** Today the location
  bar flies the map to the GPS fix or the entered address but drops no marker, and the
  closest-structure distance on the plan is typed by hand even though structures are
  pinned on the map. Ask: (1) a marker at "where I am" — the GPS fix (with its
  accuracy circle) or the address that was searched; (2) a ring around the blast pin,
  250 ft by default, adjustable on the map and on the plan; (3) structures inside the
  ring called out ("2 structures within 250 ft — Stevens residence 180 ft, barn 230 ft")
  and an offer to fill the plan's closest-structure distance from the nearest pin. The
  ring radius lives on the shot's site diagram so the printed map shows it.
- **Connecteam schedule integration (Matthew, Sep 13 2026).** Baystate schedules crews
  in Connecteam. Connecteam has a public REST API (X-API-KEY header) on the Expert plan
  or higher; the Operations hub exposes scheduling: "Get shifts" per schedule for a
  date range, filterable by job and assigned users, plus a webhook that fires when
  shifts or availability change. What it could give ShotLog: who is scheduled on which
  job on a date (today and ahead) → the day's crew and time cards prefilled, "today's
  crew" on the blaster's home, driller assignment known before the plan is sent.
  Shape: server-side and read-only first (the key never reaches a device), a nightly
  pull plus the webhook, a mapping of Connecteam users → ShotLog people by email and
  Connecteam jobs → ShotLog jobs by name with an admin screen to fix mismatches.
  Needs from Matthew/Baystate: confirm the plan tier (Expert+), an admin creates the
  API key, and a look at how jobs are named in Connecteam. Plan-first item; sources:
  developer.connecteam.com (api-access, scheduler-shifts, scheduler-webhook).

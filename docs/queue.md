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

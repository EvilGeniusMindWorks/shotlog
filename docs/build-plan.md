# Build Plan — from the persona designs (2026-08-17)

The implementation sequence for everything approved in the persona phase.
Rules of the road: each round amends the charters/decisions FIRST if scope
shifts, ends with a harness + deploy + charter check-off, and no round
starts work its predecessor's foundations don't support.

Design sources: blaster study (artifact 9bfdcfb9), driller study
(cab6eae6), shop study (82425527), deletion-pattern.md,
walkthrough-audit-2026-08.md. Charters: docs/personas/.

## Round 1 — Foundations (cross-persona data model) — ✅ SHIPPED 2026-08-17

Everything later rounds stand on. No new screens except where a pattern
demands a first consumer. Verified by harness31 (21/21); commit 0fb2d10.

1. ✅ **Time cards** — `timeCards` synced record (person, day/job, ST/OT +
   optional in/out, signature, draft→filed→approved, entered-by). Server
   enforces: own-card ownership (login subjects write their own; no-login
   roster entry allowed + attributed), attribution on create, approval =
   `approve_days`, approved freeze, draft-only delete. First consumer:
   TimeCardsCard on the day's daily tab. Feeds daily-report aggregation
   (Round 2) and Evette's card approvals (Office round).
2. ✅ **Record lifecycle (Archive/Delete)** — per deletion-pattern.md
   (approved). ⋯ menu + consequence sheet + 10s undo toast + Active/
   Archived/All filters (Jobs/Customers/Sites lenses; drill-plan card).
   Choke point: archivedAt flip rides the DELETE grant; never-used rule
   for customers/sites/jobs/drill plans/equipment/people
   (LIFECYCLE_CHILDREN in shared); days delete draft-only with nothing
   filed; accepted drill logs never.
3. ✅ **Hour ledger** — lib/hourLedger.ts derives current hours from
   sourced entries (checklist start, daily-report readings, shop
   corrections). `hourCorrections` append-only (`correct_hours`:
   mechanic/supervisor; PATCH/DELETE admin escape hatch; attributed).
   HourLedgerCard + Correct-hours gesture on the equipment page.
4. ✅ **Capability updates** — `setup_jobs` grants blaster customer/site/
   job CREATE/EDIT; archive stays supervisory; no other role changes.
5. ✅ **Per-shot responsible blaster + signature** — model (a) fields on
   Shot + ShotSignoff row; server guard: sign-off only by the responsible
   blaster (supervisors excepted).
6. ✅ **Language pass** — days are nouns: FAB/dialog/tour/empty states
   re-worded to verb the work or the job.

## Round 2 — The Blaster experience — ✅ SHIPPED 2026-08-17

Per the approved study (artifact 9bfdcfb9). Verified by harness32
(20/20); commit 64d6618 (+d4ef80b health marker).

- ✅ Home: needs-attention strip (sent-back w/ office reason inline ·
  patterns awaiting review · stale drafts — ranked, capped after ranking)
  · today + Continue · months collapsed w/ search. KPIs off home.
  NEW: `blastDay.sendBackNote` — the approvals send-back prompts for a
  reason; server stamps it, clears on any forward transition.
- ✅ The day as a phase spine (BlastDayPage default view on blasting
  days): Drilling → Readiness → Shots → Seismo ("later ok") → Time cards
  → Report & file; map not gate; Continue targets the current phase.
- ✅ Merged drilling review with per-driller color attribution + hazard
  rows; Accept flows into readiness.
- ✅ Shot readiness review (blastLog.readinessReview): planned vs
  as-drilled, hazards as questions, max-lbs/delay seeds every shot.
- ✅ Hazard rail during loading (ShotHazardRail in the shot card).
- ✅ Compliance explainer (ComplianceSheet): rule + math + what-would-
  pass; wired to design badges, seismo chips, readiness.
- ✅ Time-card phase (mine + crew status via the Round 1 card).
- ✅ Pre-blast checklist placeholder; language in Admin › Company.
- ✅ Seismo late-attach never nagged (verified: no missing-reading gate).

## Round 3 — The Driller experience — ✅ SHIPPED 2026-08-17

Per the approved study (artifact cab6eae6). Verified by harness33
(16/16); commit aeb5c74.

- ✅ Trio home: Checklist · Drill log · My hours tiles + "Yesterday needs
  you" strip (unsigned prior logs) + "Drilling today" card with
  all-driller progress and Continue. My-hours opens a STANDALONE card
  (cards bind to job + date; the work-day record attaches later).
- ✅ Batch-first hole panel: tap-to-select plan grid → "Log N as planned"
  one-tap batch / "Log with changes…" into the big-type single-hole
  panel; "Mark skipped ⊘" = first-class `DrillLogHole.skipped` marker,
  excluded from counts/footage everywhere, dashed in the blaster's
  merged review. Off-plan holes: type any number — ordinary entry.
- ✅ Advisory 50-hour clock (serviceClock.ts, from the hour ledger vs the
  last weeklyDone checklist) on the checklist page — amber ≤10 h
  remaining, never blocking. Feeds Round 4's PM queue.
- ✅ Solo drill-only report & file: slim "File the day" card (trio flows
  in; extras never block) on non-blasting days.
- ✅ No-plan drill-log path RETIRED: driller StartGrid tile removed;
  drilling starts from a plan (empty state points at trivial plans).

## Round 4 — The Shop experience — ✅ SHIPPED 2026-08-17

Per the approved study (artifact 82425527, wide-first). Verified by
harness34 (15/15); commit caaba3d.

- ✅ Trio home (Down · Tickets · Due soon) over ONE merged worklist
  (tickets + due services), drag-ordered by the shop with reset-to-
  default (order lives on the bench device); fleet-now card + mini map.
- ✅ Where's-my-equipment (/equipment-locator): passive last-record →
  job → site derivation, staleness chips, "mark at the yard" gesture
  (`equipment.atYardAt`, newer field records win), list+map split wide /
  toggle phone; pins from one-time site geocodes (`Site.geo` + device
  cache), yard = company address, one pin.
- ✅ PM on FLAGGED ASSUMPTIONS (amber band, per-class placeholder
  intervals, due from the hour ledger vs `equipment.services[]`,
  "Log a service done" restarts the clock). Advisory only — real
  intervals swap in when the shop crew answers (held questions stand).

## Round 5 — Smart-list remnants + polish — ✅ SHIPPED 2026-08-17

Verified by harness35 (9/9) + the audit-sweep re-run; commit 1820988.

- ✅ My Records + company book windowed (DocList: 15 + Show-all; search
  shows everything). ✅ Jobs lenses: search on all three + windowing
  (15 + Show-all); Active default was Round 1's lifecycle filter.
- ✅ Equipment-detail history windowed (10 + Show-all). ✅ Job-detail
  work-day list windowed (8 + Show-all). ✅ /days = the month-grouped
  list (MonthDayList, shared with the blaster home).
- ✅ View-as lists custom roles (roleDefinitions merged into the picker).
- Test-user cleanup recorded as an OPEN decision (decisions.md).

**Audit gate met** (was: field dashboard 13.5/25.9 screens): every
field/shop persona screen ≤2.2 screens — home 1.6 (1.7 phone), /days
1.2, /records 1.2, /jobs 1.6, equipment 1.2. Still >4 and deferred to
the pending rounds: admin/office home 4.3, Admin›People 4.2–4.4.

## Runs alongside (not gated on rounds)

- Office/Evette walkthrough (paused mid-conversation — the ATF-audit
  question is the big one) → Office round designs after.
- Owner, Admin, Platform Admin walkthroughs + studies.
- Field questions out: shop crew (PM intervals, paper artifacts, parts,
  bench-vs-truck); Mark (permits placement, job-status names).
- Parked technical: Resend invite key on Railway; signature/map blobs →
  R2; manufacturer slug dedupe.

## Dependencies to clear before Round 1 ships

1. Matthew approves deletion-pattern.md (+ its three questions).
2. Nothing else — everything in Rounds 1–4 is designed and decided.

## Working agreement

- One round per branch/PR-sized effort; Railway-first deploys when
  shared/server change; harness per round; demo byte-check every deploy.
- Charters get the ✅ when their round ships; the audit gets re-run
  (audit-sweep.mjs) after Round 5 to confirm no screen exceeds ~4 screens.

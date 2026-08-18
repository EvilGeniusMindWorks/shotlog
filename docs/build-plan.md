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

## Round 3 — The Driller experience

Per the approved study: trio home (checklist · log · hours + "yesterday
needs you"); hole panel rebuilt batch-first (grid select → "log N as
planned" / "log with changes"; add/skip/move as ordinary actions);
checklist presented as its own daily artifact with the ADVISORY 50-hour
clock from the ledger; solo drill-only report & file (trio flows in,
extras optional); **retire the no-plan drill-log path** (small jobs get
trivial plans).

## Round 4 — The Shop experience

Per the approved study (wide-first, phone fallback): trio home (Down ·
Tickets · Due soon) over ONE merged worklist with shop-editable order
(drag, reset-to-default); **where's-my-equipment** (last-record → job →
site; one-time geocode saved to site; list+map split wide, toggle on
phone; "at the yard" gesture; staleness chips); PM section with FLAGGED
ASSUMPTION intervals (advisory only) — real intervals swap in when the
shop crew answers.

## Round 5 — Smart-list remnants + polish

What the new homes don't already fix (from the audit): My Records
windowing; Jobs lenses search + Active-default filter; equipment-detail
history windowing; job-detail work-day list windowing; /days becomes the
month-grouped list. Plus: View-as lists custom roles; test-user cleanup
decision point.

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

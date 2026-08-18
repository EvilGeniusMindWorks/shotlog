# Build Plan — from the persona designs (2026-08-17)

The implementation sequence for everything approved in the persona phase.
Rules of the road: each round amends the charters/decisions FIRST if scope
shifts, ends with a harness + deploy + charter check-off, and no round
starts work its predecessor's foundations don't support.

Design sources: blaster study (artifact 9bfdcfb9), driller study
(cab6eae6), shop study (82425527), deletion-pattern.md,
walkthrough-audit-2026-08.md. Charters: docs/personas/.

## Round 1 — Foundations (cross-persona data model)

Everything later rounds stand on. No new screens except where a pattern
demands a first consumer.

1. **Time cards** — new synced record: person, day/job, hours (ST/OT or
   in/out), signature, status (filed → approved), entered-by (self vs
   entered-for). Permissions: everyone writes their OWN; entering for a
   no-login roster person is allowed, attributed, discouraged. Feeds:
   daily-report aggregation, Evette's future card approvals.
2. **Record lifecycle (Archive/Remove)** — per deletion-pattern.md.
   ⚠ NEEDS Matthew's approval of the proposal + its three open questions
   (remove vs archive-only for hierarchy; ATF retention lock; wording)
   BEFORE this ships. UI shape: ⋯ menu + consequence sheet + undo toast +
   Active/Archived/All filters.
3. **Hour ledger** — meter readings become sourced entries (checklist
   start, day's use, shop correction — append-only, audited); current
   hours derived. Shop correction gesture is the first consumer.
4. **Capability updates** — blaster gains customer/site/job CREATE/EDIT
   (archive stays supervisory); no other role changes.
5. **Per-shot responsible blaster + signature** — shot model change
   (model (a)); server guard: shot sign-off by its responsible blaster.
6. **Language pass** — days are nouns app-wide: audit every button/title
   that verbs a day ("start/resume a day", "Start today's log") and fix.

## Round 2 — The Blaster experience

Per the approved study: home (needs-attention strip · today · months
collapsed — replaces the 13-screen dashboard); the day as a phase spine
(map not gate, Continue targets current phase); merged drilling review
with per-hole driller attribution; **shot readiness review** (new step:
plan intent vs as-drilled + hazard questions → adjustments seed shots);
hazard rail during loading; **compliance explainer** (rule + math +
what-would-pass, incl. seismo results); time-card phase (mine + crew
status); pre-blast checklist placeholder; seismo late-attach without
nagging.

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

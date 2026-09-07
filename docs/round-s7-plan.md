# Round S7 — plan from Matthew's first-rehearsal feedback (2026-09-07)

Status: **ACCEPTED 2026-09-07 — all eleven Build.** S7a ✅ shipped
2026-09-07 (harness42 27/27); S7b ✅ shipped 2026-09-07 (harness43
34/34). S7c, S7d next in that order. Review
artifact https://claude.ai/code/artifact/b33c3106-1cbd-49d4-98d8-4f0b71461612
(reactions in its `responses` collection, ids `i1`…`i11`, `i10b`).
Item 10 second-draft answers: end-of-day meter on the drill log at
sign-complete; proposed in/out as a suggestion the driller confirms;
"take over the report" tabled.

Matthew's eleven notes after rehearsing the roles, grouped by the model
they touch. Each item: what the code does today, the proposal, the open
question. Sub-rounds S7a–S7d; persona-first rules apply to each (amend
charters/decisions → build → harness → deploy → check-off).

## S7a — Rehearsal makes the rest testable (~1.5 days, server + web)

1. **Baystate data on Start.** Copy the platform admin's own company's
   equipment, people (as roster people without logins), catalog +
   manufacturers, company settings and custom roles into the sandbox on
   every Start; the six rehearsal accounts sit on top. Switch on the
   Rehearse card: *Start with Baystate's data* (default) / *Start empty*.
5. **"Add sample data" = a connected week** at two jobs: a drill plan sent
   to Rehearsal Driller half drilled; yesterday's full blast day
   (log, shot, design, seismo, accepted drill log, daily report, filed
   time cards) submitted and awaiting approval, with a filed copy; today's
   draft day; a failed rig checklist → open repair ticket + rig out of
   service; a machine with a service due; an open incident; a filed time
   card per rehearsal person. One server-side fixture, idempotent.
11. **Driller checklist with nothing else.** Already works from the
   Checklist tile via the rig picker (no job or day needed); it failed in
   the sandbox only for lack of rigs. Add *Rig checklist* to the Drilling
   tab and the driller + menu; remember the usual rig on the ACCOUNT;
   "attach to today's day" optional.

## S7b — Hierarchy and the day dialog (~2 days, web)

2. **One New job flow, Customer → Site → Job**, used everywhere a job is
   created (dialog, Jobs lens); New Customer / New Site share the field
   components. Lens tabs reorder to Customers · Sites · Jobs (question:
   reorder, or keep Jobs first and fix only the create order?).
7. **New work day dialog:** Name → Recent-jobs chips (last two weeks, one
   tap) or Customer → Site → Job with search → Date → Type of work (prefilled
   from the job's last day — question) → Copy from previous (default most
   recent day at that job).
3. **Log out in one place:** remove from Settings; My Profile keeps Sign
   out; Settings account line links to Profile.
4. **Settings sections:** You · Preferences (dark mode, usual rig, default
   type of work, copy-forward defaults, record layout) · Help & feedback ·
   Install (while not installed) · Rehearse (platform admin) · Data &
   device (sync line, Reset local data, Export JSON, build) — last.
6. **Records by home bucket, no role mapping:** default kind sets per
   bucket + "show everything"; field = blast logs · daily reports · drill
   logs · incidents; driller = drill logs · checklists · time cards;
   mechanic = checklists · repair tickets · services · hour corrections;
   office/admin = everything, Filed first. Repair tickets, services and
   hour corrections become record kinds.

## S7c — Screen tours (~1 day, small server field)

8/9. Per-screen scripts on the existing tour engine, auto-run the first
   time an ACCOUNT opens the screen (`User.toursDone` list), re-run from
   ? → *Show me this screen*. Scripts: blaster day hub, blaster shot card,
   driller drill log, driller checklist, mechanic shop, office approvals,
   admin people. Never two tours in one sitting. Question: auto-run for
   everyone once (lean) or only after the home walkthrough was finished?

## Matthew's reactions (2026-09-07 afternoon)

Items 1, 2, 3, 4, 5, 6, 7, 8/9, 11: **Build**. Notes folded in:
- 2: reorder the lens tabs (Customers · Sites · Jobs).
- 7: customer first; one site → auto-fill, else only that customer's sites;
  one job → auto-fill, else only that site's jobs. Type of work = job's last
  day → job's own `defaultTypeOfWork` (NEW field, set at create, editable
  on the job) → drill_to_blast.
- 8/9: auto-run screen tours for everyone, once.
- 10: first draft **rejected** ("day belongs to whoever started it" lets an
  overeager driller lock the blaster out). Answers: shop files no cards for
  now; nudge only, never edit another login-holder's card; driller hours
  should auto-populate from log/checklist where possible. Asked for the
  system played out in practice → second draft below.

## S7d — Time and the work day, SECOND DRAFT (~3 days, shared + server + web)

Facts from the records today: DrillChecklist has `startingHours` only;
DrillLog has NO hours (timestamps only: createdAt, hole createdAt,
completedAt); TimeCard has timeIn/timeOut/ST/OT; EquipmentEntry on the
daily report has typed hoursStart/hoursEnd; lib/hourLedger.ts already
merges checklist + daily-report + correction readings.

Ownership by ROLE, not by who tapped first:
1. **The work day is a container.** One per job per date; opening it grants
   nothing. Dialog + launcher tiles reuse today's day at that job and say so.
2. **The blaster owns the report** (name, type, conditions, notes, materials,
   subs, equipment list, blast log) on any day with a blast log. A driller's
   drill-only day becomes the blaster's the moment the blast log is added
   (existing upgrade path). First blaster to edit is the author; another
   blaster / supervisor / admin can *Take over* (audited).
3. **Each person owns their trio only**: own time card, own drill log, own
   rig checklist (driller); own card (blaster). Drill-only day without a
   blaster keeps the slim "file the day" path.
4. **Work Force = the day's time cards keyed by job + date** (not day id →
   no ordering luck). Blaster adds entered-for cards for no-login people,
   cannot edit a login-holder's card, sees "not filed yet" + nudge; missing
   cards never block submit. Legacy Work Force rows stay read-only; no
   migration.
5. **Rig hours from the machine's records**: checklist starting hours +
   NEW end-of-day meter asked once at drill-log sign-complete (prefilled,
   skippable). Drill rows on the daily report become derived/read-only;
   trucks and seismos stay manual. Ledger gains the end reading as a source.
6. **The driller's card starts filled in**: proposed in = checklist signed
   (or first hole), out = log signed (or last hole), rounded to 5 min,
   sources shown; accept or edit; signature still required.

Collisions: same job+date created on two offline devices → server keeps
both; day page shows "Two copies of today — merge" to blaster/supervisor/
office; merge keeps the copy with the blast log, re-parents logs/checklists/
cards, audited. Cards already correct via job+date.

Open questions (artifact id `i10b`): (a) end-of-day meter on the log
sign-complete (lean) or as a checklist second half? (b) proposed in/out
as a confirmable suggestion (lean) or silent fill? (c) "Take over" needed
now, or leave to the open multi-blaster decision?

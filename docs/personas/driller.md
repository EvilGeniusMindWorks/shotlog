# Driller

Status: **WORKFLOW + SCREEN DESIGN APPROVED (Matthew, 2026-08-17)** — design study: claude.ai/code/artifact/cab6eae6-a462-4b24-beb9-c59963687be4
Real people: Dinis; other drillers

## Who they are

Runs the drill ahead of the blast — sometimes days ahead, sometimes on
drill-only jobs. Works gloved, outdoors, phone/tablet. Their drill logs
are the handoff the blaster loads from. **The pattern on the ground is
the truth**: drillers physically flag every hole with collars/stakes —
the app records what was physically placed.

## The workflow, as validated (2026-08-17)

### Days before
- The plan arrives (blaster-authored). Multiple drillers split the grid
  **fluidly** — they agree among themselves, mechanism unknown and
  unimportant. **No claim/assignment feature.** Every driller sees every
  plan; dispatch stays a future optional planning feature.

### The morning
- **The rig checklist is a SEPARATE artifact, never attached to the drill
  log.** One per rig per day, mirroring the paper form (Rev.2 5/9/17):
  asset #, starting hours, daily checks (oils, fluids, hoses-while-
  drilling, grease, horn/alarm/e-stop…), the **every-50-hours-OR-weekly**
  section (air filters, extinguishers, rollers), free-text repairs,
  driller signature. Repairs feed the shop's ticket queue (already true).
  Refinement: compute the 50-hour due state from starting hours instead
  of trusting memory (ties to Shop PM round).
- The drill log SELECTS the rig used (field exists) — that's the only
  link between log and machine.
- No "before you drill here" briefing needed: blaster and drillers walk
  the ground together. **General notes on the drill plan** are enough.

### Drilling
- Rhythm is BOTH: hole-by-hole as they go, or **many at once** — batch
  recording must be effortless ("holes 12–18, all as planned" = a
  two-tap gesture, not seven identical entries).
- **Deviations from plan are STANDARD OPERATION** — skip, add, move
  holes must be first-class, not awkward. The app mirrors the collars
  actually placed in the ground.
- Conditions at depth (water, voids, seams) + notes — feeds the
  blaster's readiness review (see blaster charter).

### End of day
- **Drill-from-plan is THE model** — every drilled hole lives under a
  plan, even a trivial one. The legacy no-plan path gets retired.
- The driller's daily trio: **their hours (time card) · the drill log ·
  the rig checklist.** Sign the log complete; blaster accepts later
  (acceptance locks holes).
- Drill-only days: **the driller can submit the daily report without a
  blaster when necessary** (Matthew 2026-08-17) — the trio plus a slim
  report-and-file path that never requires blast-side involvement.

## Jobs to be done

1. ✅ Trio home (Round 3): checklist · log · hours tiles + yesterday-needs-you
   strip + drilling-today progress; day-verb language fixed in Round 1
2. ✅ Plan-driven logging: big-type hole panel, derived angle/length from kick
3. ✅ Hazard capture at depth + notes
4. ✅ Standalone daily rig checklist per machine, repairs → tickets
5. ✅ Rig selection on the log
6. ✅ Batch hole entry (Round 3: grid select → "Log N as planned" = two taps)
7. ✅ Deviations standard (Round 3: "Mark skipped ⊘" first-class marker;
   off-plan holes are ordinary entries; the no-plan path retired)
7b. ✅ Submit a drill-only day without a blaster (Round 3: slim "File the
   day" card — trio flows in, extras never block)
8. ✅ 50-hour/weekly due-state computed from the hour ledger (Round 3:
   advisory amber clock on the checklist, feeds the Shop PM round)
9. ✅ Own daily time card (Round 1: per-person `timeCards` on the day's daily
   tab; everyone files their own, server-enforced)
10. 🔜 Dispatch — future optional planning feature, never blocking

## Sore points (audit 2026-08)

/days full-history browse (12.9 screens); Jobs list noise (53 rows, no search).

## Screens they touch

Driller home · drill plan (read + general notes) · drill log + hole
panel (batch + deviations) · rig checklist · time card · drill-only day
report (solo submit) · My Records · jobs list

## Never make them…

- type with precision — big targets, big type, gloves on
- enter seven identical holes seven times
- treat an off-plan hole as an exception to apologize for
- care about the blast side's paperwork
- attach a checklist to a log — separate artifacts

## Settled (2026-08-17)

- Grid split stays fluid; no assignment feature
- Checklist = standalone daily artifact per rig; log selects the rig
- Plan general notes suffice; no pre-drill briefing card
- Batch entry + deviations-as-standard are design requirements
- Drill-from-plan is the model; no-plan path retires
- Daily trio: hours, log, checklist
- Driller may submit a daily report without a blaster when necessary
- Screens approved: trio home, grid-select batch logging ("as planned" /
  "with changes"), 50-hour clock stays ADVISORY (amber, never blocking)

## Guidance served (Round S2, 2026-09-06)

- ✅ Walkthrough auto-runs once per account: three tiles → Drilling → My records → Help.
- ✅ "About this screen": My Drilling home, Drilling tab, drill log (shot and plan), rig checklist, my records.
- ✅ First-week card: sign once · walkthrough · file a rig checklist · log holes · enter hours — ticks itself from the driller's own records.
- ✅ Empty states name who to ask when there is no plan yet (the blaster) and how to start a drill-only day.

## Clutter sweep + records (Round S4, 2026-09-06)

- ✅ "Yesterday needs you" is capped at 5 ranked rows (sent-back first) + "N more on the Drilling tab" — the trio never sinks below the fold.

## Round S7 — first-rehearsal feedback (Matthew, 2026-09-07)

### S7a (building)
- **A rig checklist with nothing else.** The Checklist tile already opens
  the picker → checklist with no job or day; it only failed in rehearsal
  because the sandbox had no rigs. Now: the Drilling tab gets a *Rig
  checklist* door too; the picked rig is remembered on the ACCOUNT (the
  machine's "usual operator" — `equipment.assignedUserId`, which field
  roles may patch) so a phone and a tablet agree, with the device key as
  the offline fallback; the checklist page offers "attach to a job"
  as an optional select, prefilled with today's job when there is one.
- Rehearsal sample data gives the driller a plan sent to them, half
  drilled, on a rig with a checklist history — the trio is testable.

### S7c (shipped 2026-09-07)
- ✅ Screen tours, once per account: the drill log (tap the holes you
  drilled · your rig, your name · sign it complete) and the rig checklist
  (hour meter first · the walk-around · out of service). Re-run from
  ? → "Show me the drill log / the rig checklist".

### S7d (shipped 2026-09-07)
- ✅ The driller owns their trio and nothing more: own time card, own drill
  log, own rig checklist. On a blasting day the report is the blaster's
  (the daily-report tab says so); a drill-only day they start is theirs,
  with the slim "file the day" card, until a blaster adds the blast log.
- ✅ End-of-day meter asked once at Mark Complete (prefilled from the
  ledger, skippable) — closes the rig's hours without typing them on any
  report; the shop's ledger shows it as "drill log · end of day".
- ✅ Their card starts filled in from their own records (checklist signed
  → first hole; log signed → last hole, to five minutes), with the sources
  named, until they edit — then they sign and file as before.
- ✅ Starting drilling where the blaster already opened today's day joins
  it (the dialog offers *Open that day*); a standalone card lands on
  today's day when one exists.

### S7 follow-up — Matthew's driller rehearsal (2026-09-07)
- ✅ **Never the blaster's screen.** A driller's new day is never prefilled
  into a blasting type (a job whose last day was Drill to Blast prefills
  Drill Only for them — Drill to Blast stays a hand choice), and the day
  page opens on the daily report for the driller bucket even when a blast
  log exists; the Day tab is one tap away.
- ✅ **Copy from previous starts blank** — copying is opt-in.
- ✅ **The rig is the first question on the checklist, not a setting on the
  dashboard** (Matthew's second pass, same day — the rig line + Change rig
  read as a locked value and changing rigs looked like it cost a filed
  checklist). The home tile is a verb: *File rig checklist · not filed
  today* / *Checklist filed · R-102*, and always opens the form. The form
  opens with NOTHING preselected; quick picks name the rigs that matter
  today with their reason (today's log · last filed · usual · recent) and
  *All rigs* opens the searchable fleet. One tap switches, nothing is saved
  until you file; a rig already filed today says so and offers *Open it*.
  Two rigs in a day is natural. The usual rig is written only by filing a
  checklist, logging holes with a rig, or Settings — browsing never writes.
  Old per-rig links still preselect. Launcher tile and Drilling door open
  the same form.
- ✅ **Back goes home.** The drill log's back arrow returns a driller to
  their home (the trio), never to the blaster's plan page or day hub.
- **S8 (accepted 2026-09-07):** with no plan in sight the home says who to
  ask: "No drill plans yet. Ask the blaster for the job's drill plan — they
  send it to you from the job page and it shows up here. Your rig checklist
  and hours work without one."
- **S8a follow-up (2026-09-07):** the log's hole grid IS the blaster's
  pattern (same rows × columns, planned depth under each open hole); row
  handles and "Select all open" log many holes in one tap; the logged list
  is windowed (latest 8) — the grid is the overview.
- **Persona evaluation (2026-09-08):** both agent "Dinises" found the plan in
  one tap ("Assigned to you"), logged rows with the handles, marked wet and
  skipped — and then could not tap **Complete**: the Mark complete sheet
  rendered behind the phone's bottom nav, hiding the end-of-day meter field
  with it. The fifth row the blaster added appeared silently. **S9a batch 1:**
  sheets above the nav; the meter also enterable from the rig row on the
  day's daily report. Later: a "plan changed" badge on the log.

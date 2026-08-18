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

1. ✅ Focused home; today's work one tap away (language fix pending: no "start a log" verbs)
2. ✅ Plan-driven logging: big-type hole panel, derived angle/length from kick
3. ✅ Hazard capture at depth + notes
4. ✅ Standalone daily rig checklist per machine, repairs → tickets
5. ✅ Rig selection on the log
6. 🟡 Batch hole entry ("12–18 as planned") — not effortless today
7. 🟡 Deviations (skip/add/move holes) — possible but awkward; must be standard
7b. ✅ Submit a drill-only day without a blaster (permission exists; keep the path slim)
8. 🟡 50-hour/weekly section: tracked, but due-state not computed from hours
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

# Driller

Status: **DRAFT — awaiting Matthew**
Real people: Dinis; other drillers

## Who they are

Runs the drill ahead of the blast — sometimes days ahead, sometimes on
drill-only jobs with no blast at all. Works gloved, outdoors, on a
tablet/phone. Their drill logs are the handoff document the blaster loads
from.

## Their day

See which plan they're drilling → start today's log against it → per-hole
entry in big type (depth, kick ft + direction, conditions) → note hazards
at depth (water, voids) with notes → sign the log complete → rig checklist
→ file drill-only work days when there's no blast.

## Jobs to be done

1. ✅ Focused home: today's log one tap away (2.5 screens — the app's model citizen)
2. ✅ Plan-driven logging: big-type hole panel, derived angle/length from kick
3. ✅ Hazard capture at depth + notes
4. ✅ Rig checklists that feed the shop's repair queue
5. ✅ Drill-only work days + daily report + submit
6. 🟡 Finding *their* plan: plans are job-scoped and every driller sees every
   plan — fine at 2 drillers, noisy at 6
7. 🔜 **Dispatch/planning** ("where am I drilling tomorrow"): crews
   self-organize today (Mark, 2026-08-17), and that stays the default —
   but planned-ahead dispatch is wanted as a PLANNING feature, not a
   requirement of the daily flow. Design it so self-organizing crews never
   have to touch it.

## Sore points (audit 2026-08)

/days full-history browse (12.9 screens) when looking past today; Jobs
list noise (53 rows, no search).

## Screens they touch

Driller home · drill plan (read) · drill log + hole panel · checklist ·
work day (drill-only) · daily report · submit/file · My Records · jobs list

## Never make them…

- type with precision — big targets, big type, gloves on
- care about the blast side's paperwork
- fill in what the plan already specifies

## Design considerations for the screen phase

- Dispatch, when it comes, likely lives on the PLAN (assign drillers/days)
  and surfaces on DrillerHome as "you're on X tomorrow" — optional, never blocking

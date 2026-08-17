# Shop (Mechanic)

Status: **DRAFT — workflow validated with Matthew 2026-08-17 (several items to verify with the shop crew); screens in design**
Real people: Baystate's **dedicated shop** (confirmed — not a part-time hat)

## Who they are

A dedicated shop. Lives in the repair queue, not in job paperwork. The
field feeds them defects (checklists, tickets); they sign machines back
to life and keep the meters honest.

## The workflow, as validated (2026-08-17)

### The queue
- Dedicated shop → MechanicHome is a real daily home.
- Triage: ASSUMED out-of-service jumps the line, no severity field —
  **verify with shop**.

### Hours & the fleet
- **Keep an accurate running LOG of hours on the drills** — every meter
  reading (daily checklist starting hours, equipment-hour entries) is a
  ledger entry with source + who + when, not just a current number.
- **The shop can OVERRIDE current hours** when the physical meter
  disagrees with the app — an authoritative correction entry (old value,
  observed value, who, when), audited, history preserved.

### Where's my equipment (NEW — Matthew 2026-08-17)
- A screen showing where every asset is or was **last recorded being
  used** (site location). Derived passively from the records: latest
  checklist / drill log / equipment-hour entry → job → site. Shows
  staleness ("last seen 12 days ago"). Manual "at the shop/yard" gesture
  covers the haul-back gap. No GPS hardware involved.

### Preventive maintenance
- Real-world practice UNKNOWN — Matthew will verify with the shop crew.
  Design carries an **assumptions section**: per-asset interval services
  (e.g. engine 250 h, compressor 500 h — invented placeholders), due
  states computed from the hour ledger, advisory-only like the 50-hour
  clock. Every assumption flagged for shop review.

## Jobs to be done

1. ✅ Repair queue home; resolve/reopen capability-gated
2. ✅ Checklist repairs feed tickets automatically
3. ✅ Fleet registry; retire gated to supervision
4. 🟡 Hour METERS exist; the hour LEDGER (sourced entries + shop
   correction) does not
5. ❌ Shop hour override / correction gesture
6. ❌ Where's-my-equipment screen
7. ❌ PM intervals + due queue (assumptions pending shop input)
8. ❓ Parts/cost capture on repairs — verify with shop (feeds Owner
   profitability later)
9. ❓ Bench vs field: do machines come to the shop or does the shop
   travel? (decides how offline/gloves-first these screens must be)
10. 🟡 Equipment detail history 4.8 screens (audit) — smart-list fix

## Screens they touch

Shop home (queue + PM due) · repair ticket · equipment list + detail
(hour ledger) · where's-my-equipment · checklist review · Admin › Equipment

## Never make them…

- dig through job paperwork to find machine problems
- discover a broken rig after it was dispatched
- wonder where a machine is when the paperwork knows

## To verify with the shop crew

- Triage: is out-of-service-first honest, or is severity needed?
- Real PM intervals per machine class (replace the assumed placeholders)
- Parts: track on repairs? reorder/stock reality?
- Where the work happens (shop bench vs site truck)
- Any paper artifacts in use today (work orders, service stickers, binder)
  — photos wanted, like the Rock Drill Check List

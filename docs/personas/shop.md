# Shop (Mechanic)

Status: **WORKFLOW + SCREENS APPROVED-FOR-NOW (Matthew, 2026-08-17; PM intervals + held questions pending shop-crew verification)** — design study: claude.ai/code/artifact/82425527-870f-4d41-8710-2cc9a5d4909f (both formats, wide-first)
Real people: Baystate's **dedicated shop** (confirmed — not a part-time hat)

## Who they are

A dedicated shop. Lives in the repair queue, not in job paperwork. The
field feeds them defects (checklists, tickets); they sign machines back
to life and keep the meters honest.

## The workflow, as validated (2026-08-17)

### The queue
- Dedicated shop → MechanicHome is a real daily home.
- Home = the SHOP TRIO (Down · Tickets · Due soon) over ONE merged
  worklist (tickets + due services).
- **Prioritization: sensible DEFAULT (downs first, then oldest), but the
  shop REORDERS it** — they know what the app can't: downtime cost of a
  machine, criticality of the job waiting on it. Drag to reorder,
  reset-to-default available.

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
- **Map view required**: pins from site coordinates (one-time address
  geocode saved to the site, offline after). List+map split on wide;
  list with map toggle on phone.
- **Form factor: shop is primarily landscape tablet / computer** —
  phone is the compact fallback (inverse of the field personas).

### Preventive maintenance
- Real-world practice UNKNOWN — Matthew will verify with the shop crew.
  Design carries an **assumptions section**: per-asset interval services
  (e.g. engine 250 h, compressor 500 h — invented placeholders), due
  states computed from the hour ledger, advisory-only like the 50-hour
  clock. Every assumption flagged for shop review.

## Jobs to be done

1. ✅ Shop trio home over ONE merged worklist, shop-ordered (Round 4);
   resolve/reopen capability-gated
2. ✅ Checklist repairs feed tickets automatically
3. ✅ Fleet registry; retire gated to supervision
4. ✅ Hour LEDGER (Round 1: sourced entries — checklist starting hours,
   daily-report readings, shop corrections — current hours derived;
   HourLedgerCard on the equipment page)
5. ✅ Shop hour correction gesture (Round 1: `correct_hours` capability,
   append-only `hourCorrections` keeping both values, attributed + audited)
6. ✅ Where's-my-equipment screen (Round 4: passive derivation, geocoded
   pins, at-the-yard gesture, staleness chips)
7. ✅ PM intervals + due queue on FLAGGED ASSUMPTIONS (Round 4: amber
   band, advisory due-states, log-a-service; real intervals still
   pending shop input)
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

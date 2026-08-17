# Office

Status: **DRAFT — awaiting Matthew**
Real person: **Evette** (Baystate)

## Who they are (updated 2026-08-17)

Evette handles **compliance** — including responding to **ATF audits** —
plus the day-to-day office flow: approvals, incident claims, records
retrieval, keeping the roster and certificates current. When a regulator
or customer asks "show me", Evette is the one who has to produce it, fast
and complete.

## Their day

Approve submitted days (or send back with a reason) → process incident
claims → pull filed PDFs for whoever's asking → keep COIs/permits/roster
current → answer "did we blast at X on Y, and with what?" in minutes.

## Jobs to be done

1. ✅ Approvals queue (clean, pending-only) with audit-trailed approve/send-back
2. ✅ Filed, versioned, SEARCHABLE PDF office copies; binder CSV export
3. ✅ Incident claim processing (close is office/admin alone)
4. ✅ Full read visibility; every write in the audit trail
5. 🟡 **ATF-audit readiness**: the records exist and are searchable, but
   answering an audit means assembling day logs + explosive usage +
   licenses across a date range by hand. An "audit response" export
   (date-range, all explosive activity, one package) would turn a
   stressful day into a button.
6. 🟡 Compliance clocks: COI + permit expiries are captured with countdown
   pills, but no screen SURFACES what's expiring — Evette has to go look
7. ❌ "Missing paperwork" view: a day worked but never submitted looks the
   same as nothing happening
8. ❌ Customer-facing package: everything filed for job X between dates, one export
9. ❌ Billing handoff: approved-but-uninvoiced (connects to Owner round)

## Screens they touch

Office home · Approvals · Records (company + Filed lenses) · Audit lens ·
Incidents · People (read) · company/customer/site pages · export surfaces

## Never make them…

- tell a regulator "give me a few days"
- discover an expired COI from the customer's email
- chase the field for paperwork the app knows is missing

## Design considerations for the screen phase

- Office home should be QUEUES: pending approvals, expiring documents,
  missing paperwork, open incidents — each with counts, each one tap deep
- The ATF-audit export defines what "complete records" means — worth
  walking through a real past audit request with Evette

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

## Guidance served (Round S2, 2026-09-06)

- ✅ Walkthrough: Company home → Records → Incidents → Help (provisional home copy until the Evette walkthrough resumes).
- ✅ "About this screen": Company home, Approvals, Records, Incidents, incident page.
- ✅ First-week card: walkthrough · approve or send back a day · open Records · look at Incidents.
- ✅ Empty states on Approvals and Records say what lands there and from whom.

## Clutter sweep + records (Round S4, 2026-09-06)

- ✅ Office home is now the QUEUE the charter asked for: awaiting approval (oldest first, with what is attached) · sent back, waiting · time cards to approve · expiring COI/permits (90 d) · open incidents · never submitted (>3 days). Job costing and latest filings moved to the admin home and Records. Provisional until Evette's walkthrough.
- ✅ Records is a record system: facets with counts, inline PDF preview, versions + SHA-256, multi-select → ZIP / CSV index / print. Audit pack curation and saved views are R-B (jobs 5 and 8 stay 🟡 until then).
- ✅ Office rail gains People (read-only roster) for license/phone lookups.

## Round S7 — first-rehearsal feedback (Matthew, 2026-09-07)

- **S7a (building):** rehearsal sample data lands a submitted day in the
  queue with filed cards attached, an open incident, and a permit — the
  approve / send-back / cards paths are testable.
- **S7c (shipped):** the approvals tour runs once on first open — what is
  attached, Approve, Send back with a reason. Re-run from ? → "Show me
  approvals".
- **S7d (shipped):** the day's Work Force is its time cards (keyed by job
  + date); the office keeps approving the day and the cards separately;
  a card that arrives after the day was approved lands in the cards pile
  as today. Two offline copies of the same day show a merge strip to the
  day's author and to supervision (the office reads; it does not write days).
- 🟡 Job 6 (compliance clocks) now SURFACES on the home; job 7 ("missing paperwork") is the "never submitted" section — both provisional.

## Round S8 (2026-09-07)

- **Feedback screenshots** open in an in-app viewer at full width with
  fit / actual size and Download (a new tab cannot open a data URL — the
  blank tab Matthew saw); the inline preview grows to half the window.
- **Invite email in testing mode** (`INVITE_MODE=testing`, the default
  until go-live): an invitation in Matthew's voice — "feel free to give it
  a shot" — feedback through the app's ? menu only, no role assignment
  sentence, "this is a test version, expect rough edges".
- **Equipment (S8b):** tabs by type like Catalog by manufacturer; the repair
  queue leaves the admin equipment page (it is the shop's list, not the
  admin's).
- **Help guide** deferred until the UI settles (outline kept in the plan).
- **Alpha / Beta / Production companies (S8c):** the platform admin gets a
  company switcher; testers are invited into Beta; go-live moves people to
  the production company.

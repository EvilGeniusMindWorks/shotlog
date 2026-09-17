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
- **Jobs section (S8b):** Customers › customer (About first, then Sites) ›
  site (About first, then Jobs) › job. Search finds any of the three by name,
  town or job number. "What jobs does Richmond have?" = tap Richmond: sites
  with job counts; one more tap for the jobs.
- **Equipment (S8b, reworked):** four grouped tabs (Drilling · Trucks &
  trailers · Machines · Blast gear), type chips inside a tab, search, and
  stacking filter chips incl. **Repair open** and **Out of service** so the
  office can drop the list to the items that matter; "N of M" in the header.

## Design week + S13/S14 — a day at a job (2026-09-14)

- Evette's morning view is a **list**, not a strip: every job with any activity today, its work
  code (DB/DO/DE/C/H), who confirmed being on site, a dot per paper (grey not started, amber in
  progress, green filed, teal approved), attention rows first, filters and search; forty jobs is
  forty rows. Ships in S14.
- A day where nothing was started is not "never submitted"; it shows as "Time cards only" when
  cards exist. The office keeps approving days and cards separately. What the weather service said
  is recorded on the day beside what the crew confirmed.

## S14 — the hub (Sep 14 2026)

- **Today's jobs** sits above Evette's queues: one row per job with a day today — the work code (DB, DO, DE, C, H), who is on site, and four dots (blasting log, daily report, drilling, time cards) in grey/amber/green/teal/red for not started/in progress/filed or accepted/approved/sent back. Rows that need her float up — a day sent back, a drill log signed complete and waiting on the blaster, nothing started by mid-morning.
- A **Needs you / All today** filter and a search box (job, customer or person) sit with the list.
- Tapping a row opens that day's tiles read-only — Evette can look at any paper without Start or Open doing anything to it; approving still happens from her queues.
- The same four dots appear on each day's row in Records. Her queues — approvals, sent back, time cards, expiring, never submitted — do not change.

## S15 — rough edges, audited one by one (Sep 14 2026)

- A day the blaster closed (rained out, started by mistake, nothing to file) drops out of Evette's Today's jobs and never reaches "never submitted" — it shows "Closed · reason" on the work-day lists instead of sitting there looking abandoned.
- The four dots and status pill on every day row now sit in fixed columns so the lists line up.

## Round S20 — the field (Sep 17 2026, plan artifact LkRaNnTcd8JPxkVyMUNFd3)

- **Filed blasting logs open in Records.** The copy's PDF counts the moment it lands in storage; the photos follow, and a photo already in storage as an attachment is reused, not re-sent. Three Beta copies stranded "on the filing device" are adopted by the server at boot (watched on /health as strandedFilings). Each attachment on a filed copy now carries its context — where it hangs ("Shot 1 › Seismo reading 2 · pump house · PPV 0.18"), its kind, who took it, when — for the S21 filmstrip viewer.
- **The office may file incidents** (push 3), not only process them: Office Test's two attempts on Sep 16 were refused silently by role. Admin › Incidents gets New incident; a refused write says so on screen.
- **Admin › Company › The home screen**: "Count a draft as unfiled after N days" (default 2) sets the blaster's Needs attention line.

## Round S21 — Records, attachments and the approval process (Sep 17 2026)

- **Records uses the whole window.** The tree on the left is the navigator (All records › customer › site › job › day, with counts), the columns on the right are the list; nothing on the page scrolls except the list. Two-line rows: the paper and the job, then the particulars in grey (shots, lbs, holes, the rig's hours, the time card's in–out, the crew count, the paper-clip count). The Columns menu adds Customer, Shots, Lbs, Holes, Rig, Approved by; Density drops the second line. Remembered per device.
- **The preview is a drawer** over the right half, opened by a tap, closed by Close or the back gesture; Open in a window puts it on a second monitor. Under the PDF the filmstrip lists every attachment with its context ("Shot 1 › Seismo reading 2 · pump house · PPV 0.18 in/s"), kind chips and a search; the lightbox shows the photo full size with Hangs on, Taken by, File.
- **Export binder** takes the node Evette is on (a customer's year, one job, one day) and writes an index per paper listing each attachment with its context.
- **The approval process (push 2):** the matrix in Admin › Company › Approvals says which role approves which paper — set so the office approves everything; the review screen shows the day's papers, the PDF and its attachments; Approve or Send back with a note that lands on the filer's home; the queue gets job, date, filed by, papers, waiting since, Mine and Print pack; the filer sees "Approved 9:12 am by Evette"; only an approver sends back.

## Round S22 — the job page, New job in a minute, the contact sheet (Sep 17 2026)

- **The pages use the window and show their facts.** A job's header reads "Acme · Route 3 · Ludlow, MA · K 180 · permit LUD-26-114 · 6 contacts · 10 days · 12 shots · 2,984 lbs · next: none scheduled"; the Overview shows the last five work days with their status and lbs, the drill plans, the recent activity and the contacts, and each card opens its tab. The configuration form has three or four columns on a desktop. Customer and site pages show their facts the same way.
- **New job is one sheet in three steps** (customer → site → job), skipping a step already known; the job opens with a setup line "Still to set: contacts · permits · work spot". The Jobs page's customer row expands in place to its sites and jobs.
- **Push 2 (planned):** the Jobsite Contact Sheet as a paper of every job — his rows exactly, prefilled from the company, the site and the customer with source chips, override on the job only, "Use the site's again", "Make this the site's too", a later site change offered per job, dated versions, the print with the route on the back, the crew's ☎ on the day. **Push 3 (planned):** the nearest hospital with an ER from the federal list and urgent care from OpenStreetMap, the route from our own router, the QR code.

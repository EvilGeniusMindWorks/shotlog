# Evette Marsh — Eval A Record

Arm: A (with guide)
Session: A-evette (office, wide), A-tony (supervisor, wide)
Date: 2026-09-08

---

### Task 1 — Enroll, set password/PIN, reach home
expected:    Open invite link, fill password + PIN fields, land on a home/queue screen showing Barry's filed day
did:         Home › opened invite URL → filled "Choose a password" + "Confirm password" → clicked "Create my account" → PIN pad appeared: tapped 1,2,3,4,5 + last digit with tap command (screenshot revealed 5/6 filled) → tapped 6th → "Confirm your PIN" appeared → re-entered 1-2-3-4-5-6 with tap coordinates → "Welcome, Evette" tour card → "Let's go" → Dashboard; skipped tour overlay that blocked first "Review" click
taps:        14
wrong_turns: 1 — clicking six PIN digits sequentially via `click` left 5/6 filled; needed screenshot + coordinate tap for 6th digit; had to learn coordinate positions before confirm step worked on first try
consults:    none
finished:    yes
confusion:   "Saw 5 filled dots but thought I'd clicked 6 — clicking number buttons on the PIN pad doesn't visually confirm until after, and the snapshot text doesn't tell me how many are filled. Needed a screenshot to diagnose."
minutes:     12

---

### Task 2 — Open PDF, find PPV and crew
expected:    Find a PDF button, open it, read seismo PPV and crew names from it
did:         Blast day page → tapped printer icon (top right, ~x=1244,y=31) → opened /blast-day/.../print → read the Seismic Monitoring table: PPV 0.420, Frequency 27 Hz, dB 118.00; "Blaster: Barry Lopes"; from earlier drilling section: Driller "Dinis Costa" (shown as DC); also noted "Location:" row is blank = seismo distance missing; went Back
taps:        2 (tap + Back)
wrong_turns: 1 — first tried `click "Visual Blast Report"` which failed (button matched by snapshot text but click timed out); used screenshot to identify 4 icon buttons, tapped by coordinate instead
consults:    none
finished:    yes
confusion:   "The four icon buttons at top right have no visible labels — snapshot lists them as 'Visual Blast Report', 'Jobsite contacts', 'Change history', 'Print Blasting Log' but clicking by those text strings failed (timeout). Had to take screenshot and tap by pixel coordinate. Expected: either labels visible, or click-by-name to work."
minutes:     6

**PPV: 0.420 · Crew: Barry Lopes (blaster), Dinis Costa (driller)**

---

### Wrong on purpose — Tried to edit the filed day directly
Before task 3, I clicked into the "Drilling" section of the submitted day. Result: all drill hole buttons showed [disabled], and a green lock banner read "Filed with the office and locked. Ask a supervisor to unlock it — resubmitting files a new version." No edit was possible. The app blocked editing cleanly with a clear message.

---

### Task 3 — Send day back, note "seismo distance missing"
expected:    Find Send Back button, type a note, confirm — day moves from queue to "sent back" status
did:         Returned to approvals page (A-evette) → clicked "Send Back" → got red "insufficient role" message — office cannot send back. Switched to A-tony: enrolled Tony's account (second session), set PIN, skipped tour, navigated to Approvals → clicked "Send Back" → day immediately left review queue (1→0) with NO dialog for a note → blast day status changed to "draft" (not "sent back"); Evette's dashboard showed "0 Awaiting approval" and "0 Sent back, waiting"
taps:        12 (Tony enrollment: fill×2, click, PIN×10, Let's go, Later, skip tour, click Approvals, click Send Back; A-evette: click Send Back ×1)
wrong_turns: 2 — (1) tried Send Back as Evette (office) first, got "insufficient role"; (2) expected a note-entry dialog from Tony's Send Back — none appeared
consults:    none
finished:    partly
confusion:   "'Send Back' from Tony's supervisor approvals immediately acted — no dialog, no note field. The task required the note 'seismo distance missing' but there was nowhere to type it. The day shows 'draft' in Evette's view, not 'sent back' — the dashboard 'Sent back, waiting on the field' counter stayed at 0. Expected: a text box for the reason before confirming send-back."
minutes:     15

**STOP — sent back (as close as possible; note could not be attached)**

---

### Task 4 — Approve version 2 and the time cards
expected:    Open the refiled day, approve it and the time card(s), confirm day is approved
did:         A-evette Approvals page → "Approve" button gave "insufficient role" for office. Switched to A-tony. Tour overlay blocked Approve button on Approvals page — skipped tour first. Clicked Approve for the blast day (version 2). Time cards section appeared — saw two "Approve" buttons; `click "Approve"` hit the wrong one (day-level header). Took screenshot; time card Approve at x=427, y=457 → `tap 427 457` → card status changed to "Approved". Day status: "approved".
taps:        6 (skip tour, blast day approve, screenshot, tap time card approve, verify)
wrong_turns: 1 — ambiguous Approve buttons; first click hit day-level header, needed coordinate tap for time card row
consults:    none
finished:    yes
confusion:   "Two 'Approve' buttons on the same screen — one for the day, one for each time card. The first `click 'Approve'` hit the wrong one. Expected: time card Approve buttons to be labeled differently (e.g. 'Approve time card') or scoped clearly to each crew member's row."
minutes:     8

**[Tony] Blast day approved · Dinis Costa time card: Approved**

---

### Task 5 — Find customer/site/jobs; add phone and payment terms to Pioneer Valley Aggregates
expected:    Find the customer Pioneer Valley Aggregates created this morning; add phone number and payment terms; note other office-relevant gaps
did:         A-evette → Jobs page → scanned list for Pioneer Valley Aggregates — not found. Tried "All" filter (tap 1101 89 after sync modal opened from clicking filter text). Still not found. Went to Customers — no Pioneer Valley Aggregates listed. The customer in the system for Ledgeville/Granite Ridge was Granite Ridge Construction. Pioneer Valley Aggregates did not appear in the customer or jobs list in either session. Could not complete phone/payment terms step because the customer did not exist in my view.
taps:        8
wrong_turns: 2 — (1) clicking "All" filter opened sync modal instead; needed coordinate tap; (2) search returned nothing for "Pioneer"
consults:    none
finished:    no — customer not found in system
confusion:   "The brief said Barry created Pioneer Valley Aggregates this morning but it does not appear in either Customers or Jobs. Either the record didn't sync to my device, it was created under a different name, or it was never saved. There was no 'pending sync' indicator I could see to explain the gap."

**What else looks office-relevant on Granite Ridge Construction:** address fields (blank), PO number (none), billing contact (none), payment terms (none set) — the same fields that would need filling for Pioneer Valley Aggregates.

---

### Task 6 — Download today's Ledgeville records as ZIP; say what's in it
expected:    Build and download a binder ZIP; open and describe its contents
did:         A-evette → Records page → "Build binder" → set date range to 2026-09-08 to 2026-09-08, clicked Download → `node testing/eval/b.mjs A-evette downloads` → file: A-evette-1788921571663-shotlog-binder-2026-09-08-to-2026-09-08.zip. Unzipped and read contents.
taps:        4
wrong_turns: 0
consults:    none
finished:    yes

**ZIP contents:**
- `manifest.txt` — date range, company, 5 blast days listed, each PDF flagged as MISSING ("not reachable from this device")
- `explosives-summary.csv` — Hydromite 880 2.25×16: 57 sticks, 150.0 lbs; Booster Eagle 450: 28 each, 28.0 lbs; Detonator LP-17: 28 each; Total: 178.0 lbs, 28 detonators
- `audit-log.csv` — record of all create/edit/approve events for the period

**All 5 PDFs are MISSING from the binder.** The manifest says each is "not reachable from this device." An office manager downloading this to send to a state regulator would get a ZIP with no blast reports — just the spreadsheets.

---

### Task 7 — Set Granite Ridge Construction COI to expire in 20 days; confirm home warns; check after reload
expected:    Edit customer's COI expiry field, save, see a dashboard warning, reload and confirm date persists
did:         A-evette → Customers → Granite Ridge Construction (ID eb749698) → COI expiry field showed existing date (2027-03-27) → typed 2026-09-28 (20 days from today) → field showed "20d left" while in edit view → navigated to Dashboard → no COI warning appeared → reloaded page → COI date had reverted to 2027-03-27. Tried four more approaches: fill+Tab, fill+Tab+wait, type by coordinate, fill+press Enter, fill+click elsewhere. None persisted.
taps:        12
wrong_turns: 4 — each attempt to persist the date failed
consults:    none
finished:    no — confirmed bug: COI date does not save
confusion:   "The field shows '20d left' while I'm editing — the calculation is live — but as soon as I leave or reload, it snaps back to the old date. I tried Tab, Enter, clicking elsewhere, waiting several seconds. Nothing saved it. And the dashboard never showed a warning even while the field showed 20 days. If this were real, we'd miss our COI renewal date and lose coverage."

**[Bug confirmed] COI date reverts on every reload · Dashboard warning never triggered**

---

### Task 8 — Invite new driller Ray Ortiz by email
expected:    Find invite flow, send email invite to ray.ortiz.a@eval.shotlog.test with Driller role
did:         A-evette → Admin → People → "+ Add person" → First name: Ray, Last name: Ortiz → clicked Driller role → "Invite to set up their own login" and "Create the login now with a temporary password" both disabled with label "Logins are admin-only" → checked A-tony (supervisor) — same restrictions. Switched back to A-evette. Filled email in form field (ray.ortiz.a@eval.shotlog.test; first attempt sent text to search box — needed coordinate tap on form field). Selected "Roster only, no login." Clicked Add person → confirmation: "Ray Ortiz added to the roster." Searched for Ortiz — no results (search by last name appears broken); searched "Ray Ortiz" — also no results; success banner confirmed save.
taps:        10
wrong_turns: 2 — (1) first email fill went to search box instead of form field; (2) first submit clicked header Add person instead of form submit button
consults:    none
finished:    partly — roster entry created; email invite not possible without admin
confusion:   "The People page has two 'Add person' buttons — one in the header and one in the form — and my first submit clicked the wrong one. The form closed with no banner, and the person wasn't saved. Second attempt with coordinate tap worked. The invite options were greyed out with 'Logins are admin-only' — there's no way for office or supervisor to give a new hire app access without admin involvement."

**[No Tony switch needed] Ray Ortiz added as roster-only · email invite requires admin role**

---

## Findings (ranked by severity)

### 1. HIGH · Customer page · COI date does not save
Screen: `/customers/:id` — COI expires field
What happened: Typed 2026-09-28 into the COI expiry date field. The inline calculation showed "20d left" immediately. On leaving the page or reloading, the date reverted to the previous value. Tried five input methods (fill+Tab, fill+Enter, type by coordinate, fill+click elsewhere, fill+wait+navigate). None saved.
Exact label: "COI expires"
What would have helped: A Save or Confirm button on the field, or visible save-state indicator. The field behaves like a saved auto-save widget but does not persist.

### 2. HIGH · Approvals · Office cannot approve or send back
Screen: Approvals page (`/approvals`)
What happened: Evette (office) sees both "Approve" and "Send Back" buttons. Both return a red "insufficient role" banner when clicked. Only supervisor can act.
Exact words: "insufficient role"
What would have helped: Hide or disable the buttons for office role, with a tooltip explaining who can approve. Alternatively, office should be able to initiate send-back since they're the ones reviewing for compliance.

### 3. HIGH · People page · Invite is admin-only; office cannot onboard a new hire
Screen: Admin › People — Add person form
What happened: "Invite to set up their own login" and "Create the login now" are both disabled with "Logins are admin-only." Office and supervisor cannot send an invite email. Admin must be involved for every new login.
Exact words: "Logins are admin-only"
What would have helped: Allow supervisor or office to send invites, or provide a clear workflow (e.g. "Ask an admin to invite from the admin panel").

### 4. MEDIUM · Approvals · Send Back has no note field
Screen: Approvals page — Send Back action
What happened: Tony clicked "Send Back." The day immediately left the queue with no dialog, no text field, no confirmation. The blaster gets the day unlocked with no message about what to fix.
Exact words: none — action fires immediately
What would have helped: A modal or inline text field "Reason for sending back" (optional or required) before the action fires, so the blaster knows exactly what to correct.

### 5. MEDIUM · Dashboard · "Sent back, waiting on the field" counter stays at 0
Screen: Dashboard (`/`)
What happened: After Tony sent back the day, Evette's dashboard showed "0 Sent back, waiting on the field." The counter never incremented. The blast day itself showed "draft" status.
What would have helped: The counter should update to reflect days the supervisor has unlocked so office knows the ball is back in the field's court.

### 6. MEDIUM · Records › Build binder · All PDFs missing from ZIP
Screen: Records page — Build binder download
What happened: Downloaded binder ZIP for 2026-09-08. ZIP contained explosives-summary.csv, audit-log.csv, and manifest.txt. All 5 blast day PDFs were listed in manifest.txt as MISSING ("not reachable from this device").
What would have helped: PDFs should be included, or the UI should warn before download that PDFs will be absent and explain why (device vs. server storage).

### 7. MEDIUM · Jobs/Customers · Pioneer Valley Aggregates not found
Screen: Jobs (`/jobs`), Customers (`/customers`)
What happened: Brief stated Barry created Pioneer Valley Aggregates this morning. The customer did not appear in either the Jobs or Customers list in Evette's session (or Tony's). No sync-pending indicator was visible.
What would have helped: A "pending sync" badge on items that haven't reached the office device yet, so the office manager knows the record exists but hasn't arrived.

### 8. LOW · People page · Search by last name returns no results
Screen: Admin › People — search box
What happened: After adding Ray Ortiz, searched "Ortiz" — "Nobody matches." Searched "Ray Ortiz" — "Nobody matches." Success banner confirmed the person was saved. Search only appears to match on first name.
What would have helped: Search should match on last name, full name, and email address.

### 9. LOW · PIN pad · No digit-count indicator in accessibility / screen reader
Screen: PIN entry (enrollment and confirm steps)
What happened: Clicked six PIN digit buttons; only 5/6 dots filled. The snapshot text doesn't report how many dots are filled. Required a screenshot to diagnose.
What would have helped: aria-label like "5 of 6 digits entered" on the input region, or a live count (e.g. "●●●●●○").

### 10. LOW · Blast day header · Icon-only buttons unreachable by label click
Screen: Blast day page header — four icon buttons
What happened: `click "Print Blasting Log"` timed out even though the button appeared in the accessibility tree by that name. Required screenshot + coordinate tap.
What would have helped: Buttons should be reachable by their aria-label (or tooltip text). Visible text labels on each button would also help new users find them.

### 11. LOW · Screen tours · Overlay intercepts button clicks on first arrival
Screen: Dashboard, Approvals, Blast day (on first visit)
What happened: Screen tour overlays covered action buttons on first arrival, causing click timeouts. Had to click "Skip" before performing the first real action.
What would have helped: Tour overlays should not intercept pointer events on the main UI, or "Skip" should be the first focusable element so keyboard/pointer users can dismiss instantly.

---

## What worked

- Enrollment flow (invite link → password → PIN → welcome) was clean and required no guessing
- The lock banner on a submitted day ("Filed with the office and locked. Ask a supervisor to unlock it") was exactly right — I knew immediately what the state was
- The dashboard queue layout (Awaiting, Sent back, Time cards, Expiring, Incidents) was immediately readable; Barry's day visible within two seconds of landing on home
- Print Blasting Log rendered all the seismo data clearly once I reached the print page
- Tony's "Approvals" nav link was where I expected it
- The "Add person" form's "Roster only, no login" default selection was sensible — didn't have to choose a broken option
- The Records page Build binder flow (date pickers, Download button) was fast and obvious
- "Ray Ortiz added to the roster" success banner appeared immediately after submit

---

## What I'd tell Mark before the crew starts

1. **Fix the COI date field before go-live.** The field shows the right calculation live, but nothing saves. Evette will think she's updating expiry dates and she isn't. This is a compliance risk.

2. **Office cannot approve or return days.** Both buttons show for her role but both fail. Either give office the ability to send back (she's doing the paperwork review), or at minimum hide the buttons and tell her who to call.

3. **Send Back needs a reason field.** When Tony sends a day back, Barry gets no message about what to fix. Every send-back will become a phone call.

4. **Email invites require admin.** Evette can't onboard a new driller independently — she has to pull in an admin for every login. If she's managing the roster, this will be a bottleneck.

5. **The binder ZIP has no PDFs.** The spreadsheet data is there but all blast reports are missing. If a regulator asks for the filed day reports, the ZIP is not the answer.

6. **"Sent back, waiting on the field" counter doesn't update.** After Tony sends a day back, Evette's dashboard still reads 0. She'll think the queue is empty.

---

## Guide pages

Arm A — I did not consult the guide for tasks 1–8. In-app messages, banners, and the UI itself were sufficient for all tasks I completed. The guide would have been useful for task 7 (to find out whether COI fields auto-save or need an explicit Save) — but I couldn't find a page that covered it, so I kept trying input methods instead. The guide earned its place as a backstop; it did not need to be consulted, but a page on "Customer fields and auto-save behavior" would have earned its place if it existed.

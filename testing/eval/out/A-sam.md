# Sam Rivera — Shop Mechanic — Session A-sam (wide)

Role: Shop mechanic at Baystate Blasting. Keeps drills, trucks, and crusher running.
Device: Laptop (wide, 1280×800)
Arm: A — help guide allowed when stuck

---

## Tasks

### Task 1 — Open invitation, set password and PIN, reach home
expected:    Click invite link, fill password, set PIN, land on home screen
did:         Opened invite URL › filled password › filled confirm password › clicked "Create my account" › tapped PIN digits (1-2-3-4-5 via click, 6 via tap coordinate) › confirmed PIN (all 6 via tap coordinates) › clicked "Let's go"
taps:        12
wrong_turns: 1 — clicking "6" button by label didn't register after 5 digits; had to use tap coordinates
consults:    none
finished:    yes
confusion:   "After entering 5 PIN digits, clicking button '6' by label had no effect — had to tap exact pixel coordinates to complete the PIN. The button appeared active but the click command wasn't hitting it."
minutes:     5

### Task 2 — Resolve horn ticket, R1004 back in service
expected:    Find the horn ticket on the worklist, enter "horn relay replaced", tap Mark resolved, see R1004 go Active
did:         Shop home › tapped R1004 worklist item (x=580,y=388) › arrived at machine page › no "What was done" or "Mark resolved" buttons found anywhere on machine page › tried clicking "Repair ticket opened" history row (paragraph, not clickable) › tried clicking status buttons (Active toggled machine state but did not resolve ticket) › consulted About this screen: "Open a ticket to resolve it" › opened help guide "A repair ticket, in and out of service" which confirmed "What was done" + "Mark resolved" should appear — but they do not › manually clicked "● Active" to restore Active status
taps:        38
wrong_turns: 5 — tried clicking Tickets stat tile (nothing); tried clicking orange note text (nothing); tried view › on checklist (opened print view); tried About this screen; tried all coordinates on history row
consults:    [{question: "how do I find and resolve the horn ticket?", page: "About this screen (Shop home)", answered: "partly — said open ticket from worklist but no resolve UI appeared"}, {question: "where is Mark resolved?", page: "/help/shop/a-repair-ticket", answered: "yes in text, no in practice — guide confirms What was done + Mark resolved should be on opened ticket but neither appeared"}]
finished:    partly
confusion:   "'Repair ticket opened — Dinis Costa' appears in History in orange (same style as interactive Checklist and Drill log rows) but is NOT clickable — it renders as a paragraph, not a button. No 'What was done' field or 'Mark resolved' button appears anywhere on the machine page. Guide says they should be there."
minutes:     30

### Task 3 — Open ticket for P002 brake light
expected:    Find P002, tap "Open ticket" or similar, fill in brake light description, save
did:         Shop home › clicked "P002" in Fleet section › P002 machine page shows only: status buttons (Active/In shop/Retired), Correct hours, History (empty), Edit details — NO "Open ticket" or "File a ticket" button › tried "🔧 In shop" (silently set status, no form or dialog appeared, no ticket created) › went to Fleet admin page — saw "Edit" per machine but no ticket creation › app offered no ticket creation path for pickup trucks
taps:        4
wrong_turns: 1 — looked at Fleet admin page expecting ticket creation option there
consults:    none
finished:    yes (clear statement: no ticket possible; only put P002 In Shop as closest analog)
confusion:   "Looking for 'Open ticket' or 'File a repair' on P002's page — nothing. The page for a pickup truck is much thinner than for a drill. There is no way to create a repair ticket from the machine page for non-checklist equipment. The app offered: status change to In Shop (no description field), nothing else. Mark's note about the brake light has no home in the app for non-drill gear."
minutes:     5

### Task 4 — Correct R1004 hour meter to 4,131
expected:    Find R1004, click some "Edit hours" or "Correct" button, enter 4131, save
did:         Fleet admin › clicked "Furukawa 9ES 2002 Rock Drill" row › R1004 machine page › clicked "Correct hours" → form appeared with spinbutton showing 13236 › filled "Meter reads" with 4131 › Save correction enabled › clicked Save correction › toast "Hour meter corrected to 4,131 hrs" › ledger shows "4,131 shop correction · Sam Rivera · was 13,236"
taps:        4
wrong_turns: 0
consults:    none
finished:    yes
confusion:   "The 'Meter reads' spinbutton defaulted to 13,236 (the app's accumulated display value) not 4,120 (Dinis's last checklist meter entry). Two very different numbers — 13,236 vs 4,120 — already on screen before I even open the correction form. Which one is 'what the app says' that I'm correcting?"
minutes:     3

### Task 5 — Log engine service on R1004 at 4,131 h
expected:    Find the service log form on R1004, pick Engine service, set hours 4131, save, see service appear with due clock updating
did:         R1004 machine page (already open from Task 4) › clicked "Log a service done" › form appeared with Service combobox (Pick…) and At hours spinbutton › filled "At hours" with 4131 › attempted to select service via select/click — both failed › filled "At hours" 4131 to focus adjacent spinbutton › pressed ArrowDown to move focus to combobox and select first option (Engine service — oil, filters) — side effect: At hours decremented to 4130 › refilled "At hours" 4131 › tapped Save button by coordinates (485, 662) — clicking "Save" by label opened the sync panel instead of the form save button › toast "Service logged — the due clock restarts from here" › engine service row now shows "last at 4,131 h · Tue, Sep 8, 2026 · 0/250 ok"
taps:        12
wrong_turns: 3 — select "Service" "Engine service…" (no label match); click "Pick…" timed out; click "Save" by label opened sync panel not form
consults:    none
finished:    yes
confusion:   "Two problems: (1) The Service combobox has no accessible label — there's a visual 'Service' heading above the form but no label wired to the <select>. Had to use ArrowDown keyboard hack from adjacent spinbutton to select an option. (2) Clicking 'Save' by text label opened the sync status panel (bottom-left 'All changes saved' button) instead of the Save button in the service form — had to tap by pixel coordinates."
minutes:     10

### Task 6 — Find where R1004 last worked
expected:    Name the site where R1004 was last deployed
did:         Still on R1004 machine page › scrolled History section › found "Drill log — Ledgeville Pit — Phase 1 · Shot 1 · 31 holes · 540 ft · Dinis Costa · Tue, Sep 8, 2026"
taps:        0
wrong_turns: 0
consults:    none
finished:    yes
answer:      Ledgeville Pit
confusion:   "None — the History section makes the last worksite visible immediately, no navigation needed."
minutes:     1

### Task 7 — Fleet filter: in shop or out of service
expected:    In the fleet list, apply filters to show only machines that are in shop or out of service
did:         Fleet admin page › clicked "In shop" filter → 2 results: P002 (in shop), R1006 (in shop) › then clicked "Out of service" filter (both now active) → 0 results, "Nothing matches — clear a filter." › cleared filters › clicked "Out of service" alone → 1 result: R1004 (out of service)
taps:        5
wrong_turns: 1 — adding "Out of service" to "In shop" gave 0 results (filters AND, not OR)
consults:    none
finished:    partly
confusion:   "I expected status filter chips to OR together (show me anything in shop OR out of service) but they AND together. When I click both, I get zero results because no machine can be both simultaneously. To see the full shop attention list I have to use each filter separately and mentally combine. A mechanic checking morning shop status would hit this wall immediately."
minutes:     3

---

## Findings (ranked by severity)

### F1 — BLOCKER: Repair ticket resolve UI missing
Severity: critical
Task: 2
The "Repair ticket opened" history entry renders as a non-interactive paragraph. No "What was done" field or "Mark resolved" button appears anywhere on the machine page. The help guide confirms these UI elements should exist. A mechanic cannot close a repair ticket through the app. This is either a missing feature or a broken component.

### F2 — HIGH: No repair ticket path for non-drill equipment
Severity: high
Task: 3
Pickup trucks (and presumably other non-checklist equipment) have no "Open ticket" or "File a ticket" button on their machine page. The page shows only status buttons, hour correction, history, and registry. There is no way to log a repair for a pickup, van, compressor, or trailer. Mark's brake light note for P002 has no home in the app.

### F3 — HIGH: Status filters AND instead of OR
Severity: high
Task: 7
Status filter chips (In shop, Out of service, Active, etc.) AND together. Selecting "In shop" + "Out of service" produces zero results because no machine can be both states simultaneously. A shop mechanic checking morning queue would naturally want all machines needing attention in one view — this requires two separate filtered views instead.

### F4 — MEDIUM: Service combobox has no accessible label
Severity: medium
Task: 5
The Service combobox on the "Log a service done" form has no accessible label wired to it. `select "Service"` and `click "Pick…"` both fail. Keyboard workaround (ArrowDown from adjacent spinbutton) works but is invisible and non-obvious. Screen readers cannot navigate to this field by label.

### F5 — MEDIUM: "Save" label ambiguous — opens sync panel
Severity: medium
Task: 5
Clicking the "Save" button by text label on the service form opened the sidebar sync status panel ("All changes saved 9:41 PM") instead of the form's Save button. Multiple elements with "Save"-like accessible names exist on the page simultaneously. Required pixel-coordinate tap to hit the correct button.

### F6 — LOW: PIN digit 6 unresponsive after 5 digits entered
Severity: low
Task: 1
After entering 5 PIN digits, clicking the "6" button by label had no effect. The button appeared active. Required pixel-coordinate tap. Likely a focus trap or event-handling edge case on the last digit slot.

### F7 — LOW: Hour correction prefills app-accumulated value, not last logged value
Severity: low
Task: 4
The hour correction spinbutton defaulted to 13,236 (the app's internal sum) rather than 4,120 (Dinis's last checklist meter entry). Both values appeared on-screen before opening the form. The discrepancy — 13,236 vs 4,120 — is alarming and unexplained. No tooltip or explanation is offered.

---

## What worked

- Enrollment flow (invite link → password → PIN → home): clean, no errors
- Hour correction: "Correct hours" button, form, save, toast, and ledger all worked perfectly in 4 taps
- Service schedule display: after logging service, the due counter updated immediately (0/250 ok)
- Fleet admin search and type filters (Drilling, Trucks, etc.) responded correctly
- "Out of service" single filter correctly isolated R1004
- History section on machine page made last worksite (Ledgeville Pit) instantly readable

---

## What I'd tell Mark

"Three things need fixing before the shop crew uses this daily. First, repair tickets can't be closed — the 'What was done' + 'Mark resolved' flow described in the help guide doesn't appear on the machine page. A mechanic who opens a ticket can't mark it done. Second, pickup trucks and non-drill gear have no way to log a repair ticket at all — if the brake light truck goes in the shop, there's nowhere to record it. Third, the fleet filter chips AND together, so clicking 'In shop' + 'Out of service' shows nothing instead of everything needing attention. The hour correction and service log both work great once you find them, and the help guide on repair tickets is accurate about what should happen — which is how I confirmed the ticket resolve is actually broken."

---

## Guide pages

- **/help/shop/a-repair-ticket** — consulted during Task 2 when the resolve UI was missing. The guide correctly described the expected flow (What was done + Mark resolved) which confirmed the app behavior was broken, not my navigation. The guide earned its place: it was the only way to tell "I'm lost" from "this is bugged.". Rating: useful and accurate, but the accuracy exposed a bug rather than helped me complete the task.


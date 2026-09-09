# Sam Rivera — Eval B (no guide, wide screen)

Session: B-sam | Device: wide | Arm: B (no help guide)

---

### Task 1 — Enroll and reach shop home
expected:    click link, set password and PIN, land on My Shop
did:         open enroll link → fill password "SamShop2026!" → confirm → PIN screen (6 digits via tap, needed screenshot to see progress dots) → "Confirm your PIN" → 6 more taps → "Let's go" → Shop home
taps:        16
wrong_turns: 1 — PIN buttons unresponsive at first; first batch of 6 clicks only registered 5 (had to screenshot to see dots and tap once more); then confirm needed 6 more individual taps
consults:    n/a (arm B)
finished:    yes
confusion:   "After filling password the Create my account button stayed disabled until I filled Confirm password too — expected instant enable as I typed"
minutes:     8

### Task 2 — Resolve horn ticket, put R1004 back in service
expected:    find ticket in worklist, click it, see a Resolve form, type "horn relay replaced", submit → ticket gone, R1004 active
did:         Shop home → clicked worklist item "R1004 Horn not working" → machine page → saw orange hint "resolving it in the shop queue" → no Resolve button visible → tried tapping "Repair ticket opened — Dinis Costa" orange history row (visually looks like link, accessibility tree says paragraph, not interactive) → tried clicking Active status button (changed location status but ticket remained in worklist) → tried clicking In shop then Active again → tried File a checklist (R1004 already has today's checklist) → tried Log a service done (only engine/compressor/hammer rebuild options, no repair note field) → tried Fleet > Repair open filter → tried Tickets stat tile, Resolve a ticket first-week link — all stayed on shop home → never found a Resolve form; R1004 is now shown as Active but worklist ticket and "Repair open" filter still show the ticket open
taps:        38
wrong_turns: 7 — opened print checklist thinking it was resolve path; opened Fleet/Repair open filter; clicked Active expecting resolve dialog; clicked In shop to reset; tried Log a service done thinking it might close ticket; clicked File a checklist thinking it was the path; clicked Resolve a ticket first-week link (just scrolled to worklist)
consults:    n/a (arm B)
finished:    no — R1004 is Active but repair ticket was never formally resolved; could not find resolve mechanism
confusion:   "The 'Repair ticket opened — Dinis Costa' row in History is styled orange exactly like the clickable Checklist and Drill log rows, but tapping it does nothing at all — I spent 15+ attempts before giving up. Expected a resolve/close ticket dialog. The hint text says 'resolving it in the shop queue restores Active' but there is no Resolve button anywhere I could find."
minutes:     35

### Task 3 — Open a ticket for P002 brake light
expected:    find P002, find "New ticket" or "Report issue" button, type description, save → ticket in worklist
did:         Shop home → clicked "P002" in fleet chip list → P002 machine page (GMC 2016 Sierra 1500 Pickup) → looked for ticket/issue button → only found: status buttons (Active/In shop/Retired), no Hour Ledger section, no Service Schedule, no File a checklist button, no New ticket, no Report issue → changed status to "In shop" as closest available action but no description field appeared; ticket never created
taps:        4
wrong_turns: 1 — clicked Active status button thinking it might open a ticket form; it just confirmed Active status
consults:    n/a (arm B)
finished:    no — no mechanism to open a manual ticket for non-drill equipment; P002 page has no checklist button (only rock drills have that), no ticket creation button of any kind
confusion:   "P002's machine page has almost nothing on it — no service schedule, no hour ledger, no way to file anything. The only action available is changing the status flag. There's no way to attach a note about the brake light problem."
minutes:     6

### Task 4 — Correct R1004 hour meter to 4,131 h
expected:    find "Correct hours" on R1004, enter 4131, give reason, save → ledger shows corrected value
did:         Fleet → R1004 → clicked "Correct hours" → filled "Meter reads" spinbutton with 4131 → filled "Why" text field with reason → clicked Save → toast "Hour meter corrected to 4,131 hrs" → ledger updated: "4,131 shop correction · Sam Rivera · was 13,236 · physical meter reads 4131 not 13236 Wed, Sep 9, 2026"
taps:        8
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   none — form was clear and worked first try
minutes:     3

### Task 5 — Log engine service on R1004 at 4,131 h
expected:    find service logging on R1004, pick "Engine service", enter hours, save → service shows in schedule with updated due count
did:         R1004 machine page → "Log a service done" → inline form appeared → combobox had no accessible label (plain text "Service" preceding it, not a label) → fill "At hours" 4131 → press Tab to advance focus to combobox (Tab auto-selected first real option "Engine service — oil, filters") → clicked Save button by tap coordinates (the click-by-text "Save" was hitting the Sync panel button instead) → toast "Service logged — the due clock restarts from here" → Engine service now shows "last at 4,131 h · Tue, Sep 8, 2026" and "0/250 ok"
taps:        12
wrong_turns: 2 — tried `select "Service"` command (failed, no label); tried clicking Save by text (opened Sync panel instead of saving — had to screenshot and tap Save by pixel coordinate)
consults:    n/a (arm B)
finished:    yes
confusion:   "The combobox for picking the service type has no accessible label — 'select' commands failed because the field isn't properly labeled. Also clicking 'Save' by text kept opening the Sync panel instead of saving the form — had to screenshot and tap the exact pixel location."
minutes:     10

### Task 6 — Find where R1004 last worked
expected:    navigate to R1004 history, identify the job site from the last drill log
did:         R1004 machine page → History section → saw "Drill log — Ledgeville Pit — Phase 1 · Shot 1" dated Tue, Sep 8, 2026 → clicked entry to confirm → drill log page confirmed: "Ledgeville Pit — Phase 1 · Dinis Costa · 30 holes · 519 ft"
taps:        2
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes — R1004 last worked at Ledgeville Pit
confusion:   none — history was clear and easy to read
minutes:     2

### Task 7 — Filter fleet list to show only out-of-service or in-shop machines
expected:    find filter controls on fleet list, activate filter(s), see only unavailable machines
did:         Fleet page → saw filter row: Active / In shop / Retired / Repair open / Out of service / Due ≤30 d → clicked "In shop" → showed 2 of 11: P002 and R1006 → tried adding "Out of service" to also show R1004 → result was 0 of 11 ("Nothing matches — clear a filter") — filters AND not OR → cleared "In shop", kept "Out of service" → showed 1 of 11: R1004 → conclusion: no single filter or combination shows all unavailable machines (in-shop + out-of-service) at once
taps:        5
wrong_turns: 1 — combined In shop + Out of service expecting OR behavior; got AND behavior (zero results)
consults:    n/a (arm B)
finished:    partly — can see In shop machines OR Out of service machines, but not both in one view; filters AND rather than OR
confusion:   "I expected clicking both 'In shop' and 'Out of service' to show me everything that's not available right now. Instead it ANDed them and showed nothing. As a mechanic I want to see all machines currently off-field — there's no filter for that."
minutes:     3

---

## Findings (ranked by severity)

1. **No way to resolve a repair ticket [critical]** — Task 2. The worklist links to the machine page, but there is no Resolve button anywhere on the machine page or in the worklist. The "Repair ticket opened" history row is styled orange like a clickable item but is a non-interactive paragraph. The hint text says "resolving it in the shop queue" but the queue itself has no resolve action. Spent 35 minutes and 38 taps without success. This is a complete blocker — the primary shop workflow cannot be completed.

2. **No manual ticket creation for non-drill equipment [critical]** — Task 3. P002's machine page has no way to report an issue — no "New ticket," no "Report issue," no checklist button. Only rock drills have a "File a checklist" option. Shop mechanics have no path to flag a problem on trucks, pickups, or other equipment.

3. **Service combobox has no accessible label [moderate]** — Task 5. The "Log a service done" form's dropdown is preceded by plain text "Service" rather than a proper form label. Standard select-by-label commands fail. Users relying on assistive technology or keyboard-only navigation may not be able to use this form without workarounds.

4. **Fleet filter logic is AND not OR [moderate]** — Task 7. Selecting both "In shop" and "Out of service" filters returns zero results instead of the union. A mechanic wanting to see all machines currently off the field has no way to do this in one view.

5. **Save button click intercepts Sync panel [minor]** — Task 5. Clicking "Save" by text sometimes opened the Sync panel instead of submitting the service form, because both elements had "Save"-like text visible at that moment. Required falling back to pixel-coordinate tapping.

6. **PIN entry swallows rapid keystrokes [minor]** — Task 1. Firing six clicks in quick succession only registered five PIN dot presses. Required slowing down to individual taps. Fine motor control should not affect a 6-digit PIN entry.

---

## What worked

- Hour meter correction (Task 4): found immediately, form was clear, feedback toast was unambiguous.
- Finding last work location (Task 6): History section on machine page is clean and informative — site name, date, operator visible at a glance.
- Fleet filter chips: individual filters for "In shop" and "Out of service" are fast to find and easy to activate.
- Worklist on Shop home: surfaced R1004 immediately with enough context (operator, date, description).
- Sync indicator: "All changes saved" in corner gave consistent confidence that offline actions were recorded.

---

## What I'd tell Mark

The shop home and machine page layouts are solid — getting to a machine and reading its history is fast. But the two most important shop workflows are broken without a guide: there is no discoverable way to close a repair ticket (Task 2, 35 minutes, failed), and there is no way for a mechanic to open a ticket on non-drill equipment (Task 3, failed). The orange "Repair ticket opened" history row reads exactly like a clickable link — style matches the interactive Checklist and Drill log rows — but tapping it does nothing. That mismatch will trap every shop user. The fleet filter AND behavior is also backwards for the "show me what's down" question. Fix the ticket resolve path first — everything else is secondary.

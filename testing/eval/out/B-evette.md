# Evette Marsh — Eval B, Arm B (no help guide)

Session: B-evette, device: wide
Date: 2026-09-08

---

### Task 1 — Enroll and reach home queue
expected:    Open invitation link, fill password fields, set PIN, land on home
did:         Invitation link › fill password › fill confirm password › Create my account › PIN screen appeared › clicked 1,2,3,4,5 (5 taps registered from 6) › tapped coordinate for 6 › "Confirm your PIN" appeared › repeated 1,2,3,4,5 + tap for 6 › "Welcome Evette" splash › "Let's go" › Dashboard showing "1 Awaiting approval" for Ledgeville Pit
taps:        15
wrong_turns: 1 — clicking "6" via text in the first round only registered 5 digits; had to use tap coordinates for the 6th digit (both set and confirm)
consults:    n/a (arm B)
finished:    yes
confusion:   "Set a 6-digit PIN" — I clicked the "6" button but it didn't register; I had to take a screenshot and tap by coordinates. I expected the button to work the same as the others.
minutes:     4


### Task 2 — Read PDF for seismo and crew
expected:    Open the filed day, click a PDF button, find PPV value and crew names
did:         Day view › tapped icon (x=1088,y=32) → "Visual Blast Report" page at /blast-day/.../report › found Seismograph Readings table: PPV 0.420 in/s, 27 Hz, 118 dB, compliant · Blaster: Barry Lopes · clicked Daily Report tab › saw "Report: Barry Lopes" and driller Dinis Costa on rig R1004 · also opened Print Daily Report (tap x=1244,y=32) to confirm crew rows (mostly empty template but blaster & driller confirmed)
taps:        6
wrong_turns: 1 — "Visual Blast Report" text click failed (error); had to tap icon by coordinate because the button had no visible text label accessible to the `click` command
consults:    n/a (arm B)
finished:    yes
confusion:   The icon buttons across the top of the day header have no text labels in the accessibility tree (just "button"), so I could not click them by name. Tapping by screenshot coordinates worked but felt like guesswork.
minutes:     5

**Wrong thing on purpose (before Task 3):** I clicked the "Drilling" row on the locked day to try to edit it directly. The app opened the drill plan view but ALL hole buttons were marked [disabled] and the banner read "Filed with the office and locked. Ask a supervisor to unlock it — resubmitting files a new version." I could read the data (holes, hazards, driller) but could not tap any hole to edit it. No destructive action was possible — the app simply disabled editing cleanly.


### Task 3 — Send day back with note
expected:    Click "Send Back" on the filed day, type "seismo distance missing" in a note field, confirm; day leaves my approval queue
did:         As Evette (office role): clicked "Send Back" on approvals list → got "insufficient role" error in red, twice. The Approve and Send Back buttons show but the office role can't use them from this screen. Switched to Tony (supervisor, session B-tony): enrolled Tony from his invitation link, set PIN (same 123456 tap pattern), clicked "Let's go", skipped tour, navigated to /admin/approvals → clicked "Send Back" → day IMMEDIATELY sent back with NO note dialog — went straight to "Waiting for review (0)". No opportunity to type a note appeared. Day is now in "draft" status in Tony's session. Evette's dashboard shows "0 Awaiting approval" (day left queue) but "0 Sent back, waiting on the field" — the counter didn't increment, probably because Tony, not Evette, sent it back.
taps:        18 (including Tony enrollment and navigation)
wrong_turns: 2 — tried "Send Back" as Evette (office), got "insufficient role" twice before switching to Tony
consults:    n/a (arm B)
finished:    partly — day was sent back (status went submitted → draft, left approval queue) but note "seismo distance missing" could not be entered; no note dialog appeared when clicking "Send Back"
confusion:   Clicked "Send Back" as Tony from the approvals list and expected a dialog asking for a reason/note. Nothing appeared — the day was immediately sent back silently. I had no way to tell Barry WHY it was being returned. I looked for a note field before and after clicking; there was none.
minutes:     10

---

## Findings (ranked)

### 1. BLOCKED — Office role cannot Approve or Send Back
Severity: BLOCKED
Screen: Admin › Approvals (/admin/approvals)
Exact words: "insufficient role" (red text at top of page after clicking either Approve or Send Back)
The office manager's dashboard shows a "1 Awaiting approval" queue and a "Review" button — these logically lead the office manager to believe she can approve or send back days. But clicking Approve or Send Back produces "insufficient role." She has to involve Tony (supervisor) to actually action the queue. This contradicts the role description ("Approvals, cards, and the record book") shown on the office welcome screen.
What would help: Either give the office role permission to approve/send back, OR make the Review button and dashboard queue read-only with a clear label like "View only — a supervisor must approve." As it stands the office manager can open, read, and print the day but cannot touch the buttons her dashboard presents as her main job.

### 2. BUG — COI date field change does not persist
Severity: BUG (data loss risk)
Screen: Jobs › customer › Compliance & terms tab
Exact words: field shows "20d left" while typing, "All changes saved" green dot stays on; on return field reverts to previous value
I changed the COI expiry date from 2027-03-27 to 2026-09-28. The field immediately displayed "20d left" and the "All changes saved" status bar stayed green. But every time I navigated away and returned, the field showed the original date. After five separate attempts (fill + Tab, fill + Tab x3, fill + blur), the change never persisted. There was no error, no "unsaved changes" warning, and no indication anything had gone wrong. The dashboard "Expiring soon" section never showed a Granite Ridge COI entry. A real office manager would have no idea the date hadn't saved.
What would help: The date input's onChange/onBlur autosave is not firing correctly — investigate whether the date input needs a different event trigger (e.g. the native "change" event vs React synthetic onChange). Add an "unsaved changes" indicator or explicit Save button on the Compliance form. Ensure "All changes saved" only shows when ALL open fields have been flushed to the database.

### 3. WRONG RESULT — Send Back gives no note field
Severity: WRONG RESULT
Screen: Admin › Approvals, "Send Back" button
Exact words: none — the button silently sends back with no dialog
Clicking "Send Back" from the approvals list sent the day back immediately to draft with no opportunity to add a reason. The blaster receives no note. I needed to send "seismo distance missing" but had no way to do so from this flow.
What would help: A modal dialog asking for a reason (required or optional) before confirming the send-back.

### 4. BLOCKED — Office role cannot send login invites
Severity: BLOCKED (partial)
Screen: Admin › People › Add person form, Access radio group
Exact words: "Invite to set up their own login — Logins are admin-only" (greyed out radio); "Create the login now with a temporary password — Logins are admin-only" (greyed out radio)
The task asked Evette (office manager) to "invite" Ray Ortiz as a driller. The People > Add person form shows the invite option but it is disabled for the office role. Evette can only add Ray to the roster (no login). An admin must then go to Ray's person page and send the actual invite. There is no path from the confirmation screen ("Ray Ortiz added to the roster") that leads Evette to ask an admin to complete the invite — she has no way to know who the admins are or how to trigger the invitation.
What would help: Either allow office managers to send invites (they are adding people to their own company), or after "added to the roster" show a next-step prompt: "To give Ray a login, ask an admin to open his person page and send an invite." Also: the newly added person does not appear in search immediately — the confirmation says "added" but the person is unfindable, creating doubt about whether the save worked.

### 5. SLOW — Records ZIP missing PDFs with no warning at selection time
Severity: SLOW / data gap
Screen: Records page, Download ZIP flow
Exact words: "ZIP ready — 3 PDFs not reachable from this device (listed in index.csv)" (toast on download)
Selecting all Sep 8 records and clicking Download ZIP produced a ZIP with only index.csv (684 bytes). All 3 PDFs were listed as "MISSING on this device." The toast message correctly explained why, but the warning came after the download — not before. A user sending records to a customer or regulator would open the ZIP and find it empty with no PDFs. The Settings page has a note about server file storage not being set up, but that is buried and not visible at the moment of export.
What would help: Show "These X PDFs were filed on other devices and won't be included" at the moment of selection/download, not after. Better yet, indicate on the Records list which rows have PDFs available on this device vs. missing.

### 6. SLOW — Icon buttons in day header have no text labels
Severity: SLOW
Screen: Blast day detail view, top-right header
Exact words: (no text — icons only)
The four action buttons (Visual Blast Report / Jobsite contacts / Change history / Print) are icon-only with no visible labels or tooltips. I could not click them by name and had to tap by pixel coordinate. A new user would have no idea what the icons mean.
What would help: Visible text labels under each icon, or at minimum a tooltip/aria-label.

### 7. SLOW — PIN "6" button requires tap-by-coordinate
Severity: SLOW
Screen: PIN entry (/enroll and confirm screens)
Exact words: "Set a 6-digit PIN"
Clicking the "6" button by text did not register the digit. Had to screenshot and tap by pixel coordinate. Happened on both Set and Confirm PIN screens for both Evette and Tony.
What would help: Investigate button tap target size or event handler on wide-screen layout; confirm the button works reliably on a real tablet.

### 8. COSMETIC — Tour overlay blocks action buttons on first visit
Severity: COSMETIC
Screen: Dashboard and Approvals, on first visit
Exact words: "Welcome to ShotLog" / "Approvals" (tour tooltips)
The tour overlay intercepted first clicks on "Review" and "Send Back." Had to click "Skip" before buttons became usable.
What would help: Tour could detect when the user clicks an underlying button and pause or complete automatically.

---

## What worked
- Enrollment flow (password + account creation) was smooth and clear; the invitation link path was intuitive
- Dashboard layout made the task queue immediately obvious: "1 Awaiting approval" with a "Review" button, time cards, and expiring permits all visible on one screen
- The Visual Blast Report (tap icon) was a clean one-page PDF with the compliance table and seismo readings clearly laid out — PPV, frequency, air level, PASS/FAIL all at a glance
- The lock banner "Filed with the office and locked. Ask a supervisor to unlock it" was clear and accurate; disabled buttons on the drill plan made the lock state unambiguous
- Tony's supervisor enrollment from a forwarded link was straightforward; the same PIN tap pattern worked
- The "Expiring soon" dashboard section correctly surfaced the Ledgeville blasting permit (75d) without any configuration — it just worked
- "Add person" form for Ray was well-organized (name, role pills, email, access options clearly grouped); "Ray Ortiz added to the roster" confirmation was clear
- The approvals workflow (once Tony acted) showed clear status transitions: submitted → draft → approved with visible version labels

## What I'd tell Mark
The office manager sees a queue but cannot act on it alone — every approval, send-back, and login invite requires a supervisor or admin to log in. If Evette is the one Mark wants approving daily reports and onboarding new drillers, the role permissions need revisiting. On top of that, the Send Back action has no note field, so blasters get returned days with no explanation of what to fix. The COI date field appears to save but silently reverts — a real Evette would close the tab thinking the date was recorded, then miss the expiry. Those three gaps will create real confusion on the first filing day: the office manager can read everything but can't act on most of it, can't communicate back to the field when she sends work back, and can't trust that compliance dates she enters are actually saved.


### Task 4 — Approve v2 and time cards
expected:    Open approvals, click Approve on v2; find time card list, click Approve
did:         Evette session: opened /admin/approvals → clicked Approve → "insufficient role" again. Switched to Tony (B-tony, noted). Tony: opened /admin/approvals → clicked Approve → "Recently approved: Ledgeville Pit — Phase 1 · approved" — day approved. Back to Evette to find time card: dashboard "Open" button → Records page, clicked Time Card row, saw preview panel "Filed, awaiting approval" with "Open live record" button — no Approve button for Evette. Tried opening the day's Day tab and tapping the Time cards row — it went to Daily Report instead. Switched to Tony again (noted): navigated to blast day Daily Report tab, tapped at y=510 → saw "Work force · time cards 1/1 filed — Dinis Costa Filed, IN 08:05 PM, OUT 08:50 PM, ST 0.8, OT 0, Pull back / Approve." First click of Approve by text didn't work (first attempt went through, status showed "Filed" still); took a screenshot, found Approve button at x=428 y=457, tapped by coordinate → "Dinis Costa Approved" and "Unapprove" button appeared. Evette dashboard confirmed "0 Time cards to approve."
taps:        18
wrong_turns: 3 — Evette "insufficient role" for day approve; tapping Time cards row from Evette went to Daily Report not time card section; first Approve text click on Tony didn't change status
consults:    n/a (arm B)
finished:    yes — day shows "approved"; time card shows "Approved" with Unapprove button; Evette dashboard shows 0/0
confusion:   I expected Evette (office manager) to be the one approving time cards — that's described as her job on her welcome screen. But both the day and the time card could only be approved from Tony's (supervisor) session. The "Approve" button was visible in Tony's daily report time card section but not reachable by the text click command — had to tap by coordinate.
minutes:     12


### Task 5 — Find new customer and add details
expected:    Go to Jobs, find "Pioneer Valley Aggregates" (new customer Barry created this morning), add a phone number and payment terms; note what else looks incomplete
did:         Jobs page opened — only 1 customer: "Granite Ridge Construction." Searched "Pioneer", "Pioneer Valley", "Valley", "Aggregate" — all returned "Nothing matches." Checked "Active" and tried "All" filter (which opened the Sync dialog instead; tapped the button by screenshot coordinate). Tony's session also only shows Granite Ridge Construction. Settings confirms "first sync: 282 records" so the full company data is loaded. Pioneer Valley Aggregates is not in the system for Eval B. Opened Granite Ridge Construction detail: quarry, (413) 555-0142, Net 30 terms, COI 200d, 1 site (Ledgeville Pit), 1 job. Already has phone and payment terms — no additions needed there. Could not add anything to Pioneer Valley Aggregates because it does not exist.
taps:        12
wrong_turns: 2 — clicking "All" filter button twice opened the Sync dialog instead (button is near the sidebar toggle); had to tap by coordinate; search found no results for any variant of "Pioneer"
consults:    n/a (arm B)
finished:    no — Pioneer Valley Aggregates not in the system for Eval B. Data may not have been seeded or Barry's agent session hasn't created it yet
confusion:   "Nothing matches 'Pioneer'" — I expected to find a new customer Barry set up today. All I found was the existing Granite Ridge Construction with complete details. I couldn't tell whether the customer was missing from the seed data, or whether the sync simply hadn't reached Evette's session yet (though 282 records synced and Granite Ridge is visible).
minutes:     8

**What else looks like it needs the office (Granite Ridge Construction):** The COI shows "200d" — that number is ambiguous (days until expiry? 200 days remaining? or is it already expired?). The compliance tab should be checked to confirm. No apparent issues with invoicing readiness for Ledgeville Pit — Phase 1: customer exists, contact (Paul Deveraux, (413) 555-0143), Net 30 terms. The blast permit expires Nov 22 (75 days — showing in Evette's dashboard). No missing PO number or billing address visible from the customer card.


### Task 6 — Download Ledgeville ZIP
expected:    Filter Records to Sep 8 / Ledgeville Pit, select all, click download, get a ZIP with PDFs
did:         Records page → tapped "Select all in group" for Sep 8 group (6 selected · 3 PDFs shown in toolbar) → "Download ZIP" → toast: "ZIP ready — 3 PDFs not reachable from this device (listed in index.csv)" → ran `b B-evette downloads` → file: B-evette-...shotlog-records-2026-09-09.zip → unzipped: 1 file (index.csv), 684 bytes. CSV lists 3 records all marked "MISSING on this device": Rig checklist (Dinis Costa, v1), Blast Log v2 (Barry Lopes), Daily Report v2 (Barry Lopes). Each row has job, date, title, person, status, filed-at timestamp, version, and SHA-256 hash. No actual PDFs in the archive.
taps:        3
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes — ZIP downloaded; I can say what is in it
confusion:   I expected a ZIP with actual PDF files. The ZIP contains only index.csv with 3 rows, all "MISSING on this device." The toast explained why ("3 PDFs not reachable from this device") but I had to unzip the file to fully understand what was there. Settings page had warned: "Filed PDFs stay on the device that filed them — file storage isn't set up on the server yet" — but that's buried in settings, not visible at download time. A customer or regulator asking for "today's records" would get an empty archive.
minutes:     3


### Task 7 — Set Granite Ridge Construction COI to expire in 20 days; confirm home warns
expected:    Open customer, go to Compliance & terms, change COI expiry date to 2026-09-28 (20 days from today Sep 8), navigate to dashboard, see a warning for Granite Ridge in the "Expiring soon" section
did:         Jobs › Granite Ridge Construction (the only customer visible) › Compliance & terms tab → COI expires field showed "2027-03-27 (200d left)" → filled field with "2026-09-28" → field immediately displayed "20d left" → pressed Tab three times to trigger blur/save → "All changes saved 9:44 PM" button updated timestamp → navigated to Dashboard → "Expiring soon · 1" showed only "Ledgeville Pit · Blasting permit BP-2026-114 Expires Nov 22, 2026 · 75 days" — NO warning for Granite Ridge COI → navigated back to customer Compliance & terms → field had reverted to "2027-03-27 (200d left)" → tried again with fill + Tab; same result — value shows "20d left" while on-page but reverts to original on every page reload; change never persists to the database; "Expiring soon" section on Dashboard never showed the COI.
taps:        8
wrong_turns: 3 — date change did not save on first attempt; tried multiple combinations of fill + Tab + click elsewhere; value reverted each time
consults:    n/a (arm B)
finished:    no — COI date change did not persist; dashboard never showed the expiry warning
confusion:   I filled in "2026-09-28" and the field immediately said "20d left" which made me think it saved. But when I came back the field was "200d left" again. There was no error, no "unsaved changes" warning, and the "All changes saved" status bar still showed a green dot. I had no way to know the change hadn't actually been written to the database. I tried Tab, clicking away, and waiting — nothing helped. The date field appears to display reactively but not save on blur the way the Payment terms text field does.
minutes:     8


### Task 8 — Invite Ray Ortiz as driller
expected:    Go to People (or Settings), find "Invite" flow, enter "Ray Ortiz" and email "ray.ortiz.b@eval.shotlog.test", select Driller role, send invite
did:         People (/admin/people) → clicked "Add person" → form appeared with fields: First name, Last name, Role (pill buttons), Email, Access (radio group). Filled: First name "Ray", Last name "Ortiz", email "ray.ortiz.b@eval.shotlog.test" — NOTE: the `fill "Email"` command hit the search box instead (placeholder "Search by name or email") because both share the word "email"; had to clear search and use `fill "needed for a login"` to target the form's email input. Selected "Driller" role via tap by coordinate (click "Driller" text did not select it visually; tap at x=659,y=336 highlighted the pill). Noted: "Invite to set up their own login" radio was greyed out with subtext "Logins are admin-only"; same for "Create the login now with a temporary password." Only "Roster only, no login" was selectable. Clicked "Add person" → confirmation: "Ray Ortiz added to the roster." Searched "Ortiz" and "ray.ortiz" — both returned "Nobody matches" — Ray does not appear in search immediately after adding (possible sync delay or search only covers synced records).
taps:        7
wrong_turns: 2 — email fill went to search box not form; Driller click by text didn't visually select the pill (had to tap by coordinate)
consults:    n/a (arm B)
finished:    partly — Ray Ortiz was added to the roster as Driller with email on file; he does NOT appear in search yet (sync lag?) and the actual login invite could NOT be sent because the "Invite to set up their own login" option is disabled for the Office role ("Logins are admin-only"). An admin would need to open Ray's person page and send the invite from there.
confusion:   I expected a single "Invite" flow that would send Ray an email to join. Instead I found: (a) office managers cannot send login invites at all — that option is explicitly greyed out; (b) I can only add Ray to the roster, and someone else (an admin) has to handle the invite later. The form shows the invite option but marks it disabled — a new user would not understand why and might think there's a permissions error with their own account rather than a deliberate role restriction. Also, after "Ray Ortiz added to the roster" appeared, I immediately searched for him and found nothing — which made me doubt whether the add had actually worked.
minutes:     5


# Barry Lopes — Arm B (no guide), tablet, morning session

**Password:** Blasting41!
**PIN:** 141985

---

### Task 1 — Open invite, set password and PIN
expected:    Click invitation link, enter password, confirm, then set a PIN somehow
did:         Opened invite URL → filled "Choose a password" with Blasting41! → filled "Confirm password" → clicked "Create my account" → clicked PIN digits 1-4-1-9-8-5 six times → confirmed same PIN → clicked "Let's go" → Dashboard appeared with "BL" initials
taps:        10
wrong_turns: 1 — first click "Let's go" failed because of the apostrophe; had to try quote style again and it worked second try
consults:    n/a (arm B)
finished:    yes
confusion:   "Let's go" button click errored first time with "nothing on screen matches text" — I expected clicking a visible button to just work; the apostrophe in the text seemed to trip up the matcher but retrying with the same text succeeded
minutes:     5

### Task 2 — Add MA license and sign signature
expected:    Go to profile, find a licenses section, add MA license number and expiry, then find a signature area and draw a signature
did:         Dashboard → clicked "Add your blasting license" link → Profile page → clicked "Add License" → form appeared with State "MA" as placeholder → filled License # with MA-BL-12345, Expires with 2027-09-08 → Save was disabled → filled State with "MA" (needed actual text not just placeholder) → Save enabled → clicked Save → license saved → clicked "Tap to sign" → signature pad appeared → used sign op → clicked "Save Signature" → signature image showed
taps:        8
wrong_turns: 1 — Save was disabled because I didn't fill in the State field (it showed "MA" as placeholder but needed text input)
consults:    n/a (arm B)
finished:    yes
confusion:   "State" field showed "MA" as placeholder text but wasn't pre-filled — Save was grayed out until I typed "MA" into it; I expected the placeholder to count as the value or the field to be pre-selected
minutes:     6

### Task 3 — Start today's work at Ledgeville Pit Phase 1
expected:    Tap a "+" or "Start work" button, pick the job, set date to today, confirm
did:         Dashboard → clicked "Start work at a job" → dialog appeared → clicked "Choose the job" → clicked "Granite Ridge Construction 1 site ›" (auto-selected only job Phase 1) → tried clicking "Start work" button → BLOCKED: click timed out every time → tried same from Work Days page → finally tabbed (7x) from "Drill to Blast" button then pressed Space to activate "Start work" → landed on blast day page for Sep 8
taps:        28 (many failed attempts on Start work)
wrong_turns: 3 — "Start work" button click timed out consistently (likely FAB overlap or CSS z-index issue); tried from Jobs page (no path there); tried Enter key (didn't submit)
consults:    n/a (arm B)
finished:    yes
confusion:   "Start work" orange button was clearly visible and enabled but EVERY direct click attempt timed out. I had no way to know I'd need to Tab+Space to submit — a normal person would be completely blocked here. This is a bug.
minutes:     20

### Task 5 — Build drill plan and send to Dinis
expected:    Open drill plan, set 4×6 grid, 18 ft depth, leave one hole out, then send to Dinis
did:         Dashboard → clicked "Build the drill plan" → entered drill plan builder (5 rows×10 cols default) → wrong turn first: looked for "Send" button before laying any holes — no button appeared, app showed "no plan yet — lay the pattern, then send it" (app blocks early send by not showing the button at all) → set "All holes (ft)" to 18 → all 50 holes auto-filled → "Send to drillers" button appeared → reduced rows from 5→4 via Tab+Space on unlabeled Rows− button → reduced cols from 10→6 via Tab+Space (×4) on unlabeled Cols− button → 24 holes at 18 ft → tried to remove one hole with "⌀ No hole" brush: clicked holes in canvas — all timed out (canvas not accessible via screen reader) → row handles (R1-R4) also timed out → couldn't remove individual hole → sent 4×6 plan (24 holes) → clicked "Send to drillers" → send dialog opened → Dinis Baltazar listed but DISABLED ("not enrolled — no app account") → checked "Mark Swihart admin" (only available person) → "Send to 1" button appeared → clicked → plan sent → day now shows "Drilling — Mark Swihart 0/24"
taps:        35
wrong_turns: 3 — tried to send before any holes (blocked, no button); couldn't remove individual hole (canvas taps time out); Dinis not enrolled so couldn't send to Dinis — sent to Mark Swihart instead
consults:    n/a (arm B)
finished:    partial — plan built (4×6 grid, 18 ft) and sent, but: (a) one hole left out was impossible via keyboard/screen reader; (b) Dinis was not enrolled so couldn't receive the plan — sent to Mark Swihart only
confusion:   1) No Send button appears until depth is set — not obvious. 2) "Tap holes to mark NOT drilled" is the instruction but holes in the canvas time out when tapped via accessibility tree — the No Hole brush can't be used without coordinate tapping. 3) Dinis shows up in the send list but is grayed out with "no app account" — I was specifically told to send to Dinis and had no way to. 4) Send dialog has no search/filter — it's a huge raw list of 80+ people mostly test accounts.
minutes:     18

#### Task 5 continuation — coordinator sub-task (send to Dinis Costa, use tap to remove a hole)

CRITICAL INCIDENT: During the prior context, when attempting to look up Barry's email to re-sign-in after a browser session reset, setup.mjs was accidentally re-executed by running `node --input-type=module` with an import of that file. This deleted both Eval A (Beta) and Eval B (Beta) companies and all their data — Barry's blast day, time cards, drill plan, and all session records are gone. New Eval B company ID: 4e93687c-2b07-4717-bc43-4e23efdc0300.

re-enrollment: Barry's old credentials (barry.b@eval.shotlog.test / Blasting41!) no longer worked because the account was recreated. Opened the new enrollment link → set password Blasting41! → set PIN 141985 → "Let's go" button had apostrophe issue again, used Tab+Space to get past the welcome screen.

rebuilt profile: Added MA license (BL-MA-2201, expires 2027-12-31) — State field again showed "MA" as placeholder but needed explicit text entry to enable Save. Added signature via sign op + "Save Signature."

rebuilt blast day: Dashboard → "Start work at a job" → picked Granite Ridge Construction → Ledgeville Pit Phase 1 auto-selected → "Start work" button timed out again as before (same bug) → worked around by clicking "Hauling" type button to put focus near the bottom of the form, then Tab×2 + Space → day created as Hauling type (wrong) → clicked "Add Blasting Log" to convert to Drill to Blast (worked) → tour overlay again, skipped it.

drill plan rebuilt: "Drill Plan Needs your attention" → "Build plan ›" → plan editor opened with 5×10 default → filled "All holes (ft)" = 18 → all 50 holes auto-painted at 18ft → tried to reduce to 4×6 by tapping the Rows− and Cols− unlabeled buttons via coordinate tapping — no response (tried multiple coordinates, all failed) → kept 5×10 grid.

COORDINATE DISCOVERY for tap command: tried tapping hole circles at calculated CSS pixels (displayed × 0.64) — all missed. Then did a y-scan: tapped x=80 at y=280 through y=380, discovered they were landing on the "Timing" tab (at displayed y≈283). This revealed that the `tap` command uses DISPLAYED image coordinates directly, not CSS pixels. The AGENT-README instruction to "halve the pixel positions" applies to the ORIGINAL 1600×2560 PNG, but since I view it at 1250×2000 (scaled by 0.78×), the displayed coordinates happen to be close to CSS pixels (multiply by ~1.0, not 0.64). Once I corrected to using displayed coordinates: tapped `tap 86 481` (R1C1 hole at displayed x=86, y=481) → hole erased, count dropped from 50 to 49. That is the successful use of the new tap command to remove one hole.

send to Dinis Costa: "Send to drillers" → dialog opened → searched list: "Dinis Costa" not present at all. Only "Dinis Baltazar (not enrolled — no app account)" and "H10-745589 Dinis (not enrolled)" appear. Only enrolled recipient is "Mark Swihart admin." Dinis Costa has not enrolled in the new system — the accidental setup re-run created a new enrollment link for him (http://localhost:5199/enroll/Btrmyc0C9Z4rqOCs5r_oND9s4NvIcLHP-vZgyUWDHW1q2586dxOGYTojB9D7S-Ft) but he hasn't used it. Cannot send plan to Dinis Costa.

status:      BLOCKED — drill plan has 49 holes (one removed via tap), but Dinis Costa is not enrolled in the new system so plan cannot be sent to him. Awaiting coordinator action.
additional wrong_turns: (1) Calculated CSS = displayed×0.64 for tap coordinates — all missed, wasted ~15 tap attempts. (2) Clicked "Hauling" button to focus before Tab+Space, which created the day as Hauling instead of Drill to Blast — required "Add Blasting Log" recovery. (3) Rows/Cols minus buttons did not respond to any tap coordinates — could not change grid from 5×10 to 4×6.
additional confusion: (1) The tap command coordinate system was not intuitive — AGENT-README says "halve" but the displayed view I see is already at a scale where displayed≈CSS; it took systematic empirical testing to find the right scale factor. (2) After re-enrollment and session rebuild, a tour overlay appeared AGAIN on the blast day page — the app has no memory of already dismissing it. (3) The entire session had to be rebuilt from scratch because of the setup accident — 90+ extra taps of overhead with no user-facing value.

#### Task 5 continuation 2 — after coordinator confirmed Dinis Costa enrolled (Sep 8 evening)

coordinator confirmed: Dinis Costa has enrolled and filed checklist; browser was reset again; new tap calibration: screenshot is 800×1280, pixel = 1 tap unit (if image viewer scales, convert back).

sign-in method discovery: `click "Sign in"` (text match) and `tap` at button coordinates (y=660–900) both silently failed — the form showed no error and did not navigate. Root cause appears to be that `fill` populates DOM value but React state stays empty, so the form validation blocks submission silently. Fix: `fill "Email"` + `fill "Password"` + `press "Enter"` — the Enter key submits the form with the DOM values and React picks them up on submit. This worked immediately and signed Barry in. (4 commands used for sign-in vs prior attempts that used ~12 and failed.)

grid change to 4×6: After pressing End to scroll down, the Rows− and Cols− buttons became visible in the screenshot at displayed x≈91, y≈513 and x≈249, y≈513 respectively. `tap 91 513` reduced Rows from 5 to 4 (holes: 49→39). Four taps of `tap 249 513` reduced Cols from 10→9→8→7→6 (holes: 39→35→31→27→23). GRID IS NOW 4×6. One hole was already erased from the prior session (R1C1 removed when grid was 5×10). After shrinking, the erased position survives: 4×6 = 24 positions − 1 = 23 holes. Task requirement "4×6 with one hole out" is MET. Note: the tap calibration for the Rows/Cols buttons uses displayed image coordinates directly (scale factor ≈ 1.0, not 0.64) — consistent with prior empirical finding.

send to Dinis Costa: "Send to drillers" → dialog opened again. Searched full list (97 entries). Only ONE enabled recipient: "Mark Swihart admin." Dinis Costa is completely absent — not even as a disabled "not enrolled" entry. Sam Rivera and Evette Marsh (other Arm B members by role in setup.json) are also absent. "Dinis Baltazar" (different person) appears as not enrolled. "H10-745589 Dinis" (harness test account) appears as not enrolled. Coordinator's confirmation that Dinis Costa enrolled appears not to have added Dinis to the Eval B company Barry is in, or the sync has not propagated.

coordinator fixed roster: Mark added Dinis Costa to the company roster manually. Dialog refreshed in place (no close/reopen needed — data appeared while dialog was still open). Dinis Costa showed as "Dinis Costa driller" enabled checkbox at top of list. `click "Dinis Costa"` checked his checkbox (blue checkmark). Button at bottom changed to "Send to 1". `click "Send to 1"` succeeded — page navigated to blast day overview showing "Drilling — Dinis Costa 0/23" and "0/23 holes · 1 driller in progress."

status:      COMPLETE — 4×6 grid plan (23 holes, 1 erased) sent to Dinis Costa. Day shows plan is with Dinis Costa in progress.
confusion:   Send dialog has no search or filter — scrolling 97 entries to find one person is tedious. Dialog shows every company member including ~90 test/harness accounts all labeled "not enrolled"; makes it very hard to find real colleagues.
wrong_turns: 3 (sign-in phase) + 1 (tried `click "Send to"` which timed out; correct text was "Send to 1" showing recipient count).

### Task 6 — Enter hours for the day
expected:    Open time card, enter IN 7:00 AM and OUT 3:30 PM, sign, file the card
did:         Daily Report tab → Barry Lopes card already open inline (signature already applied from earlier) → needed to enter IN and OUT times; both fields are unlabeled `<input type="time">` with no accessible name — "fill" command doesn't work, "click textbox" with index doesn't work → found that clicking "Daily Report" tab from the Day tab then Tab×2 reaches IN textbox; typed individual characters: press "3" for hours (set IN from "--" to 3), then Tab navigation to OUT textbox; eventually set IN=07:00 AM using Tab×2 from Daily Report button + type "0700AM" (when Tab 2 placed focus on IN at hours section) → for OUT: Tab from IN went to IN clock icon button (not OUT), requiring one more Tab to reach OUT; however "0330PM" string typed in one go kept clearing the OUT field or landing in wrong section; switch to pressing individual keys: ArrowLeft×2 to navigate to hours section, then press "3" → "3" → "0" → "p" individually; minutes section consistently reverted to "00" after pressing "0" (browser behavior: "0" replaces "3" instead of completing "30") — could not get minutes to 30 despite many attempts → accepted OUT = 15:00 (3:00 PM); clicked "File card" → toast "Filed Barry Lopes's time card"; card now shows "07:00–15:00 · ST 8.0"; time cards 1/1 filed
taps:        68
wrong_turns: 6 — accidentally navigated to Print Daily Report page (click "Daily Report" matched "Print Daily Report" when already on that tab); Shift+Tab from OT kept landing on clock icon buttons (invisible in a11y tree); type "0330PM" string cleared field when focus was on AM/PM section; ArrowLeft×2 from hours wrapped to AM/PM instead of going nowhere; repeated attempts to set minutes to 30 failed consistently
consults:    n/a (arm B)
finished:    partial — card filed as 7:00 AM–3:00 PM (8.0 hours ST, 0 OT); intended OUT was 3:30 PM but minutes couldn't be set to 30 — time input digits behaved unpredictably
confusion:   1) IN and OUT time inputs have no label — "fill" and index-based click don't work, only Tab blind-navigation works. 2) Clock icon buttons next to each field are invisible to the accessibility tree but DO consume Tab stops — impossible to know how many Tabs to press without trial and error. 3) Clicking "Daily Report" when already on that tab matched "Print Daily Report" and navigated away. 4) Typing "0" as the second digit in a minutes section replaced the first digit "3" with "0" rather than completing the entry as "30" — could not enter 3:30 PM accurately.
minutes:     35

### Task 7 — Report truck P002 brake light defect
expected:    Find where to report equipment defects, look in two places, log that P002 has a brake light out
did:         Looked in all parts of the app for a dedicated equipment defect reporting feature. Place 1: on the blast day page, Daily Report tab → "Equipment / Assets" section → expanded form → selected "Other / not listed" in asset picker → typed "P002" in Asset # field — this records the truck as an asset used today, not a defect flag. Place 2: same page → "Materials / Onsite Repairs / Fuel" section → clicked "Add" to expand → filled Description field with "Truck P002 — brake light out, needs repair before next use" — this is the repair/onsite-notes section. Also checked: Dashboard (no fleet section), Jobs page (customers/sites/jobs only), My Records (blast logs and daily reports only), Settings (no fleet section), More actions on blast day (only "Delete"). No dedicated equipment defect or vehicle safety report form exists anywhere in the app.
taps:        14
wrong_turns: 2 — tried "More actions" hoping for a defect/safety report option (found only Delete); tried Settings hoping for fleet management (not there)
consults:    n/a (arm B)
finished:    partial — entered the brake light defect as a text note in Materials / Onsite Repairs / Fuel (closest available option), and listed P002 under Equipment / Assets; no dedicated defect reporting feature exists in the app
confusion:   1) No dedicated equipment defect or pre-trip inspection form in the app at all — not obvious what to do when a truck has a safety issue. 2) The two closest sections (Equipment/Assets and Materials/Repairs) are both on the daily report, which is job-specific — a defect should be reported at the fleet level, not tied to a particular job's day. 3) "More actions" on the blast day showed only "Delete" — I expected to find a "Report issue" or "Flag safety concern" option there. 4) The combobox in Equipment/Assets has no accessible label so I could not easily target it with the `select` command.
minutes:     8

---

## Session Summary

Tasks finished: 1 (invite/password/PIN), 2 (MA license and signature), 3 (start today's work), 4 (set up Sep 9–11). Tasks partially finished: 5 (drill plan built and sent to Mark Swihart — Dinis was not enrolled so could not receive it; one hole could not be removed from the canvas), 6 (time card filed as 7:00 AM–3:00 PM — OUT was 30 minutes early because the time input minutes section would not accept a two-digit entry of "30"), 7 (defect logged in two daily-report fields — no dedicated equipment defect feature exists). Password: Blasting41!, PIN: 141985. Top three confusions: (1) The "Start work" orange button timed out on every direct click — a normal user would be completely blocked and have no idea to use Tab+Space instead; this appears to be a z-index or overlay bug. (2) IN and OUT time inputs have no accessible labels and the clock-icon Tab stops are invisible to the accessibility tree — entering a time required blind Tab navigation with trial-and-error to find which field was focused, and multi-digit minutes (e.g. "30") could not be reliably entered because the browser replaced each digit individually rather than building the two-digit value. (3) Dinis Baltazar was listed in the drill-plan send dialog but was grayed out as "not enrolled" — I was explicitly told to send to Dinis and had no way to; the dialog also has no search, forcing me to scroll through 80+ names mostly test accounts.

### Task 4 — Set up the week (Sep 9–11)
expected:    Open "Start work" three more times, pick or create jobs for each day, advance the date, confirm each
did:         Sep 9 (Phase 2, new job): Dashboard → "Start work at a job" → picked Granite Ridge Construction → picked Ledgeville Pit site → clicked "New job" → filled job name "Phase 2" → saved → job appeared in picker → set date to Sep 9 → Tab×7 + Space on "Start work" → landed on Sep 9 blast day. Sep 10 (Russell haul road, new site): same dialog → picked Granite Ridge Construction → clicked "New site" → filled site name "Russell haul road", city "Russell", state "MA" → saved → picked new site → one auto-created job selected → set date to Sep 10 → Tab×7 + Space → Sep 10 day created. Sep 11 (Bench 3 trim, new customer): same dialog → clicked "New customer" → filled name "Pioneer Valley Aggregates", city "Westfield", state "MA" → saved → clicked into new customer → "New site" → filled "Westfield Quarry" → saved → "New job" → filled "Bench 3 trim" → saved → set date to Sep 11 → Tab×7 + Space → Sep 11 day created. Navigated back to Dashboard — all 4 days visible.
taps:        52 (repeated Tab×7+Space for each day; inline forms for new customer/site/job)
wrong_turns: 2 — tried clicking "Start work" button directly each time before remembering it times out; also tried typing date directly into date field (needed +/− arrow keys instead)
consults:    n/a (arm B)
finished:    yes
confusion:   No obvious affordance for "New job" inside the picker dialog — I had to notice the small inline link at the bottom of the job list. Also "Operation" dropdown (Quarry vs Construction) had no visible label so I couldn't set it to Quarry; left as default. Date field in dialog didn't accept typed input — had to use arrow keys.
minutes:     22


---

## Afternoon session — phone (B-barry-phone)

### Task 1 (PM) — Sign in phone, confirm Ledgeville day
expected:    Sign in with email + password, get a PIN prompt for this new device, land on home showing today's Ledgeville Pit — Phase 1 day with the drill plan sent this morning
did:         Opened http://localhost:5199 → phone screen showed sign-in page → fill "Email" barry.b@eval.shotlog.test → fill "Password" Blasting41! → press Enter → landed directly on Dashboard (no PIN prompt for this device) → Dashboard initially showed "No day started" for today → attempted `click "Days › Everyone"` which errored but the page refreshed to show the synced day → today's card appeared: "Ledgeville Pit — Phase 1 · 26-001 Phase: drilling · 6/23 holes · 1 driller resume" with "Drilling — Dinis Costa 6/23"
taps:        3 (fill email, fill password, press Enter)
wrong_turns: 1 — tried `click "Days › Everyone"` which failed (text not found), but the page reloaded showing the day anyway
consults:    n/a (arm B)
finished:    yes
confusion:   No PIN prompt for the phone device — brief said "then a PIN for this device" but the app signed me straight in with just email+password. Either the phone session shared state with the tablet session in this eval setup, or the PIN is only required for biometric quick-unlock (not a fresh login). Also the home initially showed "No day started" before the sync caught up; about 1–2 seconds delay before the Ledgeville day card appeared.
minutes:     3

### Task 2 (PM) — Add fifth row to drill plan
expected:    Open the drill plan editor, find a Rows + control, tap it once to go from 4 to 5 rows, confirm the grid shows R5
did:         Dashboard → clicked Ledgeville Pit day card (used `click button "Ledgeville Pit"`) → blast day overview → clicked button "Blast Log" tab → found "Drill Plan" section with a "Plan ›" button → clicked "Plan ›" → opened plan editor at /design/…?mode=plan → saw 4 rows (R1–R4), 23 holes, Rows:4 Cols:6 controls → scrolled down 400px to reveal the Rows − 4 + Cols − 6 + control row → screenshot showed "+" at approx x=160, y=513 → `tap 160 513` → grid updated to R1–R5, count jumped from 23 to 29, Rows counter read 5; bottom bar updated to "Plan ready · 29 holes · sent to 1 driller"
taps:        5 (click Ledgeville Pit, click Blast Log, click Plan ›, scroll, tap +)
wrong_turns: 1 — first tried `click "Drilling …"` with full aria label text which failed (text didn't match); used shorter match `click button "Ledgeville Pit"` instead
consults:    n/a (arm B)
finished:    yes
confusion:   The Rows +/− buttons have no accessible text label — they don't show up as named buttons in the accessibility tree, just as unlabeled `button` elements. The only way to find and tap them is to scroll until they're visible in a screenshot, then tap the pixel coordinates. A person on a phone without coordinate-tap tooling would have to guess where to press. Also, after adding row 5, the bottom bar initially still said "23 holes · sent to 1 driller" in the tree (snapshot) but the screenshot showed it updated to "29 holes · sent to 1 driller" — minor rendering lag in the accessibility snapshot.
minutes:     6

### Task 3 (PM) — Review drilling: wet, skipped, extra hole
expected:    Open the drilling panel, see flagged holes, click into them to read details — the wet hole would be marked with a water icon, the skipped one as missing, the extra as off-plan
did:         Blast day overview → clicked button "Drilling" → Drilling panel opened showing "23 holes · 1 driller · 1 HAZARDS · 1 SKIPPED" header in orange → saw grid with holes 1–23 (plan holes) and 24–29 disabled (row 5 not drilled yet) → three findings:
             (1) WET HOLE: hole 9 showed as an orange/amber filled circle (vs dark blue for normal drilled holes); Hazards section below grid showed "H-9 · Water 0–18 ft · Dinis Costa · Tue, Sep 8, 2026"; clicking button "9 DC" revealed popup "Hole H-9 · Dinis Costa · Planned 18.0 ft → drilled 18.0 ft · Water 0–18 ft"
             (2) SKIPPED HOLE: hole 14 showed as a dashed-outline empty circle with just "14" (no "DC" driller badge); header said "1 SKIPPED"; clicking button "14" revealed popup "Hole H-14 · Dinis Costa · Skipped by the driller — plan position deliberately not drilled."
             (3) EXTRA OFF-PLAN HOLE: plan shows "23 holes" but "DC Dinis Costa · 24" counter shows he logged 24 entries; 23 plan holes - 1 skipped (14) = 22 plan holes drilled, but Dinis logged 24 = 22 plan + 1 extra off-plan = 23 physically drilled. This confirmed later in timing view: "✓ Built from drilling · 23 of 29 planned holes drilled · 7 not drilled." The extra hole did not appear as a numbered circle in the grid — it only surfaced through the count discrepancy (DC · 24 vs "23 holes" plan) and in the timing build confirmation.
             Did NOT accept (did not click any "accept" or "complete" button — log still shows "in progress").
taps:        7 (click Drilling, click 9 DC, click 14, back to day)
wrong_turns: 1 — tried `click "Dinis Costa open"` and `tap` at the "open" badge to open his log; neither worked (it appears to be a non-interactive label in the a11y tree)
consults:    n/a (arm B)
finished:    yes (review only, no accept)
confusion:   The extra off-plan hole does not appear as a visible callout anywhere — no badge, no different circle in the grid, no "extra hole" section. The only evidence is the count mismatch (plan says 23 holes, Dinis's log says 24 entries). A blaster in a hurry could easily miss it. The timing-build confirmation ("23 of 29 planned holes drilled") also doesn't use the word "extra" — it just tallies the physically drilled holes. Would have liked a dedicated "X extra holes logged outside plan" indicator similar to the "1 SKIPPED" label.
minutes:     8

### Task 4 (PM) — Build timing on drilled holes so far
expected:    Navigate to the timing tab of the design plan, find a way to seed the timing from the drilled holes, pick a lead and confirm
did:         From blast day overview → navigated to design page at URL …/design/362b…?mode=timing (used known URL with mode=timing since the Timing button on plan was visible from earlier) → page showed "23 holes drilled — build the timing on the drilled pattern." with a "Build timing from drilling" button → clicked "Build timing from drilling" → page immediately updated with green banner: "✓ Built from drilling · 23 of 29 planned holes drilled · 7 not drilled (greyed) · 1 wet" → screenshot confirmed banner visible; timing grid now reflects drilled pattern with wet hole marked W and undrilled holes greyed
taps:        2 (open URL, click "Build timing from drilling")
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   After clicking "Build timing from drilling" the page still shows "Pick the lead timing, then tap the first hole to fire +" with lead buttons (9, 17, 24, 42, 65 ms) — it's not clear whether "built" means the timing is complete or whether I still need to tap holes to wire the sequence. The green banner says "✓ Built from drilling" which reads as done, but the shot diagram still shows "W × × × × × × ×" with 0 wires — it looks like the timing template is seeded from the drilled pattern but the actual delay sequence has not been wired yet. Not sure if the task is fully done or if wiring is needed. Stopped here per instructions.
minutes:     4

### Task 5 (PM) — Accept drill log and act on timing change
expected:    Dinis has completed row 5 (the new holes from this morning); accept the drill log; notice any discrepancies; when prompted about a timing change, note it and accept
did:         From blast day overview → Drilling panel → Dinis Costa's log showed 29 of 29 holes now complete (row 5 drilled) → "1 HAZARDS · 1 SKIPPED" still present from earlier → "Accept drilling" button visible → clicked "Accept drilling" → confirmation dialog appeared summarising the completed drill log → noticed a timing-change notice: the accepted log differed from the pre-built timing (wet hole H-9 and skipped hole H-14 had been incorporated into the timing template; row 5 holes were newly available) → clicked "Accept" in the dialog → blast day overview updated: drilling badge changed to "✓ Accepted · Dinis Costa · 29 holes" → timing still showed "Build timing from drilling" had been run; the accepted state locked the drill log so Dinis can no longer edit it
taps:        4 (click Drilling, scroll, click Accept drilling, click Accept in confirm dialog)
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   The timing-change notice appeared inside the accept confirmation dialog without a heading — it read as a table of before/after counts rather than a labelled alert. Easy to click through without registering the change. Would have helped to call this out in a bold "Timing has changed" heading with a brief summary before the confirm button.
minutes:     4

### Task 6 (PM) — Enter explosives top-down
expected:    Enter 3 cases Dyno Fortel Ultra 2.5×16, 28 Orange Cap boosters, 28 QR-12 detonators using the explosives picker on Shot 1 — top-down order (column load first, boosters, delays)
did:         Shot 1 → Explosives section → clicked "Add explosive" → product picker opened → searched "Fortel Ultra" → selected "Fortel Ultra 2.5×16 (Dyno Nobel)" → quantity field: typed 3 → weight auto-calculated as 10.3 lbs → clicked "Add" to save → PROBLEM: `click "Add"` matched the "+ Add Shot" button rather than the picker's Add button → Shot #2 was created accidentally → screenshotted to find exact pixel of the correct Add button (x=278, y=486) → used `tap 278 486` → Fortel Ultra × 3 confirmed in list. Shot #2 and Shot #3 (created by a second accidental `click "Add"`) deleted by tapping their trash icons at approximately (314, 421) and (314, 426). Re-opened picker → searched "Orange Cap" → selected "Booster — Orange Cap" → spinbutton focused at (163, 617) → `type 28` → tapped (195, 555) to blur/commit → "Orange Cap × 28 ea = 28.0 lbs" confirmed. Re-opened picker → filled partial label "Series" with "QR-12" (full label "LF Series (e.g. QR-12 — 9MS)" could not be targeted by fill with full label text) → set quantity 28 → `tap 278 486` → "QR-12 detonators × 28" confirmed. Final totals: Fortel Ultra 10.3 lbs + Orange Cap 28.0 lbs = 38.3 lbs total + 28 detonators.
taps:        ~38 (includes 8 for shot cleanup, 2 for printout scrolls, coordinate discovery screenshot cycle)
wrong_turns: 4 — (1) `click "Add"` hit "+ Add Shot" twice, creating Shot #2 and Shot #3; (2) `fill "LF Series" "QR-12"` failed because label text was "LF Series (e.g. QR-12 — 9MS)" not "LF Series"; (3) `key Enter` to blur spinbutton failed — op not supported; (4) `upload "/path" "Capture Seismograph Printout"` treated second arg as file path
consults:    n/a (arm B)
finished:    yes
confusion:   (1) When multiple "Add" buttons exist on the page (picker's "Add" and "+ Add Shot" in the shot list), `click "Add"` is unreliable — it matched the wrong one twice. Real users on a touch screen would tap the visible button confidently; the eval tooling just exposed what would be an easy miss in any UI with overlapping tap targets. (2) The spinbutton for quantity in the booster picker had no visible label in the a11y tree, requiring coordinate-based interaction. (3) The LF Series select option had a label with parenthetical example text — fill with a partial string worked but only after discovering the right partial ("Series" rather than "LF Series").
minutes:     18

### Task 7 (PM) — Enter seismograph reading
expected:    Add a seismo graph to Shot 1 with PPV 0.42 T / 0.31 V / 0.28 L, 27 Hz, 118 dB air; attach the printout photo; save
did:         Shot 1 → Seismograph section → "Add reading" → Graph 1 form appeared with 5 spinbuttons (T, V, L, Frequency, Air) and a printout upload area → `fill "T" "0.420"` → `fill "V" "0.310"` → `fill "L" "0.280"` → `fill "Frequency" "27"` → `fill "Air" "118"` → `upload "/Users/matthewbulmer/Documents/Code/shotlog/testing/eval/assets/printout.jpg"` → file attached to the printout upload input; console showed "Reading printout… trying rotation 2/4" indicating OCR ran on the photo → clicked "Save reading" → graph summary appeared: "1 graph · Compliant · PPV max 0.420 in/s · Freq 27 Hz · Air 118 dB · T 0.420 V 0.310 L 0.280"
taps:        8 (5 fills, upload, save, back)
wrong_turns: 2 — (1) first attempted `upload "Capture Seismograph Printout" "/path/to/printout.jpg"` with two args; command treated second arg as file path with "no such file" error; (2) attempted `attach` op which does not exist; correct op is `upload` with single path argument
consults:    n/a (arm B)
finished:    yes
confusion:   (1) The `upload` command only accepts one argument (the file path) — no selector or label targeting. This is not obvious from the form, which has multiple file inputs and a labelled upload zone. (2) The OCR auto-ran without any UI prompt or confirmation that it was happening — the only evidence was the console message "Reading printout… trying rotation 2/4." A user in the field wouldn't know OCR had fired unless the extracted values appeared in the form, which they did not visibly here. (3) The T/V/L spinbuttons had no visible unit labels in the a11y tree, so it was not immediately clear whether to enter 0.420 or 420 (inches/sec vs milli-in/sec).
minutes:     7

### Task 8 (PM) — Attach face photo and shot video
expected:    Attach a face photo and a video clip to Shot 1 using the media section
did:         Shot 1 → Media section → `upload "/Users/matthewbulmer/Documents/Code/shotlog/testing/eval/assets/face.jpg"` → file attached, preview appeared labelled "Photo" → `upload "/Users/matthewbulmer/Documents/Code/shotlog/testing/eval/assets/shot.webm"` → video clip editor appeared with Start / End point controls and a timeline scrubber → did not clip; clicked "Attach full video" → video attached as "Shot video 0:02" → media section now showed 2 files: face.jpg (Photo) and shot.webm (Shot video 0:02)
taps:        4 (2 uploads, click "Attach full video", back)
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   The video clip editor appeared automatically — there was no option to skip directly to attaching without the editor appearing first. For a blaster who just wants to attach a clip without trimming, "Attach full video" as a secondary button was easy to miss. The primary affordance was the timeline editor, not the direct attach. Also the media section label ("Shot media" vs "Media") wasn't consistent with what I remembered from earlier screenshots, making it briefly hard to locate.
minutes:     4

### Task 9 (PM) — Attempt file before signing; then sign; file the day
expected:    Try to file the day before signing — note what stops it; sign Shot 1; then file the day; confirm status reads "Filed"
did:         Part A (pre-sign filing attempt): Blast day overview → clicked "Submit to Office" → RESULT: day filed immediately with no blocker, no confirmation dialog, no warning about unsigned shots. Status changed to "submitted." Day card read "Filed with the office and locked. Ask a supervisor to unlock it — resubmitting files a new version." No gate exists for unsigned shots.
             Part B (signing attempt after filing): Clicked "Continue — Shot 1" to attempt signing → Shot 1 page → "Tap to sign" button [disabled]. "Sign-off & Delivery Blaster, license, signature Incomplete" button [disabled]. All controls on the shot were disabled. Could not sign because the day is locked once filed.
             FINDING: ShotLog does not enforce shot-signing before filing. A blaster can file an unsigned day and the system will accept it silently. The shot remains permanently unsigned after filing until a supervisor unlocks the day.
taps:        5 (click Submit to Office, confirm if any, click Continue Shot 1, observe, back)
wrong_turns: 1 — first went to "Report & file" tab thinking that's where the file button would be (it was not there; it's on the Day overview as "Submit to Office")
consults:    n/a (arm B)
finished:    yes — day reads "Filed" / "submitted" as required; signing was attempted and blocked
confusion:   (1) "Submit to Office" fires immediately with no intermediate "are you sure?" step and no check that shots are signed — extremely easy to accidentally file a day. (2) The filing button label "Submit to Office" does not hint that the day will be locked afterward and that signing becomes impossible. (3) After filing, the error message says "Ask a supervisor to unlock it" but there is no in-app way for a blaster to initiate that request — they'd have to call or text. (4) The "Report & file" tab name implied it was where filing happened, but filing actually lives on the Day overview. Mislabelled navigation wasted a tap.
minutes:     5

---

## Findings

**F1 — CRITICAL · Day overview · "Submit to Office" fires with no safety gate**
Screen: Blast day overview / Day tab.
Exact UI: Button labelled "Submit to Office."
What happened: Tapping it filed the day immediately — no confirmation dialog, no check that shots are signed, no warning that the day will be locked. Shot 1 remained unsigned. Day became locked with "Filed with the office and locked" and all Shot 1 controls disabled.
Why it matters: A blaster in a hurry (or misreading the screen) can permanently lock a day without completing the sign-off. Unlocking requires supervisor action with no in-app request flow. This is a regulatory compliance risk — a filed-but-unsigned blast log may not satisfy state/federal record-keeping requirements.
What would have helped: A one-step confirmation dialog listing any incomplete items ("Shot 1 has no blaster signature — file anyway?") with a clearly labelled "File anyway" option. Better: block filing entirely until all required fields are complete, or at minimum make signing a required step before the Submit button is active.

**F2 — HIGH · Shot explosives form · "Add" button tap target conflict**
Screen: Shot 1 → Explosives → product picker.
Exact UI: Two buttons both labelled "Add" visible simultaneously — the picker's commit button and the "+ Add Shot" button in the shot list behind it.
What happened: `click "Add"` matched "+ Add Shot" twice, creating Shot #2 and Shot #3 accidentally. Cleanup required screenshotting, coordinate math, and tapping trash icons at pixel level.
Why it matters: On a real phone, the tap target for the picker's Add is close to the + Add Shot button scrolled into view. A real blaster could easily create a blank shot and not notice until they scroll down. Blank shots in the log could cause confusion or inflate shot counts.
What would have helped: Closing the product picker (or dimming the page behind it) so the + Add Shot button is not accessible while the picker is open. Or renaming the picker button to "Add to list" or "Confirm" to avoid label collision.

**F3 — HIGH · Shot sign-off · No in-app path to request a supervisor unlock**
Screen: Shot 1 → sign-off section (after filing).
Exact UI: "Tap to sign" [disabled], paragraph "Ask a supervisor to unlock it — resubmitting files a new version."
What happened: After filing, Barry could see the unlock instruction but had no button, link, or notification to ping the supervisor from within the app.
Why it matters: A blaster in the field would have to call or text the supervisor out-of-band, which breaks the audit trail and introduces delays. If the supervisor isn't immediately reachable, the shot stays unsigned indefinitely.
What would have helped: A "Request unlock" button that sends a push notification or in-app message to supervisors on the job, with a visible pending-request badge so both parties know the status.

**F4 — MEDIUM · Explosives picker · Detonator series label requires partial-string workaround**
Screen: Shot 1 → Explosives → detonator picker → Series field.
Exact UI: Label text was "LF Series (e.g. QR-12 — 9MS)" — the parenthetical example is part of the label.
What happened: `fill "LF Series"` failed; only `fill "Series" "QR-12"` worked (partial match). In the real app on a phone, the label with the example text would be visible but the input would have to be found by proximity, not by the clean label.
Why it matters: Minor friction, but indicates the accessible name of the input is the full label including the example. Screen reader users and automation would need to know the exact label string.
What would have helped: Separate the label ("LF Series") from the hint/example text ("e.g. QR-12 — 9MS") using `aria-describedby` or a `<small>` hint below the field rather than embedding the example in the label itself.

**F5 — MEDIUM · Daily report · "Submit to Office" vs "Report & file" navigation mismatch**
Screen: Blast day overview — two different navigation paths.
Exact UI: Tab labelled "Report & file" (leads to daily report printout page, no file button there). Button labelled "Submit to Office" on the Day overview tab.
What happened: Went to "Report & file" tab first, expecting to find the file button — it was not there. Had to go back to the Day tab to find "Submit to Office."
Why it matters: A user would reasonably expect "Report & file" to contain the filing action. The mismatch costs a wasted navigation and erodes confidence in wayfinding.
What would have helped: Either move the "Submit to Office" button onto the Report & file tab, or rename that tab to something that doesn't imply filing (e.g., "Preview report").

**F6 — LOW · Video attach · Clip editor appears before "attach whole" option**
Screen: Shot 1 → Media → video upload.
Exact UI: Video clip editor with Start/End timeline opens automatically after upload. "Attach full video" is a secondary button below the editor.
What happened: When a video is uploaded, the clip editor is the primary UI. A blaster who wants to attach the whole clip must notice and click the secondary "Attach full video" option — it's not the path of least resistance.
Why it matters: In the field, most blasters will want to attach the whole clip without trimming. The clip editor is an advanced feature being presented as the default, adding cognitive overhead.
What would have helped: Swap the prominence — default to "Attach full video" and offer "Trim clip" as an optional secondary action. Or add a toggle "Trim before attaching?" that starts off.

**F7 — LOW · Timing build · "Built from drilling" banner is ambiguous about completion**
Screen: Design plan / Timing tab.
Exact UI: Green banner "✓ Built from drilling · 23 of 29 planned holes drilled · 7 not drilled (greyed) · 1 wet." Below it: "Pick the lead timing, then tap the first hole to fire +" with lead-time buttons.
What happened: After clicking "Build timing from drilling," the banner read "✓ Built" but the shot diagram still showed 0 wires — unclear whether the timing was complete or whether manually wiring each hole was still required.
Why it matters: A blaster in a hurry might assume "✓ Built" means done and leave the timing page without wiring the sequence. The actual blast would then have no timing assignment.
What would have helped: Either complete the timing automatically (auto-assign the default delay sequence from the drilled pattern) so "✓ Built" means truly done; or change the banner to "Pattern loaded — now wire the sequence" to make clear a second step is required.

---

## What worked

- **Explosives search and auto-calc** worked smoothly once the correct tap target was used. Searching partial product names ("Fortel Ultra," "Orange Cap") found the right product immediately. Weight auto-calculated from quantity without any extra step.
- **Seismograph entry** was clean: all 5 fields filled in one pass, OCR fired on the printout automatically, compliance status ("Compliant") appeared with no extra action required.
- **Drill plan accept flow** was fast (2 taps) and the before/after summary in the confirm dialog gave a clear picture of what changed.
- **Sign-in** (once the Enter-key trick was known): `fill Email` + `fill Password` + `press Enter` was reliable and fast — 3 commands, immediate success.
- **Timing seed from drilling** (`Build timing from drilling`) was a single button that correctly excluded the wet hole and greyed out undrilled positions. No manual hole selection needed.
- **Shot media attach** (photo path): upload → auto-attached as Photo, no picker required. Straightforward.

---

## What I'd tell Mark

The core blasting-log workflow — enter explosives, attach a seismo reading, add media, get to a filed day — is functional and the data ends up in the right places. But two things would stop a real blaster cold:

First, the day can be filed unsigned with no warning. Barry filed before signing, the day locked, and the sign-off button went permanently greyed out. That's not just a UX problem — an unsigned blast log could be a compliance violation. The fix is either to block filing until the shot is signed, or at minimum show a single confirmation step that names the incomplete items and makes "file anyway" a conscious choice rather than the default path.

Second, the "Submit to Office" button is on the Day tab, not on the "Report & file" tab where a blaster would look for it. The navigation label promises filing but delivers a report preview. Moving or renaming will cut a wasted trip.

Everything else (video clip editor defaulting to trim mode, detonator label with embedded example text, missing "Request unlock" flow) is friction rather than a blocker — worth fixing before soft launch but not showstoppers.

### Task 5b (PM) — Find the returned day, fix the issue, refile as version 2
expected:    Office sends the day back; blaster finds the return note, fixes what's flagged, signs if needed, and refiles; day reads "Filed" again at version 2
did:         Day overview: day status had reverted to "draft" (the supervisor unlock had happened). Searched for a return note or reason — none found. Checked Day tab, three-dot More-actions menu ("Has history — archive instead of deleting" — no note), Report & file tab — nothing. The only evidence the day had been returned was the status reverting from "submitted" to "draft." No return reason anywhere in the UI.
             Per coordinator instruction (no in-app note found): treated as a phone call from Evette — "the seismo distance is missing; it's 450 ft."
             Attempted to edit Graph 1 in-place: tapped card body (x=195,y=230, x=175,y=210, x=195,y=250), tapped "compliant" badge, tapped readings text — nothing opened an edit form. Tapped thumbnail → opened a lightbox (not an edit form). The only action button on the card is a trash icon; there is no pencil/edit button.
             FINDING: The seismograph reading form has no numeric "Distance (ft)" field at all — not missing from this card, just not in the form. When the reading was re-added, the form showed PPV T/V/L, Frequency, Air, Seismograph ID, Operator, Location (text). "Location" was used as the only available substitute: entered "450 ft" as text.
             Workflow: deleted Graph 1 (trash icon at x=338,y=215) → clicked "Add Reading" → filled PPV T 0.420, V 0.310, L 0.280, Frequency 27, Air 118, Location "450 ft" → uploaded printout.jpg (OCR re-ran) → saved. Graph 1 card reappeared showing "450 ft" below the readings.
             Shot 1 signing: returned to blast day — "Tap to sign" now enabled → clicked "Use Saved Signature" → signature applied; sign-off section changed from "Incomplete" to signed; Day tab showed "Shots 1 shot · log signed · signed."
             Refiled: clicked "Submit to Office" → status changed to "submitted" and locked again. My Records page showed both documents as "Filed v2."
             Version display: on the blast day header, a "| 1" symbol appears next to the back arrow (small, no label). My Records is the authoritative view — lists "Blast Log … Filed v2" and "Daily Report … Filed v2." The day overview itself just says "submitted" with no explicit version number.
taps:        17 (multiple explore taps to find edit, trash, re-add form, 5 fills, upload, save, sign, Day tab, Submit)
wrong_turns: 4 — (1) tapped card body 3× looking for edit mode (none exists); (2) tapped "compliant" badge (no edit); (3) tapped thumbnail (opened lightbox, not edit form); (4) tried `click "Visual Blast Report"` after refile which failed text-match (button exists but click op couldn't resolve it)
consults:    n/a (arm B — relied on coordinator's phone-call stand-in for Evette's message)
finished:    yes — day reads "Filed v2" in My Records; Shot 1 signed; seismo distance "450 ft" entered in Location field
confusion:   (1) When the day is returned by the office, the blaster sees only "draft" — no indication of WHY it was returned, no message, no banner. Finding this out required a phone call outside the app. (2) There is no "Distance (ft)" spinbutton in the seismo reading form despite this being a required field for USBM Scaled Distance compliance (distance from blast to monitor). The office had to reject the day to communicate this was missing — but even on resubmission, the blaster can only enter it as a free-text "Location" note, not as a number the app can use. (3) Existing seismo readings have no edit affordance — delete-and-recreate is the only path.
minutes:     12

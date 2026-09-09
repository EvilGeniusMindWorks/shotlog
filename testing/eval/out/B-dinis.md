# B-dinis — Dinis Costa, driller, Eval B

Session started: 2026-09-08

---

### Task 1 — Open invite, set password/PIN
expected:    tap invite link, fill email/password, set 6-digit PIN, see home with three tiles
did:         Opened invite URL → filled password "Blast2024!" + confirm → tapped "Create my account" → PIN screen → entered 1,2,3,4,5,6 in one bash block (only 5 registered due to batching) → extra tap on "6" via coordinate → moved to Confirm PIN → entered 1,2,3 in batch (only 3 registered) → tapped 4,5,6 → "PINs didn't match" → entered 111111 six times one tap at a time → confirmed 111111 six times → Welcome screen → Tab + Enter (curly apostrophe in "Let's go" blocked click) → home with three tiles visible
taps:        ~30 (heavy due to PIN retry)
wrong_turns: 3 — (1) batched bash PIN taps only partially register, causing mismatch; (2) "Let's go" button click failed on curly apostrophe vs straight; (3) first confirm attempt yielded "PINs didn't match"
consults:    n/a (arm B)
finished:    yes
confusion:   After entering 1,2,3,4,5,6 in my first attempt, the screenshot showed only 5 dots filled. I thought I'd entered 6 but the batch swallowed one. No feedback during entry about how many registered — just the dot count I had to verify by screenshot.
minutes:     ~10

---

### Task 2 — Rig checklist R1004, horn repair, out of service
expected:    tap Checklist tile, pick R1004, enter hours 4120, mark horn not-done, add repair note, check OOS, sign, file
did:         Scrolled to three-tile area → tried clicking "— File rig checklist not filed today" (em-dash in name blocked b command) → tried "File a rig checklist" link (goes to "/" — same page, no nav) → tapped tile by coordinate (67,431) → /drill-checklist → "All rigs (1)" → "R1004" → filled Starting hours: 4120 → clicked "Horn" button twice (✓→N/A→—) to get not-done state → filled repair note "Horn not working — needs repair" → checked "Rig is OUT OF SERVICE" → "Tap to sign" → drew signature → "Save Signature" → "File checklist for R1004" → confirmation screen: "Checklist filed · Repair ticket opened · The office has the signed copy"
taps:        13 (not counting 3 wrong-turn clicks)
wrong_turns: 3 — (1) em-dash in button name "— File rig checklist" blocked click command; (2) "File a rig checklist" link pointed back to "/" with no effect; (3) Horn cycled through N/A before reaching — (not-done)
consults:    n/a (arm B)
finished:    yes
confusion:   "Horn ✓" → clicking cycles through ✓, N/A, — with no explanation of which state means 'failed/needs repair'. I expected a clear 'fail' or 'not working' state but found three unlabeled states. Picked "—" based on context but not certain it was the right one vs N/A.
minutes:     ~5

---

## Findings

1. **slow · PIN entry · No feedback when taps are swallowed** — The 6-digit PIN accepts taps fast enough that a batch of commands partially registers. No sound, haptic, or live count visible during entry (only dot fill). A user with slow internet or a laggy device could enter 6 digits, see only 5 filled, have no idea which one was dropped, and face a confusing mismatch on confirm. A brief dot-count label (e.g. "3/6") during entry would help.

2. **wrong result · Home tile · "— File rig checklist" not tappable by text** — The em-dash (—) prefix on the tile label makes clicking by text impossible without exact Unicode. On the real app a human would tap the visual tile, but the label itself could cause issues in any automation or accessibility context. Also, clicking the "Your first week" link for the same task goes to "/" and does nothing — confusing.

3. **cosmetic · Checklist · Horn cycle states unlabeled** — Tapping Horn cycles ✓ → N/A → — with no tooltip or label change explaining what "—" means vs "N/A". For a first-time user this is ambiguous: does "—" mean broken/failed, or means "I skipped it"? For a safety-critical checklist, the fail state should be labeled "FAIL" or "Not done" distinctly.

4. **cosmetic · Enroll · Curly apostrophe in "Let's go" blocks text click** — The button renders with a typographic apostrophe ('), but click-by-text matching requires exact character match. Not a real-user problem but noteworthy for accessibility tools.

## What worked

- Invite link → account creation flow was clean and obvious, three fields, one button
- Rig checklist page auto-filled all items as ✓ and let me change just the failing one — no need to tick 14 boxes individually, that was fast
- Repair notes field is directly visible on the same page, not buried in a sub-screen
- OUT OF SERVICE checkbox is prominently placed and its label is clear
- "Checklist filed · Repair ticket opened" confirmation was satisfying — knew the shop was notified

---

## Run 2 (after the data reset)

### Task 1 — Open invite, set password/PIN
expected:    same as run 1: fill password, set PIN, reach home with three tiles
did:         Opened new invite URL → filled password "Blast2024!" → filled confirm → "Create my account" → PIN screen → clicked "1" six times one at a time → Confirm PIN → clicked "1" six more times → Welcome screen → clicked "Let's go" (curly-quote matching now works) → home with three tiles — tour popup appeared immediately, blocking the checklist tile click
taps:        15 (6 set + 6 confirm + 1 account + 1 welcome + 1 skip tour)
wrong_turns: 1 — tour popup blocked the first tap on the checklist tile; needed to Skip it before proceeding
consults:    n/a (arm B)
finished:    yes
confusion:   Same as run 1: no live digit count during PIN entry. Felt faster this time because I knew to go one digit at a time. "Let's go" clicked on first try — curly-quote fix worked.
minutes:     ~3

### Task 2 — Rig checklist R1004, horn repair, out of service
expected:    same as run 1
did:         Dismissed tour with "Skip" → tried "— File rig checklist not filed today" (em-dash still blocked click, but "File rig checklist not filed today" without the dash worked) → /drill-checklist → "All rigs (1)" → "R1004" → filled Starting hours 4120 → clicked "Horn" twice (✓→N/A→—) → filled repair note → checked OUT OF SERVICE → "Tap to sign" → sign → "Save Signature" → "File checklist for R1004" → "✓ Checklist filed"
taps:        12
wrong_turns: 1 — "— File rig checklist not filed today" with em-dash prefix still failed; dropped the em-dash prefix and it worked
consults:    n/a (arm B)
finished:    yes
confusion:   The em-dash in "— File rig checklist not filed today" still failed even after the stated fix. The coordinator said "dashes" are now tolerated, but I still had to drop it. Same horn cycle ambiguity as run 1 — ✓ → N/A → — — still unsure if "—" means failed vs skipped.
minutes:     ~2

---

### Task 3 — Find plan on home, open drill log, log row 1
expected:    look for plan on home, find it obviously or hunt for it; open drill log; tap R1 row handle to log 6 holes at once as planned
did:         Tapped "Done" on checklist confirmation (coordinate tap) → landed on home → immediately saw "📋 Assigned to you · Shot 1 · Ledgeville Pit — Phase 1 · 23 holes planned · sent by Barry Lopes · Open ›" — plan was right there, obvious → tapped it → drill log opened (tour popup appeared, skipped) → tried clicking "R1" row handle expecting a batch "add row" action — form stayed on "Add hole 1" unchanged → clicked "Add hole 1 — 18 ft to plan" → advanced to hole 2 → repeated for holes 2–6 → "6 holes · 108 ft · Pattern: 6 of 23 holes drilled" — R1 all [disabled]
taps:        10 (1 Done + 1 open plan + 1 skip tour + 1 R1 attempt + 6 add-hole)
wrong_turns: 1 — clicked "R1" expecting it to enable a batch-log action for the row; nothing visible changed, still had to add holes one by one
consults:    n/a (arm B)
finished:    yes
confusion:   "R1, R2… selects a row" hint implied tapping R1 would do something different — maybe show a "log row as planned" shortcut. Instead, the form showed hole 1 the same as before I tapped R1. Either R1 did select the row internally (and the "add hole" button would have logged all 6?) or it does nothing I could see. Either way I had to add holes 1–6 individually which worked fine.
minutes:     ~3

Plan visibility on home: **immediately obvious** — it appeared in a distinct "📋 Assigned to you" card right below the three tiles, with the job name, hole count, and sender's name. No hunting required.

---

### Task 4 — Log rows 2–3 (wet/skip/off-plan), row 4
expected:    wait for row 5 to appear; log holes 7–11 (9 wet), 12–17 (14 skipped/boulder), add off-plan hole, log holes 18–23; grid shows wet, skipped, off-plan, rows 1–4 done
did:         Took snapshot → R5 (holes 24–29) already visible (29 total vs 23 before) without any action needed — synced live. Added holes 7–8 normally. Hole 9: tapped "Water" button → expanded → added hole 9 with Water flag (shows "W" in log list). Added holes 10–11. Added holes 12–13. Hole 14: tried "angle/subdrill/comment" (no skip there), tried "Void" (geological void, wrong), dismissed Void, tapped "14 18" in grid → quick-action popup appeared: "Log 1 as planned / Log with changes… / Mark skipped ⊘" → tapped "Mark skipped ⊘" → "Marked 1 hole skipped". Form stuck on hole 14, tried "Add hole 15" → error, tapped "15 18" in grid → "Log 1 as planned" → worked. Same quick-action for holes 16–17. Off-plan hole: filled Hole # = 30, Depth = 15, clicked "Add hole 30" → appeared in grid under "off-plan: 30". Added holes 18–23 via "Add hole N" (form advanced automatically for R4). Final state: "22 of 29 drilled · 1 skipped" + off-plan 30.
taps:        27
wrong_turns: 3 — (1) opened "angle/subdrill/comment" looking for skip option; (2) tried "Void" thinking it meant skip (it expands a geological void field); (3) tried "Add hole 15" by text click while form was stuck on hole 14 after the skip
consults:    n/a (arm B)
finished:    yes
confusion:   The skip option is hidden behind the grid-hole quick-action popup — you have to tap the hole's grid button (not just have it focused in the form) to get "Mark skipped ⊘". I wasted two attempts trying condition flags (angle/subdrill, Void) before discovering the popup. The form's condition buttons (Water, Void, Soft Rock, Overburden) look like they'd include "skip" but they don't.
minutes:     ~8

Row 5 appeared without any refresh action — just appeared in the snapshot. Noticed because hole count changed from 23 planned to 29 planned.

---

---

### Task 5 — Log row 5, enter end-of-day rig hours (4,127), sign log complete
expected:    log holes 24–29 as planned, enter end-of-day rig hours reading of 4,127, sign drill log, mark complete with hand-off note
did:         Holes 24–25 already logged in previous session. Added holes 26, 27, 28, 29 one at a time via "Add hole N — 18 ft to plan". Grid showed "Pattern: 28 of 29 holes drilled · 1 skipped — plan complete ✓" after hole 29.
             END-OF-DAY RIG HOURS: searched for entry point. The blast day page ("Equipment / Assets") shows "R1004 4120 → — h" with an empty end-hours slot, but tapping it does nothing — there is no input field visible to a driller. Explored: equipment detail page (/equipment/...) has an "Hour Ledger" showing 4,120 from the checklist, but no "Enter hours" or "Add hours" button is present. The Drilling tab and Work days tab have nothing either. Could not enter 4,127. This task is **BLOCKED** without guidance.
             SIGN LOG: tapped "Tap to sign" → signature pad opened → sign op → Save Signature → signature image saved.
             MARK COMPLETE: tapped "Mark complete · 30 holes" → "Mark complete" bottom sheet appeared with hand-off note textbox. Tried fill + click "Complete" — timed out. The Cancel/Complete buttons are completely hidden behind the bottom navigation bar on a 390×844 phone screen; the nav tap zone starts before the buttons. Tried tapping at various coordinates — all hit nav bar instead. Discovery: used fill → Tab → Tab → Space keyboard sequence (Tab×1 goes to Cancel, Tab×2 goes to Complete, Space activates). Hand-off note: "Row 5 done. Hole 9 wet ~12 ft. Hole 14 skipped boulder. Off-plan hole at 30." Log status changed to "complete" with driller's note visible.
taps:        12 (4 add-hole + multiple mark-complete attempts + Tab/Space workaround)
wrong_turns: 4 — (1) could not find end-of-day rig hours entry point anywhere in the app; (2) Mark complete "Complete" button click timed out repeatedly; (3) tapping at coordinates near Complete button hit nav bar instead; (4) Tab+Space after first Tab hit Cancel, needed Tab+Tab+Space for Complete
consults:    n/a (arm B)
finished:    partially — all holes logged and log marked complete; rig hours (4,127) NOT entered (no visible entry point)
confusion:   The mark-complete dialog's action buttons are physically unreachable by touch on a phone. No driller would know to use Tab+Space. The end-of-day rig hours task has no entry point discoverable from any screen a driller naturally visits; the blast day page shows the empty "→ — h" slot but offers no way to fill it.
minutes:     ~25 (most spent hunting for rig hours entry and working around hidden Complete button)

---

### Task 6 — Enter own hours for the day (time card)
expected:    find time card entry, log hours for the day, card shows on the day record
did:         Dashboard showed "— My hours" tile. Tapped it → "My hours · today" panel appeared. "Which job?" combobox had no accessible label so `select` command failed repeatedly; tapped the combobox by coordinates then used ArrowDown keyboard to select "Ledgeville Pit — Phase 1". Tapped "Add my card" → time card appeared as draft, auto-populated: IN 20:05 (from checklist file time), OUT 20:50 (from log sign time), ST 0.8. Message: "Suggested from your own records — checklist 20:05 · log signed 20:50. Adjust if needed, then sign and file." Kept the suggested times. Tapped "Tap to sign" → signature pad → sign op → Save Signature. Tapped "File card" → toast "Filed Dinis Costa's time card" → dashboard "✅ My hours" confirmed. Blast day page shows "Dinis Costa (me) Filed · 20:05–20:50 · ST 0.8".
taps:        8
wrong_turns: 2 — (1) "Sign" button timed out (covered by nav bar); had to tap by coordinate to reach it and open signature pad; (2) select command failed on unlabeled combobox — needed ArrowDown keyboard workaround
consults:    n/a (arm B)
finished:    yes — time card filed and visible on the day
confusion:   Auto-populated times were a pleasant surprise — didn't expect the app to pre-fill from checklist and log timestamps. Wasn't sure the times were correct (they reflect when I filed documents, not actual work start/end) but accepted them. The "Which job?" combobox had no visible label association in the accessibility tree, causing interaction failures that required a keyboard workaround.
minutes:     ~5

---

## Findings (ranked by severity)

**F1 · BLOCKER · Drill log · Mark complete buttons hidden behind bottom nav bar**
Screen: Drill log, "Mark complete" bottom sheet
Exact words: "Cancel" and "Complete" — both unreachable by touch
What happened: The "Mark complete" bottom sheet renders Cancel/Complete at the very bottom of the sheet. On a 390×844 phone, those buttons fall exactly behind the fixed bottom navigation bar. Playwright confirmed they are visible in the DOM but covered by another element — locator.click() times out. Raw coordinate taps hit the nav instead. The only workaround is keyboard Tab×2 + Space, which no real driller would discover.
What would have helped: Add `padding-bottom: env(safe-area-inset-bottom)` or equivalent so the sheet clears the nav bar; or move the action buttons above the note field.

**F2 · BLOCKER · Blast day / Equipment · No end-of-day rig hours entry point for driller**
Screen: Blast day "Day" tab, Equipment / Assets section; also equipment detail page
Exact words: "R1004 4120 → — h · Dinis Costa checklist · drill log" — the "— h" slot is read-only
What happened: Task required entering end-of-day rig hours (4,127). The blast day page shows the empty end-hours slot but tapping it does nothing. The equipment detail page (/equipment/...) has an "Hour Ledger" showing the morning reading but no "Add hours" button. The Drilling tab has no hours entry. The Work days tab has no hours entry. Spent 20+ minutes searching. The only avenue I didn't exhaust was filing a second rig checklist — but the Drilling tab says "File another rig checklist" implying it's for a fresh check, not an hours-only entry.
What would have helped: A dedicated "Log end-of-day hours" button on the blast day Equipment row, or an inline edit on the "— h" slot (tap to enter the end reading).

**F3 · HIGH · Checklist · Horn cycle states unlabeled; fail vs skip ambiguous**
Screen: Rig checklist, individual item buttons
Exact words: Button cycles "Horn ✓" → "Horn N/A" → "Horn —" (dash)
What happened: Had to cycle through 3 states to reach the failed state. "—" vs "N/A" meaning is not explained. For a safety-critical checklist, the fail state should be unambiguous. Chose "—" based on context but wasn't certain it was correct.
What would have helped: Label the third state "FAIL" or "Not done" distinctly; add a tooltip or one-line description of each state beneath the button.

**F4 · HIGH · Drill log · Skip option hidden inside grid quick-action popup**
Screen: Drill log, hole entry form
Exact words: The form shows "Water / Void / Soft Rock / Overburden" condition buttons — no skip. Skip is only accessible by tapping the grid hole button to get "Mark skipped ⊘".
What happened: Tried "angle/subdrill/comment" (wrong), tried "Void" (wrong — expands geological void field), wasted two taps before discovering that skipping requires tapping the grid button, not the form.
What would have helped: Add a "Skip" or "Mark as skipped" button directly in the hole entry form alongside the condition buttons.

**F5 · MODERATE · PIN entry · No live digit count; batch swallowing silent**
Screen: PIN set screen, PIN confirm screen
Exact words: Six dots visible; no label "3/6 entered" or similar
What happened: Entering digits too quickly (batch bash commands) caused some to be swallowed with no feedback. Mismatch only discovered on confirm. A real driller with a laggy phone could face the same issue.
What would have helped: A small count label "3 of 6" updating on each tap; or a brief vibration per registered digit.

**F6 · MODERATE · Mark complete dialog / Hours panel · "Which job?" combobox has no accessible label**
Screen: Dashboard "My hours · today" panel; also "Drill rig" combobox on drill log
Exact words: "Which job?" appears as plain text above a native `<select>`, not a `<label for>`. "Drill rig" same.
What happened: The `select "label" value` interaction command couldn't find these dropdowns. Had to use coordinate taps + ArrowDown keyboard. Real users aren't affected by label association, but screen-reader users and automation would be.
What would have helped: Wrap the label text in a proper `<label>` element linked to the select.

**F7 · LOW · Home tile · Em-dash prefix makes tile click-by-text unreliable**
Screen: Dashboard, action tiles
Exact words: "— File rig checklist not filed today" — em-dash prefix present
What happened: Click by text failed repeatedly with the em-dash prefix. Dropping the prefix worked. Not a real-user problem (they tap visually) but signals a label format inconsistency that could affect screen readers.
What would have helped: Remove the em-dash from the accessible label; use a visual-only decoration instead.

---

## What worked

- Invite link → account creation was clean: three fields, one button, immediate confirmation
- Plan appeared on the home screen instantly as a distinct "📋 Assigned to you" card — no searching required; job name, hole count, and sender shown
- Row 5 synced live without any refresh action — just appeared in the next snapshot
- Quick-action popup on grid holes (Log as planned / Log with changes / Mark skipped) is efficient once discovered
- The app remembered which row I was on and auto-advanced the hole form after each "Add hole" — no manual re-selection
- Wet hole flag (Water button) expanded cleanly to show depth and note fields
- Off-plan hole entry via Hole # textbox was intuitive — just type any number outside the plan range
- "Mark complete" driller's note pre-filled with a helpful placeholder ("e.g. row 3 ran wet, watch the toe")
- Driller's note appeared prominently at the top of the completed log for the blaster to see
- Time card auto-populated from checklist and log timestamps — a genuine delight, saved the driller from looking up times
- "Work force · time cards 1/1 filed" on the blast day page confirmed the card was properly associated

---

## What I'd tell Mark

Two things are broken for phone users and need a fix before crew gets this: the "Mark complete" button on the drill log is physically hidden behind the navigation bar — I could not tap it at all, and had to find a keyboard workaround that no driller would know. And there is nowhere to enter end-of-day rig hours from the driller's side; the blast day page shows an empty "4120 → — h" slot but it's not tappable, and no screen has an "Enter hours" button. Everything else worked, and some things are genuinely good — the live-sync for the new row and the auto-filled time card were smooth. But I would fix the hidden Complete button and the missing rig hours entry before putting this in front of the crew.

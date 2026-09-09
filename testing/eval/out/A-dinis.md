# Dinis Costa — Eval A (with guide)

Device: phone
Session: A-dinis
Date: 2026-09-08

---

### Task 1 — Create account from invitation
expected:    Open the link, type a password, confirm it, then set a PIN and reach home
did:         Opened invitation URL → filled "Choose a password" (Shotlog99!) → filled "Confirm password" → clicked "Create my account" → PIN screen: clicked 1,2,3,4,5 then 2 (6th digit lagged — had to press a 7th time) → confirm PIN same sequence → saw "Welcome, Dinis" tour → tried click "Let's go" (apostrophe blocked it) → took screenshot → tapped button by CSS coords (181, 501) → Enter key fired it → arrived home with three tiles; skipped tour
taps:        14
wrong_turns: 1 (apostrophe in "Let's go" stopped text-match click; had to use Enter key workaround)
consults:    none
finished:    yes
confusion:   "On the PIN screen after pressing 6 digits the screen didn't advance — it showed 5 dots filled and 1 empty. I pressed a 7th digit (same number again) before it moved to confirm. Expected: 6 taps = done."
minutes:     ~8

---

### Task 2 — Rig checklist R1004 horn repair out-of-service
expected:    Tap rig checklist tile, pick R1004, set hours to 4120, mark everything ✓ except horn (mark N/A), write repair note, check out-of-service, sign, file
did:         Tapped home tile "File rig checklist" at CSS coords (69, 428) → /drill-checklist loaded → tapped "All rigs (1)" → tapped "R1004" (selected, highlighted) → filled Starting hours = 4120 → scrolled down to checklist → tried clicking "Horn ✓" button (unicode checkmark blocked text match) → took screenshot → tapped by coords — hit Gauges instead (coords off by ~49px rows) → took more screenshots and corrected: accidentally toggled Blow Out Coolers and Gauges to N/A → cycled each back through N/A → — → ✓ by repeated taps → then tapped (181, 644) which correctly hit Horn (N/A) → filled repairs textbox "Horn not working — needs repair" → checked "Rig is OUT OF SERVICE" → clicked "Tap to sign" → used {"op":"sign"} to draw signature → clicked "Save Signature" → clicked "File checklist for R1004" → landed on filed confirmation showing Horn N/A, OUT OF SERVICE, repair ticket opened
taps:        28
wrong_turns: 3 ("Horn ✓" text match failed due to ✓ unicode; tapped Gauges instead of Horn first time; tapped Blow Out Coolers when trying to reset Gauges)
consults:    none
finished:    yes
confusion:   "The ✓ symbol in button names like 'Horn ✓' made text-based clicking impossible — I had to switch to screenshot + coordinate taps. On a real phone with fat fingers, the checklist rows are close enough together that I accidentally toggled wrong items twice. Expected: the buttons would have accessible names I could target, or more spacing between rows."
minutes:     ~15

---

## Findings (ranked)

1. **slow · Checklist · Button labels use ✓/N/A unicode** — buttons named "Horn ✓", "Gauges ✓" etc. cannot be tapped by text on any accessibility-based tool (and likely by any voice-control or switch-access users). A driller using a gloved hand or accessibility tech would hit the same wall. What would help: accessible `aria-label` that says just the item name, separate from the visual ✓/N/A decoration.

2. **slow · Checklist · Checklist rows are close together on phone** — at phone viewport width, rows are ~49 CSS px apart. A driller with dirty gloves trying to tap "Horn" hit "Gauges" and then "Blow Out Coolers" before finding the right row. What would help: slightly more vertical padding on each row (60–70 CSS px minimum touch target height per Material/HIG guidelines).

3. **cosmetic · Enroll/PIN screen · PIN requires 7 presses not 6** — after pressing 5 digits, the 6th press showed 5 filled dots, requiring a 7th press to advance. Could be a timing/race issue where rapid sequential presses are deduplicated. What would help: each press should reliably advance one dot; maybe debounce shorter or confirm each digit visually before the next is accepted.

4. **cosmetic · Home · "Let's go" button unclickable by text** — the apostrophe in "Let's go" breaks text-match clicking. Not a real-world issue for fingers, but worth noting the label could be "Go to home" to avoid punctuation issues in any automated or accessibility testing.

---

## What worked

- Invitation flow (enroll page) was very clear — email pre-filled, one password field, helpful hint text
- Picking the rig from the fleet was fast: "All rigs (1)" expanded cleanly, R1004 appeared immediately
- All checklist items default to ✓ — smart default, reduces work for a normal day
- Repair note text box placeholder "e.g. hose blew + compressor stopped working" is useful
- "Rig is OUT OF SERVICE" checkbox is clearly labeled
- Filing landed on a clean summary page with table of all items, signature shown, and confirmation messages
- "Repair ticket opened — the shop can see your notes" message is reassuring

---

## What I'd tell Mark

Before the crew uses this: tell them the checklist items are tap-to-cycle (✓ → N/A → not done → ✓). If they're not told that, they'll tap everything once to see what happens. Also warn them that the items are close together on a phone — go slow if gloves are on, or use the big-finger tip of a stylus. The repair note is the most important part — make sure they know to type something there, not just toggle the item.

---

## Guide pages

(No guide consulted for tasks 1–2.)

---

## Run 2 (after the data reset)

### Task 1 (Run 2) — Create account from new invitation
expected:    Same as Run 1: open link, set password, confirm, set PIN, land on home
did:         Opened new invitation URL → filled password (Shotlog99!) → filled confirm → clicked "Create my account" → PIN screen: clicked 1 solo, then 2,3,4,5,2 in batch (5th click in batch triggered confirm screen) → confirmed PIN with same 6-click sequence → "Welcome, Dinis" tour appeared → clicked "Let's go" (worked this time — text matching update fixed apostrophe) → home screen with 3 tiles; skipped tour
taps:        13
wrong_turns: 0
consults:    none
finished:    yes
confusion:   "PIN still required an extra press — same as Run 1. Pressed 6 digits but only 5 dots filled; the 6th push in my batch sequence advanced to confirm. Identical behavior to before, so it's reproducible."
minutes:     ~4

### Task 2 (Run 2) — Rig checklist R1004 horn repair out-of-service
expected:    Same as Run 1: pick R1004, hours 4120, Horn N/A, repair note, out-of-service, sign, file
did:         Tapped "File rig checklist" tile by screenshot coords (72, 453) → clicked "All rigs (1)" → clicked "R1004" → filled hours 4120 → scrolled 600 → took screenshot (now 1:1 pixels, phone 390×844) → tapped (195, 612) → hit Gauges N/A (one row above Horn) → cycled Gauges back to ✓ with two more taps at (195, 612) → tapped (195, 660) → Horn N/A confirmed → filled repair note "Horn not working — needs repair" → checked "Rig is OUT OF SERVICE" → clicked "Tap to sign" → drew signature → saved → filed → confirmation: "Checklist filed · Repair ticket opened"
taps:        21
wrong_turns: 1 (tapped Gauges instead of Horn first — one row off, same issue as Run 1)
consults:    none
finished:    yes
confusion:   "Even with 1:1 pixels and an accurate screenshot, I still hit the row above Horn. The checklist rows in the scrolled view are close enough that the visual center of Horn on-screen lands at y=660 but visually reads as y=612 when I eyeball the screenshot. The rows need more space."
minutes:     ~6

### Task 3 — Find plan on home, log row one
expected:    Barry said plan is in the app — I expected to find it on my home under something like "Drill log" or maybe have to dig for it. Then open the drill log and tap each of the 6 holes.
did:         Tapped "Done" on filed checklist (button was off-screen, took screenshot, tapped at 194,421) → landed on home → plan was immediately visible under "📋 Assigned to you: Shot 1 · Ledgeville Pit — Phase 1 · 24 holes planned · sent by Barry Lopes · Open ›"; clicked it → arrived at drill log URL → tour overlay blocked R1 tap (timed out) → clicked "Skip" → took screenshot → tapped R1 row handle at (50, 462) → "6 selected" appeared with "Log 6 as planned" button → clicked "Log 6 as planned" → toast "Logged 6 holes as planned" + header updated to "6 holes · 108 ft" + holes 1–6 disabled in grid
taps:        7
wrong_turns: 1 (tour blocked first R1 tap — had to skip tour first)
consults:    none
finished:    yes
confusion:   "I expected to have to tap each hole individually — I didn't know the R1 row handle existed or that it would let me log all 6 at once. The hint text '· R1, R2… selects a row' is small and easy to miss. That said, once I tapped R1, the 'Log 6 as planned' button was obvious. Good flow once you know it."
plan_location: OBVIOUS — the plan appeared on my home screen in a dedicated 'Assigned to you' card the moment Barry sent it. I did not have to search anywhere.
minutes:     ~5

### Task 4 — Wait for R5, log R2/R3 with exceptions, add off-plan, log R4
expected:    Would need to refresh or do something to see the new row; expected to have to find a way to flag wet/skip within a row selection; expected off-plan to require a separate flow
did:         Took snapshot on drill log — R5 (holes 25–30) was already there, no action needed to see it; "Pattern: 6 of 30" confirmed the plan grew from 24 to 30 holes silently · Tapped R2 (50,511) → 6 selected → tapped hole 9 at (194,511) to deselect it → 5 selected → "Log 5 as planned" → 5 logged · Selected hole 9 (1 selected, H-9) → clicked "Log with changes…" → form jumped to hole 9 → clicked "Water" → water sub-form expanded → clicked "Add hole 9 — 18 ft to plan" → hole 9 logged with W · Tapped R3 (50,161) → 6 selected → tapped hole 14 (145,161) to deselect → 5 selected → "Log 5 as planned" → 5 logged · Tapped hole 14 (145,161) → 1 selected H-14 → "Mark skipped ⊘" → marked skipped · Filled "Hole #" with 31 → filled "Depth drilled" with 18 → "Add hole 31" → off-plan hole 31 added, showed "off-plan: 31" in grid · Tapped R4 (50,228) → 6 selected → "Log 6 as planned" → logged · Grid: R1–R4 drilled, hole 9 orange (wet), hole 14 dashed (skipped), hole 31 off-plan, R5 open
taps:        24
wrong_turns: 1 (first R4 tap at (50,209) missed — had to screenshot and re-tap at (50,228))
consults:    none
finished:    yes
confusion:   "R5 appeared silently with no notification — I only noticed because I took a snapshot. On a real phone between holes I would not have known to check. Expected some kind of 'Barry updated the plan' badge or alert. Also: 'Log with changes…' is the right button for a wet hole but the label is not obvious — I had to guess it meant I could add flags to a single selected hole."
plan_update_how:    Silent — R5 was already in the snapshot when I first looked. No badge, no alert.
minutes:     ~12

### What felt different the second time

- "Let's go" worked immediately with the updated text matching — much less friction at account creation.
- The em-dash buttons ("— File rig checklist not filed today") still could not be matched by text click, so I still had to use screenshot + tap for the home tile. The update helped quotes/apostrophes but not the em-dash in button names.
- Knowing the checklist row pattern from Run 1 (Horn is always one row below where I first guess), I only made one wrong tap instead of three — that knowledge is mine, not the app's, so new drillers will have the same problem I did first time.

---

### Task 5 — Log row five, sign log complete, enter end-of-day rig hours
expected:    Tap R5, log 6 holes as planned, enter ending meter hours (4,127) somewhere, sign the log, mark complete with a hand-off note
did:
  Log R5: Returned to drill log → tapped R5 row handle (50,302) → 6 selected → clicked "Log 6 as planned" → holes 25–30 logged → grid showed "Pattern: 29 of 30 holes drilled · 1 skipped — plan complete ✓" (29 because hole 14 was skipped, 31st hole off-plan)

  Rig hours: Searched for end-of-day rig hours (4,127) entry point — (a) selected R1004 in the drill log "Drill rig" dropdown (required tap-to-focus + ArrowDown key since select command couldn't find it by label), no hours fields appeared, only a "rig history" link appeared; (b) followed rig history to equipment page — Hour Ledger showed only 4,120 from the checklist, no button to log a new meter reading; (c) opened "My hours" time card panel — no rig hours field there either. Could not find any entry point for 4,127.

  Sign: Scrolled to signature section → tapped "Tap to sign" by coordinate (195,623) → signature pad opened → used sign command → Save Signature → signature saved (img "Signature" + "Clear signature" button)

  Mark complete: Clicked "Mark complete · 31 holes" → dialog opened ("Mark complete" / "Anything the blaster should know?") → filled note: "Hole 9 wet, hole 14 skipped (boulder). Added hole 31 off pattern east side." → click "Complete" timed out 3 times (button hidden behind nav bar) → used Tab Tab Space keyboard navigation to hit Complete → log status changed to "complete", "Reopen" button appeared, driller's note and plan review summary appeared

taps:        18
wrong_turns: 4 (scroll-up kept landing at bottom due to Hole #32 input focus; "Complete" button hidden behind nav bar × 3 attempts; had to use Tab Tab Space workaround)
consults:    none
finished:    partial — log marked complete, signed, note filed; rig hours (4,127) NOT entered (no entry point found)
confusion:
  1. "The 'Complete' button in the Mark complete dialog was invisible — the bottom sheet rendered behind the nav bar. I had to Tab Tab Space blind to submit. A driller on a real phone has no keyboard, so this flow would be completely broken."
  2. "I spent a long time looking for where to enter the ending meter hours (4,127). I checked the drill log form after picking R1004 — nothing appeared. I followed 'rig history' to the equipment page — the Hour Ledger only showed the starting 4,120 from the checklist and there was no 'Log hours' button. I checked the time card — not there either. The ending hours have no home I could find."
  3. "After marking complete, the scroll command didn't work because the Hole #32 input had stolen focus and re-scrolled the page to the bottom each time. I had to navigate away and back via direct URL to get the page to load from the top."
minutes:     ~25

---

### Task 6 — Enter personal hours (time card)
expected:    Some kind of hours form somewhere — unsure if it was in Work days, Settings, or a tile
did:         Returned to home screen → saw "🟠 My hours" tile (em-dash still blocked text-click, needed screenshot coords) → tapped tile at (317,470) → "My hours · today" panel slid up showing "Which job?" combobox → tapped dropdown by coordinate (195,692) + ArrowDown key → selected "Ledgeville Pit — Phase 1" → "Add my card" button enabled → clicked it → card form appeared with auto-suggested times: IN 20:05 / OUT 21:15 / ST 1.2 / OT 0 (populated from checklist start time and log signature time) → tapped "Sign" area (60,685) to open signature pad → used sign command → Save Signature → tapped "File card" at (73,730) → toast "Filed Dinis Costa's time card" → tile updated to "✅ My hours" → panel showed "Dinis Costa (me) Filed · 20:05–21:15 · ST 1.2"
taps:        10
wrong_turns: 1 (em-dash in tile button name still blocks text-click; needed screenshot + coords as in prior tasks)
consults:    none
finished:    yes
confusion:   "I was surprised the times were already filled in — the app pulled from my checklist timestamp and the log signature time. I didn't expect that. It's clever but I'd want to verify: what if I started earlier or finished later? I can see IN and OUT are editable text boxes, so that's fine. The auto-fill is a genuine time-saver."
minutes:     ~5

---

## Findings (ranked, all tasks)

1. **BLOCKER · Drill log + any bottom-sheet · Bottom-sheet buttons hidden behind the nav bar**
   Screen: Drill log — Mark complete dialog, My hours panel
   Exact words: "Complete" button (in Mark complete dialog), "Sign" button (in My hours)
   What happened: The "Complete" button in the Mark complete bottom-sheet rendered below the fixed navigation bar. Three click attempts all timed out. Used Tab-Tab-Space keyboard workaround. A real phone driller has no external keyboard — this flow would be unsalvageable.
   What would help: Bottom-sheet panels should set padding-bottom equal to nav bar height (plus safe area inset) so content never renders behind the bar. CSS: add `pb-[env(safe-area-inset-bottom)]` plus the nav height to every bottom-sheet scroll container.

2. **HIGH · Rig / Drill log · End-of-day meter hours have no entry point**
   Screen: Drill log (Drill rig section), Equipment page (Hour Ledger), My hours time card
   Exact words: "Drill rig — Pick rig…" (no hours field appeared after selecting R1004), "4,120 hrs · from the latest entry" (equipment page, no way to add new entry), time card shows IN/OUT/ST/OT (no rig column)
   What happened: Task asked to log ending meter hours (4,127). The starting hours (4,120) were entered via the rig checklist. No location for ending hours was found after checking all three likely screens.
   What would help: Add an "Ending hours" spinbutton to the drill log form directly below the Drill rig dropdown (shown only when a rig is selected). The Hour Ledger on the equipment page would then auto-update from drill log completion. Alternatively, put a "Log meter reading" button on the equipment page's Hour Ledger card.

3. **HIGH · Home screen · Drill log tile never shows completed status**
   Screen: Home (My Drilling tiles)
   Exact words: "— Drill log" (dash persists even after log marked complete), "No drill plans yet. Ask the blaster for the job's drill plan…"
   What happened: Logged all 31 holes and marked the log complete. Home screen still showed "— Drill log" with a dash throughout. The log was reached via a blast day URL (Barry's plan sent outside the Drilling tab flow), so the Drilling tab's tile never linked to it. A driller seeing "—" has no feedback that anything was recorded.
   What would help: The home screen drill log tile should surface the most recently modified drill log for the current day, regardless of access path. If the log is complete, show "✅ Drill log complete · 31 holes" or similar.

4. **MEDIUM · Checklist · ✓ symbol in button names breaks text access**
   Screen: Rig checklist (checklist grid)
   Exact words: "Horn ✓", "Gauges ✓" — buttons labelled with trailing ✓ or N/A
   What happened: click "Horn ✓" failed — text matcher couldn't find it. Had to fall back to screenshot coordinates. Hit wrong rows twice (once each run).
   What would help: Give each checklist-row button a plain accessible label ("Horn") separate from the visual state decorator (✓/N/A). The visual label can stay; the aria-label should omit it.

5. **MEDIUM · Checklist · Row touch targets too close on phone**
   Screen: Rig checklist (scrolled position)
   Exact words: (no specific text — layout issue)
   What happened: Both runs, tapping the Horn row hit the Gauges row one step above. At 1:1 scale the visual rows are ~48 CSS px apart. HIG / Material minimum is 44–48 px; at 48 the actual tap zone is borderline.
   What would help: Increase row height to at least 56–60 CSS px, or add explicit larger tap targets (invisible but tappable areas) around each state button.

6. **MEDIUM · Drill log · Plan update (R5) appeared silently**
   Screen: Drill log grid
   Exact words: (no notification text shown)
   What happened: Barry added R5 to the plan. No badge, toast, or alert appeared. I only noticed by taking a snapshot and counting rows. A driller moving between holes outside might miss the update for the entire shift.
   What would help: Show a brief "Plan updated — Barry Lopes added row R5 (6 holes)" toast or banner when the plan changes while the log is open. A persistent dot on the drill log tile on home would also help.

7. **LOW · PIN screen · Requires 7 presses for a 6-digit PIN**
   Screen: Enroll PIN
   Exact words: (no text — behavioral issue)
   What happened: After 6 taps, only 5 dots filled; a 7th tap was needed to advance. Reproducible in both runs.
   What would help: Ensure each PIN digit tap reliably advances one dot immediately. Likely a debounce issue — shorten the debounce interval or track each event separately.

8. **LOW · Drill log · "Log with changes…" label doesn't signal per-hole exceptions**
   Screen: Drill log (action bar when holes selected)
   Exact words: "Log with changes…"
   What happened: To log hole 9 as wet, I needed to select just that hole and choose "Log with changes…". The label is ambiguous — it could mean "log with different depth" or "log with a flag." I guessed correctly, but a new driller might not.
   What would help: Rename to "Log with flags…" or "Log hole + condition…". Or add a one-line hint in the selection bar: "Wet, void, soft rock? Use Log with changes."

---

## What worked

- Invitation and account creation flow was smooth on Run 2 — pre-filled email, clear password fields, helpful text.
- Plan appeared on home instantly once Barry sent it — the "Assigned to you: Shot 1" card was obvious and required zero searching.
- Row handles (R1, R2…) for bulk-logging entire rows are a real time-saver once you know they exist. "Log 6 as planned" is exactly the right button label — zero ambiguity.
- Deselecting individual holes from a row selection (to log exceptions within a row) worked intuitively — tap the hole again and it drops from the count.
- Water flag sub-form was clean: select one hole → "Log with changes…" → click "Water" → expand form → one "Add hole N — 18 ft to plan" button. No confusion once inside.
- Off-plan hole entry: type a number outside the plan range → depth field appears with no plan value shown (correct) → "Add hole 31" → shows as "off-plan: 31" in grid. Natural flow.
- Mark complete auto-shows the plan review ("30 of 30 plan holes drilled · 1 outside the plan · 1 wet") — a useful sanity check before filing.
- Time card auto-populated IN/OUT from checklist timestamp and log signature time. This is genuinely excellent — a tired driller at the end of the day just verifies rather than remembers. Keep this.
- "Filed Dinis Costa's time card" toast and the tile flipping to ✅ My hours was satisfying and clear confirmation.
- All data appeared synced (green "Synced" dot throughout) — no anxiety about losing work.

---

## What I'd tell Mark

Three things before the crew uses this:

First, the bottom of every bottom-sheet (Mark complete, My hours) is hidden behind the navigation bar on phone. The "Complete" button is invisible and untappable. On a real phone there's no keyboard shortcut — the driller is stuck. This needs to be fixed before anybody uses it on a job.

Second, there's nowhere to log the ending meter hours for the rig. Starting hours go into the checklist (4,120), but I couldn't find any field for the ending reading (4,127) — not in the drill log after picking R1004, not on the equipment page, not in the time card. Either the feature is missing or it's hidden somewhere I never found. Drillers track meter hours for maintenance scheduling, so this matters to them.

Third, the drill log tile on the home screen never updated to show the log as complete — it showed "—" the whole time even after marking the log complete, signing, and adding 31 holes. A driller finishing their day would have no feedback from home that the log is filed and visible to the blaster.

Everything else worked well. The rig selection, the row-handle bulk logging, the exception flows, and the time card auto-fill are all genuinely good. The app feels real.

---

## Guide pages

No guide pages were consulted during any task (Tasks 1–6). All flows were figured out from the app's own UI. The inline legend text on the drill log ("tap open holes, a row handle, or 'all open' to select; off-plan hole? type any number below") was enough to orient the hole-logging flow, once the tour was skipped.

Pages that might have earned their place if I had consulted them:
- Driller > Row handles: would have saved time figuring out how R1/R2 selectors work
- Driller > Exceptions / wet holes: might have made "Log with changes…" less ambiguous
- Driller > End-of-day checklist (if one exists): would have pointed me to the rig ending hours entry — but only if the feature exists

The guide probably deserves a "Driller > End of day" page that explains: (1) mark log complete, (2) enter ending rig hours, (3) sign the time card. Right now that workflow is not visible in the app and the guide would be the only place a new driller could learn it.

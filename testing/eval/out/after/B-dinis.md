# B-dinis — Dinis Costa, driller, phone, arm B (no guide)

Password chosen: `RockDust8!`
PIN chosen: `194827`

### Task 1 — open invite, set password, PIN, reach home
expected:    tap the link, type a password, maybe confirm email, then land on some kind of dashboard.
did:         open invite link (name and email already filled in for me) › fill password › fill confirm password › click "Create my account" › (auto) Set a 6-digit PIN, tapped 1-9-4-8-2-7 › Confirm your PIN, same six digits again › a "Welcome to ShotLog" 4-stop tour popped up over the home screen, 1/5, clicked "Skip" › home screen showed with "My Drilling" section listing three rows: File rig checklist, Drill log, My hours.
taps:        14 (2 fills, 1 click create account, 12 PIN digit taps, 1 skip)
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   none really — the flow was linear and each screen told me exactly what to do next. The one odd moment: the "Welcome to ShotLog" tour called the three tiles "Checklist, Drill log, My hours" in its subtitle, but the actual home screen row is labelled "File rig checklist" not "Checklist" — a small mismatch between the tour's wording and the real label, took a half-second to match them up.

## Findings
1. **cosmetic · Home / welcome tour** — the tour's intro paragraph says "Checklist, Drill log, My hours" as the three tiles, but the row on the actual dashboard reads "File rig checklist" (not "Checklist"). Minor wording mismatch between the tour text and the real UI; a newcomer skimming both could wonder for a second if they're the same thing. Fix: match the tour's naming exactly to the on-screen labels.
2. **cosmetic · Home** — home immediately shows two stacked onboarding panels ("Finish setting up" and "Your first week · 0/5 done") plus a 5-step tour modal on top of them, all before I'd done anything. That's three layers of onboarding at once for a brand new phone user. Not blocking, but busy for a first screen.

## What worked
- The enrollment link pre-filled my name and email — no re-typing, no confusion about who I was signing up as.
- Password → PIN → confirm PIN flow was fully linear, one thing at a time, no back-and-forth.
- The empty-state text under "My Drilling" ("No drill plans yet. Ask the blaster for the job's drill plan...") pre-answers the obvious next question before I even asked it — good.

## What I'd tell Mark
So far, smooth — nothing to flag before the crew starts. The only thing worth a look is that the welcome tour's phrasing ("Checklist, Drill log, My hours") doesn't exactly match the dashboard's own row label ("File rig checklist"), which could be a 30-second copy fix. Otherwise sign-up was foolproof on a cracked, dusty phone screen: big buttons, one field at a time, no typing my own name or email.

---

# Second sitting — office has loaded the week's work

### Task 2 — file rig checklist, horn as repair
expected:    tap "File rig checklist" on home, pick my rig, tick everything, mark the horn bad, sign, file — the rig stays in service.
did:         Home › tap "File rig checklist" tile › "Which rig?" screen showed two: "R1004 · today's log · in shop" and "R-102 · usual" — R1004 is the rig I actually run day to day (Barry's text said the leak rig is "with the shop", and R1004 was already tagged "in shop" here) so I picked R-102, which the home screen had already told me was "Today's rig from your drill log" › starting hours field showed 3888 already sitting in it (left it, assumed that was the meter) › tapped Horn three times to see the cycle (✓ → N/A → — → back to ✓), landed it on "—" › typed "Horn not working" in the Repairs needed box › left "Rig is OUT OF SERVICE" unchecked › tapped "Tap to sign", drew a signature, "Save Signature" › "File checklist for R-102" › got a filed receipt screen. Tried to tap "Done" on the receipt four times, each one timed out with no error message — gave up and reopened http://localhost:5199 directly, which landed back on Home showing "✅ Checklist filed R-102" and a new line "R-102: "Horn not working" — with the shop ›".
taps:        22 (1 tile, 1 rig pick, 3 horn cycles, 1 fill, 1 sign, 1 save signature, 1 file, 4 failed Done taps, 1 reopen, rest snapshots/waits not counted as taps)
wrong_turns: 1 ("tapped Horn three times before realising the third tap ('—') was the one I wanted, not the second ('N/A')")
consults:    n/a (arm B)
finished:    yes
confusion:   two things. First: on the filed receipt screen, "Starting hours: —" was printed even though the entry screen showed 3888 sitting in that field the whole time — I never touched it because it already looked filled in, so it seems the pre-filled number doesn't count unless you retype it. Second: the "Done" button on the receipt would not respond to taps at all; I had to back out by reopening the app's home URL instead.
minutes:     6

### Task 3 — finish the half-drilled Bench 3 east plan
expected:    open the plan, tap the open holes, punch in depths one at a time, mark one wet somehow.
did:         Home › tap "🟠 Drill log 13 holes" › landed on Drill Log — Bench 3 east, grid showed rows R1–R4, 13 drilled (grey, disabled) + 1 skipped (H-9) + 17 open circles › a "The drill log" tour popped up over the grid and ate my first two taps (see confusion) — screenshotted, found "Skip" underneath it, tapped its pixel coordinates directly since the click-by-name kept timing out › tapped H-16 to select it alone, "Log with changes…" opened a per-hole depth/condition form pre-filled with the plan depth (32 ft), tapped "Water", "Add hole 16 — 32 ft to plan" › grid now showed 16 open holes and a "Select all open (16)" button; tapped it, all 16 selected at once, tapped "Log 16 as planned" › grid header changed to "30 of 31 holes drilled · 1 skipped — plan complete ✓".
taps:        9 (1 tile, 1 tap-by-pixel to dismiss tour, 1 select H-16, 1 log-with-changes, 1 water, 1 add-hole, 1 select-all-open, 1 log-as-planned, plus re-snapshots not counted)
wrong_turns: 1 ("tried clicking the tour's 'Skip' button by name/number three times, it kept timing out — the tour overlay itself must be sitting on top of the button in a way Playwright's hit-test doesn't like, even though the accessibility tree said it was there")
consults:    n/a (arm B)
finished:    yes
confusion:   the onboarding tour that appeared over the drill-log grid was unclickable by name or number — every "click Skip" attempt returned "Timeout 6000ms exceeded" with no visible error on screen, so I had to fall back to a screenshot and a raw pixel tap to get past it. If I hadn't known the pixel-tap escape hatch this task would have stalled completely on a "help" feature I didn't even want.
minutes:     5

### Task 4 — end-of-day hours, sign log complete
expected:    some obvious "end my day" button that asks for the meter reading and finishes the log.
did:         On the (still open) Drill Log — Bench 3 east screen, tapped "Tap to sign" › drew a signature › "Save Signature" › tapped "Mark complete · 31 holes" at the bottom, which — only then — revealed a hidden mini-form: "R-102 meter at end of day — optional" pre-filled with 3888 (same stale value as the morning field) plus a notes box for the blaster › this time I didn't trust the pre-fill (after task 2's find), so I explicitly typed 3895 (3888 + 7) into it › tapped "Complete" › screen flipped to status "complete", "Reopen" button, "✓ Marked complete — the blaster reviews it from the day." › went to My Records, opened the drill log's "Open live record" — confirmed "Complete" › to check the hours actually landed, went to the rig's own page (via "rig history" link) and read its Hour Ledger: top line "3,895 hrs · from the latest entry" with the line "3,895 drill log · end of day · Dinis Costa · end of day Wed, Sep 9, 2026" — so the value did save, confirming my task-2 suspicion that pre-filled number fields need to be retyped to register. Went looking for "the day's daily report" showing the rig's hours "start → end" as the task described, but on Work Days (both "Mine" and "Everyone", searched "Ledgeville") there is no work day at all for Ledgeville Pit today — only one for "Route 3 culvert." The drill log itself said "the blaster reviews it from the day," implying that daily report lives on Barry's side, not mine; I have no screen as a driller that shows a combined "day" with rig hours start → end for today's Ledgeville work.
taps:        6 (sign, save signature, mark complete, fill hours, complete, plus a few navigation clicks to verify not counted as task taps)
wrong_turns: 1 ("searched Work Days by 'Mine' and 'Everyone' and by typing 'Ledgeville' in the search box looking for today's daily report — it doesn't exist from my side")
consults:    n/a (arm B)
finished:    partly — the log itself reads complete and the rig's own Hour Ledger shows the correct 3,895 end-of-day figure, but I could not find "the day's daily report" showing rig hours "start → end" anywhere in my own screens to confirm that half of the done-when.
confusion:   "the blaster reviews it from the day" — the sentence tells me a "day" exists somewhere, but Work Days (mine or everyone's) has no entry for Ledgeville Pit today, only for a different job (Route 3 culvert). I expected either a matching "day" to appear once I completed the log, or a link from the checklist/log straight to it, and found neither.
minutes:     4

### Task 5 — enter today's hours
expected:    a time-card form, punch in and out times, maybe a total.
did:         Home › tapped "— My hours" › a "Which job?" panel opened right on the dashboard (no page navigation) with a job picker (two identical "Ledgeville Pit — Phase 1" entries in the list, plus "Route 3 culvert" — picked the first Ledgeville one) › "Add my card" › the card appeared already pre-filled: "Suggested from your own records — checklist 00:25 · log signed 00:30" with IN 00:25 / OUT 00:30 / ST 0.1 — these are real clock-timestamps from when I filed the checklist and drill log a few minutes ago today, not a plausible shift, so I retyped IN to 07:00 and OUT to 15:00 › ST briefly showed "14.6" (wrong — 07:00–15:00 is 8 hours) until I edited OUT again (to 15:30, then back to 15:00), at which point it recalculated correctly to "8.0" › tapped "Sign", drew a signature, "Save Signature" › "File card" › toast "Filed Dinis Costa's time card", row now reads "Dinis Costa (me) Filed — 07:00–15:00 · ST 8.0". Tried to tap "Close" and "My records" afterward and both hung with "Timeout 6000ms exceeded" (same pattern as tasks 2 and 3) — reopened http://localhost:5199/records directly instead, where "Time Card — Dinis Costa" now shows for today, "Filed, awaiting approval."
taps:        9 (open panel, select job, add card, 2 time fills that stuck + 1 throwaway, sign, save signature, file card)
wrong_turns: 1 ("picked the first of two identically-named 'Ledgeville Pit — Phase 1' job entries in the dropdown, with no way to tell them apart")
consults:    n/a (arm B)
finished:    yes
confusion:   two things. The suggested IN/OUT times (00:25/00:30) are literally when I touched the checklist and drill-log screens today, not "hours worked" — a real driller filling this in at the end of a normal shift would see 00:25 AM as their clock-in time and have no idea why. And the ST figure momentarily calculated as "14.6" for an 8-hour span before self-correcting on a second edit — if I'd tapped "File card" in that instant I'd have filed a wrong number without ever knowing.
minutes:     5

## Findings
1. **wrong result · My hours (time card)** — after typing IN 07:00 and OUT 15:00, the "ST" (straight time) field briefly showed "14.6" instead of the correct "8.0"; it only self-corrected after I edited the OUT field a second time. A driller who fills the times once and immediately taps "File card" could sign and submit a wrong total without any warning. What would help: recalculate ST on every keystroke/blur reliably, or block "File card" until the displayed ST matches the entered IN/OUT.
2. **blocked (workaround needed) · multiple screens** — on three separate occasions (the rig-checklist "Done" receipt button, the drill-log onboarding tour's "Skip" button, and the time-card's "Close"/"My records" after filing) a button that was clearly visible and present in the accessibility tree would not register a click — every attempt timed out with no on-screen error. Each time I had to either take a screenshot and tap raw pixel coordinates, or abandon the button and reopen the page by URL. A first-time phone user without that escape hatch would be stuck staring at a dead button.
3. **wrong result · Rig checklist "Starting hours" field** — a pre-filled number field (3888, matching the meter) is NOT saved unless you retype it — the filed checklist showed "Starting hours: —" even though the field visibly held 3888 the whole time I was on the form. The end-of-day hours field on "Mark complete" has the same pre-fill-looks-set trap, but I only avoided it there because I'd already been burned once. What would help: either make the pre-filled value actually submit as-is, or visually distinguish "this is just a placeholder/last-known-value" from "this is the value that will be saved."
4. **cosmetic · My hours job picker** — the "Which job?" dropdown listed "Ledgeville Pit — Phase 1" twice (with different underlying ids) and "Route 3 culvert" once. Nothing on screen explained what distinguished the two identical-looking Ledgeville entries, so I picked the first one blind.
5. **wrong result · My hours suggested times** — the "suggested" IN/OUT times are drawn from the actual wall-clock moment I touched the checklist and drill log (00:25/00:30 — the middle of the night in-app), not a plausible start/end of shift. It reads as a real suggestion ("Suggested from your own records") so a less careful person might sign and file it as-is.
6. **cosmetic · Home / welcome tour** (task 1) — tour text says "Checklist, Drill log, My hours" but the dashboard row reads "File rig checklist."
7. **cosmetic · Home** (task 1) — three layers of onboarding (finish-setup banner, first-week checklist, 5-step tour) all stacked on the very first screen a new phone user sees.

## What worked
- The enrollment link pre-filled my name and email — no re-typing, no confusion about who I was signing up as.
- Password → PIN → confirm PIN flow was fully linear, one thing at a time, no back-and-forth.
- The empty-state text under "My Drilling" pre-answers the obvious next question before I even asked it.
- The bulk "Select all open (N)" + "Log N as planned" on the drill log turned a 16-tap chore into two taps — genuinely fast once I found it.
- The rig checklist correctly refused to force the rig out of service just because one item failed — filing with "Horn not working" noted opened a repair ticket and surfaced it right on my home screen, without blocking me from finishing the day.
- The end-of-day "meter at end of day" field on the drill log's Mark Complete step, and the rig's own Hour Ledger, correctly reflected 3,895 hrs once I explicitly typed it.

## What I'd tell Mark
Two things I'd want fixed before the crew leans on this on a real cracked, dusty phone screen: first, dead buttons that eat taps silently (the tour's Skip, a receipt's Done, "Close" after filing my time card) — I had to guess my way around each one, and a driller mid-shift won't know to screenshot-and-pixel-tap their way out. Second, the "looks filled in, isn't actually saved" trap on number fields (rig starting hours, and the time-card ST briefly glitching to 14.6) — if I hadn't double-checked, I'd have filed wrong records without any warning. Everything else — the sign-up, the bulk drill-log entry, the checklist-to-repair-ticket flow — worked better than I expected for a first day on a new app.

# Dinis Costa — Session B (without the guide)

Password chosen: `DrillRig8costa`
PIN chosen: `294837`

### Task 1 — open invite, set password, PIN, reach home
expected:    a link, a password field, then straight to some kind of home screen — didn't expect a PIN step but that's normal for phone apps I use for banking.
did:         opened invite link › filled password › filled confirm password › "Create my account" › (auto) Set a 6-digit PIN (294837) › Confirm your PIN (294837) › "Welcome, Dinis" tips screen (Checklist · Drill log · My hours) › "Let's go" › Home
taps:        16
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   none really — the one thing that gave me half a second's pause was the "Welcome, Dinis" screen appearing right after PIN confirm with no visible transition (screen just changed heading, no "PIN set" toast), so I wasn't 100% sure the PIN had taken until I saw the next screen was different. It worked out but I'd have liked a beat of confirmation.

Home now shows the three tiles under "My Drilling": File rig checklist (not filed today), Drill log, My hours. Also a "Finish setting up" card (sign once in My Profile) and a "Your first week · 0/5 done" checklist sitting above the tiles.

Stopping here as instructed — waiting for the office to load last week's work onto the account before continuing.

---

Back on now — office has loaded the week. Home shows "Your first week · 3/5 done", a Drilling tile "🟠 Drill log 13 holes", and "Today's rig from your drill log: R-102", "Drilling today · Bench 3 east". A first-run tour overlay ("Welcome to ShotLog... 1/5") popped up over the home screen — I skipped it, wasn't going to read a tour standing in the cab.

### Task 2 — file checklist for today's rig, note horn repair
expected:    tap "File rig checklist", pick my rig (I drive R1004 normally), fill it in, find some "needs repair" flag for the horn, sign, file.
did:         Home › File rig checklist › screen asked "Which rig?" showing R-102 ("today's log") and R1004 ("last filed · in shop") › picked R-102 since that's the one on today's plan and R1004 is with the shop per Barry's text › starting hours pre-filled 3888 from the rig's own meter, left as-is › tapped "Horn ✓" — cycled to "N/A" › tapped again — cycled to "—" › (there is no explicit "failed"/"needs repair" icon, just ✓ / N/A / —) settled on "—" since N/A reads as "doesn't apply to this rig" which isn't true, the horn does apply, it just doesn't work › typed "Horn doesn't work — no sound at all" into the "Repairs needed — the shop sees this" box › left "Rig is OUT OF SERVICE" unchecked › Tap to sign › sign › Save Signature › File checklist for R-102 › confirmation screen "Checklist filed / Repair ticket opened — the shop can see your notes. / The office has the signed point-in-time copy." › Done
taps:        12
wrong_turns: 1, "cycled Horn through both non-check states before picking one, no icon or label said 'repair'/'failed'"
consults:    n/a (arm B)
finished:    yes
confusion:   the three-state toggle for each item (✓ / N/A / —) never says "failed" or "repair needed" anywhere — the hint text above just says "tap anything that's N/A or wasn't done", which reads like it's describing skipped/inspection items, not a broken part. I had to guess that "—" was the right one to pick and that the free-text "Repairs needed" box was what actually raised the flag (the confirmation screen calling it a "Repair ticket" afterwards confirmed I'd guessed right, but I wasn't sure going in).
minutes:     4

Also: the "Done" button on the confirmation modal did not respond to two ordinary clicks (by number and by name) — had to screenshot and tap the exact pixel coordinates to dismiss it. Not sure if that's a real app hitch or just my end, but a person mashing the button with a rock-dusty finger would feel that.

Home now shows "✅ Checklist filed R-102" and a card "R-102: "Horn doesn't work — no sound at all" — with the shop ›" confirming the ticket is visible. Good — that's a nice confirmation loop.

### Task 3 — log the rest of Bench 3 east, one hole wet
expected:    open the drill log, tap each remaining open hole one at a time and type its depth — 17 of them sounded tedious for a phone in a cab.
did:         Home › "🟠 Drill log 13 holes" tile › Drill Log — Bench 3 east screen loaded straight in (no job-picker needed, it already knew which plan) › a first-run tour popped up over the pattern grid ("The drill log... 1/4") right as I went to tap "Select all open" — Skip button also didn't register on first click (see below), had to screenshot+tap-by-pixel to dismiss it › tapped "Select all open (17)" › tapped H-15 once to deselect it from the batch (down to 16 selected, "H-16…H-31") › "Log 16 as planned" › toast "Logged 16 holes as planned" › tapped H-15 (now the lone open hole) › "Log with changes…" — this dropped hole 15 into the single-hole entry box pre-filled (Hole # 15, Depth 32) › tapped "Water" › left the "at ft" and comment fields blank › "Add hole 15 — 32 ft to plan" › header updated to "Pattern: 30 of 31 holes drilled · 1 skipped — plan complete ✓", hole 15 shows "32 ft W" in the log list
taps:        7 (plus 2 wasted on the stuck tour buttons)
wrong_turns: 1, "tour overlay ate my first tap on Select all open, had to skip it first"
consults:    n/a (arm B)
finished:    yes
confusion:   the same click-doesn't-register glitch as the checklist's "Done" button happened again here on the tour's "Skip" — twice in one session now on two different modal/overlay dismiss buttons is enough that I'd flag it as a pattern, not a fluke, even though I can't tell if it's the app or my own connection being spotty out here.
minutes:     5

The bulk "Select all open (N)" plus a single deselect-then-log-with-changes for the odd one out worked well — much faster than I expected for 17 holes. The pattern grid's live count ("13 of 31 holes drilled") made it obvious at a glance that I was making progress and when I was done.

### Task 4 — end-of-day rig hours, sign log complete
expected:    some kind of "finish the day" button on the drill log, with a place for ending hours near the starting-hours field.
did:         on the (still-open) drill log › tapped "Mark Complete" (top) › a "Mark complete" card unfolded in place with "Your signature", "R-102 meter at end of day — optional" (pre-filled 3888, the same starting reading), and an optional note › changed the end-of-day field to 3895 (3888+7) › tapped "Tap to sign" for that card specifically (there were two sign buttons on screen at once — one in the new Mark Complete card, one further down labelled "Driller signature" for the log itself — I picked the top one since it was inside the card I was filling in) › signed › Save Signature — this apparently satisfied BOTH signature slots at once (the lower "Driller signature" section also filled in) › button changed to "Complete" › tapped it › log now reads "complete", a review line appeared ("30 of 31 plan holes drilled / 2 wet — check product suitability at loading / ✓ Every hole drilled to plan.")
taps:        6
wrong_turns: 0
consults:    n/a (arm B)
finished:    partly — the log itself reads complete with the meter reading recorded, but I could not confirm the second half of the "done when": I went looking for "the day's daily report" for Ledgeville Pit today to see the rig's hours shown as "start → end", and there isn't one yet. Work days (mine and everyone's) only lists Tue Sep 8 for Ledgeville Pit; the only "day" for today in the whole app is a different job (Route 3 culvert) that has nothing to do with my rig. The end-of-day field's own helper text says the reading "Goes to the shop's hour ledger and the daily report's equipment hours" — so it's presumably wired up back-end, but as a driller I have no report to look at to confirm it, since no one has started a work day at Ledgeville Pit today. This might be entirely correct behavior (drillers work ahead of the blaster's day), but the task's "done when" isn't independently checkable from where I sit.
confusion:   two "Tap to sign" buttons visible on the same screen at once (one inside the fresh "Mark Complete" card, one further down under "Driller signature") with no visual grouping telling me they were about to become the same signature — I guessed right, but it read like two separate open signature requirements until I acted.
minutes:     3

**Important — found by accident afterward:** later, from the Dashboard, I tapped the "Bench 3 east · Ledgeville Pit — Phase 1" tile again (just checking my work) and it opened a brand-new, empty drill log (0 holes, "open") for the exact same plan and the exact same day, instead of showing me the complete one. My Records now lists TWO "Ledgeville Pit — Phase 1 · Bench 3 east" entries for Wed Sep 9 — one "Complete" and one "Open" — and the Dashboard's progress line started attributing my own 30 drilled holes to "others" ("you 0 · others 30 · 1 open"). The job page's own Drill Plans list shows the plan as "31 of 31 holes drilled ... open" (holes total is right, status is wrong) because of this second log. I did not touch or drill anything into the new empty log — flagging as-is. This looks like a real duplicate-record bug reachable just by revisiting your own finished work from the home screen, not something I went looking for.

### Task 5 — enter my hours for the day
expected:    a timesheet-style entry somewhere under "My hours", expected to just tap in and out times.
did:         Dashboard › "— My hours" tile › inline panel "My hours · today" opened right on the dashboard (no new page) › "Which job?" dropdown, picked "Ledgeville Pit — Phase 1" (where I drilled today) › "Add my card" › a card appeared already suggesting IN 02:10 / OUT 02:15 "from your own records — checklist 02:10 · log signed 02:15" — these are clearly just the times my checklist and log actions happened moments ago in this test, not a real shift, so I overwrote them with a normal shift, 06:00–15:00 › ST auto-computed to "12.8" for a 9-hour window, which is wrong (should be ~8-9) › tapped "Sign" › that opened the signature pad (same as before) › signed, Save Signature › "File card" › toast "Filed Dinis Costa's time card", tile turned "✅ My hours", card shows "Filed · 06:00–15:00 · ST 12.8"
taps:        7
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   the "suggested" IN/OUT times being lifted straight from checklist/log timestamps (here, minutes apart) rather than any real shift start/end was odd — a first-day driller who trusted the suggestion and tapped straight through would file a 5-minute day by mistake. Separately, the ST hours math looks broken: 06:00–15:00 is 9 hours and came out "12.8" (and on the record list, the raw value showed as an un-rounded "12.833333333333334 ST" instead of a clean number) — I don't trust this number and wouldn't expect Barry to either.
minutes:     3

## Findings, ranked

1. **[wrong result] Dashboard "Bench 3 east" tile.** Tapping into an already-completed plan from the Dashboard silently opens a brand-new, empty drill log for the same plan/day instead of the finished one — leaving two log records (one Complete, one Open) for the same plan on the same day in My Records, and making the Dashboard misattribute my own drilled holes to "others". No warning, no "this plan is already logged today, continue anyway?" — just a fresh blank sheet.
2. **[wrong result] Time-card hours math.** A 06:00–15:00 shift (9 hours) computed ST as "12.8" — and on the record list the raw unrounded float "12.833333333333334 ST" leaked straight into the UI. Numbers a crew would actually use for pay should not look like that.
3. **[slow/confusing] Rig checklist condition states.** The per-item toggle only cycles ✓ / N/A / — with no explicit "failed" or "needs repair" state; I had to guess that "—" plus the free-text "Repairs needed" box was the right combination to raise a shop ticket. It worked (confirmed by the "Repair ticket opened" message after filing) but felt like guessing beforehand.
4. **[slow] Two confirmation-modal buttons ("Done" on the checklist file screen, "Skip" on the drill-log tour) did not respond to a normal click by number or by name** — both needed a raw pixel tap from a screenshot to dismiss. Could be my end, but it happened twice on two different modals in one session.
5. **[cosmetic] "My hours" suggested IN/OUT times are pulled from today's checklist/log action timestamps, not a real shift** — fine once you notice, risky if you don't (a rushed driller could file a near-zero-hour day by accepting the suggestion outright).

## What worked

- The rig checklist's starting-hours auto-fill "from the rig's own meter" and the end-of-day field defaulting to the same reading (so I only had to type the delta) — good, low-friction design once found.
- The drill log's "Select all open (N)" plus a quick deselect-and-log-with-changes for the one exception (my wet hole) made logging 17 holes fast — a handful of taps instead of 17 separate entries.
- The live "Pattern: X of Y holes drilled" line and per-hole grid updated immediately after every action — always obvious what was left.
- The rig checklist confirmation screen told me plainly a repair ticket had opened and who'd see it ("the shop can see your notes") — reassuring given I wasn't sure the horn flag had registered as a real repair request.
- Signing once seems to carry across the Mark Complete signature and the log's own driller signature in the same screen — one signature, two slots filled — genuinely saved a step, once I realized that's what had happened.

## What I'd tell Mark

- Watch for duplicate drill logs: if a driller taps back into a plan tile after finishing it, the app opens a second blank log instead of reopening the finished one. That's going to make Bench 3 east show as "open" on the job page even though every hole's drilled — worth telling the crew "once your log says complete, don't tap the plan tile again today."
- Don't trust the auto-suggested clock-in/out times on My Hours — they're pulled from whatever you did in the app a few minutes ago, not your actual start of shift. Always type your real hours.
- The ST (straight time) hours shown on a time card looked mathematically wrong for me (9 hours in, "12.8" out) — I'd get that checked before anyone runs payroll off it.
- The rig checklist doesn't have an explicit "failed" mark for an item — you note it as "—" and write what's wrong in the Repairs box. It does open a real shop ticket (confirmed on screen), just isn't labeled that way up front.

# Dinis Costa — Session record (Arm A, phone)

Account: dinis.a@eval.shotlog.test
Password: Rockdust2026
PIN: 194720

### Task 1 — Open invite, set login, reach home
expected:    I thought I'd tap the link, type a password, and maybe verify my email before getting anywhere — figured there'd be a step where I prove it's really me since I never used a work app before.
did:         Opened invite link › filled password twice › "Create my account" › got dropped straight into "Set a 6-digit PIN" › entered PIN twice (no confirmation dots or masking shown while typing, it just jumped to "Confirm your PIN" after the 6th tap) › landed on "Welcome to ShotLog" tour modal (1/5) › tapped through Next×4 (tour walked me to Drilling, My Records pages along the way) › Done › back to Dashboard via nav.
taps:        13
wrong_turns: 0
consults:    none
finished:    yes
confusion:   "When I was punching in the 6-digit PIN, the screen showed nothing back — no dots filling in, no count of how many digits I'd typed. I expected some feedback like a phone lock screen has, so I wasn't sure if my taps registered until the screen suddenly changed to 'Confirm your PIN'."
minutes:     6

### Task 2 — File rig checklist, note horn repair
expected:    Tap the checklist tile, tick through a list, note the horn as broken somewhere, sign, done. Figured the rig picker would default to whatever I'm drilling with.
did:         Tapped "File rig checklist not filed today" from Dashboard › checklist opened on a "Which rig?" picker showing "R-102 · today's log" and "R1004 · last filed · in shop" › picked R-102 (my drill log said Bench 3 east / R-102 today, even though R1004 is normally my rig — Barry's text said the R1004 leak is already with the shop) › starting hours field was pre-filled 3888 from the meter, left as-is › left job as "Ledgeville Pit — Phase 1" (pre-selected) › tapped "Horn✓" once → became "N/A", tapped again → became "—" (kept this one, since horn isn't N/A, it just failed) › filled "Repairs needed" textbox: "Horn not working - needs repair" › left "OUT OF SERVICE" checkbox unticked › "Tap to sign" › signed › "Save Signature" › "File checklist for R-102" › got a filed summary page ("✓ Checklist filed", "Repair ticket opened — the shop can see your notes") › tried "Done" three times (two clicks + one by number) and all three timed out with no visible dialog or overlay blocking it › gave up on that button and reopened the app at the home URL, which showed the dashboard already updated ("✅Checklist filed R-102" and a line "R-102: 'Horn not working - needs repair' — with the shop ›"), so the filing had gone through even though "Done" never responded.
taps:        13
wrong_turns: 0
consults:    none
finished:    yes
confusion:   "The checklist item cycles ✓ → N/A → — with no label explaining what '—' actually means versus 'N/A' — the only hint was the paragraph above the list saying 'tap anything that's N/A or wasn't done,' so I guessed '—' meant 'wasn't done / failed' and N/A meant 'doesn't apply to this rig.' I filed it not fully sure that was the right one to land on for a broken part."
minutes:     5

### Task 3 — Log remaining planned holes, one wet
expected:    Tap into the plan from the dashboard, then tap each of the ~17 open holes one at a time to log them, would take a while with a dusty screen.
did:         Tapped "Continue drilling" tile on Dashboard › landed straight on the Drill Log for Bench 3 east (13/31 done, H-9 already skipped) › a tour popup ("The drill log — three quick stops") covered the page and its "Skip"/"Next" buttons wouldn't register clicks by text or number (see finding) › used a raw pixel tap on the Skip button's coordinates from a screenshot, which worked › back on the log, saw "Select all open (17)" › tapped it, selected all 17 open holes at once › tapped H-15 again to deselect it (kept it out so I could log it separately as wet) › now "16 selected" › tapped "Log 16 as planned" — instantly logged H-16–H-31 at their planned depth › selected the leftover H-15 › tapped "Log with changes…" instead of "Log 1 as planned" so I could set a condition › form opened pre-filled Hole 15 / depth 32 › tapped "Water" chip → showed an "at ft" field and a note box, left both blank › "Add hole 15 — 32 ft to plan" › header changed to "Pattern: 30 of 31 holes drilled · 1 skipped — plan complete ✓".
taps:        8
wrong_turns: 1 (two dead clicks on "Skip" before switching to a raw tap)
consults:    none
finished:    yes
confusion:   "The tour overlay's own Skip/Next buttons didn't respond to a normal click — I only got through by screenshotting and tapping raw pixel coordinates. If I were actually holding a phone I'd have just tapped it fine with a finger, so this might be a quirk of how I'm interacting rather than the app, but it cost me two dead taps before I worked around it."
minutes:     6

### Task 4 — End-of-day hours + sign log complete
expected:    Some "mark complete" button that asks for an end-of-day meter reading and a signature together in one step.
did:         From the finished drill log, tapped the bottom "Mark complete · 31 holes" button (the same-named button up top, "Mark Complete", is a different one I didn't use) › a "Mark complete" card opened above the signature area with "R-102 meter at end of day — optional" pre-filled 3888 (the morning reading) and an optional note field › cleared it and filled 3895 (3888+7) › tried "Tap to sign" first — three clicks (by text, by number, then a coordinate tap) all timed out with no dialog, so instead tapped "Complete" inside the Mark-complete card › the log status flipped to "complete" immediately WITHOUT a signature — the "Driller signature" row underneath still showed an empty "Tap to sign" button and a note "✓ Marked complete — the blaster reviews it from the day" › tapped "Tap to sign" again and this time it worked (opened the pad) › signed › "Save Signature" › signature now shows as an image next to "Driller signature — Dinis Costa", log still reads "complete". Checked "My records" and the Drilling tab for a "daily report" showing R-102's hours start→end, but nothing under my logins shows a daily report — only my own drill log and rig checklist documents. I could not personally confirm the hours appear on the office/blaster's daily report.
taps:        7
wrong_turns: 1 (three dead "Tap to sign" clicks before it worked, right after marking complete)
consults:    none
finished:    partly (hours entered, log signed and complete; could not verify the daily report step since drillers don't seem to have a view of it)
confusion:   "The log went to 'complete' status the moment I tapped 'Complete' on the hours card — before I'd signed anything. The page even said '✓ Marked complete' while the signature button still read 'Tap to sign,' unsigned. I expected completing and signing to be the same action, or at least that it wouldn't let me finish without a signature."
minutes:     6

### Task 5 — Enter my hours for the day
expected:    Some kind of clock-in/clock-out or a simple start/end time entry tied to today.
did:         Tapped the "— My hours" tile on Dashboard › "Which job?" dropdown appeared with TWO identically-named options, "Ledgeville Pit — Phase 1" listed twice with different underlying values (plus "Route 3 culvert") — picked the first one, no way from the label alone to tell which was "correct" › "Add my card" › a time card appeared already pre-filled IN 00:25 / OUT 00:30 with a note "Suggested from your own records — checklist 00:25 · log signed 00:30" — these were clearly just the wall-clock timestamps of when I filed the checklist and signed the drill log a few minutes ago in this session, not a real shift (would read as garbage on a real 8-hour shift) › overwrote IN with 07:00 and OUT with 15:30 › ST auto-computed to 8.5 › tapped "Sign" (button label first read "Sign", after tapping once it changed to "Tap to sign" without opening the pad — needed a second tap) › second tap opened the pad › signed › "Save Signature" › "File card" › toast "Filed Dinis Costa's time card", card now reads "Filed — 07:00–15:30 · ST 8.5". Confirmed on My records: "Time Card — Dinis Costa · Wed, Sep 9, 2026 · Ledgeville Pit — Phase 1 · Filed, awaiting approval" now listed under today's 3 documents.
taps:        9
wrong_turns: 1 (picked one of two identical-looking job options with no way to tell them apart)
consults:    none
finished:    yes
confusion:   "The job dropdown listed 'Ledgeville Pit — Phase 1' twice. I had no way to tell which one was the job I'd actually been drilling at all day — I just picked the first and hoped. If these are two different job records with the same display name, that's a real risk of hours landing on the wrong job."
minutes:     4

## Findings, ranked

1. **wrong result** — Drill log "Mark complete" flow: tapping "Complete" on the end-of-day-hours card marks the log **complete immediately, before the driller signature is captured**. The page then shows both "✓ Marked complete" and an unsigned "Tap to sign" button at the same time. A driller could easily walk away thinking they're done, leaving an unsigned "complete" log on file. *What would help:* don't allow "complete" status until the signature exists, or fold the signature into the same "Complete" action.
2. **wrong result** — The "Which job?" picker on the hours/time-card screen listed "Ledgeville Pit — Phase 1" **twice** (different underlying option values) plus "Route 3 culvert" once. Nothing in the label — no job number, no address, no "(2)" — distinguishes the two. Picking wrong would silently put a day's hours on the wrong job record with no way for a driller to catch it. *What would help:* de-duplicate the list, or append a distinguishing token (job #, address) when two names collide.
3. **blocked** — Rig checklist filed page, "Done" button: three separate attempts (by text, by number, and after a screenshot) all timed out with no visible dialog or overlay in the accessibility tree. The filing itself had gone through fine — it's the exit button that's dead. Had to leave via re-opening the home URL. *What would help:* investigate why this button becomes unclickable right after the success state renders; same symptom recurred at the tour's Skip/Next (Task 3) and the drill log's own Tap-to-sign right after Mark Complete (Task 4) — feels like one underlying pattern (a just-rendered element not yet hit-testable) rather than three separate bugs.
4. **cosmetic** — Rig checklist filed (point-in-time) copy shows "Starting hours: —" even though 3888 was entered on the form and came from the meter. The number a driller actually typed doesn't appear on the record "the office has."
5. **wrong result?** — Checklist item status cycles ✓ → N/A → — with no on-screen label for what each state means. I inferred "—" = failed/not done and "N/A" = doesn't apply, from the instruction paragraph above the list, not from the control itself. Guessing wrong here matters — this is how a real defect (a dead horn) gets recorded.
6. **cosmetic** — Could not find any "daily report" view in my own navigation (Dashboard, Drilling, Work days, My records) to confirm the rig's start→end hours actually reached it, as Task 4 asked me to check. If drillers are meant to be able to see this, I couldn't find where; if it's blaster/office-only, a driller has no way to know the number they entered landed correctly.
7. **cosmetic** — PIN entry screen (`Set a 6-digit PIN` / `Confirm your PIN`) gives no visual feedback — no dots, no count — as digits are entered. On a dusty phone screen in a truck cab, not knowing if a tap registered is disorienting.
8. **cosmetic** — The onboarding tour drove real navigation (Dashboard → Drilling → My Records) as I tapped "Next," rather than staying a passive overlay. Not wrong, just worth knowing — the URL changes under you.

## What worked

- The invite link went straight to a "Welcome, Dinis Costa" screen with my email pre-filled (disabled field) — no confusion about who I was signing up as.
- The "Create my account" button stayed disabled until both password fields were filled, so there was no way to submit half-done.
- After creating the account it explained in plain language what was coming next ("Setting up this device — next you'll pick a quick unlock PIN") instead of just silently redirecting.
- The final "Welcome, Dinis" screen (before the tour) told me in one line what my three tiles are and why (works with no signal), which matched what I saw on the actual dashboard.
- The rig checklist's "Which rig?" picker made the choice for me obvious ("R-102 · today's log" vs "R1004 · last filed · in shop") — I didn't have to guess which rig I was on.
- "Select all open (N)" plus deselecting one hole was a fast way to bulk-log a whole pattern and still hand-treat the one wet hole — once I found it, that part of the drill log was genuinely quick for a big row of holes.
- The hours/time-card screen tried to save me typing by suggesting IN/OUT from my own checklist and signature timestamps — a nice idea, even though on this test day the numbers themselves were nonsense (see confusion in Task 5).
- Filed documents (checklist, drill log, time card) all showed up promptly and correctly under My records, grouped by date, with clear status chips (Filed / Complete / Filed, awaiting approval).

## What I'd tell Mark

- Watch the "Mark complete" button on drill logs — right now it lets a log go to "complete" status with no signature yet. If a driller taps Complete and walks off, you could end up with an unsigned complete log and not notice.
- The hours screen showed two identical "Ledgeville Pit — Phase 1" entries in the job picker for me — worth checking whether that's a real duplicate job record before the whole crew starts logging hours against it.
- Otherwise the day-to-day flow (checklist → drill log → hours) was learnable without help: I only opened the guide zero times all day, everything was findable by exploring the screen itself.

## Guide pages

- None opened — never got stuck badly enough to need the help guide across all 5 tasks. The confusions I hit (button timeouts, ambiguous states) weren't things a guide page would have explained; they needed the app itself to behave differently.

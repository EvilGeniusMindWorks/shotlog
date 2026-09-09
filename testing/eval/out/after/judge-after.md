# ShotLog Eval — After Judge's Report (S9a)

**Date:** 2026-09-09
**Judge model:** claude-sonnet-4-6
**Re-run roles:** Dinis (driller, phone) · Sam (shop, wide)
**Arms:** A (with guide) · B (no guide)
**Run duration:** ~14 minutes end to end (both roles, both arms in parallel)

Read run-notes.md first. One run artifact to discount throughout: the snapshot seeded "Ledgeville Pit — Phase 1" on top of a job that already existed, so Dinis saw that name twice in the time-card picker — the duplication is the run's fault, not the product's.

---

## 1. Per Role, Per Task

### Dinis — driller, phone

The after brief covers the second sitting only (the coordinator enrolled Dinis and seeded the week by API). Task numbers here match the after brief (checklist=2, finish holes=3, mark complete=4, time card=5). The enrollment task (1) was completed in the enrol sitting; findings from that sitting feed this comparison where noted.

---

#### Task 1 — Enroll, PIN, home

| | Arm A | Arm B |
|---|---|---|
| **Before** | 14 taps · 1 wrong turn (apostrophe in "Let's go" blocked text click) | em-dash prefix on home tile blocked click; PIN 7-press artifact |
| **After** | 13 taps · 0 wrong turns | 14 taps · 0 wrong turns |
| **Finished?** | yes | yes |
| **Fixed?** | Yes — "Let's go" now matches without coordinate workaround | Yes — enrollment flow "was fully linear, one thing at a time" (B) |

A-dinis after: "When I was punching in the 6-digit PIN, the screen showed nothing back — no dots filling in, no count of how many digits I'd typed."

B-dinis after: "the flow was linear and each screen told me exactly what to do next" — zero confusion flagged.

**Verdict:** Enrollment friction dropped to zero wrong turns in both arms. The apostrophe fix in "Let's go" is confirmed real. PIN entry still gives no dot feedback while typing, which both agents flagged as a cosmetic risk on a real dusty phone, but it no longer blocks completion.

---

#### Task 2 — Rig checklist, horn repair, file

| | Arm A before | Arm A after | Arm B before | Arm B after |
|---|---|---|---|---|
| **Taps** | 28 | 13 | 13 | 22 |
| **Wrong turns** | 3 (✓ unicode; two wrong-row hits) | 0 | 3 (em-dash; horn cycle) | 1 (horn cycle) |
| **Finished?** | yes | yes | yes | yes |
| **Failed ops** | many (unicode mismatch, coordinate misses) | 4 (Done button × 3, fill label mismatch × 1) | — | 5 (Done button × 4, one HornN/A ref) |

New issue in both after arms: the "Done" button on the checklist filed-receipt page timed out every attempt.

A-dinis after: "tried 'Done' three times (two clicks + one by number) and all three timed out with no visible dialog or overlay blocking it — gave up and reopened the app at the home URL."

B-dinis after: "Tried to tap 'Done' on the receipt four times, each one timed out with no error message — gave up and reopened http://localhost:5199 directly."

New issue in both after arms: starting hours pre-fill not saved.

B-dinis after: "a pre-filled number field (3888, matching the meter) is NOT saved unless you retype it — the filed checklist showed 'Starting hours: —' even though the field visibly held 3888 the whole time I was on the form."

A-dinis after: confirmed the same — "Starting hours: —" on the filed record despite the field showing 3888 throughout.

Horn cycle (✓ → N/A → —) label confusion persists in both arms. B-dinis after: "I inferred '—' = failed/not done and 'N/A' = doesn't apply, from the instruction paragraph above the list, not from the control itself."

**Verdict:** Wrong-turn count improved sharply (checklist interaction itself now clean, especially in arm A which had 3 wrong turns before). But two new issues emerged: the "Done" button on the success screen is dead in both arms (workaround: reopen home URL), and the pre-filled starting-hours value silently doesn't submit. The horn cycle label ambiguity is unchanged.

---

#### Task 3 — Finish remaining 17 planned holes, one wet

| | Arm A after | Arm B after |
|---|---|---|
| **Taps** | 8 | 9 |
| **Wrong turns** | 1 (tour overlay — Skip timed out) | 1 (tour overlay — Skip timed out) |
| **Finished?** | yes | yes |

The first run's equivalent tasks (logging 6 holes from scratch, one row at a time) took many more taps and produced findings about "Log with changes…" label ambiguity. Both after agents went straight to bulk "Select all open (N)" and cleaned up in 2 taps after dismissing the tour.

A-dinis after: "The tour overlay's own Skip/Next buttons didn't respond to a normal click — I only got through by screenshotting and tapping raw pixel coordinates."

B-dinis after: "every 'click Skip' attempt returned 'Timeout 6000ms exceeded' with no visible error on screen, so I had to fall back to a screenshot and a raw pixel tap to get past it. If I hadn't known the pixel-tap escape hatch this task would have stalled completely on a 'help' feature I didn't even want."

The tour overlay Skip/Next timeout was present in the first run too (noted in run-notes as a persistent environment artifact). It recurs identically in the after run.

**Verdict:** Bulk logging is fast and well-discovered. The only friction is the tour overlay, which blocks by the same mechanism every time.

---

#### Task 4 — End-of-day hours, sign log complete

| | Arm A after | Arm B after |
|---|---|---|
| **Taps** | 7 | 6 |
| **Wrong turns** | 1 | 1 |
| **Finished?** | partly | partly |

First-run equivalent (A): task failed — no entry point for ending meter hours was found after checking three screens (drill log rig dropdown, equipment Hour Ledger, time card). S9a added the "R-102 meter at end of day" field inside the "Mark complete" card. Both after agents found and filled it.

A-dinis after wrong turn: mark complete fired before signature.

A-dinis after: "The log went to 'complete' status the moment I tapped 'Complete' on the hours card — before I'd signed anything. The page even said '✓ Marked complete' while the signature button still read 'Tap to sign,' unsigned. I expected completing and signing to be the same action, or at least that it wouldn't let me finish without a signature."

B-dinis after found the same card but signed FIRST, then marked complete, and avoided that trap. B then discovered the pre-fill trap:

B-dinis after: "after task 2's find [starting hours not saving], so I explicitly typed 3895 (3888 + 7) into it — and confirmed later via the rig's own Hour Ledger: top line '3,895 hrs · from the latest entry'. To check the hours actually landed, I went to the rig's own page (via 'rig history' link) and read its Hour Ledger. My task-2 suspicion: pre-filled number fields need to be retyped to register."

Neither arm could find the daily report showing rig hours start → end from a driller's view. B-dinis after: "Work Days (mine or everyone's) has no entry for Ledgeville Pit today — only one for Route 3 culvert. The drill log itself said 'the blaster reviews it from the day,' implying that daily report lives on Barry's side, not mine."

**Verdict:** End-of-day hours now have an entry point (fixed). Both agents entered the reading. However, the pre-filled value doesn't commit unless retyped (same bug as starting hours), and the mark-complete-before-signature ordering in arm A produced a technically "complete" but unsigned log. The daily-report-not-visible-to-driller finding is unchanged.

---

#### Task 5 — Time card

| | Arm A after | Arm B after |
|---|---|---|
| **Taps** | 9 | 9 |
| **Wrong turns** | 1 | 1 |
| **Finished?** | yes | yes |

Both arms: duplicate "Ledgeville Pit — Phase 1" in job picker — **run artifact**, discount per coordinator note.

Both arms: ST momentarily calculated wrong.

B-dinis after: "ST briefly showed '14.6' instead of the correct '8.0'; it only self-corrected after I edited the OUT field a second time. A driller who fills the times once and immediately taps 'File card' could sign and submit a wrong total without any warning."

A-dinis after: "Sign" button needed two taps before pad opened — one tap changed label from "Sign" to "Tap to sign" without opening the pad.

**Verdict:** Time card completed in both arms. ST recalculation glitch is real and risky. The label-change-without-action on "Sign" is a minor extra tap.

---

### Sam — shop mechanic, wide screen

---

#### Task 1 — Enroll, PIN, home

Both arms: enrollment clean, linear, 8-9 taps, zero wrong turns (after). Same result as first run. No change, no regression.

---

#### Task 2 — Resolve hydraulic-leak ticket, rig back to Active

| | Arm A before | Arm A after | Arm B before | Arm B after |
|---|---|---|---|---|
| **Taps** | 38 | 4 | 38 | 3 |
| **Wrong turns** | 5 | 1 | 7 | 0 |
| **Finished?** | partly (no resolve UI) | yes | no (no resolve UI) | yes |
| **Minutes** | ~30 | 2 | ~35 | 2 |
| **Guide consulted?** | yes (guide accurate, UI absent) | no | n/a | n/a |

This was the most severe finding in the first run. `resolveTicket()` had no caller after S8b removed the repair queue from the admin page. The help guide described a flow that did not exist, which misled arm A's Sam directly.

A-sam after: "clicked R1004 ticket in worklist › fill 'What was done' = 'boom cylinder seal replaced' › Mark resolved" — 4 taps, 2 minutes. Landed on R1004 machine page showing green Active pill with history row confirming Sam's note.

B-sam after: same pattern, 3 taps, 2 minutes. "Same pattern as task 2, easy the second time" (for task 3 on R-102).

The one wrong turn in arm A was not the ticket resolve at all — it was the "Welcome to ShotLog" walkthrough overlay appearing on top of the worklist after the initial welcome, silently eating the first click.

A-sam after: "clicked the ticket row and the tap silently failed (ERROR: Timeout) — the walkthrough popup covering the page was not obvious from the accessibility snapshot text alone."

B-sam after: "a Welcome tour overlay ('1/5, Skip/Next') popped over the worklist right after landing on Shop and ate my first click as a timeout; had to Skip it before anything underneath was clickable."

**Verdict:** The ticket-resolve regression is fully fixed. Both arms went from ~35 minutes and a total block to 2-4 taps and 2 minutes. This is the single largest improvement in the after run.

---

#### Task 3 — Resolve horn ticket, R-102

Both after arms completed this in 2-3 taps, zero wrong turns, under 1 minute. No equivalent existed in the first run (horn ticket for R-102 was not resolvable before). Both arms noted that the R-102 ticket screen told them upfront "The machine stays in service either way," which A-sam compared favorably against the R1004 screen which only mentioned the consequence mid-form.

A-sam after: "a nice bit of reassurance I didn't get on the more consequential ticket until after I acted."

---

#### Task 4 — Correct R1004 hour meter to 4,231

Both arms: clean in 4-8 taps, zero wrong turns. "Correct hours" button found immediately on machine page, toast confirmed value. This worked in the first run too — no change, no regression.

---

#### Task 5 — Log engine service at 4,231 h

| | Arm A before | Arm A after | Arm B before | Arm B after |
|---|---|---|---|---|
| **Taps** | 12 | 4 | 12 | 3 |
| **Wrong turns** | 3 (save → sync panel; combobox no label; At hours decrement) | 1 | 2 (combobox no label; save → sync panel) | 0 |
| **Finished?** | yes | yes | yes | yes |

The "Save" button opening the sync panel instead of the form: no longer mentioned in either after arm. Appears fixed.

The service combobox accessible-label issue: A-sam after found a workaround via Tab; B-sam after found Tab auto-selected the first real option. Neither used the `select` command directly — both worked around the same way. The underlying label is still missing.

The pre-filled "At hours" not committing remains in both arms.

A-sam after: "Save was greyed out with everything already filled in correctly — looked like a bug, not a validation state, since nothing on screen said a field needed re-entry."

B-sam after: "At hours showed 4231 pre-filled (matching the current meter reading) but Save was disabled — I had to notice and retype the same number into the field before it would accept. Looks like a display value that isn't actually registered as form state."

**Verdict:** The Save→sync-panel collision is gone. The combobox label is still missing but workable. The pre-filled value trap is unchanged and now confirmed as the same root issue as the Dinis hour-fields (pre-filled values not committed to form state).

---

#### Task 6 — Find where R1004 last worked

Both arms: clean in 1-2 taps. History section or Locator page each answered in one glance. No change from first run.

---

#### Task 7 — Fleet: everything unavailable in one view

| | Arm A before | Arm A after | Arm B before | Arm B after |
|---|---|---|---|---|
| **Taps** | 5 | 1 | 5 | 1 |
| **Wrong turns** | 1 (AND not OR → zero results) | 0 | 1 (AND not OR → zero results) | 0 |
| **Finished?** | partly | yes | partly | yes |

First run: both arms clicked "In shop" + "Out of service" expecting OR, got zero results (AND logic), needed two separate filtered views and mental combination.

After: both arms tapped the new "Unavailable" chip — one tap, done.

A-sam after: "one chip already meant 'in shop OR out of service' so I didn't have to combine two filters myself."

B-sam after: "'Unavailable' as a single filter that folds together 'in shop' and 'out of service' was exactly the one-view ask, and it sat right next to the two separate filters so I could see it was the combined one."

**Verdict:** The filter logic fix is working and immediately discoverable.

---

## 2. What Is Still Confusing — Ranked, With Quotes

### 1. Pre-filled number fields look set but don't submit (three screens, both roles)

The same root bug appears on: rig checklist starting hours, drill log end-of-day meter inside the Mark Complete card, and Log a Service Done "At hours". In all three places a number appears in the field, the agent leaves it untouched, and the saved record either shows "—" or the Save button stays disabled.

B-dinis (Task 2): "I never touched it because it already looked filled in, so it seems the pre-filled number doesn't count unless you retype it."

B-sam (Task 5): "At hours showed 4231 pre-filled but Save was disabled — I had to notice and retype the same number into the field before it would accept. Looks like a display value that isn't actually registered as form state."

A-sam (Task 5): "looked exactly like a stuck/broken button, not a validation state — nothing on screen hints that a pre-filled field still needs to be re-entered."

This is the most consistent wrong-result risk across the after run: every agent in every arm hit it on at least one screen.

### 2. Tour overlay (Skip/Next) silently blocks all taps underneath it

The "The drill log — three quick stops" tour overlay and the second "Welcome to ShotLog" (1/5) walkthrough both appeared mid-task. Their Skip/Next buttons registered in the accessibility tree but timed out on every click attempt. Agents needed screenshot + pixel coordinates or the Tab key to escape. A real phone user has no escape hatch.

B-dinis (Task 3): "the onboarding tour that appeared over the drill-log grid was unclickable by name or number — every 'click Skip' attempt returned 'Timeout 6000ms exceeded' with no visible error on screen, so I had to fall back to a screenshot and a raw pixel tap to get past it. If I hadn't known the pixel-tap escape hatch this task would have stalled completely on a 'help' feature I didn't even want."

A-sam (Task 2): "clicked the ticket row and the tap silently failed (ERROR: Timeout) — the walkthrough popup covering the page was not obvious from the accessibility snapshot text alone."

B-sam (Task 2): tour overlay "ate my first click as a timeout; had to Skip it before anything underneath was clickable. Not the help guide, just in the way."

### 3. Mark Complete fires before the driller signature is captured

A-dinis (Task 4) tapped "Complete" on the end-of-day-hours card. The log immediately flipped to "complete" status. The page then showed "✓ Marked complete" alongside an unsigned "Tap to sign" button at the same time.

A-dinis (Task 4): "The log went to 'complete' status the moment I tapped 'Complete' on the hours card — before I'd signed anything. The page even said '✓ Marked complete' while the signature button still read 'Tap to sign,' unsigned. I expected completing and signing to be the same action, or at least that it wouldn't let me finish without a signature."

Arm B avoided this because B signed before tapping Mark Complete, but the flow does not enforce that order or prompt for it. A driller who taps Complete first (the more natural order given the button's position below the hours card) produces a complete-but-unsigned record with no warning.

---

## 3. What S9a Broke or Made Worse

**"Done" button on checklist filed-receipt page — new in both Dinis arms.** The first run's checklist task for Dinis (R1004, OOS) did not surface a dead "Done" button on the receipt page. The after run's checklist task (R-102, in service) consistently hit this in both arms, with each agent needing to abandon the button and reopen the home URL. This is likely a new timing regression — the success-state render leaves the button temporarily (or permanently) outside the hit-test region. The same symptom occurs on the drill-log tour's Skip and on "Tap to sign" immediately after marking complete, suggesting a shared mechanism: a just-rendered element that has not yet become hit-testable.

A-dinis (Task 2): "three separate attempts (by text, by number, and after a screenshot) all timed out with no visible dialog or overlay in the accessibility tree."

**"Starting hours" pre-fill regression — new or more visible.** The first run's A-dinis checklist task (28 taps, coordinate misses) obscured whether starting hours saved; the after run makes it unambiguous: the pre-filled value displays throughout the form but produces "Starting hours: —" on the filed record. This is the same root cause as the service-log At-hours bug, but the checklist instance is newly confirmed.

**Second "Welcome to ShotLog" walkthrough overlay appearing in Sam's shop mid-session.** In the first run Sam's agents dealt with the initial enrollment tour, but the second 1/5 walkthrough appearing after the onboarding checklist was not a first-run finding. Both after-run Sam agents hit it on their first worklist tap. It may be that S9a's shop onboarding changes introduced a second trigger for this overlay.

---

## 4. Verdict

S9a batches 1 and 3 fixed the two worst failures the first run found for these roles. The ticket-resolve regression — a complete blocker for Sam that required 35+ minutes, multiple wrong turns, and ultimately failed in both arms — is gone: both after-run Sam agents resolved tickets in under 4 taps and 2 minutes without touching the help guide. The fleet filter gained an "Unavailable" chip that answered the "show me everything down" question in one tap instead of requiring two separate filtered views and mental combination. For Dinis, the end-of-day meter hours now have an entry point (inside the Mark Complete card), fixing a task that failed entirely in the first run. Enrollment apostrophe friction dropped to zero wrong turns in both arms. What remains are four items worth addressing before the crew leans on this daily: the pre-filled-number-not-committed bug is now reproducible on three separate screens across both roles and produces silent wrong results; the "Done" button on the checklist receipt is dead in both arms with no on-screen explanation; the tour overlay Skip/Next button blocks underlying taps silently with no escape for a real phone user; and the Mark Complete flow lets a drill log reach "complete" status before a driller signature exists, which a blaster-reviewer would not catch until the record is already locked. The product is materially better for both roles than it was at first run; those four items are what stands between "better" and "ready."

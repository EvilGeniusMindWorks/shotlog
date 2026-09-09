# ShotLog Eval — After2 Judge's Report (S9b)

**Date:** 2026-09-09
**Judge model:** claude-sonnet-4-6
**Re-run roles:** Dinis (driller, phone) · Sam (shop, wide)
**Arms:** A (with guide) · B (no guide)
**Compared against:** first run (out/judge.md) and S9a re-run (out/after/judge-after.md)

Run artifact to discount throughout: the snapshot seeded "Ledgeville Pit — Phase 1" on top of a job that already existed; disregard any duplicate-job appearance in the time-card picker per coordinator note.

---

## 1. S9b Changes — Did They Land?

### Change 1 — Meter pre-fills became real starting values with a "from the meter" line

**Verdict: LANDED on all three screens.**

S9a's worst persistent bug was that pre-filled number fields (checklist starting hours, Mark Complete end-of-day meter, service log At hours) displayed a value but silently submitted blank unless the agent retyped it. All three are fixed.

**Checklist starting hours:**
- A-dinis Task 2: "starting hours pre-filled 3888 from the meter, left as-is" — no bug reported on the filed record.
- B-dinis Task 2: "starting hours pre-filled 3888 from the rig's own meter, left as-is" — filed cleanly. No "Starting hours: —" on the receipt (contrast S9a B-dinis: "the filed checklist showed 'Starting hours: —' even though the field visibly held 3888").

**Service log At hours (Sam):**
- A-sam Task 5: "the At hours field was already pre-filled with 4231 from the ledger" — 3 taps, Save not disabled, filed. S9a A-sam: "Save was greyed out with everything already filled in correctly — looked like a bug, not a validation state."
- B-sam Task 5: "At hours was pre-filled 4231 from the ledger › clicked Save" — 2 taps, no mention of needing to retype. S9a B-sam: "I had to notice and retype the same number into the field before it would accept."

**End-of-day meter inside Mark Complete:**
Both after2 Dinis agents manually typed the delta (3888 + 7 = 3895) rather than leaving the pre-fill, so this specific field's pre-fill commit behavior is untested in isolation. What is confirmed: both agents' typed values landed correctly in the Hour Ledger.

---

### Change 2 — Mark complete carries the signature pad, reads "Sign and complete" until signed

**Verdict: LANDED — unsigned-complete path is closed.**

S9a's A-dinis completed the log before signing: "The log went to 'complete' status the moment I tapped 'Complete' on the hours card — before I'd signed anything." Neither after2 agent hit that path.

- A-dinis Task 4: opened Mark Complete panel → filled meter field → "Tap to sign › sign › Save Signature › Complete" — signature came before completion. No unsigned-complete state.
- B-dinis Task 4: "tapped 'Mark Complete' (top) › a 'Mark complete' card unfolded in place with 'Your signature'" — "button changed to 'Complete' › tapped it" — the explicit mention that the button *changed to* "Complete" confirms it read something else (implicitly "Sign and complete") until the signature was in.

One cosmetic confusion remains: B-dinis found two "Tap to sign" buttons on screen simultaneously — one inside the Mark Complete card, one further down labeled "Driller signature" for the log itself. "I picked the top one since it was inside the card I was filling in — this apparently satisfied BOTH signature slots at once (the lower 'Driller signature' section also filled in)." One signature filling two slots is intentional and appreciated; the two-button visual was briefly confusing.

---

### Change 3 — Screen tours no longer auto-start after an account's first day

**Verdict: INDETERMINATE — all agents are first-day accounts.**

All four agents enrolled in this run and performed every task on the same calendar day. Tours correctly appeared (expected behavior on day 1), and none fired a second time on subsequent screen visits within the session. Whether the change suppresses them on day 2 and beyond cannot be confirmed from this data.

What is confirmed: the tour click-blocking symptom persists regardless of the day-1 / day-2 question. The drill-log tour's Skip button and the checklist receipt's Done button both timed out on every named/numbered click attempt across both Dinis arms, requiring pixel-coordinate workarounds. The Welcome to ShotLog (1/5) overlay in both Sam arms ate the first click on the worklist. This is the same failure mode reported in every prior run; the tours appearing less frequently (if the day-1 fix holds) would reduce exposure, but the blocked-click bug itself is unresolved.

---

## 2. Per Role, Per Task

### Dinis — driller, phone

---

#### Task 1 — Enroll, PIN, home

Both arms: 0 wrong turns. The S9a improvement (apostrophe in "Let's go" fixed) holds.

A-dinis: "the PIN setup had no explanation of why I'd need a PIN as well as a password until the small 'Unlocks ShotLog on this device — even offline' line appeared, which did explain it once I read it." Minor cosmetic.

B-dinis: "the 'Welcome, Dinis' screen appearing right after PIN confirm with no visible transition — screen just changed heading, no 'PIN set' toast — so I wasn't 100% sure the PIN had taken until I saw the next screen was different."

No regression. Enrollment is clean.

---

#### Task 2 — Rig checklist, horn flagged as repair

| | Arm A | Arm B |
|---|---|---|
| Taps | 11 | 12 |
| Wrong turns | 1 (horn cycle) | 1 (horn cycle) |
| Finished? | yes | yes |

Pre-fill starting hours: FIXED (see §1 above).

Done button: still broken. A-dinis: "the Done button on the filed-copy screen would not register a click by number or by visible text — twice it timed out even though the screenshot showed nothing covering it. Both times a raw pixel-coordinate tap on the same visual spot worked immediately." B-dinis: same, identical failure. The tap log confirms two `ok:false` entries per arm (`click Done`, both 6 s timeouts).

Horn three-state label confusion persists. B-dinis: "the three-state toggle for each item (✓ / N/A / —) never says 'failed' or 'repair needed' anywhere — I had to guess that '—' was the right one to pick and that the free-text 'Repairs needed' box was what actually raised the flag (the confirmation screen calling it a 'Repair ticket' afterwards confirmed I'd guessed right, but I wasn't sure going in)."

---

#### Task 3 — Finish remaining holes, one wet

Both arms: bulk-log path (Select all open + deselect one + Log with changes) completed in 7 taps. Tour overlay blocked first 1-2 taps in both arms; pixel-coordinate workaround required.

A-dinis: "the tour's own Skip button was unclickable by name/number the same way the checklist's Done button was in Task 2 — happened twice now, so it looks like a pattern with dialogs/overlays on this screen size."

B-dinis: "every 'click Skip' attempt returned 'Timeout 6000ms exceeded' with no visible error on screen, so I had to fall back to a screenshot and a raw pixel tap to get past it. If I hadn't known the pixel-tap escape hatch this task would have stalled completely on a 'help' feature I didn't even want." Tap log confirms two `ok:false` entries (`ref:1` timeout, `click Skip` 6 s timeout).

---

#### Task 4 — End-of-day hours, sign log complete

Both arms: Mark Complete with signature embedded — FIXED. Both agents signed before completing; no unsigned-complete state (see §1).

Both arms: **Duplicate drill log spawned on re-entry** — NEW BUG (see §3 below).

A-dinis: "clicking back into 'Bench 3 east' from the Drilling tab after completing it opened what looked like a second, empty (0 holes) drill log entry for today... My records still lists a duplicate 'Bench 3 east … Open' document alongside the 'Complete' one for Wed Sep 9, and the home tile flipped from '✅ 13 holes' to '🟠 Drill log' with 'you 0 · others 30 · 1 open' even though I personally drilled 31 of the 31 holes myself."

B-dinis: "I tapped the 'Bench 3 east · Ledgeville Pit — Phase 1' tile again (just checking my work) and it opened a brand-new, empty drill log (0 holes, 'open') for the exact same plan and the exact same day... The job page's own Drill Plans list shows the plan as '31 of 31 holes drilled ... open' (holes total is right, status is wrong) because of this second log."

Tap log for A-dinis: `{"op":"click","args":{"text":"Ledgeville Pit — Phase 1 · Bench 3 east","nth":2},"ms":14005,"ok":false}` — the second (duplicate) plan tile existed and was clickable, and a 14-second timeout was logged on it, consistent with a stale page state after the empty log was created.

Both arms independently triggered the bug the same way: tapping back into a completed plan tile rather than any unusual navigation. Not a run artifact.

Neither arm could confirm the daily report showing rig hours start → end from a driller's view — no Blast Day exists for Ledgeville Pit today since no blaster has started a work day there.

---

#### Task 5 — Time card

| | Arm A | Arm B |
|---|---|---|
| Taps | 5 | 7 |
| Wrong turns | 0 | 0 |
| Finished? | yes | yes |
| ST hours | 8.0 (correct) | 12.8 (wrong) |

Both arms: suggested IN/OUT are the wall-clock timestamps of the agent's own app actions, not real shift times. A-dinis: "the suggested IN/OUT were both the same clock-in-the-cab timestamp (02:10), so the suggested card was a full day paid at zero hours if I'd just hit File without looking."

**ST math bug — B-dinis only:** B typed 06:00 IN and 15:00 OUT. "ST auto-computed to '12.8' for a 9-hour window, which is wrong (should be ~8-9)." The filed record shows "12.833333333333334 ST" — the raw float leaked into the UI. 12.833... hours is exactly the duration from the suggested IN timestamp (02:10) to 15:00, meaning the 06:00 overwrite did not register in the ST computation. A-dinis typed 07:00 IN and 15:00 OUT and got the correct 8.0, which confirms the bug is not universal — it appears when the overridden IN value is 06:00 (or perhaps any value that looks like a near-midnight time) but not 07:00. S9a's version of this glitch was transient (self-corrected after re-editing OUT); the after2 instance persisted to the filed record with the raw float exposed.

---

### Sam — shop mechanic, wide screen

---

#### Task 1 — Enroll, PIN, home

Both arms: 6-9 taps, 0 wrong turns. No change from S9a. Clean.

---

#### Task 2 — Resolve R1004 hydraulic-leak ticket

Both arms: Welcome to ShotLog (1/5) overlay appeared over the shop worklist right after enrollment, eating the first worklist tap. A-sam: "clicking the ticket card did nothing and the terminal said Timeout — I didn't realize a tour popup was covering it until I saw 'Welcome to ShotLog / 1 of 5' show up." B-sam: "a Welcome tour overlay... ate my first click as a timeout; had to Skip it before anything underneath was clickable." Tap log for both arms: one `ok:false` ref-timeout before Skip.

After dismissing the tour: resolve flow was 3-4 taps, under 2 minutes, zero further wrong turns — the S9a fix holds.

---

#### Tasks 3–7 — Remaining shop tasks

All tasks completed cleanly across both arms. Task 5 (Log a service) pre-fill confirmed fixed — see §1. Tasks 4, 6, and 7 (meter correction, locator, fleet filter) matched S9a's clean results with no regression.

A-sam Task 4: one wrong turn (clicked a fleet-locator chip on the dashboard that navigated to the Locator instead of the machine page). Recovered in one extra tap.

A-sam only cosmetic finding: service-log form has no date field, only "At hours." "If I'd needed to log a service for a past day, I'm not sure how — there's no visible date picker at all." B-sam echoed this.

---

## 3. Specific Bugs Called Out in the Brief

### Duplicate drill log on re-opening a completed plan tile

**What the records show:** Both A-dinis and B-dinis independently triggered this by navigating back to the completed Bench 3 east plan from the home/Dashboard screen after marking it complete. In both cases:

- A new "Open" drill log (0 holes) appeared under the same plan, same day, same driller.
- My Records listed two entries: one "Complete" and one "Open" for "Ledgeville Pit — Phase 1 · Bench 3 east · Wed Sep 9."
- The home tile and Dashboard regressed: "you 0 · others 30 · 1 open" (A-dinis) despite the driller having personally drilled all 31 holes.
- The job's Drill Plans list showed the plan as "open" even though all holes were drilled (B-dinis).

Neither agent drilled into the duplicate; backing out without touching it did not resolve the "Open" record in My Records. The Drilling tab returned to "Nothing else is waiting" in A-dinis's arm but the stale record persisted in My Records. This is a reproducible wrong-result bug reachable from normal navigation (not an edge case).

The tap log for A-dinis shows the moment: `{"op":"click","args":{"text":"Ledgeville Pit — Phase 1 · Bench 3 east","nth":2},"ms":14005,"ok":false}` — the locator `nth:2` means two elements with that text existed (original and duplicate tile), and the 14-second timeout suggests the click hit the new empty log before the agent could back out.

This bug is not a run artifact. It was not reported in the S9a run. It is new to after2.

---

### Time-card ST hours of 12.8 for a 06:00–15:00 shift with unrounded float in the UI

**What the records show:** B-dinis only. The agent replaced the suggested IN 02:10 with 06:00 and OUT 02:15 with 15:00, then filed the card. ST showed 12.8 while filling, and the filed record in My Records exposed the raw float "12.833333333333334 ST."

12.833... hours = 12 h 50 min = exactly the interval from 02:10 to 15:00. The computation used the pre-filled suggested IN (02:10) rather than the user's typed IN (06:00). The field visually showed 06:00 throughout; the change event apparently did not propagate.

A-dinis typed 07:00–15:00 and got 8.0 (correct), so the bug is not triggered by all overrides — something specific to the 06:xx time range or to the difference between A's identical IN/OUT suggestions (02:10/02:10) and B's split suggestions (02:10/02:15) may be the cause. The S9a version of this glitch was reported as transient ("self-corrected after I edited OUT a second time"). In after2 it persisted through filing, and the unrounded float reached the UI. This is either a regression or a different manifestation of the same root cause.

---

## 4. What Is Still Confusing — Ranked, With Quotes

### 1. Duplicate drill log from re-entering a completed plan tile (new, worst result)

Both Dinis arms, no guide consulted, no unusual navigation. The app silently creates an empty "Open" second log for the same plan and day, corrupts the home tile's drilled-hole attribution, and leaves a stale "Open" record in My Records that persists after backing out.

A-dinis: "Someone glancing at the home screen after I finished would think the pattern isn't done and that I hadn't drilled anything. What would help: don't create a new open log just from viewing a completed plan."

B-dinis: "I did not touch or drill anything into the new empty log — flagging as-is. This looks like a real duplicate-record bug reachable just by revisiting your own finished work from the home screen, not something I went looking for."

### 2. Done / Skip button timeout on modals and overlays (persists across all three runs)

Every overlay and confirmation modal in the Dinis sessions (checklist receipt Done, drill-log tour Skip) failed click-by-name and click-by-number, requiring a pixel-coordinate workaround. This pattern recurs identically in the first run, S9a, and after2 — it has never been fixed. On a real dusty phone there is no escape hatch.

A-dinis: "the Done button on the filed-copy screen would not register a click by number or by visible text — twice it timed out even though the screenshot showed nothing covering it. Both times a raw pixel-coordinate tap on the same visual spot worked immediately. This is a real-device risk: a driller with rock dust on the screen mashing the obvious button and getting nothing would assume the app froze."

B-dinis (Task 3): "every 'click Skip' attempt returned 'Timeout 6000ms exceeded' with no visible error on screen, so I had to fall back to a screenshot and a raw pixel tap to get past it. If I hadn't known the pixel-tap escape hatch this task would have stalled completely on a 'help' feature I didn't even want."

### 3. Horn toggle three-state label — no "failed / needs repair" text on any state

Both Dinis arms reached the right outcome (repair ticket opened, confirmed on the receipt) but neither agent was sure going in that "—" was the fail state.

B-dinis: "the hint text above just says 'tap anything that's N/A or wasn't done', which reads like it's describing skipped/inspection items, not a broken part. I had to guess that '—' was the right one to pick and that the free-text 'Repairs needed' box was what actually raised the flag. The confirmation screen calling it a 'Repair ticket' afterwards confirmed I'd guessed right, but I wasn't sure going in."

### 4. Time-card suggested IN/OUT = same current-moment timestamp (zero-hour risk)

Both Dinis arms saw a pre-filled card whose IN and OUT were the same moment (or moments apart) — the actual clock time of their app actions, not a real shift. A driller who trusts the "from your own records" label and signs without checking would file a zero- or near-zero-hour day.

A-dinis: "the suggested IN/OUT were both the same clock-in-the-cab timestamp (02:10), so the suggested card was a full day paid at zero hours if I'd just hit File without looking. It reads as 'from your own records' so it feels trustworthy, but neither number was actually when I started or stopped working."

### 5. Time-card ST math wrong for 06:00-15:00 shift, raw float in UI (new, B-dinis only)

B-dinis: "the ST hours math looks broken: 06:00–15:00 is 9 hours and came out '12.8' (and on the record list, the raw value showed as an un-rounded '12.833333333333334 ST' instead of a clean number) — I don't trust this number and wouldn't expect Barry to either."

### 6. Two "Tap to sign" buttons visible at once in Mark Complete card

Cosmetic but briefly confusing. B-dinis: "there were two sign buttons on screen at once — one in the new Mark Complete card, one further down labelled 'Driller signature' for the log itself — I picked the top one since it was inside the card I was filling in — this apparently satisfied BOTH signature slots at once. One signature, two slots filled — genuinely saved a step, once I realized that's what had happened." The confusion is about intent (are these the same thing?), not about outcome.

### 7. Daily report not visible to the driller (by design, but confusing)

Both Dinis arms could not confirm the daily report for Ledgeville Pit today because no Blast Day exists yet from the blaster's side. The drill log's own helper text says the end-of-day meter "goes to the daily report's equipment hours," which implies a report the driller can check, but no such report is reachable from their view.

A-dinis: "I expected finishing my drill log to be enough, but the task wants me to check a 'daily report' for the day — and there is no work day for Ledgeville Pit — Phase 1 today anywhere I can see."

---

## 5. Anything New or Worse

**Duplicate drill log (new):** Not reported in the first run or S9a. Now reproducible from normal navigation (tap the plan tile after completing it). Sets wrong counts on the home tile, wrong status on the job's Drill Plans list, and leaves a stale Open record in My Records. This is the most severe new finding.

**ST float leaking into filed record (worse):** S9a's version was transient — "only self-corrected after I edited the OUT field a second time." The after2 instance (B-dinis, 06:00–15:00) persisted through filing, and "12.833333333333334 ST" reached the UI of the filed record. The root cause (suggested IN not released from form state on overwrite) appears the same, but the fix-by-re-editing-OUT no longer consistently rescues it.

**Done / Skip button timeout (unchanged, still unfixed):** Present in all three runs. Not new, not worse, not better.

---

## 6. Verdict

S9b landed two of its three targeted changes clearly: the pre-fill-not-submitting bug that produced silent blank meter fields across three screens in S9a is gone (both Sam arms filed the service log off the pre-fill without retyping; both Dinis arms filed the checklist off the pre-filled starting hours without retyping), and Mark Complete now enforces signature before completion (both Dinis arms signed before the button reached "Complete," closing the unsigned-log path that A-dinis fell into in S9a). The third change — tours suppressing after day 1 — cannot be confirmed because all agents are first-day accounts; what can be said is that tours appeared once per screen on day 1 (expected) and did not repeat within the session. Against those gains, two fresh problems surfaced: re-entering a completed plan tile silently spawns a second empty drill log for the same plan and day, corrupting the home tile's hole-attribution counts and leaving a stale Open record in My Records that both Dinis arms independently triggered just by checking their own work; and B-dinis's time card filed with ST 12.8 for a 06:00–15:00 shift (should be 9 h) because the 06:00 IN override did not propagate to the computation, and the raw float "12.833333333333334 ST" reached the UI of the filed record — worse than S9a's transient version of the same glitch. Three issues carry over unresolved from earlier runs: the Done/Skip button timeout on modals (present in every run, still requires a pixel-coordinate workaround with no escape for a real-device user), the horn three-state toggle's unlabeled "—" state, and the zero-hour risk from suggested IN/OUT timestamps reflecting app-action moments rather than shift start/end. The product is meaningfully better on the pre-fill and signature fronts; the duplicate-log bug and the ST float are the two items that most need addressing before Dinis uses this on a real day.

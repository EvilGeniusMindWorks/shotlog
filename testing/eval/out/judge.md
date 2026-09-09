# ShotLog Eval — Judge's Report

**Date:** 2026-09-08  
**Judge model:** claude-sonnet-4-6  
**Arms:** A (with help guide) vs B (no help guide)  
**Roles:** Barry (blaster), Dinis (driller), Sam (shop mechanic), Evette + Tony (office/supervisor)

Read run-notes.md first. Items tagged **[run artifact]** follow the coordinator's lead.

---

## Session tap totals from log files

| Session | Log taps (ok=true) | Failed ops (ok=false) |
|---------|-------------------|----------------------|
| A-barry-tablet | 429 | 123 |
| A-barry-phone | 393 | 40 |
| A-dinis | 138 | 37 |
| A-sam | 99 | 21 |
| A-evette | 108 | 48 |
| A-tony | 29 | 6 |
| B-barry-tablet | 459 | 143 |
| B-barry-phone | 114 | 56 |
| B-dinis | 192 | 48 |
| B-sam | 97 | 20 |
| B-evette | 101 | 44 |
| B-tony | 29 | 10 |

Log totals and self-reported per-task counts diverge because the log captures all commands including screenshots, navigation, and failed taps; agents count only "acted" interactions. Per-task numbers below are self-reported; where they look wrong, that is noted.

---

## 1. Per Role, Per Task

### Barry — tablet (morning)

| Task | A done? | B done? | A taps (self) | B taps (self) | A wrong turns | B wrong turns | A consults | Verdict |
|------|---------|---------|--------------|--------------|---------------|---------------|-----------|---------|
| T1 Enroll + PIN | yes | yes | 28 | 10 | 3 | 1 | none | same — A had three PIN retries (rapid-batch digit loss); B knew to go slowly. Apostrophe in "Let's go" is tool artifact (fixed ~20:00 ET). Both hit identical real finding: PIN dot-count never reported so user doesn't know how many registered. |
| T2 License + sig | yes | yes | 12 | 8 | 1 | 1 | none | same — identical confusion: State field shows "MA" as placeholder but is empty; Save stays disabled. Both wasted one cycle. Neither consulted the guide. |
| T3 Start work | yes | yes | 38 | 28 | 2 | 3 | none | same — FAB "+" button covers "Start work" submit in the job-picker dialog. Both agents independently found the Tab×7+Space keyboard workaround. Real bug confirmed by both arms. |
| T4 Set up week | yes | yes | 52 | 52 | 0 | 2 | none | same — identical tap count. Pattern locked in by T3. |
| T5 Drill plan + send | partial | partial | 121+ | 35+ | ~9 | 3+ | none | same — both blocked by SVG grid holes not responding to taps (cannot remove single hole); Dinis absent from roster until admin backfill. **[run artifact]** for roster; SVG tap issue is real. A spent far more taps (3 browser resets compound this). B also noted no Send button until depth is set, labelling it a finding. Both arms: guide not consulted; SVG tap issue would not have been answerable by guide. |
| T6 Enter hours | yes (tablet) | partial | 8 | 68 | 0 | 6 | none | **A knew something B did not — but not from the guide.** A found the time card in 8 taps. B spent 68 taps and filed at 15:00 instead of 15:30 because the time input's minutes field "replaced the first digit '3' with '0' rather than completing the entry." The time input has no accessible label; B's "clock icon buttons next to each field are invisible to the accessibility tree but DO consume Tab stops." This is not a guide gap — the guide was not consulted. It is an accessibility and UX gap the no-guide arm exposed more sharply. |
| T7 P002 brake light | partial | partial | 14 | 14 | 1 | 2 | guide (Shop section) | **A knew something B did not, from the guide.** A consulted /help/shop/a-repair-ticket and learned quickly that blasters have no path to file a repair ticket — "it's a shop-role feature." B discovered the same conclusion through exploration but also filed a text note in "Materials / Onsite Repairs / Fuel" as the closest available field. The guide's sentence "tickets can be created by (a) driller's rig checklist, (b) checklist 'Out of service,' or (c) shop person from the machine's fleet page" told A what to stop looking for. Outcome is the same (no ticket filed); A just stopped sooner. |

### Barry — phone (afternoon)

| Task | A done? | B done? | A taps (self) | B taps (self) | A wrong turns | B wrong turns | A consults | Verdict |
|------|---------|---------|--------------|--------------|---------------|---------------|-----------|---------|
| T1 Sign in, confirm day | yes | yes | 3 | 3 | 0 | 1 | none | same — both noted no PIN prompt on the second device. Both confirmed day visible. |
| T2 Add 5th row | yes | yes | 9 | 5 | 1 | 1 | none | same — B fewer taps because B found the "+" button via coordinate tap on first try; A tabbed to the minus first and decremented. Row labels unlabeled in both. |
| T3 Drilling review | yes | yes | ~15 | 7 | 0 | 1 | none | same — both found wet hole (orange circle, Hazards section), skipped hole (dashed outline), and off-plan hole only via count mismatch ("plan says 24 holes, log shows 25 / DC · 24"). Neither found a dedicated off-plan indicator because none exists. Both concluded the "open" button on Dinis's log entry was non-interactive. |
| T4 Build timing | yes | partial | 34 | 2 | 3 | 0 | none | **B did something A did not — but not to B's benefit.** B clicked "Build timing from drilling" (2 taps, 4 min) and declared done. The green "✓ Built from drilling" banner showed 0 wires; B noted "unclear whether 'built' means complete or whether manually wiring each hole was still required" and stopped per instructions. A wired all 23 holes manually in a serpentine pattern — however, A also read ShotDiagramEditor.tsx source code, which violates the brief ("you cannot see ShotLog's code"). A's timing work is therefore tainted; do not score it as guide-aided insight. The timing mode label confusion ("Tap the next hole in the sequence" vs. "Tap a timed hole, then its neighbors") was real and confirmed by A regardless of the rules violation. |
| T5 Accept drill log | yes | yes | 12 | 4 | 0 | 0 | none | same — both used "Accept" button cleanly once Dinis's log was complete. B was more efficient (4 taps vs 12) partly because B found the accept button without the timing detour. |
| T6 Explosives entry | partial (no Dyno Nobel found) | yes | ~28 | ~38 | 2 | 4 | none | **Brief difference, not product difference.** A's brief said "3 cases of a Dyno product" and A searched "dyno" — no results, no empty-state message. B's brief said "Dyno Fortel Ultra 2.5×16" by name and searched "Fortel Ultra" — found it immediately as "Fortel Ultra 2.5×16 (Dyno Nobel)." The product exists in the catalog; A just didn't know its name. Both arms expose the same real findings: no "no results" message when search returns nothing, and product units (sticks/each) don't map to blaster terminology ("cases"). |
| T7 Seismo reading | yes (reading only) | yes (reading + photo) | ~22 | 8 | 2 | 2 | none | same for the reading. Photo: **run artifact.** Run-notes confirm "arm A's Barry attached no photos or video because the agent's tool trouble, not the product." B attached all three files the same way. Do not score photo absence against arm A or the product. |
| T8 Attachments | no | yes | 6 | 4 | 0 | 0 | none | **[run artifact]** — same tool limitation. B's agent reached the hidden inputs; A's did not. Run-notes are clear: "arm B's Barry attached all three the same way." Product itself works. |
| T9 File before signing | filed unsigned (no block) | filed unsigned (no block) | 3 | 5 | 0 | 1 | none | same — two independent agents, same result: "Submit to Office" fires with no gate, no dialog, no warning about unsigned shots. Day locked immediately. Sign-off fields disabled after filing. Confirmed wrong result. |
| T5b Send-back refile | yes | yes | ~30 | 17 | 1 | 4 | none | same — both found no return note on the day ("Returned by office" showed as status "draft" with zero explanation). Both had to call Evette out-of-band. Both discovered seismo distance lives on Design Plan, not on seismo reading. B tried to edit the seismo reading in-place and found no edit affordance — only delete-and-recreate. A found the same thing. Both refiled as v2. |

### Dinis — phone

| Task | A done? | B done? | A taps (self) | B taps (self) | A wrong turns | B wrong turns | A consults | Verdict |
|------|---------|---------|--------------|--------------|---------------|---------------|-----------|---------|
| T1 Enroll + PIN | yes | yes | 14 | ~30 | 1 | 3 | none | same finding, worse for B. Both noted PIN required 7 presses for a 6-digit PIN (reproducible). B also had PIN mismatch and had to retry. Apostrophe in "Let's go" was tool artifact (fixed by run 2 for A; worked first try on B run 2). |
| T2 Rig checklist | yes | yes | 28 (run1), 21 (run2) | 13 (run1), 12 (run2) | 3, 1 | 3, 1 | none | same — B was faster. Both arms: ✓ symbol in button names blocks text-based click; both tapped wrong row (Gauges instead of Horn) at least once. B cycled Horn through ✓ → N/A → — without knowing which state meant "failed." A did the same. Both completed correctly. Guide not consulted. |
| T3 Plan + row 1 | yes | yes | 7 | 10 | 1 | 1 | none | **A knew something B did not — row handles.** A saw "Assigned to you" card, opened log, used R1 handle to log 6 as planned in one action. B saw the same card ("immediately obvious" in both arms) but tapped R1 expecting a batch-select and found the form unchanged, then added holes 1–6 individually ("tapped 'Add hole 1' → advanced to hole 2 → repeated for holes 2–6"). The row-handle bulk-select feature was present in both arms; A discovered it; B did not. The hint text "· R1, R2… selects a row" was visible in A but described as "small and easy to miss." This is a guide-independent discovery: A-dinis says "No guide consulted." |
| T4 Log rows 2–4 (exceptions) | yes | yes | 24 | 27 | 1 | 3 | none | same outcome, B more stumbling. Both found wet hole and off-plan entry cleanly. For the skip: A used the quick-action popup on the grid hole ("Mark skipped ⊘") intuitively after deselecting from row selection. B tried condition buttons (angle/subdrill/comment, then Void) before discovering the popup. B: "The skip option is hidden behind the grid-hole quick-action popup — you have to tap the hole's grid button." This is a real product gap: skip is not visible from the form's condition buttons. Both arms confirm it. R5 appeared silently in both arms with no notification. |
| T5 Log row 5 + rig hours + sign | partial | partial | 18 | 12 | 4 | 4 | none | same — both logged row 5 and marked complete. Both unable to enter end-of-day rig hours (4,127): no entry point found on drill log, equipment page, or time card. Both hit the same blocker: "Mark complete" bottom-sheet buttons hidden behind nav bar on phone. Both used keyboard workaround (Tab×2 + Space) that no real driller would discover. |
| T6 Time card | yes | yes | 10 | 8 | 1 | 2 | none | same — both delighted by auto-populated IN/OUT from checklist and log timestamps. B noted "Which job?" combobox has no accessible label; same issue in A. Both completed. |

### Sam — wide screen (shop)

| Task | A done? | B done? | A taps (self) | B taps (self) | A wrong turns | B wrong turns | A consults | Verdict |
|------|---------|---------|--------------|--------------|---------------|---------------|-----------|---------|
| T1 Enroll | yes | yes | 12 | 16 | 1 | 1 | none | same — both needed coordinate tap for 6th PIN digit. |
| T2 Resolve horn ticket | partial | no | 38 | 38 | 5 | 7 | /help/shop/a-repair-ticket (answered: yes, confirmed bug) | **A knew something B did not, from the guide.** A consulted /help/shop/a-repair-ticket. The guide correctly described "What was done → Mark resolved" — which told A that the UI element should exist but does not. A: "guide confirms What was done + Mark resolved should be on opened ticket but neither appeared." B spent 35 minutes and 7 wrong turns — "tried tapping 'Repair ticket opened — Dinis Costa' orange history row… tried clicking Active status button… tried Log a service done thinking it might close ticket" — without concluding definitively whether the feature was missing or just hidden. The guide told A this was a confirmed bug; B was left uncertain. **This is the guide's best moment in the entire eval.** The guide also exposed itself: the page now describes UI that does not exist (regression confirmed in code — `resolveTicket()` has no caller since S8b). |
| T3 Open P002 ticket | partial | no | 4 | 4 | 1 | 1 | none | same — both found no "Open ticket" path for non-drill equipment. **[known gap]** See Section 4. |
| T4 Correct hours | yes | yes | 4 | 8 | 0 | 0 | none | same — both found "Correct hours" immediately, both noted the default shows 13,236 (app-accumulated) vs 4,120 (Dinis's checklist entry). |
| T5 Log engine service | yes | yes | 12 | 12 | 3 | 2 | none | same — both failed `select "Service"` (no accessible label); both found "Save" by text opened the sync panel; both needed coordinate taps. Identical experience, identical findings. |
| T6 Last worksite | yes | yes | 0 | 2 | 0 | 0 | none | same — History section made it immediately readable in both arms. |
| T7 Fleet filter | partial | partial | 5 | 5 | 1 | 1 | none | same — both selected "In shop" + "Out of service" and got 0 results. A: "I expected status filter chips to OR together." B: "I expected clicking both to show me everything that's not available right now." Identical finding. |

### Evette + Tony — wide screen (office/supervisor)

| Task | A done? | B done? | A taps (self) | B taps (self) | A wrong turns | B wrong turns | A consults | Verdict |
|------|---------|---------|--------------|--------------|---------------|---------------|-----------|---------|
| T1 Enroll | yes | yes | 14 | 15 | 1 | 1 | none | same |
| T2 Read PDF (seismo + crew) | yes | yes | 2 | 6 | 1 | 1 | none | same — icon-only buttons in blast day header unreachable by text click; both needed coordinate taps. B found the Visual Blast Report on first icon; A tapped the printer icon. Both got the data. |
| T3 Send back with note | partial | partial | 12 | 18 | 2 | 2 | none | same — both: office role cannot approve or send back ("insufficient role"); both switched to Tony; both: "Send Back" fires immediately with no note field. A: "expected a text box for the reason before confirming send-back." B: "Clicking 'Send Back'… sent the day back immediately to draft with no opportunity to add a reason." Same wrong result. |
| T4 Approve v2 + time cards | yes | yes | 6 | 18 | 1 | 3 | none | same outcome, B much harder. Both needed Tony's session. Both found two "Approve" buttons simultaneously on screen (day-level and time card row). B tried Evette for approvals three times before accepting the role restriction. A was faster because A had learned the role boundary in T3. |
| T5 Pioneer Valley | no (not found) | no (not found) | 8 | 12 | 2 | 2 | none | **[run artifact in both arms]** — run-notes confirm neither company has Pioneer Valley Aggregates; both Barry A and Barry B's week setups were lost in the data wipe and not recreated. Evette's task 5 is a run artifact. Do not score. |
| T6 Download ZIP | yes | yes | 4 | 3 | 0 | 0 | none | same — both downloaded the binder. Both got ZIP with only index.csv / audit CSV and no PDFs. A: "All 5 PDFs are MISSING from the binder — an office manager downloading this to send to a state regulator would get a ZIP with no blast reports." B: "3 PDFs not reachable from this device." **[local stack has no R2 configured]** — production would include PDFs. Both arms correctly noted the wording of the missing-file state. |
| T7 COI date | no (reverted) | no (reverted) | 12 | 8 | 4 | 3 | none | same — both typed the date, saw "20d left" live, navigated away, saw it revert to original. "All changes saved" green dot stayed on throughout. Neither got a dashboard warning. Run-notes confirm: "The server discards the write and sync reverts the field with no message." Real bug. |
| T8 Invite Ray Ortiz | partial (roster only) | partial (roster only) | 10 | 7 | 2 | 2 | none | same — "Invite to set up their own login — Logins are admin-only" disabled for office role in both arms. Both added Ray to roster only. Both found newly added person does not appear in search immediately (sync lag or search scope issue). |

---

## 2. Hand-offs

### Barry → Dinis (drill plan)

Both Dinises found the plan "immediately obvious" on their home screen via the "📋 Assigned to you" card with job name, hole count, and sender name. A-dinis: "OBVIOUS — the plan appeared on my home screen in a dedicated 'Assigned to you' card the moment Barry sent it." B-dinis: "immediately obvious — it appeared in a distinct '📋 Assigned to you' card right below the three tiles, with the job name, hole count, and sender's name."

A's plan had 24 holes (4×6, no hole removed — SVG tap never worked). B's plan had 23 holes (4×6 minus one removed via coordinate tap). Neither difference affected Dinis's logging experience significantly; both worked from the plan they received. B-dinis's Task 3 shows that A-dinis's discovery of the row-handle bulk-select feature was not available to B-dinis by default, though B-dinis completed the same task by adding holes individually.

Plan updates (Barry adding row 5) appeared silently in both arms with no toast or badge. Both Dinises discovered the new row only by taking a snapshot. B-dinis: "Noticed because hole count changed from 23 planned to 29 planned." A-dinis: "R5 was already in the snapshot when I first looked. No badge, no alert." The live sync itself worked in both arms; the notification layer did not.

### Dinis → Barry (drill log review for acceptance)

Both Barrys reviewed the drill log from Dinis and found the same three items: wet hole H-9 (orange circle, Hazards section), skipped hole H-14 (dashed outline), and one off-plan hole (discoverable only by count mismatch — plan count vs Dinis's log count). Neither arm had a dedicated "off-plan" badge or indicator.

A-barry: "The extra off-plan hole has no dedicated indicator. The only way to spot it is by noticing the mismatch between '24 holes' in the header and '25' in Dinis's log count." B-barry: "The extra hole did not appear as a numbered circle in the grid — it only surfaced through the count discrepancy (DC · 24 vs '23 holes' plan)." Both arms: identical finding, independently confirmed.

The drill log A-dinis produced was structurally the same as B-dinis's. Neither Barry had a materially easier or harder review task because of the driller's session.

### Barry → Evette (filed day)

Both Evettes found the filed day in their approval queue within two seconds of landing on their home screen. A-evette: "Barry's day visible within two seconds of landing on home." B-evette: "Dashboard showing '1 Awaiting approval' for Ledgeville Pit."

Both days arrived with Shot #1 unsigned (both Barrys filed without signing). A-evette was able to read the seismo data in the PDF (PPV 0.420, crew: Barry Lopes and Dinis Costa) and noted the Location field was blank (seismo distance missing). B-evette found the same data in the Visual Blast Report.

Both Evettes downloaded a ZIP with no PDFs. **[run artifact — local stack has no R2 file storage.] Both agents correctly described the wording of the missing-PDF state, which is the real finding regardless of production behavior.**

### Dinis → Sam (repair ticket)

The repair ticket from Dinis's checklist ("Horn not working — needs repair") appeared in Sam's shop queue in both arms. Both Sams navigated to R1004 from the worklist. Both found "Repair ticket opened — Dinis Costa" in the History section — rendered as an orange, non-interactive paragraph that visually matched the clickable Checklist and Drill log rows.

Sam A consulted the guide after 38 taps and learned the resolve UI should exist but does not. Sam B spent 38 taps on the same dead end and concluded "could not find resolve mechanism" without confirmation of whether this was a bug or user error. The hand-off worked (ticket was visible); the resolution step did not, in either arm.

---

## 3. Three Lists

### The screen needed the guide — B failed or stumbled where A did not

**1. Sam Task 2: Resolving the horn ticket**

B failed to complete (status: "no"); A partially completed (status: "partly"). The difference: A consulted /help/shop/a-repair-ticket and learned from its text that "What was done → Mark resolved" should appear on an opened ticket — confirming it was a bug, not user error. B spent 35 minutes and 7 wrong turns and left uncertain. Sam A: "guide confirms 'What was done + Mark resolved' should be on opened ticket but neither appeared." The guide's sentence "Open a ticket to resolve it" (About this screen) and the full "What was done → Mark resolved" description on the guide page were enough to let A pivot faster, even though neither could complete the task.

**What the screen should say or do so the guide is not needed:** The "Repair ticket opened — Dinis Costa" history row is styled identically to clickable Checklist and Drill log rows (same orange, same typography). It should either be interactive (opening the resolve form) or visually distinguish itself as non-interactive. A one-line "Click a ticket to resolve it" instruction on the machine page would also prevent the confusion — and the bug needs fixing regardless.

**2. Barry Task 7 (tablet): Finding where to report P002 brake light**

A consulted /help/shop/a-repair-ticket and stopped searching after ~10 taps when the guide told A blasters have no path to file a ticket. B took 14 taps and also found nothing, but additionally filed a text note in "Materials / Onsite Repairs / Fuel" as the closest available field — which is arguably a more useful workaround than A found. Neither completed the task.

**What the screen should say or do so the guide is not needed:** The Equipment / Assets section on the daily report should display a note like "For equipment defects, ask the shop or your supervisor" rather than silently being unrelated to defect reporting. The current label "Equipment / Assets" implies a general equipment record; a blaster checking this section expects defect reporting to be somewhere in it.

### Both stumbled — product gap, or guide gap where A consulted and was not answered

**1. Resolve ticket — regression (rank 1)**

Both Sams failed. Neither could complete Task 2. The guide page /help/shop/a-repair-ticket describes "What was done → Mark resolved" — which does not exist in the app since S8b removed the repair queue from the admin page (commit 698b1c7, "repair queue leaves the admin page"). Sam A's guide consult was answered in text but not in practice: "guide is accurate about what should happen — which is how I confirmed the ticket resolve is actually broken." The guide page is now incorrect and should be updated or removed until the feature is restored.

**2. "Submit to Office" fires with unsigned shots — no gate**

Both Barrys filed with Shot #1 unsigned. A-barry: "No warning. No confirmation dialog. No block. The button said 'Submit to Office' and it submitted. Shot was unsigned at the time." B-barry: "Tapping it filed the day immediately — no confirmation dialog, no check that shots are signed, no warning that the day will be locked." Both then found sign-off disabled on the locked day. Confirmed wrong result. Run-notes note both arms hit this.

**3. "Mark complete" bottom sheet hidden behind nav bar on phone — Dinis**

Both Dinises: the "Complete" and "Cancel" buttons in the Mark complete dialog fall exactly behind the fixed bottom navigation bar on a 390×844 phone. No real driller has a keyboard to use Tab×2 + Space. A-dinis: "The 'Complete' button in the Mark complete dialog was invisible — the bottom sheet rendered behind the nav bar. I had to Tab Tab Space blind to submit. A real phone driller has no keyboard, so this flow would be completely broken." B-dinis: "Cancel/Complete buttons are completely hidden behind the fixed bottom navigation bar."

**4. No end-of-day rig hours entry point — Dinis**

Both Dinises searched drill log form, equipment page, and time card. A-dinis: "end-of-day meter hours have no entry point." B-dinis: "The blast day page shows an empty 'R1004 4120 → — h' slot but tapping it does nothing — there is no input field visible to a driller." Starting hours enter via the rig checklist; there is nowhere for the driller to log the ending reading.

**5. No return note when day is sent back — both Barrys**

A-barry: "No office note shown when a day is returned. Blaster cannot see why it was sent back from the app itself." B-barry: "When the day is returned by the office, the blaster sees only 'draft' — no indication of WHY it was returned." This is paired with the missing note field on "Send Back" (Evette/Tony both found no note dialog).

**6. COI date silently reverts — both Evettes**

Both tried multiple save patterns (fill+Tab, fill+Enter, fill+click elsewhere). A-evette: "field shows '20d left' while editing... on leaving or reloading the date reverted to the previous value... the 'All changes saved' chip stayed on." B-evette: "There was no error, no 'unsaved changes' warning, and the 'All changes saved' status bar still showed a green dot." Run-notes confirm: server discards the write, sync reverts the field silently. Real bug.

**7. Fleet status filter chips AND instead of OR — both Sams**

Both: selecting "In shop" + "Out of service" returns 0 results. A-sam: "I expected status filter chips to OR together (show me anything in shop OR out of service) but they AND together. When I click both, I get zero results." B-sam: identical words and conclusion.

**8. Plan update (R5) silent with no notification — both Dinises**

Both noted they only discovered the new row by taking a snapshot. A-dinis: "R5 appeared silently with no notification — I only noticed because I took a snapshot." B-dinis: "Row 5 synced live without any refresh action — just appeared in the next snapshot." The sync itself worked; the user-facing acknowledgment did not.

**9. "Send Back" has no note field — both arms, Evette/Tony**

A-evette: "expected a text box for the reason before confirming send-back." B-evette: "Clicking 'Send Back'… sent the day back immediately to draft with no opportunity to add a reason." Both arms. Both roles (Tony acting; Evette receiving the role error first). The guide was not consulted; no guide page covers this. Pure product gap.

**10. Off-plan extra hole has no dedicated indicator — both Barrys**

A-barry: "The extra off-plan hole has no dedicated indicator... there should be a clearer flag — e.g. '1 off-plan' badge in the header alongside the other counts." B-barry: identical conclusion. The header shows "1 SKIPPED" and "1 HAZARDS" but not "1 off-plan." Both arms independently confirmed.

**11. Seismo distance field lives on Design Plan, not seismo reading — both Barrys**

Both Barry arms found this on Task 5b (send-back refile). A-barry: "a blaster told 'the seismo distance is missing' would go straight to the seismo reading list — there's no edit button there, and no distance field in the add-reading form." B-barry discovered the same: the seismo reading form has no numeric Distance field; B entered "450 ft" as a text string in the Location field. Guide page coverage: none found. Product gap that requires two navigations (understand seismo reading → understand it's on Design Plan) that the UI does not bridge.

### Both fine — where the product carried itself

1. **"Assigned to you" plan card on Dinis's home** — both arms called it "immediately obvious" or "OBVIOUS." No searching. Job name, hole count, sender visible. Guide pages behind this are probably shorter than they are; the feature explains itself.

2. **Wet hole display in drill log review** — both Barrys found the orange circle, Hazards section, and "H-9 Water 0–18 ft" detail on tap. No confusion in either arm.

3. **Seismo compliance auto-shown during field entry** — A-barry: "Compliance auto-calculated and displayed immediately as fields were filled." B-barry: same. Green "Compliant ✓" appeared field-by-field before save. Both found this reassuring.

4. **Time card auto-populated from checklist + log timestamps** — both Dinises were pleasantly surprised. A-dinis: "the app pulled from my checklist timestamp and the log signature time... a tired driller at the end of the day just verifies rather than remembers." B-dinis: "Wasn't sure the times were correct... but accepted them."

5. **Drill log accept flow** — both Barrys used the "Accept" button once Dinis's log was signed complete. A: "one tap, done." B: "fast (2 taps)." Clear trigger, clear outcome.

6. **Hour meter correction on equipment page** — both Sams found "Correct hours" without friction. A: 4 taps, 0 wrong turns. B: 8 taps, 0 wrong turns.

7. **History section on machine page showing last worksite** — both Sams found "Ledgeville Pit — Phase 1 · Dinis Costa · Tue, Sep 8" immediately without navigation. A: "the History section makes the last worksite visible immediately, no navigation needed." B: "History section on machine page is clean and informative."

8. **Drill log mark-complete pre-summary** — A-dinis: "Mark complete auto-shows the plan review ('30 of 30 plan holes drilled · 1 outside the plan · 1 wet') — a useful sanity check before filing." B-dinis: same feature, same reaction.

9. **Lock banner on filed day** — both Evettes found "Filed with the office and locked. Ask a supervisor to unlock it — resubmitting files a new version." clear and accurate. Both: tried to edit the locked day on purpose; both found it blocked cleanly.

10. **Dashboard queue layout for Evette** — both Evettes landed on a readable queue (Awaiting approval, Time cards, Expiring) with Barry's day visible within seconds. Neither needed to hunt for the filed day.

---

## 4. Known Gaps

Run-notes designate two items as known gaps, not findings:

**No truck or machine inspection form (only the drill checklist).** The rig checklist is drill-specific. P002 (pickup truck) has a machine page with status buttons and history but no checklist button, no service schedule, and no repair ticket creation path. Both Sams noted this clearly:

- Sam A (A-sam.md): "Pickup trucks (and presumably other non-checklist equipment) have no 'Open ticket' or 'File a ticket' button on their machine page... Mark's brake light note for P002 has no home in the app for non-drill gear."
- Sam B (B-sam.md): "P002's machine page has almost nothing on it — no service schedule, no hour ledger, no way to file anything. The only action available is changing the status flag."

Both agents correctly described what the app communicates about this absence: the machine page exists and has a status field, but offers no path to log a defect. Neither app message says "no inspection form yet" — the absence is silent.

**Repair tickets cannot be opened by hand.** For non-drill equipment there is no "New ticket" or "Report issue" button. Sam A: "There is no way to log a repair for a pickup, van, compressor, or trailer." Sam B: "There's no way to attach a note about the brake light problem." The app does not explain why this page is thinner than the drill rig pages; it just omits the buttons.

Score these as gaps, not bugs. Do not count them in the findings above.

---

## 5. Ten Things to Build or Change

Ranked by arms affected × roles affected × severity. "Smallest fix" means the minimum change that would have prevented the finding.

**1. Restore the repair ticket resolve action** — both arms, Sam role, blocked.

`resolveTicket()` in `hooks/useMaintenance.ts` has no caller since S8b removed the repair queue from the admin page (commit 698b1c7). The guide page /help/shop/a-repair-ticket.md describes "What was done → Mark resolved" that no longer appears on any screen. Both Sams spent 35–38 taps and failed. Sam A: "guide confirms 'What was done + Mark resolved' should be on opened ticket but neither appeared." Sam B: "This is a complete blocker — the primary shop workflow cannot be completed." Smallest fix: add a clickable "Repair ticket opened" row on the machine page (or a Resolve button on that history row) that opens a "What was done" form and calls `resolveTicket()`. Also update the guide page to reflect whatever UI is restored.

**2. Gate "Submit to Office" when shots are unsigned** — both arms, Barry role, wrong result / compliance risk.

Both Barrys filed with Shot #1 completely unsigned. A-barry: "No warning. No confirmation dialog. No block." B-barry: "Tapping it filed the day immediately — no confirmation dialog, no check that shots are signed." A signed blast log is a legal document carrying the blaster's license number. Once filed and locked, the shot is permanently unsigned unless a supervisor unlocks. Smallest fix: a one-step pre-flight modal listing "1 shot has no blaster signature — file anyway?" with a visible "File anyway" and a prominent "Go back and sign" option. Or block filing entirely until all shots are signed.

**3. Fix the "Mark complete" bottom sheet hidden behind the nav bar on phone** — both arms, Dinis role, blocked.

Both Dinises on 390×844 phone: "Cancel" and "Complete" buttons in the Mark complete dialog fall behind the fixed bottom navigation bar. A-dinis: "A real phone driller has no keyboard, so this flow would be completely broken." B-dinis: "Cancel/Complete buttons are completely hidden." Same bug affects the My hours "Sign" button (B-dinis also hit this). Smallest fix: `padding-bottom: env(safe-area-inset-bottom) + [nav-height]` on every bottom-sheet scroll container; or relocate action buttons above the text field.

**4. Add a note field to "Send Back" and surface it on the returned day** — both arms, Evette+Barry roles, wrong result.

Both Tonys: "Send Back" fires immediately with no dialog and no note. Both Barrys: returned day shows only "draft" status — no note, no banner, no reason. A-barry: "I would have expected a 'Returned by Evette Mason · Note: the seismo distance is missing' banner at the top of the blast day page." B-barry: "Finding this out required a phone call outside the app." Smallest fix: (a) a modal "Reason for sending back" before the send-back fires; (b) a "Returned by [name] · [note]" banner pinned to the top of the blast day page until the blaster files a new version.

**5. Fix the COI date field to actually persist** — both arms, Evette role, wrong result.

Run-notes confirm: the server discards the office role's write; sync reverts the field while the "All changes saved" chip stays green. A-evette (5 attempts): "field shows '20d left' while editing... as soon as I leave or reload, it snaps back to the old date." B-evette (3 attempts): identical. Smallest fix: investigate date input onChange/onBlur event wiring (vs `react-hook-form` submit); ensure the write reaches the server before the "All changes saved" indicator turns green. Longer fix: "All changes saved" should only show green when all pending writes are acknowledged by the server.

**6. Add an entry point for end-of-day rig hours** — both arms, Dinis role, missing feature.

Both Dinises searched three screens and found nothing. The blast day page shows "R1004 4120 → — h" with an empty slot that is read-only. A-dinis: "the ending hours have no home I could find." B-dinis: "tapping it does nothing — there is no input field visible to a driller." Smallest fix: make the "— h" slot tappable as an inline spinbutton when the drill log is in progress; or add a small "Log end-of-day hours" link in the drill log header after a rig is selected.

**7. Fix the FAB button covering "Start work" in the job-picker dialog** — both arms, Barry role, blocked on tablet.

Both Barrys needed Tab×7+Space to submit the "Start work" dialog. A-barry: "The floating '+' FAB button… is z-indexed above the dialog and covers the 'Start work' button." B-barry: "EVERY direct click attempt timed out." Smallest fix: `pointer-events: none` or `z-index` below the modal overlay on the FAB when a modal is open; or hide the FAB entirely when a dialog is open.

**8. Change fleet filter chips to OR logic for status filters** — both arms, Sam role, misleading result.

A-sam: "I expected status filter chips to OR together (show me anything in shop OR out of service) but they AND together. When I click both, I get zero results because no machine can be both simultaneously." B-sam: identical complaint. A shop mechanic's core morning question is "what's down?" — one view. Smallest fix: status-category chips (In shop, Out of service, Active, Retired) should OR within the status group; non-status chips (Due ≤30d, Repair open) continue to AND with the status selection. Alternatively, add an "Unavailable" combined chip.

**9. Add aria-labels to row/col +/− buttons and expose drill plan grid holes to accessibility tree** — both arms, Barry role, slow/blocked for keyboard users.

Both Barrys relied on Tab+Space keyboard navigation because the buttons have no accessible name. A-barry: "Row/Col '−'/'+'buttons have no accessible label. Assistive technology cannot identify these controls." B-barry: "The Rows +/− buttons have no accessible text label — they don't show up as named buttons in the accessibility tree." Additionally, individual SVG grid holes are not reachable via tap or keyboard (rendered as a single composite SVG element). Run-notes note this is a real accessibility finding, cheap to fix. Smallest fix: `aria-label="Increase rows"` / `"Decrease rows"` / `"Increase columns"` / `"Decrease columns"` on the four buttons; expose individual hole elements with `role="button"` and `aria-label="Hole H-N"`.

**10. Add "off-plan" count badge to the drilling header and repair the seismo distance UX** — both arms, Barry role, slow/wrong result.

Two medium-severity items combining for the 10th slot:

(a) Off-plan holes: both Barrys identified the extra hole only by arithmetic (plan count vs Dinis's log count). A-barry: "there should be a clearer flag — e.g. '1 off-plan' badge in the header alongside the other counts." B-barry: same. Smallest fix: add "· N off-plan" to the drilling header alongside "N SKIPPED" and "N HAZARDS."

(b) Seismo distance: both Barrys, after being told "the seismo distance is missing," navigated to the seismo reading form — which has no Distance field — before hunting to the Design Plan. A-barry: "a blaster told 'the seismo distance is missing' would go straight to the seismo reading list — there's no edit button there, and no distance field in the add-reading form." Smallest fix: add a "Distance to nearest structure (ft)" field to the seismo reading form itself, or add a hint on the seismo reading card linking to the Design Plan's Compliance section. Separately, saved seismo readings should have an edit button (both arms: delete-and-recreate is the only path).

---

## Appendix: Self-Report vs Log Discrepancies

Barry A's self-reported tap totals across both sessions sum to roughly 420–450 (tablet tasks + phone tasks), consistent with the log totals of 429 (tablet) + 393 (phone) when failed taps are included. Barry B's tablet self-reports sum to roughly 295 across tasks, but the log shows 459 — a large gap, explained partly by the data-wipe rebuild (the accidental re-run of setup.mjs around 19:41 ET caused Barry B to repeat all earlier tasks; the record marks this as "Run 2"). The 459 log count includes both the lost first run and the rebuilt second run.

Dinis A's self-reported total is roughly 102 across tasks, vs log total 138. The gap is consistent with navigation commands and screenshots that agents don't count. Dinis B's self-reported total is roughly 100, vs log total 192 — a larger gap explained partly by the same data-wipe rebuild.

Sam A self-reports roughly 75 taps; log shows 99 (consistent gap). Sam B roughly 71; log 97 (same). Evette A roughly 80; log 108. Evette B roughly 90; log 101. These gaps are consistent and expected.

All discrepancies are in the direction of agents under-counting, not over-counting. No agent's self-reported task counts appear fabricated.

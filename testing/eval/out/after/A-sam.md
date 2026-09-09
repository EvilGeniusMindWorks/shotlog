### Task 1 — Enroll, set PIN, reach home
expected:    open invite link, set password, set a PIN, land on a shop dashboard
did:         Home › fill password/confirm › Create my account › (auto) Set PIN 123456 › Confirm PIN 123456 › Welcome tour › Let's go
taps:        9
wrong_turns: 0
consults:    none
finished:    yes
minutes:     3
confusion:   none — flow was linear and each screen said what to do next

### Task 2 — Resolve hydraulic-leak ticket, confirm Active
expected:    open the ticket from the worklist, enter what was done, mark resolved
did:         Home › (intro tour overlay appeared and blocked a click, Skip) › click R1004 ticket in worklist › fill "What was done" = "boom cylinder seal replaced" › Mark resolved
taps:        4 (1 Skip + 1 click ticket + 1 fill + 1 Mark resolved)
wrong_turns: 1 — first click on the ticket row timed out because an unrequested "Welcome to ShotLog" walkthrough overlay (1/5) had appeared on top of the page after the earlier onboarding checklist; had to Skip it before the row was clickable
consults:    none
finished:    yes
minutes:     2
confusion:   "clicked the ticket row and the tap silently failed (ERROR: Timeout) — the walkthrough popup covering the page was not obvious from the accessibility snapshot text alone"

### Task 3 — Resolve horn ticket on R-102
expected:    same pattern as task 2 — open ticket, fill what was done, mark resolved
did:         Shop › click R-102 horn ticket in worklist › fill "What was done" = "horn relay replaced" › Mark resolved
taps:        3
wrong_turns: 0
consults:    none
finished:    yes
minutes:     1
confusion:   none — this screen even said upfront "The machine stays in service either way," which task 2's screen didn't (it said "Resolving puts R1004 back to Active") — a nice bit of reassurance I didn't get on the more consequential ticket until after I acted

### Task 4 — Correct R1004's meter to 4,231
expected:    find a "correct hours" or similar control on the machine page
did:         Fleet › R1004 › Correct hours › fill Meter reads = 4231 › fill Why = "meter corrected to actual reading" › Save correction
taps:        4
wrong_turns: 0
consults:    none
finished:    yes
minutes:     1
confusion:   none — toast confirmed "Hour meter corrected to 4,231 hrs" and the history line spelled out old vs new value plus my name

### Task 5 — Log engine service today at 4,231h
expected:    a "Log a service done" button on the machine page, pick the service type, confirm hours
did:         R1004 page › click "Log a service done" › select "Engine service — oil, filters" (At hours already showed 4231) › Save was greyed out, re-typed 4231 into "At hours" to make it accept › Save
taps:        4 (open form, select service, re-fill hours, save)
wrong_turns: 1 — Save button stayed disabled even though the service was picked and "At hours" already showed 4231 (carried over from the correction I'd just made); had to retype the same number to "touch" the field before Save lit up
consults:    none
finished:    yes
minutes:     2
confusion:   "Save was greyed out with everything already filled in correctly — looked like a bug, not a validation state, since nothing on screen said a field needed re-entry"

### Task 6 — Find where R1004 last worked
expected:    a "Locator" nav item sounded like the right place
did:         click Locator › read the "By last record" list, found R1004 → Ledgeville Pit
taps:        1
wrong_turns: 0
consults:    none
finished:    yes
minutes:     1
confusion:   none — I could also have read this off the machine page's own history ("Drill log — Bench 2 lift 4") but Locator named the actual site plainly

### Task 7 — Show everything unavailable in one view
expected:    a filter/toggle on the Fleet list, maybe two separate filters I'd have to combine
did:         Fleet › click "Unavailable" filter chip
taps:        1
wrong_turns: 0
consults:    none
finished:    yes
minutes:     1
confusion:   none — one chip already meant "in shop OR out of service" so I didn't have to combine two filters myself; result was R1006 only, since I'd already fixed R1004 and R-102 never went down

## Findings

1. **wrong result risk (medium) · Home ("/")** · An unrequested "Welcome to ShotLog" walkthrough overlay (step 1/5, with Skip/Next) appeared on top of the dashboard *after* I'd already dismissed the separate "Welcome, Sam" onboarding card and started working the queue. It silently ate a click (`ERROR: Timeout 6000ms exceeded` when tapping a worklist row underneath it) with nothing on screen explaining why the tap did nothing. A first-time user tapping the same spot twice, assuming the app is frozen, is a real risk. Two separate "welcome" flows competing for the same screen is confusing on its own — a mechanic who already clicked past one intro doesn't expect a second one to ambush them mid-task.
2. **cosmetic/slow (low) · R1004 "Log a service done" form** · Save stayed disabled even though the service type was picked and "At hours" already showed the correct value (carried over from the meter correction moments earlier). I had to retype the same number into the hours field to "touch" it before Save would light up. Looks exactly like a stuck/broken button, not a validation state — nothing on screen hints that a pre-filled field still needs to be re-entered.
3. **cosmetic (low) · Repair ticket screen wording** · The out-of-service ticket (R1004) told me the consequence of resolving *after* the fact ("Resolving puts R1004 back to Active" appears while filling the form, which I did notice — so this is more a near-miss than a miss). By contrast the R-102 (in-service) ticket volunteered "The machine stays in service either way" — good, reassuring copy. Worth making both tickets equally explicit up front so a mechanic never has to guess what resolving will do to the machine's status before they commit.
4. **cosmetic (low) · R1004 History feed** · The engine service I logged shows up in the "Service schedule" card (last at 4,231 h) but does not get its own line in the "History" list below, unlike the ticket resolution and the hour correction, which both did. A mechanic scanning History for "what happened to this machine" would not see the service there.

## What worked
- The enrollment → password → PIN → welcome flow was completely linear; never had to guess a next step.
- Ticket resolution screens were simple: one text field, one optional meter field, one button — no unnecessary complexity.
- "Correct hours" showed the before/after and my name in History immediately, exactly matching what Mark asked for ("keep the meters honest").
- The Locator page's "By last record" list named the site in plain text (Ledgeville Pit) with no map-reading required.
- The Fleet "Unavailable" filter combined "in shop" and "out of service" into one chip — I expected to have to pick two filters and OR them myself.

## What I'd tell Mark
The app is straightforward for shop work once you're past the tutorials — resolving tickets, correcting a meter, and logging a service were all one or two taps each. The one thing I'd flag before the crew starts: watch for a second "walkthrough" popup that can land on top of the dashboard after the first welcome screen and silently block a tap — it's not obvious what's wrong when it happens, and a new user might think the app hung.

## Guide pages
None opened — every task had a control visible on screen that named itself clearly enough (Correct hours, Log a service done, Unavailable filter), so I never got stuck enough to need help.

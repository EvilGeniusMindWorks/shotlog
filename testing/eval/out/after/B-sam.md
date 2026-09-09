### Task 1 — open invite, set password, PIN
expected:    fill password twice, click create, then some kind of PIN screen, land on a shop home
did:         Home › fill password + confirm › Create my account › (welcome toast) › Set a 6-digit PIN (943712) › Confirm your PIN (943712) › Welcome tour card › Let's go
taps:        8
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   none — straightforward enrollment flow. My Shop landed showing Down 2 · Tickets 2 · Due soon 1 exactly as promised.
minutes:     3

### Task 2 — resolve leak ticket, rig active
expected:    open the ticket from the worklist, type what was done, mark resolved, rig flips to Active
did:         Shop › tapped R1004 hydraulic-leak worklist card › ticket page › filled "What was done" = "boom cylinder seal replaced" › left "Meter now" blank (saving that correction for task 4) › Mark resolved › landed on R1004's machine page showing green "Active" pill and "Ticket resolved — Sam Rivera / boom cylinder seal replaced" in History
taps:        3
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   a Welcome tour overlay ("1/5, Skip/Next") popped over the worklist right after landing on Shop and ate my first click as a timeout; had to Skip it before anything underneath was clickable. Not the help guide, just in the way.
minutes:     2

### Task 3 — resolve horn ticket on R-102
expected:    same pattern as task 2 — open the ticket, fill what was done, mark resolved
did:         Shop worklist › tapped R-102 "Horn not working" card › ticket page › filled "What was done" = "horn relay replaced" › Mark resolved › landed on R-102 machine page with "Ticket resolved — Sam Rivera / horn relay replaced" in History, ticket gone from worklist
taps:        2
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   none — same pattern as task 2, easy the second time.
minutes:     1

### Task 4 — correct R1004's meter to 4,231
expected:    find a "correct hours" style action on the machine page
did:         Fleet › R1004 › Correct hours › filled Meter reads = 4231, Why = "meter corrected to match rig gauge" › Save correction › toast "Hour meter corrected to 4,231 hrs" › Hour Ledger now reads 4,231 hrs with a new line "4,231 shop correction · Sam Rivera · was 4,212.3 · meter corrected to match rig gauge"
taps:        4
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   none — "Correct hours" was right there on the machine page, exactly where I'd look.
minutes:     2

### Task 5 — log engine service today at 4,231h
expected:    a "Log a service" action on the machine page, pick the service type and hours
did:         R1004 page › Log a service done › selected "Engine service — oil, filters" › the "At hours" spinbutton already showed 4231 but Save stayed disabled until I re-typed 4231 into it myself › Save › toast "Service logged — the due clock restarts from here" › Engine service line now reads "last at 4,231 h · Wed, Sep 9, 2026" and "0/250 ok" (was "—/250 no baseline" before this and "295/250 due" before the meter correction)
taps:        3
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   "At hours" showed 4231 pre-filled (matching the current meter reading) but Save was disabled — I had to notice and retype the same number into the field before it would accept. Looks like a display value that isn't actually registered as form state. A person might assume the field was already correctly filled and get stuck wondering why Save won't light up.
minutes:     2

### Task 6 — where did the leak rig last work
expected:    a fleet/locator page listing each machine's last site
did:         clicked "Locator" in the left nav › "Where's my equipment" list shows R1004 → Ledgeville Pit, checklist · Tue, Sep 8, 2026 · today; answer: Ledgeville Pit
taps:        1
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   none — "Locator" in the nav was the obvious place, and it's named as such in Mark's onboarding tip too.
minutes:     1

### Task 7 — fleet list, everything unavailable in one view
expected:    some kind of status filter on the Fleet/Equipment list
did:         clicked "Fleet" in nav › saw a Filter row with buttons "Unavailable / In shop / Out of service / Repair open / Active / Retired / Due ≤30 d" › clicked "Unavailable" › list narrowed to "Equipment · 1 of 12": R1006 (in shop) only — R1004 and R-102 no longer show since I'd already fixed them
taps:        1
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   none — "Unavailable" as a single filter that folds together "in shop" and "out of service" was exactly the one-view ask, and it sat right next to the two separate filters so I could see it was the combined one.
minutes:     1

## Findings, ranked

1. **wrong result (minor) · R1004 machine page · "Log a service done" form** — the "At hours" spinbutton displays the current meter reading (4231) as if already filled in, but Save stays disabled until you actively type into that field yourself. It looks pre-filled and correct; a person could stare at a lit-up-looking number next to a greyed-out Save button and not know why nothing happens. A hint like "tap to confirm" or just leaving it truly editable/pre-committed would fix it.
2. **cosmetic · Shop home, right after Skip-tour** — the "Welcome to ShotLog" walkthrough overlay appears on top of the worklist and eats the first tap underneath it (my click on the R1004 ticket card timed out because the overlay was still catching clicks). Not a blocker — Skip fixed it — but a first-time user tapping fast could lose a tap for no visible reason.

## What worked well enough that I did not notice it

- The enrollment → password → PIN → welcome-tour → Shop-home flow was linear and never left me guessing what came next.
- Resolving a ticket, correcting an hour meter, and logging a service done all live exactly where you'd look for them — on the machine's own page — and each one gave an immediate, specific toast confirming what changed (down to the exact hours, exact status).
- The Shop worklist's Down/Tickets/Due-soon counts updated live and matched what I'd just done, so I never had to double back to confirm something took.
- Locator's "Where's my equipment" answered "where did it last work" in one glance, with the record type and date that produced the answer, no extra clicks.
- Fleet's Filter row named the exact grouping the task asked for ("Unavailable") right alongside its two components ("In shop", "Out of service"), so the one-view request was a single tap.

## What I'd tell Mark before the crew starts

The app is fast for the actual shop work — tickets, meter corrections, and service logging all took one or two taps once you found the machine's page. The only real snag is the service-logging form's hours field looking filled when it isn't; tell the crew to always retype the hours even if a number's already showing, or Save won't light up and they'll think the app is stuck.

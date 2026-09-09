# Sam Rivera — Eval B, wide screen — record

### Task 1 — Open invite, set password/PIN, reach home
expected:    click the link, fill a password, maybe verify email, then land on a dashboard
did:         open invite link › fill password › fill confirm password › click "Create my account" › entered 6-digit PIN (593728) twice on the number pad › clicked "Let's go" on the welcome card
taps:        6
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   none — the flow was linear and told me what was next at each step. My Shop landed with Down 2 / Tickets 2 / Due soon 1 right away, plus a worklist with the two Dinis tickets and a "Fleet now" summary. There's also a "Your first week 0/5" checklist and a "Take the two-minute walkthrough" card sitting on top of the home screen — I'm skipping the walkthrough since it smells like a guided tour into help content, staying on my own.
minutes:     3

### Task 2 — Resolve hydraulic-leak ticket, confirm active
expected:    open the ticket from the worklist, type what was done, resolve it, check the machine flips to active
did:         Home › clicked R1004 ticket in worklist › on Repair ticket page filled "What was done" = "boom cylinder seal replaced" › clicked "Mark resolved" (button was disabled until I typed something) › landed straight on the R1004 machine page showing "● Active" already selected and "Ticket resolved — Sam Rivera / boom cylinder seal replaced" in History
taps:        3
wrong_turns: 1 (a "Welcome to ShotLog" tour overlay popped up over the home screen right after I landed and swallowed my first click on the R1004 ticket — got a Playwright timeout error. Had to click "Skip" on the tour banner before the worklist was tappable again.)
consults:    n/a (arm B)
finished:    yes
confusion:   "the tour overlay ate my first tap with no visible error on screen (the b tool reported a timeout, but a person clicking blind would just think the app froze)" — I expected either no tour at all right after PIN setup (I'd already skipped the "walkthrough" card), or for a tap on real content to dismiss the tour instead of silently blocking it.
minutes:     2

### Task 3 — Resolve horn ticket on the track drill
expected:    same pattern as task 2, ticket → type fix → resolve
did:         Home › clicked R-102 horn ticket in worklist › filled "What was done" = "horn relay replaced" › clicked "Mark resolved" › landed on R-102 machine page, "Ticket resolved — Sam Rivera / horn relay replaced" in History
taps:        3
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   none — same pattern as task 2 and no tour got in the way this time. Noticed the copy differs sensibly by severity: this page said "The machine stays in service either way" (R-102 was never down) vs task 2's "Resolving puts R1004 back to Active" — good, reassuring detail.
minutes:     1

### Task 4 — Correct R1004's meter to 4,231
expected:    find the machine, look for an edit-hours or correction control near the meter reading
did:         Fleet › clicked R1004 › clicked "Correct hours" (right next to the big hour number) › it expanded inline into "Meter reads" (pre-filled with current 4212.3) and "Why (optional)" › filled 4231 and a reason › clicked "Save correction"
taps:        4
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   none. "Correct hours" was exactly where I'd look and named exactly right for a mechanic. Confirmation toast "Hour meter corrected to 4,231 hrs" plus a permanent ledger line "shop correction · Sam Rivera · was 4,212.3 · meter corrected per Mark's note" is exactly the audit trail I'd want.
minutes:     1

### Task 5 — Log engine service today at 4,231 h
expected:    a "Log a service done" button near the service schedule list, pick the type, confirm the hours
did:         on R1004 page › clicked "Log a service done" (form was already sitting open under Service schedule, right where "Correct hours" had also opened inline) › selected "Engine service — oil, filters" from the dropdown › "At hours" was pre-filled 4231 from the ledger › clicked "Save"
taps:        2
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   mild — I never saw an explicit date field, only "At hours" with a note "from the ledger — change it if the service was done earlier." I assumed today's date was implicit since I did this today, and the result confirmed it: "Engine service — oil, filters / last at 4,231 h · Wed, Sep 9, 2026" and "0/250 ok" replacing the old "—/250 no baseline." If I'd needed to log a service for a past day, I'm not sure how — there's no visible date picker at all.
minutes:     1

### Task 6 — Find where R1004 last worked
expected:    the machine page or a "Locator" nav item would show the last job/site
did:         clicked "Locator" in the left nav › "Where's my equipment" page listed R1004 → "Ledgeville Pit · checklist · Tue, Sep 8, 2026 · today"
taps:        1
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   none — "Locator" was an obvious nav label and the page even explains itself: "from filed paperwork — last record → job → site · no GPS." Answer: **Ledgeville Pit**.
minutes:     1

### Task 7 — Show everything unavailable in one view
expected:    the Fleet/Equipment list would have a status filter row; look for chips
did:         clicked "Fleet" in nav › saw a "Filter" row of chips: Unavailable / In shop / Out of service / Repair open / Active / Retired / Due ≤30 d › clicked "Unavailable" → list narrowed to "Equipment · 1 of 12" showing only R1006 (Komatsu 550 Rock Crusher, "in shop")
taps:        1
wrong_turns: 0
consults:    n/a (arm B)
finished:    yes
confusion:   none — "Unavailable" reads exactly as one combined view of in-shop + out-of-service, which is what the task asked for, and it's separate from the narrower "In shop" and "Out of service" chips sitting right next to it so I could tell it wasn't a duplicate. Since I'd already fixed R1004 and R-102 was never down, only R1006 remained — makes sense.
minutes:     1

## Findings, ranked

1. **wrong result (briefly) · Home screen · "the tour overlay ate my first tap"** — Right after PIN setup, a "Welcome to ShotLog" 5-step tour banner sat on top of My Shop even though I'd already ignored the "Take the two-minute walkthrough" card in the first-week checklist. My first click on a real ticket in the worklist silently failed (a Playwright timeout from where I sit, but a real person tapping glass would just think the app didn't respond) — I had to notice the "Skip" button had appeared at the bottom and dismiss it before the page underneath it worked. Fix: either don't launch an unrequested tour automatically on first load, or make the first tap on real content dismiss the tour instead of eating the tap silently.
2. **cosmetic · service-log form on machine page · no visible date field** — Logging a service only shows "At hours," not a date. It defaulted correctly to today, but nothing on screen told me that — I inferred it from the note "from the ledger — change it if the service was done earlier," which talks about hours, not dates. A mechanic backdating a service (e.g. logging Monday's oil change on Wednesday) has no visible way to do it correctly. A small "Date: today, change" affordance would remove the guesswork.
3. **cosmetic · first-week checklist** — "Resolve a ticket" and "Take the two-minute walkthrough" both auto-checked off after I did the *real* work (resolved a ticket), even though I never took the walkthrough. Not wrong exactly, but worth Mark knowing the checklist isn't literal — it's crediting adjacent actions, which could confuse someone trying to track their own onboarding.

## What worked

- The whole enrollment → password → PIN → home flow was linear, one thing at a time, no dead ends.
- Ticket resolution is the same two-field pattern everywhere ("What was done" + optional meter), and the copy on each ticket correctly reflects whether resolving changes the machine's status ("Resolving puts R1004 back to Active" vs "The machine stays in service either way") — I never had to guess what would happen.
- "Correct hours" and "Log a service done" sit directly under the big hour number and the service schedule respectively — exactly where I'd look, named in plain shop language, and both opened inline instead of a separate page/modal, so context (current hours, current schedule) stayed visible while I worked.
- Meter corrections write a permanent, attributed ledger line ("shop correction · Sam Rivera · was 4,212.3 · reason") — that's the audit trail a shop needs and I didn't have to ask for it.
- Locator's self-description ("from filed paperwork — last record → job → site · no GPS") pre-answered a question I would have had (why isn't this live GPS?) before I could even ask it.
- The "Unavailable" filter combining in-shop + out-of-service, sitting next to (not instead of) the narrower single-status chips, was exactly the shape of the task.

## What I'd tell Mark

Give the crew a heads-up that a "Welcome to ShotLog" tour can pop up over the home screen right after setting the PIN and can block your very first tap until you hit Skip — it's easy to think the app has frozen. Everything after that was self-explanatory for shop work: ticket resolution, meter correction, and logging a service were all exactly where I'd look, in plain language, with the right side-effects (status flips, due counters, audit trail) confirmed on-screen every time. One gap worth fixing before relying on the due-date math: there's no way I could find to log a service against a date other than today.

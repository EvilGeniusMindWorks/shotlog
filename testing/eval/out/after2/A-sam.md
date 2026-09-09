### Task 1 — Enroll, set PIN, reach home
expected:    open the invite link, set password, set a PIN, land on a shop dashboard
did:         open invite link › fill password › fill confirm › click "Create my account" › set PIN 246835 › confirm PIN 246835 › click "Let's go" on welcome card
taps:        9
wrong_turns: 0
consults:    none
finished:    yes
confusion:   none — straightforward, matched what I expected from Mark's note and the invite email
minutes:     3

### Task 2 — Resolve leak ticket, confirm active
expected:    open the R1004 ticket from the worklist, type what was fixed, mark resolved, check the rig flips to Active
did:         Home › (a "Welcome to ShotLog" tour overlay blocked my first click on the ticket — clicked Skip) › click R1004 ticket › fill "What was done" = "boom cylinder seal replaced" › click "Mark resolved" — landed straight on R1004's equipment page showing ● Active and the resolution in History
taps:        4 (1 wasted on the blocked click, 1 on Skip)
wrong_turns: 1, "first tap on the ticket did nothing because a welcome tour overlay was sitting on top of it"
consults:    none
finished:    yes
confusion:   "clicking the ticket card did nothing and the terminal said Timeout — I didn't realize a tour popup (invisible in the tree summary until I asked for the screen again) was covering it until I saw 'Welcome to ShotLog / 1 of 5' show up in the fuller read"
minutes:     2

### Task 3 — Resolve horn ticket on R-102
expected:    same pattern as task 2 — open the ticket, note the fix, mark resolved
did:         Home › click "R-102 Horn not working" ticket (now top of worklist) › fill "What was done" = "horn relay replaced" › click "Mark resolved"
taps:        3
wrong_turns: 0
consults:    none
finished:    yes
confusion:   none — this one went exactly as expected, second time through the pattern
minutes:     1

### Task 4 — Correct R1004's meter to 4,231
expected:    find the machine, look for a "correct hours" or similar control, enter the real reading
did:         Home › clicked a Fleet tile in the sidebar-collapsed dashboard that turned out to be the Locator page (wrong turn) › clicked R1004 on the locator, which expanded to "Mark at the yard" / "Open R1004" › Open R1004 › click "Correct hours" › fill Meter reads = 4231 › fill Why = "meter correction — actual reads 4231" › Save correction
taps:        7
wrong_turns: 1, "clicked the wrong dashboard tile (a locator preview posing as a Fleet-ish widget) instead of going straight to the machine"
consults:    none
finished:    yes
confusion:   none on the correction screen itself — it clearly showed old vs new value and asked for a reason; my confusion was purely on navigation (see wrong_turns)
minutes:     2

### Task 5 — Log engine service at 4,231h today
expected:    click "Log a service done", pick engine service, confirm today's hours
did:         R1004 page › click "Log a service done" › select "Engine service — oil, filters" (the At hours field was already pre-filled with 4231 from the ledger) › click Save
taps:        3
wrong_turns: 0
consults:    none
finished:    yes
confusion:   none — the "at hours" field being pre-filled from the ledger was a nice touch, and "Service logged — the due clock restarts from here" confirmed it; the schedule line flipped to "last at 4,231 h · Wed, Sep 9, 2026" and "0/250 ok"
minutes:     1

### Task 6 — Find where R1004 last worked
expected:    guessed "Locator" in the nav is exactly for this
did:         click "Locator" in the sidebar › read the "By last record" list — R1004 shows "Ledgeville Pit · checklist · Tue, Sep 8, 2026 · today". Answer: **Ledgeville Pit**.
taps:        1
wrong_turns: 0
consults:    none
finished:    yes
confusion:   none — I'd actually already stumbled onto this list once while looking for the machine page in task 4, so I recognized it immediately this time
minutes:     1

### Task 7 — Fleet view of everything unavailable
expected:    a filter chip on the Fleet/Equipment list, probably labeled something like "down" or "in shop"
did:         click "Fleet" in the sidebar › saw a Filter row with an exact "Unavailable" chip (plus separate "In shop" / "Out of service" / "Repair open" chips) › click "Unavailable"
taps:        1
wrong_turns: 0
consults:    none
finished:    yes
confusion:   none — result was exactly right: only R1006 (in shop) showed, count line read "Equipment · 1 of 12". R1004, which I'd just fixed, correctly fell out of the list.
minutes:     1

## Findings

1. **wrong result / cosmetic — Home dashboard, "Where's my equipment" widget.** Severity: slow. The Home page has a compact tile row of machine chips labeled "Where's my equipment" with an "Open the locator ›" link below it — but the chips themselves are also clickable and silently navigate straight to the full Locator page (no visual cue they're links, no hover state distinguishing them from the static ticket cards above). I clicked one expecting a quick detail popover and instead lost my place on Home. What would help: either make the chips visually button-like (they already look like small pills, so maybe fine) or make it clearer that these chips *are* the shortcut, since "Open the locator ›" implied the chips were just a preview, not a second way in.

2. **blocked (briefly) — Home, first-day tour overlay.** Severity: slow but could be "blocked" for someone less persistent. On my very first attempt to act (open the R1004 ticket), the click silently timed out. The overlay ("Welcome to ShotLog / 1 of 5", with Skip/Next) was sitting on top of the actual page content, but nothing in the immediate screen reading made it obvious a modal was the obstacle — the error just said "Timeout". A less patient person might have assumed the button was broken. What would help: the overlay should visually dim/cover the rest of the screen unambiguously, or the modal should trap focus so a screen-reader-style read immediately surfaces "Welcome to ShotLog" at the top instead of blending into the rest of the page tree.

3. **cosmetic — ticket resolution screen doesn't say where meter reading is used.** Severity: cosmetic. Both ticket screens have a "Meter now — optional" field, but I skipped it (used the dedicated "Correct hours" flow for the real correction instead) since it wasn't clear whether typing a number there would create a second, possibly conflicting, ledger entry alongside the one from Correct Hours. It worked out fine because the two tasks were separate, but a mechanic doing both at once might wonder which field is authoritative.

## What worked

- The whole ticket-resolve flow (type what was done → Mark resolved → machine flips to Active automatically) was exactly the mental model Mark's note implied, both times.
- "Correct hours" showing old value vs. new value plus a reason field, then landing an itemized ledger row ("was 4,212.3 · meter correction — actual reads 4231") — that's exactly the kind of paper trail I'd want as the shop mechanic.
- "Log a service done" pre-filling the "At hours" field from the current ledger reading saved a step, and the confirmation toast ("the due clock restarts from here") told me plainly that it worked.
- The Locator's "By last record" list answered "where did this thing last work" without me having to dig through the machine's history feed.
- The Fleet page's filter chips (Unavailable / In shop / Out of service / Repair open / Active / Retired / Due ≤30 d) are exactly the vocabulary a shop mechanic thinks in, and "Unavailable" did precisely what task 7 asked in one tap.

## What I'd tell Mark

Nothing here needs fixing before the crew starts — my only real snag was a tour overlay that ate one click, and I picked myself back up in one extra tap. The ticket-resolve → Correct hours → Log a service → Locator → Fleet-filter chain all matched what I'd expect a shop mechanic's day to look like, in the right order, with no dead ends.

## Guide pages

None opened — arm A allows consulting the guide when stuck, but I was never stuck badly enough to need it. Every confusion resolved itself within one extra tap by reading the screen again.

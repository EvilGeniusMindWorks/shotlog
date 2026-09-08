# Soft-launch runbook (Round S5 — 2026-09-06)

Status: **DRAFT — the four decisions at the bottom are Matthew's.**
Everything above them is what to do, in order, once they are made.

## 0. Before the first invite goes out

| # | Gate | State | Who |
|---|---|---|---|
| G0 | **Rehearse every role yourself first**: Settings › Rehearse as… (platform admin only) signs you into the sandbox company as a brand-new person of that role — PIN, welcome, walkthrough, empty home. Use *Add sample job* on the bar for something to work with; *End* wipes it. Send feedback from the ? menu as you go; sandbox notes land in Admin › Feedback (never emailed). | ✅ shipped S6 | Matthew |
| G1 | Resend key + sending domain on Railway (`RESEND_API_KEY`, `INVITE_FROM`) — invites and password resets email | ✅ live 2026-09-07 (shotlog.evilgenius.io) | — |
| G-probe | Uptime probe every 10 min with DOWN / RECOVERED emails (docs/ops-probe-and-load.md) | workflow shipped 2026-09-08 | Matthew: probe user + 4 GitHub secrets |
| G2 | Sign out / in once on prod so your session carries `platformAdmin` (Admin › Feedback tab appears); you will also see the walkthrough once | ❌ | Matthew |
| G3 | `npm audit --omit=dev` clean | see S5 check-off | done in S5 |
| G4 | USBM RI 8507 curve sign-off — docs/usbm-curve-signoff.md handed to a blasting engineer and signed | ❌ | Matthew → engineer |
| G5 | Test-user decision (below) | ❌ | Matthew |
| G6 | Prod smoke as admin: People · Roles · Jobs · Records · Admin › Feedback open; `/health` shows the current commit | ✅ each deploy | Claude |

## 1. Invite order (recommended)

Everyone is in the cohort (Matthew's Q1 call, including the shop). Stagger so
the first questions come from people who will ask them out loud:

1. **Mark (admin)** — already has an account. Walkthrough, People, Roles.
   He invites nobody until step 3.
2. **Evette (office)** — the queue home is provisional; her first week
   *is* the walkthrough we never finished. Ask her to send feedback from the
   ? menu on anything that reads wrong.
3. **One blaster + one driller who work together** — a real day end to end:
   start work → drill log from the rig → readiness → shots → seismo → file →
   Evette approves. Do this on a day with signal so the first run is clean.
4. **Remaining blasters and drillers**, then **the shop** (mechanic home,
   Fleet, Locator).

Each invite is: Admin › People → row ⋯ → Invite (email). The email carries
the three steps (password → PIN → install). If email is still off, copy
the link and text it; it works once and expires in 14 days.

## 2. First-day script (send with the invite, or read it to them)

1. Open the link, choose a password, choose a 6-digit PIN.
2. Install it: Android/Chrome offers "Install ShotLog"; iPhone/iPad is
   Share → Add to Home Screen. The welcome screen shows the right one.
3. Take the two-minute walkthrough (it starts by itself; ? → Walkthrough
   any time after).
4. Blasters: add your license and sign once in My Profile — sign-off is
   blocked without a license on file.
5. Stuck? ? → **About this screen**. Broken? ? → **Send feedback** — it
   works with no signal and goes straight to Matthew.

## 3. What to watch, daily, for the first two weeks

- **Admin › Feedback** (Matthew, platform admin): every report and every
  caught crash lands here with the screen, build, device and error log.
  Mark seen/done; the reply note is yours. Crash reports (kind `crash`)
  first.
- **Office home counters** (Evette): approvals oldest-first, sent-back
  outstanding, never-submitted > 3 days. Anything sitting there past a day
  is a conversation, not a bug report.
- **Job duplicates**: the one unreproduced artifact from the PowerSync
  cutover (a job created twice from the UI). Jobs lens sorted by last
  worked makes a duplicate visible at a glance.
- **Compliance badges**: until G4 is signed, treat an amber/red USBM badge
  as "look at the printout", not as a determination. See the sign-off doc
  for the 30 vs 40 Hz question.
- **Sync chip**: "N changes waiting" that does not drain within a minute of
  signal is a report (? → Send feedback includes the connection log).

## 4. Weekly review with Mark (30 minutes, same slot each week)

1. Admin › Feedback: walk every *new* row; decide fix / later / no. Mark
   done with a note so the list is the record.
2. Office home: what sat longest in each queue and why.
3. One question per role: "what did you do on paper this week that the app
   should have done?" — the answers are the next round's charter edits
   (docs/personas/*.md).
4. Decide what ships next week. Small copy fixes ship same day; anything
   that changes a screen gets a study first, as before.

## 5. Decisions needed from Matthew (S5)

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Test users**: wipe the dev company data, or keep dev as the permanent test bed? Prod is clean (Baystate roster + equipment + Matthew). | **Keep dev as the test bed and never point a real device at it.** The harnesses depend on its logins and seed; wiping buys nothing for prod. Record in decisions.md. |
| D2 | **USBM curve**: who reviews docs/usbm-curve-signoff.md, and should compliance badges carry an "advisory — pending engineer review" label until they sign? | Hand it to Baystate's blasting consultant or the seismograph vendor's engineer this week. **Label the badges advisory until signed** — a one-line UI change I can ship in an hour once you say so. |
| D3 | **Cohort order**: the staggered order in §1, or everyone at once? | Staggered (§1). Two weeks end to end. |
| D4 | **Cadence**: weekly review slot with Mark; who else attends (Evette)? | Weekly, Mark + Evette, 30 minutes; Matthew reads Admin › Feedback daily for the first two weeks. |

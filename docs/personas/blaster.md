# Blaster

Status: **WORKFLOW + SCREEN DESIGN APPROVED (Matthew, 2026-08-17)** — design study: claude.ai/code/artifact/9bfdcfb9-f864-4d03-a78d-df4c919b7fc5
Real people: Mark; other licensed blasters on larger jobs

## Who they are

A blaster is **essentially a supervisory role** (Mark). Senior capacity on
every job, **can reach everything** — but not always the job lead: large jobs
run several blasters at once. Licensed in multiple states; the license
drives what they may sign.

**Visibility (amended 2026-09-07, Matthew's invite test):** *unasked, the
home shows only the blaster's own work* — days they authored or worked
(a time card), patterns they laid, drilling finished on those patterns.
Everyone else's work is one deliberate step away: Days › Everyone, Records
› Company, the job page. Availability never narrows (the company's records
sync to every device; a second blaster can open Mark's day); attention
does. Office, admin and the shop keep seeing everything — that is their
job. This supersedes "blaster default view = ALL crews' days" (2026-08-17).

## The workflow, as validated (2026-08-17)

### Days before the blast
- Customer/site/job may be set up by the Owner or Admin, may already
  exist, **or the blaster sets them up personally** — especially on small
  jobs. → Blasters need CREATE/EDIT on customers/sites/jobs (capability
  grant; archive/lifecycle stays supervisory).
- Mark has a **rough shot design in mind when he lays the drill plan**,
  then **confirms/adjusts after drilling completes** — hazards, imprecise
  holes, surprises all move the design. → New step in the flow: a **shot
  readiness review** between drilling-complete and the blasting log:
  plan intent vs drilling actuals, adjust, then flow into the log.

### The morning of
- Entry happens **before / during / after, depending on the shot**.
  Design principle: *the simpler and more genuinely useful for planning
  the form is, the earlier it gets filled.* The form should BE his
  planning tool, not an end-of-day chore.
- Pre-blast ritual (notifications, surveys, guarding): nothing requested,
  but include a **placeholder checklist slot with editable language** for
  future inclusion.

### Reviewing the drilling
- **He loads differently based on hazards** — what, which hole, what
  depth. That detail must be easily at hand while making loading
  decisions (the decision logic stays in Mark's head; the app's job is
  the information).
- Multiple drillers file multiple logs against one plan. Mark needs the
  **full completed plan, merged, with per-hole attribution**: who drilled
  each hole, when, actual depth, conditions/hazards, notes.

### Designing the shot
- Timing is either/or (planned ahead or decided on site) — support both.
- **Compliance flags must explain themselves**: which rule, which numbers,
  why it trips ("predicted PPV 2.3 in/s exceeds Whately bylaw 1.0 at
  120 ft"). Never a bare warning.

### Loading and the shot
- Multiple shots per day, each potentially different.
- **Seismo data is point-in-time, tied to the specific blast's moment.**
  The unit records the shot; data gets attached then or later depending
  on when he does the form. Late attachment is NORMAL — link readings to
  the shot's time, never nag about missing readings mid-day.

### End of day
- Mark fills **his own** daily report: his hours, who worked with him,
  equipment used. **He expects every other crew member — drillers, other
  blasters — to file their own daily time card.** → Model shift: per-person
  time cards, aggregated into the day, replacing one-person-transcribes-all.
  (Touches every field persona + the office approval flow — confirm.)

### Multi-blaster days
- **The log is filled by the blaster responsible for the shot.** Two
  candidate models to put before Mark:
  (a) one log per day, each SHOT carries a responsible blaster + their
  signature (smaller change); (b) multiple logs per day, one per blaster.
  Today's one-log-per-day constraint must bend either way.

## Jobs to be done

1. ✅ Start/resume today's day in seconds, offline
2. ✅ Author the blasting log: shots, drill params, top-down explosive entry
3. ✅ Design plan: map sketch, structure distances, auto SD / PPV / compliance
4. ✅ Compliance EXPLAINS the why (Round 2: ComplianceSheet — rule, math,
   what-would-pass, on design badges + seismo results)
5. ✅ Shot readiness review (Round 2: new step between drilling-complete
   and loading; adjustments seed shots)
6. ✅ Merged completed-plan view with per-hole driller attribution
   (Round 2: color-chipped merged drilling review)
7. ✅ Hazards surfaced at loading time (Round 2: hazard rail in the shot)
8. ✅ Create customer/site/job himself (Round 1: `setup_jobs` capability —
   create/edit; archive/delete stays supervisory)
9. ✅ Own time card (Round 1: per-person `timeCards`, filed from the day's
   daily tab; ownership + approval server-enforced)
10. ✅ Per-shot responsible blaster / signature (Round 1: model (a) shipped —
    sign-off guarded to the responsible blaster at the choke point)
11. ✅ Pre-blast checklist placeholder (Round 2: hub card, language
    editable in Admin › Company, nothing recorded/enforced)
12. ✅ Drafts / sent-back days surface on the needs-attention strip
    (Round 2: sent-back leads with the office's reason inline)

## Sore points (audit 2026-08)

Field dashboard 13.5 screens (25.9 phone) — full history inline. My
Records 11.5 screens. Jobs list 53 rows, no search.

## Screens they touch

Field dashboard · work day (blast log, daily report, time card) · shot
form · shot readiness review (new) · design plan/map · explosive usage ·
seismo · submit/file · drill plan (author + merged review + accept) · job
page · customer/site/job create (new) · contacts · My Records · reference

## Never make them…

- re-enter anything the job/site already knows
- scroll past history to find today's work
- need signal to author or file anything
- transcribe another person's hours
- puzzle over an unexplained compliance flag

## Settled (2026-08-17)

- Per-person time cards confirmed; Evette approves BOTH the day and the cards
- Multi-blaster model (a): one log per day, each SHOT carries its responsible
  blaster + signature
- No job-lead designation — per-shot responsibility covers it
- Screen design approved: phase spine, needs-attention home (no KPIs for now),
  days-are-nouns language, time-card entry for no-login people allowed but
  discouraged (prefer self-service logins)

## Guidance served (Round S2, 2026-09-06)

- ✅ Walkthrough auto-runs once per account: Dashboard bands → + button → Jobs → My records → Help. Re-run from ? or Settings.
- ✅ "About this screen" from the ? menu on every screen the blaster touches: day hub (per view: blast log, daily report, readiness, drilling review), shot designer, seismo, file, drill plan, jobs, records, profile.
- ✅ First-week card on the home: license · sign once · walkthrough · start a day · file a day — ticks itself from the blaster's own records.
- ✅ Empty states say the next action (today band, month list, job days, drilling review, drill logs on a shot).

## Clutter sweep + records (Round S4, 2026-09-06)

- ✅ Daily Report tab: empty sections are one "+ Add" row; locked days hide them (~4 screens → 1.3 on a phone).
- ✅ Jobs rows answer "which job, when did we last work it": number · name · customer · town · last worked · day count; chips only when they say something; long-press peeks.
- ✅ My records is the records manager on a phone: list + preview sheet.

## Round S7 — first-rehearsal feedback (Matthew, 2026-09-07)

- **S7a (building):** rehearsal sample data gives the blaster yesterday's
  submitted day (log, shot, seismo, accepted drill log, cards) and today's
  draft at a second job, so the hub, review and file paths are testable
  without authoring from zero.
- **S7b (accepted):** the New work day dialog reorders to Name → Recent
  jobs / Customer → Site → Job → Date → Type of work (last day's type,
  else the job's default type, else drill-to-blast). One New job flow,
  top-down. Log out lives in My Profile only.
- **S7c (shipped):** the day tour runs once, the first time a work day
  opens — spine, tabs, then the shot: drill parameters, explosives
  top-down, design/compliance, sign-off and filing. Re-run from ? → "Show
  me your work day".
- **S7d (shipped):** the day is a container; **the blaster owns the
  report** on any day with a blast log regardless of who opened it (adding
  the blast log to a driller's day hands it over); each person owns their
  own card, log and checklist; Work Force is the day's time cards keyed by
  job + date (entered-for rows for no-login people; "worked today, no card
  yet" list, never editing another login's card); drill hours on the
  report derive from the rig's checklist and end-of-day meter; today's
  day is opened, not duplicated, and two offline copies merge from the day
  page. "Take over the report" for a second blaster is tabled with the
  multi-blaster decision.
- **Whose work shows up (accepted 2026-09-07, plan artifact ed13a981):**
  Today, Needs attention and the home's month list show only *my* days
  (authored, or I have a time card on it) and *my* patterns (I laid the
  plan). `/days` gets a Mine / Everyone switch, default Mine, remembered
  on the device; search spans Everyone. Records already opens on My
  records with Company beside it. Days from before the author stamp
  (pre-Sep 7) have no owner and live under Everyone only (Matthew cleans
  them up before real test users). PIN becomes per account on the device:
  sign-out and enrolling clear it, so a new account on a used browser is
  asked to set one.

## Round S8 — Matthew's eleven (2026-09-07, plan artifact 8d55ab6c)

- **Drill plan first, timing from what was drilled (S8a, accepted):** "Build
  plan" opens the shot in PLAN mode with timing and explosives folded away;
  a pinned footer reads *Plan ready · N holes* → **Send to drillers** /
  *Done for now*. The day's Continue knows every state — *Build the drill
  plan* → *Send the plan to drillers* → *Drilling — Dinis 14/32* → *Review
  drilling & build timing* → shots → seismo → file. After drilling, the
  timing tab opens on the DRILLED pattern: undrilled positions greyed and
  unwireable, wet/void holes marked, depths carried; the blaster wires,
  nothing is redrawn. A later drilling change shows as "drilling changed
  since you wired — review". The Send sheet keeps its header and button
  pinned; only the crew list scrolls. Matthew: "completely broken … had to
  back out … nothing to do" — the plan page never knew the plan was done.
- **Start work at a job (S8a, Option B — picker sheet):** Name first (S7b),
  then ONE *Job* row that opens a full-height picker: search, Recent chips,
  then Customer → Site → Job as a drill-down with a crumb; "+ New job here"
  inside the picker with customer and site already set. Back in the dialog:
  Job · Date + Type on one row · Copy from previous · a pinned Start. No
  scrolling to find the button. Matthew rejected a single searchable field
  ("Customer › Site › Job is the fastest path to refine the list") and a
  seven-section scroll.
- **Jobs section (S8b, Option 1 — drill-down):** the nav item stays *Jobs*
  and lands on customers; tap a customer → its sites; tap a site → its jobs;
  new customer / site / job only on their own level. Matthew: the "About
  this customer / site" details come FIRST (above the list — lists get
  long), no super-long scrolling lists (windowed, searchable), and he wants
  to see the wide-screen version before build.
- **S8a follow-up (2026-09-07):** the drilling review draws the same
  pattern shape as the plan (per shot), driller initials on each hole,
  hazards orange, off-plan holes below; a plan whose logs are all complete
  shows *ready to review* on the day spine.
- **S8b (2026-09-07, calls in):** Jobs lands on Customers; the customer and
  site pages put the About cards first, then the list; wide screens use the
  same pages (Pages, not columns). The flat jobs list is gone — recent chips
  and the search box (customers · sites · jobs, with paths) are the way to a
  known job. Lists windowed to 15.
- **Persona evaluation (2026-09-08):** both agent "Barrys" filed the day with
  the shot unsigned and nothing stopped them — then the signature was locked.
  Both found the off-plan hole only by counting, and looked for the seismo
  distance on the reading (it lives on Design plan › Compliance). The plan
  grid's Rows/Cols buttons and holes have no accessible names. **S9a batch 1:**
  filing pre-flight (red blocks on an unsigned shot; amber files with notes).
  Batch 3: off-plan badge, seismo Edit + distance line, grid names.
  (Per-shot signing itself is reversed in Round S16, below — one signature on
  the log covers every shot.)
- **Site map location (2026-09-09):** Matthew's three complaints — only the job's address, "not found" on a valid rural address, no way to use GPS or coordinates — become a location bar with four doors and a site that remembers its spot (decisions.md, plan artifact cec017d7).

## Round S11 — the first week's small fixes (2026-09-13, plan artifact 5961f1d5)

- Mark's first Beta job was made with the Site box left at "Pick site…"; the app invented a nameless customer and site. Now the site is required on a new job, the app never creates a nameless record, and an admin can move a job to another site.
- Explosive weights read to four decimals everywhere (Mark's ask, Matthew's call: "4 everywhere"); the printed powder-factor line shows the exact pounds it divided.
- The first-week card leaves on its own: all done, or the first day Mark files, or 14 days — and says so. It comes back from the ? menu.
- "Which job?" puts jobs within two miles at the top with the distance when Mark allows his location; it never picks for him. Starting a day at a site with no map spot offers to remember where he is standing.
- A crash on his phone reaches Matthew without a Report tap; the Report button still adds his own words.

## Round S12 — where I am, and a ring around the blast (2026-09-13, plan artifact 4a8a1f2a)

- On the site map Mark sees a blue dot where he stands, with its accuracy; "Pin the blast here" drops the blast pin under his feet. The dot is him, not the record.
- A 250 ft ring (his number to change) sits around the blast pin, saved with each shot and printed on the log's map; the structures inside are listed by name, nearest first.
- Structure pins get names when dropped; the closest one is offered for the plan's compliance distance whenever it changes — offered, never filled in — and using it redoes the scaled-distance maths at once.

## Design week + Round S13 — a day at a job (2026-09-14, design df4d6790, prototypes 5035558b)

- **Blasters are the supervisors** (Mark, Sep 14): on a day the blaster sees their own papers first, then every person on the day with the state of each of their papers, and can open any of them, accept a completed drill log, and remind someone whose card is missing. The separate supervisor role stays in the system; Baystate does not use it.
- Whoever opens the job first sets up the day's card (on-site time, type of work, weather from the NWS with the ground suggested); everyone after confirms it with one tap or fixes it. Mark never types who was there: the people who confirmed are on the day, and the daily report's crew is still the time cards.
- Two phones on one card: the first value to reach the server sticks; a later disagreement comes back to that person as a decision with both values and who set each. Nothing shared is overwritten silently. Documents are each one person's and never collide.
- Papers exist only when someone taps Start on them. A day with only time cards is a real day. Filing a blasting day needs the blasting log with every shot signed; a daily report nobody started is an amber note.

## S14 — the hub (Sep 14 2026)

- **Tiles open the day, not the spine.** Mark's day now opens on one tile per paper — Blasting log, Daily report, My time card — each showing that paper's real state with one button: **Start** or **Open**/**View**. The first unfinished tile carries "Up next". The three tabs and the phase spine with **Continue** did not go away — they live inside the Blasting log tile; **Back to the day** returns to the tiles. The old "Add Blasting Log" strip is now that tile's **Start**. Supervisors and admins see the same set; office stays read-only.
- **File this day** sits at the bottom of the tiles, present only when a paper exists to file — a blasting day needs every shot signed ("2 of 3 shots signed" until then), a missing daily report files with an amber "No daily report" note, a time-card-only day files nothing here (cards file and approve on their own). The pre-flight is unchanged.
- **The crew list** sits under Mark's tiles: one row per person on the day — anyone who confirmed the card, filed a rig checklist, or has a drill log or time card there — with the state of each of their papers. Tap a row to read any of them, **Accept** a drill log signed complete, or **Remind** a missing time card (one line lands on their home and clears when they file). Two blasters on a day both see the list and each signs their own shots.
- **Big crews** (eight or more) add a summary line ("Cards 7 of 11 filed · 1 drill log open · 1 waiting on you"), a **Needs something / All** filter defaulting to Needs something, and a search box; rows that need something float up. The daily report's crew section reads the same list.
- What stays: the forms themselves, the filing pre-flight, and approvals — only how Mark gets to them changed.

## S15 — rough edges, audited one by one (Sep 14 2026)

- **Identify hazards and Precautions taken** open as a checklist now — big tickable rows plus a typed "Other…" line — instead of a chip strip; what gets filed and printed hasn't changed.
- **Blast mats** keeps its Yes/No; saying Yes now asks how many, and the printed log reads "Blast mats: Yes · 12."
- On a phone, the day's report/contacts/history/print icons tuck into one **More (⋯)** button so the header stays clean; **Submit to Office** is gone from up there — **File this day** at the bottom of the tiles is the only way in, same as it already was.
- The conditions line reads the time once — "On site 1:56 am · Barry, Dinis · NWS 1:30 am" — instead of repeating it.
- A day that never got anywhere (rained out, started by mistake, nothing to show for it) can be **closed** from the bottom of the tiles with a reason, instead of sitting open with nothing to file; **Reopen** brings it back.
- The app checks for a new build the moment Mark's phone comes back to it, and updates itself quietly on the home screen — no more finding himself on a stale build and thinking nothing changed.

## Round S16 — one log, one blaster; a job on a date (2026-09-15, plan artifact 59ebb05f)

- **One log, one blaster, one signature (his rule):** the per-shot Responsible
  Blaster row is gone — the blasting log's Blaster Signature box is the only
  signature, and it covers every shot on the log. Reverses Round 1's
  multi-blaster model (a) (see Settled, above). A second blaster on the day
  is crew: he files his own time card, not a second sign-off.
- **A work day is one job on one date** — true since S13's one-BlastDay-
  per-job-per-date rule, and now the app says so out loud: **File this day**
  carries a quiet "Job · date" line under it, and the start-work dialog reads
  "Start a day at a job".
- **Change the date — tap the date in the header.** A sheet lists what moves
  with the day: the card, the blasting log and its shots, the plan, the
  daily report, drill logs, time cards (filed ones too — their owners see a
  line on their home), confirmations and reminders. It's blocked once the
  day has an office copy on it, or once the target date already has a day
  for this job with papers on it — open that day instead. Only the day's
  starter or a supervisor may move it. The header date turns amber
  "· not today" whenever the day isn't today and nothing on it is filed yet;
  the start-work dialog gets the same Today / Yesterday / Tomorrow / pick-a-
  date row.

## Round S17 — the driller's home, and the feedback fixes (2026-09-15, plan artifact ccd90447)

- **The Drill plan screen reorders around "The shot."** Diameter, burden,
  spacing and the depth for every hole sit in one card at the top; the
  brush — depth, angle, **⌀ No hole** — moves onto the grid itself; the
  footer names the four numbers instead of just "Plan ready." The same
  numbers write to the shot and seed the driller's drill log header.
- **New timing diagrams open at 25 ms between holes** (Mark's rule); a
  diagram already wired keeps whatever numbers it has.
- **The pattern check (30 CFR 816.67) now reads against the compliance
  card.** It compares the worst 8 ms window in the wiring to the job's
  **Max holes/delay** and rings only the holes over that limit — not
  every hole within 8 ms of another. A job with no Max holes/delay set
  never turns red.
- **S18 (Sep 16 2026), from his thirteen feedback reports.** Every number
  and text box keeps what he types and saves when he pauses — no more
  "30 becomes 3" on the phone. A feedback bubble sits in the corner of
  every screen (over sheets, on the print screens) during beta. The shot's
  totals fill from the accepted drilling; **Time of shot** moves to the
  shot's header; blast mats are one row on the log. The drilling review
  shows the log's header numbers, a hole list, the driller's note, and
  **Send back…** with a note. A second shot's card offers **Build the
  drill plan ›**; the review grids keep one hole size. The column builder
  starts at the toe. The daily report can be marked **Done** before the
  day files.
- **S19 (Sep 16 2026).** Pay yards fill themselves — square feet ×
  (average depth − sub drill) ÷ 27, the rock down to grade (Matthew's
  call) — and a number he types holds until he takes the drilling's
  figures back. A feedback report from any screen names that screen
  (job, date, shot) for Matthew's inbox.
- **Navigation round, push 1 (Sep 16 2026).** Every arrow says where it
  goes and goes there: up one level, or back to the list he came from.
  The day's tabs are real steps, so the phone's back gesture walks them.
  Marking the daily report done lands on the day.
- **Navigation round, push 2 (Sep 16 2026).** The Blasting log tile opens
  the Walkthrough: Drill plan → Drilling → Review drilling → Fill out the
  blasting log → Check and sign → Mark the blasting log complete, one ring,
  Next: … The check screen needs seismo readings on every shot before
  Complete. File this day waits for the log complete and the report done.

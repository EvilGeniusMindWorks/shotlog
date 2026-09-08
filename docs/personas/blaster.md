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

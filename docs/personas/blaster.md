# Blaster

Status: **WORKFLOW + SCREEN DESIGN APPROVED (Matthew, 2026-08-17)** — design study: claude.ai/code/artifact/9bfdcfb9-f864-4d03-a78d-df4c919b7fc5
Real people: Mark; other licensed blasters on larger jobs

## Who they are

A blaster is **essentially a supervisory role** (Mark). Senior capacity on
every job, **sees everything** — but not always the job lead: large jobs
run several blasters at once. Licensed in multiple states; the license
drives what they may sign.

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

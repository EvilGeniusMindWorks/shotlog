# ShotLog Personas

One page per person the tool serves. Every future round names the persona(s)
it serves and closes gaps listed here. Charters get amended BEFORE code —
this file is the governing document, the audit
([walkthrough-audit-2026-08.md](walkthrough-audit-2026-08.md)) is the
evidence behind it.

Legend: ✅ served today · 🟡 partially served · ❌ missing · ❓ open question for Mark/Matthew

---

## Blaster (crew lead in the field — Mark's day job)

**Their day:** arrive on site, open (or create) today's work day, review the
drill pattern (accept the driller's logs), design the shot (K, scaled
distance, delays), load top-down by product totals, shoot, capture seismo
printouts, sign, submit the day to the office before leaving.

**Jobs to be done**
1. ✅ Start/resume today's day in seconds, offline (TodayCard + StartGrid)
2. ✅ Author the blasting log: shots, drill params, top-down explosive entry, typical column
3. ✅ Design plan with map sketch, structure distances, auto Scaled Distance / PPV / compliance
4. ✅ Import the standalone drill plan into the shot + coverage verification
5. ✅ Accept drill patterns (locks hole rows), review drilling
6. ✅ Capture seismo printouts by camera; compliance status computed
7. ✅ File the day: searchable PDF office copy, offline-capable, versioned
8. ✅ Tap-to-call site contacts offline
9. 🟡 See what still needs finishing — TodayCard covers *today* only; yesterday's
   unfinished draft hides inside a 13-screen history list (audit #1)
10. ❌ A "my week" view: which sites, which days unsubmitted, what got sent back

**Sore points found:** field dashboard is 13.5 screens of scroll (25.9 on a
phone) because the full day history renders inline; My Records is 11.5
screens with no time window; Jobs list has 53 unfiltered rows and no search.

**Never make them:** re-enter anything the job/site already knows; scroll
past history to find today; need signal to file paperwork.

❓ Should a blaster see ALL crews' days or default to their own? (today: all)

---

## Driller

**Their day:** see which plan they're drilling, start today's log against it,
per-hole big-type entry (depth, kick, conditions) with gloves on, note
hazards at depth (water, voids), sign the log complete, checklist the rig,
file drill-only work days.

**Jobs to be done**
1. ✅ Focused home: today's log one tap away (DrillerHome — 2.5 screens, the model citizen)
2. ✅ Plan-driven logging: big-type hole panel, derived angle/length from kick
3. ✅ Hazard capture at depth + notes
4. ✅ Rig checklists that feed the shop's repair queue
5. ✅ Drill-only work days + daily report + submit
6. 🟡 Finding *their* plan: plans are job-scoped; any driller sees all plans on
   all jobs — fine at 2 drillers, noisy at 6
7. ❌ Dispatch/assignment: "where am I drilling tomorrow" doesn't exist

**Sore points found:** /days full-history browse (12.9 screens) when they
look beyond today; Jobs list noise (53 rows).

❓ Does Baystate want plan→driller assignment, or is "everyone sees every
plan" how the crew actually works? (Affects round scope significantly.)

---

## Shop (Mechanic)

**Their day:** work the repair queue, keep hour meters honest, put machines
in/out of service, retire dead iron, see what the field flagged on
checklists.

**Jobs to be done**
1. ✅ Repair queue home (MechanicHome — 1.0 screens, todo-style done right)
2. ✅ Resolve/reopen tickets (capability-gated), checklist defects feed tickets
3. ✅ Equipment registry: add/edit/retire (retire is supervisor/admin — shop requests)
4. ✅ Hour meters from the field roles that run the machines
5. 🟡 Equipment history: the detail page is 4.8 screens of inline history
6. ❌ Preventive maintenance: hour-interval services (250h/500h) with due
   warnings — the hour meters to drive it already exist
7. ❌ Parts/cost on repairs — feeds Owner profitability later

**Never make them:** dig through job paperwork to find machine problems —
checklendar/tickets must keep coming to them.

---

## Office

**Their day:** approve submitted days (or send back), process incident
claims, pull filed PDFs for regulators/customers, keep the roster and COIs
current, answer "did we blast at X on Y?" in under a minute.

**Jobs to be done**
1. ✅ Approvals queue (1.0 screens, clean); approve/send-back with audit trail
2. ✅ Filed, versioned, SEARCHABLE PDF office copies; binder CSV export
3. ✅ Incident claim processing (their write grant; close is theirs alone)
4. ✅ Full read visibility of company data; audit trail of every write
5. 🟡 Compliance clocks: COI + permit expiries are captured with countdown
   pills, but nothing SURFACES them — no expiry queue on any office screen
6. ❌ "Missing paperwork" view: days worked but never submitted — silence
   looks the same as done
7. ❌ Customer-facing package: everything filed for job X between dates, one export
8. ❌ Billing handoff: what's approved-but-uninvoiced (ties into Owner round)

❓ Who plays Office at Baystate today — a person, or Mark wearing the hat?

---

## Owner (NEW — no role exists yet)

**Who:** the principal. Full and total access. Cares about winning work,
pricing it right, and whether jobs/sites/customers make money.

**Jobs to be done (all ❌ today — this is the new build)**
1. ❌ **Quoting**: price new work from ShotLog's own history — the app already
   captures per-site powder factors, drill footage, yards shot, and crew
   hours: the actuals a quote should be priced from
2. ❌ **Profitability** by job / site / customer: needs inputs the app doesn't
   capture yet — labor rates, product costs, equipment rates, and revenue
   (quote/contract value). The QUANTITIES are all captured; the DOLLARS are not.
3. ❌ Pipeline: quoted → active conversion (jobStatus 'quoted' just shipped — the hook exists)
4. ❌ Exposure dashboard: COI/permit expiries, open incidents, compliance %
5. 🟡 Full access: the roles engine can grant it today; an Owner role +
   'office'-style home is one definition away

**Prereq decisions before building:**
❓ Where do rates/prices live and who may see them? (Suggest a
`view_financials` capability — hours are already restricted; dollars more so.)
❓ Quote structure Baystate actually uses: per-yard? per-ft drilled? lump sum
by mobilization + drilling + shot? (Get a real quote from Mark.)
❓ Is Owner = Matthew, Mark, or a Baystate principal? Charter emphasis shifts.

---

## Admin

**Their day:** onboard people, assign roles, keep the catalog/company/jobs
reference data right, fix what the field got stuck on.

**Jobs to be done**
1. ✅ People = one list; logins are a property of a person; invites
2. ✅ Configurable roles: capability bundles, custom roles, protected admin
3. ✅ Catalog (60+ products), company details, customers/sites/jobs setup
4. ✅ View-as impersonation for support; audit trail
5. 🟡 View-as doesn't list custom roles yet
6. 🟡 Jobs administration at scale: no archive/bulk close, inactive jobs mixed
   into the same 53-row list
7. ❌ Data lifecycle: nothing ever leaves a list (no archived state for old
   jobs/days beyond isActive)

---

## Cross-persona invariants (the things drift must never break)

- Offline is not a feature, it's the substrate — every field write works with zero signal
- Server is the only enforcer; client checks are curtesy
- One entry per fact: the hierarchy (customer→site→job) exists so nothing is typed twice
- Filed documents are immutable; corrections are new versions
- The paper forms are the contract: PDFs must stay recognizable to the people who signed the originals

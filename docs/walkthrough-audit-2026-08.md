# Walkthrough Audit — August 2026

Every persona walked through their day on the app as built (local stack,
87 work days / 52 jobs / 27 customers of accumulated test data — a fair
proxy for months of real Baystate use). Instrumented sweep:
`testing/two-device/audit-sweep.mjs`. Companion charters:
[personas.md](personas.md).

## Headline

The workflows are in good shape — every persona can complete their core
day, offline, with server-enforced permissions and an audit trail. The
failures are **presentation at volume**: half the app's screens render
unbounded history, and the worst of them is the field dashboard.

## Scroll depth by screen (screens of content at 1280×900)

| Screen | Depth | Rows | Search? | Verdict |
|---|---|---|---|---|
| Field dashboard `/` (blaster, supervisor) | **13.5** (25.9 @ phone) | 87 days | yes | **worst offender** — full history inline under the KPIs |
| `/days` (all roles) | **12.9** | 87 days | yes | same `WorkDayList`, same problem |
| My Records `/records` (blaster) | **11.5** | all ever filed | yes | no time window |
| Jobs `/jobs` (every role) | **4.8** | 53 jobs | **no** | active + inactive mixed, no search box |
| Equipment detail `/equipment/:id` | **4.8** | — | no | history inline, unwindowed |
| Admin People | 4.4 | all people | yes | acceptable, watch it |
| Admin/office home `/` | 4.3 | 8 | no | borderline |
| Sites lens | 4.2 | 50 | no | needs search + windowing |
| Job detail (busiest job) | 3.2 | 29 work days | no | work-days section unwindowed |
| Records (company lens) | 2.1 | — | yes | already windowed-ish — fine |
| Driller home | 2.5 | 13 | no | **the model**: today's work first |
| Mechanic home | 1.0 | queue only | no | **the model**: todo, not history |
| Approvals | 1.0 | pending only | no | **the model** |

**Root cause (one bug, many screens):** `WorkDayList` (Dashboard.tsx) and
its cousins render `filtered.map(...)` over the *entire* table with no
window, no grouping, no "show older". The blob-free projections shipped in
the integrity round mean these lists are *fast* — they're just endless.

**The pattern that works is already in the app**: MechanicHome, Approvals,
and DrillerHome all lead with "what needs me now" and bound the rest. The
fix is to make every list screen behave like those three.

## Smart-list prescription (Round C)

One shared treatment, applied in priority order:

1. **Field dashboard + /days** — "Needs attention" strip first (open
   drafts any date, sent-back days, unaccepted drill logs), then work days
   grouped by month, current month open, older months collapsed with
   counts, `Show older` beyond 90 days. Card view stays for the open group only.
2. **My Records** — same month-grouping + existing search; default to last 60 days.
3. **Jobs (all three lenses)** — default filter Active, search box, status
   chips; inactive/complete behind a toggle. Sites lens same.
4. **Equipment detail** — history sections collapsed by default, last 10
   entries + "Show all".
5. **Job detail work-days section** — last 10 + count + "Show all" (it's
   already inside RecordShell sections, so this is small).

Definition of done: no screen over ~4 screens deep at current test volume;
every list >15 rows has search; every history list has a bounded default.

## Per-persona findings

Full detail in [personas.md](personas.md); deltas only:

- **Blaster** — workflows complete; visibility of *unfinished* work is the
  gap (yesterday's draft is buried). Needs-attention strip fixes it.
- **Driller** — best-served persona today. Open product question:
  plan→driller assignment ("where am I tomorrow") doesn't exist. Ask Mark.
- **Shop** — queue works; equipment history too deep; preventive
  maintenance (hour-interval services) is the obvious next capability —
  meters already captured.
- **Office** — approvals/filing/incidents solid. Missing: an expiry queue
  (COI + permits are captured but nothing surfaces them), a
  "worked-but-never-submitted" view, per-job export package.
- **Owner** — everything is new. Quantities for quoting/profitability are
  captured (PF by site, footage, yards, hours); **no dollars anywhere** —
  rates, product costs, revenue all absent. That's the Owner round's real
  scope, and it needs Mark's quote structure first.
- **Admin** — solid; jobs administration needs lifecycle (archive), View-as
  should list custom roles.

## "Are we coding ourselves into a box?" — constraints review

Deliberate, fine to keep:
- Single-company tenancy (schema has companyId everywhere; multi-company is a config lift, not a rewrite)
- Filed submissions write-once; corrections as versions
- Client-assigned job numbers / shot numbers with collision healing
- One `records` sync table (server enforces per-table rules at one choke point)

Recently widened (good):
- Roles are now capability bundles, not hard-coded — Owner is one definition away
- Customer→Site→Job hierarchy exists; profitability can aggregate at all three levels
- jobStatus 'quoted' exists — the pipeline hook for the quoting tool

Watch list (would become boxes if ignored):
- **No money model.** No rates, costs, or prices anywhere. Adding them is
  additive schema, but the *permission* question (who sees dollars) should
  ride on a new `view_financials` capability from day one.
- **No archival lifecycle.** isActive is the only aging mechanism; lists
  will keep growing. Smart lists mitigate; a real archived state finishes it.
- **Assignment/dispatch doesn't exist** (driller↔plan, crew↔day are
  inferred from what people log, never planned ahead). If Baystate wants
  scheduling, it's a new concept — flag before it's urgent.
- **View-as & tour** know only built-in roles.

## Proposed round order

1. **Round C — Smart lists** (dashboard first; the prescription above)
2. **Round D — Owner foundation**: Owner role + money model (rates/costs/
   revenue behind `view_financials`) + profitability views ← needs Mark's
   quote structure + rate-visibility decisions
3. **Round E — Quoting**: price-from-history tool feeding jobStatus 'quoted' pipeline
4. **Round F — Office queues**: expiry queue, missing-paperwork view, export package
5. **Round G — Shop PM**: hour-interval services
6. Persona polish as audits re-run

Decisions this audit needs from Mark/Matthew are marked ❓ in personas.md.

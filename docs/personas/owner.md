# Owner

Status: **DRAFT — awaiting Matthew**
Real people: **the owner(s) of the blasting company** (Baystate principals)

## Who they are (updated 2026-08-17)

The business. **Full and total access** — nothing in the company's data is
hidden from an owner. Cares about winning work, pricing it right, and
whether jobs, sites, and customers make money. Distinct from Company Admin
(configuration) and from Platform Admin (Matthew / the software vendor —
see [platform-admin.md](platform-admin.md)).

## Jobs to be done (mostly ❌ — this persona is the new build)

1. ❌ **Quoting new work**: price from ShotLog's own history — the app
   already captures per-site powder factors, drill footage, yards shot,
   and crew hours. A quote tool should start from those actuals, not a
   blank spreadsheet.
2. ❌ **Profitability** by job / site / customer: the QUANTITIES are all
   captured; the DOLLARS are not. Needs labor rates, product costs,
   equipment rates, and revenue (quote/contract value) added to the model.
3. ❌ Pipeline: quoted → active conversion (jobStatus 'quoted' exists — the hook is there)
4. ❌ Exposure at a glance: COI/permit expiries, open incidents, compliance %
5. ✅→trivial Full access: one role definition away in the roles engine

## Prerequisite decisions (before Round D)

- ❓ How does Baystate structure a quote — per-yard, per-foot drilled,
  lump sum (mobilization + drilling + shot)? Get a real quote from Mark/owners.
- ❓ Where do rates/prices live and who may see them? Proposal: a
  `view_financials` capability from day one — hours are already
  restricted; dollars more so. Owner + (probably) Office hold it.
- ❓ Does the Owner want to WRITE anything (quotes, rates) or is everything
  else read-only for them?

## Screens they'll need (all new — screen phase designs these)

Owner home (KPIs, pipeline, exposure) · quote builder · quote list /
pipeline · profitability views (job, site, customer drill-down) ·
rate/cost setup (or does Office maintain rates?)

## Never make them…

- export to a spreadsheet to know if a job made money
- ask someone for a number the app already has

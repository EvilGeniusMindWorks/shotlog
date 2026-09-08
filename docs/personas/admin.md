# Company Admin

Status: **DRAFT — awaiting Matthew**
Real person: Mark today (wearing the hat)

## Who they are (updated 2026-08-17)

The **company's** administrator — people, roles, reference data, fixing
what the field got stuck on. Explicitly distinct from **Platform Admin**
(Matthew / the software vendor — app-level administration, see
[platform-admin.md](platform-admin.md)). Today Mark holds this role; as
the roster grows it may move to Office or an owner.

## Jobs to be done

1. ✅ People: one list, logins as a property of a person, invites, role assignment
2. ✅ Configurable roles: capability bundles, custom roles, protected admin
3. ✅ Catalog (60+ products), company details, manufacturers
4. ✅ Customers / Sites / Jobs setup (direct screens + dropdown job create)
5. ✅ View-as impersonation for support; audit trail of everything
6. 🟡 View-as doesn't list custom roles yet
7. 🟡 Jobs administration at scale: no archive/bulk close; inactive jobs sit
   in the same list
8. ❌ Record lifecycle: no consistent archive/delete mechanism anywhere —
   see [../deletion-pattern.md](../deletion-pattern.md) (proposal)

## Screens they touch

Admin area (People, Roles, Approvals, Catalog, Equipment, Incidents,
Company) · customers/sites/jobs setup · everything else read

## Never make them…

- fix data by asking a developer
- wonder who changed what (audit trail answers it)

## Explicitly NOT theirs (2026-09-06)

- **User feedback and crash reports** go to the platform admin (Matthew),
  not the company admin — Matthew's Q2 call in the soft-launch review.
  Mark sees no Feedback tab; the server refuses him the routes. Revisit if
  Baystate wants its own in-app suggestion box later.

## Guidance served (Round S2, 2026-09-06)

- ✅ Walkthrough: Company home → People → Roles → Records → Help.
- ✅ "About this screen": People, Roles, Company home, Feedback (platform admin only), plus everything the other roles get.
- ✅ Screen tours (Round S7c, 2026-09-07): People (Add person · one line each · the ⋯ menu) and Approvals run once on first open; re-run from ? → "Show me …".
- ✅ First-week card: walkthrough · invite a person · read Roles once · check company details · try View as.

## Add person in one shot (Matthew, 2026-09-07 — mockup accepted, all four calls)

- ✅ One panel: First · Last · Role · Email · Access (invite / create login
  with a temp password / roster only). The button says what it does: *Add
  person* · *Add & send invite* · *Add & create login*. A typed email
  defaults to Invite; blank email defaults to roster only.
- ✅ Offline is honest: the roster add works offline as before; the two
  login options grey out with the reason. If the server half fails, the
  person is still on the roster and the panel says so.
- ✅ Duplicate guard: a name already on the roster is not added twice — the
  panel offers to open the existing person.
- ✅ Existing people keep Invite / Login / reset / deactivate on the ⋯ row.
- ✅ The People list reads and sorts "Last, First" (`crewMembers.lastName`,
  stamped on new people; older rows derive it from the last word of the
  name — no migration). `name` stays "First Last" everywhere else.
- ✅ Paste list takes an optional email per line and invites those people
  in bulk (online); links are listed when email is not set up.
- Not done: editing the derived last name on the person page (the person
  page has no name editor today) — add if a real name splits wrongly.

## Clutter sweep + records (Round S4, 2026-09-06)

- ✅ People: one-line rows, 15 + Show all, actions behind ⋯ (4.4 screens → 1.1). Catalog 15 per manufacturer tab. Company home keeps the costing table, windowed 10 + Show all.
- ✅ Records manager (shared with Office) — job 8's lifecycle work stays as recorded in deletion-pattern.md.

## Round S8b (2026-09-07)

- Equipment: grouped tabs (Drilling · Trucks & trailers · Machines · Blast gear) with counts, type chips, search across groups, filter chips (status · repair · due ≤30 d), "+ New" presets the type, Import stays. The repair queue is no longer on this page — it is the shop's list (shop home). Legacy buckets show a "legacy — set the type" mark until re-typed.
- Jobs: lands on Customers; About cards first on customer and site pages; lists windowed; the flat jobs list and the lens switch are gone (search + recent chips).

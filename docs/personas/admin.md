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

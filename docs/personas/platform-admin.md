# Platform Admin (NEW — 2026-08-17)

Status: **DRAFT — awaiting Matthew**
Real person: **Matthew** (the software company supplying ShotLog)

## Who they are

The vendor, not the customer. Matthew represents the company supplying
the software, may eventually have additional platform-side users, and
needs **app-level administration** — a different thing from any company's
Office/Admin role. Today ShotLog is single-tenant (Baystate) and Matthew
operates through a company admin account; this charter exists so
architecture decisions account for the separation BEFORE it's urgent.

## Jobs to be done (all future — none built)

1. ❌ Tenant management: onboard a new blasting company (company record,
   first admin, seeded catalog/roles), suspend, offboard
2. ❌ Cross-tenant support: see a company's health (sync status, errors,
   version adoption), impersonate WITH consent/audit for support
3. ❌ Platform configuration: feature flags per tenant, plan/billing
   eventually
4. ❌ Operational visibility: server health, storage, failed uploads,
   audit of platform-level actions
5. ❌ Platform-side user management: additional vendor staff with
   platform roles (support vs engineering vs billing)

## Architecture implications (why this charter exists now)

- **Tenancy is already sound**: every record carries companyId; sync
  buckets by company; permission enforcement is per-company. Multi-tenant
  is a lift, not a rewrite — keep it that way.
- **Platform roles must NOT live in the company roles engine.** Company
  role definitions are per-tenant data; platform administration is above
  tenants. Likely a separate `platformRole` on the User (or a separate
  service) — decide when the second tenant appears, but don't build
  anything that assumes "admin" is the top of the world.
- The audit trail should eventually distinguish "company actor" from
  "platform actor acting in support".

## Never make them…

- touch a tenant's data invisibly — platform access is consented and audited
- redeploy to onboard a customer

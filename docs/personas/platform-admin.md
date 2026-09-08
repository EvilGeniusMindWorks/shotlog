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

## Jobs to be done

0. 🟡 **Feedback & crash triage (Round S3, 2026-09-06):** every user can
   send feedback / a crash report from any screen, offline included; it
   lands in a server-side `Feedback` table that never syncs to devices,
   emails the platform admin, and is triaged in Admin › Feedback — a tab
   only a platform admin sees. Platform admin = account email listed in
   `PLATFORM_ADMIN_EMAILS` (fallback: bootstrap `ADMIN_EMAIL`). This is the
   first platform-actor marker; it lives in env, not in the company roles
   engine. Single tenant today; the routes are not company-scoped for
   platform admins, so cross-tenant listing is a filter away.
0b. 🟡 **Rehearsal mode (Round S6, 2026-09-07):** Matthew's call — "I need
   to test as each user type, onboarding and tour included, regularly,
   without the complexity." One switch in Settings › Help (platform admin
   only): *Rehearse as <role>* signs him into a **sandbox company** as a
   brand-new person of that role (PIN → welcome → walkthrough → empty
   home); a sticky bar offers *Add sample job* and *End*, which wipes the
   sandbox and signs him back in as himself. The invite email and the
   install prompt are role-independent and tested once for real. This is
   also the first tenant the platform ever creates programmatically — the
   seed of job 1 below.
   **S7a amendment (2026-09-07):** Start copies the platform admin's OWN
   company's equipment, roster (as people without logins), catalog,
   manufacturers, company settings and custom roles into the sandbox
   (switch: *Start with your company's data* / *Start empty*), and *Add
   sample data* loads a connected week — two jobs, a plan half drilled by
   the rehearsal driller, yesterday's submitted day with cards, today's
   draft, a failed checklist → ticket + rig in shop, a rig with service
   due, an open incident — so every role has real work in front of them.
   The copy is made fresh on every Start and wiped on End; the source
   company is never written.
1. 🟡 Tenant management: onboard a new blasting company (company record,
   first admin, seeded catalog/roles), suspend, offboard.
   **S8c (2026-09-07):** companies carry an environment (alpha · beta ·
   production · sandbox); Admin › Companies (platform tab) creates one from
   another's reference data or empty, renames, deletes non-production ones,
   and **moves people** between companies (go-live); Settings › Company
   switches the platform admin between companies through hidden admin twins
   (`User.platformRootId`). The first admin of a new company is a moved
   person or an invite sent from inside it. Suspend/offboard still open.
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

## Round S8c (2026-09-07) — environments

- Matthew: "Baystate Blasting (Alpha)" for his own testing, "(Beta)" for the
  testers he is about to onboard, plain "Baystate Blasting" at go-live. The
  tag goes AFTER the name.
- One switch in Settings (platform admin only) moves the device between
  companies; the header/sidebar show the company's name with an ALPHA / BETA
  tag; invites go to the company you are in and the mail follows its
  environment (testing invitation vs the real one).
- Go-live = New company (production, from Beta's reference data) → Move
  people → each moved device signs in once. Beta stays as the test bed, so
  the pre-invite clean-up of test days is unnecessary.
- Never: a production company deleted from a button; a twin visible in a
  company's People; a company admin seeing the switcher or other companies.

# Soft-Launch Readiness — review + plan (2026-09-06)

Status: **APPROVED 2026-09-06** via the review artifact
(claude.ai/code/artifact/06afbdee-a191-4f1e-85c9-a948f4639340). All 26
round items = Build. Findings all "fix it" except three marked "talk
first": I1 (settled by Q7 = build the office queue now), I4 (jobs-card
chips — what to keep is open), L6 (records density — no fix proposed).
Matthew's calls: Q1 cohort = **everyone incl. shop**; Q2 feedback to
**Matthew only**; Q3 screenshot **on by default**; Q4 **some iOS** in the
cohort; Q5 **give everyone an email first** (+ wants SMS or 2FA if
feasible — see decisions.md); Q6 **soft nag, hard stop at signing**; Q7
**build the provisional office queue now**. Notes: tours must be
revisited for relevance, not just made role-aware (G4); Matthew needs
help with the Resend/domain setup (S1.1).

Context: main at 4aa6490 is fully green (typecheck, 277 unit tests,
harnesses 32/35/36, prod server + web current, demo byte-identical). The
five build-plan rounds are shipped. This document answers Matthew's five
soft-launch worries with what exists today, what was found, and what to
build. Evidence: `testing/two-device/audit-sweep.mjs` re-run 2026-09-06 and
a 40-screenshot sweep (`.playwright-mcp/soft-launch/`, git-ignored).

---

## 1. Intuitiveness per user type — findings

**Field homes are in good shape.** Blaster three-band home (needs-attention
· today · months) and driller trio home both land under 2 screens at phone
width. Mechanic trio + worklist reads cleanly on a tablet.

Findings, ranked by how much a first-week user would trip on them:

| # | Persona | Finding | Evidence |
|---|---|---|---|
| I1 | Office | Office lands on the **Company** home (AdminHome) — a 52-row job-costing table, compliance monitor, latest filings. It is an admin costing screen, not Evette's queue. 4.3 screens. | `office /` 4.3 screens, 4320 chars |
| I2 | Driller | "Yesterday needs you" strip is **uncapped** — 15 unsigned rows pushed the trio tiles (the primary action) below the fold at 430px. The blaster strip caps at 6 after ranking; the driller strip should too. | driller phone home, 1752px |
| I3 | Blaster | Daily Report tab on phone = **~4 screens of empty cards** (Time cards, attachments, drill summary, work force, equipment, materials, subs, notes) even on a locked/approved day. Empty sections should collapse to one "Add…" row; locked days should hide empty sections. | 3728px at 430 wide |
| I4 | All | Jobs cards on phone: truncated titles ("H26-657571 Phas…"), and every card repeats `construction` + `active` chips while the Active filter is on. Redundant chips = clutter. | blaster phone /jobs |
| I5 | Admin | Admin › People: every person is a 3-line block with a full-width Role select; no windowing; 4.4 screens for ~30 people. Baystate has 24 crew → same problem in prod. | admin /admin/people 4.4 |
| I6 | All | Tour step 3 copy is **stale**: "Settings holds your licenses, crew, and equipment" — those moved to Profile and Admin months ago. | Tour.tsx STEPS |
| I7 | Blaster | Driller drill-log header shows "Pick rig…" empty with no hint that the rig checklist keys off it. Minor. | driller log phone |
| I8 | Dev only | Dev DB is polluted (duplicate people, probe jobs, 87 harness days). Prod has only real Baystate data + Matthew. Not a launch blocker, but the **test-user decision** (decisions.md) is still open. | People screenshot |

## 2. Guidance when lost — findings

What exists: a 4-step static tour (`components/layout/Tour.tsx`), a
"Walkthrough" button in the rail/header, a Reference page (formulas,
glossary, USBM/OSM bands), and a handful of good empty states (DrillingWork,
RigPickerModal). Nothing else.

| # | Finding |
|---|---|
| G1 | Tour **never auto-runs**. `touring` is plain `useState(false)`; there is no first-login trigger. A new user must find the ⓘ icon unprompted. |
| G2 | Tour is **not role-aware**. Drillers and mechanics get the blaster script; the mechanic home has no FAB so step 2 degrades to a centered card about a button they can't see. |
| G3 | Step 3 anchors `data-tour="nav"` = the **mobile-only** bottom bar; on desktop it spotlights a zero-rect at the top-left. Sidebar has no anchor. |
| G4 | Step 4 "Inside a Blast Day" describes screens the tour never shows. REQUIREMENTS.md specified a 9-screen traversal. |
| G5 | **No contextual help** past the dashboard: Design Plan, Seismo, Readiness, Submit, Time cards, Drill log — zero coaching text. |
| G6 | Empty states are uneven: "Queue's clear." / "No checklists filed yet." / "No days yet." say what's absent, not what to do or who to ask. |
| G7 | No help entry in Settings or Profile; Walkthrough is the only door. |

## 3. Feedback collection — findings

| # | Finding |
|---|---|
| F1 | **Nothing exists.** No feedback UI, no mailto, no Sentry/PostHog, no telemetry. |
| F2 | **No React error boundary** and no `window.onerror` / `unhandledrejection` capture. A render error white-screens the PWA silently — the worst possible soft-launch failure because the user can't even tell you what happened. |
| F3 | The only diagnostics is the sync log (`lib/syncLog.ts`, last 50 events, copy button in the SyncChip panel). Users would have to text it to Matthew. |
| F4 | No platform-admin concept in code; everything is company-scoped. Fine for a single tenant — Matthew triages through his Baystate admin account — but feedback must not assume `admin` is the top of the world (platform-admin.md §33-37). |

## 4. Long lists / clutter — audit re-run 2026-09-06

Gate from Round 5 was ≤~4 screens. Field/shop screens all pass (≤2.2).
Remaining offenders and near-misses, at 1280×900 unless noted:

| Screen | Screens | Cause |
|---|---|---|
| office `/` and admin `/` | **4.3** | Job Costing table renders all 52 jobs, unwindowed; compliance monitor rows unwindowed |
| admin `/admin/people` | **4.4** | 3-line rows, full-width selects, no windowing |
| blaster daily-report tab @430 | **~4.1** | empty-section stacking (I3) |
| driller `/` @430 with backlog | 1.9 | uncapped "Yesterday needs you" (I2) |
| admin `/jobs?lens=customers` | 2.4 | 29 rows before the window kicks in; each card tall |
| admin `/admin/catalog` | 2.3 | 59 products, manufacturer tabs but no window |
| `/records` (supervisor/office/admin) | 2.1 | 4774 chars — Filed lens dense; acceptable but noisy |
| admin `/admin/roles` | 2.1 | 24 capability rows per role; acceptable |

## 5. Onboarding from email to first use — findings

Walked the real path: invite → `/enroll/:token` → sign in → PIN → dashboard.

| # | Finding | Severity |
|---|---|---|
| O1 | **No forgot-password flow at all.** No link on the login screen, no reset-token model. A blaster who forgets their password is locked out until an admin is online and phones them a temp password. "Forgot PIN?" exists, so users will expect the counterpart. | HIGH |
| O2 | **Invite email is not sending in prod** — `RESEND_API_KEY` is still unset on Railway (parked since July). Admin UI falls back to copy-link silently; nothing tells the admin email is off. | HIGH (blocks invites) |
| O3 | Invite email is plain text, unbranded, one line of context. No "what to expect" or "install it on your tablet". | MED |
| O4 | **No auto-login after enrollment.** User picks a password, then is bounced to Sign in 2.5 s later to type it again. Server returns `{ok,email}` only; it could mint tokens. | MED |
| O5 | **No first-run at all**: no welcome, no role explainer, no profile-completion step. A blaster can reach a sign-off with no license and no signature on file; both live on `/profile`, which nothing points at. | HIGH |
| O6 | **No install-to-home-screen guidance.** The PWA is installable but nothing prompts (`beforeinstallprompt` unused) and there is no iOS "Share → Add to Home Screen" hint. Field users will run it in a browser tab, lose it, and PIN relocks will feel random. | HIGH |
| O7 | Admin temp-password reset never forces a change; a temp password can live forever. | LOW |
| O8 | Settings › Account & Backup renders a second full login form when logged out (unreachable, but it exposes the raw Server field). Dead code to remove. | LOW |
| O9 | `EnrollPage` sets `shotlog-user-email` but `LoginScreen` prefills from `getSession().email` — verify the prefill actually works post-enroll. | LOW |

---

## Proposed rounds

Order rationale: S1 must land before any invite goes out; S3 must exist on
day one or the soft launch collects nothing; S4 is small and mechanical;
S2 is the largest design effort and needs Matthew's per-role calls; S5 is
the gate checklist. Each round: charter/decision amendments first, harness,
deploy, check-off — same working agreement as the build plan.

### S1 — Onboarding & access (server + web; Railway-first)

1. **Resend key on Railway** + verified sending domain (Matthew) + a
   `/health` `email: true|false` marker so the People page can say
   "email delivery is off — share the link" truthfully.
2. **Branded HTML invite** (plain-text alternative kept): who invited you,
   your role in one sentence, the 3 steps (set password → PIN → install),
   link expiry. Role-specific "what you'll do in ShotLog" paragraph.
3. **Enroll → auto-login**: `POST /enroll/:token` returns the same token
   pair as `/auth/login`; EnrollPage stores the session and goes straight
   to Set-PIN. Fix O9 as a by-product.
4. **Forgot password**: `passwordResets` table mirroring `InviteToken`
   (hashed, single-use, 1 h), `POST /auth/forgot` (always 200, rate-limited),
   `/reset/:token` public page (same AuthGate bypass as `/enroll`), emailed
   via Resend. Login screen gains "Forgot password?". Admin temp reset sets
   `mustChangePassword` → forced change on next login (O7).
5. **Install prompt**: capture `beforeinstallprompt` (Android/Chrome),
   show an "Install ShotLog on this tablet" card after PIN setup and in
   Settings; iOS/Safari branch shows the Share → Add to Home Screen sheet.
   Dismissible, remembered per device.
6. **Welcome + profile completion** (one screen per role, skippable but
   nagged on home until done): blaster = license(s) + signature; driller =
   signature + "your usual rig"; office/admin = nothing beyond welcome;
   mechanic = nothing. Writes go to the existing Profile cards.
7. Remove the dead logged-out form in AccountSyncCard (O8).

Harness: enroll auto-login, forgot-password round trip, forced change,
install-card visibility per UA, profile-completion nag clears.

### S2 — Guidance (server field + web) — STARTED 2026-09-06

**Amended before build (2026-09-06):** S2 is "server + web", not web
only — `tourDoneAt` lives on the User (same shape as `onboardedAt`) so
the tour follows the account. Design calls taken by default and flagged
for Matthew at check-off: (a) the tour is rebuilt per role around 3–5
REAL screens (it navigates between them), not the old 4 static cards —
G4 relevance, not just role labels; (b) the per-screen coach sheet is
reachable from the ? menu on EVERY screen ("About this screen") so the
door is always in the same place, plus an inline link where a screen
already has a header; (c) the first-week checklist ticks itself from
real data where it can (license on file, signed once, filed a day…) and
is dismissible per device; (d) coach and empty-state copy are drafted in
the DrillingWork voice and are the main thing to review at check-off;
(e) cohort = everyone, so all five scripts ship together.

1. **Role-aware tour**, auto-run once per account (`tourDoneAt` on the
   user profile so it follows the account, not the device), re-runnable
   from Settings › Help and the ? menu. Scripts per home bucket (field /
   driller / mechanic / office / admin), each navigating to 3–5 real
   screens with anchors that exist on both layouts (add `data-tour` to the
   sidebar). Rewrite stale copy (I6).
2. **"?" coach sheet per screen**: a small header button opens a bottom
   sheet with 3–5 bullets — what this screen is for, what to do next, who
   to ask. Content lives in one `help/` map keyed by route. First batch:
   day hub, drilling review, readiness, shot card, design plan, seismo,
   submit, drill log, checklist, time cards, shop worklist, approvals.
3. **First-week checklist card** on each home (dismissible): e.g. blaster
   "Add your license · Sign once · Start work at a job · File a day".
   Reuses the needs-attention strip pattern.
4. **Empty-state sweep** (G6): every empty state says the next action and
   who to ask, in the DrillingWork voice.
5. Settings gains a **Help** section: Walkthrough · Send feedback ·
   Reference · "Text Matthew" (until in-app feedback exists).

### S3 — Feedback & diagnostics (server + web)

**Amended 2026-09-06 before build.** The original draft made `feedback`
a synced table with an admin capability. That contradicts Matthew's Q2
call ("feedback to Matthew only — not visible to the company admin"):
a synced table replicates to every device in the company by
construction, and a capability puts the triage screen inside the
company roles engine, which the Platform Admin charter says platform
data must stay out of. Reconciled design, same user-facing behaviour:

1. **Server-side `Feedback` table** (Prisma model, NOT in `records`, so
   it never syncs down to any device): `{id (client uuid → idempotent
   retries), companyId, userId, userName, userEmail, role, kind:
   bug|idea|question|crash, message, route, buildId, userAgent,
   viewport, online, standalone, syncLogTail, errorLog, screenshot
   (JPEG, ≤1280px, stored in the row), status: new|seen|done,
   replyNote, notified: sent|email-off|failed, createdAt, receivedAt}`.
   `POST /feedback` = every signed-in role. Read/patch/delete = **platform
   admin only** (see 4).
2. **Offline outbox** (`lib/feedback.ts`): the composer writes the row to
   a device-local outbox (metadata in localStorage, screenshot in the
   local media store) and drains it on online / foreground / interval,
   the same pattern as the file uploader. Toast is truthful: "Sent —
   thanks" when the POST landed, "Saved — sends when you're back online"
   otherwise. Works offline — that is the point on a jobsite.
3. **Composer**: header "?" becomes a small menu — Walkthrough · Send
   feedback (also a Help & feedback card in Settings; the S2 coach sheet
   will link it too). One textarea + kind chips + "include a screenshot"
   (on by default, Q3; html2canvas of `main`, drawn before the sheet
   opens so the sheet itself is not in the picture).
4. **Error boundary** at the root (outside the auth gate, so a gate crash
   is caught too) + `window.onerror` / `unhandledrejection` capture into a
   rolling error log (last 20, attached to every report). The boundary
   shows "Something broke" with Reload + "Send a report" (kind `crash`,
   stack prefilled). Async errors surface as one toast per minute with a
   Report action. Never a white screen.
5. **Triage**: Admin › Feedback tab, visible only to a **platform admin**
   — an account whose email is in `PLATFORM_ADMIN_EMAILS` (falls back to
   the bootstrap `ADMIN_EMAIL`, i.e. Matthew in prod, Mark in dev). This
   is the first concrete platform-actor marker: env-based, above the
   company roles engine, per platform-admin.md. Mark (company admin) does
   not see the tab and gets 403 on the routes. List · seen/done · reply
   note · delete. Cross-tenant listing is trivial later (the routes are
   already not company-scoped for platform admins).
6. **Email hook**: `POST /feedback` emails `FEEDBACK_TO` (default: the
   platform admin list) via Resend with the message, who/where/build, and
   a deep link to the triage row; the row records `notified` truthfully
   (`email-off` until the Resend key lands — S1.1 is still Matthew's step).
7. Build id (`__BUILD_ID__`) + route + role + UA + online/standalone
   stamped on every row.

Harness (harness38): online send lands with screenshot + build stamp;
offline send queues, truthful toast, drains once on reconnect (two
queued, concurrent drain → exactly two rows); render crash → boundary →
report lands as `crash`; async error → error log + toast; platform admin
sees the tab, marks done with a note; company admin (non-platform) has
no tab and gets 403; Settings has the Help card; email hook records
`email-off` in dev.

### S4 — Clutter sweep (web only) — STARTED 2026-09-06

**Before build (2026-09-06):** inputs all settled — office queue re-review
"looks good", jobs rows per the study's three calls, records manager R-A
"looks right". Default calls, flagged for check-off: (a) the office queue
derives "sent back awaiting resubmit" from draft days carrying a
`sendBackNote` (the only marker that exists); (b) time cards to approve =
company-wide `status: filed`; (c) expiring = customer COI + site permits
within 30 days or past due; (d) the costing table and compliance monitor
move to the ADMIN home only, windowed 10 + Show all; (e) R-A ships the
manager core (facet filters · sortable/groupable list · multi-select ·
inline PDF preview wide / preview sheet phone · bulk ZIP/CSV · versions +
SHA shown); saved views, audit pack curation and tags stay R-B/R-C.

1. **Office home**: Evette's queue, not the costing table — Approvals
   waiting · sent-back awaiting resubmit · time cards to approve ·
   expiring COI/permits · open incidents. Costing table moves to a
   windowed "Job costing" section on the admin home (10 + Show all).
   (Provisional until the Evette walkthrough resumes — flagged.)
2. **Admin › People**: compact one-line rows (name · email · role chip ·
   login pill · ⋯), windowed 15 + Show all, role edit inside the row's
   sheet. Same pattern as the Jobs lenses.
3. **Daily Report tab**: empty sections collapse to a single "+ Add
   worker / equipment / materials" row; locked days hide empty sections
   entirely.
4. **Jobs cards**: drop the `active` chip under the Active filter, drop
   `construction` when it's the company default, allow two-line titles.
5. **Cap the driller strip** at 5 ranked rows + "N more" (mirror
   BlasterHome's sort-then-cap).
6. Window Customers lens at 15 (it currently shows 29) and Catalog at 15
   per manufacturer tab.

Re-run `audit-sweep.mjs`; gate: no screen > 3 for any persona.

### S5 — Launch gates (ops, not code)

- Test-user cleanup decision (decisions.md) — prod is already clean
  (Baystate roster + equipment + Matthew only); dev pollution is fine.
- `npm audit --omit=dev`: 8 high (react-router-dom, prisma, postcss
  direct). Triage before real users; Prisma stays on 6.
- **USBM RI8507 curve ramp (2.0 in/s at 30 vs ~40 Hz)** — flagged since
  July as compliance-critical; get engineer sign-off BEFORE real blasters
  see compliance badges. This is the one item that can embarrass the
  product on day one.
- Cohort + cadence: who gets invited first, and a weekly "feedback
  review" ritual with Mark.

### S6 — Rehearsal mode (server + web) — ✅ SHIPPED 2026-09-07 (harness41 22/22; harness38 38/38 + harness39 34/34 regression)

Built exactly as designed below. In-round facts: the sandbox is created by
the server on the first Start (no migration); the client clear of the local
replica is raced against an 8-second timeout so a wedged SDK can never
hold the switch; sandbox feedback rows carry `notified: sandbox` and are
never mailed; the office bucket's rehearsal lands on the queue home. Dev
gotcha recorded: Playwright init scripts run on every load, so a harness
that seeds the device PIN hides the Set-PIN step — seed it only outside a
rehearsal. Matthew's prod step: none — the Rehearse card appears in
Settings for the platform admin after the deploy.

**Post-deploy fix (2026-09-07):** the 8-second race on the local-replica
clear left Matthew's browser with a half-cleared database that connected
but never synced. Replaced by `resetLocalReplica()` (wait for the SDK
clear, then delete the database if it will not release) and a **Reset
local data** button in the sync panel with a "taking too long?" hint.
harness41 now also proves Baystate data re-downloads after End and after
a reset.

Matthew's ask: test as every user type, onboarding and tour included, on a
regular basis, without ceremony. Design (accepted 2026-09-07):

1. **Sandbox company** "ShotLog Sandbox", created by the server on first
   use, with one rehearsal account per built-in role
   (`rehearsal-<role>@sandbox.shotlog`, never emailed, no usable password —
   sessions are minted directly). Same tenancy as any customer: its own
   records bucket, catalog and manufacturers seeded, a roster of the six
   rehearsal people.
2. **`POST /platform/rehearsal/start {role}`** (platform admin only):
   wipe the sandbox (records → reseed reference data + roster, audit,
   feedback, invites, sandbox sessions), reset every rehearsal account's
   first-run flags (onboardedAt, tourDoneAt, PIN, licenses, signature),
   return a session for the chosen role. **`POST …/end`** (any sandbox
   session): wipe again. **`POST …/sample`**: one customer, site, job and
   rig so the driller has a plan to drill and the office has something to
   approve. **`GET …/status`** for the harness.
3. **Client switch** (`lib/rehearsal.ts`): stash the real session + this
   device's first-run keys, swap in the rehearsal session, clear the PIN
   and dismissals, reset the local database, reload → Set PIN → welcome →
   walkthrough → empty home. **RehearsalBar** (sticky, amber like View-as):
   "Rehearsing as blaster · sandbox — nothing here is real · Add sample job
   · End". End restores everything and reloads as the real user.
4. **Settings › Help** gains "Rehearse as…" (six roles) for platform
   admins. Sandbox feedback is stored but never emailed.
5. Not rehearsed on purpose: the invite email and the install prompt (role-
   independent; one real invite covers them).

Harness (harness41): start as blaster → Set PIN → field welcome → tour →
bar → empty jobs → sample job → a day → End → real session + PIN back,
sandbox empty; office rehearsal shows the queue; non-platform admin 403.

#### S5 status — 2026-09-06 (started; the gates are Matthew's to close)

| Gate | State | Notes |
|---|---|---|
| `npm audit --omit=dev` | 🟡 12 → **4** (1 moderate, 3 high), all transitive | Fixed by in-range updates: react-router/react-router-dom (11 advisories), postcss (4), postcss-selector-parser, uuid, qs, picomatch. **Remaining, no upstream fix yet:** `dompurify` ≤3.4.12 via jspdf 4.2.1 (latest — DOMPurify runs on our own generated PDF text, not user HTML); `deepmerge-ts` <8 via prisma 6.19.3's CLI config (deploy-time tool, not on the request path; Prisma 7/8 is the fix and stays deferred per plan). Re-check monthly. |
| USBM RI 8507 curve sign-off | ❌ packet ready | **docs/usbm-curve-signoff.md** — what the app computes, what it does not (structure type never chosen → drywall always; state/local limits planning-side only; MA "540 CMR" citation looks wrong; air overpressure unchecked), the 30 vs 40 Hz question, 7 questions, signature block. Reference page copy corrected in S5 to stop claiming state/local limits are active. |
| Test-user decision | ❌ Matthew | Recommendation in the runbook: keep dev as the permanent test bed, never point a real device at it. |
| Cohort + cadence | ❌ Matthew | **docs/soft-launch-runbook.md** — gates, staggered invite order (Mark → Evette → one blaster + one driller → rest → shop), first-day script, what to watch daily, weekly review with Mark, decisions D1–D4. |
| Resend key | ❌ Matthew | since July (docs/resend-setup.md) |

### S7 — First-rehearsal feedback (2026-09-07) — S7a ✅ SHIPPED 2026-09-07 (harness42 27/27; harness41 25/25 regression)

S7a built as designed below. In-round findings: the driller home's
"No open drill plans" empty state showed while a plan was half drilled
(the plan I'm working lives in the trio band, not the plans band) — copy
now says "Nothing else is waiting — today's pattern is above"; the
rehearsal sandbox's Baystate copy holds one drill, so the fixture sends
it to the shop and creates the driller's active rig; the picker's
first-option wait, uppercase eyebrows and initials in the cards queue
were harness-side only. Matthew's prod step: none — the switch and *Add
sample data* appear after the deploy.

Matthew's eleven notes after rehearsing the roles, all accepted (docs/
round-s7-plan.md holds the full design and his answers). Four sub-rounds:

**S7a — Rehearsal makes the rest testable (server + web)**
1. `POST /platform/rehearsal/start {role, withData}` — when `withData`
   (default), the sandbox is seeded from the platform admin's own company:
   `equipment` (assigned-operator link stripped), `crewMembers` (login link
   stripped — roster people, nobody can sign in as them), `productCatalog`,
   `manufacturers`, `companySettings`, `roleDefinitions`; same ids (records
   are keyed per company). Then the six rehearsal roster rows on top. End
   wipes to empty; the next Start copies again. Settings › Rehearse gains
   the switch.
2. `POST /platform/rehearsal/sample {today}` (client sends its local date)
   — idempotent fixture: two customers/sites/jobs (Ledgeville Pit 26-001
   quarry; Route 3 culvert 26-007 construction with an abutter and a
   permit); a drill plan on 26-001 sent to Rehearsal Driller with 14 of 31
   holes logged today (one water condition, one skipped) on rig B;
   yesterday's day on 26-001 **submitted** (blast log with readiness
   review, one signed shot with design numbers, a compliant seismo
   reading, explosives from the sandbox catalog, an accepted shot drill
   log, equipment rows, filed time cards for blaster, driller and
   supervisor); today's draft day on 26-007; rig A's checklist yesterday
   with a hydraulic leak → open ticket, rig A in shop; rig B's last
   weekly service 58 h ago (50-h clock overdue) and engine PM overdue; an
   open blasting incident (cracked window claim) on yesterday's shot.
   Rigs, a seismograph and a pickup are taken from the registry when the
   company data was copied, created otherwise.
3. Driller checklist doors: *Rig checklist* on the Drilling tab; the picked
   rig is remembered on the account as the machine's usual operator
   (`equipment.assignedUserId`, field-patchable) with the device key as
   fallback; optional "attach to a job" on the checklist page.

Harness: harness42 (sample data per role — driller trio live, mechanic
worklist 3 items, office queue 1 day + 3 cards + 1 incident, blaster
yesterday submitted + today draft; Start-empty still empty; source company
untouched) + harness41 regression with the new labels.

**S7b — Hierarchy, day dialog, settings, log-out, records by bucket (web) — ✅ SHIPPED 2026-09-07 (harness43 34/34; harness37/38/39/40 regressions green)**
1. `Job.defaultTypeOfWork` (new field; set on create, editable on the job
   page). The New work day dialog reads **Name → Recent jobs (anyone's
   work in the last 14 days, one tap) → Customer → Site → Job → Date →
   Type of work → Copy from previous**. A customer with one site fills
   the site; a site with one job fills the job. Type prefill: the job's
   last day → the job's default → this device's default (Settings) → the
   role's. Copy defaults to the most recent day at that job; a non-blasting
   type only offers Crew & Equipment (copying blast content would force a
   blasting day). "+ New job…" in the Job select opens the ONE New job
   form inline with the customer/site carried over.
2. `NewJobForm` — Customer → Site (auto-fills a lone site; new site gets a
   name) → the job (name, operation, default type of work, PO, rock,
   terrain). Used by the dialog and the Jobs lens. Lens tabs reorder to
   Customers · Sites · Jobs; the rail still lands on Jobs.
3. Log out removed from Settings; My Profile's Sign Out now also runs the
   bounded local-replica reset (the incident remedy) before reloading.
4. Settings: You (→ Profile) · Preferences (light/dark switch that the rail
   toggle follows; usual rig for drillers, on the account; what a new day
   starts as; Copy-from-previous defaults; record page layout — all
   per-device except the rig) · Help & feedback · Install · Rehearse ·
   **Data & device last** (sync line, Reset local data, Export JSON, build).
5. Records: four new kinds (time cards, repair tickets, services, hour
   corrections — rows from the records, no PDFs) and per-bucket defaults:
   field = blast logs · daily reports · drill logs · incidents; driller =
   drill logs · checklists · time cards; mechanic = checklists · tickets ·
   services · hour corrections; office/admin = everything. "Show
   everything" / "Just my kind of paper" toggles; no role mapping —
   `tourBucket()` as the rails use.
**S7c — Screen tours — ✅ SHIPPED 2026-09-07 (harness44 31/31; harness39 34/34 + harness41 25/25 regression)**
1. `User.toursDone` (JSON list, migration `20260907180000_user_tours_done`),
   `PUT /auth/me/tours-done {screen}` append-only; in the session payload;
   the rehearsal reset clears it.
2. One engine, two kinds: the role walkthrough (S2) and SCREEN tours —
   `SCREEN_TOURS` in tourScripts.ts, keyed `day` (hub → the blast-log view,
   7 stops: spine, tabs, drill parameters, explosives, design/compliance,
   sign-off), `drill-log` (entry box, header, Mark Complete), `checklist`
   (hours, walk-around, out of service), `shop` (trio, worklist, Fleet),
   `approvals` (row, Approve, Send back), `people` (Add person, row, ⋯).
   Steps may carry `?view=` routes; the engine matches path + search.
3. Auto-run once per ACCOUNT the first time the screen opens for that
   bucket (field · driller · mechanic · office/admin · admin), 1.4 s after
   render; never on top of the walkthrough (it goes first on the home);
   never within 60 s of another tour ending ("one sitting" — the day tour
   is not chased by anything). Re-run any time from ? → "Show me …". The
   legacy `shotlog-tour-done` device key suppresses every auto-run (the
   older harnesses rely on it).
4. Anchors added: day spine/tabs, shot sub-sections (`anchor` prop on
   SubSection), sign-off, drill-log header/entry/complete, checklist
   hours/daily/out-of-service, shop trio/worklist, approve/send-back,
   people add. Matthew's prod step: none.
**S7d — Time and the day — ✅ SHIPPED 2026-09-07 (harness45 25/25; harness40 46/46 · 42 27/27 · 44 31/31 regression)**
1. **Ownership by role** (`BlastDay.authorUserId/Name/Bucket`,
   lib/dayOwnership.ts): whoever starts a day authors it; a field bucket
   takes a day over the moment it adds the blast log (or opens a blasting
   day that a non-blaster started); opening never claims for supervision.
   The daily-report tab says "Report: <name> (you)" or "— the report is
   theirs; your card, drill log and checklist are yours here"; conditions
   Edit, the report's sections and the drill-only file card follow the
   owner. Client rule + audit; the server keeps enforcing by role table.
2. **Work Force = the day's time cards keyed by job + date**
   (`useDayTimeCards(day)`, the phase model and the office queue agree);
   the typed Work Force editor is gone — rows from before stay read-only;
   "Worked today, no card yet: …" lists people with a log/checklist/blast
   signature that day but no card (no nudge transport yet — the list is
   the nudge). A standalone card joins today's day when one exists.
3. **Rig hours from the machine**: `DrillLog.endingHours` asked once at
   Mark Complete (prefilled from the ledger, skippable) → hour-ledger source
   `drill_log` → `equipment.hourMeter`; the daily report's Equipment section
   shows drills as derived read-only rows "start → end h" (latest checklist
   of the day + the log's end meter); trucks and seismographs stay manual.
4. **The driller's card starts filled in** (lib/timeSuggest.ts): in = the
   checklist they signed (else first hole), out = the log they signed
   complete (else last hole), to five minutes, with `suggestedFrom` shown
   until they edit — a suggestion they confirm and sign.
5. **Join, don't duplicate**: the dialog's same-date notice names who
   started the day and offers *Open that day*. **Two offline copies** →
   a merge strip on the day page (author or supervision) → `mergeDays`
   re-parents logs, cards, attachments, incidents and report lines (a
   blast log moves if the kept day has none; otherwise its shots append)
   and tombstones the other day. To make that possible for the people who
   start days, `blastDays DELETE` moved from registry to the REPORT FAMILY
   in both the legacy matrix and the capability bundles — the server's
   "draft with nothing filed" rule is unchanged and still decides.
In-round finding: a field role's day delete used to bounce at the server
and re-download, which is exactly what the merge hit first.
"Take over the report" for a second blaster stays tabled (multi-blaster).

**S7 follow-up — Matthew's driller rehearsal (harness46)**
1. "Briefly saw the blaster screen": the S7b type prefill took the job's
   last day (the blaster's Drill to Blast) for the driller too, so their
   new day grew a blast log and opened on the hub. Now the driller bucket
   is never prefilled into a blasting type (→ Drill Only; hand choice still
   possible) and the day page opens on the daily report for drillers even
   when a blast log exists.
2. Copy from previous starts blank — copying is opt-in (overrules S7b).
3. Rig visibility — superseded the same day (Matthew: the rig read as a
   locked setting and changing it looked like it cost a checklist). Final
   shape (plan artifact f26be2bb, "Change it" → start empty + quick picks +
   full fleet): the home tile is the verb (*File rig checklist*), the
   checklist form asks *Which rig?* first with nothing preselected, quick
   picks with reasons (today's log · last filed · usual · recent), *All
   rigs* with search, one-tap switch that saves nothing, "already filed
   today → Open it", two rigs a day; usual rig written only on file / on
   logging with a rig / Settings. Route `/drill-checklist` (rig optional).
4. The drill log's back arrow sends a driller home (the plan page and the
   day hub are the blaster's screens).

**S7 follow-up — Matthew's invite test (plan artifact ed13a981, all Build) — ✅ SHIPPED 2026-09-07 (harness49 26/26; 37/42/45/46 regressions green)**
5. Whose work shows up: a new blaster was handed Mark's drafts and a
   driller's finished log. Field homes now surface only *my* work (day
   authored or worked; pattern I laid; drilling on my patterns); `/days`
   gets Mine / Everyone (default Mine, per device, search spans Everyone);
   Records › Company stays the review door; office/admin/shop unchanged;
   sync and permissions unchanged. Pre-stamp days sit under Everyone only.
6. PIN never asked: the PIN was one key per browser, never cleared by
   sign-out or enroll, so a new account on Mark's browser skipped Set PIN
   and unlocked with Mark's PIN. Now per account per device; sign-out,
   Forgot PIN and enrolling clear it; the account's PIN still seeds a new
   device; the old key migrates silently to the signed-in user.
8. Long "Syncing" on the phone (diagnosed 2026-09-07, fix planned): the
   company replica is ~8.6 MB and 7.6 MB of it is 40 filed office copies
   carrying their PDF bytes inline (avg 190 KB, max 480 KB) — every device
   downloads every PDF ever filed; Sign Out wipes the replica so every
   login is a full first sync; the SDK's SQLite lives in IndexedDB, which
   is slow at big writes on iPhone. Plan: PDFs to file storage (lazy
   download), keep the replica across sign-out for the same company,
   honest first-sync progress. **Storage-engine measurement (harness51,
   Settings › Data & device switch):** desktop Chromium — IndexedDB first
   sync 0.6 s for 2,523 records / 8.4 MB (1.3 s including sign-in), OPFS
   1.3 s; reads equal; OPFS writes 2.2× slower. Desktop WebKit — IndexedDB
   first sync 0.9 s, writes ~9× slower than Chromium (10 day create+delete
   = 2.7 s vs 0.3 s). OPFS cannot be opened under Playwright's WebKit
   (getDirectory throws) so Safari must be measured on the phone via the
   switch, which falls back to IndexedDB when OPFS is unavailable. Verdict
   so far: OPFS is not a win; the size and the sign-out wipe are the fix.
   **Phone readings (Matthew, production, 567 records): 23.6 s IndexedDB,
   23.5 s OPFS — engine irrelevant.** Cause pinned: 23 filings from Jul 27
   carry their PDF inline (avg 190 KB, max 480 KB = 7.6 MB); filings since
   Jul 29 already keep the PDF in R2 with a pointer. Fix (plan artifact
   742b52b4, all Build; Matthew: R2 is already in use for attachments):
   server boot migration of the legacy PDFs to R2 (`legacyPdfs.ts`,
   `/health.legacyInlinePdfs` → 0, `/health.files`), Sign Out keeps the
   company's copy (`shotlog-replica-cid`; another company clears it; "Sign
   out & clear this device" in Profile), chip shows "Downloading — N%" until
   the first download completes, Settings line says where filed PDFs live,
   storage-engine selector removed. harness52 15/15 · 37/46/49 green.
   ✅ SHIPPED 2026-09-07 (d3d49ad). Verified: prod `/health` files=true,
   legacyInlinePdfs=0 after the first boot; **Matthew's phone: 567 records
   in 1.4 s (was 23.6 s); sign out and back in — instant.** Then a fresh
   PWA install read **25.3 s on IndexedDB** for the same 567 records: on
   iOS the IndexedDB VFS is ~18× slower at applying rows than OPFS (the
   pre-migration readings matched only because download and writes
   overlapped). Policy shipped 2026-09-07: Apple WebKit → OPFS by default
   (fresh devices at first open; existing IndexedDB devices hand over at
   next launch once idle; fallback to IndexedDB where OPFS cannot open);
   Chromium stays on IndexedDB (faster there). `lib/storageEnginePolicy.ts`
   + unit tests.
   Side find: Vite HMR could leave two PowerSync instances on one file
   (app import vs harness import) — hangs WebKit, inflated earlier numbers;
   the singleton now lives on globalThis.
7. Installed-app edges (✅ 2026-09-07, harness50 12/12): as a PWA the bars
   ran into the phone's corners. `viewport-fit=cover` + safe-area utilities
   (index.css): navy status-bar strip above the mobile header, bottom nav
   and page content pad by the home-indicator inset, + button and toasts
   rise with it; iOS web-app metas. Zero effect in a browser.

**Admin follow-up — Add person in one shot (harness47).** Mockup first
(artifact 5880eda4), then built as accepted: First · Last · Role · Email ·
Access in one panel, button labels *Add person* / *Add & send invite* /
*Add & create login*, offline-honest, duplicate guard, "Last, First" list
order via `crewMembers.lastName`, Paste list with emails → bulk invites.
The ⋯ row keeps Invite / Login for people already on the roster.

---

## Open questions for Matthew

1. **Cohort**: which roles are in the soft launch? (Determines which tour
   scripts + coach sheets ship first in S2.)
2. **Feedback recipients**: email to Matthew only, or Mark too? Should
   feedback be visible to the company admin (Mark) at all, or only to you?
3. **Screenshot in feedback**: on by default, opt-in, or off?
4. **Devices**: Android tablets confirmed primary — any iPhones/iPads in
   the cohort? (Drives how much iOS install work S1 needs.)
5. **Forgot password without email**: crew without an email address can't
   self-reset; fallback stays admin reset + forced change. OK?
6. **Profile completion**: hard gate before the first sign-off, or soft
   nag? (Recommend soft nag + hard stop only at the moment of signing.)
7. **Office home** (S4.1): build the provisional queue now, or wait for
   the Evette walkthrough? (Recommend now; it's the 4.3-screen offender.)

---

## Follow-up study (2026-09-06) — office home · jobs rows · records manager

Design study artifact: claude.ai/code/artifact (Office & Records Study,
published from this session; reactions stored in its `responses`
collection). Before/after for I1 (office queue home), I4 (jobs rows:
number · name · customer · town · last worked · status chip only when
non-default; operation chip only when non-default) and a **records
manager** proposal for L6: three-pane filters · sortable/groupable
multi-select list · inline PDF preview (wide), list + preview sheet
(phone); bulk ZIP / CSV index / print; audit pack = existing
BinderExport + job/customer/site scope + curation; saved views on the
account; versions + SHA-256 shown; tags later. Phasing R-A (manager
core, rides in S4 replacing the Records windowing item) → R-B (audit
pack + saved views) → R-C (attachments on customers/sites, tags, share
link). Also carries the step-by-step Resend setup for S1.1.
Facts learned: sent-back days are invisible to the office (status =
draft + sendBackNote); no company-wide filed-time-cards query, COI or
permit sweep exists yet; no in-app PDF viewer exists; Attachment
parentType has no customer/site/incident.

**Study reactions (2026-09-06, artifact 26b87cc6):** office = talk first
(rendering was my side-by-side layout squeezing the desktop mock — fixed,
re-review pending); jobs = looks right with three calls: last-worked is
the default sort, **next scheduled** shows as a blue "starts <date>" chip
on rows with a future start/target date plus a *Scheduled* sort option
(never pushes recent work down), tap + long-press replaces the ⓘ button,
Customers and Sites lenses get the same row in the same round; records =
looks right (R-A into S4); Resend = looks right, guide delivered as
docs/resend-setup.md + PDF.

**Office queue re-review (2026-09-06): looks good — Matthew. Round S1 started 2026-09-06.**

## Round S1 — Onboarding & access — ✅ SHIPPED 2026-09-06 (harness37 24/24; harness36 13/13 regression)

1. ✅ Email module (`apps/server/src/email.ts`): one Resend sender, HTML +
   text templates (invite, reset), `emailEnabled()` → `/health.email` and
   `emailConfigured` on the invite response; People page says "Email is not
   set up on the server yet — share the link" truthfully. Resend key itself
   is Matthew's step (docs/resend-setup.md).
2. ✅ Branded invite: who invited you, role blurb, 3 steps (password → PIN →
   install), expiry.
3. ✅ Enroll → auto-login: `POST /enroll/:token` returns the login session;
   EnrollPage stores it and the gate goes straight to Set PIN.
4. ✅ Forgot password: `PasswordReset` model (hashed, single-use, 1 h),
   `POST /auth/forgot` (always 200; `emailConfigured` is a server fact),
   `GET/POST /auth/reset/:token` → session; public `/reset/:token` page;
   "Forgot password?" on the sign-in screen. Admin temp reset and admin
   "Create login" set `mustChangePassword` → forced change screen at the
   next sign-in (`requireChange:false` exists for harness canonicalization
   only). `AUTH_DEBUG_LINKS=1` (dev only, never prod) echoes the reset link
   when email is off so the flow can be exercised without a mailbox.
5. ✅ Install: `lib/install.ts` captures `beforeinstallprompt` at boot;
   InstallCard (Android prompt / iOS Share → Add to Home Screen) on the
   welcome screen and Settings; "Not now" remembered 30 days per device.
6. ✅ Welcome once per ACCOUNT (`User.onboardedAt`, `PUT /auth/me/onboarded`):
   role-bucket blurb + three first things + install card. Profile completion
   = ProfileNagCard on field/driller homes (license for licensed roles,
   signature for anyone who signs; "Later" snoozes a day) + HARD STOP at
   signing (SigningBlocked replaces the signature pad in BlastLogForm and
   ShotSignoff while a licensed role has no license on file).
7. ✅ Dead logged-out form removed from AccountSyncCard.
Also fixed in-round: the People invite panel closed itself on success
(shared `act()` helper) — the link and email status were never visible.
Gate order: sign in → forced change → PIN → welcome → open.

## Round S3 — Feedback & diagnostics — ✅ SHIPPED 2026-09-06 (harness38 38/38; harness37 24/24 regression)

Built to the amended S3 design above (server table + offline outbox,
platform-admin-only triage). Deployed by push to main (Railway runs the
`Feedback` migration on start; Vercel rebuilds the web).

1. ✅ `Feedback` Prisma model + migration `20260906200000_feedback`;
   `POST /feedback` (any signed-in role, rate-limited, idempotent on the
   device-minted id); `GET/PATCH/DELETE /feedback[/:id]` platform-admin
   only (`requirePlatformAdmin`). Rows carry route · build · role · UA ·
   viewport · online · installed · sync-log tail · error log · screenshot.
2. ✅ Offline outbox (`lib/feedback.ts`): localStorage metadata + local
   media store for the JPEG; single-flight drain on online / foreground /
   5-min timer; a report that the server will never accept (4xx other than
   401) is dropped so it can't wedge the queue. Truthful toasts.
3. ✅ Composer (`components/feedback/FeedbackComposer.tsx`): ? menu
   (sidebar + phone header, `HelpMenu`) → Walkthrough · Send feedback;
   Settings › Help & feedback card (+ "N reports waiting for signal" and
   the build id). Kind chips · textarea · screenshot on by default with a
   thumbnail and an opt-out box. Screenshot is captured BEFORE the sheet
   opens; html2canvas is lazy-loaded off the boot path (the prod bundle
   does not shrink yet — pdf.ts still imports it statically; make that
   lazy in a perf pass to drop ≈200KB from boot).
4. ✅ Root `ErrorBoundary` outside the auth gate ("Something broke" ·
   Reload · Go home · Send a report → kind `crash`, stack in the error
   log). `installGlobalErrorCapture`: window.onerror + unhandledrejection
   → rolling 20-entry error log, ONE toast per minute with a Report action.
5. ✅ Admin › Feedback (`AdminFeedbackPage`) — tab visible only when the
   session's `platformAdmin` flag is true; Open/All filters, expand for
   device facts, screenshot, error + connection logs; Mark seen/done,
   reply note (blur-saves), Delete. Company admins get no tab and a
   platform-only notice on the direct URL; the routes return 403.
6. ✅ Email hook: `feedbackMail` to `FEEDBACK_TO` (default: the platform
   admin list) on first receipt only; `notified` on the row says
   sent / email-off / failed. Dev shows `email-off` (no Resend key).
7. ✅ `platformAdmin` in every session payload (login/enroll/reset/me),
   decided server-side from `PLATFORM_ADMIN_EMAILS` → fallback `ADMIN_EMAIL`.

**Matthew's prod steps:** (a) still the Resend key (S1.1) — until then
reports land in Admin › Feedback but no email goes out; (b) optionally set
`PLATFORM_ADMIN_EMAILS` / `FEEDBACK_TO` on Railway — without them the
bootstrap `ADMIN_EMAIL` account is the platform admin and the recipient;
(c) sign out/in once on prod so the session carries `platformAdmin`
(existing cached sessions don't have the flag until the next sign-in).
Dev-only affordance: `window.shotlogCrash()` (AppShell, DEV builds only)
throws during render for the harness.

## Round S2 — Guidance — ✅ SHIPPED 2026-09-06 (harness39 34/34; harness38 38/38 + harness37 24/24 regression)

1. ✅ **Role-aware walkthrough** (`components/layout/Tour.tsx` rebuilt +
   `components/guidance/tourScripts.ts`): five scripts (field · driller ·
   mechanic · office · admin), each 4–6 steps that NAVIGATE between real
   screens and spotlight the first visible anchor (`data-tour="home"` on
   every home root, `data-tour="nav-<route>"` on both rails, the + button,
   the ? button). Auto-runs once per ACCOUNT (`User.tourDoneAt`,
   `PUT /auth/me/tour-done`, migration `20260906230000_user_tour_done`);
   Skip and Done both record it; re-run from the ? menu, Settings › Help,
   or the first-week card. Stale I6 copy gone. Fixed in-round: a target
   taller than the viewport pushed the card off screen — it now pins to
   the bottom edge.
2. ✅ **"About this screen"** (`components/guidance/coach.ts` +
   `CoachSheet`): 35 route rules incl. per-view day hub (blast log · daily
   report · readiness · drilling review) and per-bucket homes; reachable
   from the ? menu everywhere; "Still stuck — ask" opens the feedback
   composer as a question. Inline header buttons were NOT added — one door
   in one place beat 12 hand-rolled headers (there is no shared PageHeader).
3. ✅ **First-week card** (`components/guidance/FirstWeekCard.tsx`) above
   every home: per-bucket items; self-ticks from the person's OWN records
   (license, signature, tour, blast logs/shots/drill logs/time cards/
   submissions/resolved tickets/services by them) or tap-to-tick;
   "Hide" per device; disappears when all done.
4. ✅ **Empty-state sweep**: 19 strings rewritten to say the next action and
   who to ask (today band, month list, shop queue, checklists band, latest
   filings, approvals, incidents, records, jobs, job days/hours, drilling
   review, locator, customer/site jobs, crew days, drill logs on a shot,
   drill plan logs).
5. ✅ **Settings › Help & feedback** now has Walkthrough · Send feedback ·
   Reference (+ queued-report count and build id).

Review at your leisure (Matthew): the coach and tour COPY — it is drafted
in the DrillingWork voice from the charters, not from crew interviews.
Harness note: `tourDoneAt` has no unset endpoint on purpose; harness39
uses a fresh account for the auto-run and resets dinis via SQL (comment in
the file). Dev users other than blaster/dinis were backfilled done.

## Round S4 — Clutter sweep + records manager R-A — ✅ SHIPPED 2026-09-06 (harness40 46/46; harness37/38/39 regressions green; audit sweep max 2.1 screens)

1. ✅ **Office home = Evette's queue** (`components/dashboard/OfficeHome.tsx`,
   study §1): five live counters that scroll to their section · Approvals
   oldest-first with what is attached (submitter, days waiting, shots, time
   cards, checklist ✓, drill log ✓, "seismo missing") and **Review** deep-
   linking to Approvals with the row highlighted · **Sent back, waiting**
   (draft days carrying a send-back note — invisible to the office before)
   · **Time cards to approve** grouped by day+job with "Approve all" for
   roles holding approve_days · **Expiring ≤ 90 d** (customer COI + site
   permits, past-due first) · **Open incidents** · **Never submitted** (drafts
   older than 3 days). Office rail gains **People** (read-only roster).
   The admin keeps the Company view; its costing table is windowed 10 +
   Show all. Provisional until Evette's walkthrough.
2. ✅ **Admin › People**: one-line rows (name · email · role chip · login
   pill · expiry · ⋯), 15 + Show all; role select and every action live
   behind ⋯. 44 px rows; 4.4 screens → 1.1.
3. ✅ **Daily Report tab**: an empty section is ONE dashed "+ Add" row
   (`EmptyAddRow`); on a locked day empty sections are absent, and Notes
   hides when empty. ~4.1 screens @430 → 1.3.
4. ✅ **Jobs · Customers · Sites rows** (Matthew's three calls): number ·
   name (two lines) · customer · town, ST; right column last worked +
   day count from a shared `lib/jobActivity.ts`; status chip only when not
   active, operation chip only when not the company's usual one, blue
   **"starts <date>"** for upcoming start/target dates; Sort: Last worked
   (default) · Scheduled · Name · Customer · Job number; tap opens,
   **long-press / right-click** peeks — the ⓘ button is gone. Customers
   windowed to 15 and sorted by last worked, same for Sites.
5. ✅ **Driller strip** capped at 5 after ranking (sent-back first, newest
   first) + "N more on the Drilling tab". ✅ **Catalog** 15 per manufacturer
   tab + Show all.
6. ✅ **Records manager R-A** (`components/records/RecordsManager.tsx`,
   study §3) replaces the Filed/All lenses and My Records: facets with live
   counts (kind · status incl. Sent back / Approved-not-filed · job ·
   customer · site · person · dates) · search · group by date/job/kind ·
   sortable columns on wide · multi-select with select-all-in-group · bulk
   **Download ZIP** (folder per job/date + index.csv with SHA-256), **CSV
   index**, **Print** (opens PDFs, capped at 6) · inline **PDF preview**
   (browser viewer in an iframe; device copy first, R2 second; truthful
   "not reachable from this device" fallback) · preview meta: filed by,
   **version chain**, **integrity** (SHA-256 · size · device/R2) · live
   records preview as a summary card with "Open live record". Three panes
   on wide, list + preview sheet on phone. Audit stays as its own lens;
   Binder export stays. `SubmissionSummary` and `DocRow` gained the
   hierarchy/person/integrity fields the facets need. DocList remains only
   for the job and person pages.
7. ✅ Audit gate re-run (`audit-sweep.mjs`): every persona screen ≤ 2.1
   (office `/` 1.8, admin `/` 1.0, People 1.1, records 1.7, jobs 1.3).

Fixed in-round: the walkthrough auto-ran on every deep link for an account
that never finished it and yanked the person home — it now auto-runs only
when landing on the home screen. The phone preview sheet also rendered
(hidden) on desktop and fetched the PDF twice — one preview per viewport.
Not done (R-B/R-C): saved views, audit-pack curation, tags, attachments as
rows, wide-screen table for jobs (the row already works at both widths).
Copy review for Matthew: the office queue section titles and the records
status labels.

## Round S8 — Matthew's eleven (2026-09-07; plan artifact 8d55ab6c, three drafts, all calls in)

| # | Item | Call | Sub-round | Status |
|---|------|------|-----------|--------|
| 11 | Drill plan first · pinned Send · Continue states · timing from drilled holes | Build | S8a | ✅ shipped 2026-09-07 (harness53 26/26) |
| 10 | Start work dialog — Option B (Name first · Job picker sheet · pinned Start) | Build | S8a | ✅ shipped 2026-09-07 (harness53 26/26) |
| 8 | Feedback screenshot viewer (data URL cannot open in a tab) | Build | S8a | ✅ shipped 2026-09-07 (harness53 26/26) |
| 6 | Driller note: ask the blaster for the plan | Build | S8a | ✅ shipped 2026-09-07 (harness53 26/26) |
| 1 | Invite email, testing mode (`INVITE_MODE`) | Build | S8a | ✅ shipped 2026-09-07 (harness53 26/26) |
| 7 | Jobs = drill-down (details first, windowed lists, nav stays *Jobs*; Wide 1 · Pages; flat list dropped) | Build | S8b | ✅ shipped 2026-09-07 (harness55 45/45; 40/41/43/53 green) |
| 9 | Equipment: four grouped tabs + type chips + search + filter chips; repair queue leaves the admin page | Build | S8b | ✅ shipped 2026-09-07 (harness55 45/45) |
| 3 | Alpha / Beta / Production companies + platform-admin switcher; go-live moves people | Build | S8c | ✅ shipped 2026-09-07 (harness56 26/26; 41/49 green) |
| 2 | Help guide — Markdown in repo, built into the app at /help (public), search, About-this-screen links, real screenshots | Build (plan 16b5f92f accepted 2026-09-08) | H1–H3 | ✅ COMPLETE 2026-09-08 — all 59 pages in 9 sections written as drafts, 30 real screenshots (harness57 20/20; 38/39 green); Matthew's review flips pages to reviewed |
| 4 | Load / soak test — manual overnight GitHub Action, throwaway company on the named API; p50/p95, delivery lag, error rate | Build | S8d | ✅ shipped 2026-09-08 (docs/ops-probe-and-load.md; local dress rehearsal green) |
| 5 | Connectivity probe every 10 min (health, sign-in, sync token, sync service, web, manifest); email on fail + recover | Build | S8d | ✅ shipped 2026-09-08 (needs the four GitHub secrets — Matthew) |

**S8a follow-up — Matthew's second pass (2026-09-07, six notes):**
1. Job picker: "Choose a different customer, site or job" under a chosen
   job clears it; the picker's crumb (All customers › customer › site) is
   tappable to go back up a level.
2 · 6. The driller's log grid and the blaster's review grid now draw the
   pattern in the plan's OWN rows × columns (`PatternGrid`, one component
   for both), unused positions as faint dashes, off-plan holes below. They
   were a fixed ten-per-row wrap of hole numbers — Matthew: "a 7 × 11
   plan… not a 7 × 11 grid".
3. Multi-hole completion: row handles (R1, R2…) select a whole row, "Select
   all open (N)" selects the rest; one tap logs them to plan.
4. Logged holes are a windowed list (latest 8, "Show all N"), newest first,
   with a totals line; the pattern grid stays on screen after completion
   as the overview (it used to disappear).
5. A plan whose logs are all complete says **ready to review** on the day
   spine (was "in progress" until accepted).

**S8a follow-up (2) — two more small points (2026-09-07) — ✅ SHIPPED 166bc3f
(harness54 19/19, harness53 27/27):**
1. Driller: **Mark complete · N holes** sits under the signature at the
   bottom of the log too (same flow as the header button), and once
   complete that spot reads "Marked complete — the blaster reviews it
   from the day". No scrolling back to the top after signing.
2. Feedback page: the screenshot preview uses the full width of the page
   (up to a readable max) and scrolls inside its own frame so a tall
   phone capture is no longer a narrow strip and does not push the list
   down; "Open full size" and "Download" sit above it, tap opens the
   viewer as before.

**S8b — Jobs drill-down + Equipment (plan artifact e4e0cbad, two drafts; calls
in decisions.md 2026-09-07) — ✅ SHIPPED 2026-09-07 (harness55 45/45):**
1. **Jobs lands on Customers.** `/jobs` = the customers list (windowed 15,
   Show all, lifecycle filter), recent-job chips on top, one search box that
   finds customers, sites and jobs (name · town · job number) and shows each
   hit's path. "+ New customer" here only. The Customers · Sites · Jobs
   switch, the sidebar sub-items and the flat jobs list are gone; `?lens=`
   links still open the customers list.
2. **Customer page, details first.** Identity + four numbers, then About
   cards (Company & billing · Contacts · Compliance & terms — tap opens that
   section), then **Sites** (windowed 15, filter box, "+ New site" inline
   with the customer set). Wide: the same page, About cards in a row, the
   list with columns below (RecordShell `aboutCards` + `list`).
3. **Site page, details first.** Identity + numbers, About cards (Ground ·
   Jurisdiction & permits · Access & safety · Contacts), then **Jobs at this
   site** (windowed, "+ New job" with customer and site preset). Job page
   unchanged.
4. **Equipment.** Tabs All · Drilling · Trucks & trailers · Machines · Blast
   gear with counts (only groups that have an asset; legacy buckets fold in
   with a "legacy — set the type" mark), type chips inside a tab, search by
   code/description/make/model/plate/serial across all groups, filter chips
   Active · In shop · Retired · Repair open · Out of service · Due ≤30 d
   that stack; header reads "N of M" when filtered; "+ New" presets the
   type; Import stays; the repair queue block is removed (shop home keeps
   it); the mechanic's Fleet item opens this same page.
5. Copy: the Jobs tour step and "About this screen" describe the levels.
6. Harness 55 (phone + wide): three levels, About-first order, windowing,
   search hits with paths, + New site/job preset, tabs/chips/search/filters
   with a live repair ticket; 40/41/43 + audit-sweep updated for the new
   landing.

**S8c — Alpha / Beta / Production companies (plan artifact 57e5b772; calls in
decisions.md 2026-09-07) — ✅ SHIPPED 2026-09-07 (harness56 26/26):**
1. **Environment on the company** (`Company.environment`: alpha · beta ·
   production · sandbox; the existing company defaults to production until
   renamed). The session carries `environment` + `companyId`; the sidebar and
   phone header show an ALPHA / BETA tag beside the company name (production:
   none; the sandbox keeps its rehearsal bar). Names per Matthew: "Baystate
   Blasting (Alpha)", "(Beta)".
2. **Twins.** `User.platformRootId` marks a platform admin's hidden admin
   account in another company (`<local>+c-<cid8>@<domain>`, random password,
   born onboarded, tours done, licenses/signature copied). `requirePlatformAdmin`
   and the session's `platformAdmin` resolve through the root. Twins never
   appear in People or in Move lists; they cannot sign in by password.
3. **Server `/platform/companies`** (requireAuth + requirePlatformAdmin):
   `GET /` list (id, name, environment, createdAt, people, records, current),
   `POST /` create {name, environment, fromCompanyId?} (copies reference data
   — the rehearsal `copyCompanyData` — and rewrites the copied companySettings
   name; seeds catalog/manufacturers when empty), `PATCH /:id` {name?,
   environment?} (Company.name + the synced companySettings.companyName),
   `POST /:id/switch` → twin session, `POST /:id/move-people` {userIds}
   (must belong to the caller's company, not twins/roots; moves the account,
   re-links or copies the crewMembers record, revokes refresh tokens),
   `DELETE /:id` (never production, never the current company, never the
   sandbox; wipes records, audit, feedback, invites, users incl. twins).
4. **Web:** `lib/companies.ts` (list/create/rename/switch/move/delete; the
   switch stores the twin session, carries the device PIN to the twin,
   `resetLocalReplica()`, reloads), Settings **Company card** (platform admin,
   not in rehearsal: select + Manage companies link), **Admin › Companies**
   (platform tab; list, New company form, Rename, Switch here, Move people
   here sheet with the current company's people, Delete with typed name).
5. **Invites by environment:** `inviteMail` takes `mode`; enrollment picks
   production copy for a production company, testing otherwise, unless
   `INVITE_MODE` is set explicitly.
6. Harness 56: as Mark — create "(Beta)" from the current company, switch
   (name + tag, no Set-PIN, no Alpha day on the device), invite from Beta and
   enroll a tester on a second device (company Beta, no Alpha record), create
   a production company from Beta, move the tester, tester signs in again
   (production, roster linked), switch back, delete both; 403s for a company
   admin.
7. Built in-round: a moved person's device still held a valid access token
   for the old company, so `/powersync/token` now refuses a token whose
   company is no longer the account's (`company_moved`) and the client
   probes it before any refresh, drops the session (PIN kept) and shows the
   sign-in — "each device signs in once" is literally true.
   **Matthew's next moves:** Admin › Companies → Rename the current company
   to "Baystate Blasting (Alpha)" (environment Alpha) → New company
   "Baystate Blasting (Beta)" from Alpha's reference data → Settings ›
   Company → switch → send the beta invites from there.

**S8d — probe + load test — ✅ SHIPPED 2026-09-08** (full write-up:
docs/ops-probe-and-load.md). `testing/probe/probe.mjs` + the *Uptime probe*
workflow every 10 min (health · sign-in · sync token · sync service · web ·
manifest; one DOWN email, one RECOVERED email; state = an open issue
labelled `probe-down`; signed-in checks read *skipped* until the secrets
exist). `testing/load/loadtest.mjs` + the manual *Load test* workflow:
virtual devices = real PowerSync streams over HTTP + the real upload
endpoint inside a throwaway Beta company on the API you name (deleted at
the end); upload / delivery-lag / token / health p50-p95-max, error rate,
reconnects; red above 2 % errors or 30 s p95 lag. No staging deployment
exists: the data is isolated, the server is the real one — run it at
night. **Matthew:** secrets PROBE_EMAIL · PROBE_PASSWORD · RESEND_API_KEY ·
ALERT_TO (+ LOADTEST_EMAIL · LOADTEST_PASSWORD), a probe user in People.

**Help guide (plan artifact 16b5f92f, accepted 2026-09-08; calls in decisions.md):**
1. Frame: `apps/web/help/**/*.md` + `src/help/index.ts` (glob import, frontmatter,
   section order, `helpForRoute`), `pages/HelpPage.tsx` at `/help` and
   `/help/:section/:page` (public, own header; phone sections › pages › page;
   wide TOC · page · on-this-page; search), `marked` renderer + `.help-doc`
   styles, draft / planned banners.
2. Doors: ? menu *Help guide*; Settings › Help *Help guide*; About this screen
   "Read more in the guide"; the invitation email links Start here.
3. Screenshots: `testing/help-shots.mjs` captures named screens from the dev
   app at phone width into `apps/web/public/help-img/`.
4. Batches: H1 Start here + Blaster (this round) · H2 Driller + Shop +
   Supervisor · H3 Office + Admin + Reference + Something's wrong. Pages of
   later batches exist as *planned* stubs so the whole structure shows.
5. Harness 57: public /help without sign-in, search, a page with headings,
   draft/planned banners, the three doors, route → page mapping.
   **H1 ✅ 2026-09-08:** frame + 21 draft pages (Start here 7, Blaster 14) +
   16 real screenshots. **H2 + H3 ✅ same day** (Matthew: "complete the help
   docs"): Driller 7 · Supervisor 4 · Shop 5 · Office 7 · Admin 6 ·
   Reference 3 · Something's wrong 6 — 59 pages, 30 screenshots, every
   page a draft until Matthew marks it reviewed (the Draft banner carries
   Send feedback).

**Sync load — photos out of records (2026-09-08; decisions.md) — ✅ SHIPPED (harness58 9/9; 19 green after a stale day-view selector was fixed):**
1. `SeismoReading.printoutAttachmentId`; the capture form stores the printout
   through `addAttachmentFiles(readingId, 'seismo_reading', …, 'photo')` — device
   media + thumb + metadata record; the background uploader moves the binary
   to R2. `printoutImage` is never written again (kept in the type for legacy
   rows and print/PDF fallbacks).
2. The reading card shows the attachment's thumb (or the legacy inline image);
   tap opens the full photo through the attachment resolver (device → R2).
3. Server `legacyImages.ts`: boot migration (and `POST /platform/migrations/
   inline-images`) for `seismoReadings.printoutImage.__blob` → R2 key
   `c/<cid>/a/seismo-photo-<readingId>/printout.<ext>` + an `attachments`
   record (kind photo, storageStatus stored, sha256, size), and for
   `attachments.data.__blob` → R2 under the app's key, `data: null`,
   `storageStatus: 'stored'`. /health reports `legacyInlineImages`.
4. After deploy: run the migration, then **compact the bucket in PowerSync
   Cloud** so cold downloads stop replaying the old blob versions; re-measure
   with the size probe (target ≈ 1 MB per full download).
5. Harness 58: a reading with a photo syncs metadata-only (no `__blob` in the
   record), the thumb shows on both devices, the other device's open falls
   back truthfully without R2; the migration endpoint answers (skipped
   without R2 locally); the seismo nudges still count photos.

**Sync load, part two (2026-09-08) — ✅ SHIPPED (harness59 5/5):** the images that stay inside records are made small — the site-sketch snapshot is capped at 1280 px / JPEG 0.7 (`lib/imageCompress.ts`, ~10 KB instead of ~35, and it is re-sent on every shot edit) and signatures are cropped to the ink, downscaled to ≤600 px and flattened to two colours (~3 KB instead of ~15). Existing records are not rewritten (0.6 MB, fades as old days age out). Next lever when history grows: partial sync with Sync Streams (reference + recent days for everyone; an archive stream for office/admin), scheduled after the beta invites.

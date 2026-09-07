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

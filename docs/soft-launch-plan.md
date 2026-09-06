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

### S2 — Guidance (web only)

1. **Role-aware tour**, auto-run once per account (`tourDoneAt` on the
   user profile so it follows the account, not the device), re-runnable
   from Settings › Help. Scripts per home bucket (field / driller /
   mechanic / office / admin), each navigating to 3–5 real screens with
   anchors that exist on both layouts (add `data-tour` to the sidebar).
   Rewrite stale copy (I6).
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

### S3 — Feedback & diagnostics (shared + server + web)

1. **`feedback` synced table**, append-only (template: `hourCorrections`):
   `{kind: bug|idea|question, message, route, role, buildId, userAgent,
   online, syncLogTail[], screenshotMediaId?, status: new|seen|done,
   replyNote?}`. PUT = every role; PATCH/DELETE = admin-only. Works
   offline — that is the point on a jobsite.
2. **Composer**: header "?" menu → "Send feedback" (also in Settings and
   in the coach sheet). One textarea + kind chips + "include a screenshot"
   (html-to-image of `main`, via localMedia → R2 like attachments).
   Toast "Sent — thanks" via undo-toast.
3. **Error boundary** at the App root + `window.onerror`/`unhandledrejection`
   capture: shows "Something broke — send a report?" prefilled with the
   stack, route, and sync log; a Reload button. Never a white screen.
4. **Triage**: Admin › Feedback tab (capability `process_feedback`, on the
   admin bundle only) — list, status, reply note. Server hook at the
   choke point: on each new `feedback` row, email Matthew (Resend) with
   the message + a deep link. Platform Admin cross-tenant view is a
   later round; single tenant is fine for the soft launch.
5. `/health` and the Settings build line already expose the build id —
   stamp it on every feedback row.

Harness: offline feedback queues and lands; error boundary catches a
thrown render; admin sees + closes; email hook fires.

### S4 — Clutter sweep (web only)

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

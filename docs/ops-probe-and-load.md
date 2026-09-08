# Ops: the uptime probe and the load test (Round S8d, 2026-09-08)

Two GitHub Actions, no servers to run, no new dependencies.

## Uptime probe — `.github/workflows/uptime-probe.yml`

Every 10 minutes (GitHub's scheduler can run a few minutes late) the probe
checks, in order:

| Check | What it proves |
|---|---|
| API health | the API answers and reports its commit, email and file storage |
| Sign in | a real account can sign in (PROBE_EMAIL / PROBE_PASSWORD) |
| Sync token | a signed-in device gets a sync token and the sync endpoint |
| Sync service | the PowerSync service answers its liveness probe |
| Web app | the web address serves the app |
| Web manifest | the PWA manifest is served (install + icons) |

One email when it goes **DOWN** (listing the failed checks), one when it
**RECOVERS** (with how long it was down). Between the two it stays quiet.
Its memory is a GitHub issue labelled `probe-down` — opened on the first
failure, closed with a comment on recovery — so the repo's Issues tab is
also the incident log. Until the probe account secrets exist, the three
signed-in checks are reported as *skipped*, never as an outage.

**Set-up (once, Matthew):**
1. Admin › People → add an office user "Uptime Probe" with an email you
   control (the account never signs in on a device; the temp password is
   the probe password — it does not need changing).
2. GitHub → Settings → Secrets and variables → Actions → **Secrets**:
   `PROBE_EMAIL`, `PROBE_PASSWORD`, `RESEND_API_KEY` (the same key Railway
   has), `ALERT_TO` (your address; comma-separate for more).
3. Optional **Variables**: `PROBE_API_URL`, `PROBE_WEB_URL` if the addresses
   ever change (defaults: the Railway API and the Vercel app).
4. Actions → *Uptime probe* → Run workflow once to see a green run.

Run it by hand any time: `node testing/probe/probe.mjs` (defaults to the
local stack; with `API_URL`/`WEB_URL` set it probes whatever you name and
only prints — no issue, no email — unless the GitHub/Resend variables are
present).

## Load / soak test — `.github/workflows/load-test.yml` (manual only)

Never on a push, never on a schedule. **Run it at night.** It targets the
API you name (default: production) but everything happens inside a
throwaway company — "Load test <stamp>", environment Beta, its own sync
bucket — so no real company ever sees a byte of it, and the company is
deleted at the end (tick *keep_company* to look at it first).

What a run does: a platform admin creates the company, becomes its admin
twin, creates N device logins; each **virtual device** holds the real
PowerSync stream open (the sync protocol over HTTP — no browser) and writes
through the real upload endpoint at a steady rate (a job first, then work
days and the occasional patch). Health and sync-token requests are sampled
throughout.

| Number | Meaning |
|---|---|
| Upload p50 / p95 / max | how long a device's write takes to be accepted |
| Delivery lag p50 / p95 / max | write → seen on *another* device's stream (the number the field feels) |
| Sync token, Health | API responsiveness under the load |
| Errors | non-2xx responses and stream drops, as a share of all requests |
| Undelivered | writes that never reached every other device within 30 s of the end |

The run is red when the error rate is above 2 %, delivery p95 is above 30 s,
or anything was undelivered. The report is the job summary, an artifact
(`loadtest-report`: `report.md` + `report.json`) and, with `RESEND_API_KEY`
+ `ALERT_TO`, an email.

**Set-up (once):** secrets `LOADTEST_EMAIL` / `LOADTEST_PASSWORD` — a
platform-admin account (yours). Inputs at run time: `devices` (10),
`minutes` (30), `writes_per_min` (6), `keep_company`.

Suggested first run: 10 devices × 30 min × 6 writes/min (≈ 1,800 writes,
a busy day for a fleet-tier company, compressed). Suggested overnight soak:
25 devices × 240 min × 4 writes/min. Local dress rehearsal:
`DEVICES=4 MINUTES=1 node testing/load/loadtest.mjs` against the dev stack.

**About "staging":** there is no separate staging deployment yet. The
throwaway company isolates the *data*; the *server* under load is the real
one, which is why the run is manual and nocturnal. If a true staging copy
is ever stood up, point `api_url` at it and nothing else changes.

## Reference — 2026-09-08 local dress rehearsal

4 devices × 0.5 min × 12 writes/min on the dev stack: 28 writes, all
delivered; upload p50 8 ms / p95 15 ms; delivery lag p50 24 ms / p95 45 ms;
0 errors, 0 reconnects.

# Two-device sync harness

The cutover gate for the PowerSync migration: three Playwright scripts that
drive multiple isolated browser contexts ("devices") against the full local
stack and assert convergence under realistic field conditions.

## Scenarios covered

| # | Scenario | Asserts |
|---|----------|---------|
| S1 | Fresh-device hydration | second login sees first device's records |
| S2 | Interleaved writes, different records | both directions converge |
| S3a | Deterministic seed collision | both devices end with exactly 59 products (regression: composite `(company_id, id)` PK — a global id PK silently dropped colliding seed uploads) |
| S3b | Same-record simultaneous edit | all devices converge to ONE value (server arrival order) |
| S3c | Same-record sequential edit | later writer wins everywhere |
| S4 | Offline window | queue counts truthfully in the UI, other device unaffected, drains and converges on reconnect |
| S5 | Kill mid-sync | write queued offline survives page death, delivers after reopen |
| S6 | Device clock 3 days behind | past-dated edit still wins everywhere (clocks are irrelevant by construction) |
| FINAL | Consistency sweep | all devices hold byte-identical jobs/crew/product data |

Last full run: **Jul 26, 2026 — 9/9 pass** (branch `powersync`).

## Running it

1. Local stack:
   ```bash
   docker compose -f infra/powersync/docker-compose.yml up -d
   DATABASE_URL=postgresql://postgres:spikepass@localhost:5434/shotlog npx prisma db push   # first time, from apps/server
   # API against the same Postgres (from apps/server):
   DATABASE_URL=postgresql://postgres:spikepass@localhost:5434/shotlog \
     JWT_SECRET=dev-only-secret-change-in-production \
     ADMIN_EMAIL=mark@baystateblasting.com ADMIN_PASSWORD=dev-password-123 \
     PORT=4000 npx tsx src/index.ts
   npm run dev -w apps/web -- --port 5199 --strictPort
   ```
2. Run `harness1.mjs`, then `harness2.mjs`, then `harness3.mjs` in order via
   Playwright MCP `browser_run_code_unsafe` (each file is a bare
   `async (page) => {...}` expression), or adapt into `@playwright/test`.
   They find each other's devices via a `harness-device` localStorage marker,
   so they must run in the same browser session.
3. Every scenario returns `{scenario, pass, detail}` — all must pass before
   any sync-affecting change ships.

Notes:
- Harness pre-seeds `shotlog-server-url`, a PIN, and `shotlog-last-active`
  in localStorage so devices skip PIN setup and talk to localhost:4000.
- Dev server pages can't load while the context is offline (no service
  worker in dev) — S5 restores the network after the page is killed, before
  reopening.
- Stale JWTs from before a local DB reset still verify (signature-only
  check); close leftover app tabs before a run or they pollute `records`
  under a dead company id.

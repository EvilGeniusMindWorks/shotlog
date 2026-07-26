# PowerSync Migration Plan

Decision (Jul 26, 2026): replace the custom sync engine with PowerSync.
Goal: **one system of record (Postgres)**, invisible sync, no repair UX.

## Target architecture

```
Postgres (Railway) ──logical replication──► PowerSync service ──websocket──► device SQLite
      ▲                                                                         │
      └────────────── writes (ordered, server-authoritative) ◄── upload queue ──┘
```

- **Postgres is the only authority.** Devices hold a PowerSync-managed
  SQLite replica of their company's records.
- **Writes** queue locally (offline-safe) and apply through our Express
  API in order. Device clocks are irrelevant by construction — the server
  applies writes in arrival order.
- **Reads** are watched SQLite queries; the UI re-renders on every local
  or replicated change.
- The only sync UI: a persistent "All changes saved / N changes waiting
  for signal" indicator driven by SDK truth (connected, lastSyncedAt,
  upload-queue count).

## What gets DELETED

- apps/web/src/lib/sync.ts engine: push/pull, LWW, tombstones, monotonic
  stamps, stale recovery, deep check, repair, auto-sync hooks (~700 lines)
- SyncCard: Sync Now, Deep Check, Repair, device-vs-server panels
- Server: /sync/push, /sync/changes, /sync/manifest, SyncRecord LWW logic

## Phases

1. **Spike (this branch)** — local PowerSync service in Docker, `records`
   table, JWT auth (HS256), upload endpoint, two-origin browser proof:
   create/edit/delete converge across devices; offline queue drains.
2. **Data layer port** — DONE (Jul 26). `apps/web/src/db/facade-types.ts`
   defines the exact Dexie subset the UI uses; ALL app code now
   type-checks against it (Dexie satisfies it via cast, so any new
   Dexie-ism fails the build). `db/powersync/` implements the facade over
   the `records` table (json_extract queries, blob↔base64 markers in the
   SAME wire format as the old sync engine — server payloads migrate
   as-is), plus a `useLiveQuery` shim over `onChangeWithCallback`.
   Backend selected by `VITE_POWERSYNC=1` in `db/index.ts`; 17 UI files
   changed only their `useLiveQuery` import line. 17 vitest tests run the
   facade against node:sqlite (`npm test -w apps/web`). Browser-smoke
   PASSED: dashboard + job create + live render + row in Postgres.
   Deferred to phase 3: blobs still travel inside payloads (as before) —
   the attachment-reference pattern needs the server endpoints anyway.
3. **Server port** — DONE (Jul 26). `Record` model (`records` table),
   `/powersync/token` + `/powersync/upload` in Express (company-scoped,
   ordered, COALESCE patches), `scripts/migrate-sync-records.ts` copies
   SyncRecord docs verbatim (idempotent, never overwrites).
   **Hard-won: PRIMARY KEY must be `(company_id, id)`** — deterministic
   ids (the seed-* catalog every device creates) collide across
   companies; with a global id PK those uploads were silently dropped
   and the checkpoint then wiped the devices' optimistic rows. Caught by
   the harness, fixed structurally.
4. **Infra** — local stack proven (this repo's docker compose + API on
   one Postgres). Railway runbook: `infra/powersync/DEPLOY.md`
   (wal_level=logical + restart, PowerSync service container, fresh HS256
   secret/kid, PowerSync Cloud as fallback). NOT yet deployed.
5. **Cutover** — code side DONE (Jul 26): PowerSync is the default
   backend (`VITE_POWERSYNC=0` is the emergency Dexie fallback); old
   engine deleted (web sync.ts → session.ts/export.ts survive it,
   SyncCard → AccountSyncCard, server /sync routes removed); the only
   sync UI is the truthful saved/waiting indicator. Two-device harness
   (`testing/two-device/`) passed 9/9: hydration, interleaved
   different/same-record, offline window with truthful queue count,
   kill-mid-sync queue survival, clock 3 days behind (edit still wins),
   full-dataset identity across three devices. One unreproduced
   pre-fix artifact: a duplicate UI job creation observed once BEFORE
   the PK fix — watch for job dupes in early field use.
   Remaining before devices switch: Railway deploy (step 4) + run the
   data migration + one release with Dexie data kept as safety net.

## Risks

- **Blob volume** over PowerSync rows: keep payloads lean (references,
  not bytes) — the attachment upload path already exists in our API.
- **Railway logical replication**: verified locally first; PowerSync
  Cloud is the tested fallback.
- **Facade fidelity**: the Dexie-subset shim is the main engineering
  risk; built against the existing UI test flows before cutover.

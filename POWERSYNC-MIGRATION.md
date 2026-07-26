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
3. **Server port** — `records` table replaces SyncRecord (same document
   shape: one row per record, JSON payload); `/powersync/token` (HS256,
   aud=powersync, cid claim) and `/powersync/upload` (applies queued ops
   in order, company-scoped) join the existing Express app. One-time
   migration script copies SyncRecord rows into `records`.
4. **Infra** — PowerSync service container deployed on Railway alongside
   the API; Railway Postgres needs `wal_level=logical` (ALTER SYSTEM +
   restart). Fallback if Railway blocks logical replication: PowerSync
   Cloud (free tier) pointed at the same Postgres.
5. **Cutover** — two-device Playwright harness must pass: interleaved
   edits, offline windows, skewed clocks (no-op by design), kill-mid-sync.
   Then: deploy, devices do a one-time full hydrate on first launch,
   Dexie data kept read-only for a release as a safety net, then removed.

## Risks

- **Blob volume** over PowerSync rows: keep payloads lean (references,
  not bytes) — the attachment upload path already exists in our API.
- **Railway logical replication**: verified locally first; PowerSync
  Cloud is the tested fallback.
- **Facade fidelity**: the Dexie-subset shim is the main engineering
  risk; built against the existing UI test flows before cutover.

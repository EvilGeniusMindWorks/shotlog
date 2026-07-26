# Deploying PowerSync to production (Railway)

The local stack (docker-compose.yml here) mirrors production: Postgres with
logical replication + the PowerSync service + the Express API. Production
needs the same three pieces.

## 1. Railway Postgres: enable logical replication

```sql
ALTER SYSTEM SET wal_level = logical;
```
then **restart the database** (Railway dashboard → database → restart).
Verify: `SHOW wal_level;` → `logical`.

If Railway's plan blocks logical replication, the tested fallback is
**PowerSync Cloud** (free tier) pointed at the same Railway Postgres —
service config is identical, only hosting changes.

## 2. Schema + data migration (one-time)

```bash
# from apps/server, DATABASE_URL = Railway Postgres
npx prisma migrate deploy            # creates records + publication
npx tsx scripts/migrate-sync-records.ts   # copies SyncRecord docs into records
```

The migration is idempotent and never overwrites existing `records` rows.
SyncRecord stays in place (read-only safety net) for one release.

## 3. PowerSync service on Railway

Deploy `journeyapps/powersync-service:latest` as a new Railway service:

- Start command: `start -r unified`
- Provide config like `service.yaml` + `sync_rules.yaml` (env-var refs):
  - `PS_SOURCE_URI` = Railway Postgres URL (the shotlog database)
  - `PS_STORAGE_URI` = a second database on the same instance
    (`CREATE DATABASE powersync_storage;`)
  - sslmode as Railway requires (`require` in prod, not `disable`)
- **Generate a fresh HS256 secret** (do NOT reuse the dev one):
  `openssl rand -base64 48`. Put its base64url form as the JWKS `k` with a
  new `kid` (e.g. `shotlog-prod-1`).
- Expose the service's port publicly; note the URL.

## 4. API env vars (Railway API service)

```
POWERSYNC_JWT_SECRET=<the same fresh secret, raw form>
POWERSYNC_JWT_KID=shotlog-prod-1
POWERSYNC_URL=https://<powersync-service-public-url>
```

## 5. Verify before pointing devices at it

- `GET /powersync/token` (authed) returns a token + endpoint
- A test browser at the production web app: log in, create a record,
  confirm the row lands in Railway `records`, second browser sees it.
- Devices then hydrate on first launch — old IndexedDB data stays untouched
  as the local safety net for one release.

## Kill switch

`VITE_POWERSYNC=0` at web build time falls back to the Dexie backend
(device-local only, no sync engine behind it anymore) — an emergency brake,
not a long-term mode.

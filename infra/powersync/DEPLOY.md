# Production cutover runbook (Railway + Vercel)

Do the steps in this order. Nothing user-visible changes until step 8
(the merge) — steps 1–7 are safe to do at any time.

## 0. Pre-flight — protect unsynced field data

On every field device still running the OLD app: open Settings → Sync,
press **Sync Now**, confirm it reports synced with no pending count.
Anything the old engine never pushed is NOT copied by the migration
(it only reads the server's SyncRecord table).

## 1. Postgres: enable logical replication

```bash
psql "$RAILWAY_DATABASE_URL" -c "ALTER SYSTEM SET wal_level = logical;"
```
Railway dashboard → Postgres service → ⋮ → **Restart**. Then verify:
```bash
psql "$RAILWAY_DATABASE_URL" -c "SHOW wal_level;"   # must print: logical
```
If ALTER SYSTEM is rejected (not superuser) or the setting doesn't stick,
stop here and use the PowerSync Cloud fallback (bottom of this file).

## 2. Create the storage database

```bash
psql "$RAILWAY_DATABASE_URL" -c "CREATE DATABASE powersync_storage;"
```

## 3. Generate the production secret

```bash
SECRET=$(openssl rand -hex 32)
K=$(node -e "console.log(Buffer.from(process.argv[1]).toString('base64url'))" "$SECRET")
echo "POWERSYNC_JWT_SECRET=$SECRET"
echo "PS_JWKS_K=$K"
```
Keep both values; the raw form goes to the API, the base64url form to the
PowerSync service. Never reuse the dev secret.

## 4. Deploy the PowerSync service

First `git push origin powersync` so the config is on GitHub.

Railway project → **New service → GitHub repo**, same repo:
- Settings → Source → **Branch:** `powersync` for now (switch to `main`
  after step 8's merge), **Root Directory:** `infra/powersync/prod`
  (it contains the Dockerfile; Railway builds it automatically)
- Settings → Networking → **Generate Domain**, target port **8080**
- Variables:
  - `PS_SOURCE_URI` = the *private* URL of the shotlog Postgres
    (`postgresql://postgres:<pw>@postgres.railway.internal:5432/railway`)
  - `PS_STORAGE_URI` = same but database `powersync_storage`
  - `PS_JWKS_K` = the base64url value from step 3

Deploy; logs should show replication connecting and sync rules loading.

## 5. API service env vars

On the existing API service, add:
```
POWERSYNC_JWT_SECRET=<raw secret from step 3>
POWERSYNC_JWT_KID=shotlog-prod-1
POWERSYNC_URL=https://<powersync service domain from step 4>
```
(Don't redeploy yet — the routes ship in step 8.)

## 6. Schema migration

```bash
cd apps/server
DATABASE_URL="$RAILWAY_DATABASE_URL" npx prisma migrate deploy
```
Creates `records` with the `(company_id, id)` composite PK and the
`powersync` publication. Idempotent.

## 7. Data migration (SyncRecord → records)

```bash
DATABASE_URL="$RAILWAY_DATABASE_URL" npx tsx scripts/migrate-sync-records.ts
```
Prints `migrated N records, skipped M`. Idempotent; never overwrites;
SyncRecord rows stay in place as the read-only safety net.
Sanity check:
```bash
psql "$RAILWAY_DATABASE_URL" -c \
  "SELECT table_name, count(*) FROM records GROUP BY table_name ORDER BY 1;"
```

## 8. Ship the code

```bash
git checkout main && git merge powersync && git push
```
- Railway auto-deploys the API (adds /powersync/*, removes /sync/*).
- Vercel auto-deploys the web app (PowerSync backend is the default).

Devices auto-update within ~1 hour (hourly SW check). In the window
between API deploy and a device's update, the old app's sync calls 404 —
harmless, data stays local, and it heals on update.

## 9. Verify production

1. Browser 1 → production web app → log in → confirm existing jobs/blast
   days appear (hydrated from `records`).
2. Create a test record; confirm the sidebar shows "All changes saved".
3. Browser 2 (or private window) → log in → the test record is there.
4. Delete the test record; confirm it disappears in browser 1.
5. `psql`: the record row is gone from `records`.

## 10. After one clean release

Remove the Dexie fallback (`VITE_POWERSYNC` handling, db/database.ts,
dexie deps) and drop the SyncRecord table.

## Fallback: PowerSync Cloud

If Railway blocks logical replication: create a free instance at
powersync.journeyapps.com, point it at the Railway Postgres public URL
(sslmode require), paste the same sync rules, configure HS256 client auth
with the step-3 values, and set `POWERSYNC_URL` to the cloud instance URL.
Steps 5–9 are unchanged.

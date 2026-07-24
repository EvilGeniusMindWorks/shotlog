# Deploying the ShotLog sync server to Railway

The web app stays on its own hosting (or the Vercel demo project); this
deploys `apps/server` + Postgres. ~10 minutes, all in the Railway dashboard.

## One-time setup

1. **Create the project**: railway.app → New Project → *Deploy from GitHub repo*
   → pick `EvilGeniusMindWorks/shotlog`. Railway reads `railway.json` at the
   repo root for build/start commands — no root-directory setting needed.
2. **Add Postgres**: in the project canvas, *+ New → Database → PostgreSQL*.
3. **Set service variables** on the app service (*Variables* tab):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference, not literal) |
   | `JWT_SECRET` | output of `openssl rand -base64 48` |
   | `ADMIN_EMAIL` | your login email |
   | `ADMIN_PASSWORD` | a strong password (change-password works in-app after) |
   | `ADMIN_NAME` | display name |

4. **Deploy** (happens automatically on variable save / next push to `main`).
5. **Get the URL**: service → *Settings → Networking → Generate Domain* →
   something like `https://shotlog-sync-production.up.railway.app`.
6. **Verify**: `curl https://<domain>/health` → `{"ok":true,...}`.

## Connect the app

In ShotLog → Settings → **Sync & Backup**: enter the Railway URL, the admin
email + password → *Connect & Sync*. First sync pushes the device's full
local database; from then on it syncs on demand and whenever connectivity
returns.

## Notes

- Prisma migrations run automatically on every deploy (`migrate deploy`).
- Deletions propagate via tombstones; conflict policy is last-write-wins by
  the record's client `updatedAt`.
- The database stores synced records as JSONB documents (see
  `apps/server/prisma/schema.prisma` for the rationale).
- Local dev: `docker run -d --name shotlog-pg -e POSTGRES_PASSWORD=devpass
  -e POSTGRES_DB=shotlog -p 5433:5432 postgres:16-alpine`, copy
  `.env.example` → `.env`, then `npx prisma migrate dev` and
  `npm run dev -w apps/server`.

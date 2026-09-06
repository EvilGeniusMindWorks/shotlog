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
5. **Get the URL**: service → *Settings → Networking → Generate Domain*.
   The dialog asks for a target port: check *Deploy Logs* for
   `ShotLog sync server listening on :XXXX` and enter that number —
   Railway injects `PORT` (observed: 8080), and the server obeys it.
   A 502 "Application failed to respond" means the domain's target port
   doesn't match; it's editable in Networking without a redeploy.
6. **Verify**: `curl https://<domain>/health` → `{"ok":true,...}`.

> Note: Railway's monorepo import may also create a `@shotlog/web`
> service — delete it; the web app doesn't deploy on Railway.

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

## Email + password reset (Round S1, 2026-09-06)

- `RESEND_API_KEY` + `INVITE_FROM` on the Railway server service turn on
  invite and password-reset email (see docs/resend-setup.md). Without them
  the app still works: invites fall back to a copyable link and the
  forgot-password screen tells the user to ask their admin.
- `/health` reports `email: true|false`.
- `AUTH_DEBUG_LINKS=1` makes `/auth/forgot` echo the reset link when email
  is OFF. Dev/harness only — never set it in production.
- Migration `20260906120000_password_resets` adds `User.mustChangePassword`,
  `User.onboardedAt`, and the `PasswordReset` table; `migrate deploy` runs
  it on start. Existing accounts see the one-time welcome on their next
  sign-in (onboardedAt is null until acknowledged).

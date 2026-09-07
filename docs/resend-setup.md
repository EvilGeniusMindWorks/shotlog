# ShotLog — Resend email setup (production)

Goal: make invite emails (and, after Round S1, password-reset emails) send
from the production server. The server already knows how to talk to
Resend. It is missing only an API key and a sending address.

Budget: about 30 minutes of clicking, plus DNS propagation (minutes to an
hour).

## What the server reads

| Variable | Value | Where |
|---|---|---|
| `RESEND_API_KEY` | the key Resend gives you (starts with `re_`) | Railway → project **Shotlog** → server service → **Variables** |
| `INVITE_FROM` | `ShotLog <invites@mail.yourdomain.com>` | same |
| `APP_URL` | already defaults to `https://shotlog-app.vercel.app`; set only if the web address changes | same |

## Steps

### 1. Decide the sending domain

Pick a domain you control. Use a **subdomain** reserved for app mail, for
example `mail.evilgenius.io` or `mail.shotlog.app`. That keeps the DNS
records away from your normal email, so nothing you do here can affect
inbox delivery for the main domain.

### 2. Create the Resend account

Go to https://resend.com and sign up (GitHub or email). The free tier is
3,000 emails a month and 100 a day. Invites and password resets will
never come close.

### 3. Add the domain in Resend

Resend → **Domains** → **Add Domain** → type the subdomain from step 1 →
region **US East** → **Add**. Resend shows a table of DNS records to
create. Keep that tab open.

### 4. Create the DNS records at your registrar

Open wherever the domain's DNS is managed (Cloudflare, GoDaddy,
Namecheap, Google Domains, and so on). Add each record exactly as Resend
lists it. There are usually three:

- **DKIM** — a TXT record named like `resend._domainkey.mail` with a long
  value beginning `p=`.
- **SPF** — an MX record and a TXT record on `send.mail` (Resend gives
  the exact names and values).
- **DMARC** (optional, recommended) — a TXT record on `_dmarc.mail` with
  value `v=DMARC1; p=none;`

Two gotchas:

- Most registrars want only the part **before** your domain in the Name
  field. If Resend shows `resend._domainkey.mail.evilgenius.io`, enter
  `resend._domainkey.mail`.
- On Cloudflare, set these records to **DNS only** (grey cloud), not
  proxied.

### 5. Verify

Back in Resend, click **Verify DNS Records**. Usually passes within
minutes; some registrars take up to an hour. The domain shows
**Verified** when done.

### 6. Create the API key

Resend → **API Keys** → **Create API Key**.
Name: `shotlog-production`. Permission: **Sending access**. Domain:
restrict to the one you just verified. Copy the key immediately; Resend
shows it once.

### 7. Put the values on Railway

https://railway.app → project **Shotlog** → the server service →
**Variables** → **New Variable**, twice:

```
RESEND_API_KEY = re_xxxxxxxxxxxxxxxxxxxx
INVITE_FROM    = ShotLog <invites@mail.yourdomain.com>
```

Railway redeploys the service when variables change. Wait for the
deployment to show **Active**.

### 8. Send yourself a test invite

In ShotLog as admin: **Admin → People → Add person** with your own name
and an email you can read → **Invite**. The row should say **Invite
emailed**. Open the email, click the link, and walk through the enroll
page.

If the page instead says *share this link*, the key is not being read.
Check the variable names for typos and confirm the deploy finished.

### 9. What Round S1 adds afterwards

A health marker so the People page can say honestly when email is off, a
branded HTML invite template, and the forgot-password email on the same
channel. None of that needs anything more from you.

## Your setup — decided 2026-09-06

- **Sending domain: `shotlog.evilgenius.io`.** Checked that day: the name
  has no A, CNAME or MX record, so nothing collides; Resend's records all
  sit *under* it and the bare name stays free for a website later.
- **DNS lives at GoDaddy** (ns21/ns22.domaincontrol.com). GoDaddy's
  "Name" field wants only the part before `evilgenius.io`:
  `resend._domainkey.shotlog` (DKIM TXT), `send.shotlog` (MX + SPF TXT),
  `_dmarc.shotlog` (optional DMARC TXT). Paste values exactly as Resend
  shows them; no trailing dot.
- **Root DMARC is `p=reject` (relaxed alignment)** and it also governs
  subdomains. That is fine once Resend's DKIM record is in place (the
  signature domain and the From domain are both `shotlog.evilgenius.io`,
  so they align) — but it means an unverified first test would be
  *rejected*, not just spam-foldered. Do step 4 before step 8.
- **Railway values:**
  `INVITE_FROM = ShotLog <invites@shotlog.evilgenius.io>` and the
  `RESEND_API_KEY`. Optionally `FEEDBACK_TO` / `PLATFORM_ADMIN_EMAILS`
  (Round S3) if you want feedback mail somewhere other than your login
  email.
- **Replies:** the subdomain has no mailbox, so a crew member who hits
  Reply gets a bounce. Options: add a `REPLY_TO` setting to the server so
  replies go to a real inbox, or leave it and rely on the in-app feedback
  composer (Round S3) as the reply channel.

## If something goes wrong

- **Resend says "domain not verified" after an hour**: re-check the
  record names (step 4 gotcha) and that no trailing dot or extra domain
  suffix was added by the registrar.
- **Email lands in spam**: add the DMARC record from step 4 and make sure
  `INVITE_FROM` uses the verified subdomain, not a Gmail or other address.
- **"Invite emailed" but nothing arrives**: Resend → **Emails** shows
  every send with its delivery status and the bounce reason if any.

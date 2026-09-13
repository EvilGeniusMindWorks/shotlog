#!/usr/bin/env node
// Print one ShotLog crash as a plain-text bundle for a debugging session
// (Round S11, Sep 13 2026 — Matthew: "anything else helpful for Claude to
// debug can be added").
//
//   node scripts/crash.mjs K7M2QD              # by the six-character report code
//   node scripts/crash.mjs --list              # open crash groups
//   node scripts/crash.mjs --group <fingerprint>
//
// Env: SHOTLOG_API (default https://shotlogserver-production.up.railway.app — override for
// local: http://localhost:4000), SHOTLOG_ADMIN_EMAIL + SHOTLOG_ADMIN_PASSWORD
// (a platform admin), or SHOTLOG_TOKEN (a bearer token already in hand).
const api = (process.env.SHOTLOG_API ?? 'https://shotlogserver-production.up.railway.app').replace(/\/$/, '');
const args = process.argv.slice(2);

async function token() {
  if (process.env.SHOTLOG_TOKEN) return process.env.SHOTLOG_TOKEN;
  const email = process.env.SHOTLOG_ADMIN_EMAIL;
  const password = process.env.SHOTLOG_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('Set SHOTLOG_ADMIN_EMAIL and SHOTLOG_ADMIN_PASSWORD (a platform admin), or SHOTLOG_TOKEN.');
    process.exit(2);
  }
  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    console.error(`login failed: ${res.status}`);
    process.exit(2);
  }
  const body = await res.json();
  return body.token ?? body.accessToken;
}

async function get(path, t) {
  const res = await fetch(`${api}${path}`, { headers: { authorization: `Bearer ${t}` } });
  if (!res.ok) {
    console.error(`${path}: ${res.status} ${await res.text().catch(() => '')}`);
    process.exit(1);
  }
  return res;
}

const t = await token();
if (args[0] === '--list' || args.length === 0) {
  const body = await (await get('/feedback/crashes', t)).json();
  if (!body.groups.length) console.log('No crashes.');
  for (const g of body.groups) {
    console.log(`${g.status.padEnd(5)} ${String(g.count).padStart(4)}×  ${g.side.padEnd(6)} ${g.fingerprint}  ${g.title}  (last ${g.lastSeen}, build ${g.lastBuild || '—'})`);
  }
} else if (args[0] === '--group') {
  const body = await (await get(`/feedback/crashes/${encodeURIComponent(args[1])}`, t)).json();
  console.log(body.bundle || '(no sample)');
} else {
  const res = await get(`/feedback/code/${encodeURIComponent(args[0].toUpperCase())}?format=text`, t);
  console.log(await res.text());
}

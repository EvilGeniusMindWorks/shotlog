#!/usr/bin/env node
// ShotLog connectivity probe (Round S8d). Runs every 10 minutes from a
// GitHub Action: is the API up, can a person sign in, can a device get a
// sync token and reach the sync service, is the web app being served?
// One email when it goes DOWN, one when it RECOVERS — state lives in a
// GitHub issue labelled `probe-down` so a scheduled job with no memory
// still knows what it said last time. Zero dependencies.
//
// Env: API_URL, WEB_URL, PROBE_EMAIL, PROBE_PASSWORD (an ordinary account,
// e.g. an office user "Uptime Probe"), RESEND_API_KEY + ALERT_TO (+ PROBE_FROM)
// for email, GITHUB_TOKEN + GITHUB_REPOSITORY for the issue. Without the
// GitHub/Resend variables it only prints.

const API = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const WEB = (process.env.WEB_URL ?? 'http://localhost:5199').replace(/\/$/, '');
const PROBE = process.env.PROBE_EMAIL ? { email: process.env.PROBE_EMAIL, password: process.env.PROBE_PASSWORD ?? '' } : process.env.API_URL ? null : { email: 'blaster@test.local', password: 'blaster-pass-123' };
const TIMEOUT = 15000;

const checks = [];
async function check(name, fn) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    checks.push({ name, ok: true, ms: Math.round(performance.now() - t0), detail: detail ?? '' });
  } catch (e) {
    checks.push({ name, ok: false, ms: Math.round(performance.now() - t0), detail: String(e.message ?? e).slice(0, 200) });
  }
}
async function get(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function run() {
  let accessToken = null;
  let endpoint = null;
  await check('API health', async () => {
    const r = await get(`${API}/health`);
    const j = await r.json().catch(() => null);
    if (r.status !== 200 || !j?.ok) throw new Error(`status ${r.status}`);
    return `commit ${j.commit ?? '?'} · email ${j.email} · files ${j.files}`;
  });
  if (!PROBE) {
    // No probe account yet (secrets PROBE_EMAIL / PROBE_PASSWORD): the
    // signed-in checks are reported as skipped, never as an outage
    for (const name of ['Sign in', 'Sync token', 'Sync service']) checks.push({ name, ok: true, ms: 0, detail: 'skipped — add PROBE_EMAIL / PROBE_PASSWORD secrets' });
  }
  if (PROBE) await check('Sign in', async () => {
    const r = await get(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(PROBE) });
    const j = await r.json().catch(() => null);
    if (r.status !== 200 || !j?.accessToken) throw new Error(`status ${r.status}`);
    accessToken = j.accessToken;
    return `${j.user?.company ?? ''}`;
  });
  if (PROBE) await check('Sync token', async () => {
    if (!accessToken) throw new Error('no session');
    const r = await get(`${API}/powersync/token`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const j = await r.json().catch(() => null);
    if (r.status !== 200 || !j?.token) throw new Error(`status ${r.status}`);
    endpoint = j.endpoint;
    return endpoint;
  });
  if (PROBE) await check('Sync service', async () => {
    if (!endpoint) throw new Error('no endpoint');
    const r = await get(`${endpoint}/probes/liveness`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
  });
  await check('Web app', async () => {
    const r = await get(`${WEB}/`);
    const html = await r.text();
    if (r.status !== 200 || !/ShotLog/i.test(html)) throw new Error(`status ${r.status}`);
  });
  await check('Web manifest', async () => {
    const r = await get(`${WEB}/manifest.webmanifest`);
    const j = await r.json().catch(() => null);
    if (r.status !== 200 || !j?.name) throw new Error(`status ${r.status}`);
    return j.name;
  });
  return checks;
}

// ── email (Resend) ───────────────────────────────────────────────────────
async function email(subject, text) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_TO;
  if (!key || !to) { console.log(`(email off) ${subject}\n${text}`); return; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.PROBE_FROM ?? 'ShotLog <invites@shotlog.evilgenius.io>', to: to.split(',').map((s) => s.trim()), subject, text }),
  });
  console.log(`email "${subject}" → ${r.status}`);
}

// ── state in a GitHub issue ──────────────────────────────────────────────
const GH = process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY ? { token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPOSITORY } : null;
async function gh(path, init = {}) {
  const r = await fetch(`https://api.github.com/repos/${GH.repo}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${GH.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function openIncident() {
  if (!GH) return null;
  const r = await gh('/issues?state=open&labels=probe-down&per_page=1');
  return Array.isArray(r.body) && r.body[0] ? r.body[0] : null;
}

const table = (cs) => cs.map((c) => `${c.ok ? 'OK  ' : 'FAIL'} ${c.name.padEnd(14)} ${String(c.ms).padStart(5)} ms  ${c.detail}`).join('\n');

async function main() {
  const cs = await run();
  const failed = cs.filter((c) => !c.ok);
  const now = new Date().toISOString();
  console.log(`ShotLog probe ${now} → ${API} · ${WEB}\n${table(cs)}`);
  const incident = await openIncident();
  if (failed.length) {
    const summary = `ShotLog probe ${now}\n${table(cs)}\n\nAPI ${API}\nWeb ${WEB}`;
    if (!incident) {
      if (GH) await gh('/issues', { method: 'POST', body: JSON.stringify({ title: `ShotLog is down — ${failed.map((f) => f.name).join(', ')}`, body: '```\n' + summary + '\n```\nOpened by the connectivity probe; it closes this issue when every check passes again.', labels: ['probe-down'] }) });
      await email(`ShotLog DOWN — ${failed.map((f) => f.name).join(', ')}`, summary);
    } else {
      console.log(`still down (issue #${incident.number} open) — no new email`);
    }
    process.exit(1);
  }
  if (incident) {
    const since = new Date(incident.created_at);
    const mins = Math.round((Date.now() - since.getTime()) / 60000);
    const summary = `ShotLog probe ${now} — every check passes again after ${mins} min.\n${table(cs)}`;
    if (GH) {
      await gh(`/issues/${incident.number}/comments`, { method: 'POST', body: JSON.stringify({ body: '```\n' + summary + '\n```' }) });
      await gh(`/issues/${incident.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
    }
    await email(`ShotLog RECOVERED after ${mins} min`, summary);
  }
}

main().catch((e) => {
  console.error('probe crashed:', e);
  process.exit(1);
});

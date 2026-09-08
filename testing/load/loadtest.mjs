#!/usr/bin/env node
// ShotLog load / soak test (Round S8d). Matthew: "get ready to be able to
// run it like in an overnight" — a MANUAL run, never during development.
//
// What it does: signs in as a platform admin, creates a throwaway company
// ("Load test <stamp>", environment beta — its own sync bucket, so real
// companies never see a byte of it), invites N virtual DEVICES into it,
// and for M minutes each device behaves like a field tablet: it holds a
// live PowerSync stream open (the real sync protocol, no browser) and
// writes records at a steady rate through the real upload endpoint. Every
// write is timed twice: how long the upload took, and how long until every
// OTHER device's stream delivered it (delivery lag). Health and token
// requests are sampled throughout. At the end the company is deleted and a
// report is written (Markdown + JSON) with p50 / p95 / max, error rate,
// stream reconnects and throughput.
//
// Usage (env):
//   API_URL           https://shotlogserver-production.up.railway.app
//   ADMIN_EMAIL/ADMIN_PASSWORD   a platform admin (creates + deletes the company)
//   DEVICES=10 MINUTES=30 WRITES_PER_MIN=6 KEEP_COMPANY=0 OUT=./loadtest
//   node testing/load/loadtest.mjs
// Zero dependencies — node 20+ (fetch, streams).

const API = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const ADMIN = { email: process.env.ADMIN_EMAIL ?? 'mark@baystateblasting.com', password: process.env.ADMIN_PASSWORD ?? 'dev-password-123' };
const DEVICES = Math.min(50, Math.max(1, Number(process.env.DEVICES ?? 10)));
const MINUTES = Math.min(600, Math.max(0.2, Number(process.env.MINUTES ?? 30)));
const WRITES_PER_MIN = Math.min(60, Math.max(1, Number(process.env.WRITES_PER_MIN ?? 6)));
const KEEP = process.env.KEEP_COMPANY === '1';
const OUT = process.env.OUT ?? './loadtest';
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uuid = () => globalThis.crypto.randomUUID();
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const stats = (arr) => ({ n: arr.length, p50: pct(arr, 50), p95: pct(arr, 95), max: arr.length ? Math.max(...arr) : null });

// ── metrics ────────────────────────────────────────────────────────────
const M = { upload: [], token: [], health: [], lag: [], errors: [], reconnects: 0, writes: 0, delivered: 0, undelivered: 0, perMinute: {} };
const pending = new Map(); // record id → { at, seenBy: Set<device index>, expect }
const bump = (k) => { M.perMinute[k] = (M.perMinute[k] ?? 0) + 1; };
const err = (where, detail) => { M.errors.push({ at: new Date().toISOString(), where, detail: String(detail).slice(0, 200) }); };

async function api(path, { method = 'GET', body, token, timeoutMs = 20000 } = {}) {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const ms = performance.now() - t0;
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json, ms };
  } finally {
    clearTimeout(timer);
  }
}

async function login(email, password) {
  const r = await api('/auth/login', { method: 'POST', body: { email, password } });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

// ── one virtual device ──────────────────────────────────────────────────
class Device {
  constructor(i, creds) {
    this.i = i;
    this.creds = creds;
    this.token = null;
    this.cid = null;
    this.stop = false;
    this.after = '0';
    this.bucket = null;
    this.jobId = null;
  }
  async signIn() {
    const s = await login(this.creds.email, this.creds.password);
    this.token = s.accessToken;
    this.cid = s.user.companyId;
    this.userName = s.user.name;
  }
  async syncToken() {
    const r = await api('/powersync/token', { token: this.token });
    if (r.status !== 200) throw new Error(`sync token ${r.status}`);
    M.token.push(r.ms);
    return r.body;
  }
  /** Hold the sync stream open; note every op the moment it arrives */
  async stream() {
    while (!this.stop) {
      try {
        const { token, endpoint } = await this.syncToken();
        const body = { buckets: this.bucket ? [{ name: this.bucket, after: this.after }] : [], include_checksum: true, raw_data: true, client_id: `load-${this.i}` };
        const res = await fetch(`${endpoint}/sync/stream`, { method: 'POST', headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (!this.stop) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!line.trim()) continue;
            let o;
            try { o = JSON.parse(line); } catch { continue; }
            if (o.checkpoint?.buckets?.[0]) this.bucket = o.checkpoint.buckets[0].bucket;
            if (o.data) {
              for (const op of o.data.data) {
                this.after = op.op_id;
                const p = pending.get(op.object_id);
                if (p && !p.seenBy.has(this.i) && p.from !== this.i) {
                  p.seenBy.add(this.i);
                  M.lag.push(Date.now() - p.at);
                  if (p.seenBy.size >= p.expect) { M.delivered++; pending.delete(op.object_id); }
                }
              }
            }
          }
        }
        if (!this.stop) { M.reconnects++; err(`device ${this.i} stream`, 'stream ended'); }
      } catch (e) {
        if (this.stop) return;
        M.reconnects++;
        err(`device ${this.i} stream`, e.message);
        await sleep(2000);
      }
    }
  }
  async upload(ops) {
    const r = await api('/powersync/upload', { method: 'POST', token: this.token, body: { ops } });
    M.upload.push(r.ms);
    if (r.status !== 200) { err(`device ${this.i} upload`, `${r.status} ${JSON.stringify(r.body)}`); return false; }
    return true;
  }
  /** A field day's worth of writes, spread out: a job once, then days + patches */
  async work(untilMs, expect) {
    const now = () => new Date().toISOString();
    this.jobId = uuid();
    const job = { id: this.jobId, name: `Load job ${this.i}`, customer: 'Load Test Co', address: '1 Load Rd', city: 'Lee', state: 'MA', kFactor: 160, kFactorHistory: [], operation: 'construction', typeOfRock: 'granite', typeOfTerrain: 'bench', defaultHazards: '', defaultPrecautions: '', isActive: true, createdAt: now(), updatedAt: now(), syncStatus: 'synced' };
    pending.set(job.id, { at: Date.now(), seenBy: new Set(), expect, from: this.i });
    M.writes++; bump(new Date().toISOString().slice(0, 16));
    await this.upload([{ op: 'PUT', id: job.id, data: { table_name: 'jobs', payload: JSON.stringify(job), updated_at: now() } }]);
    const interval = 60000 / WRITES_PER_MIN;
    // stagger devices so writes do not land in lockstep
    await sleep(Math.random() * interval);
    let k = 0;
    while (Date.now() < untilMs && !this.stop) {
      const t0 = Date.now();
      const id = uuid();
      const day = { id, jobId: this.jobId, date: new Date().toISOString().slice(0, 10), name: `Load day ${this.i}-${k}`, status: 'draft', typeOfWork: 'drill_to_blast', createdAt: now(), updatedAt: now(), syncStatus: 'synced', createdBy: this.userName };
      pending.set(id, { at: Date.now(), seenBy: new Set(), expect, from: this.i });
      M.writes++; bump(new Date().toISOString().slice(0, 16));
      const ok = await this.upload([{ op: 'PUT', id, data: { table_name: 'blastDays', payload: JSON.stringify(day), updated_at: now() } }]);
      if (ok && k % 3 === 2) {
        // a PATCH on a record that exists — the other write shape the field produces
        const pid = uuid();
        await this.upload([{ op: 'PATCH', id, data: { payload: JSON.stringify({ notes: `patched ${pid}`, updatedAt: now() }), updated_at: now() } }]);
      }
      k++;
      const spent = Date.now() - t0;
      await sleep(Math.max(0, interval - spent));
    }
  }
}

// ── the run ─────────────────────────────────────────────────────────────
async function main() {
  log(`load test → ${API} · ${DEVICES} devices · ${MINUTES} min · ${WRITES_PER_MIN} writes/min/device`);
  const admin = await login(ADMIN.email, ADMIN.password);
  if (!admin.user.platformAdmin) throw new Error(`${ADMIN.email} is not a platform admin`);
  const rootToken = admin.accessToken;

  // 1. a throwaway company, then become its admin twin
  const created = await api('/platform/companies', { method: 'POST', token: rootToken, body: { name: `Load test ${stamp}`, environment: 'beta' } });
  if (created.status !== 201) throw new Error(`create company: ${created.status} ${JSON.stringify(created.body)}`);
  const company = created.body.company;
  log(`company "${company.name}" (${company.id})`);
  const sw = await api(`/platform/companies/${company.id}/switch`, { method: 'POST', token: rootToken });
  if (sw.status !== 200) throw new Error(`switch: ${sw.status}`);
  const twinToken = sw.accessToken ?? sw.body.accessToken;

  // 2. N device logins (office-created users; the probe never touches the UI)
  const devices = [];
  for (let i = 0; i < DEVICES; i++) {
    const creds = { email: `load-${stamp}-${i}@load.shotlog`, password: `load-pass-${stamp}-${i}` };
    const u = await api('/users', { method: 'POST', token: twinToken, body: { email: creds.email, name: `Load Device ${i}`, role: 'blaster', tempPassword: creds.password } });
    if (u.status !== 201 && u.status !== 200) throw new Error(`create user ${i}: ${u.status} ${JSON.stringify(u.body)}`);
    devices.push(new Device(i, creds));
  }
  for (const d of devices) await d.signIn();
  log(`${devices.length} devices signed in`);

  // 3. streams open, first checkpoint settles, then the soak
  const streams = devices.map((d) => d.stream());
  await sleep(3000);
  const until = Date.now() + MINUTES * 60000;
  const sampler = (async () => {
    while (Date.now() < until) {
      const h = await api('/health').catch((e) => ({ status: 0, ms: 0, body: null, error: e }));
      if (h.status === 200) M.health.push(h.ms); else err('health', h.status || h.error?.message);
      await sleep(15000);
    }
  })();
  const expect = Math.max(0, devices.length - 1);
  await Promise.all([...devices.map((d) => d.work(until, expect)), sampler]);
  log('writes done — waiting up to 30 s for the last deliveries');
  const settle = Date.now() + 30000;
  while (pending.size > 0 && Date.now() < settle) await sleep(500);
  M.undelivered = pending.size;
  for (const d of devices) d.stop = true;
  await Promise.race([Promise.allSettled(streams), sleep(5000)]);

  // 4. cleanup
  if (!KEEP) {
    const del = await api(`/platform/companies/${company.id}`, { method: 'DELETE', token: rootToken });
    log(`company deleted: ${del.status}`);
    if (del.status !== 200) err('cleanup', `delete ${del.status} ${JSON.stringify(del.body)}`);
  } else log('company KEPT (KEEP_COMPANY=1)');

  // 5. report
  const totalReq = M.upload.length + M.token.length + M.health.length;
  const report = {
    at: new Date().toISOString(), api: API, devices: DEVICES, minutes: MINUTES, writesPerMinPerDevice: WRITES_PER_MIN,
    writes: M.writes, delivered: M.delivered, undelivered: M.undelivered,
    upload_ms: stats(M.upload), token_ms: stats(M.token), health_ms: stats(M.health), delivery_lag_ms: stats(M.lag),
    errors: M.errors.length, errorRate: totalReq ? +(M.errors.length / totalReq).toFixed(4) : 0, streamReconnects: M.reconnects,
    perMinute: M.perMinute, errorSamples: M.errors.slice(0, 20),
  };
  const fmt = (s) => (s.n ? `p50 ${Math.round(s.p50)} ms · p95 ${Math.round(s.p95)} ms · max ${Math.round(s.max)} ms (n=${s.n})` : 'no samples');
  const md = `# ShotLog load test — ${report.at}

| | |
|---|---|
| Target | ${API} |
| Devices × minutes × writes/min | ${DEVICES} × ${MINUTES} × ${WRITES_PER_MIN} |
| Writes | ${M.writes} (delivered to every other device: ${M.delivered}; still pending at the end: ${M.undelivered}) |
| Upload | ${fmt(report.upload_ms)} |
| Delivery lag (write → seen on another device) | ${fmt(report.delivery_lag_ms)} |
| Sync token | ${fmt(report.token_ms)} |
| Health | ${fmt(report.health_ms)} |
| Errors | ${M.errors.length} of ${totalReq} requests (${(report.errorRate * 100).toFixed(2)} %) · stream reconnects ${M.reconnects} |

${M.errors.length ? '## First errors\n' + M.errors.slice(0, 20).map((e) => `- ${e.at} ${e.where}: ${e.detail}`).join('\n') : 'No errors.'}
`;
  const fs = await import('node:fs');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  fs.writeFileSync(`${OUT}/report.md`, md);
  console.log('\n' + md);
  // a red run for the workflow when the numbers are bad
  const bad = report.errorRate > 0.02 || (report.delivery_lag_ms.p95 ?? 0) > 30000 || M.undelivered > 0;
  process.exit(bad ? 2 : 0);
}

main().catch((e) => {
  console.error('load test failed:', e);
  process.exit(1);
});

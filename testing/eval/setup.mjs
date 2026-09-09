// Persona evaluation — setup (2026-09-08).
//
// Two Beta companies made from Baystate's reference data (equipment, roster,
// catalog, settings), Granite Ridge / Ledgeville Pit / Phase 1 seeded into
// each, one invitation per cast member per arm, and the media files the
// briefs hand to the field roles. Writes testing/eval/out/setup.json.
//
//   node testing/eval/setup.mjs            (local stack must be up)
//   node testing/eval/setup.mjs --clean    delete the eval companies and stop
//   node testing/eval/setup.mjs --force --lean   rebuild, and prune the dev roster's harness names
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { mkCtx, signIn, skipTours, apiLogin } from '../two-device/lib.mjs';

const OUT = path.resolve('testing/eval/out');
const ASSETS = path.resolve('testing/eval/assets');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ASSETS, { recursive: true });

const ARMS = { A: 'Eval A (Beta)', B: 'Eval B (Beta)' };
const CAST = [
  { key: 'barry', name: 'Barry Lopes', role: 'blaster' },
  { key: 'dinis', name: 'Dinis Costa', role: 'driller' },
  { key: 'sam', name: 'Sam Rivera', role: 'mechanic' },
  { key: 'evette', name: 'Evette Marsh', role: 'office' },
  { key: 'tony', name: 'Tony Baptista', role: 'supervisor' },
];
const clean = process.argv.includes('--clean');
// A run in progress must never be wiped by accident (an agent re-ran this once and erased a morning's work)
if (!clean && !process.argv.includes('--force') && fs.existsSync(path.join(OUT, 'setup.json'))) {
  console.error('setup.json exists — an evaluation is set up or running. Use --force to wipe and rebuild, or --clean to delete the eval companies.');
  process.exit(3);
}

const browser = await chromium.launch();
console.log('browser up; signing in as Mark…');
const ctx = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
const P = await ctx.newPage();
await signIn(P, 'mark');
await skipTours(P);
const mark = await apiLogin(P, 'mark');
const api = (p, init = {}, token = mark.token) => mark.api(p, init, token);

const list = await api('/platform/companies');
if (list.status !== 200) throw new Error(`cannot list companies: ${list.status}`);
const home = list.body.companies.find((c) => c.current);
console.log(`home company: ${home.name} (${home.id})`);

// Remove leftovers from an earlier run (their users, records and invites go with them)
for (const name of Object.values(ARMS)) {
  const old = list.body.companies.find((c) => c.name === name);
  if (old) {
    const d = await api(`/platform/companies/${old.id}`, { method: 'DELETE' });
    console.log(`deleted old ${name}: ${d.status}`);
  }
}
if (clean) { await browser.close(); process.exit(0); }

const setup = { at: new Date().toISOString(), home: home.id, arms: {}, assets: {} };
for (const [arm, name] of Object.entries(ARMS)) {
  const c = await api('/platform/companies', { method: 'POST', body: JSON.stringify({ name, environment: 'beta', fromCompanyId: home.id }) });
  if (c.status !== 201) throw new Error(`create ${name}: ${c.status} ${JSON.stringify(c.body)}`);
  const cid = c.body.company.id;
  console.log(`${arm}: ${name} ${cid} (${c.body.copied} reference records)`);

  // Granite Ridge / Ledgeville Pit / Phase 1 — written server-side like the rehearsal fixture
  const seeded = execFileSync('npx', ['tsx', path.resolve('testing/eval/seed-hierarchy.mts'), cid, ...(process.argv.includes('--lean') ? ['--lean'] : [])], {
    cwd: path.resolve('apps/server'),
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:spikepass@localhost:5434/shotlog' },
    encoding: 'utf8',
  });
  console.log(`  seeded: ${seeded.trim()}`);

  // A platform-admin twin in the company issues the invitations
  const sw = await api(`/platform/companies/${cid}/switch`, { method: 'POST' });
  if (sw.status !== 200) throw new Error(`switch ${name}: ${sw.status}`);
  const twin = sw.body.accessToken;
  const invites = {};
  for (const m of CAST) {
    const email = `${m.key}.${arm.toLowerCase()}@eval.shotlog.test`;
    const inv = await api('/admin/invites', { method: 'POST', body: JSON.stringify({ name: m.name, email, role: m.role }) }, twin);
    if (inv.status !== 201) throw new Error(`invite ${m.name} in ${name}: ${inv.status} ${JSON.stringify(inv.body)}`);
    // the local API stamps the production web address on the link; the token is what matters
    const link = inv.body.link.replace(/^https?:\/\/[^/]+/, 'http://localhost:5199');
    invites[m.key] = { name: m.name, role: m.role, email, link };
    console.log(`  invited ${m.name} (${m.role}) → ${link}`);
  }
  setup.arms[arm] = { name, companyId: cid, invites };
}

fs.writeFileSync(path.join(OUT, 'setup.json'), JSON.stringify(setup, null, 2));
console.log('companies + invitations written; making media…');

// ── Media the briefs hand over: a face photo, a seismograph printout, a short clip ──
const M = await ctx.newPage();
await M.goto('about:blank');
const media = await Promise.race([M.evaluate(async () => {
  const jpeg = (draw, w, h) => new Promise((res) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
    c.toBlob(async (b) => res(Buffer_from(await b.arrayBuffer())), 'image/jpeg', 0.9);
  });
  const Buffer_from = (ab) => { const u = new Uint8Array(ab); let out = ''; for (let i = 0; i < u.length; i += 8192) out += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(out); };
  const face = await jpeg((g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.4); sky.addColorStop(0, '#6fa2d8'); sky.addColorStop(1, '#cfe0f2'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6b6257'; g.fillRect(0, h * 0.35, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${40 + (i * 37) % 60},${35 + (i * 53) % 50},${30 + (i * 29) % 40},0.6)`; g.fillRect((i * 173) % w, h * 0.35 + ((i * 311) % (h * 0.65)), 8 + (i % 14), 4 + (i % 9)); }
    g.strokeStyle = '#2b2622'; g.lineWidth = 4; for (let x = 60; x < w; x += 140) { g.beginPath(); g.moveTo(x, h * 0.36); g.lineTo(x + 30, h); g.stroke(); }
    g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.fillText('Ledgeville Pit — east face, before the shot', 40, 70);
  }, 1600, 1200);
  const printout = await jpeg((g, w, h) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1c3859'; g.lineWidth = 3; for (let x = 0; x < w; x += 7) { g.beginPath(); g.moveTo(x, h / 2 + Math.sin(x / 40) * (200 + (x % 97))); g.lineTo(x + 7, h / 2 + Math.cos(x / 31) * (150 + (x % 53))); g.stroke(); }
    g.fillStyle = '#111'; g.font = '44px monospace'; g.fillText('Instantel Micromate  SN 22841', 80, 100); g.fillText('PPV T 0.42  V 0.31  L 0.28 in/s   f 27 Hz   118 dB', 80, 160);
  }, 2000, 1500);
  // a 3-second clip: the canvas "shot" recorded through MediaRecorder
  const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d');
  const stream = c.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise((res) => { rec.onstop = res; });
  rec.start(200);
  const t0 = performance.now();
  await new Promise((res) => { const tick = () => { const t = (performance.now() - t0) / 1000; if (t >= 3) { clearInterval(iv); res(); return; } g.fillStyle = '#8fb3d9'; g.fillRect(0, 0, 640, 360); g.fillStyle = '#6b6257'; g.fillRect(0, 200, 640, 160); if (t > 1 && t < 2.2) { g.fillStyle = `rgba(120,100,80,${Math.min(1, (t - 1) * 3)})`; g.beginPath(); g.arc(320, 230, 40 + (t - 1) * 220, 0, Math.PI * 2); g.fill(); } g.fillStyle = '#fff'; g.font = '20px sans-serif'; g.fillText(`shot ${t.toFixed(1)} s`, 20, 30); }; const iv = setInterval(tick, 33); });
  rec.stop(); await done;
  const blob = new Blob(chunks, { type: 'video/webm' });
  const video = Buffer_from(await blob.arrayBuffer());
  return { face, printout, video };
}), new Promise((_, rej) => setTimeout(() => rej(new Error('media generation timed out')), 60000))]);
for (const [k, file] of [['face', 'face.jpg'], ['printout', 'printout.jpg'], ['video', 'shot.webm']]) {
  const p = path.join(ASSETS, file);
  fs.writeFileSync(p, Buffer.from(media[k], 'base64'));
  setup.assets[k] = p;
  console.log(`asset ${file}: ${(fs.statSync(p).size / 1024).toFixed(0)} KB`);
}

fs.writeFileSync(path.join(OUT, 'setup.json'), JSON.stringify(setup, null, 2));
console.log(`wrote ${path.join(OUT, 'setup.json')}`);
await browser.close();

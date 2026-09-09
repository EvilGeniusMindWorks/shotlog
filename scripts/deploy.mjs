#!/usr/bin/env node
// /deploy — commit, push, and wait until the change is actually live (S10 skills, 2026-09-09).
//
//   node scripts/deploy.mjs --message-file <path> [--markers "a,b"] [--paths "p1 p2 …"]
//                           [--skip-typecheck] [--no-push] [--api-timeout 600] [--web-timeout 600]
//
// What it does, in order:
//   1. refuses unless on main with something to commit
//   2. stages --paths (default: everything except testing/eval/out and testing/eval/assets)
//   3. typechecks web + server (skip with --skip-typecheck when you just ran it)
//   4. commits the message file's text, adding the Co-Authored-By trailer if missing
//   5. pushes (SKIP_HOOK=1 so the pre-push hook does not repeat the typecheck)
//   6. waits for Railway ONLY if server files changed (/health.commit == HEAD), else says so
//   7. waits for Vercel: a new entry bundle AND every --marker string present in some chunk
//      (scans every chunk the entry references — lazy pages included)
//   8. checks the live API: production=true, powersyncSecret=set, nosniff, no CORS for a foreign origin
// Exit 0 on LIVE, 1 otherwise. Never uses Date.now() for anything but elapsed time.
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://shotlogserver-production.up.railway.app';
const WEB = 'https://shotlog-app.vercel.app';
const TRAILER = 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>';
const root = path.resolve(new URL('..', import.meta.url).pathname);

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const flag = (name) => args.includes(name);
const messageFile = opt('--message-file');
const markers = (opt('--markers', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const paths = (opt('--paths', '') || '').split(/\s+/).filter(Boolean);
const apiTimeout = Number(opt('--api-timeout', '600')) * 1000;
const webTimeout = Number(opt('--web-timeout', '600')) * 1000;
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
const say = (s) => console.log(s);
const fail = (s) => { console.error(`✗ ${s}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!messageFile || !fs.existsSync(messageFile)) fail('--message-file <path> is required (the commit message, written first)');
if (sh('git rev-parse --abbrev-ref HEAD') !== 'main') fail('not on main');
if (!sh('git status --porcelain')) fail('nothing to commit');

// 2. stage
if (paths.length) sh(`git add -- ${paths.map((p) => JSON.stringify(p)).join(' ')}`);
else sh("git add -A -- . ':!testing/eval/out' ':!testing/eval/assets'");
const staged = sh('git diff --cached --name-only').split('\n').filter(Boolean);
if (!staged.length) fail('nothing staged');
say(`staged ${staged.length} file(s)`);

// 3. typecheck
if (!flag('--skip-typecheck')) {
  say('typecheck…');
  const r = spawnSync('npm', ['run', 'typecheck'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) fail('typecheck failed — nothing committed');
}

// 4. commit
let message = fs.readFileSync(messageFile, 'utf8').trim();
if (!message.includes('Co-Authored-By:')) message += `\n\n${TRAILER}`;
const tmp = path.join(root, '.git', 'DEPLOY_MSG');
fs.writeFileSync(tmp, message + '\n');
sh(`git commit -q -F ${JSON.stringify(tmp)}`);
fs.unlinkSync(tmp);
const head = sh('git rev-parse --short HEAD');
say(`committed ${head}: ${message.split('\n')[0].slice(0, 90)}`);
if (flag('--no-push')) { say('--no-push: stopping here'); process.exit(0); }

// what changed decides what we wait for
const changed = sh('git diff --name-only HEAD~1..HEAD').split('\n').filter(Boolean);
const serverChanged = changed.some((f) => /^(apps\/server\/|packages\/shared\/|railway\.json|package-lock\.json)/.test(f));
const webChanged = changed.some((f) => /^(apps\/web\/|packages\/shared\/|package-lock\.json)/.test(f));

// remember the entry bundle BEFORE pushing so a new one is unmistakable
async function entryBundle() {
  const html = await fetch(`${WEB}/`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
  return html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? null;
}
const entryBefore = webChanged ? await entryBundle() : null;

// 5. push
sh('git push -q origin main', { env: { ...process.env, SKIP_HOOK: '1' } });
say(`pushed ${head}`);

const t0 = Date.now();
// 6. Railway
if (serverChanged) {
  say('waiting for Railway (server files changed)…');
  let ok = false;
  while (Date.now() - t0 < apiTimeout) {
    const h = await fetch(`${API}/health`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
    if (h?.commit === head) { ok = true; break; }
    await sleep(15000);
  }
  if (!ok) fail(`Railway did not reach ${head} in ${apiTimeout / 1000}s — check the Railway deploy log`);
  say(`  API live on ${head}`);
} else say('API: no server files changed — Railway does not rebuild');

// 7. Vercel
if (webChanged) {
  say(`waiting for Vercel (new bundle${markers.length ? ` + markers: ${markers.join(', ')}` : ''})…`);
  let ok = false;
  const t1 = Date.now();
  while (Date.now() - t1 < webTimeout) {
    const entry = await entryBundle();
    if (entry && entry !== entryBefore) {
      if (!markers.length) { ok = true; break; }
      const src = await fetch(`${WEB}/${entry}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
      const chunks = [...new Set([entry, ...[...src.matchAll(/["'`]\.?\/?(assets\/[A-Za-z0-9_.-]+\.js)["'`]/g)].map((m) => m[1])])];
      const found = new Set();
      for (const c of chunks) {
        const t = await fetch(`${WEB}/${c}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
        for (const m of markers) if (t.includes(m)) found.add(m);
      }
      if (found.size === markers.length) { ok = true; break; }
      say(`  new bundle ${entry}, markers ${found.size}/${markers.length}`);
    }
    await sleep(20000);
  }
  if (!ok) fail(`Vercel did not serve a bundle with the markers in ${webTimeout / 1000}s`);
  say('  web live');
} else say('web: no web files changed');

// 8. live checks
const h = await fetch(`${API}/health`, { headers: { origin: 'https://evil.example' }, cache: 'no-store' }).catch(() => null);
const body = h ? await h.json().catch(() => ({})) : {};
const checks = [
  ['production mode', body.production === true],
  ['sync secret set', body.powersyncSecret === 'set'],
  ['nosniff header', h?.headers.get('x-content-type-options') === 'nosniff'],
  ['foreign origin refused by CORS', !h?.headers.get('access-control-allow-origin')],
];
for (const [name, ok] of checks) say(`  ${ok ? '✓' : '✗'} ${name}`);
const allOk = checks.every(([, ok]) => ok);
say(`${allOk ? 'LIVE' : 'LIVE WITH WARNINGS'} ${head} · ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(allOk ? 0 : 1);

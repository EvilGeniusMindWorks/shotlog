#!/usr/bin/env node
// pre-push hook body (S10 skills): typecheck the web app, then run the harnesses that cover the
// files changed since the upstream branch (testing/harness-map.json). Skips the harnesses, with a
// note, when the local stack is not running. SKIP_HOOK=1 bypasses everything (deploy.mjs sets it
// after its own typecheck). Enable once per clone: git config core.hooksPath .githooks
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

if (process.env.SKIP_HOOK === '1') process.exit(0);
const root = path.resolve(new URL('..', import.meta.url).pathname);
const sh = (cmd) => { try { return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

console.log('pre-push: typecheck:web');
if (spawnSync('npm', ['run', 'typecheck:web'], { cwd: root, stdio: 'inherit' }).status !== 0) {
  console.error('pre-push: typecheck failed (SKIP_HOOK=1 git push to bypass)');
  process.exit(1);
}

const changed = (sh('git diff --name-only @{u}..HEAD') || sh('git diff --name-only origin/main..HEAD')).split('\n').filter(Boolean);
const mapFile = path.join(root, 'testing', 'harness-map.json');
const map = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : {};
const nums = new Set();
for (const f of changed) for (const [prefix, list] of Object.entries(map)) if (f === prefix || f.startsWith(prefix.endsWith('/') ? prefix : prefix + '/')) list.forEach((n) => nums.add(n));
if (!nums.size) { console.log(`pre-push: no mapped harness for ${changed.length} changed file(s)`); process.exit(0); }

const up = await fetch('http://localhost:4000/health').then((r) => r.ok).catch(() => false);
if (!up) { console.log(`pre-push: local API not running — skipping harnesses ${[...nums].join(' ')}`); process.exit(0); }

const list = [...nums].sort((a, b) => a - b);
const run = list.slice(0, 6);
if (list.length > 6) console.log(`pre-push: ${list.length} harnesses mapped, running the first six (${run.join(' ')}); run the rest by hand: ${list.slice(6).join(' ')}`);
console.log(`pre-push: harnesses ${run.join(' ')} (serial)`);
const r = spawnSync('node', ['testing/run.mjs', ...run.map(String)], { cwd: root, stdio: 'inherit' });
if (r.status !== 0) { console.error('pre-push: a harness is red (SKIP_HOOK=1 git push to bypass)'); process.exit(1); }

#!/usr/bin/env node
// /release-notes — what changed for the crew since the last release tag (S10 skills, 2026-09-09).
//
//   node scripts/release-notes.mjs [--since <ref>] [--tag] [--push]
//
// Prints the commits since the last `release/*` tag (or --since) that touched the web app or the
// server, grouped by day, as a Markdown draft. The skill turns that into plain English for Mark in
// apps/web/help/start-here/whats-new.md. --tag stamps HEAD as release/YYYY-MM-DD; --push pushes tags.
import { execSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const sh = (cmd) => { try { return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };

const lastTag = sh("git tag --list 'release/*' --sort=-creatordate").split('\n').filter(Boolean)[0];
const since = opt('--since', lastTag || '');
const range = since ? `${since}..HEAD` : '--since=14.days';
const raw = sh(`git log ${range} --date=short --format='%h%x09%ad%x09%s' -- apps/web apps/server packages/shared`);
const rows = raw.split('\n').filter(Boolean).map((l) => { const [h, d, s] = l.split('\t'); return { h, d, s }; })
  .filter((r) => !/^(Docs|docs|Memory|CI|Testing|Harness)\b/.test(r.s));
console.log(`# Changes since ${since || 'two weeks ago'} (${rows.length} commits touching the app)\n`);
let day = '';
for (const r of rows) {
  if (r.d !== day) { day = r.d; console.log(`\n## ${day}`); }
  console.log(`- ${r.s.replace(/\s*\([^)]*harness[^)]*\)\s*$/i, '').slice(0, 160)}  \`${r.h}\``);
}
if (args.includes('--tag')) {
  const tag = `release/${opt('--date', new Date().toISOString().slice(0, 10))}`;
  sh(`git tag -f ${tag}`);
  console.log(`\ntagged ${tag}`);
  if (args.includes('--push')) { sh(`git push -q origin ${tag} --force`); console.log('pushed the tag'); }
}

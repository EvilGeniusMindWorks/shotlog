#!/usr/bin/env node
// Third-party licence inventory for the three shipped packages (S10, 2026-09-09).
//   node scripts/licenses.mjs            → prints the tally
//   node scripts/licenses.mjs --notice   → rewrites NOTICE.txt from the tree
//   node scripts/licenses.mjs --check    → exit 1 on any copyleft / unknown licence
// Walks production dependencies of apps/web, apps/server and packages/shared
// from the hoisted node_modules; devDependencies are not shipped and not listed.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const seen = new Map();

function pkgDir(name, from) {
  let d = from;
  for (;;) {
    const c = path.join(d, 'node_modules', name);
    if (fs.existsSync(path.join(c, 'package.json'))) return c;
    const p = path.dirname(d);
    if (p === d) return null;
    d = p;
  }
}
function licenseOf(pj, dir) {
  if (typeof pj.license === 'string') return pj.license;
  if (pj.license?.type) return pj.license.type;
  if (Array.isArray(pj.licenses)) return pj.licenses.map((l) => l.type).join(' OR ');
  // No field: read the LICENSE file's first line (wa-sqlite ships one)
  for (const n of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE']) {
    const f = path.join(dir, n);
    if (fs.existsSync(f)) {
      const first = fs.readFileSync(f, 'utf8').split('\n')[0].trim();
      if (/MIT/i.test(first)) return 'MIT (LICENSE file)';
      if (/Apache/i.test(first)) return 'Apache-2.0 (LICENSE file)';
      if (/BSD/i.test(first)) return 'BSD (LICENSE file)';
      return `see LICENSE file: ${first.slice(0, 40)}`;
    }
  }
  return 'UNKNOWN';
}
function walk(name, from) {
  const dir = pkgDir(name, from);
  if (!dir || seen.has(dir)) return;
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  seen.set(dir, { name: pj.name, version: pj.version, lic: licenseOf(pj, dir), repo: typeof pj.repository === 'string' ? pj.repository : pj.repository?.url ?? '' });
  for (const d of Object.keys(pj.dependencies ?? {})) walk(d, dir);
  for (const d of Object.keys(pj.optionalDependencies ?? {})) walk(d, dir);
}
for (const app of ['apps/web', 'apps/server', 'packages/shared']) {
  const pj = JSON.parse(fs.readFileSync(path.join(root, app, 'package.json'), 'utf8'));
  for (const d of Object.keys(pj.dependencies ?? {})) if (!d.startsWith('@shotlog/')) walk(d, path.join(root, app));
}
const rows = [...seen.values()].filter((v) => !v.name.startsWith('@shotlog/')).sort((a, b) => a.name.localeCompare(b.name));

// Copyleft and source-available licences that would bind our own code
const COPYLEFT = /\b(AGPL|LGPL|GPL|SSPL|BUSL|EUPL|OSL|CDDL|EPL|MPL-1|CPAL)\b/i;
// Dual-licensed packages we take under the permissive option
const DUAL_OK = { jszip: '(MIT OR GPL-3.0-or-later) — used under MIT', dompurify: '(MPL-2.0 OR Apache-2.0) — used under Apache-2.0' };
const problems = rows.filter((v) => {
  if (DUAL_OK[v.name]) return false;
  if (v.lic === 'UNKNOWN') return true;
  return COPYLEFT.test(v.lic) && !/ OR /.test(v.lic);
});

const tally = {};
for (const v of rows) tally[v.lic] = (tally[v.lic] ?? 0) + 1;
console.log(`${rows.length} shipped packages`);
for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(4)}  ${k}`);

if (args.has('--notice')) {
  const out = [
    'ShotLog — third-party notices',
    '',
    'ShotLog is proprietary software. It ships with the open-source packages below,',
    'each under its own licence; the copyright notices travel with them in',
    'node_modules and are reproduced here as required. Regenerate with',
    '  node scripts/licenses.mjs --notice',
    '',
    'Dual-licensed packages and the option taken:',
    ...Object.entries(DUAL_OK).map(([k, v]) => `  ${k}: ${v}`),
    '',
    'Map data and services:',
    '  Street map tiles © OpenStreetMap contributors (ODbL), tile.openstreetmap.org',
    '  Aerial imagery: USDA, USGS The National Map orthoimagery (US government work, public domain)',
    '  Address search: Nominatim (OpenStreetMap), used under its usage policy',
    '',
    'Packages:',
    ...rows.map((v) => `  ${v.name}@${v.version}  ${v.lic}`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(root, 'NOTICE.txt'), out);
  console.log('wrote NOTICE.txt');
}
if (problems.length) {
  console.log('\nNeeds a decision (copyleft or unknown):');
  for (const v of problems) console.log(`  ${v.name}@${v.version}  ${v.lic}`);
  if (args.has('--check')) process.exit(1);
} else if (args.has('--check')) console.log('licence check: clean');

#!/usr/bin/env node
// `npm audit` for what we ship, with a written allowlist (S10, 2026-09-09).
// Fails on any high/critical advisory in production dependencies that is not
// listed below with a reason. Dev-only tooling (vite, vitest, playwright) is
// not shipped and is not audited here.
import { execSync } from 'node:child_process';

// advisory id → why it does not reach us. Review each entry when its package updates.
const ACCEPTED = {
  // deepmerge-ts stack exhaustion on recursive object graphs, reached only through
  // @prisma/config when the Prisma CLI merges ITS OWN config file at `prisma migrate
  // deploy` on boot. No user input reaches it; prisma 6.19 pins deepmerge-ts 7.1.5
  // and an override to 8.x is refused by the pin. Re-check when Prisma moves.
  'deepmerge-ts': 'Prisma CLI config merge at boot; no request path reaches it',
};

let json;
try {
  json = execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) {
  json = e.stdout; // npm audit exits 1 when it finds anything
}
const report = JSON.parse(json);
const vulns = Object.values(report.vulnerabilities ?? {});
// Acceptance follows the chain: a package flagged only because it depends on an
// accepted package is accepted too (prisma → @prisma/config → deepmerge-ts)
const accepted = new Set(Object.keys(ACCEPTED));
for (let changed = true; changed; ) {
  changed = false;
  for (const v of vulns) {
    if (accepted.has(v.name)) continue;
    const vias = v.via.filter((x) => typeof x === 'string');
    if (vias.length && vias.every((x) => accepted.has(x)) && v.via.length === vias.length) { accepted.add(v.name); changed = true; }
  }
}
let failed = 0;
for (const v of vulns) {
  const serious = v.severity === 'high' || v.severity === 'critical';
  const ok = accepted.has(v.name);
  console.log(`${v.severity.padEnd(9)} ${v.name} ${v.range}${ok ? '  (accepted: ' + (ACCEPTED[v.name] ?? 'depends only on an accepted package') + ')' : ''}`);
  if (serious && !ok) failed++;
}
if (!vulns.length) console.log('npm audit: nothing reported for shipped packages');
if (failed) {
  console.log(`\n${failed} unaccepted high/critical advisor${failed === 1 ? 'y' : 'ies'} — fix or add to ACCEPTED with a reason`);
  process.exit(1);
}

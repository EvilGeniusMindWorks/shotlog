#!/usr/bin/env node
// /harness-new — scaffold the next harness, its README line, and its file map (S10 skills).
//
//   node scripts/harness-new.mjs "<title>" --sections "first|second|third" \
//        [--files "apps/web/src/pages/X.tsx,apps/server/src/y.ts"] [--role blaster] [--dry-run]
//
// Creates testing/two-device/harnessNN.mjs (next free number) from the lib-era template with one
// R.section per bullet, appends a line to testing/README.md, and records which source files the
// harness covers in testing/harness-map.json (the pre-push hook runs harnesses for changed files).
import fs from 'node:fs';
import path from 'node:path';

export const root = path.resolve(new URL('..', import.meta.url).pathname);
const dir = path.join(root, 'testing', 'two-device');

export function nextHarnessNumber() {
  const nums = fs.readdirSync(dir).map((f) => f.match(/^harness(\d+)\.mjs$/)?.[1]).filter(Boolean).map(Number);
  return Math.max(0, ...nums) + 1;
}

export function harnessSource({ n, title, sections, role = 'blaster', date }) {
  const secs = sections.map((s) => `  await R.section(${JSON.stringify(s)}, async () => {
    // TODO: drive the screen, then R.ok('what a person would notice', cond)
    R.ok('TODO', false);
  });\n`).join('\n');
  return `async (page, lib) => {
  // ${title} (${date})
  const { mkCtx, signIn, skipTours, sleep, WEB, API, browserErrors } = lib;
  const browser = page.context().browser();
  const R = lib.report();
  const stamp = lib.stamp();
  browserErrors({ clear: true });
  let dayId;

  const cB = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PB = await cB.newPage();
  await signIn(PB, ${JSON.stringify(role)});
  await skipTours(PB);

${secs}
  await R.section('the error spy saw nothing during this run', async () => {
    const errs = browserErrors();
    R.ok(\`no browser errors (\${errs.length})\${errs[0] ? \` — first: \${errs[0].text.slice(0, 120)}\` : ''}\`, errs.length === 0);
  });

  await R.section('cleanup', async () => {
    const removed = await lib.cleanupAsAdmin(browser, { days: [dayId].filter(Boolean) }).catch(() => -1);
    R.ok(\`cleanup removed \${removed} day(s)\`, removed >= 0);
  });
  await cB.close();
  return R.summary();
}
`;
}

export function scaffoldHarness({ title, sections, files = [], role = 'blaster', date, dryRun = false }) {
  const n = nextHarnessNumber();
  const file = path.join(dir, `harness${n}.mjs`);
  const readme = path.join(root, 'testing', 'README.md');
  const mapFile = path.join(root, 'testing', 'harness-map.json');
  const line = `- \`${n}\` — ${title}: ${sections.join('; ')}.\n`;
  const map = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : {};
  for (const f of files) { map[f] = [...new Set([...(map[f] ?? []), n])].sort((a, b) => a - b); }
  if (dryRun) {
    console.log(`would create ${path.relative(root, file)}\nREADME line: ${line.trim()}\nmap entries: ${files.join(', ') || '(none)'}`);
    return n;
  }
  fs.writeFileSync(file, harnessSource({ n, title, sections, role, date }));
  let r = fs.readFileSync(readme, 'utf8');
  // the harness list ends at the last "- `NN` —" line; append after it
  const lines = r.split('\n');
  let last = -1;
  lines.forEach((l, i) => { if (/^- `\d+` — /.test(l)) last = i; });
  if (last >= 0) lines.splice(last + 1, 0, line.trimEnd());
  else lines.push(line.trimEnd());
  fs.writeFileSync(readme, lines.join('\n'));
  fs.writeFileSync(mapFile, JSON.stringify(map, null, 2) + '\n');
  console.log(`created ${path.relative(root, file)} (§${sections.length + 2}), README line added, map: ${files.length} file(s)`);
  return n;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
  const title = args[0] && !args[0].startsWith('--') ? args[0] : null;
  if (!title || title.startsWith('--')) { console.error('usage: harness-new.mjs "<title>" --sections "a|b" [--files "x,y"] [--role blaster] [--dry-run]'); process.exit(1); }
  const sections = (opt('--sections', '') || '').split('|').map((s) => s.trim()).filter(Boolean);
  if (!sections.length) { console.error('--sections "a|b|c" is required'); process.exit(1); }
  const files = (opt('--files', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const date = opt('--date', new Date().toISOString().slice(0, 10));
  scaffoldHarness({ title, sections, files, role: opt('--role', 'blaster'), date, dryRun: args.includes('--dry-run') });
}

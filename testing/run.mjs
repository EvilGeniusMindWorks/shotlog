#!/usr/bin/env node
// Harness runner (2026-09-07) — replaces running harnesses one at a time
// through the Playwright MCP (which serialized everything and echoed the
// whole script back). Runs the same files, prints only what matters.
//
//   node testing/run.mjs 49                 one harness, all sections
//   node testing/run.mjs 49 --only 2,5      only §2 and §5 (lib.report sections)
//   node testing/run.mjs 37 45 46           several, in order
//   node testing/run.mjs 37 45 46 -p        …in parallel (own page each; shared browser)
//   node testing/run.mjs 49 -v              print PASS lines too
//   node testing/run.mjs 49 --headed        watch it
//   node testing/run.mjs 51 --webkit        run under WebKit (Safari's engine)
//
// Harness files are `async (page) => {…}` or `async (page, lib) => {…}`
// expressions in testing/two-device/harnessNN.mjs — unchanged for the old
// ones; new ones take `lib` (testing/two-device/lib.mjs) and use sections.
// Exit code 1 when any FAIL or ERROR line is produced.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('-')));
const verbose = flags.has('-v') || flags.has('--verbose');
const parallel = flags.has('-p') || flags.has('--parallel');
const headed = flags.has('--headed');
const useWebkit = flags.has('--webkit'); // Safari's engine (npx playwright install webkit)
const onlyArg = args.find((a) => a.startsWith('--only='))?.slice(7) ?? (args.includes('--only') ? args[args.indexOf('--only') + 1] : null);
const only = onlyArg
  ? new Set(onlyArg.split(',').map((s) => (Number.isFinite(Number(s)) ? Number(s) : s.trim())))
  : null;
const targets = args.filter((a, i) => !a.startsWith('-') && !(args[i - 1] === '--only'));

if (targets.length === 0) {
  console.error('usage: node testing/run.mjs <harness…> [--only n,m] [-p] [-v] [--headed] [--webkit]');
  process.exit(2);
}

const resolveHarness = (t) => {
  const candidates = [
    t,
    path.join(here, 'two-device', t),
    path.join(here, 'two-device', `harness${t}.mjs`),
    path.join(here, 'two-device', `${t}.mjs`),
  ];
  const hit = candidates.find((c) => existsSync(c) && c.endsWith('.mjs'));
  if (!hit) throw new Error(`no harness for "${t}"`);
  return hit;
};

const fmt = (ms) => (ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`);

async function runOne(browser, file, lib) {
  const name = path.basename(file, '.mjs');
  const src = await readFile(file, 'utf8');
  // The file is a bare arrow-function expression (the MCP wrapped it the same way)
  const fn = new Function(`return (${src.trim().replace(/;\s*$/, '')})`)();
  const page = await browser.newPage();
  const t0 = Date.now();
  let out = '';
  try {
    globalThis.__harnessOnly = only;
    out = String((await fn(page, lib)) ?? '');
  } catch (e) {
    out += `\nERROR ${e?.stack ?? e}`;
  } finally {
    await page.close().catch(() => undefined);
  }
  const lines = out.split('\n').filter(Boolean);
  const count = (p) => lines.filter((l) => l.startsWith(p)).length;
  const pass = count('PASS');
  const fail = count('FAIL');
  const err = count('ERROR');
  const skip = count('SKIP');
  const shown = verbose ? lines : lines.filter((l) => !l.startsWith('PASS'));
  const head = `${name}  ${pass} PASS · ${fail} FAIL · ${err} ERROR${skip ? ` · ${skip} SKIP` : ''} · ${fmt(Date.now() - t0)}`;
  console.log(`\n== ${head}`);
  for (const l of shown) console.log(`   ${l}`);
  return fail + err === 0;
}

const files = targets.map(resolveHarness);
const lib = await import(path.join(here, 'two-device', 'lib.mjs'));
const browser = await (useWebkit ? webkit : chromium).launch({ headless: !headed });
const t0 = Date.now();
let allGreen = true;
try {
  if (parallel) {
    const results = await Promise.all(files.map((f) => runOne(browser, f, lib)));
    allGreen = results.every(Boolean);
  } else {
    for (const f of files) {
      const green = await runOne(browser, f, lib);
      allGreen = allGreen && green;
    }
  }
} finally {
  await browser.close();
}
console.log(`\n${allGreen ? 'GREEN' : 'RED'} · ${files.length} harness${files.length === 1 ? '' : 'es'} · ${fmt(Date.now() - t0)}`);
process.exit(allGreen ? 0 : 1);

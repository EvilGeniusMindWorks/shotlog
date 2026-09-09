#!/usr/bin/env node
// /round — scaffold a round's ceremony (S10 skills, 2026-09-09).
//
//   node scripts/round.mjs new --slug S11 --title "One line a blaster would recognise" \
//        --sections "harness §1|§2|§3" [--files "a.tsx,b.ts"] [--role blaster] [--dry-run]
//
// Does the mechanical parts, in order: the harness scaffold (+ README line + file map, via
// harness-new.mjs), a decisions.md row stub marked "in progress", a queue note, and prints the
// plan-template path for the plan artifact. The plan itself, the docs amendments, the build and
// the deploy are the skill's steps, not this script's.
import fs from 'node:fs';
import path from 'node:path';
import { root, scaffoldHarness } from './harness-new.mjs';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
if (cmd !== 'new') { console.error('usage: round.mjs new --slug S11 --title "…" --sections "a|b" [--files "x,y"] [--role r] [--dry-run]'); process.exit(1); }
const slug = opt('--slug');
const title = opt('--title');
const sections = (opt('--sections', '') || '').split('|').map((s) => s.trim()).filter(Boolean);
const files = (opt('--files', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const dryRun = args.includes('--dry-run');
if (!slug || !title || !sections.length) { console.error('--slug, --title and --sections are required'); process.exit(1); }
const date = opt('--date', new Date().toISOString().slice(0, 10));
const pretty = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const n = scaffoldHarness({ title: `Round ${slug} — ${title}`, sections, files, role: opt('--role', 'blaster'), date, dryRun });

const row = `- **Round ${slug} — ${title} (${pretty}; plan artifact …; Matthew: …).** _In progress._ Harness${n}.\n`;
const decisions = path.join(root, 'docs', 'decisions.md');
if (dryRun) console.log(`would append to docs/decisions.md: ${row.trim()}`);
else { fs.writeFileSync(decisions, fs.readFileSync(decisions, 'utf8').trimEnd() + '\n' + row); console.log('decisions.md row stub added'); }

console.log(`
Next:
  1. Plan artifact: copy .claude/skills/round/plan-template.html to the scratchpad, fill it, publish with
     capabilities {db:{}} (reaction keys ${slug.toLowerCase()}-1..N and ${slug.toLowerCase()}-overall), and wait for Matthew.
  2. Amend the docs the plan touches BEFORE code (decisions row above, personas, help pages).
  3. Build; fill testing/two-device/harness${n}.mjs; node testing/run.mjs ${n} plus the mapped regressions.
  4. /deploy with a marker; then finish the decisions row and memory.`);

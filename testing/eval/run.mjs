// Persona evaluation — the coordinator (Round S9a harness item, 2026-09-09).
//
// Runs a chain of persona steps by itself: each step is a headless Claude
// (`claude -p`) given the brief, the README, and nothing else; between steps
// the coordinator watches the company's records in Postgres for the state the
// next step needs (plan sent · row one logged · log complete · day filed…)
// and releases the next agent. Arms run in parallel. The first run of this
// evaluation took four and a half hours with a person at every hand-off;
// the chain itself is the slow part, and this removes the person.
//
//   node testing/eval/run.mjs --arms A,B --steps dinis,sam            (a partial chain)
//   node testing/eval/run.mjs --arms A,B --steps full                  (the whole day)
//   node testing/eval/run.mjs --arms A --steps dinis --model sonnet --max-turns 250
//
// Needs: the local stack, the browser daemon (browser-server.mjs), and
// testing/eval/out/setup.json (setup.mjs). Records land in testing/eval/out.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] == null ? true : all[i + 1]] : [])).filter(Boolean));
const ARMS = String(args.arms ?? 'A,B').split(',');
const MODEL = args.model ?? 'sonnet';
const MAX_TURNS = String(args['max-turns'] ?? 300);
const OUT = path.resolve('testing/eval/out');
const setup = JSON.parse(fs.readFileSync(path.join(OUT, 'setup.json'), 'utf8'));
const DB = ['exec', 'powersync-spike-pg-1', 'psql', '-U', 'postgres', '-d', 'shotlog', '-At', '-c'];

const sql = (q) => execFileSync('docker', [...DB, q], { encoding: 'utf8' }).trim();
const count = (cid, table, where = 'true') => Number(sql(`select count(*) from records where company_id='${cid}' and table_name='${table}' and (${where});`));
const j = (field) => `(payload::json->>'${field}')`;

/** The chain: each step = which brief, and what must be true in the company before it starts */
const FULL = [
  { step: 'barry-am', part: 'all' },
  { step: 'dinis', part: '1-2', ready: (c) => count(c, 'blastDays', `${j('date')}=current_date::text`) > 0 && count(c, 'drillPlans', `${j('sentAt')} is not null or ${j('status')}='sent'`) + count(c, 'drillLogs', 'true') > 0 },
  { step: 'dinis', part: '3', ready: (c) => count(c, 'drillChecklists', `${j('date')}=current_date::text`) > 0 && count(c, 'drillLogs', 'true') > 0 },
  { step: 'barry-pm', part: '1-2', ready: (c) => count(c, 'drillLogHoles', 'true') >= 6 },
  { step: 'dinis', part: '4', ready: (c) => count(c, 'drillLogHoles', 'true') >= 6 },
  { step: 'barry-pm', part: '3-4', ready: (c) => count(c, 'drillLogHoles', 'true') >= 20 },
  { step: 'dinis', part: '5-6', ready: (c) => count(c, 'drillLogHoles', 'true') >= 20 },
  { step: 'barry-pm', part: '5-9', ready: (c) => count(c, 'drillLogs', `${j('status')} in ('complete','accepted')`) > 0 },
  { step: 'sam', part: 'all', ready: (c) => count(c, 'repairTickets', 'true') > 0 },
  { step: 'evette', part: '1-3', ready: (c) => count(c, 'blastDays', `${j('status')}='submitted'`) > 0 },
  { step: 'barry-refile', part: 'all', ready: (c) => count(c, 'blastDays', `${j('sendBackNote')} is not null`) > 0 },
  { step: 'evette', part: '4-8', ready: (c) => count(c, 'submissions', 'true') >= 3 },
];
const PARTIAL = {
  dinis: [{ step: 'dinis', part: 'all' }],
  sam: [{ step: 'sam', part: 'all', ready: (c) => count(c, 'repairTickets', 'true') > 0 }],
  evette: [{ step: 'evette', part: 'all', ready: (c) => count(c, 'blastDays', `${j('status')}='submitted'`) > 0 }],
};
// S9a before/after: enrol the driller, load a snapshot of the week onto the
// company (the blaster is enrolled by the coordinator — nobody is testing him),
// then Dinis finishes the pattern and Sam works the shop
const AFTER = [
  { step: 'dinis-enrol', part: 'all' },
  { step: 'seed', part: 'all', ready: (c) => sql(`select count(*) from "User" where "companyId"='${c}' and role='driller';`) !== '0' },
  { step: 'dinis-after', part: 'all', ready: (c) => count(c, 'drillLogs', 'true') > 0 },
  { step: 'sam-after', part: 'all', ready: (c) => count(c, 'repairTickets', 'true') > 0 },
];
const steps = args.steps === 'full' ? FULL : args.steps === 'after' ? AFTER : String(args.steps ?? 'dinis,sam').split(',').flatMap((k) => PARTIAL[k] ?? []);

/** The office loads the week: enrol Barry by API, link the roster, build the fixture week */
async function seed(arm) {
  const a = setup.arms[arm];
  const barry = a.invites.barry;
  const token = barry.link.split('/enroll/')[1];
  const r = await fetch(`http://localhost:4000/enroll/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'Blaster41!' }) });
  console.log(`[${arm}] enrolled Barry by API: ${r.status}`);
  execFileSync('node', ['testing/eval/admin.mjs', 'backfill-roster', arm], { stdio: 'inherit' });
  const out = execFileSync('npx', ['tsx', path.resolve('testing/eval/seed-snapshot.mts'), a.companyId], { cwd: path.resolve('apps/server'), env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:spikepass@localhost:5434/shotlog' }, encoding: 'utf8' });
  console.log(`[${arm}] ${out.trim()}`);
  execFileSync('node', ['testing/eval/admin.mjs', 'backfill-roster', arm], { stdio: 'inherit' });
}

function prompt(arm, step, part) {
  const partNote = part === 'all'
    ? 'Do the whole brief.'
    : `This run is split: do ONLY the tasks in part "${part}" of the brief (task numbers ${part}); earlier tasks were done in an earlier sitting — your record file holds what happened, read it first and append. Where the brief says to STOP and wait, stop there: that is the end of this sitting.`;
  return `You are taking part in a usability evaluation as a PERSON using an app, not as an engineer. Your entire brief is printed by this command — run it first, from the repo root ${process.cwd()}, and follow it exactly:

    node testing/eval/briefs.mjs ${arm} ${step}

${partNote}

Then read testing/eval/AGENT-README.md (how the \`b\` command works). Those two things, plus your own record file, are the ONLY files you may read. Do not open the app's source code, its docs, its tests, other agents' files, setup.json, or testing/eval/briefs.mjs itself. Never run any script other than \`node testing/eval/b.mjs …\` (running anything else in testing/eval wipes the whole evaluation). No MCP browser tools, no curl. Read/Write/Edit only on your own record file and on screenshots you take. Spend at most 40 commands on any one task; write "finished: partly" and move on.

Stay in character the whole time. Write your record as you go, task by task, in the format the brief gives. When done, reply with one paragraph: which tasks finished, which did not, and your top three confusions. Leave the browser session open.`;
}

async function waitReady(cid, ready, label, ms = 30 * 60 * 1000) {
  if (!ready) return true;
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { if (ready(cid)) return true; } catch (e) { console.error(`[${label}] ready check failed: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

function runAgent(arm, step, part) {
  return new Promise((resolve) => {
    const log = fs.createWriteStream(path.join(OUT, `run-${arm}-${step}-${part.replace(/[^0-9a-z]/gi, '')}.log`), { flags: 'a' });
    const child = spawn('claude', ['-p', prompt(arm, step, part), '--model', MODEL, '--permission-mode', 'bypassPermissions', '--allowedTools', 'Bash,Read,Write,Edit', '--max-turns', MAX_TURNS, '--output-format', 'text'], { cwd: process.cwd(), env: { ...process.env, EVAL_ARM: arm } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; log.write(d); });
    child.stderr.on('data', (d) => log.write(d));
    child.on('close', (code) => { log.end(); resolve({ code, out: out.slice(-1500) }); });
  });
}

async function runArm(arm) {
  const cid = setup.arms[arm].companyId;
  for (const s of steps) {
    const label = `${arm} · ${s.step} (${s.part})`;
    console.log(`[${new Date().toLocaleTimeString()}] ${label}: waiting for the state it needs…`);
    if (!(await waitReady(cid, s.ready, label))) { console.error(`[${label}] the state never came — stopping arm ${arm}`); return; }
    console.log(`[${new Date().toLocaleTimeString()}] ${label}: running`);
    if (s.step === 'seed') { await seed(arm); continue; }
    const r = await runAgent(arm, s.step, s.part);
    console.log(`[${new Date().toLocaleTimeString()}] ${label}: done (exit ${r.code})\n${r.out.trim().split('\n').slice(-6).join('\n')}\n`);
  }
  console.log(`arm ${arm} complete`);
}

console.log(`coordinator: arms ${ARMS.join(', ')} · steps ${steps.map((s) => `${s.step}(${s.part})`).join(' → ')} · model ${MODEL}`);
await Promise.all(ARMS.map(runArm));
console.log('all arms complete');

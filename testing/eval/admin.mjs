// Persona evaluation — admin actions "Mark" performs in an eval company
// during the run (the platform-admin twin does them, as he would in life).
//
//   node testing/eval/admin.mjs backfill-roster A     roster rows for enrolled people without one
//   node testing/eval/admin.mjs roster A [needle]     list roster rows (name · role · userId)
//   node testing/eval/admin.mjs users A               list accounts in the company
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkCtx, signIn, skipTours, apiLogin } from '../two-device/lib.mjs';

const [, , cmd, arm, needle] = process.argv;
const setup = JSON.parse(fs.readFileSync(path.resolve('testing/eval/out/setup.json'), 'utf8'));
const cid = setup.arms[arm]?.companyId;
if (!cmd || !cid) { console.error('usage: admin.mjs <backfill-roster|roster|users> <A|B> [needle]'); process.exit(2); }

const browser = await chromium.launch();
const ctx = await mkCtx(browser, { viewport: { width: 1280, height: 800 } });
const P = await ctx.newPage();
await signIn(P, 'mark');
await skipTours(P);
const mark = await apiLogin(P, 'mark');
const sw = await mark.api(`/platform/companies/${cid}/switch`, { method: 'POST' }, mark.token);
if (sw.status !== 200) throw new Error(`switch: ${sw.status}`);
const twin = sw.body.accessToken;
const api = (p, init = {}) => mark.api(p, init, twin);

if (cmd === 'backfill-roster') {
  const r = await api('/users/backfill-roster', { method: 'POST' });
  console.log(r.status, JSON.stringify(r.body));
} else if (cmd === 'users') {
  const r = await api('/users');
  for (const u of r.body.users ?? r.body) console.log(`${u.email} · ${u.role} · ${u.name} · ${u.isActive === false ? 'inactive' : 'active'}`);
} else if (cmd === 'roster') {
  const r = await api('/users');
  console.log(`${(r.body.users ?? r.body).length} accounts; roster is a synced table — read it from the app or the DB`);
}
await browser.close();

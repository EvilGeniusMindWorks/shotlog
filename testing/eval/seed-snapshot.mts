// Persona evaluation — start from a snapshot instead of replaying the
// blaster's morning. Builds the rehearsal fixture's connected week into an
// eval company (yesterday's day, today's day with a plan sent to the driller,
// a checklist with a repair, hour meters, an incident, a permit…) so Dinis or
// Sam can start in a minute. The company's accounts must exist and have
// roster rows (enrol them first; `admin.mjs backfill-roster` links the roster).
//
//   cd apps/server && DATABASE_URL=… npx tsx ../../testing/eval/seed-snapshot.mts <companyId>
import { prisma } from '../../apps/server/src/db.js';
import { buildSampleWeek } from '../../apps/server/src/rehearsalFixture.js';

const cid = process.argv[2];
if (!cid) throw new Error('companyId required');
const today = new Date().toISOString().slice(0, 10);
const users = await prisma.user.findMany({ where: { companyId: cid }, select: { id: true, name: true, role: true } });
const roles = new Set(users.map((u) => u.role));
if (!roles.has('blaster') || !roles.has('driller')) throw new Error(`the company needs an enrolled blaster and driller (has: ${[...roles].join(', ')})`);
const summary = await buildSampleWeek(cid, users, today);
console.log(`snapshot: ${summary.rows} rows · jobs ${summary.jobIds.length} · rigs ${summary.rigIds.length}`);
await prisma.$disconnect();

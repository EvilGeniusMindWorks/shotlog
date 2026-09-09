// Persona evaluation — seed Granite Ridge Construction / Ledgeville Pit /
// "Ledgeville Pit — Phase 1" into a company, server-side, the way the
// rehearsal fixture writes reference rows (a new company copies equipment,
// roster, catalog and settings from its source but not customers, sites or
// jobs — the brief needs one existing job to start from).
//
//   cd apps/server && DATABASE_URL=… npx tsx ../../testing/eval/seed-hierarchy.mts <companyId>
import { randomUUID } from 'node:crypto';
import { prisma } from '../../apps/server/src/db.js';

const cid = process.argv[2];
if (!cid) throw new Error('companyId required');
const now = new Date().toISOString();
const today = now.slice(0, 10);
const daysFromNow = (n: number) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const base = { createdAt: now, updatedAt: now, syncStatus: 'synced' };

const customerId = randomUUID();
const siteId = randomUUID();
const jobId = randomUUID();
const rows = [
  { id: customerId, table: 'customers', payload: {
    id: customerId, ...base, name: 'Granite Ridge Construction', customerType: 'quarry', status: 'active', isActive: true,
    phone: '(413) 555-0142', paymentTerms: 'Net 30', coiExpires: daysFromNow(200),
    customerContacts: [{ id: randomUUID(), name: 'Paul Deveraux', title: 'Pit foreman', phone: '(413) 555-0143' }],
  } },
  { id: siteId, table: 'sites', payload: {
    id: siteId, ...base, customerId, name: 'Ledgeville Pit', address: '410 Quarry Rd', city: 'Westfield', state: 'MA', zip: '01085',
    kFactor: 180, kFactorHistory: [], rockType: 'Granite', isActive: true, jurisdiction: 'Westfield FD', notificationRules: 'FD 24 h notice',
    permits: [{ id: randomUUID(), name: 'Blasting permit', number: 'BP-2026-114', authority: 'Westfield FD', expiresAt: daysFromNow(75) }],
    nearbyStructures: [{ id: randomUUID(), label: 'Scale house', distanceFt: 850, direction: 'NE' }],
  } },
  { id: jobId, table: 'jobs', payload: {
    id: jobId, ...base, name: 'Ledgeville Pit — Phase 1', jobNumber: '26-001', jobStatus: 'active', customerId, siteId,
    operation: 'quarry', typeOfRock: 'Granite', typeOfTerrain: 'Bench',
    defaultHazards: 'Overhead lines on the east boundary', defaultPrecautions: 'Mats on the east side; flagger at the gate',
    isActive: true, customer: 'Granite Ridge Construction', address: '410 Quarry Rd', city: 'Westfield', state: 'MA',
    kFactor: 180, kFactorHistory: [], startDate: daysFromNow(-30),
  } },
];

await prisma.record.createMany({
  data: rows.map((r) => ({ id: r.id, companyId: cid, tableName: r.table, payload: JSON.stringify(r.payload), updatedAt: now })),
  skipDuplicates: true,
});
console.log(`customer ${customerId} · site ${siteId} · job ${jobId}`);
await prisma.$disconnect();

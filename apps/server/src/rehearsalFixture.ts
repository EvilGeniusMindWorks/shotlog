// Rehearsal SAMPLE DATA (Round S7a, 2026-09-07): one connected week at two
// jobs so every role has real work in front of them the moment they start
// — a plan half drilled by the rehearsal driller, yesterday's day submitted
// with cards, today's draft, a rig in the shop off a failed checklist, a
// rig with service overdue, an open incident. Deterministic in shape,
// idempotent (the caller refuses when jobs already exist). Machines are
// taken from the sandbox registry when the company's fleet was copied in,
// created when it is empty. Payloads mirror apps/web/src/db/schema.ts.
import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';

interface Row {
  id: string;
  table: string;
  payload: Record<string, unknown>;
}

interface SandboxUser {
  id: string;
  name: string;
  role: string;
}

interface Loaded {
  id: string;
  payload: Record<string, unknown>;
}

async function loadTable(cid: string, tableName: string): Promise<Loaded[]> {
  const rows = await prisma.record.findMany({ where: { companyId: cid, tableName } });
  const out: Loaded[] = [];
  for (const r of rows) {
    try {
      out.push({ id: r.id, payload: JSON.parse(r.payload) as Record<string, unknown> });
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

/** ISO date n days before an ISO date (calendar arithmetic in UTC) */
function daysBefore(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export interface FixtureSummary {
  jobIds: string[];
  rigIds: string[];
  rows: number;
}

export async function buildSampleWeek(
  cid: string,
  users: SandboxUser[],
  today: string,
): Promise<FixtureSummary> {
  const yesterday = daysBefore(today, 1);
  const threeWeeksAgo = daysBefore(today, 21);
  const now = new Date().toISOString();
  const at = (date: string, hhmm: string) => `${date}T${hhmm}:00.000Z`;
  const base = (createdAt = now) => ({ createdAt, updatedAt: createdAt, syncStatus: 'synced' });
  const rows: Row[] = [];
  const put = (table: string, payload: Record<string, unknown>, id = randomUUID()): string => {
    rows.push({ id, table, payload: { id, ...base(), ...payload } });
    return id;
  };

  const byRole = (role: string) => users.find((u) => u.role === role);
  const blaster = byRole('blaster');
  const driller = byRole('driller');
  const supervisor = byRole('supervisor');
  const mechanic = byRole('mechanic');
  if (!blaster || !driller) throw new Error('rehearsal accounts missing');

  // Roster rows for the rehearsal people (created by wipeSandbox)
  const roster = await loadTable(cid, 'crewMembers');
  const crewIdOf = (userId: string) => roster.find((r) => r.payload.userId === userId)?.id;

  // ── Machines: reuse the copied fleet, create what is missing ─────────
  const fleet = await loadTable(cid, 'equipment');
  const isDrill = (e: Loaded) =>
    e.payload.isActive !== false &&
    (e.payload.category === 'rock_drill' || e.payload.category === 'equip_drill');
  const drills = fleet
    .filter(isDrill)
    .sort((a, b) => String(a.payload.assetNumber).localeCompare(String(b.payload.assetNumber)));
  const patchEquipment = (row: Loaded, patch: Record<string, unknown>) => {
    rows.push({ id: row.id, table: 'equipment', payload: { ...row.payload, ...patch, updatedAt: now } });
  };
  let rigA: string;
  let rigB: string;
  let rigAAsset: string;
  let rigBAsset: string;
  if (drills.length >= 2) {
    rigA = drills[0].id;
    rigB = drills[1].id;
    rigAAsset = String(drills[0].payload.assetNumber);
    rigBAsset = String(drills[1].payload.assetNumber);
    patchEquipment(drills[0], { status: 'in_shop', hourMeter: 4212.3, assignedUserId: undefined });
    patchEquipment(drills[1], {
      status: 'active',
      hourMeter: 3888,
      assignedUserId: driller.id,
      services: [
        { id: randomUUID(), type: 'engine', atHours: 3600, date: daysBefore(today, 60), byName: mechanic?.name ?? 'Shop' },
        { id: randomUUID(), type: 'compressor', atHours: 3600, date: daysBefore(today, 60), byName: mechanic?.name ?? 'Shop' },
      ],
    });
  } else {
    // Fewer than two drills copied in: the one there is (if any) goes to
    // the shop; the driller's active rig is created
    if (drills.length === 1) {
      rigA = drills[0].id;
      rigAAsset = String(drills[0].payload.assetNumber);
      patchEquipment(drills[0], { status: 'in_shop', hourMeter: 4212.3, assignedUserId: undefined });
    } else {
      rigAAsset = 'R-101';
      rigA = put('equipment', {
        assetNumber: rigAAsset, description: 'Track drill', category: 'rock_drill', isActive: true,
        status: 'in_shop', make: 'Sandvik', model: 'DX800', hourMeter: 4212.3,
      });
    }
    rigBAsset = 'R-102';
    rigB = put('equipment', {
      assetNumber: rigBAsset, description: 'Track drill', category: 'rock_drill', isActive: true,
      status: 'active', make: 'Epiroc', model: 'FlexiROC T35', hourMeter: 3888, assignedUserId: driller.id,
      services: [
        { id: randomUUID(), type: 'engine', atHours: 3600, date: daysBefore(today, 60), byName: mechanic?.name ?? 'Shop' },
        { id: randomUUID(), type: 'compressor', atHours: 3600, date: daysBefore(today, 60), byName: mechanic?.name ?? 'Shop' },
      ],
    });
  }
  const seismo =
    fleet.find((e) => e.payload.category === 'seismograph' && e.payload.isActive !== false) ??
    null;
  const seismoAsset = seismo ? String(seismo.payload.assetNumber) : 'S-3';
  if (!seismo) {
    put('equipment', {
      assetNumber: seismoAsset, description: 'Instantel Micromate', category: 'seismograph', isActive: true,
      status: 'active', calibrationDue: daysBefore(today, -120),
    });
  }
  const truck =
    fleet.find(
      (e) =>
        (e.payload.category === 'pickup' || e.payload.category === 'vehicle' || e.payload.category === 'service_truck') &&
        e.payload.isActive !== false,
    ) ?? null;
  const truckAsset = truck ? String(truck.payload.assetNumber) : 'T-12';
  const truckId = truck
    ? truck.id
    : put('equipment', {
        assetNumber: truckAsset, description: 'Powder truck', category: 'pickup', isActive: true,
        status: 'active', odometer: 88410,
      });

  // ── Catalog picks for the explosives line items ──────────────────────
  const catalog = await loadTable(cid, 'productCatalog');
  const pick = (cats: string[]) =>
    catalog.find((p) => cats.includes(String(p.payload.category)) && p.payload.isActive !== false) ??
    catalog[0];
  const emulsion = pick(['emulsion', 'bulk', 'anfo']);
  const booster = pick(['booster', 'booster_electronic']);
  const line = (p: Loaded | undefined, quantity: number, shotId: string) => {
    const mult = Number(p?.payload.weightMultiplier ?? 1);
    return {
      productId: p?.id ?? '',
      productName: String(p?.payload.productName ?? 'Product'),
      manufacturer: String(p?.payload.manufacturer ?? ''),
      category: String(p?.payload.category ?? ''),
      quantity,
      unitType: String(p?.payload.unitType ?? 'each'),
      weightMultiplier: mult,
      totalWeight: Math.round(quantity * mult * 100) / 100,
      shotAllocations: { [shotId]: quantity },
    };
  };

  // ── Customers · sites · jobs ─────────────────────────────────────────
  const quarryCustomer = put('customers', {
    name: 'Granite Ridge Construction', customerType: 'quarry', status: 'active', isActive: true,
    phone: '(413) 555-0142', paymentTerms: 'Net 30', coiExpires: daysBefore(today, -200),
    customerContacts: [{ id: randomUUID(), name: 'Paul Deveraux', title: 'Pit foreman', phone: '(413) 555-0143' }],
  });
  const gcCustomer = put('customers', {
    name: 'Route 3 Site Works LLC', customerType: 'gc', status: 'active', isActive: true,
    phone: '(413) 555-0177', paymentTerms: 'Net 45', poRequired: true, coiExpires: daysBefore(today, -40),
  });
  const pitSite = put('sites', {
    customerId: quarryCustomer, name: 'Ledgeville Pit', address: '410 Quarry Rd', city: 'Westfield', state: 'MA',
    zip: '01085', kFactor: 180, kFactorHistory: [], rockType: 'Granite', isActive: true,
    jurisdiction: 'Westfield FD', notificationRules: 'FD 24 h notice',
    permits: [{ id: randomUUID(), name: 'Blasting permit', number: 'BP-2026-114', authority: 'Westfield FD', expiresAt: daysBefore(today, -75) }],
    nearbyStructures: [{ id: randomUUID(), label: 'Scale house', distanceFt: 850, direction: 'NE' }],
  });
  const culvertSite = put('sites', {
    customerId: gcCustomer, name: 'Route 3 culvert', address: 'Route 3 at Old Route 3', city: 'Chicopee', state: 'MA',
    zip: '01020', kFactor: 160, kFactorHistory: [], rockType: 'Shale over granite', isActive: true,
    jurisdiction: 'Chicopee FD', notificationRules: 'FD 48 h notice · abutters 500 ft',
    permits: [{ id: randomUUID(), name: 'Blasting permit', number: 'CH-26-031', authority: 'Chicopee FD', expiresAt: daysBefore(today, -25) }],
    nearbyStructures: [{ id: randomUUID(), label: 'House, 12 Old Route 3', distanceFt: 320, direction: 'W', notes: 'Pre-blast survey done' }],
    utilityNotes: 'Gas main along the west shoulder — Dig Safe 26-118842',
  });
  const pitJob = put('jobs', {
    name: 'Ledgeville Pit — Phase 1', jobNumber: '26-001', jobStatus: 'active', customerId: quarryCustomer, siteId: pitSite,
    operation: 'quarry', typeOfRock: 'Granite', typeOfTerrain: 'Bench',
    defaultHazards: 'Overhead lines on the east boundary', defaultPrecautions: 'Mats on the east side; flagger at the gate',
    isActive: true, customer: 'Granite Ridge Construction', address: '410 Quarry Rd', city: 'Westfield', state: 'MA',
    kFactor: 180, kFactorHistory: [], startDate: daysBefore(today, 30),
  });
  const culvertJob = put('jobs', {
    name: 'Route 3 culvert', jobNumber: '26-007', jobStatus: 'active', customerId: gcCustomer, siteId: culvertSite,
    customerPO: 'PO-44817', operation: 'construction', typeOfRock: 'Shale over granite', typeOfTerrain: 'Cut',
    defaultHazards: 'Gas main west shoulder; live traffic on Route 3', defaultPrecautions: 'Mats every shot; police detail; 500 ft abutter notice',
    isActive: true, customer: 'Route 3 Site Works LLC', address: 'Route 3 at Old Route 3', city: 'Chicopee', state: 'MA',
    kFactor: 160, kFactorHistory: [], startDate: daysBefore(today, 3),
  });

  // ── The plan the driller is working today (14 of 31 holes) ───────────
  const plan = put('drillPlans', {
    jobId: pitJob, name: 'Bench 3 east', status: 'open', rows: 4, cols: 8, defaultDepth: 32,
    overrides: { 3: { noHole: true } }, holeDiameter: 3.5, burden: 9, spacing: 10,
    notes: 'Face is 30 ft on the east end — 32 ft holes with 2 ft sub.', createdBy: blaster.id, isActive: true,
  });
  const planLog = put('drillLogs', {
    jobId: pitJob, drillPlanId: plan, date: today, drillRigEquipmentId: rigB, status: 'open',
    holeDiameter: 3.5, burden: 9, spacing: 10, faceHeight: 32, gps: '', locationNote: 'East end, starting row 1',
    drillerUserId: driller.id, drillerName: driller.name, signatureImage: null,
    assignedBy: blaster.name, assignedAt: at(yesterday, '16:10'),
  });
  for (let n = 1; n <= 14; n++) {
    const skipped = n === 9;
    const wet = n === 6;
    put('drillLogHoles', {
      drillLogId: planLog, date: today, holeNumber: String(n), angle: 0, actualDepth: skipped ? 0 : 32, subdrill: 2,
      conditions: wet ? [{ fromFt: 8, toFt: 12, code: 'W', note: 'water at 8 ft' }] : [],
      comment: skipped ? 'Boulder at the collar — moved to row 2' : '', skipped,
      plannedDepth: 32, plannedAngle: 0,
    });
  }

  // ── Yesterday: a full blasting day on the pit job, SUBMITTED ─────────
  const yDay = put('blastDays', {
    date: yesterday, jobId: pitJob, name: 'Bench 2 lift 4', status: 'submitted', typeOfWork: 'drill_to_blast', fireDetail: false,
    conditions: { temperatureRange: 'mod', weather: 'partly_cloudy', windDirection: 'NW', groundConditions: 'normal', weatherNotes: '' },
  });
  const yLog = put('blastLogs', {
    blastDayId: yDay, operation: 'quarry', typeOfRock: 'Granite', typeOfTerrain: 'Bench',
    hazards: 'Overhead lines on the east boundary', precautions: 'Mats on the east side; flagger at the gate',
    onsiteDelivery: true, blasterName: blaster.name, blasterUserId: blaster.id, licenseNumber: 'MA-B-4471', licenseState: 'MA',
    signatureImage: null, notes: 'Clean shot, good fragmentation. Muck pile within the bench.',
    readinessReview: { confirmedAt: at(yesterday, '10:05'), confirmedBy: blaster.id, confirmedByName: blaster.name, maxPoundsPerDelay: 78, hazardNotes: 'Water in row 1 holes — packaged product below 12 ft' },
  });
  const yShotId = randomUUID();
  const sd = 850 / Math.sqrt(78);
  put('shots', {
    blastLogId: yLog, shotNumber: 1, time: '11:40',
    drillParams: { waterDepth: 4, holeDiameter: 3.5, burden: 9, spacing: 10, stemming: 7, subDrill: 2, blastMats: true },
    totals: { numHoles: 20, totalSqFt: 1800, avgDrillDepth: 32, totalDrillFootage: 640, totalPayYards: 2000, totalYardsShot: 2133 },
    designPlan: {
      siteSketchData: null, siteSketchImage: null, shotDiagramData: null, shotDiagramImage: null, columnDiagramImage: null,
      closestStructureLocation: 'Scale house, NE', closestStructureDistance: 850, closestBoreholeDistance: 840,
      maxHolesPerDelay: 1, maxPoundsPerDelay: 78, scaledDistance: Math.round(sd * 10) / 10,
      predictedPPV: Math.round(180 * Math.pow(sd, -1.6) * 1000) / 1000, kFactor: 180,
    },
    responsibleBlasterUserId: blaster.id, responsibleBlasterName: blaster.name, responsibleLicenseNumber: 'MA-B-4471',
    responsibleLicenseState: 'MA', signatureImage: null, signedAt: at(yesterday, '12:20'),
  }, yShotId);
  put('seismoReadings', {
    shotId: yShotId, graphNumber: 1, seismographId: seismoAsset, ppvTran: 0.11, ppvVert: 0.09, ppvLong: 0.12, peakVectorSum: 0.14,
    frequency: 28, airOverpressure: 118, maxAccelTran: 0.02, maxAccelVert: 0.02, maxAccelLong: 0.03,
    maxDisplacementTran: 0.0006, maxDisplacementVert: 0.0005, maxDisplacementLong: 0.0007,
    operator: blaster.name, location: 'Scale house, 850 ft NE', triggerTimestamp: at(yesterday, '11:40'),
    sensorCheckPassed: true, calibrationDate: daysBefore(today, 140), complianceStatus: 'compliant', printoutImage: null,
  });
  const em = line(emulsion, 60, yShotId);
  const bo = line(booster, 20, yShotId);
  put('explosiveUsages', {
    blastLogId: yLog, products: [em, bo], totalPoundsShot: Math.round((em.totalWeight + bo.totalWeight) * 100) / 100,
    detonators: [{ name: 'Electronic detonator', unitLength: '40 ft', quantity: 20, shipment1Qty: 20, shipment2Qty: 0 }],
    leadLine: 400, coverType: 'Mats',
  });
  const yReport = put('dailyReports', { blastDayId: yDay, notes: 'Shot at 11:40. Mats set on the east side. No complaints at the gate.' });
  put('equipmentEntries', { dailyReportId: yReport, category: 'equip_drill', assetNumber: rigAAsset, equipmentId: rigA, hoursStart: 4205, hoursEnd: 4212.3 });
  put('equipmentEntries', { dailyReportId: yReport, category: 'vehicle', assetNumber: truckAsset, equipmentId: truckId, hoursStart: 0, hoursEnd: 0 });
  put('equipmentEntries', { dailyReportId: yReport, category: 'mats_seismo', assetNumber: seismoAsset, hoursStart: 0, hoursEnd: 0 });
  put('materialEntries', { dailyReportId: yReport, vendor: 'Ledgeville Pit', description: 'Stemming stone 3/4"', unit: 'ton', total: 6 });
  // The accepted shot log from yesterday's drilling
  const yDrillLog = put('drillLogs', {
    jobId: pitJob, blastDayId: yDay, shotId: yShotId, drillRigEquipmentId: rigA, status: 'accepted',
    holeDiameter: 3.5, burden: 9, spacing: 10, faceHeight: 32, gps: '', locationNote: 'Bench 2, rows 1–2',
    drillerUserId: driller.id, drillerName: driller.name, signatureImage: null,
    completedAt: at(yesterday, '09:50'), acceptedBy: blaster.name, acceptedAt: at(yesterday, '10:05'),
    completionNote: 'Row 1 wet from hole 3 east.',
  }, undefined);
  for (let n = 1; n <= 20; n++) {
    put('drillLogHoles', {
      drillLogId: yDrillLog, date: yesterday, holeNumber: String(n), angle: 0, actualDepth: 32, subdrill: 2,
      conditions: n >= 3 && n <= 10 ? [{ fromFt: 12, toFt: 34, code: 'W', note: 'wet below 12' }] : [], comment: '',
    });
  }
  // Time cards: everyone files their own (S7d model) — blaster, driller, supervisor
  const card = (u: SandboxUser, timeIn: string, timeOut: string, st: number, ot: number) =>
    put('timeCards', {
      date: yesterday, jobId: pitJob, blastDayId: yDay, personName: u.name, crewMemberId: crewIdOf(u.id), userId: u.id,
      timeIn, timeOut, straightTime: st, overtime: ot, signatureImage: null, status: 'filed', filedAt: at(yesterday, '16:00'),
      enteredByUserId: u.id, enteredByName: u.name,
    });
  card(blaster, '06:30', '15:30', 8, 0.5);
  card(driller, '06:15', '15:45', 8, 1);
  if (supervisor) card(supervisor, '07:00', '15:00', 7.5, 0);

  // ── Today: the blaster's draft on the culvert job ────────────────────
  const tDay = put('blastDays', {
    date: today, jobId: culvertJob, name: 'Culvert cut, north end', status: 'draft', typeOfWork: 'drill_to_blast', fireDetail: true,
    conditions: { temperatureRange: 'mod', weather: 'sunny', windDirection: '', groundConditions: 'normal', weatherNotes: '' },
  });
  const tLog = put('blastLogs', {
    blastDayId: tDay, operation: 'construction', typeOfRock: 'Shale over granite', typeOfTerrain: 'Cut',
    hazards: 'Gas main west shoulder; live traffic on Route 3', precautions: 'Mats every shot; police detail; 500 ft abutter notice',
    onsiteDelivery: false, blasterName: blaster.name, blasterUserId: blaster.id, licenseNumber: 'MA-B-4471', licenseState: 'MA',
    signatureImage: null, notes: '',
  });
  put('shots', {
    blastLogId: tLog, shotNumber: 1, time: '',
    drillParams: { waterDepth: 0, holeDiameter: 3, burden: 6, spacing: 7, stemming: 5, subDrill: 1, blastMats: true },
    totals: { numHoles: 0, totalSqFt: 0, avgDrillDepth: 0, totalDrillFootage: 0, totalPayYards: 0, totalYardsShot: 0 },
    designPlan: {
      siteSketchData: null, siteSketchImage: null, shotDiagramData: null, shotDiagramImage: null, columnDiagramImage: null,
      closestStructureLocation: 'House, 12 Old Route 3', closestStructureDistance: 320, closestBoreholeDistance: 300,
      maxHolesPerDelay: 1, maxPoundsPerDelay: 0, scaledDistance: 0, predictedPPV: 0, kFactor: 160,
    },
  });
  put('explosiveUsages', { blastLogId: tLog, products: [], totalPoundsShot: 0, detonators: [], leadLine: 0, coverType: '' });
  put('dailyReports', { blastDayId: tDay, notes: '' });

  // ── Rig checklists: rig A failed yesterday (→ ticket, in shop); rig B's
  //    last weekly service 58 h ago (50-h clock overdue) ────────────────
  const checks = (state: string) =>
    Object.fromEntries(
      ['Engine Oil', 'Compressor Oil', 'Hydraulic Oil', 'Anti-Freeze', 'Fuel', 'Oil Leaks', 'Hoses (while drilling)', 'Hoses on Rollers',
        'Grease Machine', 'Blow Out Coolers', 'Gauges', 'Horn', 'Lubricator', 'Backup Alarm', 'Emergency Stop'].map((k) => [k, state]),
    );
  const weekly = (state: string) =>
    Object.fromEntries(
      ['Blow Out Engine Air Filters', 'Blow Out Compressor Air Filters', 'Blow Out Dust Collector Air Filters', 'Fire Extinguishers', 'Grease Rollers'].map((k) => [k, state]),
    );
  const failedChecklist = put('drillChecklists', {
    equipmentId: rigA, jobId: pitJob, date: yesterday, startingHours: 4212.3, daily: { ...checks('ok'), 'Oil Leaks': 'skip' },
    weeklyDone: false, weekly: weekly('skip'), repairsNote: 'Hydraulic leak at the boom cylinder — puddle under the rig by noon',
    outOfService: true, drillerUserId: driller.id, drillerName: driller.name, signatureImage: null,
  });
  rows[rows.length - 1].payload.createdAt = at(yesterday, '06:40');
  put('repairTickets', {
    equipmentId: rigA, sourceType: 'drill_checklist', sourceId: failedChecklist,
    description: 'Hydraulic leak at the boom cylinder — puddle under the rig by noon', outOfService: true, status: 'open',
    openedByName: driller.name, openedByUserId: driller.id,
  });
  rows[rows.length - 1].payload.createdAt = at(yesterday, '06:45');
  put('drillChecklists', {
    equipmentId: rigB, jobId: pitJob, date: threeWeeksAgo, startingHours: 3830, daily: checks('ok'),
    weeklyDone: true, weekly: weekly('ok'), repairsNote: '', outOfService: false,
    drillerUserId: driller.id, drillerName: driller.name, signatureImage: null,
  });
  rows[rows.length - 1].payload.createdAt = at(threeWeeksAgo, '06:40');
  put('drillChecklists', {
    equipmentId: rigB, jobId: pitJob, date: yesterday, startingHours: 3888, daily: checks('ok'),
    weeklyDone: false, weekly: weekly('skip'), repairsNote: '', outOfService: false,
    drillerUserId: driller.id, drillerName: driller.name, signatureImage: null,
  });
  rows[rows.length - 1].payload.createdAt = at(yesterday, '06:35');

  // ── An open incident on yesterday's shot — the office's claim to work ──
  put('incidents', {
    type: 'blasting', status: 'open', jobId: pitJob, date: yesterday, time: '14:10', blastDayId: yDay, shotId: yShotId,
    description: 'Homeowner at 12 Quarry Rd reports a cracked basement window after the 11:40 shot. No visible damage from the road.',
    reportedByName: blaster.name, reportedByUserId: blaster.id, structureType: 'Residence', structureAddress: '12 Quarry Rd, Westfield',
    ownerName: 'D. Marchetti', ownerPhone: '(413) 555-0188', ownerAddress: '12 Quarry Rd, Westfield MA', preBlastSurvey: 'completed',
    ppv: 0.14, db: 118,
  });

  await prisma.record.createMany({
    data: rows.map((r) => ({
      id: r.id,
      companyId: cid,
      tableName: r.table,
      payload: JSON.stringify(r.payload),
      updatedAt: now,
    })),
    skipDuplicates: true,
  });
  // Patched fleet rows already existed — createMany skipped them; rewrite
  const patched = rows.filter((r) => r.table === 'equipment' && fleet.some((f) => f.id === r.id));
  for (const r of patched) {
    await prisma.record.update({
      where: { companyId_id: { companyId: cid, id: r.id } },
      data: { payload: JSON.stringify(r.payload), updatedAt: now },
    });
  }
  return { jobIds: [pitJob, culvertJob], rigIds: [rigA, rigB], rows: rows.length };
}

#!/usr/bin/env node
// Brochure / product-page screenshots (Round S25, Sep 27 2026). Builds a CLEAN
// fictional company on the LOCAL dev stack, seeds one realistic job in it
// through the app's own data layer, photographs the key screens at phone and
// tablet sizes, scans a seismograph printout, and packs the frames the public
// page uses into apps/web/public/brochure as WebP. Nothing here touches production.
//
//   node testing/brochure-shots.mjs --out <dir> --phase company     (once: the company + its people → company.json)
//   node testing/brochure-shots.mjs --out <dir> --phase seed        (the job, pattern, drilling, shot, papers → seed.json)
//   node testing/brochure-shots.mjs --out <dir> --phase shots [--only a,b]
//   node testing/brochure-shots.mjs --out <dir> --phase scan --printout /path/to/tape.jpg
//   node testing/brochure-shots.mjs --out <dir> --phase pack        (→ apps/web/public/brochure/*.webp)
//   --phase all = seed + shots (+ scan when --printout is given) + pack
// Without company.json the dev company's own logins are used (harness clutter and all).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import * as lib from './two-device/lib.mjs';

const { WEB, mkCtx, signIn, skipTours, sleep, waitForUpload } = lib;
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = arg('--out', 'testing/brochure-out');
const PHASE = arg('--phase', 'all');
const ONLY = new Set((arg('--only', '') || '').split(',').filter(Boolean));
const PRINTOUT = arg('--printout', '');
fs.mkdirSync(OUT, { recursive: true });
const SEED = path.join(OUT, 'seed.json');
const COMPANY = path.join(OUT, 'company.json');
const PUBLIC_DIR = new URL('../apps/web/public/brochure/', import.meta.url).pathname;
const today = new Date().toISOString().slice(0, 10);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);

// ── the fictional company and its people ───────────────────────────────
// Westford, MA is a real town; the company, the people, the customer, the
// phone numbers and the addresses are invented.
const COMPANY_NAME = 'Ledgeview Blasting Co.';
const PEOPLE = {
  blaster: { name: 'Sam Carver', email: 'sam@ledgeview.test', pass: 'ledgeview-sam-123', role: 'blaster' },
  driller: { name: 'Luis Ferreira', email: 'luis@ledgeview.test', pass: 'ledgeview-luis-123', role: 'driller' },
  driller2: { name: 'Owen Pratt', email: 'owen@ledgeview.test', pass: 'ledgeview-owen-123', role: 'driller' },
  office: { name: 'Dana Whitcomb', email: 'dana@ledgeview.test', pass: 'ledgeview-dana-123', role: 'office' },
  admin: { name: 'Pat Okafor', email: 'pat@ledgeview.test', pass: 'ledgeview-pat-1234', role: 'admin' },
};
const SITE = { lat: 42.5726, lng: -71.4381 };
const ftToLat = (ft) => (ft * 0.3048) / 111320;
const ftToLng = (ft) => (ft * 0.3048) / (111320 * Math.cos((SITE.lat * Math.PI) / 180));
const at = (ft, bearingDeg) => ({
  lat: SITE.lat + ftToLat(ft) * Math.cos((bearingDeg * Math.PI) / 180),
  lng: SITE.lng + ftToLng(ft) * Math.sin((bearingDeg * Math.PI) / 180),
});

/** A brand-new account meets the welcome card once ("Let's go"); the shoot's people are all new. */
async function settleIn(P) {
  await skipTours(P);
  for (let i = 0; i < 3; i++) {
    const go = P.getByRole('button', { name: /Let.s go|Got it|Start/i }).first();
    if (!(await go.count()) || !(await go.isVisible().catch(() => false))) break;
    await go.click().catch(() => undefined);
    await sleep(900);
  }
  await skipTours(P);
}

const browser = await chromium.launch();
let company = readJson(COMPANY);
let seed = readJson(SEED);
// who signs in for each role — the clean company's people when it exists, else the dev logins
const U = company ? company.users : { blaster: 'blaster', driller: 'dinis', driller2: 'mark', office: 'office', admin: 'mark' };

// ── phase: company ─────────────────────────────────────────────────────
if (PHASE === 'company') {
  const ctx = await mkCtx(browser);
  const P = await ctx.newPage();
  const { token: rootToken, api } = await lib.apiLogin(P, 'mark');
  let list = await api('/platform/companies', {}, rootToken);
  let c = (list.body?.companies ?? []).find((x) => x.name === COMPANY_NAME);
  if (!c) {
    const made = await api('/platform/companies', { method: 'POST', body: JSON.stringify({ name: COMPANY_NAME, environment: 'alpha' }) }, rootToken);
    if (made.status !== 201) throw new Error(`could not create the company: ${made.status} ${JSON.stringify(made.body)}`);
    c = made.body.company;
    log('company created', c.id);
  } else log('company exists', c.id);
  const sw = await api(`/platform/companies/${c.id}/switch`, { method: 'POST' }, rootToken);
  if (sw.status !== 200) throw new Error(`switch failed: ${sw.status} ${JSON.stringify(sw.body)}`);
  const twin = sw.body.accessToken;
  const users = {};
  for (const [key, p] of Object.entries(PEOPLE)) {
    let r = await api('/users', { method: 'POST', body: JSON.stringify({ email: p.email, name: p.name, role: p.role, tempPassword: p.pass }) }, twin);
    let id = r.body?.user?.id;
    if (r.status === 409) {
      const all = await api('/users', {}, twin);
      id = (all.body?.users ?? []).find((u) => u.email === p.email)?.id;
    } else if (r.status !== 201) throw new Error(`user ${p.email}: ${r.status} ${JSON.stringify(r.body)}`);
    if (!id) throw new Error(`no id for ${p.email}`);
    const rp = await api(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ tempPassword: p.pass, requireChange: false }) }, twin);
    if (rp.status !== 200) throw new Error(`password for ${p.email}: ${rp.status}`);
    users[key] = { ...p, id };
    log('person', key, p.name, id);
  }
  company = { companyId: c.id, name: COMPANY_NAME, users, at: new Date().toISOString() };
  fs.writeFileSync(COMPANY, JSON.stringify(company, null, 2));
  await ctx.close();
  log('company.json written; run --phase seed next');
}

// ── phase: seed ────────────────────────────────────────────────────────
if (PHASE === 'all' || PHASE === 'seed') {
  log('seed: signing in as', typeof U.blaster === 'string' ? U.blaster : U.blaster.name);
  const ctx = await mkCtx(browser, { viewport: { width: 1280, height: 900 } });
  const PB = await ctx.newPage();
  await signIn(PB, U.blaster);
  await skipTours(PB);
  const d1 = (await lib.apiLogin(PB, U.driller)).user;
  const d2 = (await lib.apiLogin(PB, U.driller2)).user;
  const me = await PB.evaluate(async () => (await import('/src/lib/session.ts')).getSessionUser());
  log('seed: users', me?.name, d1.name, d2.name);

  seed = await PB.evaluate(async ({ today, SITE, drillers, me, pins }) => {
    const { db } = await import('/src/db/index.ts');
    const { nowISO } = await import('/src/lib/utils.ts');
    const { ensureCustomerAndSite } = await import('/src/lib/jobContext.ts');
    const { createJob, createBlastDay, addBlastLogToDay } = await import('/src/hooks/useBlastDay.ts');
    const plans = await import('/src/hooks/useDrillPlans.ts');
    const { addHole } = await import('/src/hooks/useDrillLogs.ts');
    const uid = () => crypto.randomUUID();
    const now = nowISO();
    const out = {};
    const base = () => ({ id: uid(), createdAt: nowISO(), updatedAt: nowISO(), syncStatus: 'local' });

    // ── the fleet a new company has none of ─────────────────────────
    const fleet = await db.equipment.toArray();
    let rig = fleet.find((e) => e.category === 'rock_drill' && e.isActive !== false);
    if (!rig) { rig = { ...base(), assetNumber: 'RD-12', description: 'Furukawa HCR 1200 rock drill', category: 'rock_drill', isActive: true, make: 'Furukawa', model: 'HCR 1200', year: 2019, hourMeter: 4310 }; await db.equipment.add(rig); }
    let seismo = fleet.find((e) => e.category === 'seismograph' && e.isActive !== false);
    if (!seismo) { seismo = { ...base(), assetNumber: 'S-3', description: 'Instantel Micromate', category: 'seismograph', isActive: true, make: 'Instantel', model: 'Micromate', serialNumber: 'UM7412', calibrationDue: '2027-03-12' }; await db.equipment.add(seismo); }
    if (!fleet.find((e) => e.category === 'service_truck')) await db.equipment.add({ ...base(), assetNumber: 'T-4', description: 'Ford F-350 powder truck', category: 'service_truck', isActive: true, make: 'Ford', model: 'F-350', year: 2021, odometer: 61240 });

    // ── customer, site, job ─────────────────────────────────────────
    const { customerId, siteId } = await ensureCustomerAndSite({
      customerName: 'Hanover Ridge Development LLC', address: '118 Ridge Road', city: 'Westford', state: 'MA',
      siteName: 'Ridge Road · Lot 14', kFactor: 160,
    });
    await db.sites.update(siteId, {
      zip: '01886', geo: SITE, jurisdiction: 'Town of Westford · Fire Department',
      rockType: 'Granite ledge', overburden: '2–4 ft glacial till', waterConditions: 'Dry; seep at the NE corner',
      accessNotes: 'Enter from the Ridge Road gate; haul road down to the bench. Overhead lines along the road.',
      permits: [{ id: uid(), name: 'Blasting permit', number: 'BP-2026-0147', authority: 'Westford Fire Department', expiresAt: '2026-12-31' }],
      nearbyStructures: [
        { id: uid(), label: 'House · 112 Ridge Rd', distanceFt: 310, direction: 'W', notes: 'Pre-blast survey done Sep 19' },
        { id: uid(), label: 'Well · 112 Ridge Rd', distanceFt: 285, direction: 'SW', notes: 'Water sample taken' },
        { id: uid(), label: 'Barn · 130 Ridge Rd', distanceFt: 540, direction: 'NE' },
        { id: uid(), label: 'Gas main · Ridge Rd', distanceFt: 610, direction: 'S', notes: 'Dig Safe 2026-3341' },
      ],
      notificationRules: 'Abutters within 500 ft notified in writing 48 h before the first shot.',
      contacts: [
        { id: uid(), role: 'onsite', label: 'Site superintendent', name: 'Tom Reilly · Reilly Site Works', phone: '(978) 555-0177' },
        { id: uid(), role: 'fire_chief', label: 'Fire chief', name: 'Chief Dan Kessler', phone: '(978) 555-0142' },
        { id: uid(), role: 'police', label: 'Police', name: 'Westford Police · dispatch', phone: '(978) 555-0100' },
        { id: uid(), role: 'town_hall', label: 'Town hall', name: 'Building Department', phone: '(978) 555-0130' },
        { id: uid(), role: 'hospital', label: 'Nearest hospital', name: 'Merrimack Valley Medical Center', phone: '(978) 555-0199', notes: '14 min · 8.2 mi' },
        { id: uid(), role: 'urgent_care', label: 'Urgent care', name: 'Route 110 Urgent Care', phone: '(978) 555-0160', notes: '6 min · 2.9 mi' },
      ],
      updatedAt: now,
    });
    const jobId = await createJob({
      name: 'Ridge Road Subdivision · Phase 2 ledge', customer: 'Hanover Ridge Development LLC', customerId, siteId,
      siteName: 'Ridge Road · Lot 14', address: '118 Ridge Road', city: 'Westford', state: 'MA',
      jobNumber: '26-047', customerPO: 'HRD-4471', jobStatus: 'active',
      operation: 'construction', defaultTypeOfWork: 'drill_to_blast', typeOfRock: 'Granite ledge', typeOfTerrain: 'Wooded, sloping',
      defaultHazards: 'Overhead lines · House within 350 ft · Well within 300 ft',
      defaultPrecautions: 'Blast mats · Pre-blast survey · Seismograph at the nearest house', kFactor: 160,
    });
    await db.jobs.update(jobId, {
      startDate: '2026-09-21', owner: 'Hanover Ridge Development LLC', generalContractor: 'Reilly Site Works, Inc.', quoteRef: 'Q-26-118',
      workSpot: { lat: SITE.lat, lng: SITE.lng, setBy: me.id, setByName: me.name, setAt: now, source: 'map' }, updatedAt: nowISO(),
    });
    out.customerId = customerId; out.siteId = siteId; out.jobId = jobId;

    // ── the pattern: 5 × 9 = 45 holes, sent to two drillers ─────────
    const planId = await plans.createDrillPlan(jobId, 'Lot 14 ledge · Bench 1');
    await db.drillPlans.update(planId, { rows: 5, cols: 9, defaultDepth: 14, holeDiameter: 3, burden: 5, spacing: 6, updatedAt: nowISO() });
    let plan = await db.drillPlans.get(planId);
    await plans.sendPlan(plan, drillers.map((d) => ({ userId: d.id, name: d.name })));
    const parts = await db.drillLogs.filter((l) => l.drillPlanId === planId).toArray();
    const partOf = (d) => parts.find((p) => p.drillerUserId === d.id);
    for (const p of parts) await db.drillLogs.update(p.id, { drillRigEquipmentId: rig.id, faceHeight: 14, updatedAt: nowISO() });
    const partA = await db.drillLogs.get(partOf(drillers[0]).id);
    const partB = await db.drillLogs.get(partOf(drillers[1]).id);
    const holeOpts = (n) => ({
      holeNumber: String(n), plannedDepth: 14, angle: 0, subdrill: 1, comment: '',
      actualDepth: n === 12 ? 15.5 : n === 31 ? 13 : 14,
      conditions: n === 19 ? [{ fromFt: 9, toFt: 9, code: 'W' }] : n === 27 ? [{ fromFt: 6, toFt: 7, code: 'V' }] : [],
    });
    for (let n = 1; n <= 27; n++) await addHole(partA, holeOpts(n));
    for (let n = 28; n <= 45; n++) await addHole(partB, holeOpts(n));
    plan = await db.drillPlans.get(planId);
    if (plan.status !== 'complete') await plans.autoDrilled(planId).catch(() => undefined);
    const sig = await new Promise((res) => {
      const c = document.createElement('canvas'); c.width = 300; c.height = 100;
      const g = c.getContext('2d'); g.strokeStyle = '#1C3859'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(20, 70);
      for (let x = 20; x <= 280; x += 4) g.lineTo(x, 50 + 22 * Math.sin(x / 14) * Math.cos(x / 41));
      g.stroke(); c.toBlob(res, 'image/png');
    });
    for (const p of [partA, partB]) await db.drillLogs.update(p.id, { status: 'complete', signatureImage: sig, completedAt: nowISO(), completionNote: p.id === partA.id ? 'Hole 19 wet at 9 ft, 27 has a void at 6–7 ft.' : '', updatedAt: nowISO() });
    let accepted = 0;
    try { accepted = await plans.acceptPatternLog(planId); } catch (e) { out.acceptError = String(e?.message || e); }
    out.planId = planId; out.partA = partA.id; out.partB = partB.id; out.rigId = rig.id; out.accepted = accepted;

    // ── the blast day and the shot from the pattern ─────────────────
    const dayId = await createBlastDay(jobId, undefined, undefined, { typeOfWork: 'drill_to_blast', name: 'Lot 14 ledge' });
    const blastLog = await db.blastLogs.where('blastDayId').equals(dayId).first();
    const logId = blastLog ? blastLog.id : await addBlastLogToDay(dayId);
    const shotId = await plans.makeShotFromPlan(logId, planId, 160);
    out.dayId = dayId; out.logId = logId; out.shotId = shotId;

    const products = await db.productCatalog.toArray();
    const pick = (re) => products.find((p) => re.test(p.productName || '') && p.isActive !== false);
    const emul = pick(/Hydromite 880 - 2\.25/) || products.find((p) => p.category === 'emulsion');
    const boost = pick(/Eagle 450/) || products.find((p) => p.category === 'booster');
    const lbsPerHole = 9 * (emul?.weightMultiplier ?? 2.63) + (boost?.weightMultiplier ?? 1);
    const D = 310, W = Math.round(lbsPerHole * 2 * 10) / 10; // two holes per delay
    const SD = Math.round((D / Math.sqrt(W)) * 10) / 10;
    const PPV = Math.round(160 * Math.pow(SD, -1.6) * 1000) / 1000;
    const rows = 5, cols = 9, wires = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) wires.push({ from: r * cols + c, to: r * cols + c + 1 });
      if (r < rows - 1) wires.push({ from: r * cols, to: (r + 1) * cols, leadMs: 42 });
    }
    const diagram = { rows, cols, delays: {}, wires, start: { hole: 0, leadMs: 17 }, interHoleMs: 25, asDrilled: { at: nowISO(), undrilled: [], drilledCount: 45 } };
    const sketch = { center: SITE, zoom: 17, baseLayer: 'street', blastPin: SITE, ringFt: 250, structures: pins.map((p) => ({ id: uid(), label: p.label, lat: p.lat, lng: p.lng })) };
    await db.shots.update(shotId, {
      time: '13:42',
      'drillParams.stemming': 4, 'drillParams.subDrill': 1, 'drillParams.waterDepth': 0, 'drillParams.blastMats': true, 'drillParams.blastMatCount': 14,
      'designPlan.siteSketchData': JSON.stringify(sketch), 'designPlan.shotDiagramData': JSON.stringify(diagram),
      'designPlan.closestStructureLocation': 'House · 112 Ridge Rd (W)', 'designPlan.closestStructureDistance': D, 'designPlan.closestBoreholeDistance': 296,
      'designPlan.maxHolesPerDelay': 2, 'designPlan.maxPoundsPerDelay': W, 'designPlan.kFactor': 160, 'designPlan.scaledDistance': SD, 'designPlan.predictedPPV': PPV,
      updatedAt: nowISO(),
    });
    await db.blastLogs.update(logId, {
      operation: 'construction', typeOfRock: 'Granite ledge', typeOfTerrain: 'Wooded, sloping',
      hazards: 'Overhead lines · House within 350 ft · Well within 300 ft', precautions: 'Blast mats · Pre-blast survey · Seismograph at the nearest house',
      onsiteDelivery: true, notes: 'Good breakage, no fly. Mats held. Neighbor at 112 notified at 13:15.', updatedAt: nowISO(),
    });
    const line = (p, qty) => p ? ({ productId: p.id, productName: p.productName, manufacturer: p.manufacturer, category: p.category, quantity: qty, unitType: p.unitType, weightMultiplier: p.weightMultiplier, totalWeight: Math.round(qty * p.weightMultiplier * 100) / 100, shotAllocations: { [shotId]: qty } }) : null;
    const productLines = [line(emul, 405), line(boost, 45)].filter(Boolean);
    const usage = await db.explosiveUsages.where('blastLogId').equals(logId).first();
    const usageData = {
      products: productLines, totalPoundsShot: Math.round(productLines.reduce((s, l) => s + l.totalWeight, 0) * 100) / 100,
      detonators: [{ name: 'Electronic detonator · 20 ft', unitLength: '20 ft', quantity: 45, shipment1Qty: 45, shipment2Qty: 0 }],
      leadLine: 600, coverType: 'Blast mats', blastMats: true, blastMatCount: 14, updatedAt: nowISO(),
    };
    if (usage) await db.explosiveUsages.update(usage.id, usageData);
    else await db.explosiveUsages.add({ ...base(), blastLogId: logId, ...usageData });
    await db.seismoReadings.add({
      ...base(), shotId, graphNumber: 1,
      seismographId: seismo.assetNumber, ppvTran: 0.18, ppvVert: 0.14, ppvLong: 0.21, peakVectorSum: 0.24, frequency: 28, airOverpressure: 118,
      maxAccelTran: 0.06, maxAccelVert: 0.05, maxAccelLong: 0.07, maxDisplacementTran: 0.0011, maxDisplacementVert: 0.0009, maxDisplacementLong: 0.0012,
      operator: me.name, location: 'House · 112 Ridge Rd · 310 ft W', triggerTimestamp: `${today}T13:42:07`, sensorCheckPassed: true, calibrationDate: '2026-03-12', complianceStatus: 'compliant',
    });
    await db.typicalColumns.add({
      ...base(), shotId, name: 'Column 1', holeDepth: 14, holeDiameter: 3, snapshotImage: null,
      layers: [
        { layerOrder: 0, layerType: 'subdrill', lengthFt: 1, productId: null, productName: null, notes: null },
        { layerOrder: 1, layerType: 'booster', lengthFt: 0.5, productId: boost?.id ?? null, productName: boost?.productName ?? 'Booster', notes: 'Electronic det' },
        { layerOrder: 2, layerType: 'explosive', lengthFt: 8.5, productId: emul?.id ?? null, productName: emul?.productName ?? 'Emulsion', notes: '9 sticks' },
        { layerOrder: 3, layerType: 'stemming', lengthFt: 4, productId: null, productName: null, notes: '3/4" crushed stone' },
      ],
    });
    // one open near miss on the day, so the safety screens have something true to show
    await db.incidents.add({
      ...base(), type: 'near_miss', status: 'open', jobId, blastDayId: dayId, date: today, time: '10:15',
      description: 'Delivery truck came down the haul road past the closed gate while holes were being loaded. Stopped at the first mat; driver turned around. Gate now chained.',
      reportedByName: me.name, reportedByUserId: me.id, policeCalled: false,
    });
    for (const p of [{ id: me.id, name: me.name, ot: 0.5 }, ...drillers.map((d) => ({ id: d.id, name: d.name, ot: 0 }))]) {
      await db.timeCards.add({ ...base(), date: today, jobId, blastDayId: dayId, personName: p.name, userId: p.id, timeIn: '06:30', timeOut: p.ot ? '15:30' : '15:00', straightTime: 8, overtime: p.ot, notes: '', signatureImage: null, status: 'draft' });
    }
    return out;
  }, {
    today, SITE, me, drillers: [{ id: d1.id, name: d1.name }, { id: d2.id, name: d2.name }],
    pins: [
      { label: 'House · 112 Ridge Rd', ...at(310, 270) }, { label: 'Well · 112 Ridge Rd', ...at(285, 225) },
      { label: 'Barn · 130 Ridge Rd', ...at(540, 45) }, { label: 'Gas main', ...at(610, 180) }, { label: 'Shed · 116 Ridge Rd', ...at(205, 300) },
    ],
  });
  seed.today = today;
  log('seed:', JSON.stringify(seed));
  await waitForUpload(PB, 90000).catch(() => undefined);
  await sleep(3000);
  fs.writeFileSync(SEED, JSON.stringify(seed, null, 2));
  await ctx.close();
}

// ── phase: shots ───────────────────────────────────────────────────────
const SIZES = { phone: { width: 390, height: 844 }, tablet: { width: 1280, height: 800 } };
if (PHASE === 'all' || PHASE === 'shots') {
  if (!seed) throw new Error('no seed.json — run the seed phase first');
  const { jobId, siteId, planId, partA, rigId, dayId, shotId } = seed;
  const want = (name) => ONLY.size === 0 || ONLY.has(name);
  const SCREENS = {
    blaster: [
      { name: 'home', url: '/' },
      { name: 'jobs', url: '/jobs' },
      { name: 'job', url: `/jobs/${jobId}` },
      { name: 'site', url: `/sites/${siteId}` },
      { name: 'contact-sheet', url: `/jobs/${jobId}/contact-sheet`, full: true },
      { name: 'pattern', url: `/jobs/${jobId}/drill-plan/${planId}` },
      { name: 'pattern-full', url: `/jobs/${jobId}/drill-plan/${planId}`, full: true },
      { name: 'day-tiles', url: `/blast-day/${dayId}` },
      { name: 'walkthrough', url: `/blast-day/${dayId}?view=walkthrough` },
      { name: 'blast-log', url: `/blast-day/${dayId}?view=blast-log` },
      { name: 'blast-log-full', url: `/blast-day/${dayId}?view=blast-log`, full: true },
      { name: 'design-map', url: `/blast-day/${dayId}/design/${shotId}`, clicks: ['Work spot'], scrollSel: '.leaflet-container', scrollBlock: 'start', settle: 8000 },
      { name: 'design-map-el', url: `/blast-day/${dayId}/design/${shotId}`, clicks: ['Work spot'], scrollSel: '.leaflet-container', elSel: '.leaflet-container', settle: 8000 },
      { name: 'design-map-street', url: `/blast-day/${dayId}/design/${shotId}`, clicks: ['Work spot', 'Street'], scrollSel: '.leaflet-container', scrollBlock: 'start', settle: 8000 },
      { name: 'design-map-street-el', url: `/blast-day/${dayId}/design/${shotId}`, clicks: ['Work spot', 'Street'], scrollSel: '.leaflet-container', elSel: '.leaflet-container', settle: 8000 },
      { name: 'design-compliance', url: `/blast-day/${dayId}/design/${shotId}`, scrollTo: 'Structure & Compliance', settle: 2500 },
      { name: 'design-timing', url: `/blast-day/${dayId}/design/${shotId}?mode=timing`, scrollSel: '[data-timing-hole="1"]', settle: 2500 },
      { name: 'design-column', url: `/blast-day/${dayId}/design/${shotId}`, scrollTo: 'Typical Column', settle: 2500 },
      { name: 'design-full', url: `/blast-day/${dayId}/design/${shotId}`, full: true, settle: 7000 },
      { name: 'seismo', url: `/blast-day/${dayId}/seismo/${shotId}` },
      { name: 'check-and-sign', url: `/blast-day/${dayId}?view=check` },
      { name: 'daily-report', url: `/blast-day/${dayId}?view=daily-report` },
      { name: 'file-day', url: `/blast-day/${dayId}/submit`, waitSel: '[data-preflight]', settle: 3000 },
      { name: 'print-blast-log', url: `/blast-day/${dayId}/print`, full: true, sizes: ['tablet'] },
      { name: 'records', url: '/records' },
    ],
    driller: [
      { name: 'driller-home', url: '/' },
      { name: 'drilling', url: '/drilling' },
      { name: 'drill-log', url: `/jobs/${jobId}/drill-plan/${planId}/log/${partA}` },
      { name: 'drill-log-full', url: `/jobs/${jobId}/drill-plan/${planId}/log/${partA}`, full: true },
      { name: 'rig-checklist', url: `/drill-checklist/${rigId}?job=${jobId}&date=${seed.today}` },
    ],
    office: [
      { name: 'office-home', url: '/' },
      { name: 'office-records', url: '/records' },
      { name: 'approvals', url: '/admin/approvals' },
      { name: 'incidents', url: '/admin/incidents' },
      { name: 'people', url: '/admin/people' },
      { name: 'equipment', url: '/admin/equipment' },
    ],
    admin: [
      { name: 'catalog', url: '/admin/catalog' },
      { name: 'roles', url: '/admin/roles' },
      { name: 'company', url: '/admin/company' },
      { name: 'feedback', url: '/admin/feedback' },
    ],
  };
  for (const [who, screens] of Object.entries(SCREENS)) {
    const user = U[who];
    if (!user) continue;
    for (const [size, viewport] of Object.entries(SIZES)) {
      const todo = screens.filter((s) => want(s.name) && (!s.sizes || s.sizes.includes(size)));
      if (!todo.length) continue;
      const ctx = await mkCtx(browser, { viewport, deviceScaleFactor: 2 });
      const P = await ctx.newPage();
      await signIn(P, user);
      await settleIn(P);
      await sleep(1500);
      for (const s of todo) {
        const file = path.join(OUT, `${s.name}--${size}.png`);
        try {
          await P.goto(`${WEB}${s.url}`);
          await P.locator('main, [data-print-page], [data-preflight]').first().waitFor({ state: 'attached', timeout: 20000 }).catch(() => undefined);
          if (s.waitSel) await P.locator(s.waitSel).first().waitFor({ timeout: 45000 }).catch(() => undefined);
          await sleep(s.settle ?? 1800);
          if (s.scrollTo) {
            const el = P.getByText(s.scrollTo, { exact: false }).first();
            if (await el.count()) { await el.scrollIntoViewIfNeeded().catch(() => undefined); await P.mouse.wheel(0, -80); await sleep(s.settle ?? 2000); }
          }
          for (const label of s.clicks ?? []) {
            const b = P.getByRole('button', { name: label, exact: true }).first();
            if (await b.count()) { await b.scrollIntoViewIfNeeded().catch(() => undefined); await b.click().catch(() => undefined); await sleep(1500); }
          }
          if (s.scrollSel) {
            const el = P.locator(s.scrollSel).first();
            if (await el.count()) {
              if (s.scrollBlock) await el.evaluate((e, block) => e.scrollIntoView({ block }), s.scrollBlock).catch(() => undefined);
              else await el.scrollIntoViewIfNeeded().catch(() => undefined);
              await P.mouse.wheel(0, s.scrollBlock ? -90 : -160);
              await sleep(s.settle ?? 2000);
            }
          }
          if (s.elSel) await P.locator(s.elSel).first().screenshot({ path: file });
          else await P.screenshot({ path: file, fullPage: Boolean(s.full) });
          log('✓', who, size, s.name);
        } catch (e) {
          log('✗', who, size, s.name, String(e?.message || e).split('\n')[0]);
        }
      }
      await ctx.close();
    }
  }
}

// ── phase: scan — photograph the printout, watch the values fill ───────
// The photo must be a REAL Instantel tape (invented names painted over are
// fine); the synthetic testing/eval/assets/printout.jpg does not scan.
if (PHASE === 'scan' || (PHASE === 'all' && PRINTOUT)) {
  if (!seed) throw new Error('no seed.json — run the seed phase first');
  if (!PRINTOUT) throw new Error('--printout <photo> is required');
  for (const [size, viewport] of Object.entries(SIZES)) {
    const ctx = await mkCtx(browser, { viewport, deviceScaleFactor: 2 });
    const P = await ctx.newPage();
    await signIn(P, U.blaster);
    await settleIn(P);
    await P.goto(`${WEB}/blast-day/${seed.dayId}/seismo/${seed.shotId}`);
    await P.getByRole('button', { name: /Add Reading/ }).first().click();
    const input = P.locator('input[type="file"][accept="image/*"]').first();
    await input.waitFor({ state: 'attached', timeout: 10000 });
    await input.setInputFiles(PRINTOUT);
    const done = await P.getByText(/values from the printout/).first().waitFor({ timeout: 120000 }).then(() => true).catch(() => false);
    await sleep(1200);
    const banner = P.getByText(/values from the printout/).first();
    if (await banner.count()) await banner.scrollIntoViewIfNeeded().catch(() => undefined);
    await P.mouse.wheel(0, -260);
    await sleep(800);
    await P.screenshot({ path: path.join(OUT, `seismo-scan--${size}.png`) });
    log(done ? '✓' : '✗', 'blaster', size, 'seismo-scan', done ? '' : 'the scan did not finish');
    await ctx.close(); // the form is left unsaved: the seeded reading stays the only one
  }
}

// ── phase: pack — the frames the public page uses, as WebP ────────────
const PACK = {
  // name → target width in px (phones 780 = 2× their 390 css px; tablets 1600 for a 800 px slot on retina)
  'design-map-street-el--tablet': 1400, 'day-tiles--phone': 780, 'pattern--phone': 780, 'drill-log--phone': 780, 'design-timing--phone': 780,
  'check-and-sign--phone': 780, 'file-day--phone': 780, 'design-timing--tablet': 1600, 'seismo-scan--phone': 780, 'seismo-scan--tablet': 1600,
  'blast-log--tablet': 1600, 'pattern--tablet': 1600, 'print-blast-log--tablet': 1600, 'records--phone': 780, 'office-home--tablet': 1600,
  'approvals--phone': 780, 'office-records--phone': 780, 'contact-sheet--tablet': 1600, 'incidents--phone': 780, 'home--phone': 780,
  'driller-home--phone': 780, 'office-home--phone': 780, 'design-compliance--phone': 780, 'walkthrough--phone': 780, 'design-map--tablet': 1600,
};
if (PHASE === 'all' || PHASE === 'pack') {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  const ctx = await browser.newContext();
  const P = await ctx.newPage();
  let n = 0, bytes = 0;
  for (const [name, width] of Object.entries(PACK)) {
    const src = path.join(OUT, `${name}.png`);
    if (!fs.existsSync(src)) { log('· missing', name); continue; }
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(src).toString('base64');
    const webp = await P.evaluate(async ({ dataUrl, width }) => {
      const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const scale = Math.min(1, width / bmp.width);
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', 0.82);
    }, { dataUrl, width });
    const out = path.join(PUBLIC_DIR, `${name}.webp`);
    fs.writeFileSync(out, Buffer.from(webp.split(',')[1], 'base64'));
    n++; bytes += fs.statSync(out).size;
  }
  await ctx.close();
  log(`packed ${n} frames, ${(bytes / 1024 / 1024).toFixed(1)} MB → apps/web/public/brochure/`);
}

await browser.close();
log('done →', OUT);

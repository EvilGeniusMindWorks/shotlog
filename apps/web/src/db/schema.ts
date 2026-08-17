import type { HomeDashboard, KickDirection } from '@shotlog/shared';

export type { KickDirection };

// ══════════════════════════════════════════════════════
// ROLE DEFINITIONS — the configurable-roles capability layer. One record
// per role KEY; absence = the built-in bundle from @shotlog/shared. The
// 'admin' key is protected (server discards writes to it).
// ══════════════════════════════════════════════════════

export interface RoleDefinitionRecord {
  id: string;
  key: string; // 'blaster' (edited built-in) or a custom slug
  name: string;
  capabilities: string[];
  homeDashboard: HomeDashboard;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'local' | 'pending' | 'synced';
}

// ══════════════════════════════════════════════════════
// SYNC & BASE TYPES
// ══════════════════════════════════════════════════════

export type SyncStatus = 'local' | 'pending' | 'synced';

export interface BaseRecord {
  id: string; // UUID
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  syncStatus: SyncStatus;
}

// ══════════════════════════════════════════════════════
// JOB (enriched per Addendum 1 §A1.1)
// ══════════════════════════════════════════════════════

export interface KFactorHistoryEntry {
  date: string;
  actualPPV: number;
  sd: number;
  derivedK: number;
}

// ══════════════════════════════════════════════════════
// CUSTOMER → SITE → JOB hierarchy. The CUSTOMER is who hires Baystate;
// a customer has SITES (physical places — the ground, the jurisdiction,
// the neighbors); a site hosts JOBS over time (engagements). Everything
// physical/jurisdictional lives on the Site: address, state, Site K and
// its calibration history, local PPV bylaws, the contact sheet. The Job
// keeps only engagement facts.
// ══════════════════════════════════════════════════════

/** Full postal address — every address in the app is a field SET, never
 *  one line (Matthew's call in the screen-studies review). */
export interface PostalAddress {
  street1: string;
  street2?: string;
  city: string;
  state: string; // 2-letter
  zip: string;
}

export type CustomerType = 'gc' | 'quarry' | 'developer' | 'municipality' | 'homeowner' | 'other';
export type CustomerStatus = 'prospect' | 'active' | 'inactive';

/** Named person at a customer (billing / scheduling / PM / exec…) */
export interface CustomerContact {
  id: string;
  name: string;
  role: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
}

export interface Customer extends BaseRecord {
  name: string;
  customerType?: CustomerType;
  status?: CustomerStatus; // absent = active (pre-expansion records)
  website?: string;
  phone?: string;
  billing?: PostalAddress;
  paymentTerms?: string; // "Net 30"…
  poRequired?: boolean;
  taxExempt?: boolean;
  taxCertNote?: string;
  rateNotes?: string;
  /** Certificate of insurance on file — expiry drives office warnings */
  coiExpires?: string; // ISO date
  w9OnFile?: boolean;
  prequalNotes?: string;
  customerContacts?: CustomerContact[];
  notes?: string;
  isActive: boolean;
  // LEGACY single-line billing address (pre-expansion records)
  billingAddress?: string;
}

/** A permit held at a site — number + expiry drive renewal countdowns */
export interface SitePermit {
  id: string;
  name: string; // "Blasting permit"
  number: string;
  authority?: string;
  expiresAt?: string; // ISO date
  notes?: string;
}

/** A structure of concern near the site (house, well, gas main…) */
export interface NearbyStructure {
  id: string;
  label: string;
  distanceFt?: number;
  direction?: string;
  notes?: string;
}

export interface Site extends BaseRecord {
  customerId: string;
  /** Display label — defaults to the address when not named */
  name: string;
  address: string; // street 1
  street2?: string;
  city: string;
  state: string; // 2-letter — drives license auto-pick + state regs
  zip?: string;
  gps?: string;
  /** Gate codes, haul road, where to park the magazine truck… */
  accessNotes?: string;
  parcelOwner?: string;
  kFactor: number;
  kFactorHistory: KFactorHistoryEntry[];
  rockType?: string;
  overburden?: string;
  waterConditions?: string;
  // Local/municipal PPV override (Spec §16.1, e.g. Whately Bylaw 1.0 in/s)
  localRegName?: string;
  localPPVLimit?: number;
  /** Authority having jurisdiction (town/city + who issues permits) */
  jurisdiction?: string;
  permits?: SitePermit[];
  /** "FD 24 h notice · abutters 500 ft" — how this town wants noticing */
  notificationRules?: string;
  nearbyStructures?: NearbyStructure[];
  utilityNotes?: string;
  standingHazards?: string;
  /** Site contact sheet — office-maintained, field-critical OFFLINE */
  contacts?: JobContact[];
  contactNotes?: string;
  isActive: boolean;
}

export type JobStatus = 'quoted' | 'active' | 'on_hold' | 'complete';

export interface Job extends BaseRecord {
  name: string;
  /** Auto-assigned per-year sequence ("26-041"), editable override */
  jobNumber?: string;
  /** The customer's PO — their identifier, separate from ours */
  customerPO?: string;
  jobStatus?: JobStatus; // absent = active (pre-expansion records)
  startDate?: string; // ISO date
  targetDate?: string;
  quoteRef?: string;
  engineerOfRecord?: string;
  /** Hierarchy links — set on every new job; backfilled on legacy jobs */
  customerId?: string;
  siteId?: string;
  operation: 'construction' | 'quarry' | 'trench' | 'open';
  typeOfRock: string;
  typeOfTerrain: string;
  defaultHazards: string;
  defaultPrecautions: string;
  isActive: boolean;
  owner?: string;
  generalContractor?: string;
  // ── LEGACY fields (pre-hierarchy). Readers resolve through
  // lib/jobContext.ts which prefers the linked Site/Customer; these are
  // kept so un-backfilled records keep working. Writers use the new
  // records only. ──
  customer: string;
  address: string;
  city: string;
  state: string; // 2-letter
  kFactor: number;
  kFactorHistory: KFactorHistoryEntry[];
  localRegName?: string;
  localPPVLimit?: number;
  contacts?: JobContact[];
  contactNotes?: string;
}

export type JobContactRole =
  | 'onsite'
  | 'fire_chief'
  | 'detail_dispatch'
  | 'police'
  | 'fire'
  | 'hospital'
  | 'urgent_care'
  | 'custom';

export interface JobContact {
  id: string;
  role: JobContactRole;
  label: string;
  name: string;
  phone: string;
  notes?: string;
}

// ══════════════════════════════════════════════════════
// BLASTER PROFILE (Addendum 1 §A1.6)
// ══════════════════════════════════════════════════════

export interface BlasterLicense {
  state: string; // 2-letter
  licenseNumber: string;
  expirationDate: string; // ISO date
  isActive: boolean;
}

export interface BlasterProfile extends BaseRecord {
  name: string;
  company: string;
  dealerNumber: string;
  licenses: BlasterLicense[];
  defaultSignature: Blob | null;
  isCurrentUser: boolean;
  phone: string;
  email: string;
  isActive: boolean;
}

// ══════════════════════════════════════════════════════
// BLAST DAY (parent record)
// ══════════════════════════════════════════════════════

export interface BlastDayConditions {
  temperatureRange: 'low' | 'mod' | 'high';
  weather: 'sunny' | 'cloudy' | 'partly_cloudy' | 'rain_light' | 'rain_heavy' | 'rain_out';
  windDirection: string;
  groundConditions: 'normal' | 'wet' | 'muddy' | 'rock' | 'frozen';
  weatherNotes: string;
}

/** Office job-costing codes: DB / DO / DE / C / H on the paper forms */
export type WorkType =
  | 'drill_to_blast'
  | 'drill_only'
  | 'drill_to_excavate'
  | 'blasting'
  | 'crushing'
  | 'hauling';

/** Which work types carry a blasting log (and shots, explosives, seismo) */
export function isBlastingWork(typeOfWork: WorkType): boolean {
  return typeOfWork === 'blasting' || typeOfWork === 'drill_to_blast';
}

/**
 * The per-job WORK DAY — the root of each day's records. Every work day
 * has a daily report; blasting-type days additionally carry a blast log.
 * (Named BlastDay for historical reasons; renaming the table would force
 * a data migration for zero benefit.)
 */
export interface BlastDay extends BaseRecord {
  date: string; // ISO date
  jobId: string;
  /** Optional quick label from the blaster, e.g. "North face lift 2" */
  name?: string;
  status: 'draft' | 'submitted' | 'approved';
  conditions: BlastDayConditions;
  typeOfWork: WorkType;
  fireDetail: boolean;
}

// ══════════════════════════════════════════════════════
// BLAST LOG (1:1 with BlastDay)
// ══════════════════════════════════════════════════════

export interface BlastLog extends BaseRecord {
  blastDayId: string;
  operation: 'construction' | 'quarry' | 'trench' | 'open';
  typeOfRock: string;
  typeOfTerrain: string;
  hazards: string;
  precautions: string;
  onsiteDelivery: boolean;
  blasterName: string;
  /** Login account of the signing blaster (stamped at license pick) */
  blasterUserId?: string;
  licenseNumber: string;
  licenseState: string;
  signatureImage: Blob | null;
  notes: string;
}

// ══════════════════════════════════════════════════════
// SHOT (unlimited per blast log — Addendum 2 §B1.1)
// ══════════════════════════════════════════════════════

export interface DrillParams {
  waterDepth: number; // ft
  holeDiameter: number; // in
  burden: number; // ft
  spacing: number; // ft
  stemming: number; // ft
  subDrill: number; // ft
  blastMats?: boolean; // Spec §4.6.1 — optional: pre-existing records lack it
}

export interface ShotTotals {
  numHoles: number;
  totalSqFt: number;
  avgDrillDepth: number;
  totalDrillFootage: number;
  totalPayYards: number;
  totalYardsShot: number;
}

export interface DesignPlan {
  siteSketchData: string | null; // JSON for Leaflet annotations
  siteSketchImage: Blob | null;
  shotDiagramData: string | null; // JSON for tap-grid state
  shotDiagramImage: Blob | null;
  columnDiagramImage: Blob | null;
  closestStructureLocation: string;
  closestStructureDistance: number; // ft (D)
  closestBoreholeDistance: number; // ft
  maxHolesPerDelay: number;
  maxPoundsPerDelay: number; // lbs (W)
  scaledDistance: number; // auto: D / sqrt(W)
  predictedPPV: number; // auto: K × SD^(-1.6)
  kFactor: number;
}

export interface Shot extends BaseRecord {
  blastLogId: string;
  shotNumber: number;
  time: string; // HH:mm
  drillParams: DrillParams;
  totals: ShotTotals;
  designPlan: DesignPlan;
  /** Standalone drill plan this shot was imported from (totals + grid) */
  drillPlanId?: string;
}

// ══════════════════════════════════════════════════════
// SEISMO READING (up to 3 per shot)
// ══════════════════════════════════════════════════════

export interface SeismoReading extends BaseRecord {
  shotId: string;
  graphNumber: number; // 1–3
  seismographId: string;
  ppvTran: number; // in/s
  ppvVert: number;
  ppvLong: number;
  peakVectorSum: number;
  frequency: number; // Hz
  airOverpressure: number; // dB
  maxAccelTran: number; // g
  maxAccelVert: number;
  maxAccelLong: number;
  maxDisplacementTran: number; // in
  maxDisplacementVert: number;
  maxDisplacementLong: number;
  operator: string;
  location: string;
  triggerTimestamp: string; // ISO datetime
  sensorCheckPassed: boolean;
  calibrationDate: string; // ISO date
  complianceStatus: 'compliant' | 'warning' | 'violation';
  printoutImage: Blob | null; // camera capture of the seismograph printout
}

// ══════════════════════════════════════════════════════
// EXPLOSIVE USAGE (dynamic line items — Addendum 1 §A1.2)
// ══════════════════════════════════════════════════════

export interface ExplosiveLineItem {
  productId: string; // FK → ProductCatalog
  productName: string; // denormalized
  manufacturer: string;
  category: string;
  quantity: number;
  unitType: string; // stick, bag, each
  weightMultiplier: number; // lbs per unit
  totalWeight: number; // auto: quantity × multiplier
  shotAllocations: Record<string, number>; // shotId → qty
}

export interface DetonatorLineItem {
  name: string;
  unitLength: string;
  quantity: number;
  shipment1Qty: number;
  shipment2Qty: number;
}

export interface ExplosiveUsage extends BaseRecord {
  blastLogId: string;
  products: ExplosiveLineItem[];
  totalPoundsShot: number; // auto-sum
  detonators: DetonatorLineItem[];
  leadLine: number; // LF
  coverType: string;
}

// ══════════════════════════════════════════════════════
// TYPICAL COLUMN (Addendum 2 §B1.2)
// ══════════════════════════════════════════════════════

export interface ColumnLayer {
  layerOrder: number; // 0 = bottom
  layerType: 'subdrill' | 'explosive' | 'booster' | 'stemming' | 'air_deck';
  lengthFt: number;
  productId: string | null;
  productName: string | null;
  notes: string | null;
}

export interface TypicalColumn extends BaseRecord {
  shotId: string;
  name: string; // tab label, e.g. "Column 1" (plain field — not indexed)
  holeDepth: number; // ft
  holeDiameter: number; // in
  layers: ColumnLayer[];
  snapshotImage: Blob | null;
}

// ══════════════════════════════════════════════════════
// DAILY REPORT (1:1 with BlastDay)
// ══════════════════════════════════════════════════════

export interface DailyReport extends BaseRecord {
  blastDayId: string;
  notes: string;
}

export interface WorkForceEntry extends BaseRecord {
  dailyReportId: string;
  rowNumber: number;
  workerName: string;
  /** Roster link (stamped by auto-populate); legacy rows match by name */
  crewMemberId?: string;
  timeIn: string; // HH:mm
  timeOut: string;
  straightTime: number; // auto from in/out
  overtime: number;
  truckHours: number;
  travelHours: number;
}

export interface EquipmentEntry extends BaseRecord {
  dailyReportId: string;
  category: 'vehicle' | 'equip_drill' | 'mats_seismo';
  assetNumber: string;
  hoursStart: number;
  hoursEnd: number;
  /** Registry link (new picker); legacy rows match by assetNumber text */
  equipmentId?: string;
}

export interface MaterialEntry extends BaseRecord {
  dailyReportId: string;
  vendor: string;
  description: string;
  unit: string;
  total: number;
}

export interface SubcontractorEntry extends BaseRecord {
  dailyReportId: string;
  vendor: string;
  description: string;
  hours: number;
  total: number;
}

// ══════════════════════════════════════════════════════
// CREW & EQUIPMENT REGISTRY
// ══════════════════════════════════════════════════════

export interface CrewMember extends BaseRecord {
  name: string;
  licenseNumber: string;
  licenseState: string;
  isActive: boolean;
  /** Links this roster entry to a login account (User.id), when they have one */
  userId?: string;
  /** Roster role tag (driller/blaster/mechanic/…) — drives the dispatch
   *  picker; stamped at invite/enrollment, editable in Admin › Company */
  role?: string;
}

/** Legacy buckets kept valid; new registry uses the specific categories */
export type EquipmentCategory =
  | 'vehicle'
  | 'equip_drill'
  | 'mats_seismo'
  | 'pickup'
  | 'service_truck'
  | 'rock_drill'
  | 'crusher'
  | 'excavator'
  | 'compressor'
  | 'conveyor'
  | 'tractor'
  | 'trailer'
  | 'fuel_trailer'
  | 'blast_mats'
  | 'seismograph'
  | 'bore_tracking';

export type EquipmentStatus = 'active' | 'in_shop' | 'retired';

/**
 * Daily-report equipment entries keep the paper form's three sections —
 * map the specific registry categories down to those buckets.
 */
export function equipmentEntryBucket(
  category: EquipmentCategory,
): 'vehicle' | 'equip_drill' | 'mats_seismo' {
  switch (category) {
    case 'vehicle':
    case 'pickup':
    case 'service_truck':
    case 'tractor':
    case 'trailer':
    case 'fuel_trailer':
      return 'vehicle';
    case 'mats_seismo':
    case 'blast_mats':
    case 'seismograph':
    case 'bore_tracking':
      return 'mats_seismo';
    default:
      return 'equip_drill';
  }
}

export interface Equipment extends BaseRecord {
  assetNumber: string;
  description: string;
  category: EquipmentCategory;
  isActive: boolean;
  make?: string;
  model?: string;
  year?: number | null;
  serialNumber?: string;
  plate?: string;
  status?: EquipmentStatus;
  hourMeter?: number | null;
  odometer?: number | null;
  /** ISO date — road-fleet DOT inspection due */
  dotInspectionDue?: string;
  /** ISO date — seismograph annual calibration due (keeps records defensible) */
  calibrationDue?: string;
  /** Login account of the usual operator, when linked */
  assignedUserId?: string;
  notes?: string;
}

// ══════════════════════════════════════════════════════
// PRODUCT CATALOG (Addendum 1 §A2)
// ══════════════════════════════════════════════════════

/** Deletion marker — synced so removals propagate instead of resurrecting */
export interface Tombstone {
  id: string; // `${tableName}:${recordId}`
  tableName: string;
  recordId: string;
  deletedAt: string; // ISO
  syncStatus: 'local' | 'pending' | 'synced';
}

export type ProductCategory =
  | 'bulk'
  | 'anfo'
  | 'anfo_wr'
  | 'gel_dynamite'
  | 'emulsion'
  | 'booster'
  | 'booster_electronic'
  | 'cartridge';

// ══════════════════════════════════════════════════════
// DRILL PLANS — the blaster's plan for a pattern, authored AHEAD of any
// blast day, worked by multiple drillers over multiple days. Holes are a
// grid; each planned hole is a vertical depth plus an optional "kick"
// (horizontal offset in ft + compass direction) — drill angle and true
// hole length are DERIVED, never stored.
// ══════════════════════════════════════════════════════

export interface DrillPlanHoleOverride {
  /** Vertical depth (ft); 0 or noHole = position not drilled */
  depth?: number;
  /** Horizontal kick-out at the toe (ft) */
  kick?: number;
  kickDir?: KickDirection;
  noHole?: boolean;
}

export interface DrillPlanRecord extends BaseRecord {
  jobId: string;
  name: string;
  status: 'open' | 'complete';
  rows: number;
  cols: number;
  /** Depth every hole inherits unless overridden */
  defaultDepth?: number;
  /** Exceptions keyed by grid index (row-major) */
  overrides: Record<number, DrillPlanHoleOverride>;
  holeDiameter: number;
  burden: number;
  spacing: number;
  notes?: string;
  createdBy: string; // userId
}

// ══════════════════════════════════════════════════════
// DRILL LOGS — the Driller→Blaster handoff. A shot's pattern may take
// several drillers/days: EACH driller's contribution is its own signed
// log; the shot aggregates them.
// ══════════════════════════════════════════════════════

export type HoleConditionCode = 'V' | 'SR' | 'O' | 'W';

export interface HoleCondition {
  fromFt: number;
  toFt: number;
  code: HoleConditionCode;
  /** Driller's detail: "water at 8 ft", "void 11-13", a measured value… */
  note?: string;
}

export interface DrillLog extends BaseRecord {
  jobId: string;
  /** Shot-parented (legacy) logs: the owning blast day + shot */
  blastDayId?: string;
  shotId?: string;
  /** Plan-parented logs: the standalone drill plan this log works against */
  drillPlanId?: string;
  /** Plan logs are per driller per DAY — this is that day (ISO date) */
  date?: string;
  /** Equipment id of the rig, when picked */
  drillRigEquipmentId?: string;
  status: 'open' | 'complete' | 'accepted';
  // Header — prefilled from the shot's design plan
  holeDiameter: number;
  burden: number;
  spacing: number;
  faceHeight: number;
  gps: string;
  locationNote: string;
  drillerUserId: string;
  drillerName: string;
  signatureImage: Blob | null;
  completedAt?: string;
  acceptedBy?: string;
  acceptedAt?: string;
  // Dispatch: set when the blaster sent this log to a driller (vs self-started)
  assignedBy?: string;
  assignedAt?: string;
  // Handoff notes: driller → blaster at complete; blaster → driller at reopen
  completionNote?: string;
  reopenNote?: string;
}

export interface DrillLogHole extends BaseRecord {
  drillLogId: string;
  date: string; // ISO date drilled
  holeNumber: string; // free-form: "12" or station "A-3"
  angle: number;
  actualDepth: number;
  subdrill: number;
  conditions: HoleCondition[];
  comment: string;
  // Snapshot of the blaster's plan at entry time (plan-vs-actual review
  // stays truthful even if the plan is edited later)
  plannedDepth?: number;
  plannedAngle?: number;
  plannedKick?: number;
  plannedKickDir?: KickDirection;
}

// ══════════════════════════════════════════════════════
// ROCK DRILL CHECKLIST + REPAIR TICKETS (shop queue)
// ══════════════════════════════════════════════════════

export const DRILL_DAILY_CHECKS = [
  'Engine Oil', 'Compressor Oil', 'Hydraulic Oil', 'Anti-Freeze', 'Fuel',
  'Oil Leaks', 'Hoses (while drilling)', 'Hoses on Rollers', 'Grease Machine',
  'Blow Out Coolers', 'Gauges', 'Horn', 'Lubricator', 'Backup Alarm',
  'Emergency Stop',
] as const;

export const DRILL_WEEKLY_CHECKS = [
  'Blow Out Engine Air Filters', 'Blow Out Compressor Air Filters',
  'Blow Out Dust Collector Air Filters', 'Fire Extinguishers', 'Grease Rollers',
] as const;

/** ok = checked good · na = not applicable · skip = not done */
export type CheckState = 'ok' | 'na' | 'skip';

export interface DrillChecklist extends BaseRecord {
  equipmentId: string;
  jobId?: string;
  date: string; // ISO date
  startingHours: number | null;
  daily: Record<string, CheckState>;
  weeklyDone: boolean;
  weekly: Record<string, CheckState>;
  repairsNote: string;
  /** Driller's call: rig unusable — flips the asset to in_shop */
  outOfService: boolean;
  drillerUserId: string;
  drillerName: string;
  signatureImage: Blob | null;
}

export interface RepairTicket extends BaseRecord {
  equipmentId: string;
  sourceType: 'drill_checklist' | 'manual';
  sourceId?: string;
  description: string;
  outOfService: boolean;
  status: 'open' | 'resolved';
  openedByName: string;
  openedByUserId?: string;
  resolvedByName?: string;
  resolvedByUserId?: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

// ══════════════════════════════════════════════════════
// INCIDENTS — blasting damage claims, utility strikes, asset accidents.
// Filed in the field (offline-capable); office processes the claim.
// ══════════════════════════════════════════════════════

export type IncidentType = 'blasting' | 'utility' | 'asset';
export type IncidentStatus = 'open' | 'office_review' | 'closed';

export interface Incident extends BaseRecord {
  type: IncidentType;
  status: IncidentStatus;
  jobId?: string;
  date: string; // ISO date of incident
  time: string;
  description: string;
  reportedByName: string;
  /** Login of the reporter — id-based person matching (names drift) */
  reportedByUserId?: string;
  // Blasting section
  blastDayId?: string;
  shotId?: string;
  seismoReadingId?: string;
  structureType?: string;
  structureAddress?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerAddress?: string;
  preBlastSurvey?: 'completed' | 'refused' | 'none';
  ppv?: number | null;
  db?: number | null;
  // Asset section
  equipmentId?: string;
  assetIncidentKind?: 'equipment_accident' | 'auto_accident' | 'theft' | 'vandalism' | 'other';
  policeCalled?: boolean;
  otherParty?: string;
  // Utility section
  utilityProvider?: string;
  digsafeNumber?: string;
  utilityMarked?: 'marked' | 'mismarked' | 'unmarked';
  utilityKind?: 'underground_wire' | 'overhead_wire' | 'pipe' | 'other';
  // Office claim section
  claimReceivedAt?: string;
  claimStatus?: 'pending' | 'accepted' | 'denied';
  claimAmount?: number | null;
  insuranceSubmittedAt?: string;
  responseSentAt?: string;
  officeNotes?: string;
}

/** Single doc per company (id: companySettings-singleton), admin-managed */
export interface CompanySettings extends BaseRecord {
  companyName: string;
  dealerNumber: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  /** Office routing (who to call for scope changes / equipment / incidents) */
  officeContacts?: { id: string; label: string; name: string; phone: string }[];
  /** Company-defined attachment types, merged into the built-in picker */
  attachmentTypes?: string[];
}

/** Explosive manufacturer — first-class, admin-managed (id: mfr-<slug>) */
export interface Manufacturer extends BaseRecord {
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ProductCatalogItem extends BaseRecord {
  /** Links to a Manufacturer record; legacy rows may only have the name */
  manufacturerId?: string;
  manufacturer: string;
  productName: string;
  fullDescription: string;
  category: ProductCategory;
  weightMultiplier: number; // lbs per unit
  unitType: string; // stick, bag, each, LF
  sizeDescription: string;
  unitsPerCase: number | null;
  isActive: boolean;
  sortOrder: number;
}

// ══════════════════════════════════════════════════════
// ATTACHMENTS (polymorphic)
// ══════════════════════════════════════════════════════

export interface Attachment extends BaseRecord {
  parentId: string;
  parentType: 'seismo_reading' | 'shot' | 'blast_day' | 'blast_log' | 'daily_report' | 'drill_log';
  fileName: string;
  mimeType: string;
  /**
   * LEGACY inline binary only. New attachments carry NULL here — the binary
   * lives in R2 (metadata + checksum sync; blob fetched on demand) or, for
   * full-length videos, in the capturing device's local media store.
   * (Empty blobs revive as null through the sync payload round-trip.)
   */
  data: Blob | null;
  /** Built-in kind slug or a company-defined custom label; undefined = other */
  kind?: string;
  /** Original binary size in bytes */
  size?: number;
  /** Video duration in seconds (null = unknown, e.g. MediaRecorder output) */
  duration?: number | null;
  /** Shot-video clip marks (seconds) — the blaster's in/out selection */
  clipStart?: number;
  clipEnd?: number;
  /** Tiny inline JPEG data URL for instant offline previews (≤ ~15KB) */
  thumb?: string;
  /** SHA-256 of the binary — tamper-evidence for the audit chain */
  sha256?: string;
  /** R2 object key once uploaded */
  storageKey?: string;
  /** 'device' = binary only on the origin device · 'stored' = in R2 */
  storageStatus?: 'device' | 'stored';
  /** Who captured it (whose device holds a device-only binary) */
  originName?: string;
  /** For extracted clips: the full-video attachment this was cut from */
  sourceAttachmentId?: string;
}

// ══════════════════════════════════════════════════════
// SUBMISSIONS — the office's permanent record book
// ══════════════════════════════════════════════════════

export type SubmissionType =
  | 'blast_log'
  | 'daily_report'
  | 'drill_log'
  | 'drill_checklist'
  | 'incident';

/** A frozen attachment copy filed alongside the PDF (archival size) */
export interface SubmissionAsset {
  id: string; // original attachment id
  fileName: string;
  mimeType: string;
  /** LEGACY inline copy only — new filings carry null (binary in R2) */
  data: Blob | null;
  /** SHA-256 of the frozen copy — content immutability proof */
  sha256?: string;
  size?: number;
}

/**
 * Point-in-time office copy of a filed document: the filled-out PDF plus
 * frozen attachment copies, exactly as they were at submit time. WRITE-ONCE:
 * the server discards any re-PUT of an existing submission id; corrections
 * are new submissions with a bumped `version` (v1, v2, … all kept forever).
 */
export interface Submission extends BaseRecord {
  type: SubmissionType;
  /** Live record this snapshots (blastLog/dailyReport/drillLog/checklist/incident id) */
  sourceId: string;
  blastDayId?: string;
  jobId?: string;
  /** Hierarchy stamps (denormalized at file time, like jobId) */
  customerId?: string;
  siteId?: string;
  version: number;
  title: string;
  date: string; // the document's date (work day / checklist / incident date)
  submittedBy: string;
  submittedByUserId: string;
  /** LEGACY inline PDF only — new filings carry null (binary in R2) */
  pdf: Blob | null;
  /** SHA-256 + size of the filed PDF — the archive's integrity anchor */
  pdfSha256?: string;
  pdfSize?: number;
  assets: SubmissionAsset[];
  /**
   * Binary residence. The DOCUMENT is immutable from filing; the only
   * permitted post-file change (server-enforced) is the storage pointer
   * flip below when the uploader lands binaries in R2.
   */
  storageStatus?: 'device' | 'stored';
  pdfKey?: string;
  /** asset id → R2 key, written by the uploader */
  assetKeys?: Record<string, string>;
  /** Display facts for lists (holes, lbs, shots …) + skippedVideos refs */
  meta?: Record<string, unknown>;
}

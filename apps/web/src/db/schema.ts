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

export interface Job extends BaseRecord {
  name: string;
  customer: string;
  address: string;
  city: string;
  state: string; // 2-letter
  operation: 'construction' | 'quarry' | 'trench' | 'open';
  typeOfRock: string;
  typeOfTerrain: string;
  defaultHazards: string;
  defaultPrecautions: string;
  kFactor: number;
  kFactorHistory: KFactorHistoryEntry[];
  isActive: boolean;
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

export interface BlastDay extends BaseRecord {
  date: string; // ISO date
  jobId: string;
  status: 'draft' | 'submitted' | 'approved';
  conditions: BlastDayConditions;
  typeOfWork: 'drill_only' | 'drill_to_blast' | 'blasting' | 'crushing';
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
}

export interface Equipment extends BaseRecord {
  assetNumber: string;
  description: string;
  category: 'vehicle' | 'equip_drill' | 'mats_seismo';
  isActive: boolean;
}

// ══════════════════════════════════════════════════════
// PRODUCT CATALOG (Addendum 1 §A2)
// ══════════════════════════════════════════════════════

export type ProductCategory =
  | 'bulk'
  | 'anfo'
  | 'anfo_wr'
  | 'gel_dynamite'
  | 'emulsion'
  | 'booster'
  | 'booster_electronic'
  | 'cartridge';

export interface ProductCatalogItem extends BaseRecord {
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
  parentType: 'seismo_reading' | 'shot' | 'blast_day' | 'blast_log' | 'daily_report';
  fileName: string;
  mimeType: string;
  data: Blob;
}

export {
  scaledDistance,
  predictedPPV,
  derivedKFactor,
  maxChargeWeight,
  minSafeDistance,
  usbmRI8507Limit,
  osmPPVLimit,
  checkCompliance,
  osmSDThreshold,
  totalSqFt,
  avgDrillDepth,
  cubicYardsPerFoot,
  totalYardsShot,
  powderFactor,
  powderFactorAssessment,
  poundsPerFoot,
  kilogramsPerMeter,
  chargeWeight,
  finalWaterHeight,
  cartridgesToClearWater,
  totalPoundsShot,
  parseTimeToMinutes,
  straightTime,
  equipmentHoursUsed,
  conversions,
} from './calculations.js';

export type { ComplianceStatus, StructureType } from './calculations.js';

export { distributeByHoles } from './distribution.js';
export type { ShotHoleCount, DistributionResult } from './distribution.js';

export {
  DELAY_WINDOW_MS,
  computeFiringTimes,
  delayWindowSizes,
  maxHolesPerWindow,
} from './timing.js';
export type { TimingPlan, TimingWire } from './timing.js';

export { parseInstantelPrintout, dominantFrequency } from './instantel.js';
export type { InstantelReading } from './instantel.js';

export { PRODUCT_CATALOG_SEED, buildProductCatalogSeed } from './productCatalogSeed.js';
export type { SeedProduct, SeedCatalogDoc } from './productCatalogSeed.js';

export {
  ROLES,
  TABLE_PERMISSIONS,
  BLAST_DAY_STATUS_TRANSITIONS,
  PARENT_CHAIN,
  APPROVAL_LOCKED_TABLES,
  canPerformOp,
  canTransitionStatus,
  canEditApproved,
} from './permissions.js';
export type { Role, WriteOp, BlastDayStatus } from './permissions.js';

export {
  scaledDistance,
  predictedPPV,
  derivedKFactor,
  fitKFactor,
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

export type { ComplianceStatus, StructureType, KFit } from './calculations.js';

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

export { PRODUCT_CATALOG_SEED, buildProductCatalogSeed, slugify } from './productCatalogSeed.js';
export type { SeedProduct, SeedCatalogDoc } from './productCatalogSeed.js';

export { diffPayloads } from './auditDiff.js';
export type { AuditChange } from './auditDiff.js';

export { KICK_DIRECTIONS, deriveDrillAngle, deriveHoleLength } from './drillGeometry.js';
export type { KickDirection } from './drillGeometry.js';

export {
  ROLES,
  TABLE_PERMISSIONS,
  BLAST_DAY_STATUS_TRANSITIONS,
  DRILL_LOG_STATUS_TRANSITIONS,
  PARENT_CHAIN,
  APPROVAL_LOCKED_TABLES,
  LOCKED_DAY_STATUSES,
  LIFECYCLE_CHILDREN,
  NEVER_USED_DELETE_TABLES,
  canPerformOp,
  canTransitionStatus,
  canTransitionDrillLog,
  canTransitionRecordStatus,
  STATUS_GUARDED_TABLES,
  canEditApproved,
  canEditAcceptedDrillLog,
} from './permissions.js';
export type { Role, WriteOp, BlastDayStatus, DrillLogStatus } from './permissions.js';
export {
  CAPABILITIES,
  CAPABILITY_KEYS,
  BUILT_IN_ROLES,
  BUILT_IN_ROLE_KEYS,
  buildRoleDefsLookup,
  capabilitiesFor,
  hasCapability,
  roleDefinitionFor,
  homeDashboardFor,
  canPerformOpAs,
  canTransitionStatusAs,
  canTransitionDrillLogAs,
  canTransitionRecordStatusAs,
  canEditApprovedAs,
  canEditAcceptedDrillLogAs,
  isValidRoleKey,
} from './capabilities.js';
export type {
  CapabilityDef,
  CapabilityGroup,
  HomeDashboard,
  RoleDefinitionData,
  RoleDefsLookup,
} from './capabilities.js';

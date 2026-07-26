// Role-based permission matrix — the single source of truth for who may
// write what. Imported by BOTH sides:
//   - apps/server: authoritative enforcement (REST admin routes + the
//     /powersync/upload backstop)
//   - apps/web: mirrors the matrix to hide controls the user can't use
//
// Extension rule: when a new record type ships (drill logs, maintenance
// records, ...), add ONE row here and the enforcement paths pick it up.
// Unknown tables are DENIED for everyone by design.
//
// NOTE: role-to-role workflow interactions (Blaster↔Driller handoffs etc.)
// are pending product input — keep transitions/table rules data-driven so
// those land as matrix edits, not redesigns.

export const ROLES = ['admin', 'supervisor', 'blaster', 'driller', 'mechanic', 'office'] as const;
export type Role = (typeof ROLES)[number];

export type WriteOp = 'PUT' | 'PATCH' | 'DELETE';

interface TableRule {
  PUT: readonly Role[];
  PATCH: readonly Role[];
  DELETE: readonly Role[];
}

const ADMIN_ONLY: readonly Role[] = ['admin'];
const REGISTRY: readonly Role[] = ['admin', 'supervisor'];
const EQUIPMENT_REGISTRY: readonly Role[] = ['admin', 'supervisor', 'mechanic'];
const BLAST_FAMILY: readonly Role[] = ['admin', 'supervisor', 'blaster'];
const REPORT_FAMILY: readonly Role[] = ['admin', 'supervisor', 'blaster', 'driller'];
const EQUIPMENT_ENTRIES: readonly Role[] = ['admin', 'supervisor', 'blaster', 'driller', 'mechanic'];

const uniform = (roles: readonly Role[]): TableRule => ({ PUT: roles, PATCH: roles, DELETE: roles });

/**
 * Which roles may perform each write op, per synced table.
 * `office` is read-only everywhere: sync still delivers all company data
 * for viewing/reporting, but every write is denied.
 */
export const TABLE_PERMISSIONS: Record<string, TableRule> = {
  // Admin-managed reference data
  productCatalog: uniform(ADMIN_ONLY),
  manufacturers: uniform(ADMIN_ONLY),
  jobs: uniform(ADMIN_ONLY),
  companySettings: uniform(ADMIN_ONLY),

  // Registries
  crewMembers: uniform(REGISTRY),
  equipment: uniform(EQUIPMENT_REGISTRY),

  // Work days are the root of EVERY field day (drill-only, crushing,
  // hauling included) — drillers create and edit them too. The blasting
  // LOG and its children stay blaster-and-up.
  blastDays: { PUT: REPORT_FAMILY, PATCH: REPORT_FAMILY, DELETE: REGISTRY },
  blastLogs: uniform(BLAST_FAMILY),
  shots: uniform(BLAST_FAMILY),
  seismoReadings: uniform(BLAST_FAMILY),
  explosiveUsages: uniform(BLAST_FAMILY),
  typicalColumns: uniform(BLAST_FAMILY),
  attachments: uniform(BLAST_FAMILY),

  // Drill logs — the Driller→Blaster handoff (N signed logs per shot)
  drillLogs: { PUT: REPORT_FAMILY, PATCH: REPORT_FAMILY, DELETE: REGISTRY },
  drillLogHoles: uniform(REPORT_FAMILY),

  // Daily-report family (operations records) — drillers work here too
  dailyReports: uniform(REPORT_FAMILY),
  workForceEntries: uniform(REPORT_FAMILY),
  equipmentEntries: uniform(EQUIPMENT_ENTRIES),
  materialEntries: uniform(REPORT_FAMILY),
  subcontractorEntries: uniform(REPORT_FAMILY),

  // Legacy local profile table — field-writable until deprecated
  blasterProfiles: uniform(BLAST_FAMILY),
};

export function canPerformOp(tableName: string, op: WriteOp, role: Role): boolean {
  const rule = TABLE_PERMISSIONS[tableName];
  if (!rule) return false; // unknown table → deny all
  return rule[op].includes(role);
}

// ── Blast day status workflow ──────────────────────────────────────────────

export type BlastDayStatus = 'draft' | 'submitted' | 'approved';

/** from → to → roles allowed to make that transition */
export const BLAST_DAY_STATUS_TRANSITIONS: Record<string, Record<string, readonly Role[]>> = {
  draft: {
    submitted: ['admin', 'supervisor', 'blaster', 'driller'], // drillers submit drill-only days
  },
  submitted: {
    draft: ['admin', 'supervisor', 'blaster', 'driller'], // withdraw / send back
    approved: ['admin', 'supervisor'],
  },
  approved: {
    submitted: ['admin', 'supervisor'], // reopen
  },
};

export function canTransitionStatus(from: string, to: string, role: Role): boolean {
  if (from === to) return true; // not a transition
  return (BLAST_DAY_STATUS_TRANSITIONS[from]?.[to] ?? []).includes(role);
}

// ── Drill log workflow ─────────────────────────────────────────────────────

export type DrillLogStatus = 'open' | 'complete' | 'accepted';

/** from → to → roles. Complete = driller signs off; accepted = blaster
 *  takes the pattern for loading (locks hole rows against driller edits). */
export const DRILL_LOG_STATUS_TRANSITIONS: Record<string, Record<string, readonly Role[]>> = {
  open: {
    complete: ['admin', 'supervisor', 'blaster', 'driller'],
  },
  complete: {
    open: ['admin', 'supervisor', 'blaster', 'driller'], // reopen for fixes
    accepted: ['admin', 'supervisor', 'blaster'],
  },
  accepted: {
    complete: ['admin', 'supervisor', 'blaster'], // un-accept
  },
};

export function canTransitionDrillLog(from: string, to: string, role: Role): boolean {
  if (from === to) return true;
  return (DRILL_LOG_STATUS_TRANSITIONS[from]?.[to] ?? []).includes(role);
}

/** Roles that may still edit holes under an ACCEPTED drill log */
export function canEditAcceptedDrillLog(role: Role): boolean {
  return role === 'admin' || role === 'supervisor' || role === 'blaster';
}

// ── Approval lock ──────────────────────────────────────────────────────────

/**
 * Tables locked (for non-supervisor/admin) once their parent blastDay is
 * approved, with the payload field that points one step up the parent
 * chain. The server follows the chain to a blastDayId:
 *   blastLogs.blastDayId → blastDays
 *   shots.blastLogId → blastLogs.blastDayId
 *   seismoReadings.shotId → shots.blastLogId → blastLogs.blastDayId
 *   ...
 */
export const PARENT_CHAIN: Record<string, { parentIdField: string; parentTable: string }> = {
  blastLogs: { parentIdField: 'blastDayId', parentTable: 'blastDays' },
  dailyReports: { parentIdField: 'blastDayId', parentTable: 'blastDays' },
  drillLogs: { parentIdField: 'blastDayId', parentTable: 'blastDays' },
  drillLogHoles: { parentIdField: 'drillLogId', parentTable: 'drillLogs' },
  shots: { parentIdField: 'blastLogId', parentTable: 'blastLogs' },
  explosiveUsages: { parentIdField: 'blastLogId', parentTable: 'blastLogs' },
  seismoReadings: { parentIdField: 'shotId', parentTable: 'shots' },
  typicalColumns: { parentIdField: 'shotId', parentTable: 'shots' },
  workForceEntries: { parentIdField: 'dailyReportId', parentTable: 'dailyReports' },
  equipmentEntries: { parentIdField: 'dailyReportId', parentTable: 'dailyReports' },
  materialEntries: { parentIdField: 'dailyReportId', parentTable: 'dailyReports' },
  subcontractorEntries: { parentIdField: 'dailyReportId', parentTable: 'dailyReports' },
};

/** Tables whose writes are frozen while the owning blastDay is approved. */
export const APPROVAL_LOCKED_TABLES: ReadonlySet<string> = new Set(Object.keys(PARENT_CHAIN));

/** Roles that may edit records under an APPROVED blast day. */
export function canEditApproved(role: Role): boolean {
  return role === 'admin' || role === 'supervisor';
}

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
  // Customer → Site → Job hierarchy: reference data, office-managed
  customers: uniform(ADMIN_ONLY),
  sites: uniform(ADMIN_ONLY),
  companySettings: uniform(ADMIN_ONLY),

  // Registries. Equipment PATCH is open to field roles on purpose: hour
  // meters and in/out-of-service status come from the people running the
  // machines (asset identity is guarded by PUT/DELETE staying registry-level).
  crewMembers: uniform(REGISTRY),
  equipment: { PUT: EQUIPMENT_REGISTRY, PATCH: EQUIPMENT_ENTRIES, DELETE: EQUIPMENT_REGISTRY },

  // Work days are the root of EVERY field day (drill-only, crushing,
  // hauling included) — drillers create and edit them too. The blasting
  // LOG and its children stay blaster-and-up.
  blastDays: { PUT: REPORT_FAMILY, PATCH: REPORT_FAMILY, DELETE: REGISTRY },
  blastLogs: uniform(BLAST_FAMILY),
  shots: uniform(BLAST_FAMILY),
  seismoReadings: uniform(BLAST_FAMILY),
  explosiveUsages: uniform(BLAST_FAMILY),
  typicalColumns: uniform(BLAST_FAMILY),
  // Drillers photograph their work too (drill-log conditions, rig issues)
  attachments: uniform(REPORT_FAMILY),

  // Drill logs — the Driller→Blaster handoff (N signed logs per shot)
  drillLogs: { PUT: REPORT_FAMILY, PATCH: REPORT_FAMILY, DELETE: REGISTRY },
  // Standalone drill plans: authored by the blast side; drillers read the
  // plan and write only their own drillLogs/holes against it
  drillPlans: { PUT: BLAST_FAMILY, PATCH: BLAST_FAMILY, DELETE: REGISTRY },
  drillLogHoles: uniform(REPORT_FAMILY),

  // Rig checklists + the shop's repair queue: field roles file, mechanics
  // resolve — everyone in the loop can write (defect visibility is the fix
  // for broken drills getting dispatched)
  drillChecklists: uniform(EQUIPMENT_ENTRIES),
  repairTickets: { PUT: EQUIPMENT_ENTRIES, PATCH: EQUIPMENT_ENTRIES, DELETE: REGISTRY },

  // Daily-report family (operations records) — drillers work here too
  dailyReports: uniform(REPORT_FAMILY),
  workForceEntries: uniform(REPORT_FAMILY),
  equipmentEntries: uniform(EQUIPMENT_ENTRIES),
  materialEntries: uniform(REPORT_FAMILY),
  subcontractorEntries: uniform(REPORT_FAMILY),

  // Incidents: any field role files them (blasting incidents in practice
  // come from the blaster in charge); OFFICE processes claims — its first
  // and only write grant
  incidents: {
    PUT: EQUIPMENT_ENTRIES,
    PATCH: [...EQUIPMENT_ENTRIES, 'office'],
    DELETE: REGISTRY,
  },

  // Point-in-time office copies (filed PDFs + frozen assets). Every field
  // role files them; NOBODY edits — write-once (the server additionally
  // discards re-PUTs of an existing submission id). Delete is admin-only.
  submissions: { PUT: EQUIPMENT_ENTRIES, PATCH: ADMIN_ONLY, DELETE: ADMIN_ONLY },

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
    // Submitting FILES the office copy, so unlocking is supervisory —
    // field roles fix-and-resubmit as a new version after an unlock
    draft: ['admin', 'supervisor'],
    approved: ['admin', 'supervisor'],
  },
  approved: {
    submitted: ['admin', 'supervisor'], // reopen
  },
};

/** Blast-day statuses whose child records are frozen for field roles
 *  (filed with the office and/or approved) */
export const LOCKED_DAY_STATUSES: ReadonlySet<string> = new Set(['submitted', 'approved']);

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

// The CAPABILITY layer over the permission matrix — Matthew's call
// (screen-redesign round): roles stop being hard-coded and become editable
// bundles of human-named capabilities.
//
// How it fits together:
//   - permissions.ts stays the op-level ground truth for the SIX BUILT-IN
//     roles (and the registry of known tables — unknown tables deny all).
//   - Each capability below expands to table-write grants and/or workflow
//     rights. The built-in bundles expand to EXACTLY the legacy matrix —
//     capabilities.test.ts proves it op-for-op.
//   - A `roleDefinitions` record (synced, admin-written) OVERRIDES a role's
//     bundle: absence of records = stock behavior, so nothing migrates.
//   - 'admin' is PROTECTED: always every capability, no record can change
//     it, and the server discards attempts to write one.
//
// Enforcement paths call the *As variants with the company's role
// definitions; built-in fallback keeps old behavior when none exist.

import type { Role, WriteOp } from './permissions.js';
import { TABLE_PERMISSIONS } from './permissions.js';

// ── Capability registry ────────────────────────────────────────────────────

export type CapabilityGroup = 'records' | 'workflow' | 'management';

export interface CapabilityDef {
  key: string;
  label: string;
  description: string;
  group: CapabilityGroup;
  /** table → write ops this capability grants */
  tableGrants?: Record<string, readonly WriteOp[]>;
}

const REPORT_TABLES_RW: Record<string, readonly WriteOp[]> = {
  blastDays: ['PUT', 'PATCH'],
  dailyReports: ['PUT', 'PATCH', 'DELETE'],
  workForceEntries: ['PUT', 'PATCH', 'DELETE'],
  materialEntries: ['PUT', 'PATCH', 'DELETE'],
  subcontractorEntries: ['PUT', 'PATCH', 'DELETE'],
  attachments: ['PUT', 'PATCH', 'DELETE'],
  drillLogs: ['PUT', 'PATCH'],
  drillLogHoles: ['PUT', 'PATCH', 'DELETE'],
};

export const CAPABILITIES: readonly CapabilityDef[] = [
  // ── records ──
  {
    key: 'author_field_reports',
    label: 'Work days & field reports',
    description:
      'Create and edit work days, daily reports (crew, equipment hours, materials, subs), drill logs, and photos.',
    group: 'records',
    tableGrants: REPORT_TABLES_RW,
  },
  {
    key: 'author_blast_records',
    label: 'Blasting logs & shots',
    description:
      'Author blasting logs, shots, seismo readings, explosive usage, and drill plans. Blaster-licensed work — sign-offs stay tied to the licensed person.',
    group: 'records',
    tableGrants: {
      blastLogs: ['PUT', 'PATCH', 'DELETE'],
      shots: ['PUT', 'PATCH', 'DELETE'],
      seismoReadings: ['PUT', 'PATCH', 'DELETE'],
      explosiveUsages: ['PUT', 'PATCH', 'DELETE'],
      typicalColumns: ['PUT', 'PATCH', 'DELETE'],
      blasterProfiles: ['PUT', 'PATCH', 'DELETE'],
      drillPlans: ['PUT', 'PATCH'],
    },
  },
  {
    key: 'log_equipment',
    label: 'Equipment hours & checklists',
    description:
      'Update machine hour meters and in/out-of-service status, file rig checklists, and open repair tickets.',
    group: 'records',
    tableGrants: {
      equipment: ['PATCH'],
      equipmentEntries: ['PUT', 'PATCH', 'DELETE'],
      drillChecklists: ['PUT', 'PATCH', 'DELETE'],
      repairTickets: ['PUT', 'PATCH'],
    },
  },
  {
    key: 'file_incidents',
    label: 'File incidents',
    description: 'Report and edit incident records from the field.',
    group: 'records',
    tableGrants: { incidents: ['PUT', 'PATCH'] },
  },
  {
    key: 'file_time_cards',
    label: 'File time cards',
    description:
      'File your own daily time card (hours, signature). Entering a card for a roster person without a login is allowed and attributed.',
    group: 'records',
    tableGrants: { timeCards: ['PUT', 'PATCH', 'DELETE'] },
  },
  {
    key: 'correct_hours',
    label: 'Correct hour meters',
    description:
      "Enter an authoritative hour-meter correction when the physical meter disagrees with the app. Corrections are append-only — both values are kept.",
    group: 'records',
    tableGrants: { hourCorrections: ['PUT'] },
  },
  {
    key: 'file_office_copies',
    label: 'File office copies',
    description: 'Submit the frozen PDF office copies of completed documents.',
    group: 'records',
    tableGrants: { submissions: ['PUT'] },
  },
  {
    key: 'delete_field_records',
    label: 'Delete field records',
    description: 'Delete work days, drill logs, drill plans, repair tickets, and incidents.',
    group: 'records',
    tableGrants: {
      blastDays: ['DELETE'],
      drillLogs: ['DELETE'],
      drillPlans: ['DELETE'],
      repairTickets: ['DELETE'],
      incidents: ['DELETE'],
    },
  },
  // ── workflow ──
  {
    key: 'submit_days',
    label: 'Submit work days',
    description: 'Send a finished work day to the office (files the office copy).',
    group: 'workflow',
  },
  {
    key: 'approve_days',
    label: 'Approve & unlock work days',
    description:
      'Approve submitted days and filed time cards, send them back for fixes, reopen approved ones, and edit locked records.',
    group: 'workflow',
  },
  {
    key: 'complete_drill_logs',
    label: 'Complete drill logs',
    description: 'Sign a drill log complete (and reopen one for fixes).',
    group: 'workflow',
  },
  {
    key: 'accept_drill_patterns',
    label: 'Accept drill patterns',
    description:
      'Take a completed drill pattern for loading — locks hole rows against further driller edits.',
    group: 'workflow',
  },
  {
    key: 'complete_drill_plans',
    label: 'Complete drill plans',
    description: 'Mark a standalone drill plan complete, or reopen it.',
    group: 'workflow',
  },
  {
    key: 'resolve_repairs',
    label: 'Resolve repair tickets',
    description: 'Sign a broken machine back to life (and reopen resolved tickets).',
    group: 'workflow',
  },
  {
    key: 'retire_equipment',
    label: 'Retire equipment',
    description: 'Retire an asset from the fleet, or bring one back.',
    group: 'workflow',
  },
  {
    key: 'process_incidents',
    label: 'Process incident claims',
    description: 'Work incident claims and close them (an office decision).',
    group: 'workflow',
    tableGrants: { incidents: ['PATCH'] },
  },
  // ── management ──
  {
    key: 'manage_people',
    label: 'Manage people',
    description: 'Add and edit the people roster (logins stay admin-only).',
    group: 'management',
    tableGrants: { crewMembers: ['PUT', 'PATCH', 'DELETE'] },
  },
  {
    key: 'manage_equipment',
    label: 'Manage the fleet',
    description: 'Add and remove equipment (identity — hour logging is separate).',
    group: 'management',
    tableGrants: { equipment: ['PUT', 'DELETE'] },
  },
  {
    key: 'setup_jobs',
    label: 'Set up customers, sites & jobs',
    description:
      'Create and edit customers, sites, and jobs — the small-job field setup. Archiving and deleting stay supervisory.',
    group: 'management',
    tableGrants: {
      jobs: ['PUT', 'PATCH'],
      customers: ['PUT', 'PATCH'],
      sites: ['PUT', 'PATCH'],
    },
  },
  {
    key: 'manage_jobs',
    label: 'Manage jobs & customers',
    description: 'Create, edit, archive, and delete customers, sites, and jobs.',
    group: 'management',
    tableGrants: {
      jobs: ['PUT', 'PATCH', 'DELETE'],
      customers: ['PUT', 'PATCH', 'DELETE'],
      sites: ['PUT', 'PATCH', 'DELETE'],
    },
  },
  {
    key: 'manage_company',
    label: 'Company setup & catalog',
    description: 'Edit company details and the explosive product catalog.',
    group: 'management',
    tableGrants: {
      companySettings: ['PUT', 'PATCH', 'DELETE'],
      productCatalog: ['PUT', 'PATCH', 'DELETE'],
      manufacturers: ['PUT', 'PATCH', 'DELETE'],
    },
  },
  {
    key: 'view_admin_area',
    label: 'Open the Admin area',
    description: 'See the Admin section (what shows inside follows the other capabilities).',
    group: 'management',
  },
] as const;

export const CAPABILITY_KEYS: ReadonlySet<string> = new Set(CAPABILITIES.map((c) => c.key));

/** (table → op → capabilities that grant it) — built once */
const GRANT_INDEX: Record<string, Record<WriteOp, string[]>> = {};
for (const cap of CAPABILITIES) {
  for (const [table, ops] of Object.entries(cap.tableGrants ?? {})) {
    const row = (GRANT_INDEX[table] ??= { PUT: [], PATCH: [], DELETE: [] });
    for (const op of ops) row[op].push(cap.key);
  }
}

// ── Built-in role bundles (expand EXACTLY to the legacy matrix) ────────────

export type HomeDashboard = 'field' | 'driller' | 'mechanic' | 'office';

export interface RoleDefinitionData {
  key: string;
  name: string;
  capabilities: readonly string[];
  homeDashboard: HomeDashboard;
}

export const BUILT_IN_ROLES: readonly RoleDefinitionData[] = [
  {
    key: 'admin',
    name: 'Admin',
    capabilities: CAPABILITIES.map((c) => c.key), // display only — admin is ALL by code
    homeDashboard: 'office',
  },
  {
    key: 'supervisor',
    name: 'Supervisor',
    capabilities: [
      'author_field_reports', 'author_blast_records', 'log_equipment', 'file_incidents',
      'file_time_cards', 'correct_hours', 'file_office_copies', 'delete_field_records',
      'submit_days', 'approve_days',
      'complete_drill_logs', 'accept_drill_patterns', 'complete_drill_plans',
      'resolve_repairs', 'retire_equipment', 'manage_people', 'manage_equipment',
      'view_admin_area',
    ],
    homeDashboard: 'field',
  },
  {
    key: 'blaster',
    name: 'Blaster',
    capabilities: [
      'author_field_reports', 'author_blast_records', 'log_equipment', 'file_incidents',
      'file_time_cards', 'file_office_copies', 'submit_days', 'complete_drill_logs',
      'accept_drill_patterns', 'complete_drill_plans', 'setup_jobs',
    ],
    homeDashboard: 'field',
  },
  {
    key: 'driller',
    name: 'Driller',
    capabilities: [
      'author_field_reports', 'log_equipment', 'file_incidents', 'file_time_cards',
      'file_office_copies', 'submit_days', 'complete_drill_logs',
    ],
    homeDashboard: 'driller',
  },
  {
    key: 'mechanic',
    name: 'Mechanic',
    capabilities: [
      'log_equipment', 'manage_equipment', 'file_incidents', 'file_time_cards',
      'correct_hours', 'file_office_copies', 'resolve_repairs', 'view_admin_area',
    ],
    homeDashboard: 'mechanic',
  },
  {
    key: 'office',
    name: 'Office',
    capabilities: ['process_incidents', 'view_admin_area'],
    homeDashboard: 'office',
  },
] as const;

export const BUILT_IN_ROLE_KEYS: ReadonlySet<string> = new Set(BUILT_IN_ROLES.map((r) => r.key));

// ── Resolution ─────────────────────────────────────────────────────────────

/** role key → definition, from the company's roleDefinitions records */
export type RoleDefsLookup = ReadonlyMap<string, RoleDefinitionData>;

export function buildRoleDefsLookup(
  payloads: readonly { key?: unknown; name?: unknown; capabilities?: unknown; homeDashboard?: unknown }[],
): Map<string, RoleDefinitionData> {
  const map = new Map<string, RoleDefinitionData>();
  for (const p of payloads) {
    if (typeof p?.key !== 'string' || !p.key || p.key === 'admin') continue; // admin protected
    const caps = Array.isArray(p.capabilities)
      ? p.capabilities.filter((c): c is string => typeof c === 'string' && CAPABILITY_KEYS.has(c))
      : [];
    const home = p.homeDashboard;
    map.set(p.key, {
      key: p.key,
      name: typeof p.name === 'string' && p.name ? p.name : p.key,
      capabilities: caps,
      homeDashboard:
        home === 'field' || home === 'driller' || home === 'mechanic' || home === 'office'
          ? home
          : 'field',
    });
  }
  return map;
}

const EMPTY: ReadonlySet<string> = new Set();
const CAP_CACHE = new Map<string, ReadonlySet<string>>();
for (const r of BUILT_IN_ROLES) CAP_CACHE.set(r.key, new Set(r.capabilities));

/** The role's capability set. Definitions override built-ins; 'admin' is
 *  always everything; unknown roles hold nothing. */
export function capabilitiesFor(role: string, defs?: RoleDefsLookup): ReadonlySet<string> {
  if (role === 'admin') return CAP_CACHE.get('admin')!;
  const def = defs?.get(role);
  if (def) return new Set(def.capabilities);
  return CAP_CACHE.get(role) ?? EMPTY;
}

export function hasCapability(role: string, cap: string, defs?: RoleDefsLookup): boolean {
  return role === 'admin' || capabilitiesFor(role, defs).has(cap);
}

export function roleDefinitionFor(role: string, defs?: RoleDefsLookup): RoleDefinitionData | undefined {
  if (role !== 'admin') {
    const def = defs?.get(role);
    if (def) return def;
  }
  return BUILT_IN_ROLES.find((r) => r.key === role);
}

export function homeDashboardFor(role: string, defs?: RoleDefsLookup): HomeDashboard {
  return roleDefinitionFor(role, defs)?.homeDashboard ?? 'field';
}

// ── Capability-aware permission checks (the *As variants) ──────────────────
// Same semantics as their permissions.ts counterparts for built-in roles
// with no definitions (proved in capabilities.test.ts); definitions and
// custom roles resolve through the capability expansion.

export function canPerformOpAs(
  tableName: string,
  op: WriteOp,
  role: string,
  defs?: RoleDefsLookup,
): boolean {
  if (!TABLE_PERMISSIONS[tableName]) return false; // unknown table → deny all
  if (role === 'admin') return true;
  // Grants no capability covers stay admin-only (submissions PATCH/DELETE,
  // roleDefinitions itself)
  const granting = GRANT_INDEX[tableName]?.[op];
  if (!granting || granting.length === 0) return false;
  const caps = capabilitiesFor(role, defs);
  return granting.some((c) => caps.has(c));
}

/** blast-day workflow: which capability each transition needs */
const DAY_TRANSITION_CAPS: Record<string, Record<string, string>> = {
  draft: { submitted: 'submit_days' },
  submitted: { draft: 'approve_days', approved: 'approve_days' },
  approved: { submitted: 'approve_days' },
};

export function canTransitionStatusAs(
  from: string,
  to: string,
  role: string,
  defs?: RoleDefsLookup,
): boolean {
  if (from === to) return true;
  const cap = DAY_TRANSITION_CAPS[from]?.[to];
  return cap !== undefined && hasCapability(role, cap, defs);
}

const DRILL_LOG_TRANSITION_CAPS: Record<string, Record<string, string>> = {
  open: { complete: 'complete_drill_logs' },
  complete: { open: 'complete_drill_logs', accepted: 'accept_drill_patterns' },
  accepted: { complete: 'accept_drill_patterns' },
};

export function canTransitionDrillLogAs(
  from: string,
  to: string,
  role: string,
  defs?: RoleDefsLookup,
): boolean {
  if (from === to) return true;
  const cap = DRILL_LOG_TRANSITION_CAPS[from]?.[to];
  return cap !== undefined && hasCapability(role, cap, defs);
}

/** Sensitive per-table status changes → required capability. Unlisted
 *  transitions stay open to whoever holds PATCH (mirrors permissions.ts). */
const SENSITIVE_TRANSITION_CAPS: Record<string, Record<string, Record<string, string>>> = {
  repairTickets: {
    open: { resolved: 'resolve_repairs' },
    resolved: { open: 'resolve_repairs' },
  },
  incidents: {
    open: { closed: 'process_incidents' },
    office_review: { closed: 'process_incidents' },
    closed: { open: 'process_incidents', office_review: 'process_incidents' },
  },
  equipment: {
    active: { retired: 'retire_equipment' },
    in_shop: { retired: 'retire_equipment' },
    retired: { active: 'retire_equipment', in_shop: 'retire_equipment' },
  },
  drillPlans: {
    open: { complete: 'complete_drill_plans' },
    complete: { open: 'complete_drill_plans' },
  },
  // Approving a time card (or pulling an approved one back) is the same
  // supervisory act as approving the day — one grant covers both
  timeCards: {
    draft: { approved: 'approve_days' },
    filed: { approved: 'approve_days' },
    approved: { filed: 'approve_days', draft: 'approve_days' },
  },
};

export function canTransitionRecordStatusAs(
  tableName: string,
  from: string,
  to: string,
  role: string,
  defs?: RoleDefsLookup,
): boolean {
  if (from === to) return true;
  const cap = SENSITIVE_TRANSITION_CAPS[tableName]?.[from]?.[to];
  return cap === undefined || hasCapability(role, cap, defs);
}

export function canEditApprovedAs(role: string, defs?: RoleDefsLookup): boolean {
  return hasCapability(role, 'approve_days', defs);
}

export function canEditAcceptedDrillLogAs(role: string, defs?: RoleDefsLookup): boolean {
  return hasCapability(role, 'accept_drill_patterns', defs);
}

/** Valid role keys = built-ins + this company's custom definitions */
export function isValidRoleKey(role: string, defs?: RoleDefsLookup): boolean {
  return BUILT_IN_ROLE_KEYS.has(role) || defs?.has(role) === true;
}

export type { Role };

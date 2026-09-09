// Client face of the capability layer. AppShell keeps a module-level cache
// of the company's role definitions (live-queried); `can`/`hasCap` resolve
// the session role through it synchronously so existing call sites keep
// their shape. The SERVER is authoritative — these only hide controls.
import {
  buildRoleDefsLookup,
  canEditAcceptedDrillLogAs,
  canEditApprovedAs,
  canPerformOpAs,
  canTransitionDrillLogAs,
  canTransitionStatusAs,
  hasCapability,
  homeDashboardFor,
  type HomeDashboard,
  type RoleDefsLookup,
  type WriteOp,
} from '@shotlog/shared';
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';

let cache: RoleDefsLookup = new Map();

export function roleDefs(): RoleDefsLookup {
  return cache;
}

/**
 * Keeps the module cache live. The cache is refreshed DURING render (not in
 * an effect) so gating computed in the same render pass — nav items, the
 * Admin-area redirect — sees the fresh definitions. Returns undefined while
 * the local DB is still hydrating: custom-role gates that would deny-and-
 * redirect must wait for that, or a fresh page load bounces valid users.
 */
export function useRoleDefsSync(): unknown[] | undefined {
  const rows = useLiveQuery(() => db.roleDefinitions.toArray());
  if (rows) cache = buildRoleDefsLookup(rows);
  return rows;
}

/** May the signed-in user perform this write? (capability-resolved) */
export function can(tableName: string, op: WriteOp): boolean {
  return canPerformOpAs(tableName, op, getSessionUser()?.role ?? '', cache);
}

/** Does the signed-in user hold this capability? */
export function hasCap(cap: string): boolean {
  return hasCapability(getSessionUser()?.role ?? '', cap, cache);
}

export function myHomeDashboard(): HomeDashboard {
  return homeDashboardFor(getSessionUser()?.role ?? '', cache);
}

const myRole = () => getSessionUser()?.role ?? '';

export function canDayTransition(from: string, to: string): boolean {
  return canTransitionStatusAs(from, to, myRole(), cache);
}

export function canDrillLogTransition(from: string, to: string): boolean {
  return canTransitionDrillLogAs(from, to, myRole(), cache);
}

export function canEditApprovedDay(): boolean {
  return canEditApprovedAs(myRole(), cache);
}

export function canEditAcceptedLog(): boolean {
  return canEditAcceptedDrillLogAs(myRole(), cache);
}

// ── S9a: say who CAN, when the signed-in role can't ──────────────────────
const ROLE_LABELS: Record<string, string> = {
  admin: 'admins', supervisor: 'supervisors', blaster: 'blasters', driller: 'drillers', mechanic: 'the shop', office: 'the office',
};

/** Built-in roles that may perform this write, as a readable list
 *  ("supervisors and admins") — for the one line under a read-only field. */
export function whoCanWrite(tableName: string, op: WriteOp): string {
  const roles = ['admin', 'supervisor', 'blaster', 'driller', 'mechanic', 'office'].filter((r) => canPerformOpAs(tableName, op, r, cache));
  const labels = roles.map((r) => ROLE_LABELS[r] ?? r);
  if (labels.length === 0) return 'nobody';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** "Office accounts can read this. Blasters and admins can change it." */
export function readOnlyLine(tableName: string, op: WriteOp = 'PATCH'): string {
  const role = myRole();
  const mine = role ? (ROLE_LABELS[role] ?? role) : 'this account';
  const who = whoCanWrite(tableName, op);
  return `${mine[0].toUpperCase()}${mine.slice(1)} can read this. ${who[0].toUpperCase()}${who.slice(1)} can change it.`;
}

export type { WriteOp };

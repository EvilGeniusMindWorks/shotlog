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

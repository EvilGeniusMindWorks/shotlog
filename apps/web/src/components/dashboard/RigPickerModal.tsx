// The "usual rig" — the account-level memory of the drill a driller runs
// (S7a: `equipment.assignedUserId`, which field roles may patch; the device
// key stays as the offline fallback and for non-driller roles).
//
// 2026-09-07 (Matthew): the rig is chosen ON the checklist form, so the
// picker modal that used to live here is gone. What remains is the memory,
// and it is written only by things that mean the rig was really used —
// filing a checklist, logging holes with a rig on the log, or the explicit
// Settings › Preferences choice. Browsing never writes it.
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { nowISO } from '@/lib/utils';

export const LAST_RIG_KEY = 'shotlog-last-rig';

/** Remember the rig: on the account for drillers, on the device always */
export async function rememberUsualRig(equipmentId: string): Promise<void> {
  try {
    localStorage.setItem(LAST_RIG_KEY, equipmentId);
  } catch {
    /* private mode */
  }
  const me = getSessionUser();
  if (!me || me.role !== 'driller') return;
  const now = nowISO();
  const mine = await db.equipment.filter((e) => e.assignedUserId === me.id && e.id !== equipmentId).toArray();
  for (const e of mine) await db.equipment.update(e.id, { assignedUserId: undefined, updatedAt: now });
  await db.equipment.update(equipmentId, { assignedUserId: me.id, updatedAt: now });
}

/** Drop the usual-operator link (Settings › Preferences) */
export async function forgetUsualRig(): Promise<void> {
  try {
    localStorage.removeItem(LAST_RIG_KEY);
  } catch {
    /* private mode */
  }
  const me = getSessionUser();
  if (!me) return;
  const now = nowISO();
  const mine = await db.equipment.filter((e) => e.assignedUserId === me.id).toArray();
  for (const e of mine) await db.equipment.update(e.id, { assignedUserId: undefined, updatedAt: now });
}

/** The account's usual rig (usual-operator link), else the device's last pick */
export function useUsualRigId(): string | undefined {
  const me = getSessionUser();
  const fromAccount = useLiveQuery(
    async () =>
      me
        ? (
            await db.equipment
              .filter((e) => e.isActive && e.assignedUserId === me.id && e.status !== 'retired')
              .first()
          )?.id
        : undefined,
    [me?.id],
  );
  if (fromAccount) return fromAccount;
  try {
    return localStorage.getItem(LAST_RIG_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

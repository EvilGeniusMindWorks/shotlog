// Rig picker for starting a drill checklist — shared by DrillerHome,
// MechanicHome, the Drilling tab and the StartGrid launcher (own file to
// avoid an import cycle between RoleCards and StartGrid).
//
// S7a (2026-09-07): a driller's pick is remembered on the ACCOUNT as the
// machine's usual operator (`equipment.assignedUserId` — field roles may
// patch equipment), so a phone and a tablet agree. The device key stays
// as the offline fallback and for non-driller roles.
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, X } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { nowISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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

export function RigPickerModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const rigs =
    useLiveQuery(() =>
      db.equipment
        .filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill'))
        .toArray(),
    ) ?? [];
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4 max-h-[80vh] overflow-auto" data-rig-picker>
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold">Which rig?</p>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="space-y-1">
          {rigs.map((r) => (
            <button
              key={r.id}
              className="w-full flex items-center gap-3 px-3 py-3 text-left rounded-lg border border-gray-200 hover:bg-gray-50"
              data-rig-option={r.assetNumber}
              onClick={() => {
                void rememberUsualRig(r.id);
                navigate(`/drill-checklist/${r.id}`);
              }}
            >
              <ClipboardCheck className="h-5 w-5 text-navy shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {r.assetNumber}
                  {r.status === 'in_shop' && <span className="ml-2 text-xs font-normal text-amber-700">in the shop</span>}
                </span>
                <span className="block text-xs text-gray-400 truncate">{r.description}</span>
              </span>
            </button>
          ))}
          {rigs.length === 0 && (
            <p className="text-sm text-gray-400 py-2">
              No drills in the equipment registry yet — ask the office to add your rig.
            </p>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-3">Your pick is remembered as your usual rig.</p>
      </div>
    </div>
  );
}

// Daily rock-drill checklist — mirrors the paper form with minimum taps:
// every daily check starts OK; tap to flip N/A or "not done". Repairs
// notes open a shop ticket the mechanic actually sees.
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Wrench } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { emptyChecklist, fileChecklist, useTodayChecklist } from '@/hooks/useMaintenance';
import { formatDate } from '@/lib/utils';
import type { CheckState } from '@/db/schema';
import { DRILL_DAILY_CHECKS, DRILL_WEEKLY_CHECKS } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignatureField } from '@/components/ui/signature-field';

const NEXT_STATE: Record<CheckState, CheckState> = { ok: 'na', na: 'skip', skip: 'ok' };
const STATE_STYLE: Record<CheckState, string> = {
  ok: 'bg-green-50 border-green-300 text-green-800',
  na: 'bg-gray-100 border-gray-300 text-gray-500',
  skip: 'bg-orange-50 border-orange-300 text-safety-orange',
};
const STATE_LABEL: Record<CheckState, string> = { ok: '✓', na: 'N/A', skip: '—' };

function CheckGrid({
  keys,
  values,
  onChange,
}: {
  keys: readonly string[];
  values: Record<string, CheckState>;
  onChange: (key: string, state: CheckState) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {keys.map((key) => {
        const state = values[key] ?? 'skip';
        return (
          <button
            key={key}
            type="button"
            className={`flex items-center justify-between gap-2 border rounded-lg px-3 py-2.5 text-sm text-left min-h-[44px] ${STATE_STYLE[state]}`}
            onClick={() => onChange(key, NEXT_STATE[state])}
          >
            <span>{key}</span>
            <span className="font-bold">{STATE_LABEL[state]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function DrillChecklistPage() {
  const { equipmentId } = useParams<{ equipmentId: string }>();
  const [params] = useSearchParams();
  const jobId = params.get('job') ?? undefined;
  const navigate = useNavigate();
  const rig = useLiveQuery(() => (equipmentId ? db.equipment.get(equipmentId) : undefined), [equipmentId]);
  const existing = useTodayChecklist(equipmentId);
  const [draft, setDraft] = useState(() => emptyChecklist(equipmentId ?? '', jobId));
  const [saved, setSaved] = useState<{ ticketId?: string } | null>(null);

  const checklist = useMemo(() => existing ?? draft, [existing, draft]);
  const readOnly = Boolean(existing) || Boolean(saved);

  const set = (patch: Partial<typeof draft>) => setDraft({ ...draft, ...patch });

  const submit = async () => {
    const result = await fileChecklist({ ...draft, equipmentId: equipmentId ?? '', jobId });
    setSaved(result);
  };

  return (
    <div>
      <div className="bg-navy text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200 hover:text-white hover:bg-white/10"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg truncate leading-tight">Rock Drill Check List</h2>
            <p className="text-xs text-navy-200 truncate">
              {rig ? `${rig.assetNumber} · ${rig.description}` : '…'} · {formatDate(checklist.date)}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {existing && (
          <p className="text-sm text-green-800 border border-green-200 bg-green-50 rounded-lg px-3 py-2">
            Filed today by {existing.drillerName}
            {existing.repairsNote && ` — repairs noted: “${existing.repairsNote}”`}.
          </p>
        )}
        {saved && (
          <p className="text-sm text-green-800 border border-green-200 bg-green-50 rounded-lg px-3 py-2">
            Filed.{' '}
            {saved.ticketId
              ? 'A repair ticket is on its way to the shop.'
              : 'No repairs noted — good drilling.'}
          </p>
        )}

        {!readOnly && (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex gap-3">
                <div className="w-40">
                  <Label className="text-xs">Starting hours</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder={rig?.hourMeter ? String(rig.hourMeter) : ''}
                    value={draft.startingHours ?? ''}
                    onChange={(e) =>
                      set({ startingHours: e.target.value ? parseFloat(e.target.value) : null })
                    }
                  />
                </div>
                <p className="text-xs text-gray-400 self-end pb-2">
                  Updates the registry's hour meter automatically (typos going backward are ignored).
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <p className="text-sm font-semibold">
                Daily — all start ✓; tap anything that's N/A or wasn't done
              </p>
              <CheckGrid keys={DRILL_DAILY_CHECKS} values={draft.daily}
                onChange={(key, state) => set({ daily: { ...draft.daily, [key]: state } })} />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input type="checkbox" checked={draft.weeklyDone}
                  onChange={(e) => {
                    const weekly = { ...draft.weekly };
                    if (e.target.checked) for (const k of DRILL_WEEKLY_CHECKS) weekly[k] = 'ok';
                    set({ weeklyDone: e.target.checked, weekly });
                  }} />
                50-hour / weekly service done today
              </label>
              {draft.weeklyDone && (
                <CheckGrid keys={DRILL_WEEKLY_CHECKS} values={draft.weekly}
                  onChange={(key, state) => set({ weekly: { ...draft.weekly, [key]: state } })} />
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <div>
                <Label className="text-xs flex items-center gap-1">
                  <Wrench className="h-3.5 w-3.5" /> Repairs needed — the shop sees this
                </Label>
                <Input
                  placeholder="e.g. hose blew + compressor stopped working"
                  value={draft.repairsNote}
                  onChange={(e) => set({ repairsNote: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={draft.outOfService}
                  onChange={(e) => set({ outOfService: e.target.checked })} />
                <span className={draft.outOfService ? 'font-semibold text-safety-orange' : ''}>
                  Rig is OUT OF SERVICE — don't send it back out
                </span>
              </label>
              <div>
                <Label className="text-xs">Driller signature</Label>
                <SignatureField value={draft.signatureImage}
                  onChange={(blob) => set({ signatureImage: blob })} />
              </div>
            </div>

            <Button className="w-full" size="lg" onClick={() => void submit()}>
              File checklist
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

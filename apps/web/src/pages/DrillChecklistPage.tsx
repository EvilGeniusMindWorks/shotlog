// Daily rock-drill checklist — mirrors the paper form with minimum taps:
// every daily check starts OK; tap to flip N/A or "not done". Repairs
// notes open a shop ticket the mechanic actually sees.
//
// The RIG is the first question on the form (Matthew, 2026-09-07), not a
// setting on the dashboard: nothing is preselected; quick picks name the
// rigs that matter today (today's drill log · last filed · usual · recent)
// with their reason, and "All rigs" opens the searchable fleet. Switching is
// one tap and saves nothing — the usual rig is written only when a checklist
// is FILED. Old per-rig links (/drill-checklist/:id) preselect that rig.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search, Wrench } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { emptyChecklist, fileChecklist, useTodayChecklist } from '@/hooks/useMaintenance';
import { useJobs } from '@/hooks/useBlastDay';
import { getSessionUser } from '@/lib/session';
import { formatDate, todayISO } from '@/lib/utils';
import { Select } from '@/components/ui/select';
import { rememberUsualRig, useUsualRigId } from '@/components/dashboard/RigPickerModal';
import type { CheckState, Equipment } from '@/db/schema';
import { DRILL_DAILY_CHECKS, DRILL_WEEKLY_CHECKS } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignatureField } from '@/components/ui/signature-field';
import { buildServiceClock } from '@/lib/serviceClock';
import { formatDate as fmtDate } from '@/lib/utils';

/** The paper form's "every 50 hours or 1 time per week" made honest: the
 *  app knows starting hours daily, so it computes hours-since-last-service
 *  instead of trusting memory. ADVISORY only — amber, never blocking. */
function ServiceClockCard({ rig }: { rig: Equipment }) {
  const clock = useLiveQuery(() => buildServiceClock(rig), [rig.id, rig.hourMeter]);
  if (!clock || clock.state === 'unknown') return null;
  const tone = clock.state === 'ok' ? 'border-l-green-500' : 'border-l-amber-500';
  return (
    <div className={`rounded-xl border border-gray-200 border-l-4 ${tone} bg-white p-4`}>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
        Every 50 hours or weekly ·{' '}
        <span className={clock.state === 'ok' ? 'text-green-700' : 'text-amber-600'}>{clock.label}</span>
      </p>
      <div className="flex items-center gap-2 text-sm">
        <div className="flex-1 min-w-0">
          <p>
            Last done {clock.lastDoneDate ? fmtDate(clock.lastDoneDate) : '—'} at{' '}
            <b className="font-mono">{clock.lastDoneHours?.toLocaleString() ?? '—'} h</b> · now{' '}
            <b className="font-mono">{clock.currentHours?.toLocaleString() ?? '—'} h</b>
          </p>
          <p className="text-xs text-gray-400">air filters · extinguishers · rollers</p>
        </div>
        <span
          className={
            'text-[10.5px] font-bold rounded-full px-2 py-0.5 ' +
            (clock.state === 'ok' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')
          }
        >
          {clock.sinceHours != null ? `${Math.round(clock.sinceHours)}/50` : '—'}
        </span>
      </div>
    </div>
  );
}

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

type Reason = "today's log" | 'last filed' | 'usual' | 'recent';
const RECENT_DAYS = 30;

/** The rigs that matter to THIS driller today, each with its reason, in
 *  priority order and deduplicated. Nothing is preselected from this. */
function useQuickRigs(rigs: Equipment[]): { rig: Equipment; reason: Reason }[] {
  const me = getSessionUser();
  const usualId = useUsualRigId();
  const picks = useLiveQuery(async () => {
    const today = todayISO();
    const floor = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
    const myLogs = (await db.drillLogs.filter((l) => !me?.id || l.drillerUserId === me.id).toArray()).filter(
      (l) => l.drillRigEquipmentId,
    );
    const todayLog = myLogs
      .filter((l) => (l.date ?? l.createdAt.slice(0, 10)) === today)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const myChecklists = (await db.drillChecklists.filter((c) => !me?.id || c.drillerUserId === me.id).toArray()).sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
    const recentIds = [
      ...myChecklists.filter((c) => c.date >= floor).map((c) => c.equipmentId),
      ...myLogs.filter((l) => (l.date ?? l.createdAt.slice(0, 10)) >= floor).map((l) => l.drillRigEquipmentId as string),
    ];
    return { todayLogRig: todayLog?.drillRigEquipmentId, lastFiledRig: myChecklists[0]?.equipmentId, recentIds };
  }, [me?.id]);
  return useMemo(() => {
    const out: { rig: Equipment; reason: Reason }[] = [];
    const seen = new Set<string>();
    const add = (id: string | undefined, reason: Reason) => {
      if (!id || seen.has(id)) return;
      const rig = rigs.find((r) => r.id === id);
      if (!rig) return;
      seen.add(id);
      out.push({ rig, reason });
    };
    add(picks?.todayLogRig, "today's log");
    add(picks?.lastFiledRig, 'last filed');
    add(usualId, 'usual');
    for (const id of picks?.recentIds ?? []) {
      if (out.length >= 5) break;
      add(id, 'recent');
    }
    return out;
  }, [picks, usualId, rigs]);
}

function RigField({
  rigs,
  value,
  onChange,
}: {
  rigs: Equipment[];
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  const quick = useQuickRigs(rigs);
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const listed = rigs.filter(
    (r) => !query || r.assetNumber.toLowerCase().includes(query) || r.description.toLowerCase().includes(query),
  );
  const chip = (r: Equipment, reason?: Reason) => {
    const on = value === r.id;
    return (
      <button
        key={r.id}
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 min-h-[40px] text-sm ${
          on ? 'bg-navy text-white border-navy' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
        }`}
        data-rig-chip={r.assetNumber}
        data-rig-reason={reason ?? ''}
        aria-pressed={on}
        onClick={() => onChange(r.id)}
      >
        <span className="font-semibold">{r.assetNumber}</span>
        {reason && <span className={`text-[11px] ${on ? 'text-white/80' : 'text-gray-500'}`}>· {reason}</span>}
        {r.status === 'in_shop' && <span className={`text-[11px] ${on ? 'text-white/80' : 'text-amber-700'}`}>· in shop</span>}
      </button>
    );
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" data-rig-field data-tour="chk-rig">
      <div>
        <p className="text-sm font-semibold">Which rig?</p>
        <p className="text-xs text-gray-400">
          Tap one. Nothing is remembered until you file — the checklist is for the rig you pick here.
        </p>
      </div>
      {quick.length > 0 && (
        <div className="flex flex-wrap gap-2" data-rig-quick>
          {quick.map(({ rig, reason }) => chip(rig, reason))}
        </div>
      )}
      {quick.length === 0 && rigs.length > 0 && !all && (
        <p className="text-xs text-gray-400">No recent rigs on this account yet — pick from the fleet.</p>
      )}
      <div>
        <button
          type="button"
          className="text-sm text-navy underline underline-offset-2 min-h-[36px]"
          data-rig-all-toggle
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
          {all ? 'Hide the fleet' : `All rigs (${rigs.length})`}
        </button>
        {all && (
          <div className="mt-2 space-y-2" data-rig-all>
            <div className="relative max-w-sm">
              <Search className="h-4 w-4 text-gray-400 absolute left-2.5 top-3" />
              <Input
                className="pl-8"
                placeholder="Search asset # or description"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                data-rig-search
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {listed.map((r) => chip(r))}
              {listed.length === 0 && <p className="text-xs text-gray-400">No rig matches.</p>}
            </div>
          </div>
        )}
        {rigs.length === 0 && (
          <p className="text-xs text-gray-400">No drills in the equipment registry yet — ask the office to add your rig.</p>
        )}
      </div>
    </div>
  );
}

export function DrillChecklistPage() {
  const { equipmentId: routeRigId } = useParams<{ equipmentId?: string }>();
  const [params] = useSearchParams();
  const jobParam = params.get('job') ?? undefined;
  const navigate = useNavigate();
  const me = getSessionUser();
  const rigs =
    useLiveQuery(async () =>
      (await db.equipment.filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill')).toArray()).sort(
        (a, b) => a.assetNumber.localeCompare(b.assetNumber, undefined, { numeric: true }),
      ),
    ) ?? [];
  // A per-rig link (old URL, the drill log's nudge) preselects; the home,
  // launcher and Drilling tab arrive with nothing chosen
  const [rigId, setRigId] = useState<string | undefined>(routeRigId);
  // Both routes render this same component, so a link to /drill-checklist/:id
  // from the rig-less form must re-select (the initial state alone won't)
  useEffect(() => {
    if (routeRigId) setRigId(routeRigId);
  }, [routeRigId]);
  const rig = useLiveQuery(() => (rigId ? db.equipment.get(rigId) : undefined), [rigId]);
  const existing = useTodayChecklist(rigId);
  const [draft, setDraft] = useState(() => emptyChecklist(rigId ?? '', jobParam));
  const [saved, setSaved] = useState<{ ticketId?: string } | null>(null);
  // Switching rig starts a fresh draft for that rig (the job choice carries over)
  useEffect(() => {
    setDraft((d) => (d.equipmentId === (rigId ?? '') ? d : { ...emptyChecklist(rigId ?? '', d.jobId), jobId: d.jobId }));
  }, [rigId]);
  // S7a: attaching to a job is OPTIONAL — a checklist needs nothing else.
  // Offered as a select, prefilled with the job I'm drilling today.
  const jobs = useJobs();
  const todaysJobId = useLiveQuery(
    async () =>
      (
        await db.drillLogs
          .filter((l) => l.status === 'open' && (l.date ?? l.createdAt.slice(0, 10)) === todayISO() && (!me?.id || l.drillerUserId === me.id))
          .first()
      )?.jobId,
    [me?.id],
  );
  const [jobTouched, setJobTouched] = useState(Boolean(jobParam));
  useEffect(() => {
    if (!jobTouched && todaysJobId) setDraft((d) => (d.jobId ? d : { ...d, jobId: todaysJobId }));
  }, [todaysJobId, jobTouched]);
  const jobId = draft.jobId;

  const readOnly = Boolean(existing) || Boolean(saved);
  const set = (patch: Partial<typeof draft>) => setDraft({ ...draft, ...patch });

  const submit = async () => {
    if (!rigId) return;
    const result = await fileChecklist({ ...draft, equipmentId: rigId, jobId });
    // Filing is what makes a rig "usual" — browsing never does
    void rememberUsualRig(rigId);
    setSaved(result);
    // Auto-file the office copy: the archive route renders the paper form,
    // stores the point-in-time PDF, and shows the outcome (incl. ticket)
    navigate(`/drill-checklist-file/${draft.id}${result.ticketId ? '?ticket=1' : ''}`, { replace: true });
  };

  return (
    <div>
      <div className="bg-navy text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200 hover:text-white hover:bg-white/10"
            onClick={() => navigate('/')}
            aria-label="Back home"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg truncate leading-tight">Rock Drill Check List</h2>
            <p className="text-xs text-navy-200 truncate" data-chk-rig-selected={rig?.assetNumber ?? ''}>
              {rig ? `${rig.assetNumber} · ${rig.description} · ` : ''}
              {formatDate(draft.date)}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <RigField rigs={rigs} value={rigId} onChange={setRigId} />

        {!rigId && (
          <p className="text-sm text-gray-400 px-1" data-chk-pick-first>
            Pick the rig to start the walk-around.
          </p>
        )}

        {rigId && existing && (
          <div className="text-sm text-green-800 border border-green-200 bg-green-50 rounded-lg px-3 py-2 space-y-1" data-chk-existing>
            <p>
              <b>{rig?.assetNumber}</b> already has today's checklist — filed by {existing.drillerName}
              {existing.repairsNote && ` — repairs noted: “${existing.repairsNote}”`}.
            </p>
            <p className="text-xs">
              <button className="underline" onClick={() => navigate(`/drill-checklist-print/${existing.id}`)}>
                Open it
              </button>{' '}
              · or pick another rig above to file one for it.
            </p>
          </div>
        )}
        {saved && (
          <p className="text-sm text-green-800 border border-green-200 bg-green-50 rounded-lg px-3 py-2">
            Filed. {saved.ticketId ? 'A repair ticket is on its way to the shop.' : 'No repairs noted — good drilling.'}
          </p>
        )}

        {rigId && rig && !readOnly && (
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" data-tour="chk-hours">
              <div className="flex gap-3">
                <div className="w-40">
                  <Label className="text-xs">Starting hours</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder={rig.hourMeter ? String(rig.hourMeter) : ''}
                    value={draft.startingHours ?? ''}
                    onChange={(e) => set({ startingHours: e.target.value ? parseFloat(e.target.value) : null })}
                    data-chk-hours
                  />
                </div>
                <p className="text-xs text-gray-400 self-end pb-2">
                  Updates the registry's hour meter automatically (typos going backward are ignored).
                </p>
              </div>
              <div>
                <Label className="text-xs">
                  Job <span className="text-gray-400 font-normal">— optional; the checklist files without one</span>
                </Label>
                <Select
                  data-checklist-job
                  value={jobId ?? ''}
                  onChange={(e) => {
                    setJobTouched(true);
                    set({ jobId: e.target.value || undefined });
                  }}
                  options={[
                    { value: '', label: 'No job — just the rig' },
                    ...jobs.map((j) => ({ value: j.id, label: `${j.jobNumber ? `${j.jobNumber} · ` : ''}${j.name}` })),
                  ]}
                />
              </div>
            </div>

            <ServiceClockCard rig={rig} />

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2" data-tour="chk-daily">
              <p className="text-sm font-semibold">Daily — all start ✓; tap anything that's N/A or wasn't done</p>
              <CheckGrid keys={DRILL_DAILY_CHECKS} values={draft.daily} onChange={(key, state) => set({ daily: { ...draft.daily, [key]: state } })} />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.weeklyDone}
                  onChange={(e) => {
                    const weekly = { ...draft.weekly };
                    if (e.target.checked) for (const k of DRILL_WEEKLY_CHECKS) weekly[k] = 'ok';
                    set({ weeklyDone: e.target.checked, weekly });
                  }}
                />
                50-hour / weekly service done today
              </label>
              {draft.weeklyDone && (
                <CheckGrid keys={DRILL_WEEKLY_CHECKS} values={draft.weekly} onChange={(key, state) => set({ weekly: { ...draft.weekly, [key]: state } })} />
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <div>
                <Label className="text-xs flex items-center gap-1">
                  <Wrench className="h-3.5 w-3.5" /> Repairs needed — the shop sees this
                </Label>
                <Input placeholder="e.g. hose blew + compressor stopped working" value={draft.repairsNote} onChange={(e) => set({ repairsNote: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer" data-tour="chk-oos">
                <input type="checkbox" checked={draft.outOfService} onChange={(e) => set({ outOfService: e.target.checked })} />
                <span className={draft.outOfService ? 'font-semibold text-safety-orange' : ''}>Rig is OUT OF SERVICE — don't send it back out</span>
              </label>
              <div>
                <Label className="text-xs">Driller signature</Label>
                <SignatureField value={draft.signatureImage} onChange={(blob) => set({ signatureImage: blob })} />
              </div>
            </div>

            <Button className="w-full" size="lg" onClick={() => void submit()} data-chk-file>
              File checklist for {rig.assetNumber}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

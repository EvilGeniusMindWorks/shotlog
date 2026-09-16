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
import { useBack } from '@/lib/nav';
import { BackButton } from '@/components/layout/ScreenHeader';
import { Search, Wrench } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { emptyChecklist, fileChecklist, useEarlierChecklistToday, useTodayChecklist } from '@/hooks/useMaintenance';
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
// S9b follow-up: the evaluation's drillers guessed what "—" meant
const STATE_LABEL: Record<CheckState, string> = { ok: '✓', na: 'N/A', skip: 'Not done' };

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
    <div className="space-y-1.5">
    <p className="text-xs text-gray-500" data-chk-hint>
      Tap an item to mark it <b>N/A</b> or <b>Not done</b>. Found a fault? Say it under <b>Repairs needed</b> below — that is what opens a shop ticket.
    </p>
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
            <span className="font-bold" data-chk-state={state}>{STATE_LABEL[state]}</span>
          </button>
        );
      })}
    </div>
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
  // S19 (Matthew): a checklist started from a work day is for THAT day — the
  // door hands over the date; this screen never guesses it
  const dateParam = params.get('date') ?? undefined;
  const dayParam = params.get('day') ?? undefined;
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
  // S9b: the machine's reading is the starting value — a placeholder looked
  // filled in and nobody committed it (both evaluation drillers)
  const [suggestedHours, setSuggestedHours] = useState<number | null>(null);
  useEffect(() => {
    if (!rig || rig.hourMeter == null) return;
    setDraft((d) => (d.equipmentId === rig.id && d.startingHours == null ? { ...d, startingHours: rig.hourMeter ?? null } : d));
    setSuggestedHours(rig.hourMeter ?? null);
  }, [rig?.id, rig?.hourMeter]);
  const [draft, setDraft] = useState(() => emptyChecklist(rigId ?? '', jobParam, dateParam));
  // S16: one checklist per rig per job-day; the morning's answers carry over
  const existing = useTodayChecklist(rigId, draft.jobId || undefined, draft.date);
  const earlier = useEarlierChecklistToday(rigId, draft.jobId || undefined, draft.date);
  const [carriedFrom, setCarriedFrom] = useState<string | null>(null);
  const earlierJob = useLiveQuery(() => (earlier?.jobId ? db.jobs.get(earlier.jobId) : undefined), [earlier?.jobId]);
  useEffect(() => {
    if (!earlier || existing || carriedFrom === earlier.id) return;
    setDraft((d) => ({ ...d, daily: { ...earlier.daily }, weekly: { ...earlier.weekly }, weeklyDone: earlier.weeklyDone }));
    setCarriedFrom(earlier.id);
  }, [earlier?.id, existing?.id]);
  const [saved, setSaved] = useState<{ ticketId?: string } | null>(null);
  // Switching rig starts a fresh draft for that rig (the job choice carries over)
  useEffect(() => {
    setDraft((d) => (d.equipmentId === (rigId ?? '') ? d : { ...emptyChecklist(rigId ?? '', d.jobId, d.date), jobId: d.jobId }));
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

  // S19: with no date handed over, the checklist follows the work day the
  // driller is ON at the picked job — an open day they confirmed, drilled or
  // carded (a day left open on another date, S16); today's wins when there
  // are several; none → today. An open day nobody is on (the blaster
  // pre-started tomorrow's) never pulls a checklist onto its date.
  const dayHint = useLiveQuery(async () => {
    if (dateParam || !jobId) return null;
    // a day dated after today (the blaster pre-started tomorrow's) never captures today's
    // walk-around, and neither does a stale draft from weeks ago — the last seven days only
    const today = todayISO();
    const floor = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const open = await db.blastDays.filter((d) => d.jobId === jobId && d.status === 'draft' && !d.closed && d.date <= today && d.date >= floor).toArray();
    const mine: { id: string; date: string }[] = [];
    for (const d of open) {
      const confirmed = (await db.workDayConfirmations.where('blastDayId').equals(d.id).toArray()).some((c) => !me?.id || c.userId === me.id);
      const drilled = confirmed || (await db.drillLogs.filter((l) => l.blastDayId === d.id && (!me?.id || l.drillerUserId === me.id)).toArray()).length > 0;
      const carded =
        drilled || (await db.timeCards.filter((c) => (c.blastDayId === d.id || (c.jobId === d.jobId && c.date === d.date)) && (!me?.id || c.userId === me.id)).toArray()).length > 0;
      if (carded) mine.push({ id: d.id, date: d.date });
    }
    if (mine.length === 0) return null;
    return mine.find((d) => d.date === today) ?? mine.sort((a, b) => b.date.localeCompare(a.date))[0];
  }, [jobId, dateParam, me?.id]);
  const hintReady = dayHint !== undefined;
  useEffect(() => {
    if (dateParam || !hintReady) return;
    const want = dayHint?.date ?? todayISO();
    setDraft((d) => (d.date === want ? d : { ...d, date: want }));
  }, [dayHint?.date, dateParam, hintReady]);
  const jobName = jobs.find((j) => j.id === jobId)?.name;
  const forDay: 'door' | 'hint' | null = dateParam ? 'door' : dayHint ? 'hint' : null;
  // The navigation round: up to the day it was started from (named), else the rig, else home
  const back = useBack(
    dayParam ? { to: `/blast-day/${dayParam}`, label: jobName ?? 'the work day' } : routeRigId ? { to: `/equipment/${routeRigId}`, label: rig?.assetNumber ?? 'the rig' } : { to: '/', label: 'Dashboard' },
    'Rock Drill Check List',
  );

  // The office copy of today's checklist, if it was ever filed (Matthew,
  // Sep 15 2026: a filing that failed mid-way left the checklist without one)
  const existingCopy = useLiveQuery(
    async () => (existing ? (await db.submissions.filter((s) => s.type === 'drill_checklist' && s.sourceId === existing.id).toArray()) : []),
    [existing?.id],
  );
  const readOnly = Boolean(existing) || Boolean(saved);
  const carriedLine =
    carriedFrom && earlier
      ? `Answers carried from ${draft.date === todayISO() ? "this morning's" : 'the earlier'} checklist${earlierJob?.name ? ` at ${earlierJob.name}` : ''} — change what changed.`
      : null;
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
          <BackButton back={back} />
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
              <b>{rig?.assetNumber}</b> already has {draft.date === todayISO() ? "today's checklist" : `a checklist for ${formatDate(draft.date)}`} at this job — filed by {existing.drillerName}
              {existing.repairsNote && ` — repairs noted: “${existing.repairsNote}”`}.
            </p>
            <p className="text-xs">
              <button className="underline" onClick={() => navigate(`/drill-checklist-print/${existing.id}`)}>
                Open it
              </button>{' '}
              {existingCopy !== undefined && existingCopy.length === 0 && (
                <>
                  ·{' '}
                  <button className="underline font-semibold" data-chk-file-office onClick={() => navigate(`/drill-checklist-file/${existing.id}`)}>
                    File the office copy
                  </button>{' '}
                  (it never reached the office){' '}
                </>
              )}
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
              {forDay && (
                <p className="text-xs text-navy bg-blue-50 border border-blue-100 rounded-lg px-3 py-2" data-chk-for-day={forDay}>
                  For the work day <b>{formatDate(draft.date)}</b>
                  {jobName ? ` at ${jobName}` : ''}
                  {forDay === 'door' ? ' — you started it from that day.' : ' — the day you are on at this job.'}
                </p>
              )}
              {/* S19 (Matthew): the hours box had 70 px between two notes — its own row now */}
              <div>
                <Label className="text-xs">Starting hours</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  className="max-w-[12rem] font-mono text-base"
                  placeholder="read the gauge"
                  value={draft.startingHours ?? ''}
                  onChange={(e) => set({ startingHours: e.target.value ? parseFloat(e.target.value) : null })}
                  data-chk-hours
                />
                <p className="text-xs text-gray-400 mt-1" data-chk-hours-source>
                  {suggestedHours != null && draft.startingHours === suggestedHours
                    ? `From ${rig.assetNumber}'s meter · change it if the gauge reads differently · a number going backwards is ignored`
                    : 'Updates the registry’s hour meter · a number going backwards is ignored'}
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
              {/* S19: the carried-answers note belongs with the answers, not the hours */}
              {carriedLine && <p className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2" data-chk-carried>{carriedLine}</p>}
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

import { useState, type ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, FileText, ClipboardList, ChevronDown, ChevronUp, FileBarChart, History, Lock, PhoneCall, Printer } from 'lucide-react';
import { type Role } from '@shotlog/shared';
import { can, canDayTransition, canEditApprovedDay } from '@/lib/perms';
import { addBlastLogToDay, useBlastDay } from '@/hooks/useBlastDay';
import { db, useLiveQuery } from '@/db';
import { deleteDayCascade } from '@/lib/lifecycle';
import { LifecycleMenu } from '@/components/records/LifecycleMenu';
import { TimeCardsCard } from '@/components/forms/TimeCardsCard';
import { useDayPhases } from '@/hooks/useDayPhases';
import { PhaseSpine } from '@/components/day/PhaseSpine';
import { MergedDrillingView } from '@/components/day/MergedDrillingView';
import { ReadinessView } from '@/components/day/ReadinessView';
import { PreBlastCard } from '@/components/day/PreBlastCard';
import { DrillOnlyFileCard } from '@/components/day/DrillOnlyFileCard';
import { authedFetch, getSessionUser } from '@/lib/session';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { nowISO, formatDate, dayOfWeek } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ChipSelect } from '@/components/ui/chip-select';
import { BlastLogForm } from '@/components/forms/BlastLogForm';
import { DailyReportForm } from '@/components/forms/DailyReportForm';
import { DrillPlanCard } from '@/components/forms/DrillPlanCard';
import { AttachmentsCard } from '@/components/forms/AttachmentsCard';
import { DayHistorySheet } from '@/components/forms/DayHistorySheet';
import { ContactList } from '@/components/forms/JobContactsCard';
import { createIncident } from '@/pages/admin/AdminIncidentsPage';

const WEATHER_OPTIONS = [
  { value: 'sunny', label: 'Sunny' },
  { value: 'cloudy', label: 'Cloudy' },
  { value: 'partly_cloudy', label: 'Partly Cloudy' },
  { value: 'rain_light', label: 'Light Rain' },
  { value: 'rain_heavy', label: 'Heavy Rain' },
  { value: 'rain_out', label: 'Rain Out' },
];

const TEMP_OPTIONS = [
  { value: 'low', label: 'Low (<50°F)' },
  { value: 'mod', label: 'Moderate (50-80°F)' },
  { value: 'high', label: 'High (>80°F)' },
];

const GROUND_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'wet', label: 'Wet' },
  { value: 'muddy', label: 'Muddy' },
  { value: 'rock', label: 'Rock' },
  { value: 'frozen', label: 'Frozen' },
];

const WORK_TYPE_OPTIONS = [
  { value: 'drill_only', label: 'Drill Only' },
  { value: 'drill_to_blast', label: 'Drill to Blast' },
  { value: 'drill_to_excavate', label: 'Drill to Excavate' },
  { value: 'blasting', label: 'Blasting' },
  { value: 'crushing', label: 'Crushing' },
  { value: 'hauling', label: 'Hauling' },
];

const WIND_OPTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((d) => ({
  value: d,
  label: d,
}));

type Tab = 'blast-log' | 'daily-report';
type DayView = 'hub' | 'blast-log' | 'daily-report' | 'drilling' | 'readiness';

function CondChip({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className={
        accent
          ? 'inline-flex items-center rounded-md bg-safety-orange text-white px-2.5 py-1 text-xs font-bold'
          : 'inline-flex items-center rounded-md bg-navy text-white px-2.5 py-1 text-xs font-semibold'
      }
    >
      {children}
    </span>
  );
}

export function BlastDayPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { blastDay, job, blastLog, dailyReport, shots, explosiveUsage } = useBlastDay(id);
  // Round 2: the day is a PHASE SPINE (hub) — the default view on blasting
  // days. ?view= deep-links a phase; legacy ?tab=daily still lands on the
  // daily report.
  const [viewState, setViewState] = useState<DayView | null>(() => {
    const v = searchParams.get('view');
    if (v === 'hub' || v === 'blast-log' || v === 'daily-report' || v === 'drilling' || v === 'readiness')
      return v;
    return searchParams.get('tab') === 'daily' ? 'daily-report' : null;
  });
  // Non-blasting days have no blast log — the daily report is the whole day
  const view: DayView = blastLog ? (viewState ?? 'hub') : 'daily-report';
  const setView = (v: string) => setViewState(v as DayView);
  const tab: Tab = view === 'daily-report' ? 'daily-report' : 'blast-log';
  const phaseModel = useDayPhases(blastDay, blastLog, shots);
  const [showConditions, setShowConditions] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const online = useOnlineStatus();
  const role = (getSessionUser()?.role ?? 'blaster') as Role;
  // Delete is draft-only AND nothing-filed (deletion pattern) — the server
  // re-checks both; this just decides whether to offer the menu item
  const filedCount =
    useLiveQuery(
      () => (id ? db.submissions.filter((s) => s.blastDayId === id).count() : 0),
      [id],
    ) ?? 0;

  if (!blastDay) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>Loading...</p>
      </div>
    );
  }

  const status = blastDay.status;
  // Filed with the office (submitted) OR approved → frozen for field roles
  const locked = status !== 'draft' && !canEditApprovedDay();

  const updateConditions = (field: string, value: string | boolean) => {
    if (locked) return;
    const updated = { ...blastDay.conditions, [field]: value };
    db.blastDays.update(blastDay.id, { conditions: updated, updatedAt: nowISO() });
  };

  const updateBlastDay = (field: string, value: string | boolean) => {
    if (locked) return;
    db.blastDays.update(blastDay.id, { [field]: value, updatedAt: nowISO() });
  };

  // Submit/withdraw are FIELD actions — they go through the offline sync
  // path so a blaster without signal can still submit. Approve/reopen are
  // supervision actions — online-only REST with immediate errors.
  const submitViaSync = (to: 'submitted' | 'draft') => {
    void db.blastDays.update(blastDay.id, { status: to, updatedAt: nowISO() });
  };
  const transitionViaRest = async (to: 'approved' | 'submitted' | 'draft') => {
    setStatusBusy(true);
    setStatusError(null);
    try {
      const res = await authedFetch(`/admin/blast-days/${blastDay.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ to }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'status change failed');
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'status change failed');
    } finally {
      setStatusBusy(false);
    }
  };

  const statusActions: ReactNode[] = [];
  if (status === 'draft' && canDayTransition('draft', 'submitted')) {
    statusActions.push(
      // Files the point-in-time PDFs with the office, then marks submitted
      <Button key="submit" size="sm" variant="secondary"
        onClick={() => navigate(`/blast-day/${blastDay.id}/submit`)}>
        Submit to Office
      </Button>,
    );
  }
  if (status === 'submitted') {
    if (canDayTransition('submitted', 'approved')) {
      statusActions.push(
        <Button key="approve" size="sm" className="bg-green-600 hover:bg-green-700 text-white"
          disabled={!online || statusBusy}
          title={online ? undefined : 'Approvals need a connection'}
          onClick={() => void transitionViaRest('approved')}>
          Approve
        </Button>,
      );
      statusActions.push(
        <Button key="sendback" size="sm" variant="secondary" disabled={!online || statusBusy}
          onClick={() => void transitionViaRest('draft')}>
          Send Back
        </Button>,
      );
    } else if (canDayTransition('submitted', 'draft')) {
      // Supervisory unlock, offline-capable (send-back above needs REST)
      statusActions.push(
        <Button key="withdraw" size="sm" variant="secondary" onClick={() => submitViaSync('draft')}>
          Unlock
        </Button>,
      );
    }
  }
  if (status === 'approved' && canEditApprovedDay()) {
    statusActions.push(
      <Button key="reopen" size="sm" variant="secondary" disabled={!online || statusBusy}
        title={online ? undefined : 'Reopening needs a connection'}
        onClick={() => void transitionViaRest('submitted')}>
        Reopen
      </Button>,
    );
  }

  return (
    <div>
      {/* Navy context header (wireframe §4.1) */}
      <div className="bg-navy text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <button
            className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200 hover:text-white hover:bg-white/10"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg truncate leading-tight">
              {blastDay.name || job?.name || 'Work Day'}
            </h2>
            <p className="text-xs text-navy-200 truncate">
              {blastDay.name ? `${job?.name ?? ''} · ` : ''}
              {formatDate(blastDay.date)} ({dayOfWeek(blastDay.date)}) ·{' '}
              {[job?.address, job?.city, job?.state].filter(Boolean).join(', ') || job?.customer}
            </p>
          </div>
          <Badge variant={blastDay.status as 'draft' | 'submitted' | 'approved'}>
            {blastDay.status}
          </Badge>
          {statusActions}
          {blastLog && (
            <button
              className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20"
              title="Visual Blast Report"
              onClick={() => navigate(`/blast-day/${blastDay.id}/report`)}
            >
              <FileBarChart className="h-5 w-5" />
            </button>
          )}
          <button
            className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20"
            title="Jobsite contacts"
            onClick={() => setShowContacts(!showContacts)}
          >
            <PhoneCall className="h-5 w-5" />
          </button>
          {['admin', 'office', 'supervisor'].includes(role) && (
            <button
              className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20"
              title="Change history"
              onClick={() => setShowHistory(true)}
            >
              <History className="h-5 w-5" />
            </button>
          )}
          <button
            className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20"
            title={tab === 'blast-log' ? 'Print Blasting Log' : 'Print Daily Report'}
            onClick={() =>
              navigate(
                tab === 'blast-log'
                  ? `/blast-day/${blastDay.id}/print`
                  : `/blast-day/${blastDay.id}/print-daily`,
              )
            }
          >
            <Printer className="h-5 w-5" />
          </button>
          <LifecycleMenu
            table="blastDays"
            record={blastDay}
            label={blastDay.name || `${formatDate(blastDay.date)} at ${job?.name ?? 'this job'}`}
            kind="work day"
            allowArchive={false}
            canDeleteOverride={status === 'draft' && filedCount === 0}
            deleteFn={() => deleteDayCascade(blastDay)}
            deleteDescription="This day never happened: its log, report, entries, and draft time cards go with it. The server keeps a permanent audit record."
            onDeleted={() => navigate('/')}
            buttonClassName="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20"
          />
        </div>
      </div>

      {/* Conditions bar (wireframe §4.2) */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 sticky top-[64px] z-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mr-1">
              Conditions
            </span>
            <span className="text-[10px] font-bold text-blue-500 border border-blue-200 bg-blue-50 rounded px-1.5 py-0.5 mr-2">
              NWS
            </span>
            <CondChip>{TEMP_OPTIONS.find((o) => o.value === blastDay.conditions.temperatureRange)?.label.split(' ')[0]}</CondChip>
            <CondChip>{WEATHER_OPTIONS.find((o) => o.value === blastDay.conditions.weather)?.label}</CondChip>
            {blastDay.conditions.windDirection && <CondChip>{blastDay.conditions.windDirection}</CondChip>}
            <CondChip>{GROUND_OPTIONS.find((o) => o.value === blastDay.conditions.groundConditions)?.label}</CondChip>
            <CondChip>{WORK_TYPE_OPTIONS.find((o) => o.value === blastDay.typeOfWork)?.label}</CondChip>
            {blastDay.fireDetail && <CondChip accent>⚑ Fire Detail</CondChip>}
            <button
              className="ml-auto text-sm text-blue-600 font-semibold min-h-[36px] px-2 flex items-center gap-1"
              onClick={() => setShowConditions(!showConditions)}
            >
              Edit
              {showConditions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

        {showConditions && (
          <div className="space-y-3 mt-3 pb-2">
            <div>
              <Label className="text-xs">Temperature</Label>
              <ChipSelect
                className="mt-1"
                value={blastDay.conditions.temperatureRange}
                onChange={(v) => updateConditions('temperatureRange', v)}
                options={TEMP_OPTIONS}
              />
            </div>
            <div>
              <Label className="text-xs">Weather</Label>
              <ChipSelect
                className="mt-1"
                value={blastDay.conditions.weather}
                onChange={(v) => updateConditions('weather', v)}
                options={WEATHER_OPTIONS}
              />
            </div>
            <div>
              <Label className="text-xs">Wind Direction</Label>
              <ChipSelect
                className="mt-1"
                value={blastDay.conditions.windDirection}
                onChange={(v) => updateConditions('windDirection', v)}
                options={WIND_OPTIONS}
                allowEmpty
              />
            </div>
            <div>
              <Label className="text-xs">Ground</Label>
              <ChipSelect
                className="mt-1"
                value={blastDay.conditions.groundConditions}
                onChange={(v) => updateConditions('groundConditions', v)}
                options={GROUND_OPTIONS}
              />
            </div>
            <div>
              <Label className="text-xs">Type of Work</Label>
              <ChipSelect
                className="mt-1"
                value={blastDay.typeOfWork}
                onChange={(v) => updateBlastDay('typeOfWork', v)}
                options={WORK_TYPE_OPTIONS}
              />
            </div>
            <div>
              <Label className="text-xs">
                Day Name <span className="text-gray-400 font-normal">— shows in lists & prints</span>
              </Label>
              <Input
                className="mt-1"
                placeholder="e.g. North face lift 2"
                defaultValue={blastDay.name ?? ''}
                onBlur={(e) => updateBlastDay('name', e.target.value.trim())}
              />
            </div>
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                checked={blastDay.fireDetail}
                onChange={(e) => updateBlastDay('fireDetail', e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-navy focus:ring-navy-400"
              />
              <span className="text-sm font-medium">Fire Detail</span>
            </label>
            <div>
              <Button variant="outline" size="sm"
                onClick={() => {
                  void (async () => {
                    const shot = shots[0];
                    const reading = shot
                      ? await db.seismoReadings.where('shotId').equals(shot.id).first()
                      : undefined;
                    const id = await createIncident('blasting', {
                      jobId: blastDay.jobId,
                      blastDayId: blastDay.id,
                      shotId: shot?.id,
                      seismoReadingId: reading?.id,
                      ppv: reading
                        ? Math.max(reading.ppvTran, reading.ppvVert, reading.ppvLong)
                        : null,
                      db: reading?.airOverpressure ?? null,
                      date: blastDay.date,
                    });
                    navigate(`/incident/${id}`);
                  })();
                }}>
                ⚠ Report incident
              </Button>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Segmented tab control (wireframe §4.3) — blast log tab only when one exists */}
      <div className="px-4 pt-3">
        <div className="max-w-5xl mx-auto">
          {blastLog ? (
            <div className="flex bg-gray-100 rounded-lg p-1">
              {(
                [
                  ['hub', 'Day', CalendarCheck],
                  ['blast-log', 'Blast Log', FileText],
                  ['daily-report', 'Daily Report', ClipboardList],
                ] as const
              ).map(([key, label, Icon]) => {
                const active =
                  key === 'hub' ? view === 'hub' || view === 'drilling' || view === 'readiness' : view === key;
                return (
                <button
                  key={key}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-md transition-all min-h-[44px] ${
                    active
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setView(key)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
              <span className="text-sm text-gray-500 flex-1">
                {WORK_TYPE_OPTIONS.find((o) => o.value === blastDay.typeOfWork)?.label} day —
                daily report only.
              </span>
              {!locked && can('blastLogs', 'PUT') && (
                <Button size="sm" variant="secondary"
                  onClick={() => {
                    void addBlastLogToDay(blastDay.id).then(() => setView('blast-log'));
                  }}>
                  <FileText className="h-4 w-4 mr-1" /> Add Blasting Log
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {showContacts && (
        <div className="max-w-5xl mx-auto px-4 pt-3">
          <ContactList contacts={job?.contacts ?? []} notes={job?.contactNotes} />
        </div>
      )}

      {showHistory && (
        <DayHistorySheet blastDayId={blastDay.id} onClose={() => setShowHistory(false)} />
      )}

      {statusError && (
        <div className="max-w-5xl mx-auto px-4 pt-3">
          <p className="text-sm text-violation border border-red-200 bg-red-50 rounded-lg px-3 py-2">
            {statusError}
          </p>
        </div>
      )}

      {locked && (
        <div className="max-w-5xl mx-auto px-4 pt-3">
          <p className="flex items-center gap-2 text-sm text-green-800 border border-green-200 bg-green-50 rounded-lg px-3 py-2">
            <Lock className="h-4 w-4 shrink-0" />
            {status === 'approved'
              ? 'This work day is approved and locked. A supervisor can reopen it if something needs to change.'
              : 'Filed with the office and locked. Ask a supervisor to unlock it — resubmitting files a new version.'}
          </p>
        </div>
      )}

      {/* The day hub — phases in order, a map not a gate. Stays tappable on
          locked days (it's navigation, not editing). */}
      {view === 'hub' && blastLog && phaseModel && (
        <div className="p-4 max-w-5xl mx-auto space-y-3">
          <PhaseSpine model={phaseModel} onOpen={setView} />
          <PreBlastCard />
        </div>
      )}

      {(view === 'drilling' || view === 'readiness') && blastLog && (
        <div className="max-w-5xl mx-auto px-4 pt-3">
          <button className="text-xs text-gray-400 hover:text-navy" onClick={() => setView('hub')}>
            ‹ Back to the day
          </button>
        </div>
      )}

      {/* Drill plan at-a-glance — the plan's home, above the fold. Outside the
          locked wrapper so accepted-log rows stay tappable on locked days. */}
      {view === 'blast-log' && blastLog && blastDay && (
        <div className="max-w-5xl mx-auto px-4 pt-3">
          <DrillPlanCard shots={shots} blastDayId={blastDay.id} jobId={blastDay.jobId} locked={locked} />
        </div>
      )}

      {/* Tab content — read-only once approved (server enforces this too) */}
      <div
        className={locked ? 'p-4 max-w-5xl mx-auto pointer-events-none select-none opacity-70' : 'p-4 max-w-5xl mx-auto'}
        aria-disabled={locked || undefined}
      >
        {view === 'drilling' && blastLog && (
          <MergedDrillingView day={blastDay} shots={shots} onAccepted={() => setView('readiness')} />
        )}
        {view === 'readiness' && blastLog && (
          <ReadinessView
            day={blastDay}
            blastLog={blastLog}
            shots={shots}
            onConfirmed={() => setView('blast-log')}
          />
        )}
        {view === 'blast-log' && blastLog && (
          <BlastLogForm
            blastDay={blastDay}
            blastLog={blastLog}
            shots={shots}
            explosiveUsage={explosiveUsage}
            job={job}
          />
        )}
        {tab === 'daily-report' && dailyReport && blastDay && (
          <div className="mb-4 space-y-4">
            {!blastLog && <DrillOnlyFileCard day={blastDay} />}
            <TimeCardsCard blastDay={blastDay} />
            <AttachmentsCard parentId={blastDay.id} parentType="blast_day" title="Day attachments" />
          </div>
        )}
        {tab === 'daily-report' && dailyReport && (
          <DailyReportForm
            blastDay={blastDay}
            dailyReport={dailyReport}
            blastLog={blastLog}
            shots={shots}
          />
        )}
      </div>
    </div>
  );
}

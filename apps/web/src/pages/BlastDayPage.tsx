import { useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, ClipboardList, ChevronDown, ChevronUp, FileBarChart, Lock, Printer } from 'lucide-react';
import { canEditApproved, canTransitionStatus, type Role } from '@shotlog/shared';
import { useBlastDay } from '@/hooks/useBlastDay';
import { db } from '@/db';
import { authedFetch, getSessionUser } from '@/lib/session';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { nowISO, formatDate, dayOfWeek } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ChipSelect } from '@/components/ui/chip-select';
import { BlastLogForm } from '@/components/forms/BlastLogForm';
import { DailyReportForm } from '@/components/forms/DailyReportForm';

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
  { value: 'blasting', label: 'Blasting' },
  { value: 'crushing', label: 'Crushing' },
];

const WIND_OPTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((d) => ({
  value: d,
  label: d,
}));

type Tab = 'blast-log' | 'daily-report';

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
  const { blastDay, job, blastLog, dailyReport, shots, explosiveUsage } = useBlastDay(id);
  const [activeTab, setActiveTab] = useState<Tab>('blast-log');
  const [showConditions, setShowConditions] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const online = useOnlineStatus();
  const role = (getSessionUser()?.role ?? 'blaster') as Role;

  if (!blastDay) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>Loading...</p>
      </div>
    );
  }

  const status = blastDay.status;
  const locked = status === 'approved' && !canEditApproved(role);

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
  if (status === 'draft' && canTransitionStatus('draft', 'submitted', role)) {
    statusActions.push(
      <Button key="submit" size="sm" variant="secondary" onClick={() => submitViaSync('submitted')}>
        Submit for Review
      </Button>,
    );
  }
  if (status === 'submitted') {
    if (canTransitionStatus('submitted', 'approved', role)) {
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
    } else if (canTransitionStatus('submitted', 'draft', role)) {
      statusActions.push(
        <Button key="withdraw" size="sm" variant="secondary" onClick={() => submitViaSync('draft')}>
          Withdraw
        </Button>,
      );
    }
  }
  if (status === 'approved' && canEditApproved(role)) {
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
            <h2 className="font-bold text-lg truncate leading-tight">{job?.name ?? 'Blast Day'}</h2>
            <p className="text-xs text-navy-200 truncate">
              {formatDate(blastDay.date)} ({dayOfWeek(blastDay.date)}) ·{' '}
              {[job?.address, job?.city, job?.state].filter(Boolean).join(', ') || job?.customer}
            </p>
          </div>
          <Badge variant={blastDay.status as 'draft' | 'submitted' | 'approved'}>
            {blastDay.status}
          </Badge>
          {statusActions}
          <button
            className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20"
            title="Visual Blast Report"
            onClick={() => navigate(`/blast-day/${blastDay.id}/report`)}
          >
            <FileBarChart className="h-5 w-5" />
          </button>
          <button
            className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20"
            title={activeTab === 'blast-log' ? 'Print Blasting Log' : 'Print Daily Report'}
            onClick={() =>
              navigate(
                activeTab === 'blast-log'
                  ? `/blast-day/${blastDay.id}/print`
                  : `/blast-day/${blastDay.id}/print-daily`,
              )
            }
          >
            <Printer className="h-5 w-5" />
          </button>
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
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                checked={blastDay.fireDetail}
                onChange={(e) => updateBlastDay('fireDetail', e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-navy focus:ring-navy-400"
              />
              <span className="text-sm font-medium">Fire Detail</span>
            </label>
          </div>
        )}
        </div>
      </div>

      {/* Segmented tab control (wireframe §4.3) */}
      <div className="px-4 pt-3">
        <div className="max-w-5xl mx-auto">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {(
              [
                ['blast-log', 'Blast Log', FileText],
                ['daily-report', 'Daily Report', ClipboardList],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-md transition-all min-h-[44px] ${
                  activeTab === key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab(key)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

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
            This blast day is approved and locked. A supervisor can reopen it if something
            needs to change.
          </p>
        </div>
      )}

      {/* Tab content — read-only once approved (server enforces this too) */}
      <div
        className={locked ? 'p-4 max-w-5xl mx-auto pointer-events-none select-none opacity-70' : 'p-4 max-w-5xl mx-auto'}
        aria-disabled={locked || undefined}
      >
        {activeTab === 'blast-log' && blastLog && (
          <BlastLogForm
            blastDay={blastDay}
            blastLog={blastLog}
            shots={shots}
            explosiveUsage={explosiveUsage}
            job={job}
          />
        )}
        {activeTab === 'daily-report' && dailyReport && (
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

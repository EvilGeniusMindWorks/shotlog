import { useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, ClipboardList, ChevronDown, ChevronUp, FileBarChart, Printer } from 'lucide-react';
import { useBlastDay } from '@/hooks/useBlastDay';
import { db } from '@/db';
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

  if (!blastDay) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>Loading...</p>
      </div>
    );
  }

  const updateConditions = (field: string, value: string | boolean) => {
    const updated = { ...blastDay.conditions, [field]: value };
    db.blastDays.update(blastDay.id, { conditions: updated, updatedAt: nowISO() });
  };

  const updateBlastDay = (field: string, value: string | boolean) => {
    db.blastDays.update(blastDay.id, { [field]: value, updatedAt: nowISO() });
  };

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

      {/* Tab content */}
      <div className="p-4 max-w-5xl mx-auto">
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

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';
import { useBlastDay } from '@/hooks/useBlastDay';
import { db } from '@/db';
import { nowISO, formatDate, dayOfWeek } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
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

type Tab = 'blast-log' | 'daily-report';

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
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg truncate">{job?.name ?? 'Blast Day'}</h2>
            <p className="text-sm text-gray-500">
              {formatDate(blastDay.date)} ({dayOfWeek(blastDay.date)}) — {job?.customer}
            </p>
          </div>
          <Badge variant={blastDay.status as 'draft' | 'submitted' | 'approved'}>
            {blastDay.status}
          </Badge>
        </div>

        {/* Shared conditions (collapsible) */}
        <button
          className="flex items-center gap-1 text-sm text-navy font-medium w-full"
          onClick={() => setShowConditions(!showConditions)}
        >
          Conditions & Environment
          {showConditions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showConditions && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 pb-2">
            <div>
              <Label className="text-xs">Temperature</Label>
              <Select
                value={blastDay.conditions.temperatureRange}
                onChange={(e) => updateConditions('temperatureRange', e.target.value)}
                options={TEMP_OPTIONS}
              />
            </div>
            <div>
              <Label className="text-xs">Weather</Label>
              <Select
                value={blastDay.conditions.weather}
                onChange={(e) => updateConditions('weather', e.target.value)}
                options={WEATHER_OPTIONS}
              />
            </div>
            <div>
              <Label className="text-xs">Wind Direction</Label>
              <Input
                value={blastDay.conditions.windDirection}
                onChange={(e) => updateConditions('windDirection', e.target.value)}
                placeholder="NW"
              />
            </div>
            <div>
              <Label className="text-xs">Ground</Label>
              <Select
                value={blastDay.conditions.groundConditions}
                onChange={(e) => updateConditions('groundConditions', e.target.value)}
                options={GROUND_OPTIONS}
              />
            </div>
            <div>
              <Label className="text-xs">Type of Work</Label>
              <Select
                value={blastDay.typeOfWork}
                onChange={(e) => updateBlastDay('typeOfWork', e.target.value)}
                options={WORK_TYPE_OPTIONS}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 h-10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={blastDay.fireDetail}
                  onChange={(e) => updateBlastDay('fireDetail', e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-navy focus:ring-navy-400"
                />
                <span className="text-sm">Fire Detail</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-white sticky top-[72px] z-10">
        <button
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'blast-log'
              ? 'border-navy text-navy'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('blast-log')}
        >
          <FileText className="h-4 w-4" />
          Blast Log
        </button>
        <button
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'daily-report'
              ? 'border-navy text-navy'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('daily-report')}
        >
          <ClipboardList className="h-4 w-4" />
          Daily Report
        </button>
      </div>

      {/* Tab content */}
      <div className="p-4">
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

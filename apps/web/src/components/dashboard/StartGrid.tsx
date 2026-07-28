// Doc-first launcher: big Start tiles per document type. Job-scoped docs get
// a one-tap job pick (skipped entirely when there's a single active job); the
// work-day container is found-or-created quietly by openTodaysDoc.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bomb,
  ClipboardCheck,
  ClipboardList,
  Drill,
  X,
} from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { openTodaysDoc, type LauncherDoc } from '@/hooks/useLauncher';
import { createIncident } from '@/pages/admin/AdminIncidentsPage';
import type { IncidentType } from '@/db/schema';
import { IconChip } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';
import { RigPickerModal } from './RigPickerModal';

type Tile =
  | { kind: LauncherDoc; label: string; hint: string; icon: JSX.Element }
  | { kind: 'checklist'; label: string; hint: string; icon: JSX.Element }
  | { kind: 'incident'; label: string; hint: string; icon: JSX.Element };

const TILES: Record<string, Tile> = {
  blast_day: {
    kind: 'blast_day',
    label: 'Blast Day',
    hint: 'Blast log + daily report',
    icon: <IconChip tint="orange"><Bomb className="h-4 w-4" /></IconChip>,
  },
  drill_plan: {
    kind: 'drill_plan',
    label: 'Drill Plan',
    hint: 'Design the pattern, send to drillers',
    icon: <IconChip tint="navy"><Drill className="h-4 w-4" /></IconChip>,
  },
  drill_log: {
    kind: 'drill_log',
    label: 'Drill Log',
    hint: 'Start logging holes',
    icon: <IconChip tint="navy"><Drill className="h-4 w-4" /></IconChip>,
  },
  daily_report: {
    kind: 'daily_report',
    label: 'Daily Report',
    hint: 'Crew, equipment, materials',
    icon: <IconChip tint="blue"><ClipboardList className="h-4 w-4" /></IconChip>,
  },
  checklist: {
    kind: 'checklist',
    label: 'Rig Checklist',
    hint: 'Daily rock-drill checks',
    icon: <IconChip tint="green"><ClipboardCheck className="h-4 w-4" /></IconChip>,
  },
  incident: {
    kind: 'incident',
    label: 'Incident',
    hint: 'Complaint, strike, or damage',
    icon: <IconChip tint="red"><AlertTriangle className="h-4 w-4" /></IconChip>,
  },
};

const ROLE_TILES: Record<string, (keyof typeof TILES)[]> = {
  blaster: ['blast_day', 'drill_plan', 'daily_report', 'checklist', 'incident'],
  supervisor: ['blast_day', 'drill_plan', 'daily_report', 'checklist', 'incident'],
  driller: ['drill_log', 'checklist', 'daily_report', 'incident'],
};

export function StartGrid({ role }: { role: string }) {
  const navigate = useNavigate();
  const [pickFor, setPickFor] = useState<LauncherDoc | null>(null);
  const [showRigs, setShowRigs] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const [busy, setBusy] = useState(false);
  const jobs =
    useLiveQuery(() =>
      db.jobs
        .filter((j) => j.isActive)
        .toArray()
        .then((xs) => [...xs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    ) ?? [];

  const tiles = (ROLE_TILES[role] ?? []).map((k) => TILES[k]);
  if (tiles.length === 0) return null;

  const launch = async (kind: LauncherDoc, jobId: string) => {
    setBusy(true);
    try {
      await openTodaysDoc(kind, jobId, navigate);
    } finally {
      setBusy(false);
      setPickFor(null);
    }
  };

  const tapTile = (tile: Tile) => {
    if (tile.kind === 'checklist') return setShowRigs(true);
    if (tile.kind === 'incident') return setShowIncident(true);
    // Single active job — skip the picker entirely
    if (jobs.length === 1) return void launch(tile.kind, jobs[0].id);
    setPickFor(tile.kind);
  };

  return (
    <div className="mb-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
        Start something
      </p>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <button
            key={tile.label}
            disabled={busy}
            className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white p-3 text-left hover:shadow-md active:scale-[0.99] transition disabled:opacity-60"
            onClick={() => tapTile(tile)}
          >
            {tile.icon}
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{tile.label}</span>
              <span className="block text-[11px] text-gray-400 truncate">{tile.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {pickFor && (
        <JobPickSheet
          jobs={jobs}
          busy={busy}
          onPick={(jobId) => void launch(pickFor, jobId)}
          onClose={() => setPickFor(null)}
        />
      )}
      {showRigs && <RigPickerModal onClose={() => setShowRigs(false)} />}
      {showIncident && <IncidentTypeSheet onClose={() => setShowIncident(false)} />}
    </div>
  );
}

function JobPickSheet({
  jobs,
  busy,
  onPick,
  onClose,
}: {
  jobs: { id: string; name: string; customer: string }[];
  busy: boolean;
  onPick: (jobId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4 max-h-[70vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold">Which job?</p>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="space-y-1">
          {jobs.map((j) => (
            <button
              key={j.id}
              disabled={busy}
              className="w-full flex flex-col items-start px-3 py-2.5 rounded-lg border border-gray-200 text-left hover:bg-gray-50 disabled:opacity-60"
              onClick={() => onPick(j.id)}
            >
              <span className="text-sm font-semibold">{j.name}</span>
              <span className="text-xs text-gray-400">{j.customer}</span>
            </button>
          ))}
          {jobs.length === 0 && (
            <p className="text-sm text-gray-400 py-2">
              No active jobs yet — an admin can add one under Jobs.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const INCIDENT_TYPES: { value: IncidentType; label: string; hint: string }[] = [
  { value: 'blasting', label: 'Blasting complaint', hint: 'Damage claim / vibration complaint' },
  { value: 'utility', label: 'Utility strike', hint: 'Gas, water, electric, comms' },
  { value: 'asset', label: 'Asset incident', hint: 'Equipment or vehicle damage' },
];

function IncidentTypeSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const start = async (type: IncidentType) => {
    setBusy(true);
    const id = await createIncident(type);
    navigate(`/incident/${id}`);
  };
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold">What happened?</p>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="space-y-1">
          {INCIDENT_TYPES.map((t) => (
            <button
              key={t.value}
              disabled={busy}
              className="w-full flex flex-col items-start px-3 py-2.5 rounded-lg border border-gray-200 text-left hover:bg-gray-50 disabled:opacity-60"
              onClick={() => void start(t.value)}
            >
              <span className="text-sm font-semibold">{t.label}</span>
              <span className="text-xs text-gray-400">{t.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

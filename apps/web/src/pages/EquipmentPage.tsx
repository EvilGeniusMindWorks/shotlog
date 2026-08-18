// Equipment history: the asset's full story — where it worked (jobs, drill
// logs, daily reports), its checklists and repairs — plus the status control
// (Active / In shop / Retired). Reachable from the shop board, the admin
// registry, and anywhere a rig is named.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  ClipboardCheck,
  Drill,
  FileText,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { cn, formatDate, nowISO } from '@/lib/utils';
import { buildEquipmentTimeline, type EquipmentEvent } from '@/lib/equipmentHistory';
import { HourLedgerCard } from '@/components/records/HourLedgerCard';
import { AssetPMCard } from '@/components/shop/AssetPMCard';
import type { EquipmentStatus } from '@/db/schema';
import { Badge } from '@/components/ui/badge';

const STATUS_OPTIONS: { value: EquipmentStatus; label: string }[] = [
  { value: 'active', label: '● Active' },
  { value: 'in_shop', label: '🔧 In shop' },
  { value: 'retired', label: '⊘ Retired' },
];

const KIND_ICON: Record<EquipmentEvent['kind'], typeof Wrench> = {
  checklist: ClipboardCheck,
  ticket_open: Wrench,
  ticket_resolved: Wrench,
  drill_log: Drill,
  daily_report: FileText,
  incident: TriangleAlert,
};

export function EquipmentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showAllHistory, setShowAllHistory] = useState(false);
  const role = getSessionUser()?.role ?? '';
  const canSetStatus = role === 'mechanic' || role === 'supervisor' || role === 'admin';

  const equip = useLiveQuery(() => (id ? db.equipment.get(id) : undefined), [id]);
  const openOOS = useLiveQuery(
    async () =>
      id
        ? (await db.repairTickets
            .filter((t) => t.equipmentId === id && t.status === 'open' && t.outOfService)
            .count()) > 0
        : false,
    [id],
  );
  const timeline = useLiveQuery(
    async () => (equip ? buildEquipmentTimeline(equip) : undefined),
    [equip?.id, equip?.assetNumber],
  );

  if (!equip) return <div className="p-4 text-center text-gray-500">Loading…</div>;

  const status = equip.status ?? 'active';
  const spec = [
    [equip.make, equip.year, equip.model].filter(Boolean).join(' '),
    equip.serialNumber && `SN ${equip.serialNumber}`,
    equip.plate && `plate ${equip.plate}`,
    equip.category.replace(/_/g, ' '),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      <div className="flex items-center gap-2">
        <button
          className="h-10 w-10 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-gray-900 truncate">
            {equip.assetNumber} — {equip.description}
          </h2>
          {spec && <p className="text-xs text-gray-400 truncate">{spec}</p>}
        </div>
      </div>

      {/* Status + vitals header */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              disabled={!canSetStatus}
              className={cn(
                'min-h-[38px] px-3 rounded-full border text-sm font-medium',
                status === o.value
                  ? o.value === 'active'
                    ? 'bg-green-600 text-white border-green-600'
                    : o.value === 'in_shop'
                      ? 'bg-safety-orange text-white border-safety-orange'
                      : 'bg-gray-500 text-white border-gray-500'
                  : 'bg-white text-gray-600 border-gray-300',
                !canSetStatus && 'opacity-60',
              )}
              onClick={() =>
                canSetStatus && void db.equipment.update(equip.id, { status: o.value, updatedAt: nowISO() })
              }
            >
              {o.label}
            </button>
          ))}
        </div>
        {openOOS && (
          <p className="text-xs text-safety-orange">
            Open out-of-service repair ticket — resolving it in the shop queue restores Active
            automatically.
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
          {equip.hourMeter != null && (
            <span className="font-mono">{equip.hourMeter.toLocaleString()} hrs</span>
          )}
          {equip.odometer != null && (
            <span className="font-mono">{equip.odometer.toLocaleString()} mi</span>
          )}
          {equip.dotInspectionDue && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5 text-gray-400" /> DOT due{' '}
              {formatDate(equip.dotInspectionDue)}
            </span>
          )}
          {equip.calibrationDue && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5 text-gray-400" /> calibration due{' '}
              {formatDate(equip.calibrationDue)}
            </span>
          )}
        </div>
        {equip.notes && <p className="text-xs text-gray-400">{equip.notes}</p>}
      </div>

      {/* Hour ledger: sourced readings + shop corrections, current derived */}
      <HourLedgerCard equip={equip} />

      {/* PM schedule on flagged assumptions (Round 4) — advisory only */}
      <AssetPMCard equip={equip} />

      {/* History timeline — windowed (Round 5): recent first, rest behind
          one tap; never an unbounded scroll */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
          History
        </p>
        {(showAllHistory ? (timeline ?? []) : (timeline ?? []).slice(0, 10)).map((ev) => {
          const Icon = KIND_ICON[ev.kind];
          const inner = (
            <>
              <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', ev.flag ? 'text-safety-orange' : 'text-gray-400')} />
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium truncate', ev.flag && 'text-safety-orange')}>
                  {ev.title}
                </p>
                <p className="text-xs text-gray-400 truncate">{ev.sub}</p>
              </div>
              <span className="text-[11px] text-gray-300 shrink-0">{formatDate(ev.date)}</span>
            </>
          );
          return ev.to ? (
            <button
              key={ev.key}
              className="w-full flex items-start gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg"
              onClick={() => navigate(ev.to!)}
            >
              {inner}
            </button>
          ) : (
            <div key={ev.key} className="flex items-start gap-2 py-1.5">
              {inner}
            </div>
          );
        })}
        {timeline !== undefined && timeline.length === 0 && (
          <p className="text-sm text-gray-400 py-1">No history yet for this asset.</p>
        )}
        {!showAllHistory && (timeline ?? []).length > 10 && (
          <button
            className="text-xs text-gray-400 underline underline-offset-2 mt-1"
            onClick={() => setShowAllHistory(true)}
          >
            Show all {timeline!.length} events
          </button>
        )}
      </div>

      {(role === 'admin' || role === 'supervisor' || role === 'mechanic') && (
        <div className="flex gap-2">
          <button className="text-xs text-navy underline" onClick={() => navigate('/admin/equipment')}>
            Edit details in the registry
          </button>
          {(equip.category === 'rock_drill' || equip.category === 'equip_drill') && (
            <button
              className="text-xs text-navy underline"
              onClick={() => navigate(`/drill-checklist/${equip.id}`)}
            >
              File a checklist
            </button>
          )}
        </div>
      )}

      {status === 'retired' && (
        <Badge variant="local">retired — hidden from field pickers</Badge>
      )}
    </div>
  );
}

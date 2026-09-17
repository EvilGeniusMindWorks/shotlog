// Rig checklists on a day (Round S14): the tile IS the list of today's rigs.
// Each rig is one plain row with its two readings — the machine's own meter
// at the start and at the stop. Tap a row for its sheet: open the checklist,
// stop it for the day (asks the reading), or take it out of service (asks the
// reading now and opens the shop's ticket). Nothing is shared between rigs
// and nothing here is about the driller's time.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Tractor } from 'lucide-react';
import type { BlastDay, DrillChecklist } from '@/db/schema';
import { stopChecklist } from '@/hooks/useMaintenance';
import { hhmm } from '@/lib/dayCard';
import { formatDate, todayISO } from '@/lib/utils';
import { can } from '@/lib/perms';
import { ConsequenceSheet } from '@/components/records/LifecycleMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface RigRow {
  checklist: DrillChecklist;
  asset: string;
}

const fmtH = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function rigLine(r: RigRow): string {
  const c = r.checklist;
  const start = c.startingHours != null ? fmtH(c.startingHours) : '—';
  if (c.stopHours != null) {
    const used = c.startingHours != null ? ` · ${fmtH(c.stopHours - c.startingHours)} h` : '';
    const at = c.filedAt ?? c.stoppedAt;
    return c.stoppedOutOfService
      ? `${start} → ${fmtH(c.stopHours)}${used} · out of service${at ? ` ${hhmm(at)}` : ''}`
      : `${start} → ${fmtH(c.stopHours)}${used} · filed${at ? ` ${hhmm(at)}` : ''}`;
  }
  if (c.outOfService) return `${start} · out of service on the checklist`;
  // S20 (Matthew, Sep 16 2026): nothing "runs" — the paper is waiting for its stop hours
  return `walk-around ${hhmm(c.walkAroundAt ?? c.createdAt)} · ${start} → stop hours missing`;
}

export function RigList({
  day,
  rows,
  readOnly,
}: {
  day: BlastDay;
  rows: RigRow[];
  readOnly: boolean;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<RigRow | null>(null);
  const [ask, setAsk] = useState<{ row: RigRow; down: boolean } | null>(null);
  const [reading, setReading] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canAct = !readOnly && can('drillChecklists', 'PATCH');
  const waiting = rows.filter((r) => r.checklist.stopHours == null && !r.checklist.outOfService).length;
  const allComplete = rows.length > 0 && waiting === 0;
  // S19 (Matthew): a day that is not today says which day it is counting
  const when = day.date === todayISO() ? 'today' : `on ${formatDate(day.date)}`;

  const save = async () => {
    if (!ask) return;
    const v = parseFloat(reading);
    const floor = ask.row.checklist.startingHours ?? 0;
    if (!Number.isFinite(v)) return setError('Enter the meter reading.');
    if (v < floor) return setError(`The stop reading can't be below the start reading (${fmtH(floor)}).`);
    await stopChecklist(ask.row.checklist, v, { outOfService: ask.down });
    const id = ask.row.checklist.id;
    setAsk(null);
    setOpen(null);
    setReading('');
    setError(null);
    // S20: the reading completes the paper — file the office copy now
    navigate(`/drill-checklist-file/${id}?ticket=1`);
  };

  return (
    <div data-tile="rigs" data-tile-state={rows.length === 0 ? 'none' : allComplete ? 'complete' : 'open'}>
      <div
        className={`rounded-t-xl border px-3 py-2.5 flex items-center gap-3 ${
          rows.length === 0 ? 'border-gray-200 bg-white' : allComplete ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'
        }`}
      >
        <Tractor className="h-5 w-5 text-gray-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">Rig checklists</p>
          <p className="text-xs text-gray-600">
            {rows.length === 0 ? `None ${when} · the rig is the first question` : `${rows.length} ${when} · ${allComplete ? 'all complete' : `${waiting} waiting for stop hours`}`}
          </p>
        </div>
      </div>
      <div className="rounded-b-xl border border-t-0 border-gray-200 bg-gray-50 px-2 py-1">
        {rows.map((r) => (
          <button
            key={r.checklist.id}
            type="button"
            className="w-full flex items-center gap-2 py-2.5 px-1 text-left border-t border-gray-100 first:border-t-0 min-h-[44px]"
            data-rig-row={r.asset}
            onClick={() => setOpen(r)}
          >
            <span className="flex-1 min-w-0 text-sm">
              <b>{r.asset}</b>
              <span className="text-gray-600"> · {rigLine(r)}</span>
              {r.checklist.drillerName && <span className="text-gray-400"> · {r.checklist.drillerName}</span>}
            </span>
            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
          </button>
        ))}
        {!readOnly && can('drillChecklists', 'PUT') && (
          <button
            type="button"
            className="w-full flex items-center gap-2 py-2.5 px-1 text-left border-t border-gray-100 min-h-[44px] text-sm font-semibold text-navy"
            data-rig-start
            // S19: the door hands the checklist this day's date, so it lands on these tiles
            onClick={() => navigate(`/drill-checklist?job=${day.jobId}&date=${day.date}&day=${day.id}`)}
          >
            <span className="flex-1">{rows.length === 0 ? 'Start a checklist' : 'Start a checklist for another rig'}</span>
            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
          </button>
        )}
      </div>

      {open && !ask && (
        <ConsequenceSheet onClose={() => setOpen(null)}>
          <div data-rig-sheet={open.asset}>
            <h3 className="font-bold text-lg">{open.asset}</h3>
            <p className="text-sm text-gray-600 mb-3">{rigLine(open)}{open.checklist.drillerName ? ` · ${open.checklist.drillerName}` : ''}</p>
            <button
              type="button"
              className="w-full text-left rounded-lg border border-gray-200 bg-white px-3 py-3 mb-2 min-h-[48px]"
              onClick={() => navigate(`/drill-checklist-print/${open.checklist.id}`)}
            >
              <span className="font-semibold">Open the checklist</span>
              <span className="block text-xs text-gray-500">the checks, the readings, the signature</span>
            </button>
            {canAct && open.checklist.stopHours == null && (
              <>
                <button
                  type="button"
                  className="w-full text-left rounded-lg border border-gray-200 bg-white px-3 py-3 mb-2 min-h-[48px]"
                  data-rig-stop
                  // S20 (Matthew): the stop hours go on the checklist itself — one paper, filed then
                  onClick={() => navigate(`/drill-checklist/${open.checklist.equipmentId}?job=${day.jobId}&date=${day.date}&day=${day.id}`)}
                >
                  <span className="font-semibold">Enter the stop hours</span>
                  <span className="block text-xs text-gray-500">on the checklist · completes it and files the office copy</span>
                </button>
                <button
                  type="button"
                  className="w-full text-left rounded-lg border border-gray-200 bg-white px-3 py-3 mb-2 min-h-[48px]"
                  data-rig-down
                  onClick={() => { setAsk({ row: open, down: true }); setReading(''); setError(null); }}
                >
                  <span className="font-semibold">Out of service</span>
                  <span className="block text-xs text-gray-500">the reading now · opens a repair ticket for the shop</span>
                </button>
              </>
            )}
            <Button variant="outline" className="w-full mt-1" onClick={() => setOpen(null)}>
              Close
            </Button>
          </div>
        </ConsequenceSheet>
      )}

      {ask && (
        <ConsequenceSheet onClose={() => setAsk(null)}>
          <div data-rig-reading>
            <h3 className="font-bold text-lg">
              {ask.row.asset} — meter reading {ask.down ? 'when it went down' : 'when it stopped'}
            </h3>
            <p className="text-sm text-gray-600">
              This rig's own meter. It started the day at {ask.row.checklist.startingHours != null ? fmtH(ask.row.checklist.startingHours) : '—'}.
            </p>
            <Label className="text-xs mt-3 block">Hours on the meter</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              autoFocus
              value={reading}
              placeholder={ask.row.checklist.startingHours != null ? `e.g. ${fmtH(ask.row.checklist.startingHours + 6.4)}` : ''}
              data-rig-reading-input
              onChange={(e) => { setReading(e.target.value); setError(null); }}
            />
            {error && <p className="text-sm text-violation mt-1">{error}</p>}
            {ask.down && <p className="text-xs text-gray-500 mt-2">A repair ticket opens for the shop, as it does from the checklist.</p>}
            <div className="flex gap-2 mt-3">
              <Button className="flex-1" data-rig-reading-save onClick={() => void save()}>
                Save
              </Button>
              <Button variant="outline" onClick={() => setAsk(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </ConsequenceSheet>
      )}
    </div>
  );
}

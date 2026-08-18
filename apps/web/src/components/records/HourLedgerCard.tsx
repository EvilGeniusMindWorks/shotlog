// The equipment HOUR LEDGER card (shop charter, 2026-08-17): every meter
// reading as a sourced entry, current hours derived, and the shop's
// "Correct hours" gesture — an append-only correction that keeps both
// values (audited server-side, never editable).
import { useState } from 'react';
import { Gauge, Wrench } from 'lucide-react';
import { useLiveQuery } from '@/db';
import type { Equipment } from '@/db/schema';
import { buildHourLedger, fileHourCorrection, type HourSource } from '@/lib/hourLedger';
import { hasCap } from '@/lib/perms';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showToast } from '@/components/ui/undo-toast';

const SOURCE_LABEL: Record<HourSource, string> = {
  checklist: 'checklist',
  daily_report: 'daily report',
  correction: 'shop correction',
};

const SHOW_INITIAL = 8;

export function HourLedgerCard({ equip }: { equip: Equipment }) {
  const [correcting, setCorrecting] = useState(false);
  const [observed, setObserved] = useState('');
  const [note, setNote] = useState('');
  const [showAll, setShowAll] = useState(false);
  const ledger = useLiveQuery(() => buildHourLedger(equip), [equip.id, equip.hourMeter]);
  const canCorrect = hasCap('correct_hours');

  const entries = ledger?.entries ?? [];
  const shown = showAll ? entries : entries.slice(0, SHOW_INITIAL);

  const save = async () => {
    const hours = parseFloat(observed);
    if (!Number.isFinite(hours) || hours < 0) return;
    await fileHourCorrection(equip, hours, note.trim());
    setCorrecting(false);
    setObserved('');
    setNote('');
    showToast(`Hour meter corrected to ${hours.toLocaleString()} hrs`);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Hour Ledger
        </p>
        {canCorrect && !correcting && (
          <button
            className="text-xs text-navy underline underline-offset-2"
            onClick={() => setCorrecting(true)}
          >
            Correct hours
          </button>
        )}
      </div>

      <p className="flex items-baseline gap-2 mb-2">
        <Gauge className="h-4 w-4 text-gray-400 self-center" />
        <span className="font-mono text-xl font-bold text-navy">
          {ledger?.currentHours != null ? ledger.currentHours.toLocaleString() : '—'}
        </span>
        <span className="text-xs text-gray-400">hrs · from the latest entry</span>
      </p>

      {correcting && (
        <div className="border border-dashed border-gray-300 rounded-lg p-3 mb-2 space-y-2">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="w-36">
              <Label className="text-xs">Meter reads</Label>
              <Input
                type="number"
                inputMode="decimal"
                autoFocus
                value={observed}
                onChange={(e) => setObserved(e.target.value)}
                placeholder={equip.hourMeter != null ? String(equip.hourMeter) : 'hours'}
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <Label className="text-xs">Why (optional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="meter replaced, typo in checklist…"
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-400">
            Corrections are permanent ledger entries — the app keeps what it showed (
            {equip.hourMeter != null ? `${equip.hourMeter.toLocaleString()} hrs` : 'nothing'}) and
            what the meter reads, attributed to you.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={!observed}>
              Save correction
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCorrecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {shown.map((e) => (
        <div key={e.key} className="flex items-center gap-2 py-1 text-sm">
          {e.source === 'correction' ? (
            <Wrench className="h-3.5 w-3.5 text-safety-orange shrink-0" />
          ) : (
            <Gauge className="h-3.5 w-3.5 text-gray-300 shrink-0" />
          )}
          <span className="font-mono font-medium w-20 text-right">
            {e.hours.toLocaleString()}
          </span>
          <span className="text-xs text-gray-400 flex-1 truncate">
            {SOURCE_LABEL[e.source]} · {e.who}
            {e.source === 'correction' && e.previousHours != null && (
              <> · was {e.previousHours.toLocaleString()}</>
            )}
            {e.note && <> · {e.note}</>}
          </span>
          <span className="text-[11px] text-gray-300 shrink-0">{formatDate(e.date)}</span>
        </div>
      ))}
      {entries.length > SHOW_INITIAL && !showAll && (
        <button
          className="text-xs text-gray-400 underline underline-offset-2 mt-1"
          onClick={() => setShowAll(true)}
        >
          Show all {entries.length} entries
        </button>
      )}
      {ledger !== undefined && entries.length === 0 && (
        <p className="text-sm text-gray-400 py-1">
          No readings yet — checklists and daily reports feed this ledger.
        </p>
      )}
    </div>
  );
}

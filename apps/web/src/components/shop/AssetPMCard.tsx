// Service schedule on FLAGGED ASSUMPTIONS (Round 4, shop study §4): the
// shape is the commitment, the numbers are not. Advisory everywhere —
// nothing blocks. Real intervals swap in when the shop crew answers.
import { useState } from 'react';
import { db, useLiveQuery } from '@/db';
import type { Equipment } from '@/db/schema';
import { buildAssetPM, ASSUMED_PM_INTERVALS } from '@/lib/pm';
import { getSessionUser } from '@/lib/session';
import { formatDate, generateId, nowISO, todayISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { showToast } from '@/components/ui/undo-toast';

const STATE_CHIP: Record<string, { text: string; cls: string }> = {
  ok: { text: 'ok', cls: 'bg-green-100 text-green-700' },
  'due-soon': { text: 'due soon', cls: 'bg-amber-100 text-amber-700' },
  due: { text: 'due', cls: 'bg-red-100 text-red-700' },
  unknown: { text: 'no baseline', cls: 'bg-gray-100 text-gray-500' },
};

export function AssetPMCard({ equip }: { equip: Equipment }) {
  const pm = useLiveQuery(() => buildAssetPM(equip), [equip.id, equip.updatedAt]);
  const [logging, setLogging] = useState(false);
  const [type, setType] = useState('');
  const [atHours, setAtHours] = useState('');
  const intervals = ASSUMED_PM_INTERVALS[equip.category] ?? [];

  if (!pm) return null;

  const logService = async () => {
    const hours = parseFloat(atHours);
    if (!type || !Number.isFinite(hours)) return;
    const me = getSessionUser();
    await db.equipment.update(equip.id, {
      services: [
        ...(equip.services ?? []),
        { id: generateId(), type, atHours: hours, date: todayISO(), byName: me?.name ?? '' },
      ],
      updatedAt: nowISO(),
    });
    setLogging(false);
    setType('');
    setAtHours('');
    showToast('Service logged — the due clock restarts from here');
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
        Service schedule
      </p>
      <p className="text-[11.5px] text-amber-800 bg-amber-50 border border-dashed border-amber-500 rounded-lg px-2.5 py-1.5 mb-2">
        ⚠ ASSUMED intervals — placeholders until the shop crew supplies the real ones. Nothing
        here blocks anything.
      </p>
      {pm.rows.map((row) => {
        const chip = STATE_CHIP[row.state];
        return (
          <div
            key={row.interval.type}
            className="flex items-center gap-2 py-1.5 border-t border-gray-100 first:border-t-0 text-sm"
          >
            <div className="flex-1 min-w-0">
              <p className="truncate">{row.interval.label}</p>
              {row.lastDate && (
                <p className="text-xs text-gray-400">
                  last at {row.lastAtHours?.toLocaleString()} h · {formatDate(row.lastDate)}
                </p>
              )}
            </div>
            <span className="font-mono font-bold text-sm">
              {row.sinceHours != null
                ? `${Math.round(row.sinceHours)}/${row.interval.intervalHours}`
                : `—/${row.interval.intervalHours}`}
            </span>
            <span className={`text-[10.5px] font-bold rounded-full px-2 py-0.5 ${chip.cls}`}>
              {chip.text}
            </span>
          </div>
        );
      })}
      {!logging ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={() => setLogging(true)}>
          Log a service done
        </Button>
      ) : (
        <div className="border border-dashed border-gray-300 rounded-lg p-3 mt-2 space-y-2">
          <div className="flex gap-2 items-end flex-wrap">
            <div className="w-52">
              <Label className="text-xs">Service</Label>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="Pick…"
                options={intervals.map((i) => ({ value: i.type, label: i.label }))}
              />
            </div>
            <div className="w-28">
              <Label className="text-xs">At hours</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={atHours}
                onChange={(e) => setAtHours(e.target.value)}
                placeholder={pm.currentHours != null ? String(pm.currentHours) : 'hours'}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void logService()} disabled={!type || !atHours}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLogging(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

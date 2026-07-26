// One driller's signed drill log for a shot. Fast entry: hole number
// auto-increments, depth defaults to the pattern's design, conditions are
// single-tap toggles. Blaster accepts a completed log to take the pattern
// for loading (which locks it against driller edits — server-enforced).
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Droplets, Printer, Trash2 } from 'lucide-react';
import { canEditAcceptedDrillLog, canTransitionDrillLog, type Role } from '@shotlog/shared';
import { useLiveQuery, db } from '@/db';
import { addHole, nextHoleNumber } from '@/hooks/useDrillLogs';
import { getSessionUser } from '@/lib/session';
import { nowISO, formatDate } from '@/lib/utils';
import type { HoleConditionCode } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SignatureField } from '@/components/ui/signature-field';

const CONDITIONS: { code: HoleConditionCode; label: string }[] = [
  { code: 'W', label: 'Water' },
  { code: 'V', label: 'Void' },
  { code: 'SR', label: 'Soft Rock' },
  { code: 'O', label: 'Overburden' },
];

const STATUS_BADGE = { open: 'draft', complete: 'submitted', accepted: 'approved' } as const;

export function DrillLogPage() {
  const { id: blastDayId, logId } = useParams<{ id: string; logId: string }>();
  const navigate = useNavigate();
  const role = (getSessionUser()?.role ?? 'driller') as Role;
  const me = getSessionUser();

  const log = useLiveQuery(() => (logId ? db.drillLogs.get(logId) : undefined), [logId]);
  const holes =
    useLiveQuery(
      async () =>
        logId
          ? (await db.drillLogHoles.where('drillLogId').equals(logId).toArray()).sort((a, b) =>
              a.holeNumber.localeCompare(b.holeNumber, undefined, { numeric: true }),
            )
          : [],
      [logId],
    ) ?? [];
  const shot = useLiveQuery(() => (log ? db.shots.get(log.shotId) : undefined), [log?.shotId]);
  const job = useLiveQuery(() => (log ? db.jobs.get(log.jobId) : undefined), [log?.jobId]);
  const rigs =
    useLiveQuery(() =>
      db.equipment
        .filter((e) => e.isActive && (e.category === 'rock_drill' || e.category === 'equip_drill'))
        .toArray(),
    ) ?? [];

  // Quick-entry state
  const [holeNumber, setHoleNumber] = useState('');
  const [depth, setDepth] = useState('');
  const [conditions, setConditions] = useState<HoleConditionCode[]>([]);
  const [comment, setComment] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [angle, setAngle] = useState('0');
  const [subdrill, setSubdrill] = useState('');

  useEffect(() => {
    if (log && !holeNumber) {
      void nextHoleNumber(log.shotId).then((n) => setHoleNumber(String(n)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log?.id]);

  if (!log) return <div className="p-4 text-center text-gray-500">Loading…</div>;

  const designDepth = shot?.totals.avgDrillDepth || log.faceHeight || 0;
  const designSubdrill = shot?.drillParams.subDrill ?? 0;
  const locked = log.status === 'accepted' && !canEditAcceptedDrillLog(role);
  const editable = !locked && log.status !== 'accepted';
  const footage = holes.reduce((s, h) => s + h.actualDepth, 0);

  const update = (changes: Record<string, unknown>) =>
    db.drillLogs.update(log.id, { ...changes, updatedAt: nowISO() });

  const submitHole = async () => {
    const d = parseFloat(depth) || designDepth;
    if (!holeNumber.trim() || d <= 0) return;
    await addHole(log, {
      holeNumber: holeNumber.trim(),
      actualDepth: d,
      angle: parseFloat(angle) || 0,
      subdrill: subdrill === '' ? designSubdrill : parseFloat(subdrill) || 0,
      conditions,
      comment: comment.trim(),
    });
    const n = parseInt(holeNumber, 10);
    setHoleNumber(Number.isNaN(n) ? '' : String(n + 1));
    setDepth('');
    setConditions([]);
    setComment('');
  };

  return (
    <div>
      <div className="bg-navy text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200 hover:text-white hover:bg-white/10"
            onClick={() => navigate(`/blast-day/${blastDayId}`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg truncate leading-tight">
              Drill Log — Shot {shot?.shotNumber ?? '?'}
            </h2>
            <p className="text-xs text-navy-200 truncate">
              {job?.name} · {log.drillerName || 'unassigned'} · {holes.length} holes ·{' '}
              {footage.toFixed(0)} ft
            </p>
          </div>
          <Badge variant={STATUS_BADGE[log.status]}>{log.status}</Badge>
          {log.status === 'open' && canTransitionDrillLog('open', 'complete', role) && (
            <Button size="sm" variant="secondary" disabled={holes.length === 0}
              onClick={() => void update({ status: 'complete', completedAt: nowISO() })}>
              Mark Complete
            </Button>
          )}
          {log.status === 'complete' && canTransitionDrillLog('complete', 'accepted', role) && (
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() =>
                void update({ status: 'accepted', acceptedBy: me?.name ?? '', acceptedAt: nowISO() })
              }>
              <Check className="h-4 w-4 mr-1" /> Accept
            </Button>
          )}
          {log.status === 'complete' && canTransitionDrillLog('complete', 'open', role) && (
            <Button size="sm" variant="secondary" onClick={() => void update({ status: 'open' })}>
              Reopen
            </Button>
          )}
          {log.status === 'accepted' && canTransitionDrillLog('accepted', 'complete', role) && (
            <Button size="sm" variant="secondary" onClick={() => void update({ status: 'complete' })}>
              Un-accept
            </Button>
          )}
          <button
            className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20"
            title="Print Drill Log"
            onClick={() => navigate(`/blast-day/${blastDayId}/drill-log/${log.id}/print`)}
          >
            <Printer className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className={locked ? 'p-4 max-w-3xl mx-auto space-y-4 pointer-events-none opacity-70' : 'p-4 max-w-3xl mx-auto space-y-4'}>
        {log.status === 'accepted' && (
          <p className="text-sm text-green-800 border border-green-200 bg-green-50 rounded-lg px-3 py-2">
            Accepted by {log.acceptedBy || 'blaster'} — this pattern feeds the shot's loading.
          </p>
        )}

        {/* Header card — pattern info prefilled from design */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><Label className="text-xs">Diameter (in)</Label>
            <Input type="number" value={log.holeDiameter || ''} disabled={!editable}
              onChange={(e) => void update({ holeDiameter: parseFloat(e.target.value) || 0 })} /></div>
          <div><Label className="text-xs">Burden (ft)</Label>
            <Input type="number" value={log.burden || ''} disabled={!editable}
              onChange={(e) => void update({ burden: parseFloat(e.target.value) || 0 })} /></div>
          <div><Label className="text-xs">Spacing (ft)</Label>
            <Input type="number" value={log.spacing || ''} disabled={!editable}
              onChange={(e) => void update({ spacing: parseFloat(e.target.value) || 0 })} /></div>
          <div><Label className="text-xs">Face height (ft)</Label>
            <Input type="number" value={log.faceHeight || ''} disabled={!editable}
              onChange={(e) => void update({ faceHeight: parseFloat(e.target.value) || 0 })} /></div>
          <div className="col-span-2">
            <Label className="text-xs">Drill rig</Label>
            <Select value={log.drillRigEquipmentId ?? ''} disabled={!editable}
              onChange={(e) => void update({ drillRigEquipmentId: e.target.value || undefined })}
              options={[{ value: '', label: 'Pick rig…' },
                ...rigs.map((r) => ({ value: r.id, label: `${r.assetNumber} — ${r.description}` }))]} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Location / GPS</Label>
            <Input value={log.locationNote} placeholder="e.g. NE corner, lift 2" disabled={!editable}
              onChange={(e) => void update({ locationNote: e.target.value })} />
          </div>
        </div>

        {/* Quick hole entry */}
        {editable && (
          <div className="rounded-xl border-2 border-safety-orange/40 bg-white p-4 space-y-3">
            <div className="flex gap-2">
              <div className="w-24">
                <Label className="text-xs">Hole #</Label>
                <Input value={holeNumber} onChange={(e) => setHoleNumber(e.target.value)} />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Depth (ft) — design {designDepth || '—'}</Label>
                <Input type="number" inputMode="decimal" placeholder={String(designDepth || '')}
                  value={depth} onChange={(e) => setDepth(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map(({ code, label }) => {
                const on = conditions.includes(code);
                return (
                  <button key={code} type="button"
                    className={`min-h-[44px] px-4 rounded-full border text-sm font-medium ${
                      on
                        ? code === 'W'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-navy text-white border-navy'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                    onClick={() =>
                      setConditions(on ? conditions.filter((c) => c !== code) : [...conditions, code])
                    }>
                    {code === 'W' && <Droplets className="h-3.5 w-3.5 inline mr-1" />}
                    {label}
                  </button>
                );
              })}
            </div>
            {showDetail ? (
              <div className="flex gap-2">
                <div className="w-24"><Label className="text-xs">Angle (°)</Label>
                  <Input type="number" value={angle} onChange={(e) => setAngle(e.target.value)} /></div>
                <div className="w-28"><Label className="text-xs">Subdrill (ft)</Label>
                  <Input type="number" placeholder={String(designSubdrill)} value={subdrill}
                    onChange={(e) => setSubdrill(e.target.value)} /></div>
                <div className="flex-1"><Label className="text-xs">Comment</Label>
                  <Input value={comment} onChange={(e) => setComment(e.target.value)} /></div>
              </div>
            ) : (
              <button className="text-xs text-gray-400 underline" onClick={() => setShowDetail(true)}>
                angle / subdrill / comment
              </button>
            )}
            <Button className="w-full" size="lg" onClick={() => void submitHole()}
              disabled={!holeNumber.trim()}>
              Add hole {holeNumber}
            </Button>
          </div>
        )}

        {/* Holes drilled */}
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {holes.map((h) => (
            <div key={h.id} className="flex items-center gap-3 px-3 py-2">
              <span className="font-mono font-bold text-navy w-10">{h.holeNumber}</span>
              <div className="flex-1 min-w-0 text-sm">
                {h.actualDepth} ft
                {h.angle ? ` · ${h.angle}°` : ''}
                {h.subdrill ? ` · ${h.subdrill} sub` : ''}
                {h.comment && <span className="text-gray-400"> · {h.comment}</span>}
              </div>
              {h.conditions.map((c) => (
                <span key={c.code}
                  className={`text-[11px] font-bold rounded px-1.5 py-0.5 ${
                    c.code === 'W' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                  {c.code}
                </span>
              ))}
              <span className="text-[11px] text-gray-300">{formatDate(h.date)}</span>
              {editable && (
                <Button variant="ghost" size="icon" onClick={() => void db.drillLogHoles.delete(h.id)}>
                  <Trash2 className="h-4 w-4 text-gray-300" />
                </Button>
              )}
            </div>
          ))}
          {holes.length === 0 && (
            <p className="p-4 text-sm text-gray-400">No holes yet — log them as you drill.</p>
          )}
        </div>

        {/* Driller signature (part of marking complete) */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <Label className="text-xs">Driller signature — {log.drillerName || me?.name}</Label>
          <SignatureField
            value={log.signatureImage}
            onChange={(blob) => void update({ signatureImage: blob })}
          />
        </div>
      </div>
    </div>
  );
}

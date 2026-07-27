// One driller's signed drill log for a shot. Fast entry: hole number
// auto-increments, depth defaults to the pattern's design, conditions are
// single-tap toggles. Blaster accepts a completed log to take the pattern
// for loading (which locks it against driller edits — server-enforced).
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Droplets, Printer, Trash2 } from 'lucide-react';
import { canEditAcceptedDrillLog, canTransitionDrillLog, type Role } from '@shotlog/shared';
import { useLiveQuery, db } from '@/db';
import { addHole, drilledHoleNumbers, getShotPlan, nextHoleNumber, useShotDrilling } from '@/hooks/useDrillLogs';
import { parseDiagram } from '@/lib/shotDiagram';
import { DrillPlanDiagram } from '@/components/design/DrillPlanDiagram';
import { getSessionUser } from '@/lib/session';
import { nowISO, formatDate } from '@/lib/utils';
import type { HoleConditionCode } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SignatureField } from '@/components/ui/signature-field';
import { useTodayChecklist } from '@/hooks/useMaintenance';

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

  const todayChecklist = useTodayChecklist(log?.drillRigEquipmentId);

  // The blaster's per-hole plan + the shot-wide claim ledger: a hole
  // drilled in ANY log (any driller) is off everyone's remaining list
  const plan = getShotPlan(shot);
  const drilling = useShotDrilling(log?.shotId);
  const drilled = useLiveQuery(
    async () => (log ? drilledHoleNumbers(log.shotId) : undefined),
    [log?.shotId],
  );
  const remaining = plan && drilled ? plan.filter((p) => !drilled.has(String(p.n))) : null;

  // Quick-entry state
  const [holeNumber, setHoleNumber] = useState('');
  const [depth, setDepth] = useState('');
  const [conditions, setConditions] = useState<HoleConditionCode[]>([]);
  const [comment, setComment] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [angle, setAngle] = useState('0');
  const [subdrill, setSubdrill] = useState('');
  const [showMap, setShowMap] = useState(true);
  // Handoff-note prompts: driller → blaster at complete, blaster → driller at reopen
  const [notePrompt, setNotePrompt] = useState<'complete' | 'reopen' | null>(null);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (!log || holeNumber) return;
    if (plan) {
      if (drilled) {
        const next = plan.find((p) => !drilled.has(String(p.n)));
        setHoleNumber(next ? String(next.n) : String(plan.length + 1));
      }
    } else {
      void nextHoleNumber(log.shotId).then((n) => setHoleNumber(String(n)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log?.id, plan !== null, drilled !== undefined]);

  // Jumping to a different hole pulls in ITS planned angle
  useEffect(() => {
    const p = plan?.find((x) => String(x.n) === holeNumber.trim());
    if (p) setAngle(String(p.angle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeNumber]);

  if (!log) return <div className="p-4 text-center text-gray-500">Loading…</div>;

  const designDepth = shot?.totals.avgDrillDepth || log.faceHeight || 0;
  const designSubdrill = shot?.drillParams.subDrill ?? 0;
  const locked = log.status === 'accepted' && !canEditAcceptedDrillLog(role);
  const editable = !locked && log.status !== 'accepted';
  const footage = holes.reduce((s, h) => s + h.actualDepth, 0);
  const planHole = plan?.find((p) => String(p.n) === holeNumber.trim());
  const targetDepth = planHole?.depth || designDepth;

  const update = (changes: Record<string, unknown>) =>
    db.drillLogs.update(log.id, { ...changes, updatedAt: nowISO() });

  const submitHole = async () => {
    const d = parseFloat(depth) || targetDepth;
    if (!holeNumber.trim() || d <= 0) return;
    const a = angle.trim() === '' ? (planHole?.angle ?? 0) : parseFloat(angle) || 0;
    await addHole(log, {
      holeNumber: holeNumber.trim(),
      actualDepth: d,
      angle: a,
      subdrill: subdrill === '' ? designSubdrill : parseFloat(subdrill) || 0,
      conditions,
      comment: comment.trim(),
      plannedDepth: planHole?.depth,
      plannedAngle: planHole?.angle,
    });
    if (plan && drilled) {
      // Advance to the next unclaimed plan hole (the one just drilled included)
      const nowDrilled = new Set(drilled);
      nowDrilled.add(holeNumber.trim());
      const next = plan.find((p) => !nowDrilled.has(String(p.n)));
      setHoleNumber(next ? String(next.n) : '');
    } else {
      const n = parseInt(holeNumber, 10);
      setHoleNumber(Number.isNaN(n) ? '' : String(n + 1));
    }
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
              onClick={() => { setNoteText(''); setNotePrompt('complete'); }}>
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
            <Button size="sm" variant="secondary"
              onClick={() => { setNoteText(''); setNotePrompt('reopen'); }}>
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

        {log.status === 'open' && log.reopenNote && (
          <p className="text-sm text-safety-orange border border-orange-200 bg-orange-50 rounded-lg px-3 py-2">
            ↩ Sent back by the blaster: “{log.reopenNote}”
          </p>
        )}
        {log.status !== 'open' && log.completionNote && (
          <p className="text-sm text-navy border border-gray-200 bg-navy-50 rounded-lg px-3 py-2">
            Driller's note: “{log.completionNote}”
          </p>
        )}

        {/* Plan-vs-actual review — what the blaster checks before accepting.
            Informational only: nothing here blocks acceptance. */}
        {log.status === 'complete' && drilling && drilling.planned !== null && (
          <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-1">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Review against plan — shot-wide
            </p>
            <p className="text-sm">
              {drilling.totalHoles} of {drilling.planned} plan holes drilled
              {drilling.undrilled.length > 0 && (
                <span className="text-safety-orange font-medium">
                  {' '}· {drilling.undrilled.length} not drilled
                  {drilling.undrilled.length <= 12 && `: ${drilling.undrilled.join(', ')}`}
                </span>
              )}
            </p>
            {drilling.extras.length > 0 && (
              <p className="text-sm text-gray-600">
                {drilling.extras.length} hole{drilling.extras.length === 1 ? '' : 's'} outside the
                plan: {drilling.extras.slice(0, 12).join(', ')}
              </p>
            )}
            {drilling.flagged.map((f) => (
              <p key={f.holeNumber} className="text-sm text-safety-orange">
                ⚠ Hole {f.holeNumber} — plan {f.plannedDepth} ft, drilled {f.actualDepth} ft (
                {f.depthDelta > 0 ? '+' : ''}
                {f.depthDelta.toFixed(1)})
                {f.angleChanged && ' · angle changed'}
              </p>
            ))}
            {(drilling.wetHoles > 0 || drilling.voidHoles > 0) && (
              <p className="text-sm text-blue-700">
                {drilling.wetHoles > 0 && `${drilling.wetHoles} wet`}
                {drilling.wetHoles > 0 && drilling.voidHoles > 0 && ' · '}
                {drilling.voidHoles > 0 && `${drilling.voidHoles} void`} — check product
                suitability at loading
              </p>
            )}
            {drilling.flagged.length === 0 &&
              drilling.undrilled.length === 0 &&
              drilling.extras.length === 0 && (
                <p className="text-sm text-green-700">✓ Every hole drilled to plan.</p>
              )}
          </div>
        )}

        {log.drillRigEquipmentId && !todayChecklist && editable && (
          <button
            className="w-full text-left text-sm text-safety-orange border border-orange-200 bg-orange-50 rounded-lg px-3 py-2"
            onClick={() => navigate(`/drill-checklist/${log.drillRigEquipmentId}?job=${log.jobId}`)}
          >
            ⚠ Rig checklist not filed today — tap to file it now.
          </button>
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
            {plan && remaining && (
              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>
                    Pattern: <b>{plan.length - remaining.length}</b> of {plan.length} holes drilled
                    {remaining.length === 0 && ' — plan complete ✓'}
                  </span>
                  {planHole && (
                    <span className="font-medium text-navy">
                      Hole {planHole.n} — plan {planHole.depth} ft
                      {planHole.angle ? ` · ${planHole.angle}°` : ''}
                    </span>
                  )}
                </div>
                <div className="h-1.5 rounded bg-gray-100 overflow-hidden mb-2">
                  <i
                    className="block h-full bg-safety-orange"
                    style={{
                      width: `${Math.min(100, ((plan.length - remaining.length) / plan.length) * 100)}%`,
                    }}
                  />
                </div>
                {remaining.length > 0 && (
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {remaining.slice(0, 40).map((p) => (
                      <button
                        key={p.n}
                        type="button"
                        className={`shrink-0 min-w-[36px] h-8 px-1.5 rounded-md border text-xs font-mono font-semibold ${
                          String(p.n) === holeNumber.trim()
                            ? 'bg-navy text-white border-navy'
                            : 'bg-white text-gray-600 border-gray-300'
                        }`}
                        title={`plan ${p.depth} ft${p.angle ? ` · ${p.angle}°` : ''}`}
                        onClick={() => setHoleNumber(String(p.n))}
                      >
                        {p.n}
                      </button>
                    ))}
                    {remaining.length > 40 && (
                      <span className="text-xs text-gray-400 self-center">
                        +{remaining.length - 40}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <div className="w-24">
                <Label className="text-xs">Hole #</Label>
                <Input value={holeNumber} onChange={(e) => setHoleNumber(e.target.value)} />
              </div>
              <div className="flex-1">
                <Label className="text-xs">
                  Depth (ft) — {planHole ? `plan ${planHole.depth}` : `design ${designDepth || '—'}`}
                </Label>
                <Input type="number" inputMode="decimal" placeholder={String(targetDepth || '')}
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
              {planHole && depth === ''
                ? `Add hole ${holeNumber} — ${targetDepth} ft to plan`
                : `Add hole ${holeNumber}`}
            </Button>
          </div>
        )}

        {/* The blaster's pattern map — read-only reference; tap targets a hole */}
        {plan && shot && (
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Pattern plan
              </p>
              <button
                className="text-xs text-gray-400 underline"
                onClick={() => setShowMap(!showMap)}
              >
                {showMap ? 'Hide' : 'Show'}
              </button>
            </div>
            {showMap && (
              <DrillPlanDiagram
                diagram={parseDiagram(shot.designPlan.shotDiagramData)}
                fallbackDepth={shot.totals.avgDrillDepth || 0}
                drilled={drilled}
                selected={holeNumber.trim()}
                onTapHole={editable ? (n) => setHoleNumber(String(n)) : undefined}
              />
            )}
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
                {h.plannedDepth !== undefined &&
                  (Math.abs(h.actualDepth - h.plannedDepth) >= 1 ||
                    (h.angle || 0) !== (h.plannedAngle ?? 0)) && (
                    <span className="text-safety-orange font-medium"> · plan {h.plannedDepth}</span>
                  )}
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

        {/* Handoff-note prompt (complete: driller → blaster; reopen: reverse) */}
        {notePrompt && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4 space-y-3">
              <p className="font-bold">
                {notePrompt === 'complete' ? 'Mark complete' : 'Send back to the driller'}
              </p>
              <div>
                <Label className="text-xs">
                  {notePrompt === 'complete'
                    ? 'Anything the blaster should know? (optional)'
                    : 'What needs fixing? (optional)'}
                </Label>
                <Input
                  value={noteText}
                  placeholder={notePrompt === 'complete' ? 'e.g. row 3 ran wet, watch the toe' : 'e.g. hole 12 short — re-drill'}
                  onChange={(e) => setNoteText(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setNotePrompt(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const note = noteText.trim() || undefined;
                    if (notePrompt === 'complete') {
                      // completing clears any sent-back reason from last round
                      void update({
                        status: 'complete',
                        completedAt: nowISO(),
                        completionNote: note,
                        reopenNote: undefined,
                      });
                    } else {
                      void update({ status: 'open', reopenNote: note });
                    }
                    setNotePrompt(null);
                  }}
                >
                  {notePrompt === 'complete' ? 'Complete' : 'Send back'}
                </Button>
              </div>
            </div>
          </div>
        )}

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

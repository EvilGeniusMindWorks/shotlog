// Print-ready Drill Log mirroring Baystate's paper form: header pattern
// info, per-hole rows with condition codes, totals, driller signature.
// Office-bound like the blast log.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBackHere } from '@/lib/nav';
import { FileDown, Printer } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { getJobView } from '@/lib/jobContext';
import { formatDate } from '@/lib/utils';
import { useFeedbackPaper } from '@/lib/feedbackPaper';
import { patternSheet } from '@/hooks/useDrillPlans';
import type { DrillLog, DrillLogHole } from '@/db/schema';

const CONDITION_LEGEND = 'V = Void · SR = Soft Rock · O = Overburden · W = Water';

/** One object URL per part's signature, released when the parts change */
function usePartSignatures(parts: DrillLog[]): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const key = parts.map((p) => `${p.id}:${p.signatureImage ? 1 : 0}`).join(',');
  useEffect(() => {
    const next = new Map<string, string>();
    for (const p of parts) if (p.signatureImage) next.set(p.id, URL.createObjectURL(p.signatureImage));
    setUrls(next);
    return () => { for (const u of next.values()) URL.revokeObjectURL(u); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

export function PrintDrillLogPage() {
  const { logId } = useParams<{ id: string; logId: string }>();
  const navigate = useNavigate();
  const back = useBackHere('Print · Drill log');
  const log = useLiveQuery(() => (logId ? db.drillLogs.get(logId) : undefined), [logId]);
  const ownHoles =
    useLiveQuery(
      async () =>
        logId
          ? (await db.drillLogHoles.where('drillLogId').equals(logId).toArray()).sort((a, b) =>
              a.holeNumber.localeCompare(b.holeNumber, undefined, { numeric: true }),
            )
          : [],
      [logId],
    ) ?? [];
  // S23 push 2 (Q3): a pattern's log prints as ONE sheet — every part's holes in
  // hole order with Driller and Rig columns, one signature per part
  const sheet = useLiveQuery(async () => (log?.drillPlanId ? patternSheet(log.drillPlanId) : undefined), [log?.drillPlanId]);
  const pattern = Boolean(sheet && sheet.parts.length > 0);
  const holes: (DrillLogHole & { partId?: string })[] = pattern ? sheet!.holes : ownHoles;
  const partSigs = usePartSignatures(pattern ? sheet!.parts : []);
  const shot = useLiveQuery(
    () => (log?.shotId ? db.shots.get(log.shotId) : undefined),
    [log?.shotId],
  );
  const job = useLiveQuery(() => getJobView(log?.jobId), [log?.jobId]);
  useFeedbackPaper(log ? { label: `Drill log · ${job?.name ?? 'job'} · ${formatDate(log.date ?? log.createdAt.slice(0, 10))} · print`, kind: 'drillLog', recordId: log.id } : null);
  const day = useLiveQuery(
    () => (log?.blastDayId ? db.blastDays.get(log.blastDayId) : undefined),
    [log?.blastDayId],
  );
  const rig = useLiveQuery(
    () => (log?.drillRigEquipmentId ? db.equipment.get(log.drillRigEquipmentId) : undefined),
    [log?.drillRigEquipmentId],
  );
  const company = useLiveQuery(() => db.companySettings.get('companySettings-singleton'));

  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!log?.signatureImage) {
      setSigUrl(null);
      return;
    }
    const url = URL.createObjectURL(log.signatureImage);
    setSigUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [log?.signatureImage]);

  if (!log) return <div className="p-4">Loading…</div>;
  const footage = holes.reduce((s, h) => s + h.actualDepth, 0);
  const subTotal = holes.reduce((s, h) => s + h.subdrill, 0);
  // Plan column appears only when rows carry the blaster's plan snapshot
  const hasPlan = holes.some((h) => h.plannedDepth !== undefined);
  const offPlan = (h: (typeof holes)[number]) =>
    h.plannedDepth !== undefined &&
    (Math.abs(h.actualDepth - h.plannedDepth) >= 1 || (h.angle || 0) !== (h.plannedAngle ?? 0));
  const partById = new Map((sheet?.parts ?? []).map((p) => [p.id, p]));
  const dates = holes.map((h) => h.date).sort();
  const drilledLine = dates.length ? (dates[0] === dates[dates.length - 1] ? formatDate(dates[0]) : `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`) : '—';
  const rigsLine = pattern ? [...new Set(holes.map((h) => h.rigAsset || (h.rigEquipmentId ? sheet!.rigs.get(h.rigEquipmentId) : '')).filter(Boolean))].join(', ') || '—' : '';
  const acceptedPart = pattern ? (sheet!.parts.filter((p) => p.acceptedAt).sort((a, b) => (b.acceptedAt ?? '').localeCompare(a.acceptedAt ?? ''))[0] ?? log) : log;

  return (
    <div className="print-blast-log">
      <div className="no-print flex gap-2 p-3 bg-gray-100">
        <button
          className="px-3 py-1.5 rounded bg-navy text-white text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              const { buildDrillLogPdf, downloadPdf } = await import('@/pdfdocs');
              downloadPdf(
                await buildDrillLogPdf(log.id),
                `drill-log-${day?.date ?? ''}-shot${shot?.shotNumber ?? ''}-${(log.drillerName || 'driller').replace(/\s+/g, '-').toLowerCase()}.pdf`,
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <FileDown size={16} /> {saving ? 'Generating…' : 'Save PDF'}
        </button>
        <button
          className="px-3 py-1.5 rounded bg-navy text-white text-sm inline-flex items-center gap-1.5"
          onClick={() => window.print()}
        >
          <Printer size={16} /> Print
        </button>
        <button className="px-3 py-1.5 rounded border text-sm" onClick={() => (back ? back.go() : navigate(-1))} data-nav-back data-nav-back-to={back?.to ?? ''}>
          ‹ <span data-nav-back-label>{back?.label ?? 'Back'}</span>
        </button>
      </div>
      <div className="page">
        <div className="header-bar">
          <div className="company-info">
            <div className="company-name">{company?.companyName || 'Baystate Blasting, Inc.'}</div>
            {company?.dealerNumber && <div className="company-sub">Dealer #{company.dealerNumber}</div>}
          </div>
          <h1>Drill Log</h1>
        </div>

        <table className="mb4">
          <tbody>
            <tr>
              <td><b>Site:</b> {job?.name}{day?.name ? ` — ${day.name}` : ''}</td>
              {pattern ? (
                <td data-print-pattern={sheet!.plan.id}><b>Drill plan:</b> {sheet!.plan.name}{sheet!.plan.version && sheet!.plan.version > 1 ? ` v${sheet!.plan.version}` : ''}</td>
              ) : (
                <td><b>Shot #:</b> {shot?.shotNumber ?? ''}</td>
              )}
              {pattern ? (
                <td><b>Drilled:</b> {drilledLine}</td>
              ) : (
                <td><b>Date completed:</b> {log.completedAt ? formatDate(log.completedAt.slice(0, 10)) : '—'}</td>
              )}
            </tr>
            <tr>
              <td><b>Location:</b> {log.locationNote || [job?.address, job?.city].filter(Boolean).join(', ')}</td>
              <td><b>{pattern ? 'Drill rigs:' : 'Drill rig:'}</b> {pattern ? rigsLine : rig ? `${rig.assetNumber} ${rig.description}` : '—'}</td>
              <td><b>GPS:</b> {log.gps || '—'}</td>
            </tr>
            <tr>
              <td><b>Diameter:</b> {log.holeDiameter}" </td>
              <td><b>Burden × Spacing:</b> {log.burden}' × {log.spacing}'</td>
              <td><b>Face height:</b> {log.faceHeight}'</td>
            </tr>
          </tbody>
        </table>

        <table className="mb4">
          <thead>
            <tr>
              <th>Date</th><th>Hole #</th>
              {pattern && <th>Driller</th>}
              {pattern && <th>Rig</th>}
              <th>Angle</th>
              {hasPlan && <th>Plan (ft)</th>}
              <th>Depth (ft)</th>
              <th>Subdrill</th><th>Conditions</th><th>Comments</th>
            </tr>
          </thead>
          <tbody>
            {holes.map((h) => (
              <tr key={h.id} data-print-hole={h.holeNumber}>
                <td>{formatDate(h.date)}</td>
                <td>{h.holeNumber}</td>
                {pattern && <td data-print-hole-driller>{(h.drillerName || partById.get(h.partId ?? '')?.drillerName || '').split(/\s+/)[0]}</td>}
                {pattern && <td data-print-hole-rig>{h.rigAsset || (h.rigEquipmentId ? sheet!.rigs.get(h.rigEquipmentId) : '') || ''}</td>}
                <td>
                  {h.angle || ''}
                  {hasPlan && (h.plannedAngle ?? 0) !== (h.angle || 0) ? ` (plan ${h.plannedAngle ?? 0})` : ''}
                </td>
                {hasPlan && (
                  <td>
                    {h.plannedDepth ?? ''}
                    {offPlan(h) ? ' ⚠' : ''}
                  </td>
                )}
                <td>{h.actualDepth}</td>
                <td>{h.subdrill || ''}</td>
                <td>{[...new Set(h.conditions.map((c) => c.code))].join(', ')}</td>
                <td>{h.comment}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={(hasPlan ? 4 : 3) + (pattern ? 2 : 0)}><b>Totals</b></td>
              <td><b>{footage.toFixed(0)}</b></td>
              <td><b>{subTotal.toFixed(0)}</b></td>
              <td colSpan={2}><b>{holes.length} holes</b></td>
            </tr>
          </tbody>
        </table>

        <p style={{ fontSize: '10px' }}>Legend: {CONDITION_LEGEND}</p>

        <table className="mb4" data-print-signatures={pattern ? sheet!.parts.length : 1}>
          <tbody>
            {pattern ? (
              <>
                {sheet!.parts.map((p) => (
                  <tr key={p.id} data-print-part={p.id}>
                    <td style={{ width: '50%' }}>
                      <b>Driller:</b> {p.drillerName}
                      <br />
                      <b>Signature:</b>{' '}
                      {partSigs.get(p.id) ? <img src={partSigs.get(p.id)} alt="signature" style={{ height: 40 }} /> : '________________'}
                    </td>
                    <td>
                      <b>Signed:</b> {p.completedAt ? formatDate(p.completedAt.slice(0, 10)) : p.status === 'open' ? 'not yet' : '—'}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ width: '50%' }}>
                    <b>Accepted by (blaster):</b> {acceptedPart.acceptedBy || '________________'}
                  </td>
                  <td>
                    <b>Date:</b> {acceptedPart.acceptedAt ? formatDate(acceptedPart.acceptedAt.slice(0, 10)) : '____________'}
                  </td>
                </tr>
              </>
            ) : (
              <tr>
                <td style={{ width: '50%' }}>
                  <b>Driller:</b> {log.drillerName}
                  <br />
                  <b>Signature:</b>{' '}
                  {sigUrl ? <img src={sigUrl} alt="signature" style={{ height: 40 }} /> : '________________'}
                </td>
                <td>
                  <b>Accepted by (blaster):</b> {log.acceptedBy || '________________'}
                  <br />
                  <b>Date:</b> {log.acceptedAt ? formatDate(log.acceptedAt.slice(0, 10)) : '____________'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

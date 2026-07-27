// Print-ready Drill Log mirroring Baystate's paper form: header pattern
// info, per-hole rows with condition codes, totals, driller signature.
// Office-bound like the blast log.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery, db } from '@/db';
import { formatDate } from '@/lib/utils';

const CONDITION_LEGEND = 'V = Void · SR = Soft Rock · O = Overburden · W = Water';

export function PrintDrillLogPage() {
  const { logId } = useParams<{ id: string; logId: string }>();
  const navigate = useNavigate();
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
  const day = useLiveQuery(() => (log ? db.blastDays.get(log.blastDayId) : undefined), [log?.blastDayId]);
  const rig = useLiveQuery(
    () => (log?.drillRigEquipmentId ? db.equipment.get(log.drillRigEquipmentId) : undefined),
    [log?.drillRigEquipmentId],
  );
  const company = useLiveQuery(() => db.companySettings.get('companySettings-singleton'));

  const [sigUrl, setSigUrl] = useState<string | null>(null);
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

  return (
    <div className="print-blast-log">
      <div className="no-print flex gap-2 p-3 bg-gray-100">
        <button className="px-3 py-1.5 rounded bg-navy text-white text-sm" onClick={() => window.print()}>
          Print / Save PDF
        </button>
        <button className="px-3 py-1.5 rounded border text-sm" onClick={() => navigate(-1)}>
          Back
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
              <td><b>Shot #:</b> {shot?.shotNumber ?? ''}</td>
              <td><b>Date completed:</b> {log.completedAt ? formatDate(log.completedAt.slice(0, 10)) : '—'}</td>
            </tr>
            <tr>
              <td><b>Location:</b> {log.locationNote || [job?.address, job?.city].filter(Boolean).join(', ')}</td>
              <td><b>Drill rig:</b> {rig ? `${rig.assetNumber} ${rig.description}` : '—'}</td>
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
              <th>Date</th><th>Hole #</th><th>Angle</th>
              {hasPlan && <th>Plan (ft)</th>}
              <th>Depth (ft)</th>
              <th>Subdrill</th><th>Conditions</th><th>Comments</th>
            </tr>
          </thead>
          <tbody>
            {holes.map((h) => (
              <tr key={h.id}>
                <td>{formatDate(h.date)}</td>
                <td>{h.holeNumber}</td>
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
              <td colSpan={hasPlan ? 4 : 3}><b>Totals</b></td>
              <td><b>{footage.toFixed(0)}</b></td>
              <td><b>{subTotal.toFixed(0)}</b></td>
              <td colSpan={2}><b>{holes.length} holes</b></td>
            </tr>
          </tbody>
        </table>

        <p style={{ fontSize: '10px' }}>Legend: {CONDITION_LEGEND}</p>

        <table className="mb4">
          <tbody>
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
          </tbody>
        </table>
      </div>
    </div>
  );
}

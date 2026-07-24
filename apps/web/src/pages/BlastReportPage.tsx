import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, FileDown, Printer } from 'lucide-react';
import { db } from '@/db';
import { useBlastDay } from '@/hooks/useBlastDay';
import {
  distributeByHoles,
  osmPPVLimit,
  powderFactor,
  usbmRI8507Limit,
} from '@shotlog/shared';
import { DELAY_COLORS, computeFiringTimes, parseDiagram } from '@/lib/shotDiagram';
import { ColumnVisual } from '@/components/design/TypicalColumnBuilder';
import type { SeismoReading, Shot } from '@/db/schema';
import { savePagesAsPdf } from '@/lib/pdf';
import './print-blast-log.css';
import './blast-report.css';

const WEATHER_LABEL: Record<string, string> = {
  sunny: 'Sunny', cloudy: 'Cloudy', partly_cloudy: 'Partly Cloudy',
  rain_light: 'Light Rain', rain_heavy: 'Heavy Rain', rain_out: 'Rain Out',
};
const TEMP_LABEL: Record<string, string> = { low: 'Low', mod: 'Moderate', high: 'High' };

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

/** 3-page designed Visual Blast Report (Spec §7.3) */
export function BlastReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { blastDay, job, blastLog, shots, explosiveUsage } = useBlastDay(id);
  const [savingPdf, setSavingPdf] = useState(false);
  const shotIdsKey = shots.map((s) => s.id).join(',');
  const typicalColumns =
    useLiveQuery(async () => {
      const ids = shots.map((s) => s.id);
      return ids.length ? db.typicalColumns.where('shotId').anyOf(ids).toArray() : [];
    }, [shotIdsKey]) ?? [];
  const seismoReadings =
    useLiveQuery(async () => {
      const ids = shots.map((s) => s.id);
      return ids.length ? db.seismoReadings.where('shotId').anyOf(ids).toArray() : [];
    }, [shotIdsKey]) ?? [];
  const crew =
    useLiveQuery(async () => {
      if (!blastDay) return [];
      const report = await db.dailyReports.where('blastDayId').equals(blastDay.id).first();
      return report
        ? db.workForceEntries.where('dailyReportId').equals(report.id).toArray()
        : [];
    }, [blastDay?.id]) ?? [];

  if (!blastDay || !blastLog) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading…</div>;
  }

  const holeCounts = shots.map((s) => ({ shotId: s.id, holes: s.totals.numHoles }));
  const totalHoles = shots.reduce((s, sh) => s + sh.totals.numHoles, 0);
  const totalYards = shots.reduce((s, sh) => s + sh.totals.totalYardsShot, 0);
  const totalLbs = explosiveUsage?.totalPoundsShot ?? 0;
  const pf = totalYards > 0 ? powderFactor(totalLbs, totalYards) : 0;
  const heroSnapshot = shots.find((s) => s.designPlan.siteSketchImage)?.designPlan
    .siteSketchImage;

  return (
    <div className="print-blast-log blast-report">
      <div className="print-toolbar">
        <button onClick={() => navigate(`/blast-day/${blastDay.id}`)}>
          <ArrowLeft size={16} /> Back
        </button>
        <span style={{ display: 'flex', gap: 8 }}>
          <button
            disabled={savingPdf}
            onClick={async () => {
              setSavingPdf(true);
              try {
                await savePagesAsPdf(`blast-report-${blastDay.date}.pdf`);
              } finally {
                setSavingPdf(false);
              }
            }}
          >
            <FileDown size={16} /> {savingPdf ? 'Generating…' : 'Save PDF'}
          </button>
          <button className="primary" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
        </span>
      </div>

      {/* ═════════ PAGE 1 — COVER ═════════ */}
      <div className="page report-page">
        <div className="report-hero">
          <div className="report-brand">
            <div className="report-logo">✸</div>
            <div>
              <div className="report-title">Blast Report</div>
              <div className="report-subtitle">Baystate Blasting, Inc.</div>
            </div>
          </div>
          <div className="report-date">{fmtDate(blastDay.date)}</div>
        </div>

        <div className="report-job">
          <h1>{job?.name}</h1>
          <p>
            {[job?.address, job?.city, job?.state].filter(Boolean).join(', ')} — {job?.customer}
          </p>
        </div>

        <div className="report-kpis">
          <div><b>{shots.length}</b><span>Shots</span></div>
          <div><b>{totalHoles || '—'}</b><span>Holes</span></div>
          <div><b>{totalLbs ? totalLbs.toFixed(0) : '—'}</b><span>Total Lbs</span></div>
          <div><b>{pf ? pf.toFixed(2) : '—'}</b><span>Powder Factor</span></div>
        </div>

        {heroSnapshot && <ReportSnapshot blob={heroSnapshot} />}

        <div className="report-conditions">
          <div>
            <span>Weather</span>
            {WEATHER_LABEL[blastDay.conditions.weather]} · {TEMP_LABEL[blastDay.conditions.temperatureRange]}
          </div>
          <div>
            <span>Wind</span>
            {blastDay.conditions.windDirection || '—'}
          </div>
          <div>
            <span>Rock</span>
            {blastLog.typeOfRock || '—'}
          </div>
          <div>
            <span>Fire Detail</span>
            {blastDay.fireDetail ? 'Yes' : 'No'}
          </div>
        </div>

        {blastLog.hazards && (
          <div className="report-note">
            <b>Hazards:</b> {blastLog.hazards} &nbsp;&nbsp; <b>Precautions:</b> {blastLog.precautions}
          </div>
        )}
      </div>

      {/* ═════════ PAGE 2 — SHOT DETAILS ═════════ */}
      <div className="page report-page">
        <div className="report-section-title">Shot Details</div>
        <div className="report-shots">
          {shots.map((s) => {
            const alloc = explosiveUsage
              ? explosiveUsage.products.map((p) => ({
                  name: p.productName,
                  qty: distributeByHoles(p.quantity, holeCounts, p.shotAllocations).allocations[s.id] ?? 0,
                  lbs:
                    (distributeByHoles(p.quantity, holeCounts, p.shotAllocations).allocations[s.id] ?? 0) *
                    p.weightMultiplier,
                }))
              : [];
            const cols = typicalColumns.filter((c) => c.shotId === s.id);
            return (
              <div key={s.id} className="report-shot">
                <div className="report-shot-head">
                  <b>Shot #{s.shotNumber}</b>
                  {s.time && <span>{s.time}</span>}
                  <span>
                    {s.totals.numHoles || '—'} holes · {s.drillParams.burden}'×{s.drillParams.spacing}' ·{' '}
                    {s.drillParams.holeDiameter}" dia
                  </span>
                </div>
                <div className="report-shot-body">
                  <ReportDelayGrid shot={s} />
                  {cols.map((col) => {
                    const topDown = [...col.layers].sort((a, b) => b.layerOrder - a.layerOrder);
                    return (
                      <div key={col.id} className="report-col">
                        <ColumnVisual layers={topDown} heightPx={110} widthPx={44} />
                        <span>{col.name}</span>
                      </div>
                    );
                  })}
                  {alloc.filter((a) => a.qty > 0).length > 0 && (
                    <table className="report-table">
                      <thead>
                        <tr><th>Product</th><th>Qty</th><th>Lbs</th></tr>
                      </thead>
                      <tbody>
                        {alloc
                          .filter((a) => a.qty > 0)
                          .map((a, i) => (
                            <tr key={i}>
                              <td>{a.name}</td>
                              <td>{a.qty}</td>
                              <td>{a.lbs.toFixed(1)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═════════ PAGE 3 — COMPLIANCE & SIGN-OFF ═════════ */}
      <div className="page report-page">
        <div className="report-section-title">Compliance</div>
        <table className="report-table wide">
          <thead>
            <tr>
              <th>Shot</th><th>Structure</th><th>Distance</th><th>SD</th>
              <th>Predicted PPV</th><th>Measured PPV</th><th>Limit</th><th>Result</th>
            </tr>
          </thead>
          <tbody>
            {shots.map((s) => (
              <ComplianceRow key={s.id} shot={s} readings={seismoReadings.filter((r) => r.shotId === s.id)} />
            ))}
          </tbody>
        </table>

        {seismoReadings.length > 0 && (
          <>
            <div className="report-section-title">Seismograph Readings</div>
            <table className="report-table wide">
              <thead>
                <tr>
                  <th>Shot</th><th>Graph</th><th>Unit</th><th>PPV (in/s)</th>
                  <th>Freq (Hz)</th><th>Air (dB)</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {seismoReadings.map((r) => {
                  const shot = shots.find((s) => s.id === r.shotId);
                  const max = Math.max(r.ppvTran, r.ppvVert, r.ppvLong);
                  return (
                    <tr key={r.id}>
                      <td>#{shot?.shotNumber}</td>
                      <td>{r.graphNumber}</td>
                      <td>{r.seismographId || '—'}</td>
                      <td>{max.toFixed(3)}</td>
                      <td>{r.frequency}</td>
                      <td>{r.airOverpressure || '—'}</td>
                      <td>
                        <span className={`report-pill ${r.complianceStatus}`}>{r.complianceStatus}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {crew.length > 0 && (
          <>
            <div className="report-section-title">Crew</div>
            <div className="report-crew">
              {crew.map((w) => (
                <span key={w.id} className="report-chip">
                  {w.workerName}
                  {w.timeIn && ` · ${w.timeIn}–${w.timeOut}`}
                </span>
              ))}
            </div>
          </>
        )}

        <div className="report-signoff">
          <div>
            <span>Blaster</span>
            <b>{blastLog.blasterName || '—'}</b>
          </div>
          <div>
            <span>License</span>
            <b>
              {blastLog.licenseNumber || '—'} {blastLog.licenseState && `(${blastLog.licenseState})`}
            </b>
          </div>
          <SignoffSignature blob={blastLog.signatureImage} />
        </div>

        <div className="print-footer">Generated by ShotLog — {fmtDate(blastDay.date)}</div>
      </div>
    </div>
  );
}

function ReportSnapshot({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (!(blob instanceof Blob) || blob.size === 0) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url || failed) return null; // no broken-image icon on the report
  return <img src={url} alt="Site map" className="report-map" onError={() => setFailed(true)} />;
}

function SignoffSignature({ blob }: { blob: Blob | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <div>
      <span>Signature</span>
      {url ? <img src={url} alt="Signature" style={{ height: 36 }} /> : <b>—</b>}
    </div>
  );
}

function ReportDelayGrid({ shot }: { shot: Shot }) {
  const d = parseDiagram(shot.designPlan.shotDiagramData);
  const times = computeFiringTimes(d);
  if (times.size === 0 && Object.keys(d.delays).length === 0) return null;
  const spacing = 16;
  const r = 6;
  const pad = 8;
  const w = pad * 2 + d.cols * spacing;
  const h = pad * 2 + d.rows * spacing;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="report-grid">
      {Array.from({ length: d.rows * d.cols }, (_, idx) => {
        const t = times.get(idx);
        const legacyMs = d.start === undefined ? d.delays[idx] : undefined;
        const cx = pad + (idx % d.cols) * spacing + spacing / 2;
        const cy = pad + Math.floor(idx / d.cols) * spacing + spacing / 2;
        const fill =
          d.start?.hole === idx
            ? '#dd6b20'
            : t !== undefined
              ? '#1a365d'
              : legacyMs !== undefined
                ? DELAY_COLORS[legacyMs] ?? '#1a365d'
                : '#e5e7eb';
        const label = t ?? legacyMs;
        return (
          <g key={idx}>
            <circle cx={cx} cy={cy} r={r} fill={fill} />
            {label !== undefined && (
              <text x={cx} y={cy + 2} textAnchor="middle" fontSize={label >= 1000 ? 4 : 5} fontWeight={700} fill="white">
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ComplianceRow({ shot, readings }: { shot: Shot; readings: SeismoReading[] }) {
  const dp = shot.designPlan;
  const measured = readings.length
    ? Math.max(...readings.map((r) => Math.max(r.ppvTran, r.ppvVert, r.ppvLong)))
    : null;
  const freq = readings.length ? readings[0].frequency : 15;
  const usbm = usbmRI8507Limit(freq);
  const osm = dp.closestStructureDistance > 0 ? osmPPVLimit(dp.closestStructureDistance) : null;
  const limit = osm !== null ? Math.min(usbm, osm) : usbm;
  const effective = measured ?? (dp.predictedPPV || null);
  const pass = effective !== null ? effective <= limit : null;
  return (
    <tr>
      <td>#{shot.shotNumber}</td>
      <td>{dp.closestStructureLocation || '—'}</td>
      <td>{dp.closestStructureDistance ? `${dp.closestStructureDistance} ft` : '—'}</td>
      <td>{dp.scaledDistance ? dp.scaledDistance.toFixed(1) : '—'}</td>
      <td>{dp.predictedPPV ? dp.predictedPPV.toFixed(2) : '—'}</td>
      <td>{measured !== null ? measured.toFixed(3) : '—'}</td>
      <td>{limit.toFixed(2)} in/s</td>
      <td>
        {pass === null ? (
          '—'
        ) : (
          <span className={`report-pill ${pass ? 'compliant' : 'violation'}`}>
            {pass ? 'PASS' : 'FAIL'}
          </span>
        )}
      </td>
    </tr>
  );
}

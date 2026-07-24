import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, FileDown, Printer, TriangleAlert } from 'lucide-react';
import { db } from '@/db';
import { useBlastDay } from '@/hooks/useBlastDay';
import { ColumnVisual } from '@/components/design/TypicalColumnBuilder';
import { distributeByHoles, powderFactor } from '@shotlog/shared';
import { validateForPrint } from '@/lib/validation';
import { savePagesAsPdf } from '@/lib/pdf';
import { DELAY_COLORS, computeFiringTimes, parseDiagram } from '@/lib/shotDiagram';
import { distanceFt, parseSiteDiagram } from '@/lib/siteDiagram';
import type { Shot } from '@/db/schema';
import './print-blast-log.css';

const TEMP_LABEL: Record<string, string> = { low: 'LOW', mod: 'MOD', high: 'HIGH' };
const WEATHER_LABEL: Record<string, string> = {
  sunny: 'Sunny',
  cloudy: 'Cloudy',
  partly_cloudy: 'Partly Cloudy',
  rain_light: 'Light Rain',
  rain_heavy: 'Heavy Rain',
  rain_out: 'Rain Out',
};

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function dash(v: string | number | null | undefined, suffix = ''): string {
  if (v === null || v === undefined || v === '' || v === 0) return '—';
  return `${v}${suffix}`;
}

/**
 * Print-ready Blasting Log matching Baystate Blasting's paper form
 * (example-blasting-log.html). Page 1: the Blasting Log. Page 2: the Blast
 * Design Plan — compliance tables are data-driven; site/shot diagram boxes
 * print blank for hand annotation until the Design Plan screen ships (M4),
 * as do the seismic monitoring tables.
 */
export function PrintBlastLogPage() {
  const { id } = useParams<{ id: string }>();
  const { blastDay, job, blastLog, shots, explosiveUsage } = useBlastDay(id);
  const typicalColumns =
    useLiveQuery(async () => {
      const shotIds = shots.map((s) => s.id);
      if (shotIds.length === 0) return [];
      return db.typicalColumns.where('shotId').anyOf(shotIds).toArray();
    }, [shots.map((s) => s.id).join(',')]) ?? [];
  const seismoReadings =
    useLiveQuery(async () => {
      const shotIds = shots.map((s) => s.id);
      if (shotIds.length === 0) return [];
      return db.seismoReadings.where('shotId').anyOf(shotIds).toArray();
    }, [shots.map((s) => s.id).join(',')]) ?? [];
  const [sigUrl, setSigUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blastLog?.signatureImage) {
      setSigUrl(null);
      return;
    }
    const url = URL.createObjectURL(blastLog.signatureImage);
    setSigUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blastLog?.signatureImage]);

  if (!blastDay || !blastLog) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading…</div>;
  }

  const holeCounts = shots.map((s) => ({ shotId: s.id, holes: s.totals.numHoles }));
  const products = explosiveUsage?.products ?? [];

  // Per-shot pounds: effective allocation × weight multiplier, summed per shot
  const shotPounds = new Map<string, number>(shots.map((s) => [s.id, 0]));
  for (const item of products) {
    const dist = distributeByHoles(item.quantity, holeCounts, item.shotAllocations);
    for (const shot of shots) {
      shotPounds.set(
        shot.id,
        (shotPounds.get(shot.id) ?? 0) + (dist.allocations[shot.id] ?? 0) * item.weightMultiplier,
      );
    }
  }
  const totalPounds = explosiveUsage?.totalPoundsShot ?? 0;
  const totalYards = shots.reduce((s, sh) => s + sh.totals.totalYardsShot, 0);
  const pf = totalYards > 0 ? powderFactor(totalPounds, totalYards) : 0;

  const allocFor = (item: (typeof products)[number]) =>
    distributeByHoles(item.quantity, holeCounts, item.shotAllocations).allocations;

  // Pad the explosives section to the paper form's minimum row count
  const emptyProductRows = Math.max(0, 6 - products.length);

  return (
    <div className="print-blast-log">
      {/* Screen-only toolbar — hidden when printing */}
      <PrintToolbar blastDayId={blastDay.id} filename={`blasting-log-${blastDay.date}.pdf`} />
      <PrintWarnings issues={validateForPrint(blastLog, shots, explosiveUsage)} />
      {/* ==================== PAGE 1: BLASTING LOG ==================== */}
      <div className="page">
        <div className="header-bar">
          <div className="company-info">
            <div className="company-name">Baystate Blasting, Inc.</div>
          </div>
          <h1>Blasting Log</h1>
        </div>

        {/* Location info */}
        <table className="mb4">
          <tbody>
            <tr>
              <td className="bold italic" style={{ width: 120, borderRight: 'none' }}>
                Blast Location Info:
              </td>
              <td colSpan={3} style={{ borderLeft: 'none', borderRight: 'none' }}></td>
              <td className="bold right" style={{ borderLeft: 'none', width: 160 }}>
                Date of Blast: <span className="val">{fmtDate(blastDay.date)}</span>
              </td>
            </tr>
            <tr>
              <td style={{ borderRight: 'none' }}>
                Job Name: <span className="val">{job?.name}</span>
              </td>
              <td colSpan={2} style={{ borderLeft: 'none', borderRight: 'none' }}>
                Customer: <span className="val">{job?.customer}</span>
              </td>
              <td colSpan={2} style={{ borderLeft: 'none' }}></td>
            </tr>
            <tr>
              <td colSpan={2} style={{ borderRight: 'none' }}>
                Address of Blast: <span className="val">{job?.address}</span>
              </td>
              <td style={{ borderLeft: 'none', borderRight: 'none' }}>
                City: <span className="val">{job?.city}</span>
              </td>
              <td colSpan={2} style={{ borderLeft: 'none' }}>
                State: <span className="val">{job?.state}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="two-col">
          {/* LEFT COLUMN */}
          <div className="col-left">
            <table className="f9">
              <tbody>
                <tr>
                  <td className="bold" style={{ width: 110 }}>
                    DATE: <span className="val">{fmtDate(blastDay.date).slice(0, 5)}</span>
                  </td>
                  {shots.map((s) => (
                    <td key={s.id} className="section-head" style={{ width: 55 }}>
                      Shot #{s.shotNumber}
                    </td>
                  ))}
                </tr>
                <ShotRow label="Time:" shots={shots} get={(s) => dash(s.time)} />
                <tr>
                  <td>Operation**</td>
                  {shots.map((s) => (
                    <td key={s.id} className="val center" style={{ textTransform: 'capitalize' }}>
                      {blastLog.operation}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td colSpan={shots.length + 1} className="footnote">
                    **Construction, Quarry, Trench, Open
                  </td>
                </tr>
                <ShotRow label="Water Depth:" shots={shots} get={(s) => dash(s.drillParams.waterDepth, "'")} />
                <ShotRow label="Hole Diameter:" shots={shots} get={(s) => dash(s.drillParams.holeDiameter, '"')} />
                <ShotRow label="Burden:" shots={shots} get={(s) => dash(s.drillParams.burden, "'")} />
                <ShotRow label="Spacing:" shots={shots} get={(s) => dash(s.drillParams.spacing, "'")} />
                <ShotRow label="Stemming:" shots={shots} get={(s) => dash(s.drillParams.stemming, "'")} />
                <ShotRow label="Sub Drill:" shots={shots} get={(s) => dash(s.drillParams.subDrill, "'")} />
                <tr>
                  <td></td>
                  <td className="section-head" colSpan={shots.length}>
                    Totals
                  </td>
                </tr>
                <ShotRow label="# Holes:" shots={shots} get={(s) => dash(s.totals.numHoles)} />
                <ShotRow label="Total Sq Ft:" shots={shots} get={(s) => dash(Math.round(s.totals.totalSqFt))} />
                <ShotRow label="Avg. Drill Depth:" shots={shots} get={(s) => dash(s.totals.avgDrillDepth ? s.totals.avgDrillDepth.toFixed(1) : 0, "'")} />
                <ShotRow label="Total Drill Footage:" shots={shots} get={(s) => dash(Math.round(s.totals.totalDrillFootage), "'")} />
                <ShotRow label="Total Pay Yards:" shots={shots} get={(s) => dash(Math.round(s.totals.totalPayYards))} />
                <ShotRow label="Total Yards Shot:" shots={shots} get={(s) => dash(Math.round(s.totals.totalYardsShot))} />
              </tbody>
            </table>

            {/* Explosive Info */}
            <table className="f9 mt2">
              <tbody>
                <tr>
                  <td className="bold italic" style={{ width: 110 }}>
                    Product Type &amp; Size:
                  </td>
                  <td className="center" style={{ width: 15 }}></td>
                  <td className="center f8" colSpan={shots.length}>
                    Explosive Info
                  </td>
                  <td className="section-head" style={{ width: 45 }}>
                    Totals
                  </td>
                </tr>
                {products.map((item, i) => {
                  const alloc = allocFor(item);
                  return (
                    <tr key={i}>
                      <td>
                        <span className="val">{item.productName}</span>
                      </td>
                      <td className="center">#</td>
                      {shots.map((s) => (
                        <td key={s.id} className="val center">
                          {dash(alloc[s.id])}
                        </td>
                      ))}
                      <td className="val center">{dash(item.quantity)}</td>
                    </tr>
                  );
                })}
                {Array.from({ length: emptyProductRows }, (_, i) => (
                  <tr key={`empty-${i}`}>
                    <td>&nbsp;</td>
                    <td className="center">#</td>
                    {shots.map((s) => (
                      <td key={s.id} className="center">
                        —
                      </td>
                    ))}
                    <td className="center">—</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td className="bold right">Total Pounds Shot:</td>
                  <td className="center">#</td>
                  {shots.map((s) => (
                    <td key={s.id} className="val center">
                      {(shotPounds.get(s.id) ?? 0).toFixed(1)}
                    </td>
                  ))}
                  <td className="val center f11">{totalPounds.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>

            {/* Lead line / cover */}
            <table className="f9 mt2">
              <tbody>
                <tr>
                  <td>
                    Lead Line: <span className="val">{dash(explosiveUsage?.leadLine, "'")}</span>
                  </td>
                  <td>
                    Type of Cover (Dirt/Mats): <span className="val">{dash(explosiveUsage?.coverType)}</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="mt6 f10">
              <span className="bold italic underline">Onsite Delivery</span>
              &nbsp;&nbsp;&nbsp;&nbsp;
              <span className="check">{blastLog.onsiteDelivery ? '☑' : '☐'}</span>{' '}
              <span className="bold">YES</span>
              &nbsp;&nbsp;&nbsp;
              <span className="check">{blastLog.onsiteDelivery ? '☐' : '☑'}</span>{' '}
              <span className="bold">NO</span>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="col-right">
            <table className="f9">
              <tbody>
                <tr>
                  <td>
                    Weather Conditions:{' '}
                    <span className="val">
                      {WEATHER_LABEL[blastDay.conditions.weather]} — {TEMP_LABEL[blastDay.conditions.temperatureRange]}
                    </span>
                  </td>
                  <td style={{ width: 100 }}>
                    Wind Direction: <span className="val">{dash(blastDay.conditions.windDirection)}</span>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2}>
                    Fire Detail: <span className="check">{blastDay.fireDetail ? '☑' : '☐'}</span> Yes{' '}
                    <span className="check">{blastDay.fireDetail ? '☐' : '☑'}</span> No
                  </td>
                </tr>
                <tr>
                  <td>
                    Type of Rock: <span className="val">{dash(blastLog.typeOfRock)}</span>
                  </td>
                  <td>
                    Type of Terrain: <span className="val">{dash(blastLog.typeOfTerrain)}</span>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2}>
                    Identify Hazards: <span className="val">{dash(blastLog.hazards)}</span>
                  </td>
                </tr>
                <tr>
                  <td colSpan={2}>
                    Precautions Taken: <span className="val">{dash(blastLog.precautions)}</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <table className="f9 mt2">
              <tbody>
                <tr>
                  <td className="bold" style={{ borderBottom: 'none' }}>
                    Calculations:
                  </td>
                </tr>
                <tr>
                  <td className="f8" style={{ borderTop: 'none', height: 20 }}>
                    {pf > 0 && (
                      <>
                        <span className="val">
                          PF = {totalPounds.toFixed(0)} / {totalYards.toFixed(0)} = {pf.toFixed(2)} lbs/yd³
                        </span>
                        <br />
                      </>
                    )}
                    <span className="muted">SD = D/√W &nbsp;|&nbsp; PPV = K × SD^-1.6 &nbsp;|&nbsp; K = PPV × SD^1.6</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <table className="f9 mt2">
              <tbody>
                <tr>
                  <td className="bold" style={{ borderBottom: 'none' }}>
                    Notes:
                  </td>
                </tr>
                <tr>
                  <td style={{ borderTop: 'none', height: 55 }}>
                    <span className="val f9">{blastLog.notes}</span>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Seismic monitoring — measured readings; blank cells for hand-fill */}
            <div className="seismo-title">Seismic Monitoring Info:</div>
            {shots.map((s) => {
              const graphs = seismoReadings
                .filter((r) => r.shotId === s.id)
                .sort((a, b) => a.graphNumber - b.graphNumber)
                .slice(0, 3);
              const cell = (i: number, fn: (r: (typeof graphs)[number]) => string) =>
                graphs[i] ? <span className="val">{fn(graphs[i])}</span> : <>&nbsp;</>;
              const first = graphs[0];
              return (
                <table key={s.id} className="f85 mt4">
                  <tbody>
                    <tr className="shade">
                      <td className="bold" style={{ width: 80 }}>
                        SHOT #{s.shotNumber}
                      </td>
                      <td className="bold center">Graph 1</td>
                      <td className="bold center">Graph 2</td>
                      <td className="bold center">Graph 3</td>
                    </tr>
                    <tr>
                      <td>Graph (Seis) #:</td>
                      {[0, 1, 2].map((i) => (
                        <td key={i} className="center">{cell(i, (r) => r.seismographId || String(r.graphNumber))}</td>
                      ))}
                    </tr>
                    <tr>
                      <td>PPV:</td>
                      {[0, 1, 2].map((i) => (
                        <td key={i} className="center">
                          {cell(i, (r) => Math.max(r.ppvTran, r.ppvVert, r.ppvLong).toFixed(3))}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td>Frequency:</td>
                      {[0, 1, 2].map((i) => (
                        <td key={i} className="center">{cell(i, (r) => `${r.frequency} Hz`)}</td>
                      ))}
                    </tr>
                    <tr>
                      <td>dB:</td>
                      {[0, 1, 2].map((i) => (
                        <td key={i} className="center">
                          {cell(i, (r) => (r.airOverpressure ? r.airOverpressure.toFixed(2) : '—'))}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td>Operator:</td>
                      <td className="center" colSpan={3}>
                        {first?.operator ? <span className="val">{first.operator}</span> : <>&nbsp;</>}
                      </td>
                    </tr>
                    <tr>
                      <td>Location:</td>
                      <td className="center" colSpan={3}>
                        {first?.location ? <span className="val">{first.location}</span> : <>&nbsp;</>}
                      </td>
                    </tr>
                  </tbody>
                </table>
              );
            })}
          </div>
        </div>

        {/* FOOTER */}
        <div className="sig-footer">
          <div style={{ flex: 1 }}>
            Blaster: <span className="val f11">{blastLog.blasterName}</span>
            <div className="sig-line"></div>
          </div>
          <div style={{ flex: 0.8 }}>
            License #: <span className="val">{blastLog.licenseNumber}</span>
            <div className="sig-line"></div>
          </div>
          <div style={{ width: 50 }}>
            State: <span className="val">{blastLog.licenseState}</span>
          </div>
          <div style={{ flex: 1 }}>
            Signature:
            <div className="sig-line sig-img-holder">
              {sigUrl && <img src={sigUrl} alt="Signature" className="sig-img" />}
            </div>
          </div>
        </div>
      </div>

      {/* ==================== PAGE 2: BLAST DESIGN PLAN ==================== */}
      <div className="page">
        <div className="center mb4">
          <h2>Blast Design Plan</h2>
        </div>
        <table className="mb4">
          <tbody>
            <tr>
              <td className="bold italic" style={{ borderRight: 'none' }}>
                Blast Location Info: <span className="val">{job?.name}</span>
              </td>
              <td style={{ borderLeft: 'none', borderRight: 'none' }}></td>
              <td className="bold right" style={{ borderLeft: 'none' }}>
                Date of Blast: <span className="val">{fmtDate(blastDay.date)}</span>
              </td>
            </tr>
            <tr>
              <td style={{ borderRight: 'none' }}>
                Address of Blast: <span className="val">{job?.address}</span>
              </td>
              <td style={{ borderLeft: 'none', borderRight: 'none' }}>
                City: <span className="val">{job?.city}</span>
              </td>
              <td style={{ borderLeft: 'none' }}>
                State: <span className="val">{job?.state}</span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Diagram boxes — blank frames for hand annotation until M4 */}
        {shots.map((s, i) => (
          <div key={s.id}>
            <div className="section-head boxed" style={i > 0 ? { borderTop: 'none' } : undefined}>
              Shot #{s.shotNumber}
            </div>
            <div className="diagram-row">
              <div className="diagram-box">
                <div className="f8 pad2">
                  Site Diagram: &nbsp;&nbsp;<span className="f7">**Show Structures &amp; Distances**</span>
                </div>
                <PrintSiteDiagram shot={s} />
              </div>
              <div className="diagram-box wide">
                <div className="f8 pad2">Shot Diagram:</div>
                <PrintShotDiagram shot={s} />
              </div>
            </div>
          </div>
        ))}

        {/* Formulas + Typical Columns */}
        <div className="diagram-row mt4" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 auto' }}>
            <div className="formulas-box">
              <div className="bold f8" style={{ fontFamily: 'Arial', marginBottom: 2 }}>
                Formulas:
              </div>
              SD = D / W ^ .5
              <br />
              PPV = K x (SD) ^ -1.6
              <br />K = PPV x SD ^ 1.6
            </div>
          </div>
          {typicalColumns.length > 0 && (
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div className="bold f9 underline" style={{ marginBottom: 4 }}>
                Typical Columns
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20 }}>
                {shots.map((s) =>
                  typicalColumns
                    .filter((c) => c.shotId === s.id)
                    .map((col) => {
                      const topDown = [...col.layers].sort((a, b) => b.layerOrder - a.layerOrder);
                      const total = topDown.reduce((sum, l) => sum + l.lengthFt, 0);
                      return (
                        <div key={col.id}>
                          <div className="f7" style={{ marginBottom: 2 }}>
                            Shot #{s.shotNumber} — {col.name}
                          </div>
                          <ColumnVisual layers={topDown} heightPx={95} widthPx={40} />
                          <div className="f7 bold" style={{ marginTop: 2 }}>
                            {total > 0 ? `${total.toFixed(1)}'` : ''}
                          </div>
                        </div>
                      );
                    }),
                )}
              </div>
            </div>
          )}
        </div>

        {/* Structure / compliance tables — data-driven */}
        <div className="diagram-row mt6">
          {shots.map((s, i) => (
            <div key={s.id} style={{ flex: 1 }}>
              <div className="section-head boxed" style={i > 0 ? { borderLeft: 'none' } : undefined}>
                Shot #{s.shotNumber}
              </div>
              <ComplianceTable shot={s} />
            </div>
          ))}
        </div>

        <div className="print-footer">
          Generated by ShotLog — Baystate Blasting, Inc. — {fmtDate(blastDay.date)}
        </div>
      </div>
    </div>
  );
}

/**
 * Site sketch for print. Prefers the captured map snapshot (real imagery with
 * pins, stored offline as a Blob); falls back to a projected schematic, then
 * to a blank box for hand-drawing.
 */
function PrintSiteDiagram({ shot }: { shot: Shot }) {
  const site = parseSiteDiagram(shot.designPlan.siteSketchData);
  const snapshot = shot.designPlan.siteSketchImage;
  const [snapUrl, setSnapUrl] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
    if (!snapshot || !(snapshot instanceof Blob) || snapshot.size === 0) {
      setSnapUrl(null);
      return;
    }
    const url = URL.createObjectURL(snapshot);
    setSnapUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [snapshot]);

  if (snapUrl && !imgFailed) {
    return (
      <div className="site-diagram" style={{ border: 'none' }}>
        <img
          src={snapUrl}
          alt="Site map"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }
  if (!site.blastPin || site.structures.length === 0) {
    return <div className="site-diagram"></div>; // blank box for hand-drawing
  }
  const blast = site.blastPin;
  const W = 300;
  const H = 150;
  // Project each structure to feet-offsets from the blast pin
  const pts = site.structures.map((s) => {
    const east =
      distanceFt({ lat: blast.lat, lng: blast.lng }, { lat: blast.lat, lng: s.lng }) *
      Math.sign(s.lng - blast.lng);
    const north =
      distanceFt({ lat: blast.lat, lng: blast.lng }, { lat: s.lat, lng: blast.lng }) *
      Math.sign(s.lat - blast.lat);
    return { s, east, north, dist: Math.round(distanceFt(blast, s)) };
  });
  const maxSpan = Math.max(...pts.map((p) => Math.max(Math.abs(p.east), Math.abs(p.north))), 100);
  const scale = (Math.min(W, H) / 2 - 30) / maxSpan;
  const bx = W / 2;
  const by = H / 2;
  const px = (east: number) => bx + east * scale;
  const py = (north: number) => by - north * scale;

  return (
    <div className="site-diagram" style={{ border: 'none', background: '#fafaf5' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%' }}>
        {/* Distance lines */}
        {pts.map((p) => (
          <g key={p.s.id}>
            <line
              x1={bx}
              y1={by}
              x2={px(p.east)}
              y2={py(p.north)}
              stroke="#000"
              strokeWidth={0.8}
              strokeDasharray="3,2"
            />
            <text
              x={bx + (px(p.east) - bx) * 0.68 + 3}
              y={by + (py(p.north) - by) * 0.68 - 3}
              fontSize={8}
              fontWeight={700}
            >
              {p.dist}'
            </text>
          </g>
        ))}
        {/* Blast zone */}
        <rect
          x={bx - 22}
          y={by - 14}
          width={44}
          height={28}
          rx={3}
          fill="none"
          stroke="#DD6B20"
          strokeWidth={2}
          strokeDasharray="4,2"
        />
        <text x={bx} y={by + 4} textAnchor="middle" fontSize={8} fill="#DD6B20" fontWeight={700}>
          BLAST
        </text>
        {/* Structures */}
        {pts.map((p) => (
          <g key={p.s.id}>
            <rect
              x={px(p.east) - 12}
              y={py(p.north) - 9}
              width={24}
              height={18}
              rx={2}
              fill="#fafaf5"
              stroke="#000"
              strokeWidth={1.2}
            />
            <text x={px(p.east)} y={py(p.north) + 3} textAnchor="middle" fontSize={6} fontWeight={700}>
              {p.s.label.replace('Structure ', 'S')}
            </text>
          </g>
        ))}
        {/* North arrow */}
        <text x={12} y={H - 6} fontSize={9} fontWeight={700}>
          N
        </text>
        <polygon points={`12,${H - 26} 9,${H - 18} 15,${H - 18}`} fill="#000" />
        <line x1={12} y1={H - 18} x2={12} y2={H - 14} stroke="#000" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

/** The timed hole grid + wires, sized for the paper form's diagram box */
function PrintShotDiagram({ shot }: { shot: Shot }) {
  const diagram = parseDiagram(shot.designPlan.shotDiagramData);
  const hasContent =
    diagram.start !== undefined ||
    Object.keys(diagram.delays).length > 0 ||
    diagram.wires.length > 0;
  if (!hasContent) return <div className="site-diagram"></div>; // blank box for hand-drawing

  const { rows, cols, delays, wires, start, interHoleMs } = diagram;
  const times = computeFiringTimes(diagram);
  const spacing = 20;
  const radius = 7.5;
  const pad = 12;
  const width = pad * 2 + cols * spacing;
  const height = pad * 2 + rows * spacing;
  const cx = (idx: number) => pad + (idx % cols) * spacing + spacing / 2;
  const cy = (idx: number) => pad + Math.floor(idx / cols) * spacing + spacing / 2;
  const usedDelays = [...new Set(Object.values(delays))].sort((a, b) => a - b);
  const leadWires = wires.filter((w) => w.leadMs !== undefined);

  return (
    <div style={{ textAlign: 'center', padding: 2 }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: '100%', maxHeight: 150 }}>
        <defs>
          <marker id="print-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#1a365d" />
          </marker>
          <marker id="print-lead-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#38a169" />
          </marker>
        </defs>
        {wires.map((w, i) => {
          const x1 = cx(w.from), y1 = cy(w.from), x2 = cx(w.to), y2 = cy(w.to);
          const dx = x2 - x1, dy = y2 - y1;
          const len = Math.hypot(dx, dy) || 1;
          const trim = radius + 2;
          const isLead = w.leadMs !== undefined;
          return (
            <g key={i}>
              <line
                x1={x1 + (dx / len) * trim}
                y1={y1 + (dy / len) * trim}
                x2={x2 - (dx / len) * trim}
                y2={y2 - (dy / len) * trim}
                stroke={isLead ? '#38a169' : '#1a365d'}
                strokeWidth={1.5}
                strokeDasharray={isLead ? '3,2' : undefined}
                markerEnd={isLead ? 'url(#print-lead-arrow)' : 'url(#print-arrow)'}
              />
              {isLead && (
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 3} textAnchor="middle" fontSize={5.5} fontWeight={700} fill="#38a169">
                  {w.leadMs}ms
                </text>
              )}
            </g>
          );
        })}
        {Array.from({ length: rows * cols }, (_, idx) => {
          const t = times.get(idx);
          const legacyMs = start === undefined ? delays[idx] : undefined;
          const label = t ?? legacyMs;
          const fill =
            start?.hole === idx
              ? '#dd6b20'
              : t !== undefined
                ? '#1a365d'
                : legacyMs !== undefined
                  ? DELAY_COLORS[legacyMs] ?? '#1a365d'
                  : 'white';
          return (
            <g key={idx}>
              <circle
                cx={cx(idx)}
                cy={cy(idx)}
                r={radius}
                fill={fill}
                stroke={label !== undefined ? fill : '#999'}
                strokeWidth={0.8}
              />
              {label !== undefined && (
                <text x={cx(idx)} y={cy(idx) + 2.5} textAnchor="middle" fontSize={label >= 1000 ? 5 : 6.5} fontWeight={700} fill="white">
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {start !== undefined ? (
        <div style={{ fontSize: 7, marginTop: 2 }}>
          First hole {start.leadMs}ms · +{interHoleMs}ms/hole
          {leadWires.length > 0 &&
            ` · leads: ${leadWires.map((w) => `${w.leadMs}ms`).join(', ')}`}
          {' '}· all times in ms
        </div>
      ) : (
        usedDelays.length > 0 && (
          <div style={{ fontSize: 7, display: 'flex', gap: 8, justifyContent: 'center', marginTop: 2 }}>
            {usedDelays.map((ms) => (
              <span key={ms} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: DELAY_COLORS[ms] ?? '#1a365d',
                    display: 'inline-block',
                  }}
                />
                {ms}ms
              </span>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function PrintWarnings({ issues }: { issues: ReturnType<typeof validateForPrint> }) {
  if (issues.length === 0) return null;
  return (
    <div className="print-warnings">
      <div className="title">
        <TriangleAlert size={16} /> This log has {issues.length} issue
        {issues.length > 1 ? 's' : ''} — it will still print, but review before handing it over:
      </div>
      <ul>
        {issues.map((issue) => (
          <li key={issue.field}>
            <strong>{issue.section}:</strong> {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrintToolbar({ blastDayId, filename }: { blastDayId: string; filename: string }) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  return (
    <div className="print-toolbar">
      <button onClick={() => navigate(`/blast-day/${blastDayId}`)}>
        <ArrowLeft size={16} /> Back
      </button>
      <span style={{ display: 'flex', gap: 8 }}>
        <button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await savePagesAsPdf(filename);
            } finally {
              setSaving(false);
            }
          }}
        >
          <FileDown size={16} /> {saving ? 'Generating…' : 'Save PDF'}
        </button>
        <button className="primary" onClick={() => window.print()}>
          <Printer size={16} /> Print
        </button>
      </span>
    </div>
  );
}

function ShotRow({
  label,
  shots,
  get,
}: {
  label: string;
  shots: Shot[];
  get: (s: Shot) => string;
}) {
  return (
    <tr>
      <td>{label}</td>
      {shots.map((s) => (
        <td key={s.id} className="val center">
          {get(s)}
        </td>
      ))}
    </tr>
  );
}

function ComplianceTable({ shot }: { shot: Shot }) {
  const dp = shot.designPlan;
  return (
    <table className="f85">
      <tbody>
        <tr>
          <td>Location of Closest Structure:</td>
          <td className="val">{dash(dp.closestStructureLocation)}</td>
        </tr>
        <tr>
          <td>Distance of Closest Structure:</td>
          <td className="val">{dash(dp.closestStructureDistance, ' ft')}</td>
        </tr>
        <tr>
          <td>Distance of Closest Borehole:</td>
          <td className="val">{dash(dp.closestBoreholeDistance, ' ft')}</td>
        </tr>
        <tr>
          <td>Max Holes Per Delay:</td>
          <td className="val">{dash(dp.maxHolesPerDelay)}</td>
        </tr>
        <tr>
          <td>Max Pounds Per Delay:</td>
          <td className="val">{dash(dp.maxPoundsPerDelay, ' lbs')}</td>
        </tr>
        <tr>
          <td>Scale Distance:</td>
          <td className="val">{dp.scaledDistance ? dp.scaledDistance.toFixed(1) : '—'}</td>
        </tr>
        <tr>
          <td>Predicted PPV: K Factor:</td>
          <td className="val">
            {dp.predictedPPV ? `${dp.predictedPPV.toFixed(2)} in/s` : '—'} &nbsp; K={dp.kFactor}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

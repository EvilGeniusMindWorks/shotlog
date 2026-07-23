import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useBlastDay } from '@/hooks/useBlastDay';
import { distributeByHoles, powderFactor } from '@shotlog/shared';
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
      <PrintToolbar blastDayId={blastDay.id} />
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

            {/* Seismic monitoring — blank for hand-fill until seismo capture ships */}
            <div className="seismo-title">Seismic Monitoring Info:</div>
            {shots.map((s) => (
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
                  {['Graph (Seis) #:', 'PPV:', 'Frequency:', 'dB:'].map((label) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td>&nbsp;</td>
                    </tr>
                  ))}
                  <tr>
                    <td>Operator:</td>
                    <td colSpan={3}>&nbsp;</td>
                  </tr>
                  <tr>
                    <td>Location:</td>
                    <td colSpan={3}>&nbsp;</td>
                  </tr>
                </tbody>
              </table>
            ))}
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
                <div className="site-diagram"></div>
              </div>
              <div className="diagram-box wide">
                <div className="f8 pad2">Shot Diagram:</div>
                <div className="site-diagram"></div>
              </div>
            </div>
          </div>
        ))}

        {/* Formulas */}
        <div className="mt4">
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

function PrintToolbar({ blastDayId }: { blastDayId: string }) {
  const navigate = useNavigate();
  return (
    <div className="print-toolbar">
      <button onClick={() => navigate(`/blast-day/${blastDayId}`)}>
        <ArrowLeft size={16} /> Back
      </button>
      <button className="primary" onClick={() => window.print()}>
        <Printer size={16} /> Print / Save PDF
      </button>
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

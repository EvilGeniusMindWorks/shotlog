import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Printer } from 'lucide-react';
import { db } from '@/db';
import { useBlastDay } from '@/hooks/useBlastDay';
import type { EquipmentEntry, ProductCategory, WorkForceEntry } from '@/db/schema';
import './print-blast-log.css';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** lbs-summary buckets for the Materials Summary page */
const AGENT_CATEGORIES: ProductCategory[] = ['bulk', 'anfo', 'anfo_wr', 'emulsion'];
const HE_CATEGORIES: ProductCategory[] = ['gel_dynamite', 'cartridge'];
const BOOSTER_CATEGORIES: ProductCategory[] = ['booster', 'booster_electronic'];

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function dash(v: string | number | null | undefined, suffix = ''): string {
  if (v === null || v === undefined || v === '' || v === 0) return '—';
  return `${v}${suffix}`;
}

/**
 * Print-ready Daily Report + Materials Summary matching Baystate's paper form
 * (example-daily-report.html). Work Force rows pad to the form's 10 lines;
 * equipment usage nests in the right-hand columns grouped by category.
 */
export function PrintDailyReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { blastDay, job, blastLog, dailyReport, shots, explosiveUsage } = useBlastDay(id);

  const workForce =
    useLiveQuery(
      async () =>
        dailyReport
          ? (await db.workForceEntries.where('dailyReportId').equals(dailyReport.id).toArray()).sort(
              (a, b) => a.rowNumber - b.rowNumber,
            )
          : [],
      [dailyReport?.id],
    ) ?? [];
  const equipment =
    useLiveQuery(async () => {
      if (!dailyReport) return [] as EquipmentEntry[];
      return db.equipmentEntries.where('dailyReportId').equals(dailyReport.id).toArray();
    }, [dailyReport?.id]) ?? [];
  const materials =
    useLiveQuery(async () => {
      if (!dailyReport) return [];
      return db.materialEntries.where('dailyReportId').equals(dailyReport.id).toArray();
    }, [dailyReport?.id]) ?? [];
  const subcontractors =
    useLiveQuery(async () => {
      if (!dailyReport) return [];
      return db.subcontractorEntries.where('dailyReportId').equals(dailyReport.id).toArray();
    }, [dailyReport?.id]) ?? [];

  if (!blastDay || !dailyReport) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading…</div>;
  }

  const dow = new Date(`${blastDay.date}T12:00:00`).getDay();

  // Drill summary from shots
  const totalHoles = shots.reduce((s, sh) => s + sh.totals.numHoles, 0);
  const totalFootage = shots.reduce((s, sh) => s + sh.totals.totalDrillFootage, 0);
  const pattern = shots[0]?.drillParams.burden
    ? `${shots[0].drillParams.burden}×${shots[0].drillParams.spacing}`
    : '';

  // Equipment grouped for the nested right-hand columns
  const equipByCat = {
    vehicle: equipment.filter((e) => e.category === 'vehicle'),
    equip_drill: equipment.filter((e) => e.category === 'equip_drill'),
    mats_seismo: equipment.filter((e) => e.category === 'mats_seismo'),
  };
  // Right column layout: label row + item rows per category, in form order
  type EquipCell = { label?: string; item?: EquipmentEntry };
  const equipCells: EquipCell[] = [
    { label: 'Vehicles' },
    ...equipByCat.vehicle.map((item) => ({ item })),
    { label: 'Equip / Drills' },
    ...equipByCat.equip_drill.map((item) => ({ item })),
    { label: 'Mats / Seismo' },
    ...equipByCat.mats_seismo.map((item) => ({ item })),
  ];

  const wfRowCount = Math.max(10, workForce.length, equipCells.length);
  const wfRows: (WorkForceEntry | undefined)[] = Array.from(
    { length: wfRowCount },
    (_, i) => workForce[i],
  );

  // Materials summary buckets (page 2)
  const products = explosiveUsage?.products ?? [];
  const lbsIn = (cats: ProductCategory[]) =>
    products
      .filter((p) => cats.includes(p.category as ProductCategory))
      .reduce((s, p) => s + p.totalWeight, 0);
  const agentLbs = lbsIn(AGENT_CATEGORIES);
  const heLbs = lbsIn(HE_CATEGORIES);
  const boosterLbs = lbsIn(BOOSTER_CATEGORIES);
  const detonatorCount = (explosiveUsage?.detonators ?? []).reduce((s, d) => s + d.quantity, 0);
  const totalLbs = explosiveUsage?.totalPoundsShot ?? 0;

  const summaryGroups: { title: string; cats: ProductCategory[]; unit: string }[] = [
    { title: 'Blasting Agents', cats: AGENT_CATEGORIES, unit: 'LB' },
    { title: 'High Explosives', cats: HE_CATEGORIES, unit: 'LB' },
    { title: 'Boosters', cats: BOOSTER_CATEGORIES, unit: 'EA' },
  ];

  return (
    <div className="print-blast-log">
      <div className="print-toolbar">
        <button onClick={() => navigate(`/blast-day/${blastDay.id}`)}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="primary" onClick={() => window.print()}>
          <Printer size={16} /> Print / Save PDF
        </button>
      </div>

      {/* ==================== PAGE 1: DAILY REPORT ==================== */}
      <div className="page">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.5 }}>
              BAYSTATE BLASTING, INC - DAILY REPORT
            </div>
            <div style={{ fontSize: 8, color: '#666', marginTop: 2 }}>
              100 Air Mile Exemption (395.1)
            </div>
          </div>
          <div>
            <div className="date-box">{fmtDate(blastDay.date)}</div>
            <div className="dow-strip">
              {DOW.slice(1).map((d, i) => (
                <span key={i} className={i + 1 === dow ? 'circled' : undefined}>
                  {d}{' '}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Customer / address */}
        <table className="mb4">
          <tbody>
            <tr>
              <td style={{ width: '50%', borderRight: 'none' }}>
                Customer: <span className="val">{job?.customer}</span>
              </td>
              <td style={{ borderLeft: 'none' }}>
                Address:{' '}
                <span className="val">
                  {[job?.address, job?.city, job?.state].filter(Boolean).join(', ')}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Conditions bar — selected option circled */}
        <table className="mb4 f85">
          <tbody>
            <tr>
              <CondCell
                title="Temperature"
                options={[
                  { key: 'low', label: 'LOW' },
                  { key: 'mod', label: 'MOD' },
                  { key: 'high', label: 'HIGH' },
                ]}
                value={blastDay.conditions.temperatureRange}
                width="20%"
              />
              <CondCell
                title="Weather"
                options={[
                  { key: 'sunny', label: 'SUNNY' },
                  { key: 'cloudy', label: 'CLOUDY' },
                  { key: 'partly_cloudy', label: 'PARTLY CLOUDY' },
                  { key: 'rain_light', label: 'RAIN: LIGHT' },
                  { key: 'rain_heavy', label: 'HEAVY' },
                  { key: 'rain_out', label: 'RAIN OUT' },
                ]}
                value={blastDay.conditions.weather}
                width="30%"
              />
              <CondCell
                title="Ground Conditions"
                options={[
                  { key: 'normal', label: 'NORMAL' },
                  { key: 'wet', label: 'WET' },
                  { key: 'muddy', label: 'MUDDY' },
                  { key: 'rock', label: 'ROCK' },
                  { key: 'frozen', label: 'FROZEN' },
                ]}
                value={blastDay.conditions.groundConditions}
                width="22%"
              />
              <CondCell
                title="Type Of Work"
                options={[
                  { key: 'drill_only', label: 'Drill Only' },
                  { key: 'drill_to_blast', label: 'Drill to Blast' },
                  { key: 'blasting', label: 'Blasting' },
                  { key: 'crushing', label: 'Crushing' },
                ]}
                value={blastDay.typeOfWork}
                width="18%"
              />
              <td className="center" style={{ width: '10%', fontSize: 14, fontWeight: 900, border: '3px solid #000' }}>
                PROJECT
                <br />
                <span className="val" style={{ fontSize: 12 }}>
                  {(job?.name ?? '')
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 3)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Work Force + nested Equipment */}
        <table className="f85">
          <tbody>
            <tr className="shade">
              <td className="bold center" style={{ width: 110 }}>Work Force</td>
              <td className="bold center" style={{ width: 32 }}>IN</td>
              <td className="bold center" style={{ width: 32 }}>OUT</td>
              <td className="bold center" style={{ width: 22 }}>ST</td>
              <td className="bold center" style={{ width: 22 }}>OT</td>
              <td className="bold center" style={{ width: 24 }}>TRK</td>
              <td className="bold center" style={{ width: 24 }}>TRVL</td>
              <td className="bold center" style={{ width: 60 }}>
                Asset #<br />
                <span style={{ fontSize: 7 }}>(Used/OnSite)</span>
              </td>
              <td className="bold center" style={{ width: 36 }}>Hrs Start</td>
              <td className="bold center" style={{ width: 36 }}>Hrs End</td>
            </tr>
            {wfRows.map((w, i) => {
              const cell = equipCells[i];
              return (
                <tr key={i}>
                  <td>
                    {i + 1}.{' '}
                    {w && (
                      <span className="val" style={{ fontSize: 9 }}>
                        {w.workerName}
                      </span>
                    )}
                  </td>
                  <td className="val center">{w ? dash(w.timeIn) : ''}</td>
                  <td className="val center">{w ? dash(w.timeOut) : ''}</td>
                  <td className="val center">{w && w.straightTime ? w.straightTime : ''}</td>
                  <td className="val center">{w && w.overtime ? w.overtime : ''}</td>
                  <td className="val center">{w && w.truckHours ? '✓' : ''}</td>
                  <td className="val center">{w && w.travelHours ? w.travelHours : ''}</td>
                  {cell?.label ? (
                    <td colSpan={3} className="center" style={{ fontSize: 8, fontWeight: 'bold', fontStyle: 'italic' }}>
                      {cell.label}
                    </td>
                  ) : cell?.item ? (
                    <>
                      <td className="val center" style={{ fontSize: 8 }}>{cell.item.assetNumber}</td>
                      <td className="val center" style={{ fontSize: 8 }}>{cell.item.hoursStart || ''}</td>
                      <td className="val center" style={{ fontSize: 8 }}>{cell.item.hoursEnd || ''}</td>
                    </>
                  ) : (
                    <>
                      <td></td>
                      <td></td>
                      <td></td>
                    </>
                  )}
                </tr>
              );
            })}
            <tr style={{ background: '#f0f0f0' }}>
              <td className="bold"># of Drill Holes:</td>
              <td className="val center" colSpan={6}>{dash(totalHoles)}</td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
            <tr style={{ background: '#f0f0f0' }}>
              <td className="bold">Total Vertical Ft Drilled:</td>
              <td className="val center" colSpan={6}>{dash(Math.round(totalFootage))}</td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
            <tr style={{ background: '#f0f0f0' }}>
              <td className="bold">Pattern:</td>
              <td className="val center" colSpan={6}>{dash(pattern)}</td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>

        {/* Materials + Subcontractors */}
        <div className="diagram-row mt4" style={{ gap: 4 }}>
          <div style={{ flex: 1 }}>
            <table className="f85">
              <tbody>
                <tr className="shade">
                  <td className="bold center" colSpan={4}>
                    Materials / <span className="red">Onsite Repairs</span> / Fuel
                  </td>
                </tr>
                <tr className="shade">
                  <td className="bold center" style={{ width: 70 }}>Vender</td>
                  <td className="bold center">Description</td>
                  <td className="bold center" style={{ width: 40 }}>Unit</td>
                  <td className="bold center" style={{ width: 45 }}>Total</td>
                </tr>
                <tr>
                  <td colSpan={4} className="center" style={{ fontStyle: 'italic', fontSize: 7.5 }}>
                    **Explosives on Back
                  </td>
                </tr>
                {materials.map((m, i) => (
                  <tr key={i}>
                    <td className="val" style={{ fontSize: 8 }}>{m.vendor}</td>
                    <td className="val" style={{ fontSize: 8 }}>{m.description}</td>
                    <td className="val center" style={{ fontSize: 8 }}>{m.unit}</td>
                    <td className="val center" style={{ fontSize: 8 }}>{m.total ? `$${m.total}` : ''}</td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, 7 - materials.length) }, (_, i) => (
                  <tr key={`e${i}`}>
                    <td>&nbsp;</td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ flex: 0.9 }}>
            <table className="f85">
              <tbody>
                <tr className="shade">
                  <td className="bold center" colSpan={4}>Subcontractors / Rentals / Fire Detail</td>
                </tr>
                <tr className="shade">
                  <td className="bold center" style={{ width: 70 }}>Vender</td>
                  <td className="bold center">Description</td>
                  <td className="bold center" style={{ width: 30 }}>Hrs</td>
                  <td className="bold center" style={{ width: 45 }}>Total</td>
                </tr>
                {subcontractors.map((s, i) => (
                  <tr key={i}>
                    <td className="val" style={{ fontSize: 8 }}>{s.vendor}</td>
                    <td className="val" style={{ fontSize: 8 }}>{s.description}</td>
                    <td className="val center" style={{ fontSize: 8 }}>{s.hours || ''}</td>
                    <td className="val center" style={{ fontSize: 8 }}>{s.total ? `$${s.total}` : ''}</td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, 4 - subcontractors.length) }, (_, i) => (
                  <tr key={`e${i}`}>
                    <td>&nbsp;</td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes */}
        <table className="mt4">
          <tbody>
            <tr>
              <td className="bold red" style={{ width: 50, verticalAlign: 'top' }}>NOTES:</td>
              <td style={{ height: 70, verticalAlign: 'top' }}>
                <span className="val" style={{ fontSize: 9 }}>{dailyReport.notes}</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="print-footer">
          Generated by ShotLog — Baystate Blasting, Inc. — {fmtDate(blastDay.date)}
        </div>
      </div>

      {/* ==================== PAGE 2: MATERIALS SUMMARY ==================== */}
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0.5 }}>BAYSTATE BLASTING</div>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 0.5 }}>MATERIALS SUMMARY</div>
          </div>
          <div>
            <div className="date-box">{fmtDate(blastDay.date)}</div>
          </div>
        </div>

        <table style={{ marginBottom: 8 }}>
          <tbody>
            <tr>
              <td style={{ border: 'none', borderBottom: '1px solid #000' }}>
                Company:{' '}
                <span className="val" style={{ fontSize: 11 }}>
                  Baystate Blasting, Inc. — {job?.name} — {fmtDate(blastDay.date)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Materials used, grouped by category */}
        {summaryGroups.map((group) => {
          const items = products.filter((p) => group.cats.includes(p.category as ProductCategory));
          return (
            <div key={group.title}>
              <div className="bold f10" style={{ margin: '8px 0 3px' }}>{group.title}</div>
              <table className="f9">
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td style={{ width: 220 }}></td>
                      <td className="center" style={{ width: 30 }}>{group.unit}</td>
                      <td className="center" style={{ width: 55 }}>—</td>
                    </tr>
                  )}
                  {items.map((p, i) => (
                    <tr key={i}>
                      <td className="right" style={{ width: 220 }}>{p.productName}</td>
                      <td className="center" style={{ width: 30 }}>{group.unit}</td>
                      <td className="val center" style={{ width: 55 }}>
                        {group.unit === 'LB' ? p.totalWeight.toFixed(0) : p.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {/* Detonators */}
        <div className="bold f10" style={{ margin: '8px 0 3px' }}>Detonators</div>
        <table className="f9">
          <tbody>
            {(explosiveUsage?.detonators ?? []).length === 0 && (
              <tr>
                <td style={{ width: 220 }}></td>
                <td className="center" style={{ width: 30 }}>EA</td>
                <td className="center" style={{ width: 55 }}>—</td>
              </tr>
            )}
            {(explosiveUsage?.detonators ?? []).map((d, i) => (
              <tr key={i}>
                <td className="right" style={{ width: 220 }}>
                  {d.name} {d.unitLength}
                </td>
                <td className="center" style={{ width: 30 }}>EA</td>
                <td className="val center" style={{ width: 55 }}>{d.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Lead in line */}
        <div className="bold f10" style={{ margin: '10px 0 3px' }}>LEAD IN LINE</div>
        <table className="f9" style={{ width: 320 }}>
          <tbody>
            <tr>
              <td className="right" style={{ width: 220 }}>Lead Line (LF)</td>
              <td className="center" style={{ width: 30 }}>LF</td>
              <td className="val center" style={{ width: 55 }}>{dash(explosiveUsage?.leadLine)}</td>
            </tr>
          </tbody>
        </table>

        {/* Daily totals banner */}
        <div className="totals-banner">
          <div style={{ fontSize: 11, fontWeight: 900, color: '#1a365d', marginBottom: 6, textAlign: 'center' }}>
            DAILY TOTALS SUMMARY
          </div>
          <div className="row">
            <div>
              <div className="val" style={{ fontSize: 16 }}>{agentLbs.toFixed(0)}</div>
              <div style={{ fontSize: 8, color: '#666' }}>Blasting Agents (lbs)</div>
            </div>
            <div>
              <div className="val" style={{ fontSize: 16 }}>{heLbs.toFixed(0)}</div>
              <div style={{ fontSize: 8, color: '#666' }}>High Explosives (lbs)</div>
            </div>
            <div>
              <div className="val" style={{ fontSize: 16 }}>{boosterLbs.toFixed(1)}</div>
              <div style={{ fontSize: 8, color: '#666' }}>Boosters (lbs)</div>
            </div>
            <div className="divider">
              <div className="val" style={{ fontSize: 20, color: '#DD6B20' }}>{totalLbs.toFixed(1)}</div>
              <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a365d' }}>TOTAL LBS SHOT</div>
            </div>
            <div className="divider">
              <div className="val" style={{ fontSize: 16 }}>{detonatorCount || '—'}</div>
              <div style={{ fontSize: 8, color: '#666' }}>Detonators (ea)</div>
            </div>
          </div>
        </div>

        <div className="print-footer">
          Generated by ShotLog — Baystate Blasting, Inc. — {fmtDate(blastDay.date)}
        </div>
      </div>
    </div>
  );
}

function CondCell({
  title,
  options,
  value,
  width,
}: {
  title: string;
  options: { key: string; label: string }[];
  value: string;
  width: string;
}) {
  return (
    <td className="center" style={{ width, padding: '4px 6px', fontSize: 9 }}>
      <div className="bold" style={{ marginBottom: 2 }}>{title}</div>
      <div>
        {options.map((opt) => (
          <span key={opt.key} className={`cond-option${opt.key === value ? ' circled' : ''}`}>
            {opt.label}
          </span>
        ))}
      </div>
    </td>
  );
}

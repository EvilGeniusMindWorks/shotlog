// Blasting Log + Blast Design Plan — searchable PDF matching Baystate's
// paper form (same structure as PrintBlastLogPage). The design-plan
// diagrams port to PDF-native SVG: map snapshots embed as images, the
// projected site schematic and timed shot diagram redraw as vectors.
import { pdf, Circle, Line, Polygon, Rect, Svg, Text as SvgText } from '@react-pdf/renderer';
import { db } from '@/db';
import { distributeByHoles, powderFactor } from '@shotlog/shared';
import { DELAY_COLORS, computeFiringTimes, parseDiagram } from '@/lib/shotDiagram';
import { distanceFt, parseSiteDiagram } from '@/lib/siteDiagram';
import { LAYER_STYLES } from '@/components/design/TypicalColumnBuilder';
import type {
  BlastDay,
  BlastLog,
  ExplosiveUsage,
  Job,
  SeismoReading,
  Shot,
  TypicalColumn,
} from '@/db/schema';
import {
  BOX_OFF,
  BOX_ON,
  Document,
  Footer,
  HeaderBar,
  Image,
  K,
  Page,
  T,
  TD,
  TR,
  Text,
  View,
  blobToDataUrl,
  dash,
  fmtDate,
} from './kit';

const TEMP_LABEL: Record<string, string> = { low: 'LOW', mod: 'MOD', high: 'HIGH' };
const WEATHER_LABEL: Record<string, string> = {
  sunny: 'Sunny',
  cloudy: 'Cloudy',
  partly_cloudy: 'Partly Cloudy',
  rain_light: 'Light Rain',
  rain_heavy: 'Heavy Rain',
  rain_out: 'Rain Out',
};

interface Data {
  blastDay: BlastDay;
  job?: Job;
  blastLog: BlastLog;
  shots: Shot[];
  explosiveUsage?: ExplosiveUsage;
  typicalColumns: TypicalColumn[];
  seismoReadings: SeismoReading[];
  companyName: string;
  dealerNumber?: string;
  sigUrl: string | null;
  /** shotId → site-map snapshot data URL (when captured) */
  snapshotUrls: Record<string, string>;
}

/** Label column + one value cell per shot */
function ShotRow({ label, shots, get }: { label: string; shots: Shot[]; get: (s: Shot) => string }) {
  return (
    <TR>
      <TD w={92} textStyle={{ fontSize: 7.5 }}>{label}</TD>
      {shots.map((s) => (
        <TD key={s.id} textStyle={[K.val, K.center, { fontSize: 7.5 }]}>{get(s)}</TD>
      ))}
    </TR>
  );
}

/** Arrowhead polygon at the end of a line (react-pdf SVG has no markers). */
function arrowPoints(x1: number, y1: number, x2: number, y2: number, size = 4): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const p = (a: number, r: number) => `${x2 - r * Math.cos(angle + a)},${y2 - r * Math.sin(angle + a)}`;
  return `${x2},${y2} ${p(0.45, size)} ${p(-0.45, size)}`;
}

/** Projected site schematic (blast zone, structures, distances) as PDF SVG. */
function SiteSchematic({ shot }: { shot: Shot }) {
  const site = parseSiteDiagram(shot.designPlan.siteSketchData);
  if (!site.blastPin || site.structures.length === 0) return null;
  const blast = site.blastPin;
  const W = 240;
  const H = 120;
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
  const scale = (Math.min(W, H) / 2 - 24) / maxSpan;
  const bx = W / 2;
  const by = H / 2;
  const px = (east: number) => bx + east * scale;
  const py = (north: number) => by - north * scale;
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 108 }}>
      {pts.map((p) => (
        <Line
          key={`l${p.s.id}`}
          x1={bx}
          y1={by}
          x2={px(p.east)}
          y2={py(p.north)}
          stroke="#000"
          strokeWidth={0.7}
          strokeDasharray="3,2"
        />
      ))}
      {pts.map((p) => {
        // label sits just past the blast box along the line, offset upward so
        // it never collides with the BLAST rect or the structure box
        const dx = px(p.east) - bx;
        const dy = py(p.north) - by;
        const len = Math.hypot(dx, dy) || 1;
        const t = Math.min(0.62, Math.max(0.45, 30 / len));
        return (
          <SvgText
            key={`t${p.s.id}`}
            x={bx + dx * t + 2}
            y={by + dy * t - 5}
            style={{ fontSize: 7, fontFamily: 'Helvetica-Bold' }}
          >
            {`${p.dist}'`}
          </SvgText>
        );
      })}
      <Rect x={bx - 20} y={by - 12} width={40} height={24} fill="none" stroke="#DD6B20" strokeWidth={1.5} strokeDasharray="4,2" />
      <SvgText x={bx - 12} y={by + 3} fill="#DD6B20" style={{ fontSize: 7, fontFamily: 'Helvetica-Bold' }}>
        BLAST
      </SvgText>
      {pts.map((p) => (
        <Rect
          key={`r${p.s.id}`}
          x={px(p.east) - 11}
          y={py(p.north) - 8}
          width={22}
          height={16}
          fill="#fafaf5"
          stroke="#000"
          strokeWidth={1}
        />
      ))}
      {pts.map((p) => (
        <SvgText
          key={`s${p.s.id}`}
          x={px(p.east) - 8}
          y={py(p.north) + 2.5}
          style={{ fontSize: 5.5, fontFamily: 'Helvetica-Bold' }}
        >
          {p.s.label.replace('Structure ', 'S')}
        </SvgText>
      ))}
      <SvgText x={8} y={H - 5} style={{ fontSize: 8, fontFamily: 'Helvetica-Bold' }}>N</SvgText>
      <Polygon points={`11,${H - 24} 8,${H - 16} 14,${H - 16}`} fill="#000" />
      <Line x1={11} y1={H - 16} x2={11} y2={H - 12} stroke="#000" strokeWidth={1.2} />
    </Svg>
  );
}

/** The timed hole grid + wires, redrawn as PDF vectors. */
function ShotDiagramSvg({ shot }: { shot: Shot }) {
  const diagram = parseDiagram(shot.designPlan.shotDiagramData);
  const hasContent =
    diagram.start !== undefined || Object.keys(diagram.delays).length > 0 || diagram.wires.length > 0;
  if (!hasContent) return null;
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
    <View style={{ alignItems: 'center' }}>
      <Svg viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: '100%', height: Math.min(108, height * 0.75) }}>
        {wires.map((w, i) => {
          const x1 = cx(w.from), y1 = cy(w.from), x2 = cx(w.to), y2 = cy(w.to);
          const dx = x2 - x1, dy = y2 - y1;
          const len = Math.hypot(dx, dy) || 1;
          const trim = radius + 2;
          const ax1 = x1 + (dx / len) * trim, ay1 = y1 + (dy / len) * trim;
          const ax2 = x2 - (dx / len) * trim, ay2 = y2 - (dy / len) * trim;
          const isLead = w.leadMs !== undefined;
          const color = isLead ? '#38a169' : '#1a365d';
          return (
            <>
              <Line
                key={`w${i}`}
                x1={ax1}
                y1={ay1}
                x2={ax2}
                y2={ay2}
                stroke={color}
                strokeWidth={1.3}
                strokeDasharray={isLead ? '3,2' : undefined}
              />
              <Polygon key={`a${i}`} points={arrowPoints(ax1, ay1, ax2, ay2)} fill={color} />
              {isLead ? (
                <SvgText
                  key={`lt${i}`}
                  x={(x1 + x2) / 2 - 6}
                  y={(y1 + y2) / 2 - 3}
                  fill="#38a169"
                  style={{ fontSize: 5, fontFamily: 'Helvetica-Bold' }}
                >
                  {`${w.leadMs}ms`}
                </SvgText>
              ) : null}
            </>
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
            <>
              <Circle
                key={`c${idx}`}
                cx={cx(idx)}
                cy={cy(idx)}
                r={radius}
                fill={fill}
                stroke={label !== undefined ? fill : '#999'}
                strokeWidth={0.8}
              />
              {label !== undefined ? (
                <SvgText
                  key={`ct${idx}`}
                  x={cx(idx) - (String(label).length * (label >= 1000 ? 1.4 : 1.8))}
                  y={cy(idx) + 2.2}
                  fill="white"
                  style={{ fontSize: label >= 1000 ? 4.5 : 6, fontFamily: 'Helvetica-Bold' }}
                >
                  {String(label)}
                </SvgText>
              ) : null}
            </>
          );
        })}
      </Svg>
      {start !== undefined ? (
        <Text style={{ fontSize: 6, marginTop: 1.5 }}>
          {`First hole ${start.leadMs}ms · +${interHoleMs}ms/hole${
            leadWires.length > 0 ? ` · leads: ${leadWires.map((w) => `${w.leadMs}ms`).join(', ')}` : ''
          } · all times in ms`}
        </Text>
      ) : usedDelays.length > 0 ? (
        <Text style={{ fontSize: 6, marginTop: 1.5 }}>
          {`Delays: ${usedDelays.map((ms) => `${ms}ms`).join(' · ')}`}
        </Text>
      ) : null}
    </View>
  );
}

/** Typical column stack (stemming/explosive/booster layers to scale). */
function ColumnStack({ column }: { column: TypicalColumn }) {
  const topDown = [...column.layers].sort((a, b) => b.layerOrder - a.layerOrder);
  const total = topDown.reduce((sum, l) => sum + l.lengthFt, 0);
  if (total <= 0) return null;
  const H = 82;
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: 34,
          height: H,
          borderWidth: 1.2,
          borderColor: '#333',
          borderBottomLeftRadius: 6,
          borderBottomRightRadius: 6,
          overflow: 'hidden',
          flexDirection: 'column',
        }}
      >
        {topDown.map((layer, i) => {
          const isPoint = layer.layerType === 'booster' && layer.lengthFt === 0;
          const h = isPoint ? 6 : Math.max(8, (layer.lengthFt / total) * (H - 2));
          return (
            <View
              key={i}
              style={{
                height: h,
                backgroundColor: LAYER_STYLES[layer.layerType].color,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 5.5, color: '#fff', fontFamily: 'Helvetica-Bold' }}>
                {isPoint ? '' : `${layer.lengthFt}'`}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={[K.bold, { fontSize: 6, marginTop: 1.5 }]}>{total > 0 ? `${total.toFixed(1)}'` : ''}</Text>
    </View>
  );
}

function ComplianceTable({ shot }: { shot: Shot }) {
  const dp = shot.designPlan;
  const rows: [string, string][] = [
    ['Location of Closest Structure:', dash(dp.closestStructureLocation)],
    ['Distance of Closest Structure:', dash(dp.closestStructureDistance, ' ft')],
    ['Distance of Closest Borehole:', dash(dp.closestBoreholeDistance, ' ft')],
    ['Max Holes Per Delay:', dash(dp.maxHolesPerDelay)],
    ['Max Pounds Per Delay:', dash(dp.maxPoundsPerDelay, ' lbs')],
    ['Scale Distance:', dp.scaledDistance ? dp.scaledDistance.toFixed(1) : '—'],
    ['Predicted PPV: K Factor:', `${dp.predictedPPV ? `${dp.predictedPPV.toFixed(2)} in/s · ` : ''}K=${dp.kFactor}`],
  ];
  return (
    <T>
      {rows.map(([label, value]) => (
        <TR key={label}>
          <TD textStyle={{ fontSize: 7 }}>{label}</TD>
          <TD w={92} textStyle={[K.val, { fontSize: 7 }]}>{value}</TD>
        </TR>
      ))}
    </T>
  );
}

function BlastLogDoc(d: Data) {
  const {
    blastDay, job, blastLog, shots, explosiveUsage, typicalColumns, seismoReadings,
    companyName, dealerNumber, sigUrl, snapshotUrls,
  } = d;
  const holeCounts = shots.map((s) => ({ shotId: s.id, holes: s.totals.numHoles }));
  const products = explosiveUsage?.products ?? [];
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
  const emptyProductRows = Math.max(0, 6 - products.length);
  const footer = `Generated by ShotLog — ${companyName} — ${fmtDate(blastDay.date)}`;
  const sectionHead = [K.bold, K.center, { fontSize: 7.5, backgroundColor: '#e8e8e8' }];

  return (
    <Document title={`Blasting Log — ${blastDay.date} — ${job?.name ?? ''}`}>
      {/* ============ PAGE 1: BLASTING LOG ============ */}
      <Page size="LETTER" style={K.page}>
        <HeaderBar companyName={companyName} dealerNumber={dealerNumber} title="Blasting Log" />

        <T style={{ marginBottom: 5 }}>
          <TR>
            <TD textStyle={K.boldItalic}>Blast Location Info:</TD>
            <TD w={170} textStyle={K.right}>
              <Text style={[K.bold, K.right]}>
                Date of Blast: <Text style={K.val}>{fmtDate(blastDay.date)}</Text>
              </Text>
            </TD>
          </TR>
          <TR>
            <TD>
              <Text>Job Name: <Text style={K.val}>{job?.name ?? ''}</Text></Text>
            </TD>
            <TD>
              <Text>Customer: <Text style={K.val}>{job?.customer ?? ''}</Text></Text>
            </TD>
          </TR>
          <TR>
            <TD>
              <Text>Address of Blast: <Text style={K.val}>{job?.address ?? ''}</Text></Text>
            </TD>
            <TD w={140}>
              <Text>City: <Text style={K.val}>{job?.city ?? ''}</Text></Text>
            </TD>
            <TD w={70}>
              <Text>State: <Text style={K.val}>{job?.state ?? ''}</Text></Text>
            </TD>
          </TR>
        </T>

        <View style={{ flexDirection: 'row', gap: 5 }}>
          {/* LEFT COLUMN */}
          <View style={{ flex: 1.05 }}>
            <T>
              <TR>
                <TD w={92}>
                  <Text style={K.bold}>
                    DATE: <Text style={K.val}>{fmtDate(blastDay.date).slice(0, 5)}</Text>
                  </Text>
                </TD>
                {shots.map((s) => (
                  <TD key={s.id} textStyle={sectionHead} style={{ backgroundColor: '#e8e8e8' }}>
                    {`Shot #${s.shotNumber}`}
                  </TD>
                ))}
              </TR>
              <ShotRow label="Time:" shots={shots} get={(s) => dash(s.time)} />
              <ShotRow label="Operation**" shots={shots} get={() => blastLog.operation} />
              <TR>
                <TD textStyle={{ fontSize: 6, color: '#555' }}>**Construction, Quarry, Trench, Open</TD>
              </TR>
              <ShotRow label="Water Depth:" shots={shots} get={(s) => dash(s.drillParams.waterDepth, "'")} />
              <ShotRow label="Hole Diameter:" shots={shots} get={(s) => dash(s.drillParams.holeDiameter, '"')} />
              <ShotRow label="Burden:" shots={shots} get={(s) => dash(s.drillParams.burden, "'")} />
              <ShotRow label="Spacing:" shots={shots} get={(s) => dash(s.drillParams.spacing, "'")} />
              <ShotRow label="Stemming:" shots={shots} get={(s) => dash(s.drillParams.stemming, "'")} />
              <ShotRow label="Sub Drill:" shots={shots} get={(s) => dash(s.drillParams.subDrill, "'")} />
              <TR>
                <TD w={92}> </TD>
                <TD textStyle={sectionHead} style={{ backgroundColor: '#e8e8e8' }}>Totals</TD>
              </TR>
              <ShotRow label="# Holes:" shots={shots} get={(s) => dash(s.totals.numHoles)} />
              <ShotRow label="Total Sq Ft:" shots={shots} get={(s) => dash(Math.round(s.totals.totalSqFt))} />
              <ShotRow label="Avg. Drill Depth:" shots={shots} get={(s) => dash(s.totals.avgDrillDepth ? s.totals.avgDrillDepth.toFixed(1) : 0, "'")} />
              <ShotRow label="Total Drill Footage:" shots={shots} get={(s) => dash(Math.round(s.totals.totalDrillFootage), "'")} />
              <ShotRow label="Total Pay Yards:" shots={shots} get={(s) => dash(Math.round(s.totals.totalPayYards))} />
              <ShotRow label="Total Yards Shot:" shots={shots} get={(s) => dash(Math.round(s.totals.totalYardsShot))} />
            </T>

            {/* Explosive Info */}
            <T style={{ marginTop: 4 }}>
              <TR>
                <TD w={92} textStyle={K.boldItalic}>Product Type & Size:</TD>
                <TD textStyle={[K.center, { fontSize: 6.5 }]}>Explosive Info</TD>
                <TD w={42} textStyle={sectionHead} style={{ backgroundColor: '#e8e8e8' }}>Totals</TD>
              </TR>
              {products.map((item, i) => {
                const alloc = allocFor(item);
                return (
                  <TR key={i}>
                    <TD w={92} textStyle={[K.val, { fontSize: 7 }]}>{item.productName}</TD>
                    {shots.map((s) => (
                      <TD key={s.id} textStyle={[K.val, K.center, { fontSize: 7.5 }]}>{dash(alloc[s.id])}</TD>
                    ))}
                    <TD w={42} textStyle={[K.val, K.center, { fontSize: 7.5 }]}>{dash(item.quantity)}</TD>
                  </TR>
                );
              })}
              {Array.from({ length: emptyProductRows }, (_, i) => (
                <TR key={`empty-${i}`}>
                  <TD w={92}> </TD>
                  {shots.map((s) => (
                    <TD key={s.id} textStyle={K.center}>—</TD>
                  ))}
                  <TD w={42} textStyle={K.center}>—</TD>
                </TR>
              ))}
              <TR style={{ backgroundColor: '#e8e8e8' }}>
                <TD w={92} textStyle={[K.bold, K.right, { fontSize: 7.5 }]}>Total Pounds Shot:</TD>
                {shots.map((s) => (
                  <TD key={s.id} textStyle={[K.val, K.center, { fontSize: 7.5 }]}>
                    {(shotPounds.get(s.id) ?? 0).toFixed(1)}
                  </TD>
                ))}
                <TD w={42} textStyle={[K.val, K.center, { fontSize: 9 }]}>{totalPounds.toFixed(1)}</TD>
              </TR>
            </T>

            <T style={{ marginTop: 4 }}>
              <TR>
                <TD>
                  <Text style={{ fontSize: 7.5 }}>
                    Lead Line: <Text style={K.val}>{dash(explosiveUsage?.leadLine, "'")}</Text>
                  </Text>
                </TD>
                <TD>
                  <Text style={{ fontSize: 7.5 }}>
                    Type of Cover (Dirt/Mats): <Text style={K.val}>{dash(explosiveUsage?.coverType)}</Text>
                  </Text>
                </TD>
              </TR>
            </T>

            <Text style={{ fontSize: 8.5, marginTop: 6 }}>
              <Text style={[K.boldItalic, { textDecoration: 'underline' }]}>Onsite Delivery</Text>
              {'      '}
              <Text>{blastLog.onsiteDelivery ? BOX_ON : BOX_OFF}</Text> <Text style={K.bold}>YES</Text>
              {'    '}
              <Text>{blastLog.onsiteDelivery ? BOX_OFF : BOX_ON}</Text> <Text style={K.bold}>NO</Text>
            </Text>
          </View>

          {/* RIGHT COLUMN */}
          <View style={{ flex: 1 }}>
            <T>
              <TR>
                <TD>
                  <Text style={{ fontSize: 7.5 }}>
                    Weather Conditions:{' '}
                    <Text style={K.val}>
                      {WEATHER_LABEL[blastDay.conditions.weather]} — {TEMP_LABEL[blastDay.conditions.temperatureRange]}
                    </Text>
                  </Text>
                </TD>
                <TD w={92}>
                  <Text style={{ fontSize: 7.5 }}>
                    Wind Direction: <Text style={K.val}>{dash(blastDay.conditions.windDirection)}</Text>
                  </Text>
                </TD>
              </TR>
              <TR>
                <TD>
                  <Text style={{ fontSize: 7.5 }}>
                    Fire Detail: {blastDay.fireDetail ? BOX_ON : BOX_OFF} Yes {blastDay.fireDetail ? BOX_OFF : BOX_ON} No
                  </Text>
                </TD>
              </TR>
              <TR>
                <TD>
                  <Text style={{ fontSize: 7.5 }}>
                    Type of Rock: <Text style={K.val}>{dash(blastLog.typeOfRock)}</Text>
                  </Text>
                </TD>
                <TD>
                  <Text style={{ fontSize: 7.5 }}>
                    Type of Terrain: <Text style={K.val}>{dash(blastLog.typeOfTerrain)}</Text>
                  </Text>
                </TD>
              </TR>
              <TR>
                <TD>
                  <Text style={{ fontSize: 7.5 }}>
                    Identify Hazards: <Text style={K.val}>{dash(blastLog.hazards)}</Text>
                  </Text>
                </TD>
              </TR>
              <TR>
                <TD>
                  <Text style={{ fontSize: 7.5 }}>
                    Precautions Taken: <Text style={K.val}>{dash(blastLog.precautions)}</Text>
                  </Text>
                </TD>
              </TR>
            </T>

            <T style={{ marginTop: 4 }}>
              <TR>
                <TD style={{ minHeight: 30 }}>
                  <Text style={K.bold}>Calculations:</Text>
                  {pf > 0 ? (
                    <Text style={[K.val, { fontSize: 7 }]}>
                      PF = {totalPounds.toFixed(0)} / {totalYards.toFixed(0)} = {pf.toFixed(2)} lbs/yd3
                    </Text>
                  ) : null}
                  <Text style={[K.muted, { fontSize: 6.5 }]}>
                    SD = D/W^0.5  |  PPV = K × SD^-1.6  |  K = PPV × SD^1.6
                  </Text>
                </TD>
              </TR>
            </T>

            <T style={{ marginTop: 4 }}>
              <TR>
                <TD style={{ minHeight: 42, justifyContent: 'flex-start' }}>
                  <Text style={K.bold}>Notes:</Text>
                  <Text style={[K.val, { fontSize: 7.5 }]}>{blastLog.notes ?? ''}</Text>
                </TD>
              </TR>
            </T>

            <Text style={[K.bold, { fontSize: 8, marginTop: 5, marginBottom: 2 }]}>Seismic Monitoring Info:</Text>
            {shots.map((s) => {
              const graphs = seismoReadings
                .filter((r) => r.shotId === s.id)
                .sort((a, b) => a.graphNumber - b.graphNumber)
                .slice(0, 3);
              const g = (i: number, fn: (r: SeismoReading) => string) => (graphs[i] ? fn(graphs[i]) : ' ');
              const first = graphs[0];
              const cell = (label: string, fn: (r: SeismoReading) => string) => (
                <TR key={label}>
                  <TD w={62} textStyle={{ fontSize: 6.5 }}>{label}</TD>
                  {[0, 1, 2].map((i) => (
                    <TD key={i} textStyle={[K.val, K.center, { fontSize: 6.5 }]}>{g(i, fn)}</TD>
                  ))}
                </TR>
              );
              return (
                <View key={s.id} style={{ marginBottom: 4 }}>
                  <T>
                    <TR shade>
                      <TD w={62} textStyle={[K.bold, { fontSize: 6.5 }]}>{`SHOT #${s.shotNumber}`}</TD>
                      <TD textStyle={[K.bold, K.center, { fontSize: 6.5 }]}>Graph 1</TD>
                      <TD textStyle={[K.bold, K.center, { fontSize: 6.5 }]}>Graph 2</TD>
                      <TD textStyle={[K.bold, K.center, { fontSize: 6.5 }]}>Graph 3</TD>
                    </TR>
                    {cell('Graph (Seis) #:', (r) => r.seismographId || String(r.graphNumber))}
                    {cell('PPV:', (r) => Math.max(r.ppvTran, r.ppvVert, r.ppvLong).toFixed(3))}
                    {cell('Frequency:', (r) => `${r.frequency} Hz`)}
                    {cell('dB:', (r) => (r.airOverpressure ? r.airOverpressure.toFixed(2) : '—'))}
                    <TR>
                      <TD w={62} textStyle={{ fontSize: 6.5 }}>Operator:</TD>
                      <TD textStyle={[K.val, K.center, { fontSize: 6.5 }]}>{first?.operator ?? ' '}</TD>
                    </TR>
                    <TR>
                      <TD w={62} textStyle={{ fontSize: 6.5 }}>Location:</TD>
                      <TD textStyle={[K.val, K.center, { fontSize: 6.5 }]}>{first?.location ?? ' '}</TD>
                    </TR>
                  </T>
                </View>
              );
            })}
          </View>
        </View>

        {/* FOOTER — blaster sign-off */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'flex-end' }}>
          <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: '#000', paddingBottom: 2 }}>
            <Text>
              Blaster: <Text style={[K.val, { fontSize: 10 }]}>{blastLog.blasterName}</Text>
            </Text>
          </View>
          <View style={{ flex: 0.8, borderBottomWidth: 1, borderBottomColor: '#000', paddingBottom: 2 }}>
            <Text>
              License #: <Text style={K.val}>{blastLog.licenseNumber}</Text>
            </Text>
          </View>
          <View style={{ width: 55, paddingBottom: 2 }}>
            <Text>
              State: <Text style={K.val}>{blastLog.licenseState}</Text>
            </Text>
          </View>
          <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: '#000' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <Text>Signature: </Text>
              {sigUrl ? <Image src={sigUrl} style={{ height: 24, objectFit: 'contain' }} /> : null}
            </View>
          </View>
        </View>
        <Footer text={footer} />
      </Page>

      {/* ============ PAGE 2: BLAST DESIGN PLAN ============ */}
      <Page size="LETTER" style={K.page}>
        <Text style={[K.bold, K.center, { fontSize: 13, marginBottom: 5 }]}>Blast Design Plan</Text>
        <T style={{ marginBottom: 5 }}>
          <TR>
            <TD>
              <Text style={K.boldItalic}>
                Blast Location Info: <Text style={K.val}>{job?.name ?? ''}</Text>
              </Text>
            </TD>
            <TD w={160}>
              <Text style={[K.bold, K.right]}>
                Date of Blast: <Text style={K.val}>{fmtDate(blastDay.date)}</Text>
              </Text>
            </TD>
          </TR>
          <TR>
            <TD>
              <Text>Address of Blast: <Text style={K.val}>{job?.address ?? ''}</Text></Text>
            </TD>
            <TD w={140}>
              <Text>City: <Text style={K.val}>{job?.city ?? ''}</Text></Text>
            </TD>
            <TD w={70}>
              <Text>State: <Text style={K.val}>{job?.state ?? ''}</Text></Text>
            </TD>
          </TR>
        </T>

        {/* Per-shot diagram boxes */}
        {shots.map((s) => (
          <View key={s.id} style={{ marginBottom: 4 }}>
            <View style={{ borderWidth: 0.75, borderColor: '#000', backgroundColor: '#e8e8e8', paddingVertical: 1.5 }}>
              <Text style={[K.bold, K.center, { fontSize: 8 }]}>{`Shot #${s.shotNumber}`}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 2 }}>
              <View style={{ flex: 1, borderWidth: 0.75, borderColor: '#000', minHeight: 118, padding: 2 }}>
                <Text style={{ fontSize: 6.5 }}>
                  Site Diagram:   <Text style={{ fontSize: 6 }}>**Show Structures & Distances**</Text>
                </Text>
                {snapshotUrls[s.id] ? (
                  <Image src={snapshotUrls[s.id]} style={{ width: '100%', height: 106, objectFit: 'cover' }} />
                ) : (
                  <SiteSchematic shot={s} />
                )}
              </View>
              <View style={{ flex: 1.3, borderWidth: 0.75, borderColor: '#000', minHeight: 118, padding: 2 }}>
                <Text style={{ fontSize: 6.5 }}>Shot Diagram:</Text>
                <ShotDiagramSvg shot={s} />
              </View>
            </View>
          </View>
        ))}

        {/* Formulas + Typical Columns */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'flex-start' }}>
          <View style={{ borderWidth: 0.75, borderColor: '#000', padding: 4 }}>
            <Text style={[K.bold, { fontSize: 6.5, marginBottom: 1.5 }]}>Formulas:</Text>
            <Text style={{ fontSize: 6.5 }}>SD = D / W ^ .5</Text>
            <Text style={{ fontSize: 6.5 }}>PPV = K x (SD) ^ -1.6</Text>
            <Text style={{ fontSize: 6.5 }}>K = PPV x SD ^ 1.6</Text>
          </View>
          {typicalColumns.length > 0 ? (
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[K.bold, { fontSize: 7.5, textDecoration: 'underline', marginBottom: 3 }]}>
                Typical Columns
              </Text>
              <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center' }}>
                {shots.map((s) =>
                  typicalColumns
                    .filter((c) => c.shotId === s.id)
                    .map((col) => (
                      <View key={col.id} style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 6, marginBottom: 1.5 }}>{`Shot #${s.shotNumber} — ${col.name}`}</Text>
                        <ColumnStack column={col} />
                      </View>
                    )),
                )}
              </View>
            </View>
          ) : null}
        </View>

        {/* Compliance tables */}
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
          {shots.map((s) => (
            <View key={s.id} style={{ flex: 1 }}>
              <View style={{ borderWidth: 0.75, borderColor: '#000', backgroundColor: '#e8e8e8', paddingVertical: 1.5 }}>
                <Text style={[K.bold, K.center, { fontSize: 8 }]}>{`Shot #${s.shotNumber}`}</Text>
              </View>
              <ComplianceTable shot={s} />
            </View>
          ))}
        </View>
        <Footer text={footer} />
      </Page>
    </Document>
  );
}

export async function buildBlastLogPdf(blastDayId: string): Promise<Blob> {
  const blastDay = await db.blastDays.get(blastDayId);
  if (!blastDay) throw new Error('work day not found');
  const blastLog = await db.blastLogs.where('blastDayId').equals(blastDayId).first();
  if (!blastLog) throw new Error('blast log not found');
  const job = await db.jobs.get(blastDay.jobId);
  const shots = await db.shots.where('blastLogId').equals(blastLog.id).sortBy('shotNumber');
  const explosiveUsage = await db.explosiveUsages.where('blastLogId').equals(blastLog.id).first();
  const shotIds = shots.map((s) => s.id);
  const typicalColumns = shotIds.length ? await db.typicalColumns.where('shotId').anyOf(shotIds).toArray() : [];
  const seismoReadings = shotIds.length ? await db.seismoReadings.where('shotId').anyOf(shotIds).toArray() : [];
  const company = await db.companySettings.get('companySettings-singleton');
  const sigUrl =
    blastLog.signatureImage instanceof Blob && blastLog.signatureImage.size > 0
      ? await blobToDataUrl(blastLog.signatureImage)
      : null;
  const snapshotUrls: Record<string, string> = {};
  for (const s of shots) {
    const snap = s.designPlan.siteSketchImage;
    if (snap instanceof Blob && snap.size > 0) snapshotUrls[s.id] = await blobToDataUrl(snap);
  }
  return pdf(
    <BlastLogDoc
      blastDay={blastDay}
      job={job}
      blastLog={blastLog}
      shots={shots}
      explosiveUsage={explosiveUsage}
      typicalColumns={typicalColumns}
      seismoReadings={seismoReadings}
      companyName={company?.companyName || 'Baystate Blasting, Inc.'}
      dealerNumber={company?.dealerNumber}
      sigUrl={sigUrl}
      snapshotUrls={snapshotUrls}
    />,
  ).toBlob();
}

// Drill Log — searchable PDF: header pattern info, per-hole rows with
// condition codes, totals, driller signature.
import { pdf } from '@react-pdf/renderer';
import { db } from '@/db';
import { getJobView } from '@/lib/jobContext';
import { formatDate } from '@/lib/utils';
import type { BlastDay, DrillLog, DrillLogHole, DrillPlanRecord, Equipment, Job, Shot } from '@/db/schema';
import {
  Document,
  Footer,
  HeaderBar,
  K,
  LV,
  Page,
  Signature,
  T,
  TD,
  TR,
  Text,
  View,
  WARN,
  blobToDataUrl,
  dash,
} from './kit';

const CONDITION_LEGEND = 'V = Void · SR = Soft Rock · O = Overburden · W = Water';

/** S23 push 2 (Q3): a pattern's drill log prints as ONE sheet — every part's
 *  holes in hole order with Driller and Rig columns, one signature per part */
interface PartSig {
  log: DrillLog;
  sigUrl: string | null;
  rigs: string[];
}

interface Data {
  log: DrillLog;
  holes: (DrillLogHole & { partId?: string })[];
  shot?: Shot;
  job?: Job;
  day?: BlastDay;
  plan?: DrillPlanRecord;
  rig?: Equipment;
  companyName: string;
  dealerNumber?: string;
  sigUrl: string | null;
  /** the pattern's parts (plan logs only) */
  parts?: PartSig[];
  rigNames?: Map<string, string>;
}

function DrillLogDoc({ log, holes, shot, job, day, plan, rig, companyName, dealerNumber, sigUrl, parts, rigNames }: Data) {
  const footage = holes.reduce((s, h) => s + h.actualDepth, 0);
  const subTotal = holes.reduce((s, h) => s + h.subdrill, 0);
  const hasPlan = holes.some((h) => h.plannedDepth !== undefined);
  const hasKick = holes.some((h) => h.plannedKick !== undefined);
  const pattern = Boolean(plan && parts && parts.length > 0);
  const partById = new Map((parts ?? []).map((p) => [p.log.id, p]));
  const offPlan = (h: DrillLogHole) =>
    h.plannedDepth !== undefined &&
    (Math.abs(h.actualDepth - h.plannedDepth) >= 1 || (h.angle || 0) !== (h.plannedAngle ?? 0));
  const dates = holes.map((h) => h.date).sort();
  const dateLine = pattern
    ? dates.length ? (dates[0] === dates[dates.length - 1] ? formatDate(dates[0]) : `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}`) : '—'
    : log.date ? formatDate(log.date) : log.completedAt ? formatDate(log.completedAt.slice(0, 10)) : '—';
  const rigLine = pattern
    ? [...new Set((parts ?? []).flatMap((p) => p.rigs))].join(', ') || '—'
    : rig ? `${rig.assetNumber} ${rig.description}` : '—';
  const acceptedPart = (parts ?? []).filter((p) => p.log.acceptedAt).sort((a, b) => (b.log.acceptedAt ?? '').localeCompare(a.log.acceptedAt ?? ''))[0]?.log ?? log;

  return (
    <Document title={pattern ? `Drill Log — ${plan!.name} — ${job?.name ?? ''}` : `Drill Log — ${log.date ?? day?.date ?? ''} — ${log.drillerName}`}>
      <Page size="LETTER" style={K.page}>
        <HeaderBar companyName={companyName} dealerNumber={dealerNumber} title="Drill Log" />

        <T style={{ marginBottom: 6 }}>
          <TR>
            <TD><LV label="Site:" value={`${job?.name ?? ''}${day?.name ? ` — ${day.name}` : ''}`} /></TD>
            {plan ? (
              <TD w={140}><LV label="Drill plan:" value={`${plan.name}${plan.version && plan.version > 1 ? ` v${plan.version}` : ''}`} /></TD>
            ) : (
              <TD w={80}><LV label="Shot #:" value={shot?.shotNumber ?? ''} /></TD>
            )}
            <TD w={150}><LV label={pattern ? 'Drilled:' : 'Date:'} value={dateLine} /></TD>
          </TR>
          <TR>
            <TD><LV label="Location:" value={log.locationNote || [job?.address, job?.city].filter(Boolean).join(', ')} /></TD>
            <TD w={150}><LV label={pattern ? 'Drill rigs:' : 'Drill rig:'} value={rigLine} /></TD>
            <TD w={130}><LV label="GPS:" value={log.gps || '—'} /></TD>
          </TR>
          <TR>
            <TD><LV label="Diameter:" value={`${log.holeDiameter}"`} /></TD>
            <TD w={150}><LV label="Burden × Spacing:" value={`${log.burden}' × ${log.spacing}'`} /></TD>
            <TD w={130}><LV label="Face height:" value={`${log.faceHeight}'`} /></TD>
          </TR>
        </T>

        <T style={{ marginBottom: 4 }}>
          <TR shade>
            <TD w={58} textStyle={[K.bold, K.center]}>Date</TD>
            <TD w={44} textStyle={[K.bold, K.center]}>Hole #</TD>
            {pattern ? <TD w={62} textStyle={[K.bold, K.center]}>Driller</TD> : null}
            {pattern ? <TD w={44} textStyle={[K.bold, K.center]}>Rig</TD> : null}
            <TD w={40} textStyle={[K.bold, K.center]}>Angle</TD>
            {hasPlan ? <TD w={48} textStyle={[K.bold, K.center]}>Plan (ft)</TD> : null}
            {hasKick ? <TD w={44} textStyle={[K.bold, K.center]}>Kick (ft)</TD> : null}
            {hasKick ? <TD w={30} textStyle={[K.bold, K.center]}>Dir</TD> : null}
            <TD w={52} textStyle={[K.bold, K.center]}>Depth (ft)</TD>
            <TD w={46} textStyle={[K.bold, K.center]}>Subdrill</TD>
            <TD w={70} textStyle={[K.bold, K.center]}>Conditions</TD>
            <TD textStyle={[K.bold, K.center]}>Comments</TD>
          </TR>
          {holes.map((h) => (
            <TR key={h.id}>
              <TD w={58} textStyle={K.center}>{formatDate(h.date)}</TD>
              <TD w={44} textStyle={K.center}>{h.holeNumber}</TD>
              {pattern ? <TD w={62} textStyle={{ fontSize: 6.5 }}>{(h.drillerName || partById.get(h.partId ?? '')?.log.drillerName || '').split(/\s+/)[0]}</TD> : null}
              {pattern ? <TD w={44} textStyle={[K.center, { fontSize: 6.5 }]}>{h.rigAsset || (h.rigEquipmentId ? rigNames?.get(h.rigEquipmentId) : '') || ''}</TD> : null}
              <TD w={40} textStyle={K.center}>
                {`${h.angle || ''}${hasPlan && (h.plannedAngle ?? 0) !== (h.angle || 0) ? ` (plan ${h.plannedAngle ?? 0})` : ''}`}
              </TD>
              {hasPlan ? (
                <TD w={48} textStyle={K.center}>{`${h.plannedDepth ?? ''}${offPlan(h) ? ` ${WARN}` : ''}`}</TD>
              ) : null}
              {hasKick ? <TD w={44} textStyle={K.center}>{h.plannedKick !== undefined ? String(h.plannedKick) : ''}</TD> : null}
              {hasKick ? <TD w={30} textStyle={K.center}>{h.plannedKickDir ?? ''}</TD> : null}
              <TD w={52} textStyle={K.center}>{String(h.actualDepth)}</TD>
              <TD w={46} textStyle={K.center}>{h.subdrill ? String(h.subdrill) : ''}</TD>
              <TD w={70} textStyle={{ fontSize: 6.5 }}>{h.conditions.map((c) => c.note ? `${c.code} (${c.note})` : c.fromFt === c.toFt && c.fromFt > 0 ? `${c.code} @${c.fromFt}ft` : c.code).join(', ')}</TD>
              <TD>{h.comment}</TD>
            </TR>
          ))}
          <TR>
            <TD w={(hasPlan ? 190 : 142) + (hasKick ? 74 : 0) + (pattern ? 106 : 0)} textStyle={K.bold}>Totals</TD>
            <TD w={52} textStyle={[K.bold, K.center]}>{footage.toFixed(0)}</TD>
            <TD w={46} textStyle={[K.bold, K.center]}>{subTotal.toFixed(0)}</TD>
            <TD textStyle={K.bold}>{`${holes.length} holes`}</TD>
          </TR>
        </T>

        <Text style={{ fontSize: 7.5, marginBottom: 6 }}>Legend: {CONDITION_LEGEND}</Text>

        {pattern ? (
          <T>
            {(parts ?? []).map((p) => (
              <TR key={p.log.id}>
                <TD flex={1}>
                  <LV label="Driller:" value={`${p.log.drillerName}${p.rigs.length ? ` · ${p.rigs.join(', ')}` : ''}`} />
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 3 }}>
                    <Text style={K.bold}>Signature: </Text>
                    <Signature dataUrl={p.sigUrl} height={24} />
                  </View>
                </TD>
                <TD w={170}>
                  <LV label="Signed:" value={p.log.completedAt ? formatDate(p.log.completedAt.slice(0, 10)) : p.log.status === 'open' ? 'not yet' : '—'} />
                </TD>
              </TR>
            ))}
            <TR>
              <TD flex={1}>
                <LV label="Accepted by (blaster):" value={acceptedPart.acceptedBy || '________________'} />
              </TD>
              <TD w={170}>
                <LV label="Date:" value={acceptedPart.acceptedAt ? formatDate(acceptedPart.acceptedAt.slice(0, 10)) : '____________'} />
              </TD>
            </TR>
          </T>
        ) : (
          <T>
            <TR>
              <TD flex={1}>
                <LV label="Driller:" value={log.drillerName} />
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 3 }}>
                  <Text style={K.bold}>Signature: </Text>
                  <Signature dataUrl={sigUrl} height={24} />
                </View>
              </TD>
              <TD flex={1}>
                <LV label="Accepted by (blaster):" value={log.acceptedBy || '________________'} />
                <View style={{ marginTop: 3 }}>
                  <LV label="Date:" value={log.acceptedAt ? formatDate(log.acceptedAt.slice(0, 10)) : '____________'} />
                </View>
              </TD>
            </TR>
          </T>
        )}
        <Footer text={`Generated by ShotLog — ${companyName} — ${day?.date ? formatDate(day.date) : ''}`} />
      </Page>
    </Document>
  );
}

export async function buildDrillLogPdf(logId: string): Promise<Blob> {
  const log = await db.drillLogs.get(logId);
  if (!log) throw new Error('drill log not found');
  let holes: (DrillLogHole & { partId?: string })[] = (await db.drillLogHoles.where('drillLogId').equals(logId).toArray()).sort((a, b) =>
    a.holeNumber.localeCompare(b.holeNumber, undefined, { numeric: true }),
  );
  const shot = log.shotId ? await db.shots.get(log.shotId) : undefined;
  const job = await getJobView(log.jobId);
  const day = log.blastDayId ? await db.blastDays.get(log.blastDayId) : undefined;
  const plan = log.drillPlanId ? await db.drillPlans.get(log.drillPlanId) : undefined;
  const rig = log.drillRigEquipmentId ? await db.equipment.get(log.drillRigEquipmentId) : undefined;
  const company = await db.companySettings.get('companySettings-singleton');
  const sigUrl =
    log.signatureImage instanceof Blob && log.signatureImage.size > 0
      ? await blobToDataUrl(log.signatureImage)
      : null;
  // S23 push 2: a pattern's log is one sheet — every part, every hole, a signature per part
  let parts: PartSig[] | undefined;
  let rigNames: Map<string, string> | undefined;
  if (plan) {
    const { patternSheet } = await import('@/hooks/useDrillPlans');
    const sheet = await patternSheet(plan.id);
    if (sheet) {
      holes = sheet.holes;
      rigNames = sheet.rigs;
      parts = [];
      for (const p of sheet.parts) {
        const rigIds = [...new Set([p.drillRigEquipmentId, ...(p.rigChanges ?? []).map((c) => c.toRigId), ...sheet.holes.filter((h) => h.partId === p.id).map((h) => h.rigEquipmentId)].filter((x): x is string => Boolean(x)))];
        parts.push({
          log: p,
          sigUrl: p.signatureImage instanceof Blob && p.signatureImage.size > 0 ? await blobToDataUrl(p.signatureImage) : null,
          rigs: rigIds.map((id) => sheet.rigs.get(id) ?? '').filter(Boolean),
        });
      }
    }
  }
  return pdf(
    <DrillLogDoc
      log={log}
      holes={holes}
      shot={shot}
      job={job}
      day={day}
      plan={plan}
      rig={rig}
      companyName={company?.companyName || 'Baystate Blasting, Inc.'}
      dealerNumber={company?.dealerNumber}
      sigUrl={sigUrl}
      parts={parts}
      rigNames={rigNames}
    />,
  ).toBlob();
}

export { dash };

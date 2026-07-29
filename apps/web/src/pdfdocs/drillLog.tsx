// Drill Log — searchable PDF: header pattern info, per-hole rows with
// condition codes, totals, driller signature.
import { pdf } from '@react-pdf/renderer';
import { db } from '@/db';
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

interface Data {
  log: DrillLog;
  holes: DrillLogHole[];
  shot?: Shot;
  job?: Job;
  day?: BlastDay;
  plan?: DrillPlanRecord;
  rig?: Equipment;
  companyName: string;
  dealerNumber?: string;
  sigUrl: string | null;
}

function DrillLogDoc({ log, holes, shot, job, day, plan, rig, companyName, dealerNumber, sigUrl }: Data) {
  const footage = holes.reduce((s, h) => s + h.actualDepth, 0);
  const subTotal = holes.reduce((s, h) => s + h.subdrill, 0);
  const hasPlan = holes.some((h) => h.plannedDepth !== undefined);
  const hasKick = holes.some((h) => h.plannedKick !== undefined);
  const offPlan = (h: DrillLogHole) =>
    h.plannedDepth !== undefined &&
    (Math.abs(h.actualDepth - h.plannedDepth) >= 1 || (h.angle || 0) !== (h.plannedAngle ?? 0));

  return (
    <Document title={`Drill Log — ${log.date ?? day?.date ?? ''} — ${log.drillerName}`}>
      <Page size="LETTER" style={K.page}>
        <HeaderBar companyName={companyName} dealerNumber={dealerNumber} title="Drill Log" />

        <T style={{ marginBottom: 6 }}>
          <TR>
            <TD><LV label="Site:" value={`${job?.name ?? ''}${day?.name ? ` — ${day.name}` : ''}`} /></TD>
            {plan ? (
              <TD w={140}><LV label="Drill plan:" value={plan.name} /></TD>
            ) : (
              <TD w={80}><LV label="Shot #:" value={shot?.shotNumber ?? ''} /></TD>
            )}
            <TD w={150}><LV label="Date:" value={log.date ? formatDate(log.date) : log.completedAt ? formatDate(log.completedAt.slice(0, 10)) : '—'} /></TD>
          </TR>
          <TR>
            <TD><LV label="Location:" value={log.locationNote || [job?.address, job?.city].filter(Boolean).join(', ')} /></TD>
            <TD w={150}><LV label="Drill rig:" value={rig ? `${rig.assetNumber} ${rig.description}` : '—'} /></TD>
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
            <TD w={(hasPlan ? 190 : 142) + (hasKick ? 74 : 0)} textStyle={K.bold}>Totals</TD>
            <TD w={52} textStyle={[K.bold, K.center]}>{footage.toFixed(0)}</TD>
            <TD w={46} textStyle={[K.bold, K.center]}>{subTotal.toFixed(0)}</TD>
            <TD textStyle={K.bold}>{`${holes.length} holes`}</TD>
          </TR>
        </T>

        <Text style={{ fontSize: 7.5, marginBottom: 6 }}>Legend: {CONDITION_LEGEND}</Text>

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
        <Footer text={`Generated by ShotLog — ${companyName} — ${day?.date ? formatDate(day.date) : ''}`} />
      </Page>
    </Document>
  );
}

export async function buildDrillLogPdf(logId: string): Promise<Blob> {
  const log = await db.drillLogs.get(logId);
  if (!log) throw new Error('drill log not found');
  const holes = (await db.drillLogHoles.where('drillLogId').equals(logId).toArray()).sort((a, b) =>
    a.holeNumber.localeCompare(b.holeNumber, undefined, { numeric: true }),
  );
  const shot = log.shotId ? await db.shots.get(log.shotId) : undefined;
  const job = await db.jobs.get(log.jobId);
  const day = log.blastDayId ? await db.blastDays.get(log.blastDayId) : undefined;
  const plan = log.drillPlanId ? await db.drillPlans.get(log.drillPlanId) : undefined;
  const rig = log.drillRigEquipmentId ? await db.equipment.get(log.drillRigEquipmentId) : undefined;
  const company = await db.companySettings.get('companySettings-singleton');
  const sigUrl =
    log.signatureImage instanceof Blob && log.signatureImage.size > 0
      ? await blobToDataUrl(log.signatureImage)
      : null;
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
    />,
  ).toBlob();
}

export { dash };

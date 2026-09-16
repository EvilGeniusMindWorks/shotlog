// The blasting log's own checks — what "Check and sign" lists (navigation
// round, Matthew's walkthrough: "…filling out the blasting log, then a check
// for errors and sign, then make the blasting log complete"). Red blocks
// Complete; amber is a note. Seismo readings are red: Matthew, Sep 16 2026 —
// "Need seismo readings to mark the blasting log complete."
import { db } from '@/db';
import { fmtLbs } from '@/lib/format';
import { hhmm } from '@/lib/dayCard';
import { parseDiagram, computeFiringTimes } from '@/lib/shotDiagram';

export interface LogCheck {
  key: string;
  level: 'red' | 'amber' | 'ok';
  text: string;
  to?: string;
  toLabel?: string;
}

export async function logChecks(dayId: string): Promise<LogCheck[]> {
  const log = await db.blastLogs.where('blastDayId').equals(dayId).first();
  if (!log) return [];
  const items: LogCheck[] = [];
  const logTo = `/blast-day/${dayId}?view=blast-log`;
  const shots = (await db.shots.where('blastLogId').equals(log.id).toArray()).sort((a, b) => a.shotNumber - b.shotNumber);

  if (shots.length === 0) {
    items.push({ key: 'shots', level: 'red', text: 'No shots on the blasting log yet', to: logTo, toLabel: 'Blasting log' });
    return items;
  }

  // totals — holes on every shot (from the accepted drilling, the plan, or typed)
  const noHoles = shots.filter((s) => !(s.totals.numHoles > 0));
  if (noHoles.length) for (const s of noHoles) items.push({ key: `holes-${s.id}`, level: 'red', text: `Shot ${s.shotNumber} has no holes in its totals`, to: logTo, toLabel: 'Totals' });
  else items.push({ key: 'holes-ok', level: 'ok', text: shots.length === 1 ? `Totals · ${shots[0].totals.numHoles} holes · ${Math.round(shots[0].totals.totalDrillFootage)} ft` : `Totals on ${shots.length} shots` });

  // explosives
  const usage = await db.explosiveUsages.where('blastLogId').equals(log.id).first();
  const lbs = usage?.totalPoundsShot ?? 0;
  if (!(lbs > 0)) items.push({ key: 'expl', level: 'red', text: 'No explosives entered', to: logTo, toLabel: 'Explosives' });
  else items.push({ key: 'expl-ok', level: 'ok', text: `Explosives entered · ${fmtLbs(lbs)} lbs` });

  // timing (advisory)
  for (const s of shots) {
    let timed = false;
    try {
      const d = parseDiagram(s.designPlan.shotDiagramData);
      timed = computeFiringTimes(d).size > 0 || Object.keys(d.delays ?? {}).length > 0;
    } catch {
      timed = false;
    }
    if (!timed) items.push({ key: `timing-${s.id}`, level: 'amber', text: `Timing not built on Shot ${s.shotNumber}`, to: `/blast-day/${dayId}/design/${s.id}?mode=timing`, toLabel: 'Design plan' });
  }
  if (!items.some((i) => i.key.startsWith('timing-'))) items.push({ key: 'timing-ok', level: 'ok', text: shots.length === 1 ? 'Timing built' : `Timing built on ${shots.length} shots` });

  // seismo readings — required (Matthew, Sep 16 2026)
  const readings = await db.seismoReadings.filter((r) => shots.some((s) => s.id === r.shotId)).toArray();
  const noReading = shots.filter((s) => !readings.some((r) => r.shotId === s.id));
  for (const s of noReading) items.push({ key: `seismo-${s.id}`, level: 'red', text: `Seismo readings · none on Shot ${s.shotNumber}`, to: `/blast-day/${dayId}/seismo/${s.id}`, toLabel: 'Attach them' });
  if (noReading.length === 0) items.push({ key: 'seismo-ok', level: 'ok', text: `Seismo readings · ${readings.length} graph${readings.length === 1 ? '' : 's'}` });
  const noDistance = shots.filter((s) => readings.some((r) => r.shotId === s.id) && !(s.designPlan?.closestStructureDistance > 0));
  for (const s of noDistance) items.push({ key: `dist-${s.id}`, level: 'amber', text: `Seismo reading on Shot ${s.shotNumber} has no structure distance`, to: `/blast-day/${dayId}/design/${s.id}`, toLabel: 'Design plan › Compliance' });

  // hazards noted (advisory)
  if (!log.hazards?.trim()) items.push({ key: 'hazards', level: 'amber', text: 'Hazards not noted on the log', to: logTo, toLabel: 'Blast information' });
  else items.push({ key: 'hazards-ok', level: 'ok', text: `Hazards noted · ${log.hazards.trim().slice(0, 40)}` });

  // drilling accepted (advisory)
  const logs = await db.drillLogs.filter((l) => l.blastDayId === dayId).toArray();
  if (logs.length > 0) {
    const accepted = logs.filter((l) => l.status === 'accepted').length;
    if (accepted < logs.length) items.push({ key: 'drill', level: 'amber', text: `${logs.length - accepted} drill log${logs.length - accepted > 1 ? 's' : ''} not accepted yet`, to: `/blast-day/${dayId}?view=drilling`, toLabel: 'Review drilling' });
    else items.push({ key: 'drill-ok', level: 'ok', text: `Drill log${logs.length > 1 ? 's' : ''} accepted` });
  }

  // the signature (S16: one signature covers the log and its shots)
  if (!log.signatureImage) items.push({ key: 'sig', level: 'red', text: 'The blasting log is not signed', to: logTo, toLabel: 'Sign-off & Delivery' });
  else items.push({ key: 'sig-ok', level: 'ok', text: `Signed${log.blasterName ? ` by ${log.blasterName}` : ''}${log.licenseNumber ? ` · ${log.licenseState} ${log.licenseNumber}` : ''}` });

  if (log.doneAt) items.push({ key: 'complete-ok', level: 'ok', text: `Marked complete by ${log.doneByName || 'the blaster'} ${hhmm(log.doneAt)}` });
  return items;
}

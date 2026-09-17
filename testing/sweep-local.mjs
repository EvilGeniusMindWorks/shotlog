// Sweep harness-made days off the LOCAL stack's database (docker postgres).
// The client cannot delete a day once an office copy is filed or a drill log
// is accepted (the server's archive rules), so harness runs that file days
// leave them behind and later runs trip over them. This deletes those days
// and every child row by name pattern, straight in the database.
//   node testing/sweep-local.mjs [--dry]
import { execSync } from 'node:child_process';
const dry = process.argv.includes('--dry');
const psql = (sql) => execSync(`docker exec -i powersync-spike-pg-1 psql -U postgres -d shotlog -X -At -c ${JSON.stringify(sql)}`).toString().trim();
const PATTERN = '^(hub|diagram|holes|other day|s15|s16|s17|s18|s19|s20|s21|nav|walk|probe|S15|S8a plan day|S9a batch|S9a batch[0-9]) ';
const ids = psql(`select id from records where table_name='blastDays' and payload::json->>'name' ~ '${PATTERN}'`).split('\n').filter(Boolean);
console.log(`${ids.length} harness day(s) named like ${PATTERN}`);
// a rig checklist dated today at a job with no work day today is a harness leftover (the day was
// cleaned, the checklist outlived it) — the next run's driller would show as "already on" that day
{
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const stray = psql(`select id from records where table_name='drillChecklists' and payload::json->>'date' = '${today}' and coalesce(payload::json->>'jobId','') <> '' and not exists (select 1 from records b where b.table_name='blastDays' and b.payload::json->>'jobId' = records.payload::json->>'jobId' and b.payload::json->>'date' = '${today}')`).split('\n').filter(Boolean);
  console.log(`${stray.length} stray rig checklist(s) dated today at jobs with no day today`);
  if (stray.length && !dry) {
    const c = psql(`with d as (delete from records where table_name='drillChecklists' and id in (${stray.map((i) => `'${i}'`).join(',')}) returning 1) select count(*) from d`);
    console.log(`deleted ${c} stray checklist(s)`);
  }
}
// their rig checklists too: one per rig per job-day, so a leftover makes the next run's driller "already on" a day (harness76)
const chkPairs = ids.length ? psql(`select payload::json->>'jobId' || '|' || (payload::json->>'date') from records where table_name='blastDays' and id in (${ids.map((i) => `'${i}'`).join(',')})`).split('\n').filter(Boolean) : [];
if (chkPairs.length && !dry) {
  const where = chkPairs.map((p) => { const [j, d] = p.split('|'); return `(payload::json->>'jobId' = '${j}' and payload::json->>'date' = '${d}')`; }).join(' or ');
  const c = psql(`with d as (delete from records where table_name='drillChecklists' and (${where}) returning 1) select count(*) from d`);
  console.log(`deleted ${c} rig checklist(s) of those days`);
}
// Orphaned drill logs: an accepted log outlives the day it was on (the server refuses the
// client's delete), and day + shot ids are fixed by job + date — so the next run at that job
// is handed the old accepted log instead of a fresh one (harness79/80, Sep 16 2026)
const orphans = psql(`select id from records where table_name='drillLogs' and coalesce(payload::json->>'blastDayId','') <> '' and payload::json->>'blastDayId' not in (select id from records where table_name='blastDays')`).split('\n').filter(Boolean);
console.log(`${orphans.length} orphaned drill log(s) whose day is gone`);
if (orphans.length && !dry) {
  const oq = orphans.map((i) => `'${i}'`).join(',');
  const holes = psql(`with d as (delete from records where table_name='drillLogHoles' and payload::json->>'drillLogId' in (${oq}) returning 1) select count(*) from d`);
  const logs = psql(`with d as (delete from records where table_name='drillLogs' and id in (${oq}) returning 1) select count(*) from d`);
  console.log(`deleted ${logs} orphaned log(s) and ${holes} hole(s)`);
}
if (ids.length === 0 || dry) process.exit(0);
const list = ids.map((i) => `'${i}'`).join(',');
const logIds = psql(`select id from records where table_name='blastLogs' and payload::json->>'blastDayId' in (${list})`).split('\n').filter(Boolean);
const shotIds = logIds.length ? psql(`select id from records where table_name='shots' and payload::json->>'blastLogId' in (${logIds.map((i) => `'${i}'`).join(',')})`).split('\n').filter(Boolean) : [];
const drillLogIds = psql(`select id from records where table_name='drillLogs' and payload::json->>'blastDayId' in (${list})`).split('\n').filter(Boolean);
const reportIds = psql(`select id from records where table_name='dailyReports' and payload::json->>'blastDayId' in (${list})`).split('\n').filter(Boolean);
const q = (arr) => arr.map((i) => `'${i}'`).join(',');
let n = 0;
const del = (sql) => { n += Number(psql(sql).match(/\d+/)?.[0] ?? 0); };
if (shotIds.length) del(`with d as (delete from records where table_name in ('seismoReadings','typicalColumns','drillPlans') and payload::json->>'shotId' in (${q(shotIds)}) returning 1) select count(*) from d`);
if (logIds.length) del(`with d as (delete from records where table_name in ('shots','explosiveUsages') and payload::json->>'blastLogId' in (${q(logIds)}) returning 1) select count(*) from d`);
if (drillLogIds.length) del(`with d as (delete from records where table_name='drillLogHoles' and payload::json->>'drillLogId' in (${q(drillLogIds)}) returning 1) select count(*) from d`);
if (reportIds.length) del(`with d as (delete from records where table_name in ('workForceEntries','equipmentEntries','materialEntries','subcontractorEntries') and payload::json->>'dailyReportId' in (${q(reportIds)}) returning 1) select count(*) from d`);
del(`with d as (delete from records where table_name in ('blastLogs','dailyReports','drillLogs','timeCards','workDayConfirmations','dayCardEdits','dayReminders','dayMoves','submissions','attachments') and payload::json->>'blastDayId' in (${list}) returning 1) select count(*) from d`);
del(`with d as (delete from records where table_name='blastDays' and id in (${list}) returning 1) select count(*) from d`);
console.log(`deleted ${n} row(s) including ${ids.length} day(s)`);

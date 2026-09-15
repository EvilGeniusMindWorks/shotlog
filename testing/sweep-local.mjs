// Sweep harness-made days off the LOCAL stack's database (docker postgres).
// The client cannot delete a day once an office copy is filed or a drill log
// is accepted (the server's archive rules), so harness runs that file days
// leave them behind and later runs trip over them. This deletes those days
// and every child row by name pattern, straight in the database.
//   node testing/sweep-local.mjs [--dry]
import { execSync } from 'node:child_process';
const dry = process.argv.includes('--dry');
const psql = (sql) => execSync(`docker exec -i powersync-spike-pg-1 psql -U postgres -d shotlog -X -At -c ${JSON.stringify(sql)}`).toString().trim();
const PATTERN = '^(hub|diagram|holes|other day|s15|s16|s17|probe|S15|S8a plan day|S9a batch|S9a batch[0-9]) ';
const ids = psql(`select id from records where table_name='blastDays' and payload::json->>'name' ~ '${PATTERN}'`).split('\n').filter(Boolean);
console.log(`${ids.length} harness day(s) named like ${PATTERN}`);
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

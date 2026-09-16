// What a feedback report calls the screen it was sent from (Round S19,
// Matthew: "the URL long ID doesn't help me at all… is there another
// alternative that would be more relevant to me?"). Two flavours: from the
// address alone (older reports, and the inbox's fallback), and with the
// records this device holds — the job, the date, the shot, the rig, the
// person — used when a report is composed.
import { db } from '@/db';
import { formatDate } from '@/lib/utils';

const STATIC: [RegExp, string][] = [
  [/^\/$/, 'Dashboard'],
  [/^\/days$/, 'Work days'],
  [/^\/jobs$/, 'Jobs'],
  [/^\/records$/, 'Records'],
  [/^\/drill-logs$/, 'My records'],
  [/^\/reference$/, 'Reference'],
  [/^\/settings$/, 'Settings'],
  [/^\/profile$/, 'Profile'],
  [/^\/drilling$/, 'Drilling'],
  [/^\/equipment-locator$/, 'Locator'],
  [/^\/admin\/?$/, 'Admin'],
];
const ADMIN: Record<string, string> = {
  people: 'People',
  users: 'People',
  approvals: 'Approvals',
  catalog: 'Catalog',
  equipment: 'Equipment',
  incidents: 'Incidents',
  roles: 'Roles',
  company: 'Company',
  feedback: 'Feedback',
  companies: 'Companies',
};

function split(route: string): { pathname: string; q: URLSearchParams } {
  const i = route.indexOf('?');
  return { pathname: i < 0 ? route : route.slice(0, i), q: new URLSearchParams(i < 0 ? '' : route.slice(i + 1)) };
}

/** The screen's name from its address alone — no records needed */
export function screenNameFromRoute(route: string): string {
  const { pathname, q } = split(route || '/');
  for (const [re, name] of STATIC) if (re.test(pathname)) return name;
  let m: RegExpMatchArray | null;
  if ((m = pathname.match(/^\/admin\/([a-z]+)/))) return `Admin › ${ADMIN[m[1]] ?? m[1]}`;
  if (/^\/help(\/|$)/.test(pathname)) return 'Help';
  if (/^\/blast-day\/[^/]+\/setup/.test(pathname)) return 'Set up the day';
  if (/^\/blast-day\/[^/]+\/design\//.test(pathname)) return q.get('mode') === 'plan' ? 'Drill plan' : 'Design plan';
  if (/^\/blast-day\/[^/]+\/seismo\//.test(pathname)) return 'Seismo readings';
  if (/\/(drill-log|log)\/[^/]+\/print/.test(pathname)) return 'Drill log · print';
  if (/\/(drill-log|log)\/[^/]+\/submit/.test(pathname)) return 'Drill log · filing';
  if (/\/(drill-log|log)\/[^/]+\/?$/.test(pathname)) return 'Drill log';
  if (/^\/blast-day\/[^/]+\/submit/.test(pathname)) return 'File this day';
  if (/^\/blast-day\/[^/]+\/print-daily/.test(pathname)) return 'Daily report · print';
  if (/^\/blast-day\/[^/]+\/print/.test(pathname)) return 'Blasting log · print';
  if (/^\/blast-day\/[^/]+\/report/.test(pathname)) return 'Blast report';
  if (/^\/blast-day\/[^/]+\/?$/.test(pathname)) {
    const v = q.get('view') ?? (q.get('tab') === 'daily' ? 'daily-report' : '');
    return v === 'blast-log'
      ? 'Blasting log'
      : v === 'daily-report'
        ? 'Daily report'
        : v === 'drilling'
          ? 'Review drilling'
          : v === 'readiness'
            ? 'Readiness review'
            : v === 'hub' || v === 'walkthrough'
              ? 'Walkthrough'
              : v === 'check'
                ? 'Check and sign'
                : 'Work day';
  }
  if (/^\/jobs\/[^/]+\/drill-plan\//.test(pathname)) return 'Drill plan';
  if (/^\/jobs\//.test(pathname)) return 'Job';
  if (/^\/customers\//.test(pathname)) return 'Customer';
  if (/^\/sites\//.test(pathname)) return 'Site';
  if (/^\/equipment\//.test(pathname)) return 'Equipment';
  if (/^\/tickets\//.test(pathname)) return 'Repair ticket';
  if (/^\/crew\//.test(pathname)) return 'Crew member';
  if (/^\/drill-checklist-print\//.test(pathname)) return 'Rock Drill Check List · print';
  if (/^\/drill-checklist-file\//.test(pathname)) return 'Rock Drill Check List · filing';
  if (/^\/drill-checklist(\/|$)/.test(pathname)) return 'Rock Drill Check List';
  if (/^\/incident\/[^/]+\/print/.test(pathname)) return 'Incident · print';
  if (/^\/incident\/[^/]+\/submit/.test(pathname)) return 'Incident · filing';
  if (/^\/incident\//.test(pathname)) return 'Incident';
  return pathname || '/';
}

const join = (parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

/** The screen's name with what this device knows — job, date, shot, rig, person */
export async function screenNameFor(route: string): Promise<string> {
  const base = screenNameFromRoute(route);
  const { pathname, q } = split(route || '/');
  try {
    let m: RegExpMatchArray | null;
    if ((m = pathname.match(/^\/blast-day\/([^/]+)(?:\/(design|seismo)\/([^/]+))?/))) {
      const day = await db.blastDays.get(m[1]);
      const job = day ? await db.jobs.get(day.jobId) : undefined;
      const shot = m[3] ? await db.shots.get(m[3]) : undefined;
      return join([base, shot && `Shot ${shot.shotNumber}`, job?.name, day && formatDate(day.date)]);
    }
    if ((m = pathname.match(/^\/jobs\/([^/]+)\/drill-plan\/([^/]+)/))) {
      const plan = await db.drillPlans.get(m[2]);
      const job = await db.jobs.get(m[1]);
      return join([base, plan?.name, job?.name]);
    }
    if ((m = pathname.match(/^\/jobs\/([^/]+)/))) return join([base, (await db.jobs.get(m[1]))?.name]);
    if ((m = pathname.match(/^\/customers\/([^/]+)/))) return join([base, (await db.customers.get(m[1]))?.name]);
    if ((m = pathname.match(/^\/sites\/([^/]+)/))) return join([base, (await db.sites.get(m[1]))?.name]);
    if ((m = pathname.match(/^\/equipment\/([^/]+)/))) return join([base, (await db.equipment.get(m[1]))?.assetNumber]);
    if ((m = pathname.match(/^\/crew\/([^/]+)/))) return join([base, (await db.crewMembers.get(m[1]))?.name]);
    if ((m = pathname.match(/^\/drill-checklist(?:\/([^/?]+))?\/?$/))) {
      const rig = m[1] ? await db.equipment.get(m[1]) : undefined;
      const jobId = q.get('job');
      const job = jobId ? await db.jobs.get(jobId) : undefined;
      const date = q.get('date');
      return join([base, rig?.assetNumber, job?.name, date && formatDate(date)]);
    }
  } catch {
    /* the name from the address is enough */
  }
  return base;
}

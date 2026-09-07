// Per-screen coaching (Round S2): "About this screen" from the ? menu. One
// map keyed by route pattern (+ the day hub's ?view). Each entry is 3–5
// bullets in the DrillingWork voice — what this screen is for, what to do
// next, who to ask. Copy is Matthew's to review; the keys are the contract.

export interface CoachEntry {
  title: string;
  /** What this screen is for (one sentence) */
  what: string;
  /** What to do here, in order */
  steps: string[];
  /** Who to ask / where to go when stuck (optional) */
  ask?: string;
}

export type CoachBucket = 'field' | 'driller' | 'mechanic' | 'office' | 'admin';

interface CoachRule {
  /** Path pattern: exact, or with :params */
  pattern: string;
  /** Match only when ?view= equals this (day hub tabs) */
  view?: string;
  /** Match only for this home bucket (the "/" home differs per role) */
  bucket?: CoachBucket;
  entry: CoachEntry;
}

const RULES: CoachRule[] = [
  // ── Homes (one per bucket; the field one is the fallback) ──
  {
    pattern: '/',
    bucket: 'driller',
    entry: {
      title: 'My Drilling',
      what: 'Your home: yesterday’s unfinished work on top, then the three tiles for today.',
      steps: [
        'Rig checklist first — enter the hour meter, walk the rig, file it.',
        'Today’s drill log: open the plan the blaster sent and log holes as you drill.',
        'My hours: your time card for the day, on the job you worked.',
      ],
      ask: 'No plan on the Drilling tab yet? Ask the blaster — or start a drill-only day from +.',
    },
  },
  {
    pattern: '/',
    bucket: 'mechanic',
    entry: {
      title: 'My Shop',
      what: 'The queue: what is down, open tickets, services due — and ONE worklist you order yourself.',
      steps: [
        'Drag the worklist into the order you will work it; reset puts it back to urgency order.',
        'Open a ticket to resolve it; open a machine to log a service and restart its clock.',
        'Rig checklists filed in the field arrive here as tickets on their own.',
      ],
    },
  },
  {
    pattern: '/',
    bucket: 'office',
    entry: {
      title: 'Office',
      what: 'Your queue: what needs your hands today, in the order it needs them.',
      steps: [
        'Five counters on top — tap one to jump to its section.',
        'Approvals are oldest first and show what is attached, so you can spot a missing seismo before opening.',
        'Sent back shows what you bounced and is still waiting on the field; time cards group by day.',
        'Expiring merges customer COIs and site permits within 90 days. Never submitted = drafts older than 3 days.',
      ],
      ask: 'Job costing and latest filings moved to the admin home and Records.',
    },
  },
  {
    pattern: '/',
    bucket: 'admin',
    entry: {
      title: 'Company',
      what: 'The company view: latest filings, compliance items, and job costing.',
      steps: [
        'People, roles, catalog and company settings are under Admin.',
        'Use View as (bottom of the rail) to see any role’s screens exactly as they do.',
      ],
    },
  },
  {
    pattern: '/',
    entry: {
      title: 'Dashboard',
      what: 'Your home: what needs you first, then today, then past months folded up.',
      steps: [
        'Anything in the top band is waiting on you — unsigned, sent back, or not filed yet.',
        'Tap + to start work at a job; Continue always knows the next step of a day.',
        'Older months are collapsed to a count. Work days in the rail lists every day.',
      ],
      ask: 'If a day is sent back, the office note is on the day itself.',
    },
  },
  {
    pattern: '/days',
    entry: {
      title: 'Work days',
      what: 'Every work day, grouped by month, newest first.',
      steps: ['Search by job, customer or date.', 'Open a day to keep working it or to read the filed copy.'],
    },
  },
  {
    pattern: '/drilling',
    entry: {
      title: 'Drilling',
      what: 'The plans the blaster sent you, what is assigned to you, and what is ready to drill.',
      steps: [
        'Open a plan and log holes as planned in one tap; edit depth or angle only when the ground made you.',
        'Skipping a planned hole is normal — mark it skipped, do not leave it blank.',
        'Sign the log when the pattern is done; the blaster accepts it before loading.',
      ],
      ask: 'No plan here? The blaster has not sent one yet — ask them, or start a drill-only day from +.',
    },
  },
  // ── Jobs ──
  {
    pattern: '/jobs',
    entry: {
      title: 'Jobs',
      what: 'Long-running jobs with their customer, site, K factor and defaults — so days never re-type them.',
      steps: [
        'Active jobs show by default; search finds anything, archived included.',
        'Customers and Sites lenses are the same records from the other side.',
        'Small job with no office setup yet? Add the customer, site and job here and start work.',
      ],
    },
  },
  {
    pattern: '/jobs/:id',
    entry: {
      title: 'Job',
      what: 'Everything about one job: contacts, permits, K factor, work days, drill plans, records.',
      steps: [
        'Fix the K factor or defaults here and every new day at this job picks them up.',
        'Drill plans for the driller live here; work days list every day at this job.',
      ],
    },
  },
  // ── Day hub + views ──
  {
    pattern: '/blast-day/:id',
    entry: {
      title: 'Work day',
      what: 'One day at one job. The spine at the top is the order of the day: Drilling → Readiness → Shots → Seismo → File.',
      steps: [
        'Continue takes you to the next unfinished step; you can jump anywhere from the spine.',
        'Blasting log = the technical record; Daily report = crew, equipment hours, materials, subs.',
        'File when the day is done. The office gets a write-once copy; corrections file as a new version.',
      ],
      ask: 'Locked fields mean the day is filed or approved — ask a supervisor to unlock it.',
    },
  },
  {
    pattern: '/blast-day/:id',
    view: 'blast-log',
    entry: {
      title: 'Blasting log',
      what: 'The technical record: blast info, drill parameters, each shot, explosives, seismo readings, sign-off.',
      steps: [
        'Enter explosives top-down — total quantity — and the weight is calculated from the catalog multiplier.',
        'Every shot gets a Designer (pattern, timing, site map) and its own seismo readings.',
        'Sign at the bottom. Your license and signature come from My Profile.',
      ],
      ask: 'A compliance badge you do not understand? Reference explains the USBM and OSM limits.',
    },
  },
  {
    pattern: '/blast-day/:id',
    view: 'daily-report',
    entry: {
      title: 'Daily report',
      what: 'Labor and operations: who worked, which machines and their hours, materials, subcontractors, notes.',
      steps: [
        'Time cards: each person files their own hours; you see the day’s cards here.',
        'Equipment hours feed the shop’s service clocks — enter the meter, not a guess.',
        'Attach photos, bills of lading, or the shot video from this screen.',
      ],
    },
  },
  {
    pattern: '/blast-day/:id',
    view: 'readiness',
    entry: {
      title: 'Readiness',
      what: 'The pre-blast check: is everything in place before loading?',
      steps: [
        'Drill logs accepted, pre-blast items ticked, seismographs placed.',
        'Anything red here is a stop — clear it before the shot.',
      ],
    },
  },
  {
    pattern: '/blast-day/:id',
    view: 'drilling',
    entry: {
      title: 'Drilling review',
      what: 'What the drillers actually drilled against your plan, merged across rigs.',
      steps: [
        'Dashed holes were skipped on purpose; deviations from plan are flagged.',
        'Accept the pattern when it is right — that locks the holes and hands you the load sheet.',
      ],
    },
  },
  {
    pattern: '/blast-day/:id/design/:shotId',
    entry: {
      title: 'Shot designer',
      what: 'The shot on paper: hole grid, loading column, delay timing, wiring, site map.',
      steps: [
        'Draw or import the pattern; the typical column sets the load per hole.',
        'Timing shows firing windows so no two holes fire within 8 ms.',
        'The site map snapshot goes on the filed log automatically.',
      ],
    },
  },
  {
    pattern: '/blast-day/:id/seismo/:shotId',
    entry: {
      title: 'Seismo readings',
      what: 'Seismograph results for this shot, one per unit, with the compliance check.',
      steps: [
        'Photograph the printout — the numbers are read off it for you; correct anything it misread.',
        'Distance + charge weight give scaled distance; PPV and frequency are checked against USBM RI8507 and OSM.',
        'An amber or red badge is explained in Reference. A violation is worth a note before filing.',
      ],
    },
  },
  {
    pattern: '/blast-day/:id/submit',
    entry: {
      title: 'File this day',
      what: 'Freezes the day as a signed PDF for the office — a write-once record.',
      steps: [
        'Check the preview; anything missing is listed above the button.',
        'Filing works offline — the copy uploads when you have signal.',
        'Found a mistake later? The office unlocks it, you fix and file version 2.',
      ],
    },
  },
  {
    pattern: '/blast-day/:id/drill-log/:logId',
    entry: {
      title: 'Drill log',
      what: 'The holes you drilled for this shot, one row each, against the plan.',
      steps: [
        'Tap a planned hole to log it as planned; change depth or angle only if the ground made you.',
        'Mark skipped holes skipped. Sign when the pattern is complete.',
      ],
      ask: 'Pick the rig at the top — the checklist and hour meter key off it.',
    },
  },
  {
    pattern: '/jobs/:jobId/drill-plan/:planId/log/:logId',
    entry: {
      title: 'Drill log',
      what: 'The holes you drilled for this plan, one row each.',
      steps: [
        'Tap a planned hole to log it as planned; change depth or angle only if the ground made you.',
        'Mark skipped holes skipped. Sign when the pattern is complete.',
      ],
      ask: 'Pick the rig at the top — the checklist and hour meter key off it.',
    },
  },
  {
    pattern: '/jobs/:jobId/drill-plan/:planId',
    entry: {
      title: 'Drill plan',
      what: 'The pattern the blaster wants drilled, with hole depths and angles.',
      steps: ['Send it to a driller from here.', 'Drill logs against this plan show below as they come in.'],
    },
  },
  {
    pattern: '/drill-checklist/:equipmentId',
    entry: {
      title: 'Rig checklist',
      what: 'The daily walk-around for this rig. Defects become shop tickets on their own.',
      steps: [
        'Enter the hour meter first — the 50-hour service clock reads it.',
        'A failed item with "out of service" puts the rig down for the shop right away.',
        'File it; the mechanic sees it in the Shop queue.',
      ],
    },
  },
  // ── Records ──
  {
    pattern: '/records',
    entry: {
      title: 'Records',
      what: 'The record system: every document, filed or not, with its PDF, versions and integrity hash.',
      steps: [
        'Filters on the left (kind · status · job · customer · site · person · dates) show live counts.',
        'Tap a row to preview the filed PDF; tick rows to download a ZIP, export a CSV index, or print.',
        'Group by date, job or kind; sort any column. Binder export packs a date range for an inspector.',
      ],
    },
  },
  {
    pattern: '/drill-logs',
    entry: {
      title: 'My records',
      what: 'Your filed drill logs and checklists, with PDFs.',
      steps: ['Open one to read it or print it.'],
    },
  },
  // ── Shop ──
  {
    pattern: '/admin/equipment',
    entry: {
      title: 'Fleet',
      what: 'Every machine: identity, hours, status, service history.',
      steps: [
        'Open a machine to log a service — the PM clock restarts from it.',
        'Hours come from the field’s checklists and daily reports; correct a wrong meter with an hour correction.',
      ],
    },
  },
  {
    pattern: '/equipment/:id',
    entry: {
      title: 'Machine',
      what: 'One machine’s hours, tickets, services and where it last worked.',
      steps: [
        'Log a service done to restart its clock.',
        'The hour ledger shows every reading and correction — both values are kept forever.',
      ],
    },
  },
  {
    pattern: '/equipment-locator',
    entry: {
      title: 'Locator',
      what: 'Where each machine last worked, from the crews’ own daily reports and checklists.',
      steps: ['Grey chips are stale readings.', '"Mark at the yard" when a machine comes home.'],
    },
  },
  // ── Office / admin ──
  {
    pattern: '/admin/approvals',
    entry: {
      title: 'Approvals',
      what: 'Days and time cards the crews filed, waiting for the office.',
      steps: [
        'Open the PDF, approve, or send back with a reason — the blaster sees it on their Dashboard.',
        'Approving locks the day; reopen only if you must.',
      ],
    },
  },
  {
    pattern: '/admin/incidents',
    entry: {
      title: 'Incidents',
      what: 'Complaints, utility strikes and asset incidents — filed in the field, processed here.',
      steps: ['Work the claim fields; closing an incident is an office decision.'],
    },
  },
  {
    pattern: '/admin/people',
    entry: {
      title: 'People',
      what: 'The roster. A login is a property of a person, not a separate list.',
      steps: [
        'Invite by email — the link expires in 7 days; if email is off the page says so and gives you the link.',
        'Reset a password from the row; the person must choose their own on next sign-in.',
      ],
    },
  },
  {
    pattern: '/admin/roles',
    entry: {
      title: 'Roles',
      what: 'Roles are bundles of plain-English capabilities. Admin can never be changed.',
      steps: ['Edit a built-in role or add your own; changes reach every device on sync.'],
    },
  },
  {
    pattern: '/admin/feedback',
    entry: {
      title: 'Feedback',
      what: 'What users sent from the ? menu plus crash reports the app caught. Only the platform admin sees this.',
      steps: ['Open a row for the screenshot and device facts.', 'Mark seen or done; the reply note is yours for now.'],
    },
  },
  {
    pattern: '/incident/:incidentId',
    entry: {
      title: 'Incident',
      what: 'One incident report: what happened, where, who, photos, and the claim.',
      steps: ['File it when the facts are in; the office processes the claim from here.'],
    },
  },
  {
    pattern: '/profile',
    entry: {
      title: 'My Profile',
      what: 'Your licenses, signature and PIN — the things sign-off needs.',
      steps: ['Add a license per state you blast in.', 'Sign once; every sign-off becomes one tap.'],
    },
  },
  {
    pattern: '/settings',
    entry: {
      title: 'Settings',
      what: 'Personal: account, install, help, and how record pages lay out on this device.',
      steps: ['Company setup (people, equipment, catalog) lives under Admin.'],
    },
  },
  {
    pattern: '/reference',
    entry: {
      title: 'Reference',
      what: 'The formulas, glossary and USBM/OSM bands the app uses.',
      steps: ['Look up why a compliance badge is amber or red.'],
    },
  },
];

function matchPattern(pattern: string, pathname: string): boolean {
  const p = pattern.split('/').filter(Boolean);
  const a = pathname.split('/').filter(Boolean);
  if (p.length !== a.length) return false;
  return p.every((seg, i) => seg.startsWith(':') || seg === a[i]);
}

/** Coaching for a location, most specific first: view- or bucket-specific
 *  rules beat the generic one for the same pattern */
export function coachFor(pathname: string, search: string, bucket: CoachBucket = 'field'): CoachEntry | null {
  const view = new URLSearchParams(search).get('view');
  let generic: CoachEntry | null = null;
  for (const r of RULES) {
    if (!matchPattern(r.pattern, pathname)) continue;
    if (r.view) {
      if (r.view === view) return r.entry;
      continue;
    }
    if (r.bucket) {
      if (r.bucket === bucket) return r.entry;
      continue;
    }
    generic ??= r.entry;
  }
  return generic;
}

export const COACH_ROUTE_COUNT = RULES.length;

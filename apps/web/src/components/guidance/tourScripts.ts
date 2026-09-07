// Role-aware walkthrough scripts (Round S2). One script per home bucket,
// each a short trip through the 3–5 screens that role actually lives in.
// Steps name a ROUTE (the tour navigates there) and a SELECTOR (spotlit;
// the first VISIBLE match wins, so one anchor name serves both the desktop
// sidebar and the phone bar). Copy is in the DrillingWork voice: what this
// is, what you do here, who to ask.
import type { HomeDashboard } from '@shotlog/shared';

export interface TourStep {
  /** Navigate here before showing the step (omit = stay put) */
  route?: string;
  /** Spotlight target; null = centered card */
  selector: string | null;
  title: string;
  body: string;
}

export type TourBucket = HomeDashboard | 'admin';

const HELP_STEP: TourStep = {
  selector: '[data-help-button]',
  title: 'Stuck? Start here',
  body: 'Help & feedback is always in this spot. "About this screen" explains where you are; "Send feedback" goes straight to Matthew, signal or not. Run this walkthrough again from here any time.',
};

export const TOUR_SCRIPTS: Record<TourBucket, TourStep[]> = {
  field: [
    {
      route: '/',
      selector: null,
      title: 'Welcome to ShotLog',
      body: 'Your blasting log and daily report, on the tablet, with no signal needed. Five quick stops.',
    },
    {
      route: '/',
      selector: '[data-tour="home"]',
      title: 'Your Dashboard',
      body: 'Three bands: what needs you (unsigned, sent back, unfiled), today, and past months folded up. If it is not on this screen, it is not waiting on you.',
    },
    {
      route: '/',
      selector: '[data-tour="fab"]',
      title: 'Start work at a job',
      body: 'One tap opens a work day. Copy forward from the last day at that job — drill params, explosives, crew — then Continue walks you Drilling → Readiness → Shots → Seismo → File.',
    },
    {
      route: '/jobs',
      selector: '[data-tour="nav-/jobs"]',
      title: 'Jobs',
      body: 'Every job carries its customer, site, K factor and defaults, so you never re-type them. Small job? Set the customer, site and job up yourself right here.',
    },
    {
      route: '/records',
      selector: '[data-tour="nav-/records"]',
      title: 'My records',
      body: 'Everything you filed, with the PDF. Sent-back days show up here and on the Dashboard with the office note.',
    },
    HELP_STEP,
  ],
  driller: [
    {
      route: '/',
      selector: null,
      title: 'Welcome to ShotLog',
      body: 'Checklist, drill log, my hours — the whole day from the rig, no signal needed. Four quick stops.',
    },
    {
      route: '/',
      selector: '[data-tour="home"]',
      title: 'Your three tiles',
      body: 'Rig checklist · today’s drill log · my hours. Yesterday’s unfinished work shows above them until it is signed.',
    },
    {
      route: '/drilling',
      selector: '[data-tour="nav-/drilling"]',
      title: 'Drilling',
      body: 'Plans the blaster sent you, what is assigned, what is ready to drill. Open a plan and log holes as planned in one tap — skips and changes are normal, the app records what you actually drilled.',
    },
    {
      route: '/records',
      selector: '[data-tour="nav-/records"]',
      title: 'My records',
      body: 'Your filed drill logs and checklists with PDFs. Sign once in My Profile and every sign-off is one tap.',
    },
    HELP_STEP,
  ],
  mechanic: [
    {
      route: '/',
      selector: null,
      title: 'Welcome to ShotLog',
      body: 'What is down, what is due, where everything is. Four quick stops.',
    },
    {
      route: '/',
      selector: '[data-tour="home"]',
      title: 'Shop',
      body: 'Down · Tickets · Due soon on top; below, ONE worklist you drag into the order you want to work it. Rig checklists from the field land here as tickets.',
    },
    {
      route: '/admin/equipment',
      selector: '[data-tour="nav-/admin/equipment"]',
      title: 'Fleet',
      body: 'Every machine, its hours and status. Open one to log a service — the PM clock restarts from there.',
    },
    {
      route: '/equipment-locator',
      selector: '[data-tour="nav-/equipment-locator"]',
      title: 'Locator',
      body: 'Where each machine last worked, from the crews’ own records. "Mark at the yard" when it comes home.',
    },
    HELP_STEP,
  ],
  office: [
    {
      route: '/',
      selector: null,
      title: 'Welcome to ShotLog',
      body: 'Everything the crews file lands here for review. Four quick stops.',
    },
    {
      route: '/',
      selector: '[data-tour="home"]',
      title: 'Your queue',
      body: 'Days waiting for approval, time cards, sent-back work awaiting a resubmit, incidents. Approve, or send back with a reason — the blaster sees it right away.',
    },
    {
      route: '/records',
      selector: '[data-tour="nav-/records"]',
      title: 'Records',
      body: 'The company record book: every filed copy, write-once, with PDFs and audit trail. Filter by job, customer or date; export a binder for an inspector.',
    },
    {
      route: '/admin/incidents',
      selector: '[data-tour="nav-/admin/incidents"]',
      title: 'Incidents',
      body: 'Complaints, utility strikes, asset incidents — filed in the field, claims processed here.',
    },
    HELP_STEP,
  ],
  admin: [
    {
      route: '/',
      selector: null,
      title: 'Welcome to ShotLog',
      body: 'You run the company side: people, roles, catalog, and everything the crews file. Four quick stops.',
    },
    {
      route: '/admin/people',
      selector: 'a[href="/admin/people"]',
      title: 'People',
      body: 'One list: every person on the roster, with a login as a property. Invite by email; the link expires in 7 days.',
    },
    {
      route: '/admin/roles',
      selector: 'a[href="/admin/roles"]',
      title: 'Roles',
      body: 'Roles are bundles of plain-English capabilities. Edit a built-in or add your own; Admin itself can never be changed.',
    },
    {
      route: '/records',
      selector: '[data-tour="nav-/records"]',
      title: 'Records',
      body: 'The company record book with audit trail, binder export, and the compliance view.',
    },
    HELP_STEP,
  ],
};

export function tourScriptFor(bucket: TourBucket): TourStep[] {
  return TOUR_SCRIPTS[bucket] ?? TOUR_SCRIPTS.field;
}

// ── Screen tours (Round S7c, Matthew: "a tour that launches the first time
// they start a new blast day, showing them around that screen"). Short
// scripts on the SCREEN where the work happens, auto-run once per account
// the first time that screen opens, re-runnable from ? → Show me this
// screen. A step's route may carry ?view= — the engine matches path+search.
export type ScreenTourKey = 'day' | 'drill-log' | 'checklist' | 'shop' | 'approvals' | 'people';

export const SCREEN_TOUR_TITLE: Record<ScreenTourKey, string> = {
  day: 'your work day',
  'drill-log': 'the drill log',
  checklist: 'the rig checklist',
  shop: 'the shop',
  approvals: 'approvals',
  people: 'people',
};

export const SCREEN_TOURS: Record<ScreenTourKey, TourStep[]> = {
  day: [
    {
      selector: null,
      title: 'Your work day',
      body: 'One day, one job. Everything you file today lives here: the blasting log, the daily report, your time card. Five quick stops.',
    },
    {
      selector: '[data-tour="day-spine"]',
      title: 'The spine',
      body: 'Where the day stands and what comes next. Continue walks you Drilling → Readiness → Shots → Seismo → File — you never have to remember the order.',
    },
    {
      selector: '[data-tour="day-tabs"]',
      title: 'Day · Blast Log · Daily Report',
      body: 'The paper forms, as tabs. The Blast Log is the shot; the Daily Report is who worked, what ran, what was used.',
    },
    {
      route: '?view=blast-log',
      selector: '[data-tour="shot-drill"]',
      title: 'The shot: drill parameters',
      body: 'Hole size, burden, spacing, stemming, sub-drill — from the plan, adjusted to what was actually drilled. Totals compute from them.',
    },
    {
      route: '?view=blast-log',
      selector: '[data-tour="shot-explosives"]',
      title: 'Explosives, top-down',
      body: 'Count what went in — sticks, bags, boosters. Pounds are computed from the catalog, never typed.',
    },
    {
      route: '?view=blast-log',
      selector: '[data-tour="shot-design"]',
      title: 'Design plan and compliance',
      body: 'Closest structure, distance, pounds per delay → scaled distance and predicted PPV. The badge explains its own math — tap it.',
    },
    {
      route: '?view=blast-log',
      selector: '[data-tour="shot-signoff"]',
      title: 'Sign-off, then file',
      body: 'The responsible blaster signs the shot. Then Submit to Office files the PDFs and locks the day; sent back, it returns to your Dashboard with the note.',
    },
  ],
  'drill-log': [
    {
      selector: null,
      title: 'The drill log',
      body: 'The pattern the blaster planned, hole by hole. You record what actually went in the ground. Three quick stops.',
    },
    {
      selector: '[data-tour="log-entry"]',
      title: 'Tap the holes you drilled',
      body: 'Select on the grid, then "Log N as planned" — two taps for a clean row. Water, voids or a change of depth? "Log with changes"; a hole you did not drill is "Mark skipped" — normal, not an apology.',
    },
    {
      selector: '[data-tour="log-header"]',
      title: 'Your rig, your name',
      body: 'The rig on the log feeds its hours and the shop. Conditions you note at depth reach the blaster before loading.',
    },
    {
      selector: '[data-tour="log-complete"]',
      title: 'Sign it complete',
      body: 'When the pattern is done, Mark Complete signs the log and hands it to the blaster to accept. Unsigned logs wait for you on your home under "Yesterday needs you".',
    },
  ],
  checklist: [
    {
      selector: null,
      title: 'The rig checklist',
      body: 'The paper walk-around, once a day per machine. Needs no job and no plan. Three quick stops.',
    },
    {
      selector: '[data-tour="chk-hours"]',
      title: 'Hour meter first',
      body: 'Starting hours drive the 50-hour service clock and the shop\'s ledger. Read the meter, type it, done — a typo going backwards is ignored.',
    },
    {
      selector: '[data-tour="chk-daily"]',
      title: 'The walk-around',
      body: 'Everything starts ✓. Tap only what is N/A or not done. Repairs needed go in the box below — the shop sees them as a ticket.',
    },
    {
      selector: '[data-tour="chk-oos"]',
      title: 'Out of service',
      body: 'Tick this and the rig is pulled from the fleet until the shop clears it. Sign, then File — the office copy is filed for you.',
    },
  ],
  shop: [
    {
      selector: null,
      title: 'My Shop',
      body: 'What is down, what is due, what came in from the field. Three quick stops.',
    },
    {
      selector: '[data-tour="shop-trio"]',
      title: 'Down · Tickets · Due',
      body: 'The three numbers that matter this morning. Checklists filed today shows how many rigs have been looked at.',
    },
    {
      selector: '[data-tour="shop-worklist"]',
      title: 'One worklist',
      body: 'Tickets from rig checklists and services due from the hour ledger, in the order YOU want — drag to reorder; it sticks. Open a row to resolve the ticket or log the service.',
    },
    {
      selector: '[data-tour="nav-/admin/equipment"]',
      title: 'Fleet',
      body: 'Every machine, its hours and status. Log a service there and the PM clock restarts; correct a meter when the physical one disagrees.',
    },
  ],
  approvals: [
    {
      selector: null,
      title: 'Approvals',
      body: 'Days the crews submitted, oldest first. Three quick stops.',
    },
    {
      selector: '[data-approval-row]',
      title: 'What is attached',
      body: 'Open the job name to read the day itself — log, report, cards, checklist, drill log — before you decide.',
    },
    {
      selector: '[data-tour="approve"]',
      title: 'Approve',
      body: 'Locks the day and files it as the record of that date. Time cards are approved separately from your home queue.',
    },
    {
      selector: '[data-tour="send-back"]',
      title: 'Send back, with a reason',
      body: 'The blaster sees the note on their Dashboard right away and resubmits. The audit trail keeps both trips.',
    },
  ],
  people: [
    {
      selector: null,
      title: 'People',
      body: 'One list: everyone on the roster, with a login as a property of the person. Three quick stops.',
    },
    {
      selector: '[data-tour="people-add"]',
      title: 'Add a person',
      body: 'Names first, one per line. A person needs no login to be on time cards and drill logs.',
    },
    {
      selector: '[data-person-row]',
      title: 'One line each',
      body: 'Name, role, login status. Search by name or email; the list windows to 15 and Show all.',
    },
    {
      selector: '[data-person-more]',
      title: 'The ⋯ menu',
      body: 'Invite (the link expires in 7 days), change the role, reset a password, deactivate. Accounts are never hard-deleted — the records they signed stay theirs.',
    },
  ],
};

/** Which screen tour belongs to this route for this bucket, if any */
export function screenTourFor(pathname: string, search: string, bucket: TourBucket): ScreenTourKey | null {
  const params = new URLSearchParams(search);
  if (/^\/blast-day\/[^/]+$/.test(pathname)) {
    const view = params.get('view');
    return bucket === 'field' && (!view || view === 'hub' || view === 'blast-log') ? 'day' : null;
  }
  if (/^\/blast-day\/[^/]+\/drill-log\/[^/]+$/.test(pathname) || /^\/jobs\/[^/]+\/drill-plan\/[^/]+\/log\/[^/]+$/.test(pathname)) {
    return bucket === 'driller' ? 'drill-log' : null;
  }
  if (/^\/drill-checklist\/[^/]+$/.test(pathname)) return bucket === 'driller' ? 'checklist' : null;
  if (pathname === '/' && bucket === 'mechanic') return 'shop';
  if (pathname === '/admin/approvals') return bucket === 'office' || bucket === 'admin' ? 'approvals' : null;
  if (pathname === '/admin/people') return bucket === 'admin' ? 'people' : null;
  return null;
}

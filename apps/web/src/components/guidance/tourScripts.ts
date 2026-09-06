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

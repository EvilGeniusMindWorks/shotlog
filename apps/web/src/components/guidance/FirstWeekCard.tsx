// First-week checklist on every home (Round S2): 4–5 things a new person
// should do once, in the DrillingWork voice. Items tick THEMSELVES from real
// data where the record carries the person's id; the rest are tapped off by
// hand. Dismissed per device ("Hide"); disappears on its own once all done.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ChevronRight } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { getRealSessionUser, type SessionUser } from '@/lib/session';
import { startTour, tourBucket } from '@/components/layout/Tour';
import type { TourBucket } from './tourScripts';

const HIDE_KEY = 'shotlog-first-week-hidden';
const MANUAL_KEY = 'shotlog-first-week-manual';

interface Item {
  key: string;
  text: string;
  /** Where to go to do it (Link) — or an action (walkthrough) */
  to?: string;
  action?: 'tour';
  /** Auto-detect from data; undefined = manual tick */
  done?: (ctx: Ctx) => boolean;
}

interface Ctx {
  me: SessionUser;
  blastLogsMine: number;
  shotsMine: number;
  drillLogsMine: number;
  checklistsMine: number;
  timeCardsMine: number;
  submissionsMine: number;
  ticketsResolvedMine: number;
  servicesMine: number;
  approvedDays: number;
  companySettings: number;
}

const TOUR: Item = {
  key: 'tour',
  text: 'Take the two-minute walkthrough',
  action: 'tour',
  done: (c) => Boolean(c.me.tourDoneAt),
};

const ITEMS: Record<TourBucket, Item[]> = {
  field: [
    { key: 'license', text: 'Add your blasting license', to: '/profile', done: (c) => (c.me.licenses?.length ?? 0) > 0 },
    { key: 'sign', text: 'Sign once — every sign-off becomes one tap', to: '/profile', done: (c) => Boolean(c.me.signature) },
    TOUR,
    { key: 'day', text: 'Start work at a job (the + button)', to: '/', done: (c) => c.blastLogsMine + c.shotsMine + c.drillLogsMine + c.timeCardsMine > 0 },
    { key: 'file', text: 'File a day to the office', to: '/', done: (c) => c.submissionsMine > 0 },
  ],
  driller: [
    { key: 'sign', text: 'Sign once in My Profile', to: '/profile', done: (c) => Boolean(c.me.signature) },
    TOUR,
    { key: 'checklist', text: 'File a rig checklist', to: '/', done: (c) => c.checklistsMine > 0 },
    { key: 'log', text: 'Log holes on a drill log', to: '/drilling', done: (c) => c.drillLogsMine > 0 },
    { key: 'hours', text: 'Enter your hours for a day', to: '/', done: (c) => c.timeCardsMine > 0 },
  ],
  mechanic: [
    TOUR,
    { key: 'order', text: 'Drag the worklist into your order', to: '/' },
    { key: 'ticket', text: 'Resolve a ticket', to: '/', done: (c) => c.ticketsResolvedMine > 0 },
    { key: 'service', text: 'Log a service done on a machine', to: '/admin/equipment', done: (c) => c.servicesMine > 0 },
    { key: 'locator', text: 'Find a machine in Locator', to: '/equipment-locator' },
  ],
  office: [
    TOUR,
    { key: 'approve', text: 'Approve a filed day (or send one back)', to: '/admin/approvals', done: (c) => c.approvedDays > 0 },
    { key: 'records', text: 'Open Records and filter by job', to: '/records' },
    { key: 'incident', text: 'Look at the Incidents queue', to: '/admin/incidents' },
  ],
  admin: [
    TOUR,
    { key: 'invite', text: 'Invite a person from People', to: '/admin/people' },
    { key: 'roles', text: 'Read the Roles page once', to: '/admin/roles' },
    { key: 'company', text: 'Check company details and the catalog', to: '/admin/company', done: (c) => c.companySettings > 0 },
    { key: 'viewas', text: 'Try "View as" to see a crew screen', to: '/' },
  ],
};

function readSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function useCtx(me: SessionUser | null): Ctx | undefined {
  return useLiveQuery(async () => {
    if (!me) return undefined;
    const id = me.id;
    const [blastLogs, shots, drillLogs, checklists, timeCards, submissions, tickets, equipment, days, settings] =
      await Promise.all([
        db.blastLogs.filter((l) => l.blasterUserId === id).count(),
        db.shots.filter((s) => s.responsibleBlasterUserId === id).count(),
        db.drillLogs.filter((l) => l.drillerUserId === id).count(),
        db.drillChecklists.filter((c) => c.drillerUserId === id).count(),
        db.timeCards.filter((t) => t.userId === id).count(),
        db.submissions.filter((s) => s.submittedByUserId === id).count(),
        db.repairTickets.filter((t) => t.resolvedByUserId === id).count(),
        db.equipment.toArray(),
        db.blastDays.filter((d) => d.status === 'approved').count(),
        db.companySettings.count(),
      ]);
    const servicesMine = equipment.reduce(
      (n, e) => n + (e.services ?? []).filter((s) => s.byName === me.name).length,
      0,
    );
    return {
      me,
      blastLogsMine: blastLogs,
      shotsMine: shots,
      drillLogsMine: drillLogs,
      checklistsMine: checklists,
      timeCardsMine: timeCards,
      submissionsMine: submissions,
      ticketsResolvedMine: tickets,
      servicesMine,
      approvedDays: days,
      companySettings: settings,
    };
  }, [me?.id, me?.tourDoneAt, me?.signature, me?.licenses?.length]);
}

export function FirstWeekCard() {
  const me = getRealSessionUser();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [manual, setManual] = useState<Set<string>>(() => readSet(MANUAL_KEY));
  const ctx = useCtx(me);
  // Re-read the session flags (tourDoneAt flips after the walkthrough)
  const [, bump] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => bump((n) => n + 1), 4000);
    return () => window.clearInterval(t);
  }, []);

  if (hidden || !me || !ctx) return null;
  const items = ITEMS[tourBucket()] ?? ITEMS.field;
  const isDone = (it: Item) => (it.done ? it.done(ctx) : manual.has(it.key));
  const remaining = items.filter((it) => !isDone(it));
  if (remaining.length === 0) return null;

  const tick = (key: string) => {
    const next = new Set(manual);
    next.add(key);
    setManual(next);
    try {
      localStorage.setItem(MANUAL_KEY, JSON.stringify([...next]));
    } catch {
      /* private mode */
    }
  };
  const hide = () => {
    try {
      localStorage.setItem(HIDE_KEY, '1');
    } catch {
      /* private mode */
    }
    setHidden(true);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4" data-first-week>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-gray-400">
          Your first week · {items.length - remaining.length}/{items.length} done
        </p>
        <button className="text-xs text-gray-500 underline underline-offset-2" onClick={hide} data-first-week-hide>
          Hide
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((it) => {
          const done = isDone(it);
          const label = (
            <span className={done ? 'line-through text-gray-400' : 'text-gray-800'}>{it.text}</span>
          );
          return (
            <li key={it.key} className="flex items-center gap-2 text-sm" data-first-week-item={it.key} data-done={done}>
              <button
                className="shrink-0 text-gray-400 disabled:text-green-600"
                disabled={done}
                title={it.done ? 'Ticks itself when done' : 'Tap to tick off'}
                onClick={() => !it.done && tick(it.key)}
                aria-label={done ? 'Done' : 'Mark done'}
              >
                {done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4" />}
              </button>
              {done ? (
                label
              ) : it.action === 'tour' ? (
                <button className="flex items-center gap-1 text-left" onClick={startTour}>
                  {label} <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                </button>
              ) : it.to ? (
                <Link to={it.to} className="flex items-center gap-1">
                  {label} <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                </Link>
              ) : (
                label
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

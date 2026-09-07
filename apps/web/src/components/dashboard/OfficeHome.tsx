// The office home (Round S4, Office & Records study §1 — "looks good"):
// Evette's QUEUE, not the admin's costing table. Five live counters, each
// one tap from its section: awaiting approval (oldest first, with what is
// attached) · sent back and waiting · time cards to approve · expiring
// paperwork · open incidents — plus "never submitted" drafts older than
// three days. Provisional until the Evette walkthrough resumes; the
// sections are the ones her charter already names.
import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, FileWarning, ShieldAlert, Undo2 } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { projectTable } from '@/db/projections';
import { getPowerSync } from '@/db/powersync/client';
import { getSessionUser } from '@/lib/session';
import { hasCap } from '@/lib/perms';
import { daysUntil } from '@/lib/jobActivity';
import { formatDate, nowISO, todayISO } from '@/lib/utils';
import { isBlastingWork, type WorkType } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ApprovalRow {
  dayId: string;
  date: string;
  jobName: string;
  typeOfWork: string;
  submittedBy: string;
  waitingDays: number;
  shots: number;
  cards: number;
  checklist: boolean;
  drillLog: boolean;
  seismoMissing: boolean;
}

interface CardGroup {
  key: string;
  date: string;
  jobId: string;
  jobName: string;
  blastDayId?: string;
  cardIds: string[];
  people: string[];
  signed: number;
}

interface ExpiryRow {
  key: string;
  what: string;
  who: string;
  expires: string;
  days: number;
  to: string;
}

interface QueueData {
  approvals: ApprovalRow[];
  sentBack: { dayId: string; date: string; jobName: string; note: string }[];
  cardGroups: CardGroup[];
  expiring: ExpiryRow[];
  openIncidents: number;
  neverSubmitted: { dayId: string; date: string; jobName: string; by: string; age: number }[];
}

const dayAge = (iso: string) => Math.max(0, -daysUntil(iso.slice(0, 10)));

function useQueue(): QueueData | undefined {
  return useLiveQuery(async () => {
    const today = todayISO();
    const jobs = new Map(
      (await projectTable<{ name: string | null }>('jobs', { name: 'name' })).map((j) => [j.id, j.name ?? '—']),
    );
    const days = await projectTable<{
      date: string; jobId: string; status: string; typeOfWork: string | null;
      sendBackNote: string | null; updatedAt: string;
    }>('blastDays', {
      date: 'date', jobId: 'jobId', status: 'status', typeOfWork: 'typeOfWork',
      sendBackNote: 'sendBackNote', updatedAt: 'updatedAt',
    });
    const logs = await projectTable<{ blastDayId: string; blasterName: string | null }>('blastLogs', {
      blastDayId: 'blastDayId', blasterName: 'blasterName',
    });
    const logByDay = new Map(logs.map((l) => [l.blastDayId, l]));
    const shots = await projectTable<{ blastLogId: string }>('shots', { blastLogId: 'blastLogId' });
    const shotsByLog = new Map<string, string[]>();
    for (const s of shots) shotsByLog.set(s.blastLogId, [...(shotsByLog.get(s.blastLogId) ?? []), s.id]);
    const readings = await projectTable<{ shotId: string }>('seismoReadings', { shotId: 'shotId' });
    const readShots = new Set(readings.map((r) => r.shotId));
    const drillLogs = await projectTable<{ blastDayId: string | null }>('drillLogs', { blastDayId: 'blastDayId' });
    const daysWithDrillLog = new Set(drillLogs.map((l) => l.blastDayId).filter(Boolean) as string[]);
    const checklists = await projectTable<{ jobId: string | null; date: string }>('drillChecklists', {
      jobId: 'jobId', date: 'date',
    });
    const checklistKeys = new Set(checklists.map((c) => `${c.jobId}|${c.date}`));
    // Blob-free: the signature is a PNG marker — only its presence is read
    const cards = await getPowerSync().getAll<{
      id: string; date: string; jobId: string; blastDayId: string | null; personName: string;
      status: string; straightTime: number | null; overtime: number | null; hasSig: number;
    }>(
      `SELECT id,
              json_extract(payload,'$.date')         AS date,
              json_extract(payload,'$.jobId')        AS jobId,
              json_extract(payload,'$.blastDayId')   AS blastDayId,
              json_extract(payload,'$.personName')   AS personName,
              json_extract(payload,'$.status')       AS status,
              json_extract(payload,'$.straightTime') AS straightTime,
              json_extract(payload,'$.overtime')     AS overtime,
              CASE WHEN json_extract(payload,'$.signatureImage.__blob') IS NOT NULL THEN 1 ELSE 0 END AS hasSig
       FROM records WHERE table_name = 'timeCards'`,
    );
    const cardsByDay = new Map<string, number>();
    for (const c of cards) {
      const k = c.blastDayId ?? `${c.jobId}|${c.date}`;
      cardsByDay.set(k, (cardsByDay.get(k) ?? 0) + 1);
    }

    const approvals: ApprovalRow[] = days
      .filter((d) => d.status === 'submitted')
      .map((d) => {
        const log = logByDay.get(d.id);
        const shotIds = log ? (shotsByLog.get(log.id) ?? []) : [];
        return {
          dayId: d.id,
          date: d.date,
          jobName: jobs.get(d.jobId) ?? '—',
          typeOfWork: (d.typeOfWork ?? 'drill_shoot').replace(/_/g, ' '),
          submittedBy: log?.blasterName || '—',
          waitingDays: dayAge(d.updatedAt),
          shots: shotIds.length,
          cards: (cardsByDay.get(d.id) ?? 0) + (cardsByDay.get(`${d.jobId}|${d.date}`) ?? 0),
          checklist: checklistKeys.has(`${d.jobId}|${d.date}`),
          drillLog: daysWithDrillLog.has(d.id),
          seismoMissing: isBlastingWork((d.typeOfWork ?? 'blasting') as WorkType) && shotIds.some((s) => !readShots.has(s)),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const sentBack = days
      .filter((d) => d.status === 'draft' && d.sendBackNote)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((d) => ({ dayId: d.id, date: d.date, jobName: jobs.get(d.jobId) ?? '—', note: d.sendBackNote ?? '' }));

    const groups = new Map<string, CardGroup>();
    for (const c of cards) {
      if (c.status !== 'filed') continue;
      const key = `${c.date}|${c.jobId}`;
      const g = groups.get(key) ?? {
        key, date: c.date, jobId: c.jobId, jobName: jobs.get(c.jobId) ?? '—',
        blastDayId: c.blastDayId ?? undefined, cardIds: [], people: [], signed: 0,
      };
      g.cardIds.push(c.id);
      const initials = c.personName.split(' ').map((p, i, a) => (i === a.length - 1 ? p : `${p[0]}.`)).join(' ');
      g.people.push(`${initials} ${c.straightTime ?? 0}/${c.overtime ?? 0}`);
      if (c.hasSig) g.signed++;
      if (!g.blastDayId && c.blastDayId) g.blastDayId = c.blastDayId;
      groups.set(key, g);
    }
    const cardGroups = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));

    const expiring: ExpiryRow[] = [];
    const customers = await projectTable<{ name: string; coiExpires: string | null }>('customers', {
      name: 'name', coiExpires: 'coiExpires',
    });
    for (const c of customers) {
      if (!c.coiExpires) continue;
      const d = daysUntil(c.coiExpires);
      if (d <= 90) expiring.push({ key: `coi-${c.id}`, what: 'certificate of insurance', who: c.name, expires: c.coiExpires, days: d, to: `/customers/${c.id}` });
    }
    const sites = await db.sites.toArray();
    for (const s of sites) {
      for (const p of s.permits ?? []) {
        if (!p.expiresAt) continue;
        const d = daysUntil(p.expiresAt);
        if (d <= 90) expiring.push({ key: `permit-${s.id}-${p.id}`, what: `${p.name}${p.number ? ` ${p.number}` : ''}`, who: s.name, expires: p.expiresAt, days: d, to: `/sites/${s.id}` });
      }
    }
    expiring.sort((a, b) => a.days - b.days);

    const openIncidents = (await projectTable<{ status: string }>('incidents', { status: 'status' })).filter(
      (i) => i.status !== 'closed',
    ).length;

    const neverSubmitted = days
      .filter((d) => d.status === 'draft' && !d.sendBackNote && daysUntil(d.date) <= -3)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((d) => ({
        dayId: d.id, date: d.date, jobName: jobs.get(d.jobId) ?? '—',
        by: logByDay.get(d.id)?.blasterName || '—', age: Math.max(0, -daysUntil(d.date)),
      }));
    void today;
    return { approvals, sentBack, cardGroups, expiring, openIncidents, neverSubmitted };
  }, []);
}

function Counter({ n, label, tone, target }: { n: number; label: string; tone?: 'red' | 'amber'; target: string }) {
  return (
    <button
      className={`rounded-xl border bg-white px-3 py-2 text-center min-w-[96px] flex-1 ${
        n === 0 ? 'border-gray-200' : tone === 'red' ? 'border-red-200' : tone === 'amber' ? 'border-amber-200' : 'border-gray-200'
      }`}
      onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      data-office-counter={target}
    >
      <span className={`block text-2xl font-bold leading-none ${n === 0 ? 'text-gray-300' : tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-gray-900'}`}>{n}</span>
      <span className="block text-[10px] text-gray-500 mt-1 leading-tight">{label}</span>
    </button>
  );
}

function Section({ id, title, count, more, children }: { id: string; title: string; count: number; more?: { label: string; to: string }; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <section id={id} className="rounded-xl border border-gray-200 bg-white p-3 scroll-mt-4" data-office-section={id}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          {title} · {count}
        </p>
        {more && (
          <button className="text-xs text-navy underline" onClick={() => navigate(more.to)}>
            {more.label} →
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export function OfficeHome() {
  const navigate = useNavigate();
  const me = getSessionUser();
  const q = useQueue();
  const canApprove = hasCap('approve_days');
  const first = me?.name?.split(' ')[0];
  const totalCards = useMemo(() => (q?.cardGroups ?? []).reduce((n, g) => n + g.cardIds.length, 0), [q]);

  const approveGroup = async (g: CardGroup) => {
    const now = nowISO();
    for (const id of g.cardIds) {
      await db.timeCards.update(id, {
        status: 'approved', approvedAt: now, approvedByUserId: me?.id, approvedByName: me?.name, updatedAt: now,
      });
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-3" data-tour="home" data-office-home>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Office{first ? ` · ${first}` : ''}</h2>
        <p className="text-xs text-gray-500">{formatDate(todayISO())} · what needs your hands today, in order</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Counter n={q?.approvals.length ?? 0} label="Awaiting approval" tone="amber" target="queue-approvals" />
        <Counter n={q?.sentBack.length ?? 0} label="Sent back, waiting" target="queue-sent-back" />
        <Counter n={totalCards} label="Time cards to approve" tone="amber" target="queue-cards" />
        <Counter n={q?.expiring.length ?? 0} label="Expiring ≤ 90 d" tone={q?.expiring.some((e) => e.days <= 30) ? 'red' : undefined} target="queue-expiring" />
        <Counter n={q?.openIncidents ?? 0} label="Open incidents" tone={q?.openIncidents ? 'red' : undefined} target="queue-incidents" />
      </div>

      <Section id="queue-approvals" title="Approvals · oldest first" count={q?.approvals.length ?? 0} more={{ label: 'All approvals', to: '/admin/approvals' }}>
        {(q?.approvals ?? []).map((a) => (
          <div key={a.dayId} className="flex items-center gap-2 py-2 border-t border-gray-100 first:border-t-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {formatDate(a.date)} · {a.jobName} <span className="text-gray-400 font-normal">{a.typeOfWork}</span>
              </p>
              <p className="text-xs text-gray-400 truncate">
                Submitted by {a.submittedBy} · {a.waitingDays === 0 ? 'today' : `${a.waitingDays} day${a.waitingDays === 1 ? '' : 's'} waiting`}
                {a.shots > 0 && ` · ${a.shots} shot${a.shots === 1 ? '' : 's'}`}
                {a.cards > 0 && ` · ${a.cards} time card${a.cards === 1 ? '' : 's'}`}
                {a.checklist && ' · rig checklist ✓'}
                {a.drillLog && ' · drill log ✓'}
              </p>
            </div>
            {a.seismoMissing && <Badge variant="warning">seismo missing</Badge>}
            <Button size="sm" onClick={() => navigate(`/admin/approvals?day=${a.dayId}`)}>Review</Button>
          </div>
        ))}
        {q && q.approvals.length === 0 && <p className="text-sm text-gray-400 py-1">Nothing waiting — days the crews file land here, oldest first.</p>}
      </Section>

      <Section id="queue-sent-back" title="Sent back, waiting on the field" count={q?.sentBack.length ?? 0}>
        {(q?.sentBack ?? []).map((s) => (
          <button key={s.dayId} className="w-full flex items-center gap-2 py-2 text-left border-t border-gray-100 first:border-t-0 hover:bg-gray-50" onClick={() => navigate(`/blast-day/${s.dayId}`)}>
            <Undo2 className="h-4 w-4 text-gray-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{formatDate(s.date)} · {s.jobName}</p>
              <p className="text-xs text-gray-400 truncate">Your note: “{s.note}”</p>
            </div>
            <Badge variant="violation">sent back</Badge>
          </button>
        ))}
        {q && q.sentBack.length === 0 && <p className="text-sm text-gray-400 py-1">Nothing sent back is outstanding.</p>}
      </Section>

      <Section id="queue-cards" title="Time cards to approve" count={totalCards}>
        {(q?.cardGroups ?? []).map((g) => (
          <div key={g.key} className="flex items-center gap-2 py-2 border-t border-gray-100 first:border-t-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {formatDate(g.date)} · {g.jobName} · {g.cardIds.length} card{g.cardIds.length === 1 ? '' : 's'}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {g.people.slice(0, 3).join(' · ')}{g.people.length > 3 ? ` · +${g.people.length - 3}` : ''} ·{' '}
                {g.signed === g.cardIds.length ? 'all signed' : `${g.signed}/${g.cardIds.length} signed`}
              </p>
            </div>
            {canApprove && (
              <Button size="sm" variant="outline" onClick={() => void approveGroup(g)} data-approve-cards={g.key}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Approve all
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => navigate(g.blastDayId ? `/blast-day/${g.blastDayId}?view=daily-report` : `/jobs/${g.jobId}`)}>
              Open
            </Button>
          </div>
        ))}
        {q && q.cardGroups.length === 0 && <p className="text-sm text-gray-400 py-1">No filed time cards waiting. Each person files their own from their day.</p>}
      </Section>

      <Section id="queue-expiring" title="Expiring soon" count={q?.expiring.length ?? 0}>
        {(q?.expiring ?? []).map((e) => (
          <button key={e.key} className="w-full flex items-center gap-2 py-2 text-left border-t border-gray-100 first:border-t-0 hover:bg-gray-50" onClick={() => navigate(e.to)}>
            <Clock className="h-4 w-4 text-gray-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{e.who} · {e.what}</p>
              <p className="text-xs text-gray-400">{e.days < 0 ? `Expired ${formatDate(e.expires)}` : `Expires ${formatDate(e.expires)} · ${e.days} days`}</p>
            </div>
            <Badge variant={e.days < 0 ? 'violation' : e.days <= 30 ? 'warning' : 'secondary'}>{e.days < 0 ? 'expired' : `${e.days} d`}</Badge>
          </button>
        ))}
        {q && q.expiring.length === 0 && <p className="text-sm text-gray-400 py-1">Nothing expires in the next 90 days. COIs live on customers, permits on sites.</p>}
      </Section>

      <Section id="queue-incidents" title="Open incidents" count={q?.openIncidents ?? 0} more={{ label: 'Incidents', to: '/admin/incidents' }}>
        <p className="text-sm text-gray-500 py-1 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-gray-400" />
          {q?.openIncidents ? `${q.openIncidents} open or in review — process the claims under Incidents.` : 'No open incidents.'}
        </p>
      </Section>

      <Section id="queue-never" title="Never submitted · older than 3 days" count={q?.neverSubmitted.length ?? 0} more={{ label: 'All work days', to: '/days' }}>
        {(q?.neverSubmitted ?? []).slice(0, 5).map((d) => (
          <button key={d.dayId} className="w-full flex items-center gap-2 py-2 text-left border-t border-gray-100 first:border-t-0 hover:bg-gray-50" onClick={() => navigate(`/blast-day/${d.dayId}`)}>
            <FileWarning className="h-4 w-4 text-gray-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{formatDate(d.date)} · {d.jobName}</p>
              <p className="text-xs text-gray-400">Draft · {d.by} · {d.age} days</p>
            </div>
            <Badge variant="draft">draft</Badge>
          </button>
        ))}
        {q && q.neverSubmitted.length > 5 && (
          <button className="text-xs text-gray-400 hover:text-navy py-1" onClick={() => navigate('/days')}>
            Show all {q.neverSubmitted.length} ▸
          </button>
        )}
        {q && q.neverSubmitted.length === 0 && (
          <p className="text-sm text-gray-400 py-1 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 text-gray-300" /> Every day older than three days has been filed.
          </p>
        )}
      </Section>

      <p className="text-xs text-gray-400">Latest filings live under Records; job costing is on the admin home.</p>
    </div>
  );
}

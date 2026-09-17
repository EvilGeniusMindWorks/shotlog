// S21 (Matthew, Sep 16 2026: "I wouldn't want to give up the existing
// columnar format, but perhaps there's a way to toggle between both, and
// maybe this is the default?"): both at once — the tree is the navigator on
// the left, the columns are the list on the right. Tap a customer, a site, a
// job or a day and the list shows what is under it. The counts respect the
// Kind and Status chips, so "Status: awaiting approval" shows at a glance
// which jobs have papers waiting.
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import type { RecRow } from './recRows';

export interface TreeNode {
  level: 'all' | 'customer' | 'site' | 'job' | 'day' | 'nojob';
  customerId?: string;
  siteId?: string;
  jobId?: string;
  date?: string;
  label: string;
}

export const ALL_NODE: TreeNode = { level: 'all', label: 'All records' };

export function nodeKey(n: TreeNode): string {
  switch (n.level) {
    case 'all': return 'all';
    case 'nojob': return 'nojob';
    case 'customer': return `c:${n.customerId}`;
    case 'site': return `s:${n.siteId}`;
    case 'job': return `j:${n.jobId}`;
    case 'day': return `d:${n.jobId}:${n.date}`;
  }
}

/** Does a row sit under this node? */
export function rowUnderNode(r: RecRow, n: TreeNode): boolean {
  switch (n.level) {
    case 'all': return true;
    case 'nojob': return !r.jobId;
    case 'customer': return r.customerId === n.customerId;
    case 'site': return r.siteId === n.siteId;
    case 'job': return r.jobId === n.jobId;
    case 'day': return r.jobId === n.jobId && r.date === n.date;
  }
}

const DAYS_SHOWN = 4;

interface Names {
  customers: { id: string; name: string }[];
  sites: { id: string; name: string; customerId?: string; city?: string; state?: string }[];
  jobs: { id: string; name: string; jobNumber?: string; customerId?: string; siteId?: string }[];
}

export function RecordsTree({ rows, names, selected, onSelect }: { rows: RecRow[]; names: Names; selected: TreeNode; onSelect: (n: TreeNode) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [moreDays, setMoreDays] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setCollapsed((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const model = useMemo(() => {
    const jobById = new Map(names.jobs.map((j) => [j.id, j]));
    const siteById = new Map(names.sites.map((s) => [s.id, s]));
    const custById = new Map(names.customers.map((c) => [c.id, c]));
    // counts per node key
    const count = new Map<string, number>();
    const bump = (k: string) => count.set(k, (count.get(k) ?? 0) + 1);
    // structure: customer → site → job → days, built from the rows AND the roster of jobs (a job with
    // nothing filed still shows, at 0, so the office can see the whole company at a glance)
    const daysByJob = new Map<string, Set<string>>();
    const jobIds = new Set<string>();
    for (const j of names.jobs) jobIds.add(j.id);
    let noJob = 0;
    for (const r of rows) {
      bump('all');
      if (!r.jobId) { noJob++; continue; }
      const job = jobById.get(r.jobId);
      const customerId = r.customerId ?? job?.customerId;
      const siteId = r.siteId ?? job?.siteId;
      if (customerId) bump(`c:${customerId}`);
      if (siteId) bump(`s:${siteId}`);
      bump(`j:${r.jobId}`);
      bump(`d:${r.jobId}:${r.date}`);
      jobIds.add(r.jobId);
      if (!daysByJob.has(r.jobId)) daysByJob.set(r.jobId, new Set());
      daysByJob.get(r.jobId)!.add(r.date);
    }
    const byCustomer = new Map<string, Map<string, string[]>>(); // customer → site → jobs
    const orphanJobs: string[] = [];
    for (const jid of jobIds) {
      const job = jobById.get(jid);
      const cid = job?.customerId;
      const sid = job?.siteId;
      if (!cid || !sid) { orphanJobs.push(jid); continue; }
      if (!byCustomer.has(cid)) byCustomer.set(cid, new Map());
      const sites = byCustomer.get(cid)!;
      if (!sites.has(sid)) sites.set(sid, []);
      sites.get(sid)!.push(jid);
    }
    const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
    const customers = [...byCustomer.entries()]
      .map(([cid, sites]) => ({
        id: cid,
        name: custById.get(cid)?.name ?? 'Unknown customer',
        n: count.get(`c:${cid}`) ?? 0,
        sites: [...sites.entries()].map(([sid, jobs]) => {
          const s = siteById.get(sid);
          return {
            id: sid,
            name: s ? `${s.city ? `${s.city}${s.state ? `, ${s.state}` : ''} · ` : ''}${s.name}` : 'Unknown site',
            n: count.get(`s:${sid}`) ?? 0,
            jobs: jobs.map((jid) => {
              const j = jobById.get(jid);
              return {
                id: jid,
                name: `${j?.jobNumber ? `${j.jobNumber} ` : ''}${j?.name ?? 'Job'}`,
                n: count.get(`j:${jid}`) ?? 0,
                days: [...(daysByJob.get(jid) ?? [])].sort().reverse().map((d) => ({ date: d, n: count.get(`d:${jid}:${d}`) ?? 0 })),
              };
            }).sort((a, b) => b.n - a.n || byName(a.name, b.name)),
          };
        }).sort((a, b) => b.n - a.n || byName(a.name, b.name)),
      }))
      .sort((a, b) => b.n - a.n || byName(a.name, b.name));
    return { customers, orphanJobs: orphanJobs.map((jid) => { const j = jobById.get(jid); return { id: jid, name: `${j?.jobNumber ? `${j.jobNumber} ` : ''}${j?.name ?? 'Job'}`, n: count.get(`j:${jid}`) ?? 0, days: [...(daysByJob.get(jid) ?? [])].sort().reverse().map((d) => ({ date: d, n: count.get(`d:${jid}:${d}`) ?? 0 })) }; }), all: count.get('all') ?? 0, noJob };
  }, [rows, names]);

  const sel = nodeKey(selected);
  const Row = ({ k, depth, label, n, node, children, leaf }: { k: string; depth: number; label: string; n: number; node: TreeNode; children?: boolean; leaf?: boolean }) => {
    const isSel = sel === k;
    const open = !collapsed.has(k);
    return (
      <div
        className={cn('flex items-center gap-1 rounded-md pr-2 py-[3px] text-[13px] cursor-pointer select-none', isSel ? 'bg-navy text-white' : 'hover:bg-gray-100 text-gray-800', n === 0 && !isSel && 'text-gray-400')}
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={() => onSelect(node)}
        data-tree-node={k}
        data-tree-count={n}
        aria-selected={isSel}
      >
        {children ? (
          <button
            className={cn('h-5 w-5 flex items-center justify-center rounded shrink-0', isSel ? 'text-white/80 hover:bg-white/20' : 'text-gray-400 hover:bg-gray-200')}
            onClick={(e) => { e.stopPropagation(); toggle(k); }}
            aria-label={open ? 'Collapse' : 'Expand'}
            data-tree-toggle={k}
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className={cn('h-5 w-5 flex items-center justify-center shrink-0 text-[10px]', leaf ? (isSel ? 'text-white/70' : 'text-gray-300') : '')}>{leaf ? '·' : ''}</span>
        )}
        <span className="flex-1 min-w-0 truncate">{label}</span>
        <span className={cn('text-[11px] tabular-nums', isSel ? 'text-white/80' : 'text-gray-400')}>{n}</span>
      </div>
    );
  };

  const Days = ({ jobId, days }: { jobId: string; days: { date: string; n: number }[] }) => {
    const showAll = moreDays.has(jobId);
    const shown = showAll ? days : days.slice(0, DAYS_SHOWN);
    return (
      <>
        {shown.map((d) => (
          <Row key={d.date} k={`d:${jobId}:${d.date}`} depth={4} label={formatDate(d.date)} n={d.n} node={{ level: 'day', jobId, date: d.date, label: formatDate(d.date) }} leaf />
        ))}
        {!showAll && days.length > DAYS_SHOWN && (
          <button className="text-[12px] text-navy hover:underline py-[3px]" style={{ paddingLeft: 4 + 4 * 14 + 24 }} onClick={() => setMoreDays((s) => new Set(s).add(jobId))} data-tree-more={jobId}>
            {days.length - DAYS_SHOWN} more day{days.length - DAYS_SHOWN === 1 ? '' : 's'}…
          </button>
        )}
      </>
    );
  };

  return (
    <div className="text-sm" data-records-tree>
      <Row k="all" depth={0} label="All records" n={model.all} node={ALL_NODE} />
      {model.customers.map((c) => (
        <div key={c.id}>
          <Row k={`c:${c.id}`} depth={1} label={c.name} n={c.n} node={{ level: 'customer', customerId: c.id, label: c.name }} children />
          {!collapsed.has(`c:${c.id}`) && c.sites.map((s) => (
            <div key={s.id}>
              <Row k={`s:${s.id}`} depth={2} label={s.name} n={s.n} node={{ level: 'site', customerId: c.id, siteId: s.id, label: s.name }} children />
              {!collapsed.has(`s:${s.id}`) && s.jobs.map((j) => (
                <div key={j.id}>
                  <Row k={`j:${j.id}`} depth={3} label={j.name} n={j.n} node={{ level: 'job', customerId: c.id, siteId: s.id, jobId: j.id, label: j.name }} children={j.days.length > 0} />
                  {!collapsed.has(`j:${j.id}`) && <Days jobId={j.id} days={j.days} />}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
      {model.orphanJobs.length > 0 && (
        <div>
          <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mt-2 mb-1 pl-1">Jobs without a site</p>
          {model.orphanJobs.map((j) => (
            <div key={j.id}>
              <Row k={`j:${j.id}`} depth={1} label={j.name} n={j.n} node={{ level: 'job', jobId: j.id, label: j.name }} children={j.days.length > 0} />
              {!collapsed.has(`j:${j.id}`) && <Days jobId={j.id} days={j.days} />}
            </div>
          ))}
        </div>
      )}
      {model.noJob > 0 && (
        <div className="mt-2">
          <Row k="nojob" depth={0} label="Not tied to a job" n={model.noJob} node={{ level: 'nojob', label: 'Not tied to a job' }} />
        </div>
      )}
    </div>
  );
}

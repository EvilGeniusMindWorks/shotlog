// Move a job to another site (Round S11, Sep 13 2026). The door for the Beta
// tidy — Mark's first job was hung on a nameless ghost site — and useful on
// its own when a job was created in the wrong place. Any site, under any
// customer; the job's customer follows the site. Days and records stay on
// the job; copies already filed are frozen and keep their old wording.
import { useMemo, useState } from 'react';
import { ArrowRightLeft, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery, db } from '@/db';
import type { Job } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { showToast } from '@/components/ui/undo-toast';
import { nowISO } from '@/lib/utils';
import { cn } from '@/lib/utils';

export async function moveJobToSite(jobId: string, siteId: string): Promise<void> {
  const site = await db.sites.get(siteId);
  if (!site) throw new Error('That site no longer exists.');
  const customer = await db.customers.get(site.customerId);
  if (!customer) throw new Error('That site has no customer.');
  await db.jobs.update(jobId, {
    siteId: site.id,
    customerId: customer.id,
    // legacy mirrors follow the new site
    customer: customer.name,
    address: site.address,
    city: site.city,
    state: site.state,
    kFactor: site.kFactor,
    updatedAt: nowISO(),
  });
}

export function MoveJobButton({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-job-move>
        <ArrowRightLeft className="h-4 w-4 mr-1" /> Move to another site…
      </Button>
      {open && <MoveJobSheet job={job} onClose={() => setOpen(false)} />}
    </>
  );
}

function MoveJobSheet({ job, onClose }: { job: Job; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rows =
    useLiveQuery(async () => {
      const [sites, customers] = await Promise.all([db.sites.filter((s) => s.isActive).toArray(), db.customers.toArray()]);
      const cname = new Map(customers.map((c) => [c.id, c.name]));
      return sites
        .map((s) => ({ id: s.id, name: s.name, city: s.city, customer: cname.get(s.customerId) ?? '', customerId: s.customerId }))
        .sort((a, b) => a.customer.localeCompare(b.customer) || a.name.localeCompare(b.name));
    }) ?? [];
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => r.id !== job.siteId && (!needle || `${r.customer} ${r.name} ${r.city}`.toLowerCase().includes(needle)));
  }, [rows, q, job.siteId]);
  const target = rows.find((r) => r.id === picked);

  const move = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await moveJobToSite(job.id, picked);
      showToast(`Moved to ${target?.name ?? 'the site'}`);
      onClose();
      navigate(`/jobs/${job.id}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not move the job.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-xl p-4 max-h-[80vh] flex flex-col gap-3" onClick={(e) => e.stopPropagation()} data-job-move-sheet>
        <div className="flex items-center justify-between">
          <p className="font-bold">Move {job.name} to another site</p>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          Pick any site, under any customer — the job's customer follows the site. Days, records and drill plans stay on
          the job. A site or customer nothing uses any more can then be deleted from its own page.
        </p>
        <Input placeholder="Find a site or customer…" value={q} onChange={(e) => setQ(e.target.value)} data-job-move-search />
        <div className="overflow-auto space-y-1 min-h-0">
          {visible.map((r) => (
            <button
              key={r.id}
              className={cn('w-full flex flex-col items-start px-3 py-2 rounded-lg border text-left', picked === r.id ? 'border-navy bg-blue-50' : 'border-gray-200 hover:bg-gray-50')}
              onClick={() => setPicked(r.id)}
              data-job-move-site={r.id}
            >
              <span className="text-sm font-semibold">{r.name || <span className="text-gray-400 italic">(no name)</span>}{r.city ? <span className="font-normal text-gray-500"> · {r.city}</span> : null}</span>
              <span className="text-xs text-gray-400">{r.customer || <span className="italic">(customer with no name)</span>}</span>
            </button>
          ))}
          {visible.length === 0 && <p className="text-sm text-gray-400 py-2">No other site matches.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!picked || busy} onClick={() => void move()} data-job-move-confirm>
            {busy ? 'Moving…' : target ? `Move to ${target.name || 'that site'}` : 'Move'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// One site: the PLACE. Owns the ground facts every job here inherits —
// address, state (license auto-pick + regs), Site K + calibration history,
// local PPV bylaws — plus the list of jobs run at this site.
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { useDraftRecord } from '@/hooks/useDraftRecord';
import { formatDate } from '@/lib/utils';
import type { Site } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SitePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const site = useLiveQuery(() => (id ? db.sites.get(id) : undefined), [id]);
  const customer = useLiveQuery(
    () => (site?.customerId ? db.customers.get(site.customerId) : undefined),
    [site?.customerId],
  );
  const jobs =
    useLiveQuery(
      async () =>
        id
          ? (await db.jobs.filter((j) => j.siteId === id).toArray()).sort((a, b) =>
              b.updatedAt.localeCompare(a.updatedAt),
            )
          : [],
      [id],
    ) ?? [];

  if (!site) return <div className="p-4 text-center text-gray-500">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(customer ? `/customers/${customer.id}` : '/jobs')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg truncate">{site.name}</h2>
          <p className="text-sm text-gray-500 truncate">
            {customer ? (
              <button className="underline" onClick={() => navigate(`/customers/${customer.id}`)}>
                {customer.name}
              </button>
            ) : (
              '—'
            )}{' '}
            · Site K {site.kFactor}
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <SiteConfigCard site={site} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jobs at this site</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.map((j) => (
              <button
                key={j.id}
                className="w-full flex items-center justify-between border border-gray-200 rounded-lg p-3 text-left hover:bg-gray-50 min-h-[44px]"
                onClick={() => navigate(`/jobs/${j.id}`)}
              >
                <span className="text-sm font-medium truncate">{j.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{formatDate(j.createdAt.slice(0, 10))}</span>
                  <Badge variant={j.isActive ? 'compliant' : 'draft'}>
                    {j.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </span>
              </button>
            ))}
            {jobs.length === 0 && <p className="text-sm text-gray-400">No jobs at this site yet.</p>}
          </CardContent>
        </Card>

        <p className="text-xs text-gray-400 px-1">
          Site K calibration (from measured seismo readings) lives on each job's page — applying
          a calibrated K there updates THIS site, so every job here inherits it.
        </p>
      </div>
    </div>
  );
}

function SiteConfigCard({ site }: { site: Site }) {
  const { draft, setField } = useDraftRecord(db.sites, site);
  const readOnly = getSessionUser()?.role !== 'admin';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Site facts
          {readOnly && (
            <span className="ml-2 text-xs font-normal text-gray-400">read-only</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent
        className={
          readOnly
            ? 'pointer-events-none select-none opacity-70 grid grid-cols-1 sm:grid-cols-2 gap-3'
            : 'grid grid-cols-1 sm:grid-cols-2 gap-3'
        }
      >
        <div className="sm:col-span-2">
          <Label className="text-xs">Site name</Label>
          <Input value={draft.name} onChange={(e) => setField('name', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Address</Label>
          <Input value={draft.address} onChange={(e) => setField('address', e.target.value)} />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-xs">City</Label>
            <Input value={draft.city} onChange={(e) => setField('city', e.target.value)} />
          </div>
          <div className="w-16">
            <Label className="text-xs">State</Label>
            <Input
              value={draft.state}
              maxLength={2}
              onChange={(e) => setField('state', e.target.value.toUpperCase().slice(0, 2))}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">
            Site K
            <span className="text-gray-400 font-normal"> — new shots at this site inherit it</span>
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            value={draft.kFactor || ''}
            onChange={(e) => setField('kFactor', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <Label className="text-xs">GPS</Label>
          <Input value={draft.gps ?? ''} onChange={(e) => setField('gps', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">
            Local Regulation
            <span className="text-gray-400 font-normal"> — e.g. Whately Bylaw</span>
          </Label>
          <Input
            value={draft.localRegName ?? ''}
            onChange={(e) => setField('localRegName', e.target.value)}
            placeholder="None"
          />
        </div>
        <div>
          <Label className="text-xs">Local PPV Limit (in/s)</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={draft.localPPVLimit || ''}
            onChange={(e) => setField('localPPVLimit', parseFloat(e.target.value) || 0)}
            placeholder="—"
          />
        </div>
      </CardContent>
    </Card>
  );
}

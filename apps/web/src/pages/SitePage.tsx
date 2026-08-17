// One site, on the adaptive record shell: the PLACE. Ground facts every job
// here inherits (address, state, Site K, rock), jurisdiction & permits with
// expiry countdowns, access & safety notes, the offline contact sheet, and
// the jobs run at this site.
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { useDraftRecord } from '@/hooks/useDraftRecord';
import { formatDate, generateId, nowISO } from '@/lib/utils';
import type { Job, NearbyStructure, Site, SitePermit } from '@/db/schema';
import { JobContactsCard } from '@/components/forms/JobContactsCard';
import { RecordShell } from '@/components/layout/RecordShell';
import { daysUntil, ExpiryPill } from '@/pages/CustomerPage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SitePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isAdmin = getSessionUser()?.role === 'admin';
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

  const permits = site.permits ?? [];
  const permitDays = permits
    .map((p) => daysUntil(p.expiresAt))
    .filter((d): d is number => d !== undefined);
  const soonest = permitDays.length ? Math.min(...permitDays) : undefined;
  const contacts = site.contacts ?? [];

  return (
    <RecordShell
      breadcrumb={[
        { label: 'Jobs', to: '/jobs' },
        ...(customer
          ? [
              { label: 'Customers', to: '/jobs?lens=customers' },
              { label: customer.name, to: `/customers/${customer.id}` },
            ]
          : [{ label: 'Sites', to: '/jobs?lens=sites' }]),
      ]}
      title={site.name}
      badge={
        <Badge variant={site.isActive ? 'compliant' : 'draft'}>
          {site.isActive ? 'Active' : 'Inactive'}
        </Badge>
      }
      subline={[customer?.name, [site.city, site.state].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(' · ')}
      stats={[
        { label: 'Site K', value: String(site.kFactor) },
        { label: 'Jobs', value: String(jobs.length) },
        {
          label: 'Permits',
          value:
            permits.length === 0
              ? '—'
              : soonest === undefined
                ? String(permits.length)
                : soonest < 0
                  ? 'EXP'
                  : `${soonest}d`,
        },
        { label: 'State', value: site.state || '—' },
      ]}
      sections={[
        {
          id: 'ground',
          label: 'Ground',
          summary: [site.address, site.rockType, `K ${site.kFactor}`].filter(Boolean).join(' · '),
          render: () => <GroundCard site={site} readOnly={!isAdmin} />,
        },
        {
          id: 'jurisdiction',
          label: 'Jurisdiction & permits',
          count: permits.length || undefined,
          summary:
            [
              site.jurisdiction,
              site.localRegName,
              soonest !== undefined ? `next expiry ${soonest < 0 ? 'PAST' : `${soonest}d`}` : undefined,
            ]
              .filter(Boolean)
              .join(' · ') || '—',
          render: () => <JurisdictionCard site={site} readOnly={!isAdmin} />,
        },
        {
          id: 'access',
          label: 'Access & safety',
          summary:
            [site.accessNotes, site.standingHazards].filter(Boolean).join(' · ').slice(0, 60) || '—',
          defaultOpen: false,
          render: () => <AccessCard site={site} readOnly={!isAdmin} />,
        },
        {
          id: 'contacts',
          label: 'Contacts',
          count: contacts.length || undefined,
          summary: contacts[0] ? `${contacts[0].name}${contacts[0].phone ? ` · ${contacts[0].phone}` : ''}` : 'none yet',
          render: () => (
            <JobContactsCard
              job={{ id: site.id, contacts, contactNotes: site.contactNotes } as unknown as Job}
              siteId={site.id}
              readOnly={!isAdmin}
            />
          ),
        },
        {
          id: 'jobs',
          label: 'Jobs at this site',
          count: jobs.length,
          summary: `${jobs.filter((j) => (j.jobStatus ? j.jobStatus === 'active' : j.isActive)).length} open`,
          render: () => (
            <div className="space-y-2">
              {jobs.map((j) => (
                <button
                  key={j.id}
                  className="w-full flex items-center justify-between border border-gray-200 rounded-lg p-3 text-left hover:bg-gray-50 min-h-[44px]"
                  onClick={() => navigate(`/jobs/${j.id}`)}
                >
                  <span className="text-sm font-medium truncate">
                    {j.jobNumber ? `${j.jobNumber} · ` : ''}
                    {j.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{formatDate(j.createdAt.slice(0, 10))}</span>
                    <Badge variant={j.isActive ? 'compliant' : 'draft'}>
                      {j.jobStatus ?? (j.isActive ? 'active' : 'inactive')}
                    </Badge>
                  </span>
                </button>
              ))}
              {jobs.length === 0 && (
                <p className="text-sm text-gray-400">No jobs at this site yet.</p>
              )}
              <p className="text-xs text-gray-400">
                Site K calibration (from measured seismo readings) lives on each job's page —
                applying a calibrated K there updates THIS site, so every job here inherits it.
              </p>
            </div>
          ),
        },
      ]}
    />
  );
}

const gridCls = (readOnly: boolean) =>
  readOnly
    ? 'pointer-events-none select-none opacity-70 grid grid-cols-1 sm:grid-cols-2 gap-3'
    : 'grid grid-cols-1 sm:grid-cols-2 gap-3';

function GroundCard({ site, readOnly }: { site: Site; readOnly: boolean }) {
  const { draft, setField } = useDraftRecord(db.sites, site);
  return (
    <div className={gridCls(readOnly)}>
      <div className="sm:col-span-2">
        <Label className="text-xs">Site name</Label>
        <Input value={draft.name} onChange={(e) => setField('name', e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Street</Label>
        <Input value={draft.address} onChange={(e) => setField('address', e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Street 2</Label>
        <Input
          value={draft.street2 ?? ''}
          placeholder="Lot, parcel…"
          onChange={(e) => setField('street2', e.target.value)}
        />
      </div>
      <div>
        <Label className="text-xs">City</Label>
        <Input value={draft.city} onChange={(e) => setField('city', e.target.value)} />
      </div>
      <div className="flex gap-2">
        <div className="w-16">
          <Label className="text-xs">State</Label>
          <Input
            value={draft.state}
            maxLength={2}
            onChange={(e) => setField('state', e.target.value.toUpperCase().slice(0, 2))}
          />
        </div>
        <div className="flex-1">
          <Label className="text-xs">Zip</Label>
          <Input
            value={draft.zip ?? ''}
            inputMode="numeric"
            maxLength={10}
            onChange={(e) => setField('zip', e.target.value)}
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">GPS</Label>
        <Input value={draft.gps ?? ''} onChange={(e) => setField('gps', e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">
          Site K<span className="text-gray-400 font-normal"> — new shots inherit it</span>
        </Label>
        <Input
          type="number"
          inputMode="decimal"
          value={draft.kFactor || ''}
          onChange={(e) => setField('kFactor', parseFloat(e.target.value) || 0)}
        />
      </div>
      <div>
        <Label className="text-xs">Rock type</Label>
        <Input value={draft.rockType ?? ''} onChange={(e) => setField('rockType', e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Overburden</Label>
        <Input
          value={draft.overburden ?? ''}
          onChange={(e) => setField('overburden', e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <Label className="text-xs">Water conditions</Label>
        <Input
          value={draft.waterConditions ?? ''}
          placeholder="Wet holes below 12 ft…"
          onChange={(e) => setField('waterConditions', e.target.value)}
        />
      </div>
    </div>
  );
}

function JurisdictionCard({ site, readOnly }: { site: Site; readOnly: boolean }) {
  const { draft, setField } = useDraftRecord(db.sites, site);
  const permits = site.permits ?? [];
  const write = (next: SitePermit[]) =>
    void db.sites.update(site.id, { permits: next, updatedAt: nowISO() });
  const patch = (pid: string, p: Partial<SitePermit>) =>
    write(permits.map((x) => (x.id === pid ? { ...x, ...p } : x)));
  return (
    <div className="space-y-3">
      <div className={gridCls(readOnly)}>
        <div>
          <Label className="text-xs">
            Jurisdiction<span className="text-gray-400 font-normal"> — who issues permits</span>
          </Label>
          <Input
            value={draft.jurisdiction ?? ''}
            placeholder="Town of Whately FD"
            onChange={(e) => setField('jurisdiction', e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">
            Local Regulation<span className="text-gray-400 font-normal"> — e.g. Whately Bylaw</span>
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
        <div>
          <Label className="text-xs">Notification rules</Label>
          <Input
            value={draft.notificationRules ?? ''}
            placeholder="FD 24 h notice · abutters 500 ft"
            onChange={(e) => setField('notificationRules', e.target.value)}
          />
        </div>
      </div>

      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-1">
        Permits on site
      </p>
      {permits.map((p) => (
        <div
          key={p.id}
          className={
            readOnly
              ? 'pointer-events-none opacity-70 rounded-lg border border-gray-200 p-3'
              : 'rounded-lg border border-gray-200 p-3'
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Permit</Label>
              <Input
                value={p.name}
                placeholder="Blasting permit"
                onChange={(e) => patch(p.id, { name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Number</Label>
              <Input value={p.number} onChange={(e) => patch(p.id, { number: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Issuing authority</Label>
              <Input
                value={p.authority ?? ''}
                onChange={(e) => patch(p.id, { authority: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">
                Expires <ExpiryPill date={p.expiresAt} />
              </Label>
              <Input
                type="date"
                value={p.expiresAt ?? ''}
                onChange={(e) => patch(p.id, { expiresAt: e.target.value || undefined })}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <Input value={p.notes ?? ''} onChange={(e) => patch(p.id, { notes: e.target.value })} />
            </div>
          </div>
          {!readOnly && (
            <div className="flex justify-end mt-2">
              <Button size="sm" variant="ghost" onClick={() => write(permits.filter((x) => x.id !== p.id))}>
                <Trash2 className="h-4 w-4 text-gray-400" />
              </Button>
            </div>
          )}
        </div>
      ))}
      {permits.length === 0 && <p className="text-sm text-gray-400">No permits recorded.</p>}
      {!readOnly && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => write([...permits, { id: generateId(), name: '', number: '' }])}
        >
          <Plus className="h-4 w-4 mr-1" /> Add permit
        </Button>
      )}
    </div>
  );
}

function AccessCard({ site, readOnly }: { site: Site; readOnly: boolean }) {
  const { draft, setField } = useDraftRecord(db.sites, site);
  const structures = site.nearbyStructures ?? [];
  const write = (next: NearbyStructure[]) =>
    void db.sites.update(site.id, { nearbyStructures: next, updatedAt: nowISO() });
  const patch = (sid: string, p: Partial<NearbyStructure>) =>
    write(structures.map((x) => (x.id === sid ? { ...x, ...p } : x)));
  return (
    <div className="space-y-3">
      <div className={gridCls(readOnly)}>
        <div className="sm:col-span-2">
          <Label className="text-xs">Access notes</Label>
          <Input
            value={draft.accessNotes ?? ''}
            placeholder="Gate code, haul road, where to stage…"
            onChange={(e) => setField('accessNotes', e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Parcel owner</Label>
          <Input
            value={draft.parcelOwner ?? ''}
            placeholder="if different from customer"
            onChange={(e) => setField('parcelOwner', e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Utility notes</Label>
          <Input
            value={draft.utilityNotes ?? ''}
            placeholder="Gas main on north side, dig-safe #…"
            onChange={(e) => setField('utilityNotes', e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">Standing hazards</Label>
          <Input
            value={draft.standingHazards ?? ''}
            placeholder="Site-wide hazards every crew should know"
            onChange={(e) => setField('standingHazards', e.target.value)}
          />
        </div>
      </div>

      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-1">
        Nearest structures
      </p>
      {structures.map((s) => (
        <div
          key={s.id}
          className={
            readOnly
              ? 'pointer-events-none opacity-70 rounded-lg border border-gray-200 p-3'
              : 'rounded-lg border border-gray-200 p-3'
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Structure</Label>
              <Input
                value={s.label}
                placeholder="House, well, gas main…"
                onChange={(e) => patch(s.id, { label: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">Distance (ft)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={s.distanceFt || ''}
                  onChange={(e) => patch(s.id, { distanceFt: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Direction</Label>
                <Input
                  value={s.direction ?? ''}
                  placeholder="NE"
                  onChange={(e) => patch(s.id, { direction: e.target.value })}
                />
              </div>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <Input value={s.notes ?? ''} onChange={(e) => patch(s.id, { notes: e.target.value })} />
            </div>
          </div>
          {!readOnly && (
            <div className="flex justify-end mt-2">
              <Button size="sm" variant="ghost" onClick={() => write(structures.filter((x) => x.id !== s.id))}>
                <Trash2 className="h-4 w-4 text-gray-400" />
              </Button>
            </div>
          )}
        </div>
      ))}
      {structures.length === 0 && (
        <p className="text-sm text-gray-400">
          None recorded — each shot's design still records its own closest structure.
        </p>
      )}
      {!readOnly && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => write([...structures, { id: generateId(), label: '' }])}
        >
          <Plus className="h-4 w-4 mr-1" /> Add structure
        </Button>
      )}
    </div>
  );
}

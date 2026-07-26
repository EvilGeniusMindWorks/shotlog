// Incident report — filed in the field (works offline), processed by the
// office. Type-specific sections mirror the paper forms; a blasting
// incident created from a work day arrives pre-linked to the day, shot,
// and seismo reading with PPV/dB pulled in automatically.
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { canPerformOp, type Role } from '@shotlog/shared';
import { useLiveQuery, db } from '@/db';
import { useDraftRecord } from '@/hooks/useDraftRecord';
import { getSessionUser } from '@/lib/session';
import { nowISO } from '@/lib/utils';
import type { Incident } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ChipSelect } from '@/components/ui/chip-select';

const TYPE_LABEL = { blasting: 'Blasting Incident', utility: 'Utility Strike', asset: 'Asset Incident' };
const STATUS_BADGE = { open: 'draft', office_review: 'submitted', closed: 'approved' } as const;

export function IncidentPage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const navigate = useNavigate();
  const role = (getSessionUser()?.role ?? 'blaster') as Role;
  const incident = useLiveQuery(
    () => (incidentId ? db.incidents.get(incidentId) : undefined),
    [incidentId],
  );
  if (!incident) return <div className="p-4 text-center text-gray-500">Loading…</div>;
  return <IncidentForm incident={incident} role={role} onBack={() => navigate(-1)} />;
}

function IncidentForm({
  incident,
  role,
  onBack,
}: {
  incident: Incident;
  role: Role;
  onBack: () => void;
}) {
  const { draft, setField } = useDraftRecord(db.incidents, incident);
  const job = useLiveQuery(() => (draft.jobId ? db.jobs.get(draft.jobId) : undefined), [draft.jobId]);
  const canClaim = role === 'office' || role === 'admin';
  const set = (field: keyof Incident, value: unknown) => setField(field, value as never);

  return (
    <div>
      <div className="bg-navy text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200 hover:text-white hover:bg-white/10"
            onClick={onBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg truncate leading-tight">{TYPE_LABEL[draft.type]}</h2>
            <p className="text-xs text-navy-200 truncate">
              {job?.name ?? 'No job linked'} · {draft.date} · reported by {draft.reportedByName}
            </p>
          </div>
          <Badge variant={STATUS_BADGE[draft.status]}>{draft.status.replace('_', ' ')}</Badge>
          {draft.status === 'open' && (
            <Button size="sm" variant="secondary"
              onClick={() => void db.incidents.update(draft.id, { status: 'office_review', updatedAt: nowISO() })}>
              Send to Office
            </Button>
          )}
          {draft.status === 'office_review' && canClaim && (
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => void db.incidents.update(draft.id, { status: 'closed', updatedAt: nowISO() })}>
              Close
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 grid gap-3 sm:grid-cols-2">
          <div><Label className="text-xs">Date</Label>
            <Input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} /></div>
          <div><Label className="text-xs">Time</Label>
            <Input value={draft.time} placeholder="e.g. 1:25 PM" onChange={(e) => set('time', e.target.value)} /></div>
          <div className="sm:col-span-2">
            <Label className="text-xs">What happened</Label>
            <textarea className="w-full h-24 rounded-lg border border-gray-300 p-2 text-sm"
              value={draft.description} onChange={(e) => set('description', e.target.value)} />
          </div>
        </div>

        {draft.type === 'blasting' && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 grid gap-3 sm:grid-cols-2">
            <p className="sm:col-span-2 text-sm font-semibold">Structure & owner</p>
            <div><Label className="text-xs">Structure type</Label>
              <Input value={draft.structureType ?? ''} onChange={(e) => set('structureType', e.target.value)} /></div>
            <div><Label className="text-xs">Structure address</Label>
              <Input value={draft.structureAddress ?? ''} onChange={(e) => set('structureAddress', e.target.value)} /></div>
            <div><Label className="text-xs">Owner name</Label>
              <Input value={draft.ownerName ?? ''} onChange={(e) => set('ownerName', e.target.value)} /></div>
            <div><Label className="text-xs">Owner phone</Label>
              <Input inputMode="tel" value={draft.ownerPhone ?? ''} onChange={(e) => set('ownerPhone', e.target.value)} /></div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Pre-blast survey</Label>
              <ChipSelect value={draft.preBlastSurvey ?? 'none'}
                onChange={(v) => set('preBlastSurvey', v)}
                options={[
                  { value: 'completed', label: 'Completed' },
                  { value: 'refused', label: 'Refused' },
                  { value: 'none', label: 'None' },
                ]} />
            </div>
            <div><Label className="text-xs">PPV (from linked seismo)</Label>
              <Input type="number" value={draft.ppv ?? ''} onChange={(e) => set('ppv', e.target.value ? parseFloat(e.target.value) : null)} /></div>
            <div><Label className="text-xs">dB</Label>
              <Input type="number" value={draft.db ?? ''} onChange={(e) => set('db', e.target.value ? parseFloat(e.target.value) : null)} /></div>
            {draft.blastDayId && (
              <p className="sm:col-span-2 text-xs text-gray-400">
                Linked to the blast day{draft.shotId ? ' + shot' : ''}
                {draft.seismoReadingId ? ' + seismograph event' : ''} it was filed from —
                the office sees the full records.
              </p>
            )}
          </div>
        )}

        {draft.type === 'asset' && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 grid gap-3 sm:grid-cols-2">
            <p className="sm:col-span-2 text-sm font-semibold">Asset details</p>
            <div className="sm:col-span-2">
              <Label className="text-xs">Kind</Label>
              <ChipSelect value={draft.assetIncidentKind ?? 'equipment_accident'}
                onChange={(v) => set('assetIncidentKind', v)}
                options={[
                  { value: 'equipment_accident', label: 'Equipment Accident' },
                  { value: 'auto_accident', label: 'Auto Accident' },
                  { value: 'theft', label: 'Theft' },
                  { value: 'vandalism', label: 'Vandalism' },
                  { value: 'other', label: 'Other' },
                ]} />
            </div>
            <div><Label className="text-xs">Other party (driver/owner, plate…)</Label>
              <Input value={draft.otherParty ?? ''} onChange={(e) => set('otherParty', e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm self-end pb-2 cursor-pointer">
              <input type="checkbox" checked={draft.policeCalled ?? false}
                onChange={(e) => set('policeCalled', e.target.checked)} />
              Police called
            </label>
          </div>
        )}

        {draft.type === 'utility' && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 grid gap-3 sm:grid-cols-2">
            <p className="sm:col-span-2 text-sm font-semibold">Utility details</p>
            <div><Label className="text-xs">Provider</Label>
              <Input value={draft.utilityProvider ?? ''} onChange={(e) => set('utilityProvider', e.target.value)} /></div>
            <div><Label className="text-xs">Digsafe #</Label>
              <Input value={draft.digsafeNumber ?? ''} onChange={(e) => set('digsafeNumber', e.target.value)} /></div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={draft.utilityKind ?? 'underground_wire'}
                onChange={(e) => set('utilityKind', e.target.value)}
                options={[
                  { value: 'underground_wire', label: 'Underground Wire' },
                  { value: 'overhead_wire', label: 'Overhead Wire' },
                  { value: 'pipe', label: 'Pipe' },
                  { value: 'other', label: 'Other' },
                ]} />
            </div>
            <div>
              <Label className="text-xs">Markings</Label>
              <Select value={draft.utilityMarked ?? 'marked'}
                onChange={(e) => set('utilityMarked', e.target.value)}
                options={[
                  { value: 'marked', label: 'Marked' },
                  { value: 'mismarked', label: 'Mis-marked' },
                  { value: 'unmarked', label: 'Not marked' },
                ]} />
            </div>
          </div>
        )}

        {canClaim && canPerformOp('incidents', 'PATCH', role) && (
          <div className="rounded-xl border-2 border-navy-200 bg-white p-4 grid gap-3 sm:grid-cols-2">
            <p className="sm:col-span-2 text-sm font-semibold">Office use — claim</p>
            <div>
              <Label className="text-xs">Claim status</Label>
              <ChipSelect value={draft.claimStatus ?? 'pending'}
                onChange={(v) => set('claimStatus', v)}
                options={[
                  { value: 'pending', label: 'Pending' },
                  { value: 'accepted', label: 'Accepted' },
                  { value: 'denied', label: 'Denied' },
                ]} />
            </div>
            <div><Label className="text-xs">Claim amount ($)</Label>
              <Input type="number" value={draft.claimAmount ?? ''}
                onChange={(e) => set('claimAmount', e.target.value ? parseFloat(e.target.value) : null)} /></div>
            <div><Label className="text-xs">Insurance submitted</Label>
              <Input type="date" value={draft.insuranceSubmittedAt ?? ''}
                onChange={(e) => set('insuranceSubmittedAt', e.target.value)} /></div>
            <div><Label className="text-xs">Response sent</Label>
              <Input type="date" value={draft.responseSentAt ?? ''}
                onChange={(e) => set('responseSentAt', e.target.value)} /></div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Office notes</Label>
              <textarea className="w-full h-16 rounded-lg border border-gray-300 p-2 text-sm"
                value={draft.officeNotes ?? ''} onChange={(e) => set('officeNotes', e.target.value)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

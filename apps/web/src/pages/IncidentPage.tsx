// Incident report — filed in the field (works offline), processed by the
// office. Type-specific sections mirror the paper forms; a blasting
// incident created from a work day arrives pre-linked to the day, shot,
// and seismo reading with PPV/dB pulled in automatically.
import { useNavigate, useParams } from 'react-router-dom';
import { useBack } from '@/lib/nav';
import { BackButton } from '@/components/layout/ScreenHeader';
import { type Role } from '@shotlog/shared';
import { can } from '@/lib/perms';
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
import { DoNowStrip } from '@/components/incident/DoNowStrip';
import { INCIDENT_LABEL as TYPE_LABEL } from '@/lib/incidentDoNow';
const STATUS_BADGE = { open: 'draft', office_review: 'submitted', closed: 'approved' } as const;

export function IncidentPage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const navigate = useNavigate();
  const role = (getSessionUser()?.role ?? 'blaster') as Role;
  const incident = useLiveQuery(
    () => (incidentId ? db.incidents.get(incidentId) : undefined),
    [incidentId],
  );
  // the navigation round: an incident of a work day goes up to the day
  const back = useBack(incident?.blastDayId ? { to: `/blast-day/${incident.blastDayId}`, label: 'Work day' } : { to: '/', label: 'Dashboard' }, 'Incident');
  if (!incident) return <div className="p-4 text-center text-gray-500">Loading…</div>;
  return <IncidentForm incident={incident} role={role} onBack={() => (back ? back.go() : navigate('/'))} backLabel={back?.label ?? 'Dashboard'} />;
}

function IncidentForm({
  incident,
  role,
  onBack,
  backLabel,
}: {
  incident: Incident;
  role: Role;
  onBack: () => void;
  /** the navigation round: the arrow says where it goes */
  backLabel?: string;
}) {
  const navigate = useNavigate();
  const { draft, setField } = useDraftRecord(db.incidents, incident);
  const job = useLiveQuery(() => (draft.jobId ? db.jobs.get(draft.jobId) : undefined), [draft.jobId]);
  const canClaim = role === 'office' || role === 'admin';
  const set = (field: keyof Incident, value: unknown) => setField(field, value as never);

  return (
    <div>
      <div className="bg-navy text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <BackButton back={{ label: backLabel ?? 'Back', go: onBack }} />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg truncate leading-tight">{TYPE_LABEL[draft.type]}</h2>
            <p className="text-xs text-navy-200 truncate">
              {job?.name ?? 'No job linked'} · {draft.date} · reported by {draft.reportedByName}
            </p>
          </div>
          <Badge variant={STATUS_BADGE[draft.status]}>{draft.status.replace('_', ' ')}</Badge>
          {draft.status === 'open' && (
            <Button size="sm" variant="secondary"
              onClick={() => navigate(`/incident/${draft.id}/submit`)}>
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
        {/* S20 (Matthew): the Do now list first — who to call, from the job's sheet, each tap logged with its time */}
        <DoNowStrip incident={incident} readOnly={draft.status !== 'open'} />
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

        {draft.type === 'injury' && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 grid gap-3 sm:grid-cols-2" data-incident-injury>
            <p className="sm:col-span-2 text-sm font-semibold">Who was hurt</p>
            <div><Label className="text-xs">Name</Label>
              <Input value={draft.injuredName ?? ''} onChange={(e) => set('injuredName', e.target.value)} data-injury-name /></div>
            <div><Label className="text-xs">Job title</Label>
              <Input value={draft.injuredJobTitle ?? ''} onChange={(e) => set('injuredJobTitle', e.target.value)} /></div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Employer</Label>
              <ChipSelect value={draft.injuredEmployer ?? 'company'} onChange={(v) => set('injuredEmployer', v)}
                options={[{ value: 'company', label: 'Ours' }, { value: 'subcontractor', label: 'Subcontractor' }, { value: 'other', label: 'Other' }]} />
            </div>
            <p className="sm:col-span-2 text-sm font-semibold">What happened</p>
            <div><Label className="text-xs">Where on the site</Label>
              <Input value={draft.whereOnSite ?? ''} onChange={(e) => set('whereOnSite', e.target.value)} /></div>
            <div><Label className="text-xs">What they were doing</Label>
              <Input value={draft.activity ?? ''} onChange={(e) => set('activity', e.target.value)} /></div>
            <div><Label className="text-xs">Injury and body part</Label>
              <Input value={draft.injuryBodyPart ?? ''} onChange={(e) => set('injuryBodyPart', e.target.value)} data-injury-body-part /></div>
            <div><Label className="text-xs">What caused it (object, substance, fall…)</Label>
              <Input value={draft.injuryCause ?? ''} onChange={(e) => set('injuryCause', e.target.value)} /></div>
            <p className="sm:col-span-2 text-sm font-semibold">Treatment</p>
            <div className="sm:col-span-2">
              <ChipSelect value={draft.treatment ?? 'none'} onChange={(v) => set('treatment', v)}
                options={[{ value: 'none', label: 'None' }, { value: 'first_aid', label: 'First aid' }, { value: 'urgent_care', label: 'Urgent care' }, { value: 'hospital', label: 'Hospital' }]} />
            </div>
            <div><Label className="text-xs">Facility</Label>
              <Input value={draft.treatmentFacility ?? ''} onChange={(e) => set('treatmentFacility', e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm self-end pb-2 cursor-pointer">
              <input type="checkbox" checked={draft.ambulance ?? false} onChange={(e) => set('ambulance', e.target.checked)} />
              Taken by ambulance
            </label>
            <div><Label className="text-xs">Witnesses</Label>
              <Input value={draft.witnesses ?? ''} onChange={(e) => set('witnesses', e.target.value)} /></div>
            <div><Label className="text-xs">Supervisor</Label>
              <Input value={draft.supervisorName ?? ''} onChange={(e) => set('supervisorName', e.target.value)} /></div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Lost time?</Label>
              <ChipSelect value={draft.lostTime ?? 'unknown'} onChange={(v) => set('lostTime', v)}
                options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }, { value: 'unknown', label: 'Not known yet' }]} />
            </div>
          </div>
        )}

        {draft.type === 'near_miss' && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 grid gap-3 sm:grid-cols-2" data-incident-near-miss>
            <p className="sm:col-span-2 text-sm font-semibold">Near miss</p>
            <div className="sm:col-span-2"><Label className="text-xs">What stopped it</Label>
              <Input value={draft.whatStoppedIt ?? ''} onChange={(e) => set('whatStoppedIt', e.target.value)} /></div>
            <div><Label className="text-xs">The hazard</Label>
              <Input value={draft.hazard ?? ''} onChange={(e) => set('hazard', e.target.value)} /></div>
            <div><Label className="text-xs">Who was told</Label>
              <Input value={draft.whoWasTold ?? ''} onChange={(e) => set('whoWasTold', e.target.value)} /></div>
            <div className="sm:col-span-2"><Label className="text-xs">What should change</Label>
              <Input value={draft.correctiveAction ?? ''} onChange={(e) => set('correctiveAction', e.target.value)} /></div>
          </div>
        )}

        {canClaim && can('incidents', 'PATCH') && (
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

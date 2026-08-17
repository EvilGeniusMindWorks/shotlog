import { useState } from 'react';
import { type Role } from '@shotlog/shared';
import { can } from '@/lib/perms';
import { useLiveQuery, db } from '@/db';
import { getJobViews } from '@/lib/jobContext';
import { CustomerSitePicker, emptyPick, pickReady, type CustomerSitePick } from '@/components/forms/CustomerSitePicker';
import { getSessionUser } from '@/lib/session';
import { createJob, type CopyFromPrevious, type CreateWorkDayOptions } from '@/hooks/useBlastDay';
import type { WorkType } from '@/db/schema';
import { isBlastingWork } from '@/db/schema';
import { ChipSelect } from '@/components/ui/chip-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { todayISO } from '@/lib/utils';
import { Plus, X } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreate: (
    jobId: string,
    date: string,
    copy?: CopyFromPrevious,
    opts?: CreateWorkDayOptions,
  ) => void;
  /** Initial type-of-work chip (drillers default to drill_only) */
  defaultTypeOfWork?: WorkType;
}

const WORK_TYPE_CHOICES = [
  { value: 'drill_to_blast', label: 'Drill to Blast' },
  { value: 'blasting', label: 'Blasting' },
  { value: 'drill_only', label: 'Drill Only' },
  { value: 'drill_to_excavate', label: 'Drill to Excavate' },
  { value: 'crushing', label: 'Crushing' },
  { value: 'hauling', label: 'Hauling' },
];

const COPY_SECTIONS = [
  { key: 'blastInfo', label: 'Blast Info' },
  { key: 'drillParams', label: 'Drill Params' },
  { key: 'designPlan', label: 'Design Plan' },
  { key: 'explosives', label: 'Explosives' },
  { key: 'crewEquipment', label: 'Crew & Equipment' },
] as const;

const OPERATION_OPTIONS = [
  { value: 'construction', label: 'Construction' },
  { value: 'quarry', label: 'Quarry' },
  { value: 'trench', label: 'Trench' },
  { value: 'open', label: 'Open' },
];

export function NewBlastDayDialog({ onClose, onCreate, defaultTypeOfWork }: Props) {
  // NOTE: boolean fields can't be indexed in IndexedDB — use filter(), not where()
  const jobs = useLiveQuery(async () => getJobViews(await db.jobs.filter((j) => j.isActive).toArray())) ?? [];
  // Jobs are admin-managed reference data — for field roles the server would
  // silently discard the write, so don't offer the inline create at all
  const canCreateJob = can('jobs', 'PUT');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [typeOfWork, setTypeOfWork] = useState<WorkType>(defaultTypeOfWork ?? 'drill_to_blast');
  const [dayName, setDayName] = useState('');
  const [showNewJob, setShowNewJob] = useState(false);
  const [newJob, setNewJob] = useState({
    name: '', operation: 'construction' as const, typeOfRock: '', typeOfTerrain: '',
  });
  const [pick, setPick] = useState<CustomerSitePick>(emptyPick());

  // Copy from Previous: offered when the selected job has existing blast days
  const previousDays =
    useLiveQuery(async () => {
      if (!selectedJobId) return [];
      const days = await db.blastDays.where('jobId').equals(selectedJobId).sortBy('date');
      return days.reverse();
    }, [selectedJobId]) ?? [];
  const [copySourceId, setCopySourceId] = useState(''); // '' = start blank
  // Two offline devices can both create "today's day" — warn, don't block
  // (split shifts on one date are legitimate)
  const sameDateExists = previousDays.some((d) => d.date === date);
  const [copySections, setCopySections] = useState<Record<string, boolean>>({
    blastInfo: true, drillParams: true, designPlan: true, explosives: true, crewEquipment: true,
  });

  const handleCreate = async () => {
    let jobId = selectedJobId;
    if (showNewJob) {
      jobId = await createJob({
        name: newJob.name,
        operation: newJob.operation,
        typeOfRock: newJob.typeOfRock,
        typeOfTerrain: newJob.typeOfTerrain,
        customerId: pick.customerId,
        siteId: pick.siteId,
        customer: pick.customerName,
        address: pick.address,
        city: pick.city,
        state: pick.state,
        kFactor: pick.kFactor,
      });
    }
    if (!jobId) return;
    const copy: CopyFromPrevious | undefined =
      !showNewJob && copySourceId
        ? {
            sourceBlastDayId: copySourceId,
            blastInfo: copySections.blastInfo,
            drillParams: copySections.drillParams,
            designPlan: copySections.designPlan,
            explosives: copySections.explosives,
            crewEquipment: copySections.crewEquipment,
          }
        : undefined;
    onCreate(jobId, date, copy, { typeOfWork, name: dayName });
  };

  const canCreate = showNewJob ? newJob.name && pickReady(pick) : selectedJobId;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <Card className="w-full sm:max-w-lg max-h-[90vh] overflow-auto rounded-t-xl sm:rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>New Work Day</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div>
            <Label>Type of work</Label>
            <ChipSelect
              value={typeOfWork}
              onChange={(v) => setTypeOfWork(v as WorkType)}
              options={WORK_TYPE_CHOICES}
            />
            {!isBlastingWork(typeOfWork) && (
              <p className="text-xs text-gray-400 mt-1">
                No blasting log for this type — just the daily report. You can add a
                blasting log later if the day turns into a shot.
              </p>
            )}
          </div>

          <div>
            <Label>
              Name <span className="text-gray-400 font-normal">— optional, e.g. "North face lift 2"</span>
            </Label>
            <Input value={dayName} onChange={(e) => setDayName(e.target.value)} />
          </div>

          {!showNewJob ? (
            <div>
              <Label>Job</Label>
              <Select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                placeholder="Select a job..."
                options={jobs.map((j) => ({ value: j.id, label: `${j.name} — ${j.customer}` }))}
              />
              {canCreateJob && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-navy"
                  onClick={() => setShowNewJob(true)}
                >
                  <Plus className="h-4 w-4 mr-1" /> Create New Job
                </Button>
              )}
              {!canCreateJob && jobs.length === 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  No active jobs yet — the office sets up jobs in Admin.
                </p>
              )}

              {sameDateExists && (
                <p className="text-xs text-safety-orange bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-2">
                  ⚠ This job already has a work day on this date — creating another makes a
                  second day (fine for split shifts, easy to miss otherwise).
                </p>
              )}
              {previousDays.length > 0 && (
                <div className="mt-3 border border-gray-200 rounded-lg p-3 space-y-2">
                  <Label>Copy from Previous</Label>
                  <Select
                    value={copySourceId}
                    onChange={(e) => setCopySourceId(e.target.value)}
                    placeholder="Start blank"
                    options={previousDays.slice(0, 10).map((d) => ({
                      value: d.id,
                      label: `${d.date} — ${d.status.replace('_', ' ')}`,
                    }))}
                  />
                  {copySourceId && (
                    <div className="grid grid-cols-2 gap-1 pt-1">
                      {COPY_SECTIONS.map(({ key, label }) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 py-1.5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 rounded border-gray-300 text-navy focus:ring-navy-400"
                            checked={copySections[key]}
                            onChange={(e) =>
                              setCopySections((prev) => ({ ...prev, [key]: e.target.checked }))
                            }
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">New Job</span>
                <Button variant="ghost" size="sm" onClick={() => setShowNewJob(false)}>
                  Cancel
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Job Name *</Label>
                  <Input value={newJob.name} onChange={(e) => setNewJob({ ...newJob, name: e.target.value })} placeholder="Route 3 Widening" />
                </div>
                <CustomerSitePicker value={pick} onChange={setPick} />
                <div>
                  <Label>Operation</Label>
                  <Select
                    value={newJob.operation}
                    onChange={(e) => setNewJob({ ...newJob, operation: e.target.value as typeof newJob.operation })}
                    options={OPERATION_OPTIONS}
                  />
                </div>
                <div>
                  <Label>Type of Rock</Label>
                  <Input value={newJob.typeOfRock} onChange={(e) => setNewJob({ ...newJob, typeOfRock: e.target.value })} placeholder="Granite" />
                </div>
                <div>
                  <Label>Type of Terrain</Label>
                  <Input value={newJob.typeOfTerrain} onChange={(e) => setNewJob({ ...newJob, typeOfTerrain: e.target.value })} placeholder="Flat" />
                </div>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-2 pb-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="safety" disabled={!canCreate} onClick={handleCreate}>
            Create Work Day
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

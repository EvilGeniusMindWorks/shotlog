// Start work at a job — the New work day dialog (Round S7b order, Matthew):
// Name first · Recent jobs (one tap) or Customer → Site → Job, each step
// narrowed by the last and filled in when there is only one choice · Date ·
// Type of work (the job's last day → the job's default → this device's
// default → the role's) · Copy from previous (most recent day at that job).
import { useEffect, useMemo, useState } from 'react';
import { can } from '@/lib/perms';
import { useLiveQuery, db } from '@/db';
import { getJobViews } from '@/lib/jobContext';
import { useJobActivity } from '@/lib/jobActivity';
import { NewJobForm } from '@/components/forms/NewJobForm';
import type { CopyFromPrevious, CreateWorkDayOptions } from '@/hooks/useBlastDay';
import type { BlastDay, Job, WorkType } from '@/db/schema';
import { isBlastingWork } from '@/db/schema';
import {
  COPY_SECTIONS,
  getCopySections,
  getDefaultWorkType,
  WORK_TYPES,
  WORK_TYPE_LABEL,
  type CopySectionKey,
} from '@/lib/prefs';
import { ChipSelect } from '@/components/ui/chip-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { formatDate, todayISO } from '@/lib/utils';
import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreate: (
    jobId: string,
    date: string,
    copy?: CopyFromPrevious,
    opts?: CreateWorkDayOptions,
  ) => void;
  /** The role's fallback type of work (drillers default to drill_only) */
  defaultTypeOfWork?: WorkType;
}

const NEW_JOB = '__new';
const RECENT_DAYS = 14;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function NewBlastDayDialog({ onClose, onCreate, defaultTypeOfWork }: Props) {
  // NOTE: boolean fields can't be indexed in IndexedDB — use filter(), not where()
  const jobs: Job[] =
    useLiveQuery(async () => getJobViews(await db.jobs.filter((j) => j.isActive).toArray())) ?? [];
  const customers =
    useLiveQuery(async () =>
      (await db.customers.filter((c) => c.isActive).toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    ) ?? [];
  const sites =
    useLiveQuery(async () =>
      (await db.sites.filter((s) => s.isActive).toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    ) ?? [];
  const activity = useJobActivity();
  // Jobs are admin-managed reference data — for field roles the server would
  // silently discard the write, so don't offer the inline create at all
  const canCreateJob = can('jobs', 'PUT');

  const [dayName, setDayName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [jobId, setJobId] = useState('');
  const [showNewJob, setShowNewJob] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [typeOfWork, setTypeOfWork] = useState<WorkType>(
    getDefaultWorkType() ?? defaultTypeOfWork ?? 'drill_to_blast',
  );
  const [typeTouched, setTypeTouched] = useState(false);
  const [copySourceId, setCopySourceId] = useState(''); // '' = start blank
  const [copySections, setCopySections] = useState<Record<CopySectionKey, boolean>>(getCopySections);

  // Recent: the jobs anyone here worked in the last two weeks — one tap
  const recent = useMemo(() => {
    if (!activity) return [];
    const floor = daysAgo(RECENT_DAYS);
    return jobs
      .map((j) => ({ job: j, last: activity.get(j.id)?.lastWorked ?? '' }))
      .filter((x) => x.last >= floor)
      .sort((a, b) => b.last.localeCompare(a.last))
      .slice(0, 4)
      .map((x) => x.job);
  }, [jobs, activity]);

  // The cascade, narrowed step by step
  const sitesOfCustomer = useMemo(
    () => (customerId ? sites.filter((s) => s.customerId === customerId) : sites),
    [sites, customerId],
  );
  const jobsOfSite = useMemo(
    () =>
      siteId
        ? jobs.filter((j) => j.siteId === siteId)
        : customerId
          ? jobs.filter((j) => j.customerId === customerId)
          : jobs,
    [jobs, siteId, customerId],
  );

  const pickJob = (id: string) => {
    setJobId(id);
    const j = jobs.find((x) => x.id === id);
    if (j) {
      if (j.customerId) setCustomerId(j.customerId);
      if (j.siteId) setSiteId(j.siteId);
    }
  };
  const pickCustomer = (id: string) => {
    setCustomerId(id);
    setJobId('');
    const its = id ? sites.filter((s) => s.customerId === id) : [];
    // One site → that's the site; one job under it → that's the job
    const lone = its.length === 1 ? its[0].id : '';
    setSiteId(lone);
    const jobsHere = lone ? jobs.filter((j) => j.siteId === lone) : id ? jobs.filter((j) => j.customerId === id) : [];
    if (jobsHere.length === 1) setJobId(jobsHere[0].id);
  };
  const pickSite = (id: string) => {
    setSiteId(id);
    setJobId('');
    const jobsHere = id ? jobs.filter((j) => j.siteId === id) : [];
    if (jobsHere.length === 1) setJobId(jobsHere[0].id);
  };

  // Copy from Previous: offered when the selected job has existing days
  const previousDays: BlastDay[] =
    useLiveQuery(async () => {
      if (!jobId) return [];
      const days = await db.blastDays.where('jobId').equals(jobId).sortBy('date');
      return days.reverse();
    }, [jobId]) ?? [];
  const job = jobs.find((j) => j.id === jobId);

  // Type of work follows the job (last day → job default → device → role)
  // until the person picks one by hand; copy source defaults to the latest day
  useEffect(() => {
    if (!jobId) return;
    const last = previousDays[0];
    if (!typeTouched) {
      setTypeOfWork(
        last?.typeOfWork ?? job?.defaultTypeOfWork ?? getDefaultWorkType() ?? defaultTypeOfWork ?? 'drill_to_blast',
      );
    }
    setCopySourceId(last?.id ?? '');
    // (job?.defaultTypeOfWork: a job created a moment ago reaches the live
    // list a beat after it is picked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, previousDays.length, job?.defaultTypeOfWork]);

  // Two offline devices can both create "today's day" — warn, don't block
  // (split shifts on one date are legitimate; S7d folds them into one day)
  const sameDateExists = previousDays.some((d) => d.date === date);

  const handleCreate = () => {
    if (!jobId) return;
    const blasting = isBlastingWork(typeOfWork);
    const copy: CopyFromPrevious | undefined = copySourceId
      ? {
          sourceBlastDayId: copySourceId,
          // Copying blast content would force a blasting day — keep a
          // drill-only day drill-only by copying only crew & equipment
          blastInfo: blasting && copySections.blastInfo,
          drillParams: blasting && copySections.drillParams,
          designPlan: blasting && copySections.designPlan,
          explosives: blasting && copySections.explosives,
          crewEquipment: copySections.crewEquipment,
        }
      : undefined;
    onCreate(jobId, date, copy, { typeOfWork, name: dayName });
  };

  const jobLabel = (j: Job) => `${j.jobNumber ? `${j.jobNumber} · ` : ''}${j.name}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <Card className="w-full sm:max-w-lg max-h-[90vh] overflow-auto rounded-t-xl sm:rounded-xl" data-new-day-dialog>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Start work at a job</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>
              Name <span className="text-gray-400 font-normal">— optional, e.g. "North face lift 2"</span>
            </Label>
            <Input value={dayName} onChange={(e) => setDayName(e.target.value)} data-day-name />
          </div>

          {recent.length > 0 && !showNewJob && (
            <div>
              <Label>Recent jobs</Label>
              <div className="flex flex-wrap gap-2 mt-1" data-recent-jobs>
                {recent.map((j) => (
                  <button
                    key={j.id}
                    className={
                      jobId === j.id
                        ? 'inline-flex items-center min-h-[40px] px-3 rounded-full border border-navy bg-navy text-white text-sm font-medium'
                        : 'inline-flex items-center min-h-[40px] px-3 rounded-full border border-gray-300 bg-white text-gray-700 text-sm font-medium active:bg-gray-100'
                    }
                    data-recent-job={j.jobNumber ?? j.id}
                    onClick={() => pickJob(j.id)}
                  >
                    {jobLabel(j)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!showNewJob ? (
            <div className="space-y-3">
              <div>
                <Label>Customer</Label>
                <Select
                  data-day-customer
                  value={customerId}
                  onChange={(e) => pickCustomer(e.target.value)}
                  options={[
                    { value: '', label: 'Any customer' },
                    ...customers.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>
              <div>
                <Label>Site</Label>
                <Select
                  data-day-site
                  value={siteId}
                  onChange={(e) => pickSite(e.target.value)}
                  options={[
                    { value: '', label: customerId ? 'Any site' : 'Any site — pick a customer to narrow' },
                    ...sitesOfCustomer.map((s) => ({ value: s.id, label: `${s.name}${s.city ? ` · ${s.city}` : ''}` })),
                  ]}
                />
              </div>
              <div>
                <Label>Job</Label>
                <Select
                  data-day-job
                  value={jobId}
                  onChange={(e) => (e.target.value === NEW_JOB ? setShowNewJob(true) : pickJob(e.target.value))}
                  options={[
                    { value: '', label: jobsOfSite.length === 0 ? 'No jobs here yet' : 'Pick the job…' },
                    ...jobsOfSite.map((j) => ({ value: j.id, label: jobLabel(j) })),
                    ...(canCreateJob ? [{ value: NEW_JOB, label: '+ New job…' }] : []),
                  ]}
                />
                {!canCreateJob && jobs.length === 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    No active jobs yet — the office sets up jobs in Admin.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg p-3">
              <NewJobForm
                initial={{ customerId: customerId || undefined, siteId: siteId || undefined }}
                onCancel={() => setShowNewJob(false)}
                onCreated={(id) => {
                  setShowNewJob(false);
                  pickJob(id);
                }}
              />
            </div>
          )}

          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-day-date />
            {sameDateExists && (
              <p className="text-xs text-safety-orange bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mt-2">
                ⚠ This job already has a work day on this date — creating another makes a second
                day (fine for split shifts, easy to miss otherwise).
              </p>
            )}
          </div>

          <div>
            <Label>Type of work</Label>
            <ChipSelect
              value={typeOfWork}
              onChange={(v) => {
                setTypeTouched(true);
                setTypeOfWork(v as WorkType);
              }}
              options={WORK_TYPES.map((t) => ({ value: t, label: WORK_TYPE_LABEL[t] }))}
            />
            {!isBlastingWork(typeOfWork) && (
              <p className="text-xs text-gray-400 mt-1">
                No blasting log for this type — just the daily report. You can add a blasting log
                later if the day turns into a shot.
              </p>
            )}
          </div>

          {previousDays.length > 0 && !showNewJob && (
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
              <Label>Copy from previous</Label>
              <Select
                data-day-copy
                value={copySourceId}
                onChange={(e) => setCopySourceId(e.target.value)}
                options={[
                  { value: '', label: 'Blank — no copy' },
                  ...previousDays.slice(0, 10).map((d) => ({
                    value: d.id,
                    label: `${formatDate(d.date)}${d.name ? ` · ${d.name}` : ''} — ${d.status.replace('_', ' ')}`,
                  })),
                ]}
              />
              {copySourceId && (
                <div className="grid grid-cols-2 gap-1 pt-1">
                  {COPY_SECTIONS.filter(({ key }) => isBlastingWork(typeOfWork) || key === 'crewEquipment').map(
                    ({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 py-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-5 w-5 rounded border-gray-300 text-navy focus:ring-navy-400"
                          checked={copySections[key]}
                          onChange={(e) => setCopySections((prev) => ({ ...prev, [key]: e.target.checked }))}
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ),
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-2 pb-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="safety" disabled={!jobId || showNewJob} onClick={handleCreate} data-day-start>
            Start work
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

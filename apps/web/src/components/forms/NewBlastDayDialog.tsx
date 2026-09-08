// Start work at a job — the New work day dialog (Round S7b order, Matthew):
// Name first · Recent jobs (one tap) or Customer → Site → Job, each step
// narrowed by the last and filled in when there is only one choice · Date ·
// Type of work (the job's last day → the job's default → this device's
// default → the role's) · Copy from previous (most recent day at that job).
import { useEffect, useMemo, useState } from 'react';
import { can, myHomeDashboard } from '@/lib/perms';
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
import { ArrowLeft, X } from 'lucide-react';

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
  /** S7d: today's day at that job already exists — open it instead */
  onOpenExisting?: (dayId: string) => void;
}

const NEW_JOB = '__new';
const RECENT_DAYS = 14;

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function NewBlastDayDialog({ onClose, onCreate, defaultTypeOfWork, onOpenExisting }: Props) {
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
      // same day worked → the newest job first
      .sort((a, b) => b.last.localeCompare(a.last) || b.job.updatedAt.localeCompare(a.job.updatedAt))
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

  // The lone-choice auto-fill also runs when the lists finish loading after
  // the pick (a job created a moment ago reaches the live list a beat later)
  useEffect(() => {
    if (!customerId || showNewJob) return;
    if (!siteId && sitesOfCustomer.length === 1) setSiteId(sitesOfCustomer[0].id);
    if (!jobId && (siteId || sitesOfCustomer.length <= 1) && jobsOfSite.length === 1) setJobId(jobsOfSite[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, siteId, jobId, sitesOfCustomer.length, jobsOfSite.length, showNewJob]);

  // Copy from Previous: offered when the selected job has existing days
  const previousDays: BlastDay[] =
    useLiveQuery(async () => {
      if (!jobId) return [];
      const days = await db.blastDays.where('jobId').equals(jobId).sortBy('date');
      return days.reverse();
    }, [jobId]) ?? [];
  const job = jobs.find((j) => j.id === jobId);

  // Type of work follows the job (last day → job default → device → role)
  // until the person picks one by hand. A DRILLER is never prefilled into a
  // blasting type (that makes a blast log and the blaster's hub — Matthew's
  // rehearsal, S7 follow-up): blasting prefills become Drill Only for them;
  // they can still choose Drill to Blast by hand. Copy from previous starts
  // BLANK (Matthew: "it shouldn't default to copying").
  useEffect(() => {
    if (!jobId) return;
    const last = previousDays[0];
    if (!typeTouched) {
      const wanted: WorkType =
        last?.typeOfWork ?? job?.defaultTypeOfWork ?? getDefaultWorkType() ?? defaultTypeOfWork ?? 'drill_to_blast';
      setTypeOfWork(myHomeDashboard() === 'driller' && isBlastingWork(wanted) ? 'drill_only' : wanted);
    }
    setCopySourceId('');
    // (job?.defaultTypeOfWork: a job created a moment ago reaches the live
    // list a beat after it is picked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, previousDays.length, job?.defaultTypeOfWork]);

  // S7d: the day is a container — one per job per date. If it already
  // exists, the first choice is to OPEN it (a driller who got there first
  // claimed nothing); a second day stays possible for a real split shift.
  const existingSameDate = previousDays.find((d) => d.date === date);
  const sameDateExists = Boolean(existingSameDate);

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

  // ── S8 · Option B: one Job row, a full-height picker sheet ───────────
  // Name first (S7b). The picker IS Customer → Site → Job (Matthew: "the
  // fastest path to refine the list"), with search and Recent on top; "+ New
  // job here" lives inside it with customer and site already set. Back in
  // the dialog: Job · Date · Type · Copy · a pinned Start — nothing scrolls
  // to find the button.
  const [showPicker, setShowPicker] = useState(false);
  const [pickQuery, setPickQuery] = useState('');
  useEffect(() => {
    if (jobId && showPicker && !showNewJob) setShowPicker(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
  const customerName = (id: string | undefined) => customers.find((c) => c.id === id)?.name ?? '';
  const siteName = (id: string | undefined) => sites.find((s) => s.id === id)?.name ?? '';
  const q = pickQuery.trim().toLowerCase();
  const found = q
    ? {
        jobs: jobs.filter((j) =>
          [j.name, j.jobNumber, j.customer, j.city, j.id].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
        ).slice(0, 12),
        customers: customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6),
        sites: sites.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6),
      }
    : null;
  const level: 'customers' | 'sites' | 'jobs' = !customerId ? 'customers' : !siteId ? 'sites' : 'jobs';
  const openPicker = () => {
    setPickQuery('');
    setShowNewJob(false);
    setShowPicker(true);
  };
  const jobRowText = job
    ? `${[customerName(job.customerId), siteName(job.siteId)].filter(Boolean).join(' › ')}`
    : '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4">
      <Card className="w-full sm:max-w-lg max-h-[92vh] flex flex-col overflow-hidden rounded-t-xl sm:rounded-xl relative" data-new-day-dialog>
        <CardHeader className="flex flex-row items-center justify-between shrink-0">
          <CardTitle>Start work at a job</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 overflow-auto flex-1 min-h-0">
          <div>
            <Label>
              Name <span className="text-gray-400 font-normal">— optional, e.g. "North face lift 2"</span>
            </Label>
            <Input value={dayName} onChange={(e) => setDayName(e.target.value)} data-day-name />
          </div>

          <div>
            <Label>Job</Label>
            <button
              type="button"
              className={`w-full text-left rounded-lg border px-3 py-2.5 min-h-[48px] flex items-center gap-2 ${job ? 'border-navy bg-white' : 'border-gray-300 bg-white'}`}
              onClick={openPicker}
              data-day-job
              data-day-job-id={jobId}
              data-day-customer-id={customerId}
              data-day-site-id={siteId}
            >
              <span className="flex-1 min-w-0">
                {job ? (
                  <>
                    {jobRowText && <span className="block text-xs text-gray-500 truncate">{jobRowText}</span>}
                    <span className="block text-sm font-semibold truncate">{jobLabel(job)}</span>
                  </>
                ) : (
                  <span className="text-sm text-gray-500">Choose the job — customer › site › job</span>
                )}
              </span>
              <span className="text-gray-400">›</span>
            </button>
            {!job && recent.length > 0 && (
              <div className="mt-2">
                <p className="text-[11px] text-gray-400 mb-1">Recent</p>
                <div className="flex flex-wrap gap-2" data-recent-jobs>
                  {recent.map((j) => (
                    <button
                      key={j.id}
                      className="inline-flex items-center min-h-[36px] px-3 rounded-full border border-gray-300 bg-white text-gray-700 text-sm font-medium active:bg-gray-100"
                      data-recent-job={j.jobNumber ?? j.id}
                      onClick={() => pickJob(j.id)}
                    >
                      {jobLabel(j)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!canCreateJob && jobs.length === 0 && (
              <p className="text-xs text-gray-400 mt-2">No active jobs yet — the office sets up jobs in Admin.</p>
            )}
          </div>

          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-day-date />
            {sameDateExists && existingSameDate && (
              <div className="text-xs text-safety-orange bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mt-2 space-y-2" data-day-exists>
                <p>
                  This job already has a work day on this date
                  {existingSameDate.authorName ? ` — started by ${existingSameDate.authorName}` : ''}. Open it
                  and add your part; a second day is only for a real split shift.
                </p>
                {onOpenExisting && (
                  <Button size="sm" variant="secondary" data-day-open-existing onClick={() => onOpenExisting(existingSameDate.id)}>
                    Open that day
                  </Button>
                )}
              </div>
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
                No blasting log for this type — just the daily report. You can add a blasting log later if the day turns into a shot.
              </p>
            )}
          </div>

          {previousDays.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-3 space-y-2">
              <Label>
                Copy from previous <span className="text-gray-400 font-normal">— optional</span>
              </Label>
              <Select
                data-day-copy
                value={copySourceId}
                onChange={(e) => setCopySourceId(e.target.value)}
                options={[
                  { value: '', label: 'Start blank' },
                  ...previousDays.slice(0, 10).map((d) => ({
                    value: d.id,
                    label: `${formatDate(d.date)}${d.name ? ` · ${d.name}` : ''} — ${d.status.replace('_', ' ')}`,
                  })),
                ]}
              />
              {copySourceId && (
                <div className="grid grid-cols-2 gap-1 pt-1">
                  {COPY_SECTIONS.filter(({ key }) => isBlastingWork(typeOfWork) || key === 'crewEquipment').map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 py-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-gray-300 text-navy focus:ring-navy-400"
                        checked={copySections[key]}
                        onChange={(e) => setCopySections((prev) => ({ ...prev, [key]: e.target.checked }))}
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
        {/* Pinned: the button is always on screen */}
        <CardFooter className="flex justify-end gap-2 pb-[max(1.5rem,var(--sab))] shrink-0 border-t border-gray-100 pt-3 bg-white">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="safety" disabled={!jobId} onClick={handleCreate} data-day-start>
            Start work
          </Button>
        </CardFooter>

        {/* ── The picker sheet: Customer › Site › Job ───────────────────── */}
        {showPicker && (
          <div className="absolute inset-0 bg-white flex flex-col" data-job-picker data-pick-level={showNewJob ? 'new-job' : q ? 'search' : level}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 shrink-0">
              <Button variant="ghost" size="icon" data-pick-back onClick={() => {
                if (showNewJob) setShowNewJob(false);
                else if (q) setPickQuery('');
                else if (level === 'jobs') { setSiteId(''); setJobId(''); }
                else if (level === 'sites') { setCustomerId(''); setSiteId(''); setJobId(''); }
                else setShowPicker(false);
              }}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <p className="font-bold flex-1">Which job?</p>
              <Button variant="ghost" size="icon" onClick={() => setShowPicker(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            {!showNewJob && (
              <div className="px-3 pt-2 shrink-0">
                <Input
                  placeholder="Search customers, sites, jobs…"
                  value={pickQuery}
                  onChange={(e) => setPickQuery(e.target.value)}
                  data-pick-search
                />
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto px-3 py-2 space-y-1">
              {showNewJob ? (
                <div className="border border-gray-200 rounded-lg p-3">
                  <NewJobForm
                    initial={{ customerId: customerId || undefined, siteId: siteId || undefined }}
                    onCancel={() => setShowNewJob(false)}
                    onCreated={(id) => {
                      setShowNewJob(false);
                      pickJob(id);
                      setShowPicker(false);
                    }}
                  />
                </div>
              ) : found ? (
                <>
                  {found.jobs.length + found.customers.length + found.sites.length === 0 && (
                    <p className="text-sm text-gray-400 py-4 text-center">Nothing matches.</p>
                  )}
                  {found.jobs.map((j) => (
                    <button key={j.id} className="w-full text-left rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50" data-choose-job={j.id} onClick={() => { pickJob(j.id); setShowPicker(false); }}>
                      <span className="block text-sm font-semibold">{jobLabel(j)}</span>
                      <span className="block text-xs text-gray-400">{[customerName(j.customerId) || j.customer, siteName(j.siteId) || j.city].filter(Boolean).join(' › ')}</span>
                    </button>
                  ))}
                  {found.customers.map((c) => (
                    <button key={c.id} className="w-full text-left rounded-lg border border-gray-100 bg-gray-50 px-3 py-2" data-choose-customer={c.id} onClick={() => { setPickQuery(''); pickCustomer(c.id); }}>
                      <span className="block text-sm font-semibold">{c.name}</span>
                      <span className="block text-xs text-gray-400">customer · narrows to its sites</span>
                    </button>
                  ))}
                  {found.sites.map((st) => (
                    <button key={st.id} className="w-full text-left rounded-lg border border-gray-100 bg-gray-50 px-3 py-2" data-choose-site={st.id} onClick={() => { setPickQuery(''); setCustomerId(st.customerId); pickSite(st.id); }}>
                      <span className="block text-sm font-semibold">{st.name}</span>
                      <span className="block text-xs text-gray-400">site · {customerName(st.customerId)} · narrows to its jobs</span>
                    </button>
                  ))}
                </>
              ) : level === 'customers' ? (
                <>
                  {recent.length > 0 && (
                    <div className="pb-1">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Recent</p>
                      <div className="flex flex-wrap gap-2">
                        {recent.map((j) => (
                          <button key={j.id} className="inline-flex items-center min-h-[36px] px-3 rounded-full border border-gray-300 bg-white text-sm font-medium" data-pick-recent={j.jobNumber ?? j.id} onClick={() => { pickJob(j.id); setShowPicker(false); }}>
                            {jobLabel(j)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Customer</p>
                  {customers.map((c) => {
                    const n = sites.filter((s) => s.customerId === c.id).length;
                    return (
                      <button key={c.id} className="w-full text-left rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2" data-choose-customer={c.id} onClick={() => pickCustomer(c.id)}>
                        <span className="flex-1 min-w-0 text-sm font-semibold truncate">{c.name}</span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{n} site{n === 1 ? '' : 's'} ›</span>
                      </button>
                    );
                  })}
                  {customers.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">No customers yet.</p>}
                </>
              ) : level === 'sites' ? (
                <>
                  <p className="text-xs text-gray-500" data-pick-crumb="sites">{customerName(customerId)}</p>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Site</p>
                  {sitesOfCustomer.map((st) => {
                    const n = jobs.filter((j) => j.siteId === st.id).length;
                    return (
                      <button key={st.id} className="w-full text-left rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2" data-choose-site={st.id} onClick={() => pickSite(st.id)}>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold truncate">{st.name}</span>
                          <span className="block text-xs text-gray-400">{[st.city, st.kFactor ? `K ${st.kFactor}` : ''].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{n} job{n === 1 ? '' : 's'} ›</span>
                      </button>
                    );
                  })}
                  {sitesOfCustomer.length === 0 && (
                    <p className="text-sm text-gray-400 py-2">No sites for this customer yet{canCreateJob ? ' — a new job creates its site.' : '.'}</p>
                  )}
                  {canCreateJob && (
                    <button className="w-full text-left rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-navy" data-pick-new-job onClick={() => setShowNewJob(true)}>
                      + New job for {customerName(customerId)}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500" data-pick-crumb="jobs">{customerName(customerId)} › {siteName(siteId)}</p>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Job</p>
                  {jobsOfSite.map((j) => (
                    <button key={j.id} className="w-full text-left rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50" data-choose-job={j.id} onClick={() => { pickJob(j.id); setShowPicker(false); }}>
                      <span className="block text-sm font-semibold">{jobLabel(j)}</span>
                    </button>
                  ))}
                  {jobsOfSite.length === 0 && <p className="text-sm text-gray-400 py-2">No jobs at this site yet.</p>}
                  {canCreateJob && (
                    <button className="w-full text-left rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-navy" data-pick-new-job onClick={() => setShowNewJob(true)}>
                      + New job here
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

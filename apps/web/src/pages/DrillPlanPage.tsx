// The drill plan — a paper of the job (S23, Sep 18 2026; Matthew: "the
// blaster will come to a jobsite and fill out a drill plan… multiple
// drillers could work over multiple days… the blaster would come back on
// day Y and do the shot"). The blaster draws the pattern ahead of any blast
// day and sends it; the drillers Continue ONE drill log over days (Mark's
// C), each signing his own part; the pattern turns Drilled by itself at the
// full count or the last driller closes it short; the blaster accepts the
// drill log in one tap, which files the office copies with the pattern.
// The state the crew reads — Draft · Sent · Drilling · Drilled · Shot — is
// derived from the facts, never typed.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBack } from '@/lib/nav';
import { BackButton } from '@/components/layout/ScreenHeader';
import { Send, X } from 'lucide-react';
import { type Role } from '@shotlog/shared';
import { can } from '@/lib/perms';
import { LifecycleMenu, ConsequenceSheet } from '@/components/records/LifecycleMenu';
import { useLiveQuery, db } from '@/db';
import {
  acceptPlanDrilling,
  continuePart,
  drillLogRoute,
  finishPlanChange,
  getPlanHoles,
  progressLine,
  reopenPlan,
  sendPlan,
  startPlanChange,
  usePlanProgress,
  type PlanWord,
} from '@/hooks/useDrillPlans';
import { canDrillLogTransition } from '@/lib/perms';
import { DrillGridEditor, remapOverrides, GRID_MAX_ROWS, GRID_MAX_COLS } from '@/components/design/DrillGridEditor';
import { getSessionUser } from '@/lib/session';
import { formatDate, nowISO } from '@/lib/utils';
import { hhmm } from '@/lib/dayCard';
import type { DrillPlanRecord } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DraftInput } from '@/components/ui/draft-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { showToast } from '@/components/ui/undo-toast';

const WORD_BADGE: Record<PlanWord, 'draft' | 'submitted' | 'warning' | 'approved' | 'secondary'> = {
  Draft: 'draft',
  Sent: 'submitted',
  Drilling: 'warning',
  Drilled: 'approved',
  Shot: 'secondary',
};
const PART_BADGE = { open: 'draft', complete: 'submitted', accepted: 'approved' } as const;
const PART_WORD = { open: 'drilling', complete: 'signed', accepted: 'accepted' } as const;

function DispatchModal({
  plan,
  alreadyAssigned,
  onClose,
}: {
  plan: DrillPlanRecord;
  alreadyAssigned: Set<string>;
  onClose: () => void;
}) {
  const crew = useLiveQuery(() => db.crewMembers.filter((c) => c.isActive).toArray()) ?? [];
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const sorted = [...crew].sort((a, b) => {
    const rank = (c: (typeof crew)[number]) => (!c.userId ? 2 : c.role === 'driller' ? 0 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
  const send = async () => {
    setSending(true);
    const drillers = crew.filter((c) => c.userId && picked.has(c.id)).map((c) => ({ userId: c.userId!, name: c.name }));
    await sendPlan(plan, drillers);
    showToast(`Sent to ${drillers.map((d) => d.name).join(', ')}`);
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4">
      {/* S8: header and Send stay put; only the crew list scrolls; above the mobile nav */}
      <div className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4 pb-[max(1rem,var(--sab))] max-h-[80vh] flex flex-col" data-send-drillers>
        <div className="flex items-center justify-between mb-1">
          <p className="font-bold">Send the pattern to…</p>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Everyone you name gets the same drill log for this pattern and continues it over as many days as it takes; each signs his own part.
        </p>
        <div className="space-y-1 overflow-auto flex-1 min-h-0 pr-1">
          {sorted.map((c) => {
            const assigned = c.userId ? alreadyAssigned.has(c.userId) : false;
            const disabled = !c.userId || assigned;
            return (
              <label
                key={c.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                  disabled ? 'border-gray-100 opacity-50' : 'border-gray-200 cursor-pointer hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-gray-300 text-navy"
                  disabled={disabled}
                  checked={assigned || picked.has(c.id)}
                  data-send-driller={c.name}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(c.id);
                    else next.delete(c.id);
                    setPicked(next);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">{c.name}</span>
                  <span className="block text-xs text-gray-400">
                    {assigned ? 'has the pattern' : !c.userId ? 'not enrolled — no app account' : c.role || 'crew'}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <Button className="w-full mt-3" disabled={picked.size === 0 || sending} data-send-go onClick={() => void send()}>
          <Send className="h-4 w-4 mr-1" />
          {sending ? 'Sending…' : `Send to ${picked.size || '…'}`}
        </Button>
      </div>
    </div>
  );
}

export function DrillPlanPage() {
  const { jobId, planId } = useParams<{ jobId: string; planId: string }>();
  const navigate = useNavigate();
  const me = getSessionUser();
  const role = (me?.role ?? 'driller') as Role;
  const canEdit = can('drillPlans', 'PATCH');
  const isDriller = role === 'driller';

  const plan = useLiveQuery(() => (planId ? db.drillPlans.get(planId) : undefined), [planId]);
  const job = useLiveQuery(() => (jobId ? db.jobs.get(jobId) : undefined), [jobId]);
  // The navigation round: up to the job — or back to the day / the Drilling page you came from
  const back = useBack(plan ? { to: `/jobs/${plan.jobId}`, label: job?.name ?? 'the job' } : null, plan?.name);
  const progress = usePlanProgress(planId);
  const [dispatching, setDispatching] = useState(false);
  const [changeNote, setChangeNote] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  if (!plan) return <div className="p-4 text-center text-gray-500">Loading…</div>;

  const holes = getPlanHoles(plan);
  const word = progress?.word ?? (plan.status === 'complete' ? 'Drilled' : plan.sentAt ? 'Sent' : 'Draft');
  const locked = progress?.locked ?? false;
  const editable = canEdit && plan.status === 'open' && !locked && word !== 'Shot';
  const update = (changes: Partial<DrillPlanRecord>) => db.drillPlans.update(plan.id, { ...changes, updatedAt: nowISO() });
  const partsOpen = new Set((progress?.parts ?? []).filter((p) => p.log.status === 'open').map((p) => p.log.drillerUserId).filter(Boolean));
  const canAccept = canDrillLogTransition('complete', 'accepted') && (progress?.waiting ?? 0) > 0;
  const lastRevision = plan.revisions?.[plan.revisions.length - 1];

  const accept = async () => {
    setAccepting(true);
    try {
      const n = await acceptPlanDrilling(plan.id);
      showToast(`Accepted ${n} part${n === 1 ? '' : 's'} — the office copies are filed`);
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div data-plan-page={plan.id} data-plan-word={word}>
      <div className="bg-navy text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-2 sm:gap-3">
          <BackButton back={back} />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg truncate leading-tight">{plan.name}</h2>
            <p className="text-xs text-navy-200 truncate" data-plan-header-line>
              {job?.name} · {holes?.length ?? 0} holes
              {plan.version && plan.version > 1 ? ` · v${plan.version}` : ''}
              {progress && progress.drilling.totalHoles > 0 ? ` · ${progressLine(progress, me?.id)}` : ''}
            </p>
          </div>
          <div className="basis-full flex items-center gap-2 sm:contents">
            <Badge variant={WORD_BADGE[word]} data-plan-status={word} className="mr-auto sm:mr-0">{word}</Badge>
            {canEdit && plan.status === 'open' && word !== 'Shot' && (
              <Button size="sm" variant="secondary" data-plan-send onClick={() => setDispatching(true)}>
                <Send className="h-4 w-4 mr-1" /> {word === 'Draft' ? 'Send to drillers' : 'Send to another driller'}
              </Button>
            )}
            {canEdit && locked && plan.status === 'open' && (
              <Button size="sm" variant="secondary" data-plan-change onClick={() => setChangeNote('')}>
                Change the plan
              </Button>
            )}
            {canEdit && plan.changingSince && (
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" data-plan-change-done onClick={() => void finishPlanChange(plan)}>
                Done changing
              </Button>
            )}
            {canEdit && plan.status === 'complete' && word !== 'Shot' && (
              <Button size="sm" variant="secondary" data-plan-reopen onClick={() => void reopenPlan(plan)}>
                Reopen
              </Button>
            )}
            {isDriller && plan.status === 'open' && (
              <Button
                size="sm"
                className="bg-safety-orange hover:bg-safety-orange/90 text-white"
                data-plan-continue
                onClick={() => void continuePart(plan).then((id) => navigate(`/jobs/${plan.jobId}/drill-plan/${plan.id}/log/${id}`))}
              >
                Continue ›
              </Button>
            )}
            <LifecycleMenu
              table="drillPlans"
              record={plan}
              label={plan.name}
              kind="drill plan"
              onDeleted={() => navigate(`/jobs/${plan.jobId}`)}
              buttonClassName="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20"
            />
          </div>
        </div>
      </div>

      <div className="p-4 max-w-3xl mx-auto space-y-4">
        {/* The paper's own line: sent when, to whom; drilled when; closed short why */}
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm space-y-1" data-plan-trail>
          <p>
            <b>{word}</b>
            {word === 'Draft' && ' · not sent to a driller yet'}
            {plan.sentAt && (
              <span className="text-gray-600" data-plan-sent>
                {' '}· sent {formatDate(plan.sentAt.slice(0, 10))} {hhmm(plan.sentAt)}
                {plan.sentTo && plan.sentTo.length > 0 ? ` to ${plan.sentTo.map((d) => d.name).join(', ')}` : ''}
                {plan.sentBy ? ` by ${plan.sentBy}` : ''}
              </span>
            )}
            {plan.drilledAt && (
              <span className="text-gray-600" data-plan-drilled>
                {' '}· drilled {formatDate(plan.drilledAt.slice(0, 10))} {hhmm(plan.drilledAt)}
              </span>
            )}
          </p>
          {plan.closedShort && (
            <p className="text-amber-800" data-plan-closed-short>
              Closed short by {plan.closedShort.byName} {hhmm(plan.closedShort.at)}: “{plan.closedShort.reason}”
            </p>
          )}
          {progress?.pace && (
            <p className="text-navy" data-plan-pace={progress.pace.expected}>
              At this pace, drilled <b>{progress.pace.expectedWord}</b> · {Math.round(progress.pace.perDay)} holes a day · {progress.pace.remaining} to go
            </p>
          )}
          {lastRevision && (
            <p className="text-amber-800" data-plan-revision={lastRevision.version}>
              Plan v{lastRevision.version} · changed {formatDate(lastRevision.at.slice(0, 10))} by {lastRevision.byName}
              {lastRevision.note ? `: “${lastRevision.note}”` : ''}
              {plan.changingSince ? ' — being changed now' : ''}
            </p>
          )}
          {locked && !plan.changingSince && canEdit && (
            <p className="text-xs text-gray-500" data-plan-locked>
              The pattern is locked — a hole is drilled. Change the plan opens a new version with a note the drillers see.
            </p>
          )}
        </div>

        {canEdit && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs">Plan name</Label>
              <DraftInput value={plan.name} disabled={!editable} data-plan-field="name"
                onCommit={(v) => void update({ name: v })} />
            </div>
            <div><Label className="text-xs">Diameter (in)</Label>
              <DraftInput type="number" value={plan.holeDiameter || ''} disabled={!editable} data-plan-field="holeDiameter"
                onCommit={(v) => void update({ holeDiameter: parseFloat(v) || 0 })} /></div>
            <div><Label className="text-xs">Burden (ft)</Label>
              <DraftInput type="number" value={plan.burden || ''} disabled={!editable} data-plan-field="burden"
                onCommit={(v) => void update({ burden: parseFloat(v) || 0 })} /></div>
            <div><Label className="text-xs">Spacing (ft)</Label>
              <DraftInput type="number" value={plan.spacing || ''} disabled={!editable} data-plan-field="spacing"
                onCommit={(v) => void update({ spacing: parseFloat(v) || 0 })} /></div>
          </div>
        )}

        {/* The grid — paint depths and kicks */}
        <div className="rounded-xl border border-gray-200 bg-white p-3" data-plan-grid-editable={editable ? '1' : '0'}>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Pattern — depth &amp; kick per hole
          </p>
          <DrillGridEditor
            rows={plan.rows}
            cols={plan.cols}
            overrides={plan.overrides}
            defaultDepth={plan.defaultDepth}
            showKick
            disabled={!editable}
            onPaint={(overrides) => void update({ overrides })}
            onDefaultDepth={(defaultDepth) => void update({ defaultDepth })}
            onResize={(field, delta) => {
              const max = field === 'rows' ? GRID_MAX_ROWS : GRID_MAX_COLS;
              const value = Math.max(1, Math.min(max, plan[field] + delta));
              if (value === plan[field]) return;
              const nextRows = field === 'rows' ? value : plan.rows;
              const nextCols = field === 'cols' ? value : plan.cols;
              void update({
                rows: nextRows,
                cols: nextCols,
                overrides: remapOverrides(plan.overrides, plan.cols, nextRows, nextCols),
              });
            }}
          />
        </div>

        {/* The drill log: one per pattern — the count, the days, the parts */}
        <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2" data-plan-log>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              The drill log
            </p>
            {progress && progress.planned > 0 && (
              <span className="text-sm font-medium" data-plan-count>
                {progressLine(progress, me?.id)} · {Math.round(progress.drilling.totalFootage)} ft
              </span>
            )}
          </div>
          {progress && progress.planned > 0 && (
            <div className="h-2 rounded bg-gray-100 overflow-hidden">
              <i className="block h-full bg-safety-orange"
                style={{ width: `${Math.min(100, (progress.drilling.totalHoles / progress.planned) * 100)}%` }} />
            </div>
          )}
          {progress && progress.days.length > 0 && (
            <p className="text-xs text-gray-500" data-plan-days>
              {progress.days.map((d) => `${formatDate(d.date)} · ${d.holes}`).join(' · ')}
            </p>
          )}
          {progress && progress.notDrilled > 0 && progress.drilling.totalHoles > 0 && (
            <p className="text-sm text-safety-orange" data-plan-not-drilled={progress.notDrilled}>
              {progress.notDrilled} not drilled{plan.status === 'complete' ? '' : ' yet'}
              {progress.notDrilled <= 15 && `: ${progress.drilling.undrilled.join(', ')}`}
            </p>
          )}
          {progress && progress.drilling.skipped.length > 0 && (
            <p className="text-sm text-gray-600">{progress.drilling.skipped.length} marked not drilled by a driller: {progress.drilling.skipped.join(', ')}</p>
          )}
          {progress && progress.drilling.duplicateNumbers.length > 0 && (
            <p className="text-sm text-violation">⚠ Drilled twice: {progress.drilling.duplicateNumbers.join(', ')}</p>
          )}
          <div className="divide-y divide-gray-100">
            {(progress?.parts ?? []).map((p) => (
              <button key={p.log.id}
                className="w-full flex items-center gap-2 py-2 text-left hover:bg-gray-50 rounded-lg"
                data-plan-part={p.log.id}
                data-plan-part-status={p.log.status}
                onClick={() => navigate(drillLogRoute(p.log))}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {p.log.drillerName || 'unassigned'}
                    {p.rigs.length > 0 ? ` · ${p.rigs.join(', then ')}` : ''}
                  </p>
                  <p className="text-xs text-gray-400">
                    {p.holes} holes · {Math.round(p.footage)} ft
                    {p.from ? ` · ${p.from === p.to || !p.to ? formatDate(p.from) : `${formatDate(p.from)} – ${formatDate(p.to)}`}` : p.log.assignedAt ? ` · sent ${formatDate(p.log.assignedAt.slice(0, 10))}` : ''}
                    {p.log.status !== 'open' && p.log.completedAt ? ` · signed ${formatDate(p.log.completedAt.slice(0, 10))} ${hhmm(p.log.completedAt)}` : ''}
                    {p.log.status === 'accepted' && p.log.acceptedAt ? ` · accepted ${hhmm(p.log.acceptedAt)}` : ''}
                    {p.log.status === 'open' && p.log.reopenNote ? ` · sent back: “${p.log.reopenNote}”` : ''}
                  </p>
                </div>
                <Badge variant={PART_BADGE[p.log.status]}>{PART_WORD[p.log.status]}</Badge>
              </button>
            ))}
            {(progress?.parts ?? []).length === 0 && (
              <p className="text-sm text-gray-400 py-2">
                No drilling yet — send the pattern to your drillers; their parts show here as they drill.
              </p>
            )}
          </div>
        </div>

        {/* The review: what deserves a look before accepting — off-plan and water first */}
        {progress && progress.drilling.totalHoles > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-1" data-plan-review>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Review</p>
            {progress.flagged.map((f) => (
              <p key={f.holeNumber} className="text-sm text-safety-orange" data-plan-flag={f.holeNumber}>
                ⚠ Hole {f.holeNumber} — plan {f.plannedDepth} ft, drilled {f.actualDepth} ft ({f.depthDelta > 0 ? '+' : ''}{f.depthDelta.toFixed(1)}){f.angleChanged && ' · angle changed'}
              </p>
            ))}
            {progress.offPlan > 0 && (
              <p className="text-sm text-gray-700" data-plan-off-plan={progress.offPlan}>
                {progress.offPlan} hole{progress.offPlan === 1 ? '' : 's'} outside the plan: {progress.drilling.extras.slice(0, 12).join(', ')}
              </p>
            )}
            {(progress.wet > 0 || progress.drilling.voidHoles > 0) && (
              <p className="text-sm text-blue-700" data-plan-water={progress.wet}>
                {progress.wet > 0 && `${progress.wet} wet`}
                {progress.wet > 0 && progress.drilling.voidHoles > 0 && ' · '}
                {progress.drilling.voidHoles > 0 && `${progress.drilling.voidHoles} void`} — check the product at loading
              </p>
            )}
            {progress.flagged.length === 0 && progress.offPlan === 0 && progress.wet === 0 && progress.drilling.voidHoles === 0 && (
              <p className="text-sm text-green-700">✓ Every hole so far to plan, dry.</p>
            )}
            {canAccept && (
              <Button className="w-full mt-2 min-h-[48px] bg-safety-orange hover:bg-safety-orange/90 text-white" data-plan-accept disabled={accepting} onClick={() => void accept()}>
                {accepting ? 'Accepting and filing…' : `Accept the drill log · ${progress.waiting} part${progress.waiting === 1 ? '' : 's'} signed`}
              </Button>
            )}
            {canAccept && (
              <p className="text-xs text-gray-500 text-center">Accepting locks the holes and files each part's office copy with the pattern.</p>
            )}
          </div>
        )}

        {canEdit && (
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <Label className="text-xs">Notes for the drillers</Label>
            <DraftInput value={plan.notes ?? ''} disabled={!editable && !plan.changingSince} data-plan-field="notes"
              placeholder="e.g. bench is tight on the west edge — start row 1 east"
              onCommit={(v) => void update({ notes: v })} />
          </div>
        )}
        {!canEdit && plan.notes && (
          <p className="text-sm text-navy border border-gray-200 bg-navy-50 rounded-lg px-3 py-2">
            {plan.notes}
          </p>
        )}
      </div>

      {dispatching && (
        <DispatchModal plan={plan} alreadyAssigned={partsOpen as Set<string>} onClose={() => setDispatching(false)} />
      )}
      {changeNote !== null && (
        <ConsequenceSheet onClose={() => setChangeNote(null)}>
          <div data-plan-change-sheet>
            <h3 className="font-bold text-lg">Change the plan</h3>
            <p className="text-xs text-gray-500 mb-2">
              {progress?.drilling.totalHoles ?? 0} holes are drilled. The change becomes plan v{(plan.version ?? 1) + 1}; the drillers see your note on their log, and what they drilled stays as drilled.
            </p>
            <Label className="text-xs">What changes, and why</Label>
            <Textarea rows={3} value={changeNote} data-plan-change-note placeholder="e.g. row 5 dropped — the ledge ends at row 4" onChange={(e) => setChangeNote(e.target.value)} />
            <Button className="w-full mt-3 min-h-[48px]" disabled={!changeNote.trim()} data-plan-change-go onClick={() => void startPlanChange(plan, changeNote).then(() => setChangeNote(null))}>
              Unlock the pattern
            </Button>
            <Button variant="outline" className="w-full mt-2" onClick={() => setChangeNote(null)}>Cancel</Button>
          </div>
        </ConsequenceSheet>
      )}
    </div>
  );
}

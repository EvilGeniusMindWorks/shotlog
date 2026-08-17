// Standalone Drill Plan — the blaster authors the pattern AHEAD of any
// blast day: grid + per-hole depth/kick, dispatch to drillers, watch
// per-driller-per-day logs accumulate, mark complete when the pattern's
// drilled. The blast report later imports the as-drilled result.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, X } from 'lucide-react';
import { type Role } from '@shotlog/shared';
import { can } from '@/lib/perms';
import { useLiveQuery, db } from '@/db';
import {
  createDrillPlanLog,
  drillLogRoute,
  getPlanHoles,
  usePlanDrilling,
} from '@/hooks/useDrillPlans';
import { DrillGridEditor, remapOverrides, GRID_MAX_ROWS, GRID_MAX_COLS } from '@/components/design/DrillGridEditor';
import { getSessionUser } from '@/lib/session';
import { formatDate, nowISO } from '@/lib/utils';
import type { DrillPlanRecord } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STATUS_BADGE = { open: 'draft', complete: 'approved' } as const;
const LOG_BADGE = { open: 'draft', complete: 'submitted', accepted: 'approved' } as const;

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
    for (const c of crew) {
      if (!c.userId || !picked.has(c.id)) continue;
      await createDrillPlanLog(plan, { userId: c.userId, name: c.name });
    }
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4 max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between mb-1">
          <p className="font-bold">Send drill plan to…</p>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Each person gets today's log for this plan in their queue. They can start
          new logs on later days themselves.
        </p>
        <div className="space-y-1">
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
                    {assigned ? 'has an open log today' : !c.userId ? 'not enrolled — no app account' : c.role || 'crew'}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <Button className="w-full mt-3" disabled={picked.size === 0 || sending} onClick={() => void send()}>
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
  const role = (getSessionUser()?.role ?? 'driller') as Role;
  const canEdit = can('drillPlans', 'PATCH');

  const plan = useLiveQuery(() => (planId ? db.drillPlans.get(planId) : undefined), [planId]);
  const job = useLiveQuery(() => (jobId ? db.jobs.get(jobId) : undefined), [jobId]);
  const drilling = usePlanDrilling(planId);
  const [dispatching, setDispatching] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);

  if (!plan) return <div className="p-4 text-center text-gray-500">Loading…</div>;

  const holes = getPlanHoles(plan);
  const editable = canEdit && plan.status === 'open';
  const update = (changes: Partial<DrillPlanRecord>) =>
    db.drillPlans.update(plan.id, { ...changes, updatedAt: nowISO() });
  // Drillers with an OPEN log today — greyed out in the dispatch picker
  const assignedToday = new Set(
    (drilling?.logs ?? [])
      .filter((l) => l.status === 'open')
      .map((l) => l.drillerUserId)
      .filter(Boolean),
  );

  return (
    <div>
      <div className="bg-navy text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button
            className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200 hover:text-white hover:bg-white/10"
            onClick={() => navigate(`/jobs/${plan.jobId}`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg truncate leading-tight">{plan.name}</h2>
            <p className="text-xs text-navy-200 truncate">
              {job?.name} · {holes?.length ?? 0} holes planned
              {drilling ? ` · ${drilling.totalHoles} drilled` : ''}
            </p>
          </div>
          <Badge variant={STATUS_BADGE[plan.status]}>{plan.status}</Badge>
          {editable && (
            <Button size="sm" variant="secondary" onClick={() => setDispatching(true)}>
              <Send className="h-4 w-4 mr-1" /> Send to drillers
            </Button>
          )}
          {canEdit && plan.status === 'open' && (drilling?.totalHoles ?? 0) > 0 && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                if ((drilling?.undrilled.length ?? 0) > 0) setConfirmComplete(true);
                else void update({ status: 'complete' });
              }}
            >
              Mark complete
            </Button>
          )}
          {canEdit && plan.status === 'complete' && (
            <Button size="sm" variant="secondary" onClick={() => void update({ status: 'open' })}>
              Reopen
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 max-w-3xl mx-auto space-y-4">
        {canEdit && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs">Plan name</Label>
              <Input value={plan.name} disabled={!editable}
                onChange={(e) => void update({ name: e.target.value })} />
            </div>
            <div><Label className="text-xs">Diameter (in)</Label>
              <Input type="number" value={plan.holeDiameter || ''} disabled={!editable}
                onChange={(e) => void update({ holeDiameter: parseFloat(e.target.value) || 0 })} /></div>
            <div><Label className="text-xs">Burden (ft)</Label>
              <Input type="number" value={plan.burden || ''} disabled={!editable}
                onChange={(e) => void update({ burden: parseFloat(e.target.value) || 0 })} /></div>
            <div><Label className="text-xs">Spacing (ft)</Label>
              <Input type="number" value={plan.spacing || ''} disabled={!editable}
                onChange={(e) => void update({ spacing: parseFloat(e.target.value) || 0 })} /></div>
          </div>
        )}

        {/* The grid — paint depths and kicks */}
        <div className="rounded-xl border border-gray-200 bg-white p-3">
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

        {/* Progress + the per-driller-per-day logs */}
        <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Drilling progress
            </p>
            {drilling && drilling.planned !== null && (
              <span className="text-sm font-medium">
                {drilling.totalHoles} of {drilling.planned} holes · {Math.round(drilling.totalFootage)} ft
              </span>
            )}
          </div>
          {drilling && drilling.planned !== null && drilling.planned > 0 && (
            <div className="h-2 rounded bg-gray-100 overflow-hidden">
              <i className="block h-full bg-safety-orange"
                style={{ width: `${Math.min(100, (drilling.totalHoles / drilling.planned) * 100)}%` }} />
            </div>
          )}
          {drilling && drilling.undrilled.length > 0 && drilling.totalHoles > 0 && (
            <p className="text-sm text-safety-orange">
              {drilling.undrilled.length} not drilled
              {drilling.undrilled.length <= 15 && `: ${drilling.undrilled.join(', ')}`}
            </p>
          )}
          {drilling && drilling.duplicateNumbers.length > 0 && (
            <p className="text-sm text-violation">
              ⚠ Drilled twice: {drilling.duplicateNumbers.join(', ')}
            </p>
          )}
          {drilling && (drilling.wetHoles > 0 || drilling.voidHoles > 0) && (
            <p className="text-sm text-blue-700">
              {drilling.wetHoles > 0 && `${drilling.wetHoles} wet`}
              {drilling.wetHoles > 0 && drilling.voidHoles > 0 && ' · '}
              {drilling.voidHoles > 0 && `${drilling.voidHoles} void`}
            </p>
          )}
          <div className="divide-y divide-gray-100">
            {(drilling?.logs ?? []).map((l) => (
              <button key={l.id}
                className="w-full flex items-center gap-2 py-2 text-left hover:bg-gray-50 rounded-lg"
                onClick={() => navigate(drillLogRoute(l))}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {l.drillerName || 'unassigned'} — {l.date ? formatDate(l.date) : formatDate(l.createdAt.slice(0, 10))}
                  </p>
                  <p className="text-xs text-gray-400">
                    {l.holeCount} holes · {Math.round(l.footage)} ft
                    {l.wetHoles > 0 ? ` · ${l.wetHoles} wet` : ''}
                    {l.deviations > 0 ? ` · ${l.deviations} off-plan` : ''}
                  </p>
                </div>
                <Badge variant={LOG_BADGE[l.status]}>{l.status}</Badge>
              </button>
            ))}
            {(drilling?.logs ?? []).length === 0 && (
              <p className="text-sm text-gray-400 py-2">
                No logs yet — send the plan to your drillers.
              </p>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <Label className="text-xs">Notes for the drillers</Label>
            <Input value={plan.notes ?? ''} disabled={!editable}
              placeholder="e.g. bench is tight on the west edge — start row 1 east"
              onChange={(e) => void update({ notes: e.target.value })} />
          </div>
        )}
        {!canEdit && plan.notes && (
          <p className="text-sm text-navy border border-gray-200 bg-navy-50 rounded-lg px-3 py-2">
            {plan.notes}
          </p>
        )}
      </div>

      {dispatching && (
        <DispatchModal plan={plan} alreadyAssigned={assignedToday} onClose={() => setDispatching(false)} />
      )}
      {confirmComplete && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="w-full sm:max-w-sm bg-white rounded-t-xl sm:rounded-xl p-4 space-y-3">
            <p className="font-bold">Mark plan complete?</p>
            <p className="text-sm text-gray-600">
              {drilling?.undrilled.length} planned hole{drilling?.undrilled.length === 1 ? '' : 's'} were
              never drilled. The plan closes as-is; you can reopen it later.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmComplete(false)}>Cancel</Button>
              <Button onClick={() => { void update({ status: 'complete' }); setConfirmComplete(false); }}>
                Complete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

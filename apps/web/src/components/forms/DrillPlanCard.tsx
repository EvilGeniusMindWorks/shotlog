// The drill plan's at-a-glance home at the TOP of the day page: build the
// plan, send it to drillers, and track every log's state — without digging
// into shot cards. Per-shot detail (DrillingSection) stays inside the cards;
// this reuses the same data hooks + the exact same dispatch modal.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Drill, Send } from 'lucide-react';
import { canPerformOp, type Role } from '@shotlog/shared';
import { useShotDrilling, getShotPlan } from '@/hooks/useDrillLogs';
import { SendToDrillersModal } from './DrillingSection';
import { getSessionUser } from '@/lib/session';
import type { Shot } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconChip } from '@/components/ui/section-card';

const STATUS_BADGE = { open: 'draft', complete: 'submitted', accepted: 'approved' } as const;

export function DrillPlanCard({
  shots,
  blastDayId,
  jobId,
  locked,
}: {
  shots: Shot[];
  blastDayId: string;
  jobId: string;
  locked: boolean;
}) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const [attention, setAttention] = useState<Record<string, boolean>>({});
  if (shots.length === 0) return null;

  const needsAttention = Object.values(attention).some(Boolean);
  const open = userOpen ?? needsAttention;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-3">
      <div
        role="button"
        tabIndex={0}
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer select-none min-h-[56px]"
        onClick={() => setUserOpen(!open)}
        onKeyDown={(e) => e.key === 'Enter' && setUserOpen(!open)}
      >
        <IconChip tint="navy">
          <Drill className="h-4 w-4" />
        </IconChip>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] leading-tight">Drill Plan</div>
          <div className="text-xs text-gray-500 truncate mt-0.5">
            {needsAttention ? 'Needs your attention' : 'Pattern design → drillers → review'}
          </div>
        </div>
        {open ? (
          <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
        )}
      </div>
      {/* Rows stay MOUNTED when collapsed (hidden, not unmounted): they carry
          the live queries that decide needs-attention, which drives both the
          subtitle and the default-open state. */}
      <div className={open ? 'px-4 pb-3 space-y-2' : 'hidden'}>
        {shots.map((shot) => (
          <ShotPlanRow
            key={shot.id}
            shot={shot}
            blastDayId={blastDayId}
            jobId={jobId}
            locked={locked}
            onAttention={(v) =>
              setAttention((a) => (a[shot.id] === v ? a : { ...a, [shot.id]: v }))
            }
          />
        ))}
      </div>
    </div>
  );
}

function ShotPlanRow({
  shot,
  blastDayId,
  jobId,
  locked,
  onAttention,
}: {
  shot: Shot;
  blastDayId: string;
  jobId: string;
  locked: boolean;
  onAttention: (needs: boolean) => void;
}) {
  const navigate = useNavigate();
  const role = (getSessionUser()?.role ?? 'blaster') as Role;
  const canSend = !locked && canPerformOp('drillLogs', 'PUT', role);
  const drilling = useShotDrilling(shot.id);
  const plan = getShotPlan(shot);
  const [showSend, setShowSend] = useState(false);

  const logs = drilling?.logs ?? [];
  const hasComplete = logs.some((l) => l.status === 'complete');
  const unsent = Boolean(plan) && logs.length === 0;
  const unplanned = !plan && logs.length === 0;
  // Attention = something for the blaster to DO (plan, send, or review)
  const needs = drilling !== undefined && !locked && (unsent || hasComplete || unplanned);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- parent callback is a stable-behavior setter
  useEffect(() => onAttention(needs), [needs]);

  return (
    <div className="rounded-lg border border-gray-200 p-2.5 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold">Shot {shot.shotNumber}</p>
        {plan ? (
          <span className="text-xs text-gray-500">{plan.length} holes planned</span>
        ) : (
          <span className="text-xs text-gray-400">no per-hole plan</span>
        )}
        <span className="flex-1" />
        {canSend && plan && (
          <Button
            size="sm"
            variant={unsent ? 'safety' : 'outline'}
            onClick={() => setShowSend(true)}
          >
            <Send className="h-4 w-4 mr-1" />
            {unsent ? 'Send to drillers' : 'Send to more'}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(`/blast-day/${blastDayId}/design/${shot.id}`)}
        >
          {plan ? 'Plan ›' : 'Build plan ›'}
        </Button>
      </div>
      {unsent && (
        <p className="text-xs font-medium text-safety-orange">
          ⚠ Plan ready — not sent to a driller yet
        </p>
      )}
      {logs.map((log) => (
        <button
          key={log.id}
          className="w-full flex items-center gap-2 text-left text-sm py-1 border-t border-gray-100 hover:bg-gray-50"
          onClick={() => navigate(`/blast-day/${blastDayId}/drill-log/${log.id}`)}
        >
          <span className="flex-1 min-w-0 truncate">
            {log.drillerName || 'unassigned'} · {log.holeCount} holes · {log.footage.toFixed(0)} ft
          </span>
          {log.status === 'complete' && (
            <span className="text-xs font-semibold text-safety-orange shrink-0">Review ›</span>
          )}
          <Badge variant={STATUS_BADGE[log.status]}>{log.status}</Badge>
        </button>
      ))}
      {showSend && (
        <SendToDrillersModal
          shot={shot}
          blastDayId={blastDayId}
          jobId={jobId}
          alreadyAssigned={
            new Set(logs.map((l) => l.drillerUserId).filter(Boolean)) as Set<string>
          }
          onClose={() => setShowSend(false)}
        />
      )}
    </div>
  );
}

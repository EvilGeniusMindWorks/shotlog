// A person's page: who they are, where they've worked, and everything they
// filed. Office/admin/supervisor see the full picture; a field user sees
// their own page fully, but a teammate's page shows header + documents only
// (no day/hour tallies of coworkers).
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { buildPersonView } from '@/lib/personHistory';
import { buildDocRows } from '@/lib/docRows';
import { DocList } from '@/components/records/DocList';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

function MiniStat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-2.5 py-1.5">
      <p className="text-lg font-bold tabular-nums">{n}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-tight">{label}</p>
    </div>
  );
}

export function CrewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = getSessionUser();
  const role = me?.role ?? '';

  const crew = useLiveQuery(() => (id ? db.crewMembers.get(id) : undefined), [id]);
  const fullView =
    role === 'admin' ||
    role === 'office' ||
    role === 'supervisor' ||
    (crew?.userId !== undefined && crew?.userId === me?.id);

  const view = useLiveQuery(
    async () => (crew && fullView ? buildPersonView(crew) : undefined),
    [crew?.id, fullView],
  );
  const docs = useLiveQuery(
    async () =>
      crew ? buildDocRows({ scope: 'company', role: role || 'admin', person: crew }) : undefined,
    [crew?.id],
  );

  if (!crew) return <div className="p-4 text-center text-gray-500">Loading…</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3">
      <div className="flex items-center gap-2">
        <button
          className="h-10 w-10 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-gray-900 truncate">{crew.name}</h2>
          <p className="text-xs text-gray-400">
            {crew.role || 'crew'}
            {crew.licenseNumber && ` · license ${crew.licenseState} ${crew.licenseNumber}`}
          </p>
        </div>
        {crew.userId ? <Badge variant="synced">enrolled</Badge> : <Badge variant="local">no account</Badge>}
        {!crew.isActive && <Badge variant="local">inactive</Badge>}
      </div>

      {fullView && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            <MiniStat n={view?.stats.daysWorked ?? '—'} label="days worked" />
            <MiniStat n={view?.stats.totalHours ?? '—'} label="hours" />
            {(view?.stats.footageDrilled ?? 0) > 0 && (
              <MiniStat n={view!.stats.footageDrilled.toLocaleString()} label="ft drilled" />
            )}
            {(view?.stats.blastLogsSigned ?? 0) > 0 && (
              <MiniStat n={view!.stats.blastLogsSigned} label="blast logs signed" />
            )}
            {(view?.stats.checklists ?? 0) > 0 && (
              <MiniStat n={view!.stats.checklists} label="checklists" />
            )}
            {(view?.stats.incidents ?? 0) > 0 && (
              <MiniStat n={view!.stats.incidents} label="incidents" />
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Jobs worked
            </p>
            {(view?.jobs ?? []).map((j) => (
              <button
                key={j.jobId}
                className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded-lg"
                onClick={() => navigate(`/jobs/${j.jobId}`)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{j.jobName}</p>
                  <p className="text-xs text-gray-400">
                    {j.days} day{j.days === 1 ? '' : 's'} · {+j.hours.toFixed(1)} hrs · last{' '}
                    {formatDate(j.lastDate)}
                  </p>
                </div>
                <span className="text-xs text-gray-400">›</span>
              </button>
            ))}
            {view !== undefined && view.jobs.length === 0 && (
              <p className="text-sm text-gray-400 py-1">No logged work days yet.</p>
            )}
          </div>
        </>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Documents
        </p>
        <DocList rows={docs} />
      </div>
    </div>
  );
}

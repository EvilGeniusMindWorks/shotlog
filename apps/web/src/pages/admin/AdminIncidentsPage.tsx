// Office incident processing: open reports, claims in review, closed
// history — the office role's home turf.
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { getSessionUser } from '@/lib/session';
import { generateId, nowISO, todayISO, formatDate } from '@/lib/utils';
import type { Incident, IncidentType } from '@/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const TYPE_LABEL = { blasting: 'Blasting', utility: 'Utility', asset: 'Asset' };
const STATUS_BADGE = { open: 'draft', office_review: 'submitted', closed: 'approved' } as const;

export async function createIncident(
  type: IncidentType,
  links: Partial<Incident> = {},
): Promise<string> {
  const session = getSessionUser();
  const now = nowISO();
  const id = generateId();
  const incident: Incident = {
    id,
    type,
    status: 'open',
    date: todayISO(),
    time: '',
    description: '',
    reportedByName: session?.name ?? '',
    reportedByUserId: session?.id ?? '',
    ...links,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  };
  await db.incidents.add(incident);
  return id;
}

export function AdminIncidentsPage() {
  useOutletContext<{ online: boolean }>();
  const navigate = useNavigate();
  const incidents =
    useLiveQuery(() =>
      db.incidents.toArray().then((xs) => [...xs].sort((a, b) => b.date.localeCompare(a.date))),
    ) ?? [];
  const jobs = useLiveQuery(() => db.jobs.toArray()) ?? [];
  const jobName = (id?: string) => jobs.find((j) => j.id === id)?.name ?? '—';

  const groups = [
    { title: 'In office review', items: incidents.filter((i) => i.status === 'office_review') },
    { title: 'Open in the field', items: incidents.filter((i) => i.status === 'open') },
    { title: 'Closed', items: incidents.filter((i) => i.status === 'closed').slice(0, 20) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-gray-500 flex-1">
          Blasting complaints, utility strikes, and asset incidents — filed in the field,
          claims processed here.
        </p>
        <Button variant="outline" size="sm"
          onClick={() => void createIncident('asset').then((id) => navigate(`/incident/${id}`))}>
          <Plus className="h-4 w-4 mr-1" /> New (office-filed)
        </Button>
      </div>
      {groups.map((g) => (
        <section key={g.title}>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            {g.title} ({g.items.length})
          </h3>
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {g.items.map((i) => (
              <button key={i.id}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50"
                onClick={() => navigate(`/incident/${i.id}`)}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {i.description || 'No description yet'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {jobName(i.jobId)} · {formatDate(i.date)} · {i.reportedByName}
                    {i.claimStatus && ` · claim ${i.claimStatus}`}
                    {typeof i.claimAmount === 'number' && ` · $${i.claimAmount.toLocaleString()}`}
                  </p>
                </div>
                <Badge variant="secondary">{TYPE_LABEL[i.type]}</Badge>
                <Badge variant={STATUS_BADGE[i.status]}>{i.status.replace('_', ' ')}</Badge>
              </button>
            ))}
            {g.items.length === 0 && <p className="p-3 text-sm text-gray-400">None.</p>}
          </div>
        </section>
      ))}
    </div>
  );
}

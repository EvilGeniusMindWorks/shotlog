import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronRight } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useBlastDays, useJobs, createBlastDay, createJob } from '@/hooks/useBlastDay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, todayISO } from '@/lib/utils';
import { NewBlastDayDialog } from '@/components/forms/NewBlastDayDialog';

export function Dashboard() {
  const navigate = useNavigate();
  const blastDays = useBlastDays();
  const [search, setSearch] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);

  // Join job names for display
  const jobsMap = useLiveQuery(async () => {
    const jobs = await db.jobs.toArray();
    return Object.fromEntries(jobs.map((j) => [j.id, j]));
  }, []);

  const filtered = blastDays.filter((bd) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const job = jobsMap?.[bd.jobId];
    return (
      bd.date.includes(q) ||
      job?.name.toLowerCase().includes(q) ||
      job?.customer.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Blast Days</h2>
        <Button variant="safety" size="lg" onClick={() => setShowNewDialog(true)}>
          <Plus className="h-5 w-5 mr-1" /> New Blast Day
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by job, customer, or date..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No blast days yet</p>
          <p className="text-sm">Tap "New Blast Day" to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((bd) => {
            const job = jobsMap?.[bd.jobId];
            return (
              <Card
                key={bd.id}
                className="cursor-pointer hover:shadow-md transition-shadow active:bg-gray-50"
                onClick={() => navigate(`/blast-day/${bd.id}`)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900 truncate">
                        {job?.name ?? 'Unknown Job'}
                      </span>
                      <Badge variant={bd.status as 'draft' | 'submitted' | 'approved'}>
                        {bd.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-3">
                      <span>{formatDate(bd.date)}</span>
                      {job && <span className="truncate">{job.customer}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <Badge variant={bd.syncStatus as 'synced' | 'pending' | 'local'}>
                      {bd.syncStatus}
                    </Badge>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showNewDialog && (
        <NewBlastDayDialog
          onClose={() => setShowNewDialog(false)}
          onCreate={async (jobId, date, copy) => {
            const id = await createBlastDay(jobId, date, copy);
            setShowNewDialog(false);
            navigate(`/blast-day/${id}`);
          }}
        />
      )}
    </div>
  );
}

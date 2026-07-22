import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, MapPin } from 'lucide-react';
import { db } from '@/db';
import { formatDate } from '@/lib/utils';
import { useDraftRecord } from '@/hooks/useDraftRecord';
import { powderFactor } from '@shotlog/shared';
import type { Job } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const job = useLiveQuery(() => (id ? db.jobs.get(id) : undefined), [id]);

  const blastDays =
    useLiveQuery(async () => {
      if (!id) return [];
      const days = await db.blastDays.where('jobId').equals(id).sortBy('date');
      return days.reverse();
    }, [id]) ?? [];

  // Aggregate shots + explosives across the job's history for the stats bar
  const stats = useLiveQuery(async () => {
    if (!id) return { shots: 0, totalLbs: 0, totalYards: 0 };
    const days = await db.blastDays.where('jobId').equals(id).toArray();
    let shots = 0;
    let totalLbs = 0;
    let totalYards = 0;
    for (const day of days) {
      const log = await db.blastLogs.where('blastDayId').equals(day.id).first();
      if (!log) continue;
      const dayShots = await db.shots.where('blastLogId').equals(log.id).toArray();
      shots += dayShots.length;
      totalYards += dayShots.reduce((s, sh) => s + sh.totals.totalYardsShot, 0);
      const usage = await db.explosiveUsages.where('blastLogId').equals(log.id).first();
      totalLbs += usage?.totalPoundsShot ?? 0;
    }
    return { shots, totalLbs, totalYards };
  }, [id]) ?? { shots: 0, totalLbs: 0, totalYards: 0 };

  if (!job) {
    return <div className="p-4 text-center text-gray-500">Loading...</div>;
  }

  const avgPF = stats.totalYards > 0 ? powderFactor(stats.totalLbs, stats.totalYards) : 0;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/jobs')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg truncate">{job.name}</h2>
          <p className="text-sm text-gray-500 flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {[job.address, job.city, job.state].filter(Boolean).join(', ') || 'No address'}
          </p>
        </div>
        <Badge variant={job.isActive ? 'compliant' : 'draft'}>
          {job.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-2">
          <StatBox label="Blast Days" value={String(blastDays.length)} />
          <StatBox label="Total Shots" value={String(stats.shots)} />
          <StatBox label="K Factor" value={String(job.kFactor)} />
          <StatBox label="Avg PF" value={avgPF > 0 ? avgPF.toFixed(2) : '—'} />
        </div>

        <JobConfigCard job={job} />

        {/* Blast day history */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Blast Day History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {blastDays.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">No blast days yet.</p>
            )}
            {blastDays.map((day) => (
              <button
                key={day.id}
                className="w-full flex items-center justify-between border border-gray-200 rounded-lg p-3 text-left hover:bg-gray-50 active:bg-gray-100 min-h-[44px]"
                onClick={() => navigate(`/blast-day/${day.id}`)}
              >
                <span className="text-sm font-medium">{formatDate(day.date)}</span>
                <Badge variant={day.status as 'draft' | 'submitted' | 'approved'}>
                  {day.status}
                </Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
      <p className="font-mono text-lg font-bold text-navy">{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}

function JobConfigCard({ job }: { job: Job }) {
  const { draft, setField } = useDraftRecord(db.jobs, job);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Job Configuration</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Job Name</Label>
          <Input value={draft.name} onChange={(e) => setField('name', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Customer</Label>
          <Input value={draft.customer} onChange={(e) => setField('customer', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Address</Label>
          <Input value={draft.address} onChange={(e) => setField('address', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">City</Label>
          <Input value={draft.city} onChange={(e) => setField('city', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">State</Label>
          <Input
            value={draft.state}
            onChange={(e) => setField('state', e.target.value.toUpperCase().slice(0, 2))}
            maxLength={2}
          />
        </div>
        <div>
          <Label className="text-xs">
            K Factor
            <span className="text-gray-400 font-normal"> — drives PPV predictions</span>
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            value={draft.kFactor || ''}
            onChange={(e) => setField('kFactor', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <Label className="text-xs">Type of Rock</Label>
          <Input value={draft.typeOfRock} onChange={(e) => setField('typeOfRock', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Type of Terrain</Label>
          <Input
            value={draft.typeOfTerrain}
            onChange={(e) => setField('typeOfTerrain', e.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

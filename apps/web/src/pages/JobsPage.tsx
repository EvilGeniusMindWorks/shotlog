import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { createJob } from '@/hooks/useBlastDay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Plus, MapPin } from 'lucide-react';

const OPERATION_OPTIONS = [
  { value: 'construction', label: 'Construction' },
  { value: 'quarry', label: 'Quarry' },
  { value: 'trench', label: 'Trench' },
  { value: 'open', label: 'Open' },
];

export function JobsPage() {
  const navigate = useNavigate();
  const jobs = useLiveQuery(() => db.jobs.orderBy('updatedAt').reverse().toArray()) ?? [];
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    name: '', customer: '', address: '', city: '', state: '', operation: 'construction' as const,
    typeOfRock: '', typeOfTerrain: '', defaultHazards: '', defaultPrecautions: '', kFactor: 180,
  });

  const handleCreate = async () => {
    await createJob(form);
    setShowNew(false);
    setForm({ name: '', customer: '', address: '', city: '', state: '', operation: 'construction', typeOfRock: '', typeOfTerrain: '', defaultHazards: '', defaultPrecautions: '', kFactor: 180 });
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Jobs</h2>
        <Button onClick={() => setShowNew(!showNew)}>
          <Plus className="h-4 w-4 mr-1" /> New Job
        </Button>
      </div>

      {showNew && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">New Job</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Job Name *</Label><Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} /></div>
              <div><Label>Customer *</Label><Input value={form.customer} onChange={(e) => setForm({...form, customer: e.target.value})} /></div>
              <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} /></div>
              <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm({...form, city: e.target.value})} /></div>
              <div><Label>State</Label><Input value={form.state} onChange={(e) => setForm({...form, state: e.target.value.toUpperCase().slice(0,2)})} maxLength={2} /></div>
              <div><Label>Operation</Label><Select value={form.operation} onChange={(e) => setForm({...form, operation: e.target.value as typeof form.operation})} options={OPERATION_OPTIONS} /></div>
              <div><Label>Rock Type</Label><Input value={form.typeOfRock} onChange={(e) => setForm({...form, typeOfRock: e.target.value})} /></div>
              <div><Label>Terrain</Label><Input value={form.typeOfTerrain} onChange={(e) => setForm({...form, typeOfTerrain: e.target.value})} /></div>
              <div><Label>K Factor</Label><Input type="number" inputMode="decimal" value={form.kFactor || ''} onChange={(e) => setForm({...form, kFactor: parseFloat(e.target.value) || 0})} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button disabled={!form.name || !form.customer} onClick={handleCreate}>Create Job</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {jobs.map((job) => (
          <Card
            key={job.id}
            className="cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors"
            onClick={() => navigate(`/jobs/${job.id}`)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{job.name}</p>
                  <p className="text-sm text-gray-500">{job.customer}</p>
                  {job.city && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" />
                      {job.city}, {job.state}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{job.operation}</Badge>
                  <Badge variant={job.isActive ? 'compliant' : 'draft'}>
                    {job.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {jobs.length === 0 && (
          <p className="text-center py-8 text-gray-400">No jobs yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}

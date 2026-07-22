import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { createJob } from '@/hooks/useBlastDay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { todayISO } from '@/lib/utils';
import { Plus, X } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreate: (jobId: string, date: string) => void;
}

const OPERATION_OPTIONS = [
  { value: 'construction', label: 'Construction' },
  { value: 'quarry', label: 'Quarry' },
  { value: 'trench', label: 'Trench' },
  { value: 'open', label: 'Open' },
];

export function NewBlastDayDialog({ onClose, onCreate }: Props) {
  const jobs = useLiveQuery(() => db.jobs.where('isActive').equals(1).toArray()) ?? [];
  const [selectedJobId, setSelectedJobId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [showNewJob, setShowNewJob] = useState(false);
  const [newJob, setNewJob] = useState({
    name: '', customer: '', address: '', city: '', state: '', operation: 'construction' as const,
    typeOfRock: '', typeOfTerrain: '',
  });

  const handleCreate = async () => {
    let jobId = selectedJobId;
    if (showNewJob) {
      jobId = await createJob({
        name: newJob.name,
        customer: newJob.customer,
        address: newJob.address,
        city: newJob.city,
        state: newJob.state,
        operation: newJob.operation,
        typeOfRock: newJob.typeOfRock,
        typeOfTerrain: newJob.typeOfTerrain,
      });
    }
    if (!jobId) return;
    onCreate(jobId, date);
  };

  const canCreate = showNewJob ? newJob.name && newJob.customer : selectedJobId;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <Card className="w-full sm:max-w-lg max-h-[90vh] overflow-auto rounded-t-xl sm:rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>New Blast Day</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {!showNewJob ? (
            <div>
              <Label>Job</Label>
              <Select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                placeholder="Select a job..."
                options={jobs.map((j) => ({ value: j.id, label: `${j.name} — ${j.customer}` }))}
              />
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-navy"
                onClick={() => setShowNewJob(true)}
              >
                <Plus className="h-4 w-4 mr-1" /> Create New Job
              </Button>
            </div>
          ) : (
            <div className="space-y-3 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">New Job</span>
                <Button variant="ghost" size="sm" onClick={() => setShowNewJob(false)}>
                  Cancel
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Job Name *</Label>
                  <Input value={newJob.name} onChange={(e) => setNewJob({ ...newJob, name: e.target.value })} placeholder="Route 3 Widening" />
                </div>
                <div>
                  <Label>Customer *</Label>
                  <Input value={newJob.customer} onChange={(e) => setNewJob({ ...newJob, customer: e.target.value })} placeholder="ABC Corp" />
                </div>
                <div>
                  <Label>Address</Label>
                  <Input value={newJob.address} onChange={(e) => setNewJob({ ...newJob, address: e.target.value })} />
                </div>
                <div>
                  <Label>City</Label>
                  <Input value={newJob.city} onChange={(e) => setNewJob({ ...newJob, city: e.target.value })} />
                </div>
                <div>
                  <Label>State</Label>
                  <Input value={newJob.state} onChange={(e) => setNewJob({ ...newJob, state: e.target.value.toUpperCase().slice(0, 2) })} placeholder="MA" maxLength={2} />
                </div>
                <div>
                  <Label>Operation</Label>
                  <Select
                    value={newJob.operation}
                    onChange={(e) => setNewJob({ ...newJob, operation: e.target.value as typeof newJob.operation })}
                    options={OPERATION_OPTIONS}
                  />
                </div>
                <div>
                  <Label>Type of Rock</Label>
                  <Input value={newJob.typeOfRock} onChange={(e) => setNewJob({ ...newJob, typeOfRock: e.target.value })} placeholder="Granite" />
                </div>
                <div>
                  <Label>Type of Terrain</Label>
                  <Input value={newJob.typeOfTerrain} onChange={(e) => setNewJob({ ...newJob, typeOfTerrain: e.target.value })} placeholder="Flat" />
                </div>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end gap-2 pb-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="safety" disabled={!canCreate} onClick={handleCreate}>
            Create Blast Day
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

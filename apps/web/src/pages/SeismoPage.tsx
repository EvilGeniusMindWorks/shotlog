import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Camera, Plus, Trash2 } from 'lucide-react';
import { db } from '@/db';
import { generateId, nowISO } from '@/lib/utils';
import { checkCompliance, type ComplianceStatus } from '@shotlog/shared';
import type { SeismoReading } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STATUS_VARIANT: Record<ComplianceStatus, 'compliant' | 'warning' | 'violation'> = {
  compliant: 'compliant',
  warning: 'warning',
  violation: 'violation',
};

export function SeismoPage() {
  const { id, shotId } = useParams<{ id: string; shotId: string }>();
  const navigate = useNavigate();
  const shot = useLiveQuery(() => (shotId ? db.shots.get(shotId) : undefined), [shotId]);
  const blastDay = useLiveQuery(() => (id ? db.blastDays.get(id) : undefined), [id]);
  const job = useLiveQuery(
    () => (blastDay ? db.jobs.get(blastDay.jobId) : undefined),
    [blastDay?.jobId],
  );
  const readings =
    useLiveQuery(
      async () =>
        shotId
          ? (await db.seismoReadings.where('shotId').equals(shotId).toArray()).sort(
              (a, b) => a.graphNumber - b.graphNumber,
            )
          : [],
      [shotId],
    ) ?? [];
  const [adding, setAdding] = useState(false);

  if (!shot || !id) {
    return <div className="p-4 text-center text-gray-500">Loading...</div>;
  }

  const worst: ComplianceStatus = readings.reduce<ComplianceStatus>((acc, r) => {
    const order = { compliant: 0, warning: 1, violation: 2 };
    return order[r.complianceStatus] > order[acc] ? r.complianceStatus : acc;
  }, 'compliant');

  return (
    <div className="max-w-2xl mx-auto pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/blast-day/${id}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg">Seismo Readings — Shot #{shot.shotNumber}</h2>
            <p className="text-sm text-gray-500 truncate">{job?.name}</p>
          </div>
          {readings.length > 0 && (
            <Badge variant={STATUS_VARIANT[worst]}>
              {readings.length} graph{readings.length > 1 ? 's' : ''} ·{' '}
              {worst === 'compliant' ? 'Compliant' : worst === 'warning' ? 'Warning' : 'Violation'}
            </Badge>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {readings.map((reading) => (
          <ReadingCard key={reading.id} reading={reading} />
        ))}

        {readings.length === 0 && !adding && (
          <p className="text-sm text-gray-400 text-center py-6">
            No seismograph readings yet. Capture the printout and enter the values.
          </p>
        )}

        {adding ? (
          <AddReadingForm
            shotId={shot.id}
            graphNumber={readings.length + 1}
            structureDistance={shot.designPlan.closestStructureDistance}
            defaultLocation={shot.designPlan.closestStructureLocation}
            onDone={() => setAdding(false)}
          />
        ) : (
          <Button variant="safety" size="lg" className="w-full" onClick={() => setAdding(true)}>
            <Plus className="h-5 w-5 mr-1" /> Add Reading
          </Button>
        )}
      </div>
    </div>
  );
}

function ReadingCard({ reading }: { reading: SeismoReading }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!reading.printoutImage) {
      setImgUrl(null);
      return;
    }
    const url = URL.createObjectURL(reading.printoutImage);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [reading.printoutImage]);

  const maxPPV = Math.max(reading.ppvTran, reading.ppvVert, reading.ppvLong);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={`Graph ${reading.graphNumber} printout`}
              className="w-20 h-20 object-cover rounded-md border border-gray-200 shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-md border border-dashed border-gray-300 flex items-center justify-center text-gray-300 shrink-0">
              <Camera className="h-6 w-6" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold">Graph {reading.graphNumber}</span>
              {reading.seismographId && (
                <span className="text-xs text-gray-500">{reading.seismographId}</span>
              )}
              <Badge variant={STATUS_VARIANT[reading.complianceStatus]} className="ml-auto">
                {reading.complianceStatus}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-sm">
              <Metric label="PPV max" value={`${maxPPV.toFixed(3)} in/s`} strong />
              <Metric label="Freq" value={`${reading.frequency} Hz`} />
              <Metric label="Air" value={reading.airOverpressure ? `${reading.airOverpressure} dB` : '—'} />
              <Metric label="T" value={reading.ppvTran.toFixed(3)} />
              <Metric label="V" value={reading.ppvVert.toFixed(3)} />
              <Metric label="L" value={reading.ppvLong.toFixed(3)} />
            </div>
            {reading.location && (
              <p className="text-xs text-gray-500 mt-1 truncate">{reading.location}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (confirm(`Delete graph ${reading.graphNumber}?`)) {
                void db.seismoReadings.delete(reading.id);
              }
            }}
          >
            <Trash2 className="h-4 w-4 text-gray-400" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-xs text-gray-400">{label} </span>
      <span className={strong ? 'font-mono font-bold' : 'font-mono'}>{value}</span>
    </span>
  );
}

function AddReadingForm({
  shotId,
  graphNumber,
  structureDistance,
  defaultLocation,
  onDone,
}: {
  shotId: string;
  graphNumber: number;
  structureDistance: number;
  defaultLocation: string;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    seismographId: '',
    ppvTran: '',
    ppvVert: '',
    ppvLong: '',
    frequency: '',
    airOverpressure: '',
    operator: '',
    location: defaultLocation,
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const num = (v: string) => parseFloat(v) || 0;
  const maxPPV = Math.max(num(form.ppvTran), num(form.ppvVert), num(form.ppvLong));
  const freq = num(form.frequency);
  const canSave = maxPPV > 0 && freq > 0;

  // Live compliance preview using the MEASURED frequency
  const compliance =
    canSave && structureDistance > 0
      ? checkCompliance(maxPPV, freq, structureDistance)
      : canSave
        ? checkCompliance(maxPPV, freq, 5001) // no distance → strictest OSM band
        : null;

  const save = async () => {
    if (!canSave) return;
    const now = nowISO();
    const reading: SeismoReading = {
      id: generateId(),
      shotId,
      graphNumber,
      seismographId: form.seismographId,
      ppvTran: num(form.ppvTran),
      ppvVert: num(form.ppvVert),
      ppvLong: num(form.ppvLong),
      peakVectorSum: 0,
      frequency: freq,
      airOverpressure: num(form.airOverpressure),
      maxAccelTran: 0,
      maxAccelVert: 0,
      maxAccelLong: 0,
      maxDisplacementTran: 0,
      maxDisplacementVert: 0,
      maxDisplacementLong: 0,
      operator: form.operator,
      location: form.location,
      triggerTimestamp: now,
      sensorCheckPassed: true,
      calibrationDate: '',
      complianceStatus: compliance?.overall ?? 'compliant',
      printoutImage: photo,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    };
    await db.seismoReadings.add(reading);
    onDone();
  };

  return (
    <Card className="border-navy">
      <CardHeader>
        <CardTitle className="text-base">Add Reading — Graph {graphNumber}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Printout capture */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        />
        {photoUrl ? (
          <div className="relative">
            <img src={photoUrl} alt="Printout" className="w-full max-h-48 object-contain rounded-md border border-gray-200" />
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2 bg-white"
              onClick={() => fileRef.current?.click()}
            >
              Retake
            </Button>
          </div>
        ) : (
          <button
            className="w-full h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center gap-2 text-gray-400 hover:border-navy hover:text-navy transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Camera className="h-5 w-5" /> Capture Seismograph Printout
          </button>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">PPV Tran (in/s)</Label>
            <Input type="number" inputMode="decimal" step="0.001" value={form.ppvTran}
              onChange={(e) => setForm({ ...form, ppvTran: e.target.value })} placeholder="0.000" />
          </div>
          <div>
            <Label className="text-xs">PPV Vert (in/s)</Label>
            <Input type="number" inputMode="decimal" step="0.001" value={form.ppvVert}
              onChange={(e) => setForm({ ...form, ppvVert: e.target.value })} placeholder="0.000" />
          </div>
          <div>
            <Label className="text-xs">PPV Long (in/s)</Label>
            <Input type="number" inputMode="decimal" step="0.001" value={form.ppvLong}
              onChange={(e) => setForm({ ...form, ppvLong: e.target.value })} placeholder="0.000" />
          </div>
          <div>
            <Label className="text-xs">Frequency (Hz)</Label>
            <Input type="number" inputMode="decimal" value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })} placeholder="0" />
          </div>
          <div>
            <Label className="text-xs">Air (dB)</Label>
            <Input type="number" inputMode="decimal" value={form.airOverpressure}
              onChange={(e) => setForm({ ...form, airOverpressure: e.target.value })} placeholder="—" />
          </div>
          <div>
            <Label className="text-xs">Seismograph ID</Label>
            <Input value={form.seismographId}
              onChange={(e) => setForm({ ...form, seismographId: e.target.value })} placeholder="Micromate #1" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Operator</Label>
            <Input value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Location</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
        </div>

        {/* Live compliance vs the measured frequency */}
        {compliance && (
          <div className="flex flex-wrap gap-2">
            <Badge variant={STATUS_VARIANT[compliance.usbm.status]}>
              USBM: {maxPPV.toFixed(3)} vs {compliance.usbm.limit.toFixed(2)} in/s @ {freq} Hz
            </Badge>
            <Badge variant={STATUS_VARIANT[compliance.osm.status]}>
              OSM: {maxPPV.toFixed(3)} vs {compliance.osm.limit.toFixed(2)} in/s
            </Badge>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          <Button disabled={!canSave} onClick={save}>Save Reading</Button>
        </div>
      </CardContent>
    </Card>
  );
}

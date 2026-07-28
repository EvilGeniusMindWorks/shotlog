// Company-wide audit log (admin/office/supervisor): who changed what, when —
// straight from the server's append-only trail. Online-only by nature.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import {
  describeEntry,
  fetchAudit,
  fetchAuditActors,
  tableLabel,
  TABLE_LABEL,
  type AuditEntryView,
} from '@/lib/audit';
import { useLiveQuery } from '@/db';
import { findCrewId } from '@/lib/personHistory';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ListSkeleton } from '@/components/ui/skeleton';

const OP_TONE: Record<string, string> = {
  PUT: 'text-gray-500',
  PATCH: 'text-gray-500',
  DELETE: 'text-red-600',
  DISCARD: 'text-safety-orange',
};

export function AuditLens() {
  const online = useOnlineStatus();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actorId, setActorId] = useState('');
  const [tableName, setTableName] = useState('');
  const [actors, setActors] = useState<{ id: string; name: string }[]>([]);
  const [entries, setEntries] = useState<AuditEntryView[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const page = await fetchAudit({ from, to, actorId, tableName, cursor });
        setEntries((prev) => (cursor ? [...(prev ?? []), ...page.entries] : page.entries));
        setNextCursor(page.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'audit fetch failed');
      } finally {
        setLoading(false);
      }
    },
    [from, to, actorId, tableName],
  );

  useEffect(() => {
    if (!online) return;
    void load();
    void fetchAuditActors().then(setActors);
  }, [load, online]);

  if (!online) {
    return (
      <p className="text-sm text-gray-500 border border-gray-200 rounded-lg bg-white p-4">
        The audit trail lives on the server — connect to view it. Everything your crew does
        offline is recorded the moment it syncs.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" />
        Append-only server log — every change and every rejected write, with who and when.
      </p>
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="w-40">
          <Label className="text-xs">Person</Label>
          <Select
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            placeholder="Everyone"
            options={actors.map((a) => ({ value: a.id, label: a.name }))}
          />
        </div>
        <div className="w-44">
          <Label className="text-xs">Document</Label>
          <Select
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder="All documents"
            options={Object.entries(TABLE_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </div>
      </div>

      {error && <p className="text-sm text-violation">{error}</p>}
      {entries === null && !error && <ListSkeleton rows={4} />}
      {entries !== null && (
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {entries.map((e) => (
            <AuditRow key={e.id} entry={e} />
          ))}
          {entries.length === 0 && (
            <p className="p-4 text-sm text-gray-400">
              Nothing in this range yet — history accrues as changes sync.
            </p>
          )}
        </div>
      )}
      {nextCursor && (
        <Button variant="outline" disabled={loading} onClick={() => void load(nextCursor)}>
          {loading ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}

export function AuditRow({ entry }: { entry: AuditEntryView }) {
  const navigate = useNavigate();
  const crewId = useLiveQuery(
    () => findCrewId({ userId: entry.actorId, name: entry.actorName }),
    [entry.actorId, entry.actorName],
  );
  const when = new Date(entry.at).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <div className="px-3 py-2">
      <p className="text-xs text-gray-400">
        {when} ·{' '}
        {crewId ? (
          <button className="underline" onClick={() => navigate(`/crew/${crewId}`)}>
            {entry.actorName}
          </button>
        ) : (
          entry.actorName
        )}{' '}
        · {tableLabel(entry.tableName)}
        {entry.op === 'DELETE' || entry.op === 'DISCARD' ? (
          <span className={`ml-1 font-semibold ${OP_TONE[entry.op]}`}>{entry.op.toLowerCase()}</span>
        ) : null}
      </p>
      {/* change values can be unbroken JSON — force wrap so rows never overflow */}
      <p className={`text-sm break-all ${OP_TONE[entry.op] ?? ''}`}>{describeEntry(entry)}</p>
    </div>
  );
}

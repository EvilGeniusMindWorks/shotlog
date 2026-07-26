// PowerSync architecture spike — the replacement for the custom sync engine.
//
// What this proves end-to-end:
// - Postgres is the ONLY system of record; the device holds a PowerSync-
//   managed SQLite replica
// - Writes queue locally (works offline) and apply THROUGH the server in
//   order — device clocks are irrelevant by construction
// - Two browser origins = two devices converging with zero custom sync code
// - Status is always visible and truthful: connected / last synced / queued
import { useEffect, useRef, useState } from 'react';
import {
  AbstractPowerSyncDatabase,
  PowerSyncDatabase,
  Schema,
  Table,
  column,
  type PowerSyncBackendConnector,
} from '@powersync/web';

const schema = new Schema({
  records: new Table({
    table_name: column.text,
    payload: column.text,
    updated_at: column.text,
  }),
});

class SpikeConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { token } = await fetch('http://localhost:4100/token').then((r) => r.json());
    return { endpoint: 'http://localhost:8095', token };
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const tx = await database.getNextCrudTransaction();
    if (!tx) return;
    const ops = tx.crud.map((op) => ({ op: op.op, id: op.id, data: op.opData ?? {} }));
    const res = await fetch('http://localhost:4100/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops }),
    });
    if (!res.ok) throw new Error(`upload failed (${res.status})`);
    await tx.complete();
  }
}

let dbInstance: PowerSyncDatabase | null = null;
function getDb(): PowerSyncDatabase {
  if (!dbInstance) {
    dbInstance = new PowerSyncDatabase({
      schema,
      database: { dbFilename: 'shotlog-spike.db' },
    });
    void dbInstance.connect(new SpikeConnector());
  }
  return dbInstance;
}

interface Row {
  id: string;
  name: string;
  updated_at: string;
}

export function PowerSyncSpike() {
  const db = useRef(getDb()).current;
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState({ connected: false, lastSynced: '', queued: 0 });
  const [name, setName] = useState('');

  useEffect(() => {
    const abort = new AbortController();
    // Live query: re-renders on every local OR replicated change
    db.watch(
      "SELECT id, payload, updated_at FROM records WHERE table_name = 'crewMembers' ORDER BY updated_at DESC",
      [],
      {
        onResult: (result) => {
          const out: Row[] = [];
          for (const r of result.rows?._array ?? []) {
            try {
              out.push({ id: r.id, name: JSON.parse(r.payload).name, updated_at: r.updated_at });
            } catch {
              /* skip malformed */
            }
          }
          setRows(out);
        },
      },
      { signal: abort.signal },
    );
    const poll = window.setInterval(() => {
      void (async () => {
        const s = db.currentStatus;
        const queued = await db.getAll<{ c: number }>('SELECT COUNT(*) as c FROM ps_crud');
        setStatus({
          connected: s?.connected ?? false,
          lastSynced: s?.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleTimeString() : '',
          queued: queued[0]?.c ?? 0,
        });
      })();
    }, 1000);
    return () => {
      abort.abort();
      window.clearInterval(poll);
    };
  }, [db]);

  const add = async () => {
    if (!name.trim()) return;
    const id = crypto.randomUUID();
    await db.execute(
      'INSERT INTO records (id, table_name, payload, updated_at) VALUES (?, ?, ?, ?)',
      [id, 'crewMembers', JSON.stringify({ id, name: name.trim() }), new Date().toISOString()],
    );
    setName('');
  };

  const rename = async (row: Row) => {
    const next = window.prompt('New name', row.name);
    if (!next) return;
    await db.execute('UPDATE records SET payload = ?, updated_at = ? WHERE id = ?', [
      JSON.stringify({ id: row.id, name: next }),
      new Date().toISOString(),
      row.id,
    ]);
  };

  const remove = async (row: Row) => {
    await db.execute('DELETE FROM records WHERE id = ?', [row.id]);
  };

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', fontFamily: 'system-ui', padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>PowerSync spike — device {location.port}</h1>
      <p
        data-testid="status"
        style={{ fontFamily: 'monospace', fontSize: 13, color: status.connected ? 'green' : 'orange' }}
      >
        {status.connected ? '● connected' : '○ offline'} · last synced {status.lastSynced || '—'} ·{' '}
        {status.queued} queued write{status.queued === 1 ? '' : 's'}
      </p>
      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <input
          data-testid="name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
          placeholder="Crew member name"
          style={{ flex: 1, padding: 8, border: '1px solid #ccc', borderRadius: 6 }}
        />
        <button data-testid="add-btn" onClick={() => void add()} style={{ padding: '8px 16px' }}>
          Add
        </button>
      </div>
      <ul data-testid="rows" style={{ listStyle: 'none', padding: 0 }}>
        {rows.map((r) => (
          <li
            key={r.id}
            style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #eee' }}
          >
            <span style={{ flex: 1 }}>{r.name}</span>
            <button onClick={() => void rename(r)}>rename</button>
            <button onClick={() => void remove(r)}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

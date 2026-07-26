// Minimal SQL surface the facade needs. PowerSyncDatabase satisfies it via a
// thin wrapper (client.ts); tests satisfy it with node:sqlite.

export interface SqlRunner {
  execute(sql: string, params?: unknown[]): Promise<void>;
  getAll<R>(sql: string, params?: unknown[]): Promise<R[]>;
}

export interface SqlAdapter extends SqlRunner {
  /** Run fn atomically; rolls back if fn throws. */
  writeTransaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T>;
}

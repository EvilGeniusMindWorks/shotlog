// SqlAdapter over node:sqlite for unit-testing the facade without a browser.
// Mirrors the PowerSync client table: records(id PK, table_name, payload,
// updated_at). Test-only — never imported by app code.
import { DatabaseSync } from 'node:sqlite';
import type { SqlAdapter, SqlRunner } from './adapter';

type SqlParam = string | number | bigint | null | Uint8Array;

export function createTestAdapter(): SqlAdapter & { raw: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE records (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX by_table ON records (table_name);
  `);

  const runner: SqlRunner = {
    async execute(sql, params = []) {
      db.prepare(sql).run(...(params as SqlParam[]));
    },
    async getAll<R>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...(params as SqlParam[])) as R[];
    },
  };

  return {
    ...runner,
    raw: db,
    async writeTransaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T> {
      db.exec('BEGIN');
      try {
        const result = await fn(runner);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

// Blob-free SQL projections over the `records` table (perf slice,
// 2026-08-17). Full payload reads revive every inline base64 image
// (signatures, map snapshots, printout photos) as a JS Blob — the Safari
// tab-eviction pattern. Sweeping queries project ONLY the fields they
// need via json_extract and never touch the heavy columns.
//
// Rule of thumb: single-record `get()`s may revive; anything that walks a
// whole table goes through here.
import { getPowerSync } from './powersync/client';

const OUT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PATH_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;

/**
 * SELECT id + the given payload fields for every row of `table`.
 * `fields` maps output keys to payload paths ('date', 'totals.numHoles').
 * Values come back as SQLite scalars (string | number | null) — booleans
 * arrive as 0/1, objects/arrays as JSON strings.
 */
export async function projectTable<T extends Record<string, unknown>>(
  table: string,
  fields: Record<string, string>,
): Promise<(T & { id: string })[]> {
  const cols = Object.entries(fields)
    .map(([out, path]) => {
      if (!OUT_RE.test(out) || !PATH_RE.test(path)) throw new Error(`bad projection: ${out}/${path}`);
      return `json_extract(payload,'$.${path}') AS ${out}`;
    })
    .join(', ');
  return getPowerSync().getAll<T & { id: string }>(
    `SELECT id${cols ? `, ${cols}` : ''} FROM records WHERE table_name = ?`,
    [table],
  );
}

/** Hole counts per drill log in ONE grouped query (skipped markers are
 *  intent, not drilling — excluded, matching aggregateDrilling). */
export async function holeCountsByLog(): Promise<Map<string, number>> {
  const rows = await getPowerSync().getAll<{ logId: string; n: number }>(
    `SELECT json_extract(payload,'$.drillLogId') AS logId, COUNT(*) AS n
     FROM records WHERE table_name = 'drillLogHoles'
       AND json_extract(payload,'$.skipped') IS NOT 1
     GROUP BY logId`,
  );
  return new Map(rows.map((r) => [r.logId, r.n]));
}

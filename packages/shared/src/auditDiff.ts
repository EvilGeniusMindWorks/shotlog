// Field-level payload diff for the server audit trail. Shallow on purpose:
// top-level fields are what humans recognize ("burden", "workerName");
// nested objects compare by JSON equality and report as one change.

export interface AuditChange {
  field: string;
  old?: string;
  new?: string;
  /** 'created' | 'updated' (heavy fields, no values) | 'deleted' */
  note?: string;
}

/** Blob/base64-bearing fields — recorded as changed, values never copied */
const HEAVY_FIELDS = new Set([
  'data',
  'thumb',
  'pdf',
  'assets',
  'signatureImage',
  'printoutImage',
  'siteSketchImage',
  'snapshotImage',
  'shotDiagramData',
  'siteSketchData',
]);

const MAX_VALUE_LEN = 300;

function asComparable(v: unknown): string | undefined {
  return v === undefined ? undefined : JSON.stringify(v);
}

function truncate(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return v.length > MAX_VALUE_LEN ? `${v.slice(0, MAX_VALUE_LEN)}…` : v;
}

/** Diff old→new payloads into audit changes. Null/empty old = creation. */
export function diffPayloads(
  oldPayload: Record<string, unknown> | null | undefined,
  newPayload: Record<string, unknown>,
): AuditChange[] {
  if (!oldPayload || Object.keys(oldPayload).length === 0) {
    return [{ field: '*', note: 'created' }];
  }
  const changes: AuditChange[] = [];
  const keys = new Set([...Object.keys(oldPayload), ...Object.keys(newPayload)]);
  for (const key of keys) {
    const before = asComparable(oldPayload[key]);
    const after = asComparable(newPayload[key]);
    if (before === after) continue;
    if (HEAVY_FIELDS.has(key)) {
      changes.push({ field: key, note: 'updated' });
      continue;
    }
    changes.push({ field: key, old: truncate(before), new: truncate(after) });
  }
  return changes;
}

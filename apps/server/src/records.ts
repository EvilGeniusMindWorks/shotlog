// Helpers for the `records` document table, shared by the PowerSync upload
// path and the admin REST routes. All access is company-scoped.
import type { Prisma } from '@prisma/client';

export interface StoredRecord {
  tableName: string;
  payload: Record<string, unknown>;
}

export function parsePayloadSafe(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function getRecord(
  tx: Prisma.TransactionClient,
  cid: string,
  id: string,
): Promise<StoredRecord | null> {
  const rows = await tx.$queryRaw<{ table_name: string; payload: string }[]>`
    SELECT "table_name", "payload" FROM "records"
    WHERE "company_id" = ${cid} AND "id" = ${id}`;
  if (rows.length === 0) return null;
  return { tableName: rows[0].table_name, payload: parsePayloadSafe(rows[0].payload) };
}

/**
 * COALESCE upsert: PATCH-style writes carry only changed columns — absent
 * columns keep their stored values, never get defaulted. Conflict target is
 * the composite PK, so an identical id under another company is a separate
 * row, never a collision.
 */
export async function upsertRecord(
  tx: Prisma.TransactionClient,
  cid: string,
  id: string,
  tableName: string | null,
  payload: string | null,
  now: string,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "records" ("id", "company_id", "table_name", "payload", "updated_at")
    VALUES (${id}, ${cid}, ${tableName ?? ''}, ${payload ?? '{}'}, ${now})
    ON CONFLICT ("company_id", "id") DO UPDATE SET
      "table_name" = COALESCE(${tableName}, "records"."table_name"),
      "payload"    = COALESCE(${payload}, "records"."payload"),
      "updated_at" = ${now}`;
}

export async function deleteRecord(
  tx: Prisma.TransactionClient,
  cid: string,
  id: string,
): Promise<void> {
  await tx.$executeRaw`
    DELETE FROM "records" WHERE "id" = ${id} AND "company_id" = ${cid}`;
}

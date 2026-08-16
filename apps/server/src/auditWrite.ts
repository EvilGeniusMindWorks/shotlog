// Audit entries for server-side record writes OUTSIDE the /powersync/upload
// choke point (admin REST, enrollment, user↔roster sync). Field-device
// writes are audited in powersync.ts; these helpers close the gap so the
// ATF binder's change log covers OFFICE actions too — most critically the
// blast-day approve/send-back that locks field editing.
import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';

export interface AuditActor {
  actorId: string;
  actorName: string;
  actorRole: string;
}

/** Resolve the acting user once per request (JWT carries only the id). */
export async function resolveActor(
  userId: string | undefined,
  role: string | undefined,
): Promise<AuditActor> {
  const actorId = userId ?? 'system';
  const actorName = userId
    ? ((await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? actorId)
    : 'system';
  return { actorId, actorName, actorRole: role ?? 'system' };
}

/** Write one audit entry inside the caller's transaction. */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  entry: {
    companyId: string;
    tableName: string;
    recordId: string;
    op: 'PUT' | 'PATCH' | 'DELETE';
    actor: AuditActor;
    changes: unknown;
    reason?: string;
  },
): Promise<void> {
  await tx.auditEntry.create({
    data: {
      companyId: entry.companyId,
      tableName: entry.tableName,
      recordId: entry.recordId,
      op: entry.op,
      actorId: entry.actor.actorId,
      actorName: entry.actor.actorName,
      actorRole: entry.actor.actorRole,
      changes: entry.changes as Prisma.InputJsonValue,
      reason: entry.reason,
    },
  });
}

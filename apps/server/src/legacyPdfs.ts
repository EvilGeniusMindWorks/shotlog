// Legacy filed copies (before 2026-07-29) carry their whole PDF — and any
// frozen attachment copies — INSIDE the synced record as a base64 blob
// marker ({ __blob, __type }). Every device downloads every one of them on
// every first sync (Matthew's phone: 23 filings = 7.6 MB of an 8.4 MB
// company; 23.6 s). New filings keep the binary in R2 with a pointer in
// the record; this moves the old ones to the same place, the same keys
// the app's own uploader would have used, then rewrites the record:
// bytes out, pointer in, checksum/size kept as the integrity anchor.
//
// Runs at boot when file storage is configured (idempotent — a converted
// row no longer matches the query) and is reported on /health as
// `legacyInlinePdfs` so the number can be watched reaching zero. The
// document itself never changes; only where its bytes live.
import { createHash } from 'node:crypto';
import { prisma } from './db.js';
import { filesConfigured, putObjectDirect, submissionObjectKey } from './files.js';

interface BlobMarker {
  __blob: string; // base64
  __type?: string;
}
const isMarker = (v: unknown): v is BlobMarker =>
  typeof v === 'object' && v !== null && typeof (v as { __blob?: unknown }).__blob === 'string';

type Payload = Record<string, unknown> & {
  type?: string;
  date?: string;
  version?: number;
  pdf?: unknown;
  assets?: { id: string; fileName?: string; mimeType?: string; data?: unknown }[];
  assetKeys?: Record<string, string>;
};

const LEGACY_WHERE = `table_name = 'submissions' AND payload::jsonb -> 'pdf' ->> '__blob' IS NOT NULL`;

export async function countLegacyInlinePdfs(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint | number }[]>(
    `SELECT count(*) AS n FROM records WHERE ${LEGACY_WHERE}`,
  );
  return Number(rows[0]?.n ?? 0);
}

/** Pure: the record after its binaries moved to storage */
export function rewriteLegacyPayload(
  p: Payload,
  pdfKey: string,
  assetKeys: Record<string, string>,
  integrity?: { sha256: string; size: number },
): Payload {
  const assets = Array.isArray(p.assets) ? p.assets.map((a) => ({ ...a, data: null })) : [];
  return {
    ...p,
    // legacy rows predate the checksum — the anchor is computed while we hold the bytes
    ...(integrity ? { pdfSha256: (p as { pdfSha256?: string }).pdfSha256 ?? integrity.sha256, pdfSize: (p as { pdfSize?: number }).pdfSize ?? integrity.size } : {}),
    pdf: null,
    assets,
    storageStatus: 'stored',
    pdfKey,
    assetKeys: { ...(p.assetKeys ?? {}), ...assetKeys },
    updatedAt: new Date().toISOString(),
  };
}

export interface LegacyPdfMigration {
  candidates: number;
  moved: number;
  bytes: number;
  failed: number;
  skipped: string | null;
}

export async function migrateLegacyInlinePdfs(log: (msg: string) => void = console.log): Promise<LegacyPdfMigration> {
  const out: LegacyPdfMigration = { candidates: 0, moved: 0, bytes: 0, failed: 0, skipped: null };
  if (!filesConfigured()) {
    out.skipped = 'file storage not configured';
    log(`[legacy-pdfs] ${out.skipped} — nothing moved`);
    return out;
  }
  const rows = await prisma.$queryRawUnsafe<{ id: string; company_id: string; payload: string }[]>(
    `SELECT id, company_id, payload FROM records WHERE ${LEGACY_WHERE}`,
  );
  out.candidates = rows.length;
  for (const r of rows) {
    try {
      const p = JSON.parse(r.payload) as Payload;
      if (!isMarker(p.pdf)) continue;
      const pdfBytes = Buffer.from(p.pdf.__blob, 'base64');
      const fileName = `${p.type ?? 'filing'}-${p.date ?? 'undated'}-v${p.version ?? 1}.pdf`;
      const pdfKey = submissionObjectKey(r.company_id, `sub-pdf-${r.id}`, fileName);
      await putObjectDirect(pdfKey, pdfBytes, p.pdf.__type || 'application/pdf');
      out.bytes += pdfBytes.length;
      const assetKeys: Record<string, string> = {};
      for (const a of Array.isArray(p.assets) ? p.assets : []) {
        if (!isMarker(a.data)) continue;
        const bytes = Buffer.from(a.data.__blob, 'base64');
        const key = submissionObjectKey(r.company_id, `sub-asset-${r.id}-${a.id}`, a.fileName || a.id);
        await putObjectDirect(key, bytes, a.mimeType || a.data.__type || 'application/octet-stream');
        assetKeys[a.id] = key;
        out.bytes += bytes.length;
      }
      const next = rewriteLegacyPayload(p, pdfKey, assetKeys, {
        sha256: createHash('sha256').update(pdfBytes).digest('hex'),
        size: pdfBytes.length,
      });
      await prisma.$executeRawUnsafe(
        `UPDATE records SET payload = $1, updated_at = $2 WHERE company_id = $3 AND id = $4 AND table_name = 'submissions'`,
        JSON.stringify(next),
        String(next.updatedAt),
        r.company_id,
        r.id,
      );
      out.moved++;
    } catch (err) {
      out.failed++;
      log(`[legacy-pdfs] ${r.id}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }
  log(`[legacy-pdfs] moved ${out.moved}/${out.candidates} filing(s), ${(out.bytes / 1048576).toFixed(1)} MB to storage${out.failed ? `, ${out.failed} failed` : ''}`);
  return out;
}

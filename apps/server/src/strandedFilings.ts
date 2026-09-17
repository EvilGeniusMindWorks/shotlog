// S20 (Office Test, Sep 16 2026): three Beta blasting logs read "still on
// the device that filed it" for good. Their PDFs HAD reached storage — the
// uploader sent them — but the record's pointer never flipped, because the
// same copy also waited for frozen photo copies that were never written on
// that device, while the photos themselves already sat in storage on their
// own. The client now flips the pointer the moment the PDF lands and
// points at stored attachments (fileUploader.ts); this sweep repairs from
// the server side what an earlier build left behind, and finishes any copy
// whose photos are in storage under the attachment's own key.
//
// Runs at boot after the legacy migration when file storage is configured;
// idempotent (a repaired row no longer matches the query); reported on
// /health as `strandedFilings`. The document itself never changes — only
// where the record says its bytes live.
import { prisma } from './db.js';
import { filesConfigured, objectExists, submissionObjectKey } from './files.js';

type Payload = Record<string, unknown> & {
  type?: string;
  date?: string;
  version?: number;
  pdf?: unknown;
  pdfKey?: string;
  storageStatus?: string;
  assets?: { id: string; fileName?: string; mimeType?: string }[];
  assetKeys?: Record<string, string>;
};

// A filed copy still marked 'device' with no inline PDF (its bytes are in
// storage or nowhere), or one marked 'stored' with photos still unpointed
const STRANDED_WHERE = `table_name = 'submissions' AND (
  (payload::jsonb ->> 'storageStatus' = 'device' AND (payload::jsonb ->> 'pdf') IS NULL)
  OR (payload::jsonb ->> 'storageStatus' = 'stored'
      AND jsonb_array_length(coalesce(payload::jsonb -> 'assets', '[]'::jsonb))
        > (SELECT count(*) FROM jsonb_object_keys(coalesce(payload::jsonb -> 'assetKeys', '{}'::jsonb))))
)`;

export async function countStrandedFilings(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint | number }[]>(
    `SELECT count(*) AS n FROM records WHERE ${STRANDED_WHERE}`,
  );
  return Number(rows[0]?.n ?? 0);
}

export interface StrandedSweep {
  candidates: number;
  /** pointer flipped: the PDF was already in storage */
  adopted: number;
  /** photos pointed at their stored objects on an already-stored copy */
  photosFilled: number;
  /** the PDF is nowhere but the filing device — nothing to do from here */
  stillOnDevice: number;
  failed: number;
  skipped: string | null;
}

export async function adoptStrandedFilings(log: (msg: string) => void = console.log): Promise<StrandedSweep> {
  const out: StrandedSweep = { candidates: 0, adopted: 0, photosFilled: 0, stillOnDevice: 0, failed: 0, skipped: null };
  if (!filesConfigured()) {
    out.skipped = 'file storage not configured';
    log(`[stranded-filings] ${out.skipped} — nothing adopted`);
    return out;
  }
  const rows = await prisma.$queryRawUnsafe<{ id: string; company_id: string; payload: string }[]>(
    `SELECT id, company_id, payload FROM records WHERE ${STRANDED_WHERE}`,
  );
  out.candidates = rows.length;
  for (const r of rows) {
    try {
      const p = JSON.parse(r.payload) as Payload;
      let pdfKey = p.pdfKey;
      const wasStored = p.storageStatus === 'stored' && Boolean(pdfKey);
      if (!wasStored) {
        const fileName = `${p.type ?? 'filing'}-${p.date ?? 'undated'}-v${p.version ?? 1}.pdf`;
        const key = submissionObjectKey(r.company_id, `sub-pdf-${r.id}`, fileName);
        if (!(await objectExists(key))) {
          out.stillOnDevice++;
          continue;
        }
        pdfKey = key;
      }
      const assetKeys: Record<string, string> = { ...(p.assetKeys ?? {}) };
      for (const a of Array.isArray(p.assets) ? p.assets : []) {
        if (assetKeys[a.id]) continue;
        const frozen = submissionObjectKey(r.company_id, `sub-asset-${r.id}-${a.id}`, a.fileName || a.id);
        if (await objectExists(frozen)) {
          assetKeys[a.id] = frozen;
          continue;
        }
        const att = await prisma.$queryRawUnsafe<{ payload: string }[]>(
          `SELECT payload FROM records WHERE company_id = $1 AND table_name = 'attachments' AND id = $2`,
          r.company_id,
          a.id,
        );
        const ap = att[0] ? (JSON.parse(att[0].payload) as { storageStatus?: string; storageKey?: string }) : null;
        if (ap?.storageStatus === 'stored' && ap.storageKey) assetKeys[a.id] = ap.storageKey;
      }
      const photosBefore = Object.keys(p.assetKeys ?? {}).length;
      if (wasStored && Object.keys(assetKeys).length === photosBefore) continue; // nothing new to point at
      const next: Payload = {
        ...p,
        pdf: null,
        storageStatus: 'stored',
        pdfKey,
        assetKeys,
        updatedAt: new Date().toISOString(),
      };
      await prisma.$executeRawUnsafe(
        `UPDATE records SET payload = $1, updated_at = $2 WHERE company_id = $3 AND id = $4 AND table_name = 'submissions'`,
        JSON.stringify(next),
        String(next.updatedAt),
        r.company_id,
        r.id,
      );
      if (wasStored) out.photosFilled++;
      else out.adopted++;
    } catch (err) {
      out.failed++;
      log(`[stranded-filings] ${r.id}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }
  log(
    `[stranded-filings] ${out.candidates} candidate(s): ${out.adopted} adopted, ${out.photosFilled} finished their photos, ${out.stillOnDevice} still on the filing device${out.failed ? `, ${out.failed} failed` : ''}`,
  );
  return out;
}

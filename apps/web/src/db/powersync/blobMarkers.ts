// Blob <-> base64 marker serialization for JSON payloads.
//
// Wire format is IDENTICAL to the custom sync engine's (lib/sync.ts), so
// payloads already on the server migrate to the `records` table unchanged:
//   { __blob: "<base64>", __type: "image/png" }
//
// Unlike sync.ts this module avoids FileReader/atob/btoa so the facade can be
// unit-tested under Node.

export interface BlobMarker {
  __blob: string; // base64
  __type: string;
}

export function isBlobMarker(v: unknown): v is BlobMarker {
  return typeof v === 'object' && v !== null && '__blob' in v;
}

const CHUNK = 0x8000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  // btoa exists in browsers and Node >= 16
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function blobToMarker(blob: Blob): Promise<BlobMarker> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { __blob: bytesToBase64(bytes), __type: blob.type };
}

function markerToBlob(marker: BlobMarker): Blob | null {
  try {
    const bytes = base64ToBytes(marker.__blob);
    return bytes.length > 0 ? new Blob([bytes], { type: marker.__type }) : null;
  } catch {
    return null; // corrupted base64 — treat as absent rather than storing junk
  }
}

/** Deep-walk a record replacing every Blob with a JSON-safe marker. */
export async function serializeValue(value: unknown): Promise<unknown> {
  if (value instanceof Blob) return blobToMarker(value);
  if (Array.isArray(value)) return Promise.all(value.map(serializeValue));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await serializeValue(v);
    return out;
  }
  return value;
}

/** Deep-walk a parsed payload reviving every marker back into a Blob. */
export function reviveValue(value: unknown): unknown {
  if (isBlobMarker(value)) return markerToBlob(value);
  if (Array.isArray(value)) return value.map(reviveValue);
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = reviveValue(v);
    return out;
  }
  return value;
}

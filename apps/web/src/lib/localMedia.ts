// Device-local media store (raw IndexedDB, NEVER synced): the capture buffer
// on the origin device and the download cache on every other device. Full
// videos live ONLY here until a clip is extracted; photos/PDFs sit here
// briefly until the background uploader lands them in R2.

const DB_NAME = 'shotlog-local-media';
const STORE = 'media';

/** Sep 15 2026 (Matthew's phone: "only the office copy failed: null"): a
 *  failed IndexedDB transaction carries no error object on Safari when it
 *  refuses to store a Blob, so every rejection here says what it was doing. */
function idbError(what: string, err: DOMException | null | undefined): Error {
  const e = new Error(`${what}: ${err?.name ?? 'the browser aborted the write'}${err?.message ? ` — ${err.message}` : ''}`);
  e.name = err?.name ?? 'MediaStoreError';
  return e;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(idbError('opening the media store', req.error));
    req.onblocked = () => reject(idbError('opening the media store', null));
  });
}

/** Stored shape: the bytes and the type. Safari has refused to store Blob
 *  values in IndexedDB (a transaction that aborts with no error) — an
 *  ArrayBuffer always stores. Older rows hold a Blob and still read back. */
interface StoredMedia {
  type: string;
  buf: ArrayBuffer;
}

export async function putLocalMedia(id: string, blob: Blob): Promise<void> {
  const buf = await blob.arrayBuffer();
  const row: StoredMedia = { type: blob.type, buf };
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(row, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(idbError('saving the file on this device', tx.error));
      tx.onabort = () => reject(idbError('saving the file on this device', tx.error));
    });
  } finally {
    db.close();
  }
}

export async function getLocalMedia(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(idbError('reading the file on this device', req.error));
    });
    if (value === undefined || value === null) return undefined;
    if (value instanceof Blob) return value;
    const row = value as StoredMedia;
    return row.buf ? new Blob([row.buf], { type: row.type || 'application/octet-stream' }) : undefined;
  } finally {
    db.close();
  }
}

export async function deleteLocalMedia(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listLocalMediaIds(): Promise<string[]> {
  const db = await openDb();
  const keys = await new Promise<string[]>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return keys;
}

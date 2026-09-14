// A day at a job — the shared card and its edit log (Round S13, Sep 14 2026).
//
// The card is the small set of facts a whole crew shares for one job on one
// date: type of work, on-site time, the conditions, the day's label. It lives
// on the work day record, but after the day exists its facts are SERVER-OWNED:
// a phone never rewrites them directly. A change travels as a `dayCardEdits`
// row — one per fact — carrying the version it was based on. The server
// applies the edit when nobody set that fact since (first to land sticks) and
// marks it `applied`; otherwise it marks it `held` with the current value and
// its author, and the phone asks its person to decide. Nothing shared is ever
// overwritten silently. Shared by the web app and the server.

export const CARD_PATHS = [
  'typeOfWork',
  'onsiteTime',
  'conditions.temperatureRange',
  'conditions.weather',
  'conditions.windDirection',
  'conditions.groundConditions',
  'conditions.weatherNotes',
  'name',
] as const;
export type CardPath = (typeof CARD_PATHS)[number];

export function isCardPath(p: string): p is CardPath {
  return (CARD_PATHS as readonly string[]).includes(p);
}

/** Who set a card fact last, and the version that write produced */
export interface CardSet {
  v: number;
  by: string;
  byName: string;
  at: string;
}

export type CardSets = Partial<Record<CardPath, CardSet>>;

export function getPath(obj: Record<string, unknown>, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Returns a shallow-copied object with `path` set (never mutates the input) */
export function withPath<T extends Record<string, unknown>>(obj: T, path: string, value: unknown): T {
  const parts = path.split('.');
  const out: Record<string, unknown> = { ...obj };
  let target = out;
  for (const part of parts.slice(0, -1)) {
    const next = target[part];
    target[part] = typeof next === 'object' && next !== null ? { ...(next as Record<string, unknown>) } : {};
    target = target[part] as Record<string, unknown>;
  }
  target[parts[parts.length - 1]] = value;
  return out as T;
}

export function cardValuesEqual(a: unknown, b: unknown): boolean {
  return (a ?? '') === (b ?? '');
}

/** The version of a fact on a day (0 = never set through an edit) */
export function cardVersion(sets: CardSets | undefined, path: CardPath): number {
  return sets?.[path]?.v ?? 0;
}

/** The plain-language label of a card fact (for decisions, banners, audits) */
export const CARD_PATH_LABEL: Record<CardPath, string> = {
  typeOfWork: 'Type of work',
  onsiteTime: 'On-site time',
  'conditions.temperatureRange': 'Temperature',
  'conditions.weather': 'Weather',
  'conditions.windDirection': 'Wind',
  'conditions.groundConditions': 'Ground',
  'conditions.weatherNotes': 'Weather notes',
  name: 'Day label',
};

/** Six-digit hex → 32-hex-char UUID-shaped string from a SHA-256 digest */
function uuidFromDigest(bytes: Uint8Array): string {
  const b = bytes.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version nibble 5 — "name-based"
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function sha256(text: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(text);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) return new Uint8Array(await subtle.digest('SHA-256', data));
  // No WebCrypto (a plain-http device on the LAN): a deterministic
  // non-cryptographic digest — the id only has to be the same everywhere
  return fnvDigest(data);
}

/** 16 bytes from four FNV-1a passes with different seeds */
function fnvDigest(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(16);
  for (let pass = 0; pass < 4; pass++) {
    let h = (0x811c9dc5 ^ (pass * 0x9e3779b9)) >>> 0;
    for (let i = 0; i < data.length; i++) {
      h ^= data[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out[pass * 4] = h & 0xff;
    out[pass * 4 + 1] = (h >>> 8) & 0xff;
    out[pass * 4 + 2] = (h >>> 16) & 0xff;
    out[pass * 4 + 3] = (h >>> 24) & 0xff;
  }
  return out;
}

/** A name-based id: the same inputs give the same id on every device */
export async function deterministicId(kind: string, ...parts: string[]): Promise<string> {
  return uuidFromDigest(await sha256(`shotlog:${kind}:${parts.join(':')}`));
}

/** One work day per company, job and date — two offline phones agree on it */
export function dayIdFor(companyId: string, jobId: string, date: string): Promise<string> {
  return deterministicId('day', companyId, jobId, date);
}

/** One confirmation row per person per day */
export function confirmationIdFor(blastDayId: string, userId: string): Promise<string> {
  return deterministicId('confirm', blastDayId, userId);
}

// ── Type of work (shared so the server can guard it) ──────────────────────

/** Office job-costing codes: DB / DO / DE / C / H on the paper forms */
export type WorkType =
  | 'drill_to_blast'
  | 'drill_only'
  | 'drill_to_excavate'
  | 'blasting'
  | 'crushing'
  | 'hauling';

/** Which work types carry a blasting log (and shots, explosives, seismo) */
export function isBlastingWork(typeOfWork: string | undefined): boolean {
  return typeOfWork === 'blasting' || typeOfWork === 'drill_to_blast';
}

/** The stamp the first opener leaves when the card is saved */
export interface DaySetup {
  by: string;
  byName: string;
  at: string;
}

/** What the server did with a card edit */
export type DayCardEditStatus = 'pending' | 'applied' | 'held' | 'resolved';

/** The value a held edit lost to, and who set it */
export interface DayCardEditCurrent {
  value: unknown;
  v: number;
  by: string;
  byName: string;
  at: string;
}

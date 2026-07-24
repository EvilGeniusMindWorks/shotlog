import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function dayOfWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

/** PNG/JPEG data URL → Blob (null on malformed input) */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [head, base64] = dataUrl.split(',');
    const type = head?.match(/^data:([^;]+);/)?.[1] ?? 'image/png';
    const bytes = Uint8Array.from(atob(base64 ?? ''), (c) => c.charCodeAt(0));
    return bytes.length > 0 ? new Blob([bytes], { type }) : null;
  } catch {
    return null;
  }
}

/** Blob → data URL */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

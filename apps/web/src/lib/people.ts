// Names on the roster (Admin › People one-shot add, 2026-09-07). `name` is
// "First Last" everywhere the app shows a person; the People list sorts and
// reads "Last, First". New people carry an explicit lastName; older rows
// derive it from the last word of the name.
import type { CrewMember } from '@/db/schema';

export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length <= 1) return { first: parts[0] ?? '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

export function lastNameOf(m: Pick<CrewMember, 'name' | 'lastName'>): string {
  // A one-word name sorts by that word — never by an empty string (which
  // would float every mononym to the top of the list)
  return (m.lastName ?? splitName(m.name).last ?? '').trim() || m.name.trim();
}

export function firstNameOf(m: Pick<CrewMember, 'name' | 'lastName'>): string {
  if (m.lastName) {
    const n = m.name.trim();
    return n.toLowerCase().endsWith(m.lastName.toLowerCase()) ? n.slice(0, n.length - m.lastName.length).trim() : n;
  }
  return splitName(m.name).first;
}

/** "Baltazar, Danny" — falls back to the plain name for one-word names */
export function lastFirst(m: Pick<CrewMember, 'name' | 'lastName'>): string {
  const last = lastNameOf(m);
  const first = firstNameOf(m);
  return last && first ? `${last}, ${first}` : m.name;
}

/** People-list order: active first, then last name, then first name */
export function compareByLastName(a: CrewMember, b: CrewMember): number {
  return (
    Number(b.isActive) - Number(a.isActive) ||
    lastNameOf(a).localeCompare(lastNameOf(b)) ||
    firstNameOf(a).localeCompare(firstNameOf(b))
  );
}

const EMAIL_RE = /[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/;

/** One pasted line → a person (+ optional email). Accepts
 *  "Last, First" · "First Last" · "First Last, email" · "Last, First, email"
 *  · "First Last <email>". */
export function parsePersonLine(raw: string): { name: string; lastName: string; email?: string } | null {
  let line = raw.trim();
  if (!line) return null;
  const emailMatch = line.match(EMAIL_RE);
  const email = emailMatch?.[0].toLowerCase();
  if (emailMatch) line = line.replace(emailMatch[0], '').replace(/[<>]/g, '').trim();
  const parts = line
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  let name: string;
  let lastName: string;
  if (parts.length >= 2) {
    // "Last, First"
    lastName = parts[0];
    name = `${parts[1]} ${parts[0]}`;
  } else {
    name = parts[0];
    lastName = splitName(name).last;
  }
  name = name.replace(/\s+/g, ' ').trim();
  return { name, lastName, ...(email ? { email } : {}) };
}

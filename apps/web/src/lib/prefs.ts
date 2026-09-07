// Per-DEVICE preferences (Round S7b, Settings › Preferences). Nothing here
// syncs: these are how THIS phone or tablet behaves for whoever holds it —
// the account-level choices (usual rig, PIN, signature) live elsewhere.
import type { WorkType } from '@/db/schema';

const WORK_TYPE_KEY = 'shotlog-default-work-type';
const COPY_SECTIONS_KEY = 'shotlog-copy-sections';

export const WORK_TYPES: WorkType[] = [
  'drill_to_blast',
  'blasting',
  'drill_only',
  'drill_to_excavate',
  'crushing',
  'hauling',
];

export const WORK_TYPE_LABEL: Record<WorkType, string> = {
  drill_to_blast: 'Drill to Blast',
  blasting: 'Blasting',
  drill_only: 'Drill Only',
  drill_to_excavate: 'Drill to Excavate',
  crushing: 'Crushing',
  hauling: 'Hauling',
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/** The type of work a new day starts on when neither the job's last day
 *  nor the job's own default says otherwise. null = follow the role. */
export function getDefaultWorkType(): WorkType | null {
  const v = read(WORK_TYPE_KEY);
  return v && (WORK_TYPES as string[]).includes(v) ? (v as WorkType) : null;
}

export function setDefaultWorkType(v: WorkType | null): void {
  write(WORK_TYPE_KEY, v);
}

export type CopySectionKey = 'blastInfo' | 'drillParams' | 'designPlan' | 'explosives' | 'crewEquipment';

export const COPY_SECTIONS: { key: CopySectionKey; label: string }[] = [
  { key: 'blastInfo', label: 'Blast Info' },
  { key: 'drillParams', label: 'Drill Params' },
  { key: 'designPlan', label: 'Design Plan' },
  { key: 'explosives', label: 'Explosives' },
  { key: 'crewEquipment', label: 'Crew & Equipment' },
];

const ALL_ON: Record<CopySectionKey, boolean> = {
  blastInfo: true,
  drillParams: true,
  designPlan: true,
  explosives: true,
  crewEquipment: true,
};

/** Which sections "Copy from previous" ticks by default */
export function getCopySections(): Record<CopySectionKey, boolean> {
  const raw = read(COPY_SECTIONS_KEY);
  if (!raw) return { ...ALL_ON };
  try {
    const parsed = JSON.parse(raw) as Partial<Record<CopySectionKey, boolean>>;
    return { ...ALL_ON, ...parsed };
  } catch {
    return { ...ALL_ON };
  }
}

export function setCopySections(v: Record<CopySectionKey, boolean>): void {
  write(COPY_SECTIONS_KEY, JSON.stringify(v));
}

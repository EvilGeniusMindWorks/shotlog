// The card's choices, in one place (S13): the day page, the setup form, the
// confirm sheet and the decisions card all read the same labels.
import type { CardPath } from '@shotlog/shared';
import { WORK_TYPE_LABEL } from '@/lib/prefs';

export const WEATHER_OPTIONS = [
  { value: 'sunny', label: 'Sunny' },
  { value: 'cloudy', label: 'Cloudy' },
  { value: 'partly_cloudy', label: 'Partly Cloudy' },
  { value: 'rain_light', label: 'Light Rain' },
  { value: 'rain_heavy', label: 'Heavy Rain' },
  { value: 'rain_out', label: 'Rain Out' },
];

/** Cool below 40°F, moderate to 70, warm above (design page, Sep 14 2026) */
export const TEMP_OPTIONS = [
  { value: 'low', label: 'Low (<40°F)' },
  { value: 'mod', label: 'Moderate (40–70°F)' },
  { value: 'high', label: 'High (>70°F)' },
];

export const GROUND_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'wet', label: 'Wet' },
  { value: 'muddy', label: 'Muddy' },
  { value: 'rock', label: 'Rock' },
  { value: 'frozen', label: 'Frozen' },
];

export const WORK_TYPE_OPTIONS = [
  { value: 'drill_only', label: 'Drill Only' },
  { value: 'drill_to_blast', label: 'Drill to Blast' },
  { value: 'drill_to_excavate', label: 'Drill to Excavate' },
  { value: 'blasting', label: 'Blasting' },
  { value: 'crushing', label: 'Crushing' },
  { value: 'hauling', label: 'Hauling' },
];

export const WIND_OPTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((d) => ({
  value: d,
  label: d,
}));

const OPTIONS_BY_PATH: Partial<Record<CardPath, { value: string; label: string }[]>> = {
  typeOfWork: WORK_TYPE_OPTIONS,
  'conditions.temperatureRange': TEMP_OPTIONS,
  'conditions.weather': WEATHER_OPTIONS,
  'conditions.groundConditions': GROUND_OPTIONS,
  'conditions.windDirection': WIND_OPTIONS,
};

/** "Drill to Blast", "Light Rain", "7:05", "—" */
export function cardValueLabel(path: CardPath, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  const opts = OPTIONS_BY_PATH[path];
  if (opts) return opts.find((o) => o.value === value)?.label ?? String(value);
  if (path === 'typeOfWork') return WORK_TYPE_LABEL[value as keyof typeof WORK_TYPE_LABEL] ?? String(value);
  return String(value);
}

/** The label of a value in any option list, or the raw value */
export function cardValueLabelFor(opts: { value: string; label: string }[], value: string | undefined | null): string {
  if (value === undefined || value === null || value === '') return '—';
  return opts.find((o) => o.value === value)?.label ?? String(value);
}

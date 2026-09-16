// Navigation (the navigation round, Sep 16 2026 — Matthew: "help me plan out a
// better universal paradigm that will be intuitive… a PWA without browser back
// buttons"). Three parts, written once:
//   · the PARENT MAP — every screen has one parent (`parentOf`), roots have none;
//   · the TRAIL — where this tab has been (`recordLocation`, kept per tab);
//   · the RULE (paradigm C) — the arrow goes to the parent, unless you came in
//     sideways from a root or a list that holds this record, then it takes
//     you back there; finishing lands forward (pages navigate with replace);
//     sheets close. When the target is in the trail the arrow walks the browser
//     history to it, so Android's back gesture and the arrow always agree.
import { useEffect, useReducer } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { screenNameFromRoute } from '@/lib/screenName';

export interface NavParent {
  to: string;
  label: string;
}
export interface TrailEntry {
  key: string;
  path: string;
  label: string;
}

// ── the trail ──────────────────────────────────────────────────────────────
const KEY = 'shotlog-nav-trail';
const listeners = new Set<() => void>();
let trail: TrailEntry[] = load();

function load(): TrailEntry[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TrailEntry[]) : [];
  } catch {
    return [];
  }
}
function save(): void {
  if (trail.length > 60) trail = trail.slice(-60);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail));
  } catch {
    /* private mode — the trail lives in memory for this page */
  }
  listeners.forEach((l) => l());
}
export function subscribeTrail(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function getTrail(): readonly TrailEntry[] {
  return trail;
}
/** Test hook: forget where this tab has been */
export function resetTrail(): void {
  trail = [];
  save();
}

/** Called on every location change (NavTrail component) */
export function recordLocation(key: string, path: string, type: 'PUSH' | 'REPLACE' | 'POP'): void {
  if (type === 'POP' && key === 'default') {
    // a fresh document: a reload of the last step keeps its place; a new
    // address (a link, the home-screen icon) is a new step
    const last = trail[trail.length - 1];
    trail = trail.map((e, n) => (e.key === 'default' ? { ...e, key: `load-${n}` } : e));
    if (last && samePath(last.path, path)) trail = [...trail.slice(0, -1), { ...last, key }];
    else trail = [...trail, { key, path, label: '' }];
    save();
    return;
  }
  const i = trail.findIndex((e) => e.key === key);
  if (type === 'REPLACE') {
    trail = [...trail.slice(0, -1), { key, path, label: '' }];
  } else if (i >= 0) {
    // back (POP) to a known step, or a push that re-keys a known step: cut the trail there
    trail = trail.slice(0, i + 1);
  } else {
    trail = [...trail, { key, path, label: '' }];
  }
  save();
}

/** A screen names itself once its title is known — the arrow on the next screen reads it */
export function setTrailLabel(key: string, label: string): void {
  const e = trail.find((x) => x.key === key);
  if (e && label && e.label !== label) {
    e.label = label;
    save();
  }
}

// ── the map ────────────────────────────────────────────────────────────────
const ROOTS = [/^\/$/, /^\/days$/, /^\/jobs$/, /^\/records$/, /^\/drill-logs$/, /^\/drilling$/, /^\/reference$/, /^\/settings$/, /^\/profile$/, /^\/admin(\/|$)/, /^\/help(\/|$)/];
/** Screens that hold other records: coming from one of these is "sideways", and the arrow returns there */
const LISTS = [/^\/jobs\/[^/]+$/, /^\/customers\/[^/]+$/, /^\/sites\/[^/]+$/, /^\/equipment\/[^/]+$/, /^\/crew\/[^/]+$/, /^\/blast-day\/[^/]+\/?$/, /^\/equipment-locator$/];

function split(route: string): { pathname: string; q: URLSearchParams } {
  const i = route.indexOf('?');
  return { pathname: i < 0 ? route : route.slice(0, i), q: new URLSearchParams(i < 0 ? '' : route.slice(i + 1)) };
}
export function isRoot(route: string): boolean {
  const { pathname } = split(route);
  return ROOTS.some((re) => re.test(pathname));
}
export function isList(route: string): boolean {
  const { pathname } = split(route);
  return LISTS.some((re) => re.test(pathname));
}
/** Two routes are the same screen: the path plus the view that matters */
export function samePath(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}
function normalize(route: string): string {
  const { pathname, q } = split(route);
  const p = pathname.replace(/\/+$/, '') || '/';
  const view = q.get('view') ?? (q.get('tab') === 'daily' ? 'daily-report' : '');
  const mode = q.get('mode') ?? '';
  return `${p}${view && view !== 'tiles' ? `?view=${view}` : ''}${mode ? `&mode=${mode}` : ''}`;
}

/** The parent in the map — static labels; a page passes a better one (the job's name) */
export function parentOf(route: string): NavParent | null {
  const { pathname, q } = split(route);
  if (ROOTS.some((re) => re.test(pathname))) return null;
  let m: RegExpMatchArray | null;
  if ((m = pathname.match(/^\/blast-day\/([^/]+)\/(design|seismo)\//))) return { to: `/blast-day/${m[1]}?view=blast-log`, label: 'Blasting log' };
  if ((m = pathname.match(/^\/blast-day\/([^/]+)\/drill-log\/([^/]+)\/(print|submit)/))) return { to: `/blast-day/${m[1]}/drill-log/${m[2]}`, label: 'Drill log' };
  if ((m = pathname.match(/^\/jobs\/([^/]+)\/drill-plan\/([^/]+)\/log\/([^/]+)\/(print|submit)/))) return { to: `/jobs/${m[1]}/drill-plan/${m[2]}/log/${m[3]}`, label: 'Drill log' };
  if ((m = pathname.match(/^\/blast-day\/([^/]+)\/drill-log\//))) return { to: `/blast-day/${m[1]}`, label: 'the work day' };
  if ((m = pathname.match(/^\/jobs\/([^/]+)\/drill-plan\/([^/]+)\/log\//))) return { to: `/jobs/${m[1]}/drill-plan/${m[2]}`, label: 'Drill plan' };
  if ((m = pathname.match(/^\/jobs\/([^/]+)\/drill-plan\//))) return { to: `/jobs/${m[1]}`, label: 'the job' };
  if ((m = pathname.match(/^\/blast-day\/([^/]+)\/print-daily/))) return { to: `/blast-day/${m[1]}?view=daily-report`, label: 'Daily report' };
  if ((m = pathname.match(/^\/blast-day\/([^/]+)\/(print|report)/))) return { to: `/blast-day/${m[1]}?view=blast-log`, label: 'Blasting log' };
  if ((m = pathname.match(/^\/blast-day\/([^/]+)\/submit/))) return { to: `/blast-day/${m[1]}`, label: 'the work day' };
  if (/^\/blast-day\/[^/]+\/setup/.test(pathname)) return { to: '/days', label: 'Work days' };
  if ((m = pathname.match(/^\/blast-day\/([^/]+)\/?$/))) {
    const v = q.get('view') ?? (q.get('tab') === 'daily' ? 'daily-report' : '');
    if (v === 'drilling' || v === 'readiness' || v === 'check') return { to: `/blast-day/${m[1]}?view=walkthrough`, label: 'Walkthrough' };
    if (v && v !== 'tiles') return { to: `/blast-day/${m[1]}`, label: 'the work day' };
    return { to: '/days', label: 'Work days' };
  }
  if (/^\/(jobs|customers|sites)\//.test(pathname)) return { to: '/jobs', label: 'Jobs' };
  if ((m = pathname.match(/^\/drill-checklist\/([^/?]+)/))) {
    const day = q.get('day');
    return day ? { to: `/blast-day/${day}`, label: 'the work day' } : { to: `/equipment/${m[1]}`, label: 'the rig' };
  }
  if (/^\/drill-checklist(\/|$)/.test(pathname)) {
    const day = q.get('day');
    return day ? { to: `/blast-day/${day}`, label: 'the work day' } : { to: '/', label: 'Dashboard' };
  }
  if ((m = pathname.match(/^\/incident\/([^/]+)\/(print|submit)/))) return { to: `/incident/${m[1]}`, label: 'Incident' };
  return { to: '/', label: 'Dashboard' };
}

// ── the rule ───────────────────────────────────────────────────────────────
export interface BackTarget {
  to: string;
  label: string;
  /** negative: walk the browser history this far (the gesture and the arrow agree) */
  delta?: number;
  why: 'sideways' | 'up-in-trail' | 'up';
}

export function backTarget(current: { key: string; path: string }, parent: NavParent | null): BackTarget | null {
  if (!parent) return null;
  const i = trail.findIndex((e) => e.key === current.key);
  const idx = i >= 0 ? i : trail.length;
  // the screen before this one, skipping steps that are this same screen (a sheet pushes one)
  let p = idx - 1;
  while (p >= 0 && samePath(trail[p].path, current.path)) p--;
  const prev = p >= 0 ? trail[p] : undefined;
  if (prev && !samePath(prev.path, parent.to) && (isRoot(prev.path) || isList(prev.path))) {
    return { to: prev.path, label: prev.label || screenNameFromRoute(prev.path), delta: p - idx, why: 'sideways' };
  }
  for (let k = idx - 1; k >= 0; k--) {
    // the parent is behind us: walk back to it, calling it what it called itself
    if (samePath(trail[k].path, parent.to)) return { to: parent.to, label: trail[k].label || parent.label, delta: k - idx, why: 'up-in-trail' };
  }
  return { to: parent.to, label: parent.label, why: 'up' };
}

/** The arrow for a screen whose parent the map already knows (print and filing screens) */
export function useBackHere(title?: string): { to: string; label: string; go: () => void } | null {
  const location = useLocation();
  return useBack(parentOf(location.pathname + location.search), title);
}

/** The arrow for a screen: where it goes and what it says. `title` names this screen in the trail. */
export function useBack(parent: NavParent | null, title?: string): { to: string; label: string; go: () => void } | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeTrail(() => tick()), []);
  useEffect(() => {
    if (title) setTrailLabel(location.key, title);
  }, [location.key, title]);
  const t = backTarget({ key: location.key, path: location.pathname + location.search }, parent);
  if (!t) return null;
  return {
    to: t.to,
    label: t.label,
    go: () => {
      if (t.delta && t.delta < 0) navigate(t.delta);
      // not in this tab's history (a link, a fresh open): step up without growing the history backwards
      else navigate(t.to, { replace: true });
    },
  };
}

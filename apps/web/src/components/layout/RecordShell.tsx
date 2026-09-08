// The adaptive record shell (screen-studies decision): a record's sections
// are defined ONCE and rendered two ways —
//   · TABS (Option A)   wide screens: identity band + stat strip + tab bar,
//                       Overview tab = every section as a preview card
//   · COMPACT (Option B) phones + portrait tablets: one scroll of
//                       collapsible cards whose closed headers show a summary
// The mode is width + orientation with a per-device override in Settings.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';

export type LayoutPref = 'auto' | 'compact' | 'tabs';
const LAYOUT_KEY = 'shotlog-layout';

export function getLayoutPref(): LayoutPref {
  const v = localStorage.getItem(LAYOUT_KEY);
  return v === 'compact' || v === 'tabs' ? v : 'auto';
}
export function setLayoutPref(pref: LayoutPref): void {
  localStorage.setItem(LAYOUT_KEY, pref);
  window.dispatchEvent(new Event('shotlog-layout-changed'));
}

/** tabs on desktop + landscape tablets; compact on phones + portrait tablets */
export function useLayoutMode(): 'tabs' | 'compact' {
  const compute = () => {
    const pref = getLayoutPref();
    if (pref !== 'auto') return pref;
    const wide =
      window.matchMedia('(min-width: 900px)').matches ||
      (window.matchMedia('(min-width: 700px)').matches &&
        window.matchMedia('(orientation: landscape)').matches);
    return wide ? 'tabs' : 'compact';
  };
  const [mode, setMode] = useState<'tabs' | 'compact'>(compute);
  useEffect(() => {
    const update = () => setMode(compute());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('shotlog-layout-changed', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('shotlog-layout-changed', update);
    };
  }, []);
  return mode;
}

export interface Crumb {
  label: string;
  to?: string;
}

export interface RecordSection {
  id: string;
  label: string;
  /** Count shown next to the label ("Sites · 3") */
  count?: number;
  /** One-line gist shown on the collapsed compact header + tab previews */
  summary?: string;
  defaultOpen?: boolean;
  render: () => ReactNode;
  /** Lighter stand-in for the Overview grid — use when render() is
   *  expensive (full-history scans) so Overview stays instant */
  preview?: () => ReactNode;
  /** S8b About card body (two short lines); falls back to `summary` */
  about?: ReactNode;
}

interface Props {
  breadcrumb: Crumb[];
  title: string;
  badge?: ReactNode;
  subline?: string;
  stats?: { label: string; value: string }[];
  actions?: ReactNode;
  sections: RecordSection[];
  /** S8b drill-down ("details first"): the sections become a row of About
   *  cards under the header — tap one to open that section — and `list`
   *  (the children: a customer's sites, a site's jobs) renders right after
   *  them. Compact: cards · list · collapsed sections. Wide: the same, on
   *  the Overview tab; the tab bar still opens any section in full. */
  aboutCards?: boolean;
  list?: ReactNode;
}

export function RecordShell({ breadcrumb, title, badge, subline, stats, actions, sections, aboutCards, list }: Props) {
  const navigate = useNavigate();
  const mode = useLayoutMode();
  const [tab, setTab] = useState('overview');
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map((s) => [s.id, s.defaultOpen ?? !aboutCards])),
  );
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  /** Compact: an About card opens its section and scrolls to it */
  const openSection = (id: string) => {
    setOpen((o) => ({ ...o, [id]: true }));
    window.setTimeout(() => sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };
  const aboutGrid = (onOpen: (id: string) => void) => (
    <div className={aboutCards ? 'flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 snap-x lg:grid lg:grid-cols-4 lg:overflow-visible lg:mx-0 lg:px-0' : ''} data-about-cards>
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          className="shrink-0 w-[46%] sm:w-[31%] lg:w-auto snap-start text-left rounded-xl border border-gray-200 bg-white px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100"
          onClick={() => onOpen(s.id)}
          data-about-card={s.id}
        >
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">
            {s.label}
            {s.count !== undefined ? ` · ${s.count}` : ''}
          </p>
          <div className="text-xs text-gray-700 mt-0.5 line-clamp-2 min-h-[2rem]">{s.about ?? s.summary ?? '—'}</div>
          <p className="text-[11px] text-safety-orange font-medium mt-1">Open ›</p>
        </button>
      ))}
    </div>
  );
  const upTo = breadcrumb.length ? breadcrumb[breadcrumb.length - 1].to : undefined;

  const header = (
    <div className="bg-navy text-white px-4 pt-3 pb-0">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <button
            className="h-9 w-9 -ml-2 rounded-lg flex items-center justify-center text-navy-200 hover:text-white hover:bg-white/10"
            onClick={() => (upTo ? navigate(upTo) : navigate(-1))}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <p className="text-[11px] text-navy-200 truncate">
            {breadcrumb.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1 text-navy-300">▸</span>}
                {c.to ? (
                  <button className="hover:underline" onClick={() => navigate(c.to!)}>
                    {c.label}
                  </button>
                ) : (
                  c.label
                )}
              </span>
            ))}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <h2 className="font-bold text-lg truncate leading-tight flex-1">{title}</h2>
          {badge}
          {actions}
        </div>
        {subline && <p className="text-xs text-navy-200 truncate mt-0.5">{subline}</p>}
        {mode === 'tabs' && stats && stats.length > 0 ? (
          <div className="flex gap-2 mt-2.5">
            {stats.map((s) => (
              <div key={s.label} className="flex-1 bg-white/10 rounded-lg px-2 py-1.5 text-center max-w-[130px]">
                <p className="font-mono font-bold text-[15px] leading-tight">{s.value}</p>
                <p className="text-[9px] uppercase tracking-wider text-navy-200">{s.label}</p>
              </div>
            ))}
          </div>
        ) : null}
        {mode === 'tabs' ? (
          <div className="flex gap-1 mt-2.5 -mb-px overflow-x-auto">
            {[{ id: 'overview', label: 'Overview' }, ...sections].map((t) => (
              <button
                key={t.id}
                className={
                  tab === t.id
                    ? 'px-3 py-2 text-sm font-medium text-white border-b-2 border-safety-orange whitespace-nowrap'
                    : 'px-3 py-2 text-sm font-medium text-navy-200 border-b-2 border-transparent hover:text-white whitespace-nowrap'
                }
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {'count' in t && t.count !== undefined ? (
                  <span className="ml-1 text-xs opacity-70">{t.count}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="pb-3" />
        )}
      </div>
    </div>
  );

  if (mode === 'tabs') {
    const active = sections.find((s) => s.id === tab);
    return (
      <div>
        {header}
        <div className="p-4 max-w-4xl mx-auto">
          {tab === 'overview' && aboutCards ? (
            <div className="space-y-4">
              {aboutGrid(setTab)}
              {list}
            </div>
          ) : tab === 'overview' ? (
            <div className="grid gap-4 md:grid-cols-2 items-start">
              {sections.map((s) => (
                <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <button
                    className="w-full flex items-center justify-between mb-2 text-left"
                    onClick={() => setTab(s.id)}
                  >
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                      {s.label}
                      {s.count !== undefined ? ` · ${s.count}` : ''}
                    </p>
                    <span className="text-xs text-safety-orange font-medium">Open ›</span>
                  </button>
                  {(s.preview ?? s.render)()}
                </div>
              ))}
            </div>
          ) : active ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4 max-w-2xl">
              {active.render()}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // COMPACT: one scroll, collapsible cards with summary headers
  return (
    <div>
      {header}
      <div className="p-4 max-w-2xl mx-auto space-y-3">
        {stats && stats.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {stats.slice(0, 4).map((s) => (
              <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-2 text-center">
                <p className="font-mono text-[15px] font-bold text-navy leading-tight">{s.value}</p>
                <p className="text-[9px] uppercase tracking-wider text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>
        )}
        {aboutCards && aboutGrid(openSection)}
        {aboutCards && list}
        {aboutCards && sections.length > 0 && (
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-2">Details</p>
        )}
        {sections.map((s) => {
          const isOpen = open[s.id] ?? true;
          return (
            <div key={s.id} className="rounded-xl border border-gray-200 bg-white scroll-mt-3" ref={(el) => { sectionRefs.current[s.id] = el; }} data-record-section={s.id}>
              <button
                className="w-full flex items-center gap-2 px-4 py-3 text-left"
                onClick={() => setOpen({ ...open, [s.id]: !isOpen })}
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                )}
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider shrink-0">
                  {s.label}
                  {s.count !== undefined ? ` · ${s.count}` : ''}
                </p>
                {!isOpen && s.summary && (
                  <p className="text-xs text-gray-400 truncate flex-1 text-right">{s.summary}</p>
                )}
              </button>
              {isOpen && <div className="px-4 pb-4">{s.render()}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

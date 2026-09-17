// S21 — the filmstrip (Matthew, Sep 16 2026: "I'd like the context of what
// was attached, not just the file name"): every attachment under the PDF with
// its context as the heading — "Shot 1 › Seismo reading 2 · pump house · PPV
// 0.18 in/s · 31 Hz" — who took it and when; kind chips and a search narrow
// it; a tap opens the lightbox (the photo full size, Hangs on, Taken by,
// File, Prev / Next / Download). Viewer B's chips and search with A's
// lightbox, as he chose on the plan page.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, Film, Search, X } from 'lucide-react';
import { kindLabel } from '@/lib/attachments';
import { cn } from '@/lib/utils';

export interface StripItem {
  id: string;
  fileName: string;
  mimeType: string;
  kind?: string;
  hangsOn?: string;
  capturedBy?: string;
  capturedAt?: string;
  size?: number;
  /** A video clip reference: the full video lives on the device that shot it */
  clipNote?: string;
  /** Instant offline thumbnail (a tiny data URL) when the live record has one */
  thumb?: string;
  /** Fetch the binary (frozen copy or live attachment); null = not reachable from here */
  load?: () => Promise<Blob | null>;
}

const GROUPS: { key: string; label: string; test: (k?: string) => boolean }[] = [
  { key: 'seismo', label: 'Seismo', test: (k) => /seismo/i.test(k ?? '') },
  { key: 'mats', label: 'Mats', test: (k) => /mat/i.test(k ?? '') },
  { key: 'video', label: 'Video', test: (k) => /video/i.test(k ?? '') },
  { key: 'bills', label: 'Bills', test: (k) => /bill|lading|delivery/i.test(k ?? '') },
  { key: 'photos', label: 'Photos', test: (k) => k === 'photo' },
];
export function groupOf(item: { kind?: string; mimeType: string }): { key: string; label: string } {
  const g = GROUPS.find((x) => x.test(item.kind));
  if (g) return g;
  if (item.mimeType.startsWith('video/')) return { key: 'video', label: 'Video' };
  if (item.kind && item.kind !== 'other') return { key: item.kind, label: kindLabel(item.kind) };
  return { key: 'other', label: 'Other' };
}

const fmtBytes = (n?: number) => (n === undefined ? '' : n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
const fmtWhen = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** Object URLs for the binaries, fetched lazily and revoked on unmount */
function useThumbs(items: StripItem[]) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const inflight = useRef<Set<string>>(new Set());
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  useEffect(() => {
    let alive = true;
    const queue = items.filter((i) => i.load && !i.thumb && !i.mimeType.startsWith('video/') && urlsRef.current[i.id] === undefined && !inflight.current.has(i.id));
    const runNext = async () => {
      const next = queue.shift();
      if (!next || !alive) return;
      inflight.current.add(next.id);
      try {
        const blob = await next.load!();
        if (!alive) return;
        setUrls((u) => ({ ...u, [next.id]: blob ? URL.createObjectURL(blob) : null }));
      } catch {
        if (alive) setUrls((u) => ({ ...u, [next.id]: null }));
      } finally {
        inflight.current.delete(next.id);
      }
      void runNext();
    };
    // three at a time: a filed blasting log can carry thirty printouts
    void runNext(); void runNext(); void runNext();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.id).join(',')]);
  useEffect(() => () => { for (const u of Object.values(urlsRef.current)) if (u) URL.revokeObjectURL(u); }, []);
  return urls;
}

export function AttachmentStrip({ items, title = 'Attachments', emptyText = 'No attachments on this copy.' }: { items: StripItem[]; title?: string; emptyText?: string }) {
  const [group, setGroup] = useState<string>('all');
  const [q, setQ] = useState('');
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const urls = useThumbs(items);

  const groups = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    for (const it of items) {
      const g = groupOf(it);
      m.set(g.key, { label: g.label, n: (m.get(g.key)?.n ?? 0) + 1 });
    }
    return [...m.entries()];
  }, [items]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => (group === 'all' || groupOf(it).key === group) && (!needle || [it.hangsOn, it.fileName, it.capturedBy, it.kind && kindLabel(it.kind)].some((v) => (v ?? '').toLowerCase().includes(needle))));
  }, [items, group, q]);

  const open = openIdx !== null ? shown[openIdx] : undefined;
  const openUrl = open ? (urls[open.id] ?? open.thumb ?? null) : null;
  useEffect(() => {
    if (openIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIdx(null);
      else if (e.key === 'ArrowRight') setOpenIdx((i) => (i === null ? null : Math.min(shown.length - 1, i + 1)));
      else if (e.key === 'ArrowLeft') setOpenIdx((i) => (i === null ? null : Math.max(0, i - 1)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openIdx, shown.length]);

  const download = async (it: StripItem) => {
    const blob = it.load ? await it.load() : null;
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = it.fileName || 'attachment';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  return (
    <div className="space-y-2" data-records-strip data-strip-count={items.length}>
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{title} · {items.length}</p>
        {items.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap" data-strip-chips>
            <button className={cn('rounded-full border px-2 py-0.5 text-[11px]', group === 'all' ? 'bg-navy text-white border-navy' : 'border-gray-300 text-gray-600')} onClick={() => setGroup('all')} data-strip-chip="all">All {items.length}</button>
            {groups.map(([k, g]) => (
              <button key={k} className={cn('rounded-full border px-2 py-0.5 text-[11px]', group === k ? 'bg-navy text-white border-navy' : 'border-gray-300 text-gray-600')} onClick={() => setGroup(group === k ? 'all' : k)} data-strip-chip={k}>
                {g.label} {g.n}
              </button>
            ))}
          </div>
        )}
        {items.length > 3 && (
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input className="h-7 w-44 rounded-md border border-gray-300 pl-7 pr-2 text-xs" placeholder="Find an attachment" value={q} onChange={(e) => setQ(e.target.value)} data-strip-search />
          </div>
        )}
      </div>
      {items.length === 0 && <p className="text-xs text-gray-400">{emptyText}</p>}
      {items.length > 0 && shown.length === 0 && <p className="text-xs text-gray-400">Nothing matches.</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {shown.map((it, i) => {
          const url = urls[it.id] ?? it.thumb ?? null;
          const isVideo = it.mimeType.startsWith('video/') || Boolean(it.clipNote);
          const g = groupOf(it);
          return (
            <button
              key={it.id}
              className="text-left rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-navy/50"
              onClick={() => setOpenIdx(i)}
              data-strip-item={it.id}
              data-strip-group={g.key}
              title={it.hangsOn}
            >
              <div className="h-24 bg-gray-100 flex items-center justify-center overflow-hidden">
                {url ? (
                  <img src={url} alt={it.fileName} className="h-full w-full object-cover" />
                ) : isVideo ? (
                  <Film className="h-7 w-7 text-gray-400" />
                ) : urls[it.id] === null || !it.load ? (
                  <FileText className="h-7 w-7 text-gray-300" />
                ) : (
                  <span className="text-[11px] text-gray-400">loading…</span>
                )}
              </div>
              <div className="p-1.5">
                <p className="text-[11px] font-medium text-gray-800 leading-tight line-clamp-2" data-strip-hangs-on>{it.hangsOn || kindLabel(it.kind)}</p>
                <p className="text-[10px] text-gray-400 truncate">
                  {g.label}{it.capturedBy ? ` · ${it.capturedBy}` : ''}{it.clipNote ? ` · ${it.clipNote}` : ''}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-[95] bg-black/85 flex flex-col" onClick={() => setOpenIdx(null)} data-records-lightbox>
          <div className="flex items-center gap-2 px-3 py-2 text-white/90 text-sm" onClick={(e) => e.stopPropagation()}>
            <p className="flex-1 min-w-0 truncate font-medium" data-lightbox-title>{open.hangsOn || kindLabel(open.kind)}</p>
            <span className="text-white/60 text-xs">{(openIdx ?? 0) + 1} of {shown.length}</span>
            <button className="p-1.5 rounded hover:bg-white/10" onClick={() => setOpenIdx(null)} aria-label="Close" data-lightbox-close><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center px-3" onClick={(e) => e.stopPropagation()}>
            {openUrl ? (
              <img src={openUrl} alt={open.fileName} className="max-h-full max-w-full object-contain" data-lightbox-image />
            ) : (
              <div className="text-center text-white/80 text-sm max-w-md space-y-1">
                {open.mimeType.startsWith('video/') || open.clipNote ? (
                  <>
                    <Film className="h-10 w-10 mx-auto text-white/60" />
                    <p>A video stays a clip on the copy.</p>
                    {open.clipNote && <p className="text-white/60 text-xs">{open.clipNote}</p>}
                  </>
                ) : urls[open.id] === null || !open.load ? (
                  <p>Not reachable from this device yet — it is still on the device that filed it, or needs signal to fetch.</p>
                ) : (
                  <p>Loading…</p>
                )}
              </div>
            )}
          </div>
          <div className="px-3 py-2 text-white/90 text-xs grid grid-cols-[76px_1fr] gap-x-2 gap-y-0.5 max-w-3xl w-full mx-auto" onClick={(e) => e.stopPropagation()} data-lightbox-facts>
            <span className="text-white/50">Hangs on</span><span data-lightbox-hangs-on>{open.hangsOn || '—'}</span>
            <span className="text-white/50">Taken by</span><span data-lightbox-taken-by>{open.capturedBy || '—'}{open.capturedAt ? ` · ${fmtWhen(open.capturedAt)}` : ''}</span>
            <span className="text-white/50">File</span><span data-lightbox-file>{open.fileName}{open.size ? ` · ${fmtBytes(open.size)}` : ''} · {groupOf(open).label}</span>
          </div>
          <div className="flex items-center justify-center gap-2 px-3 pb-3 pt-1" onClick={(e) => e.stopPropagation()}>
            <button className="h-9 px-3 rounded-lg bg-white/10 text-white text-sm flex items-center gap-1 disabled:opacity-40" disabled={(openIdx ?? 0) <= 0} onClick={() => setOpenIdx((i) => Math.max(0, (i ?? 0) - 1))} data-lightbox-prev><ChevronLeft className="h-4 w-4" /> Prev</button>
            <button className="h-9 px-3 rounded-lg bg-white/10 text-white text-sm flex items-center gap-1 disabled:opacity-40" disabled={(openIdx ?? 0) >= shown.length - 1} onClick={() => setOpenIdx((i) => Math.min(shown.length - 1, (i ?? 0) + 1))} data-lightbox-next>Next <ChevronRight className="h-4 w-4" /></button>
            <button className="h-9 px-3 rounded-lg bg-white/10 text-white text-sm flex items-center gap-1 disabled:opacity-40" disabled={!open.load} onClick={() => void download(open)} data-lightbox-download><Download className="h-4 w-4" /> Download</button>
            <button className="h-9 px-3 rounded-lg bg-white text-navy text-sm font-medium" onClick={() => setOpenIdx(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

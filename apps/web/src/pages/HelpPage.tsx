// The help guide at /help — public (readable before sign-in, linkable from
// the invitation), offline (bundled), one page per screen or task. Phone:
// sections › pages › page with "On this page" chips. Wide: the table of
// contents on the left, the page in the middle, "On this page" on the right.
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react';
import { ShotLogLogo } from '@/components/brand/ShotLogLogo';
import { getSession } from '@/lib/session';
import { openFeedbackComposer } from '@/components/feedback/FeedbackComposer';
import { Input } from '@/components/ui/input';
import {
  HELP_PAGES,
  SECTIONS,
  findPage,
  helpPath,
  pagesOf,
  renderHelp,
  searchHelp,
  type HelpPage as Page,
} from '@/help';

function StatusStrip({ page }: { page: Page }) {
  if (page.status === 'reviewed') return null;
  return page.status === 'planned' ? (
    <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600" data-help-status="planned">
      This page is written in the next batch. The rest of the guide is ready.
    </p>
  ) : (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-help-status="draft">
      Draft — being reviewed. Something wrong or missing?{' '}
      <button type="button" className="underline" onClick={() => openFeedbackComposer({ kind: 'question' })}>
        Send feedback
      </button>
      .
    </p>
  );
}

function Article({ page }: { page: Page }) {
  const navigate = useNavigate();
  const html = useMemo(() => renderHelp(page.body), [page]);
  const section = SECTIONS.find((s) => s.id === page.section);
  const siblings = pagesOf(page.section);
  const idx = siblings.findIndex((p) => p.slug === page.slug);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  // In-guide links stay in the app (no full reload); anchors scroll
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('/help')) {
      e.preventDefault();
      navigate(href);
    } else if (href.startsWith('#')) {
      e.preventDefault();
      document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  return (
    <article className="space-y-3" data-help-article={page.slug}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {section?.title}
        {page.updated && <span className="font-normal normal-case tracking-normal"> · updated {page.updated}</span>}
      </p>
      <h1 className="text-2xl font-bold text-gray-900 leading-tight">{page.title}</h1>
      <StatusStrip page={page} />
      {page.headings.length > 1 && (
        <div className="flex flex-wrap gap-1.5 lg:hidden" data-help-onthis>
          {page.headings.map((h) => (
            <a key={h.id} href={`#${h.id}`} className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs text-navy">
              {h.text}
            </a>
          ))}
        </div>
      )}
      <div className="help-doc" dangerouslySetInnerHTML={{ __html: html }} onClick={onClick} />
      <div className="flex justify-between gap-3 border-t border-gray-200 pt-3 text-sm">
        {prev ? (
          <Link to={helpPath(prev)} className="text-navy underline" data-help-prev>
            ‹ {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={helpPath(next)} className="text-navy underline text-right" data-help-next>
            {next.title} ›
          </Link>
        )}
      </div>
    </article>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <Input
        className="pl-9"
        placeholder="Search the guide…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-help-search
      />
    </div>
  );
}

function Results({ query }: { query: string }) {
  const hits = useMemo(() => searchHelp(query), [query]);
  return (
    <div className="space-y-1" data-help-results>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {hits.length} page{hits.length === 1 ? '' : 's'}
      </p>
      {hits.length === 0 && <p className="text-sm text-gray-500 py-4">Nothing matches “{query.trim()}”. Try one word, like “PIN” or “file”.</p>}
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
        {hits.map((h) => (
          <Link key={`${h.page.section}/${h.page.slug}`} to={helpPath(h.page)} className="block px-3 py-2.5 hover:bg-gray-50" data-help-hit={h.page.slug}>
            <p className="font-medium text-gray-900">{h.page.title}</p>
            <p className="text-xs text-gray-500">
              {SECTIONS.find((s) => s.id === h.page.section)?.title} · {h.snippet}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Toc({ section, page }: { section?: string; page?: string }) {
  return (
    <nav className="space-y-3" data-help-toc>
      {SECTIONS.map((s) => {
        const pages = pagesOf(s.id);
        if (pages.length === 0) return null;
        return (
          <div key={s.id}>
            <Link to={`/help/${s.id}`} className={`block text-[11px] font-semibold uppercase tracking-wider ${section === s.id ? 'text-navy' : 'text-gray-400'}`}>
              {s.title}
            </Link>
            <div className="mt-1 space-y-0.5">
              {pages.map((p) => (
                <Link
                  key={p.slug}
                  to={helpPath(p)}
                  className={`block rounded-md px-2 py-1 text-sm ${section === s.id && page === p.slug ? 'bg-navy/10 text-navy font-medium' : 'text-gray-700 hover:bg-gray-100'} ${p.status === 'planned' ? 'opacity-50' : ''}`}
                >
                  {p.title}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function HelpPage() {
  const { section, page: slug } = useParams<{ section?: string; page?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const signedIn = getSession().loggedIn;
  const sec = section ? SECTIONS.find((s) => s.id === section) : undefined;
  const page = section && slug ? findPage(section, slug) : undefined;
  useEffect(() => {
    setQuery('');
    window.scrollTo({ top: 0 });
  }, [location.pathname]);
  useEffect(() => {
    document.title = page ? `${page.title} · ShotLog help` : sec ? `${sec.title} · ShotLog help` : 'ShotLog help guide';
  }, [page, sec]);

  const back = page ? `/help/${page.section}` : section ? '/help' : signedIn ? '/' : null;
  const q = query.trim();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" data-help-guide>
      <header className="bg-navy text-white pt-[var(--sat)] pl-[var(--sal)] pr-[var(--sar)]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          {back ? (
            <button type="button" className="h-9 w-9 -ml-2 rounded-lg flex items-center justify-center text-navy-200 hover:text-white hover:bg-white/10 lg:hidden" onClick={() => navigate(back)} data-help-back aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}
          <Link to="/help" className="flex items-center gap-2">
            <ShotLogLogo size={28} tone="light" />
            <span className="font-semibold">Help guide</span>
          </Link>
          <div className="flex-1" />
          {signedIn ? (
            <Link to="/" className="text-sm text-navy-200 hover:text-white underline" data-help-to-app>
              Back to ShotLog
            </Link>
          ) : (
            <Link to="/" className="text-sm text-navy-200 hover:text-white underline" data-help-to-app>
              Sign in
            </Link>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-4 lg:grid lg:grid-cols-[230px_minmax(0,1fr)_170px] lg:gap-8">
        {/* wide: table of contents */}
        <aside className="hidden lg:block sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto pr-2">
          <div className="mb-3">
            <SearchBox value={query} onChange={setQuery} />
          </div>
          <Toc section={section} page={slug} />
        </aside>

        <main className="min-w-0 max-w-[70ch]">
          {q ? (
            <>
              <div className="lg:hidden mb-3">
                <SearchBox value={query} onChange={setQuery} />
              </div>
              <Results query={q} />
            </>
          ) : page ? (
            <Article page={page} />
          ) : sec ? (
            <div className="space-y-3" data-help-section={sec.id}>
              <div className="lg:hidden">
                <SearchBox value={query} onChange={setQuery} />
              </div>
              <h1 className="text-2xl font-bold">{sec.title}</h1>
              <p className="text-sm text-gray-500">{sec.blurb}</p>
              <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
                {pagesOf(sec.id).map((p) => (
                  <Link key={p.slug} to={helpPath(p)} className="flex items-center gap-2 px-3 py-3 hover:bg-gray-50" data-help-page-link={p.slug}>
                    <span className="flex-1 font-medium">{p.title}</span>
                    {p.status === 'planned' && <span className="text-[11px] text-gray-400">next batch</span>}
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4" data-help-home>
              <div className="lg:hidden">
                <SearchBox value={query} onChange={setQuery} />
              </div>
              <div>
                <h1 className="text-2xl font-bold">ShotLog help guide</h1>
                <p className="text-sm text-gray-500">
                  Short pages, one per thing you do. It works without signal, like the rest of the app. Pick who you are, or search.
                </p>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Who are you?</p>
              <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
                {SECTIONS.map((s) => {
                  const n = pagesOf(s.id).length;
                  if (!n) return null;
                  return (
                    <Link key={s.id} to={`/help/${s.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-gray-50" data-help-section-link={s.id}>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{s.title}</span>
                        <span className="block text-xs text-gray-500 truncate">{s.blurb}</span>
                      </span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">{n} pages</span>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </Link>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400">
                {HELP_PAGES.length} pages
                {HELP_PAGES.some((p) => p.status === 'planned') ? ` · ${HELP_PAGES.filter((p) => p.status === 'planned').length} still to write` : ''}
                {HELP_PAGES.some((p) => p.status === 'draft') ? ' · drafts under review' : ''}
              </p>
            </div>
          )}
        </main>

        {/* wide: on this page */}
        <aside className="hidden lg:block sticky top-4 self-start text-sm">
          {page && page.headings.length > 1 && (
            <div data-help-onthis-wide>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">On this page</p>
              {page.headings.map((h) => (
                <a key={h.id} href={`#${h.id}`} className="block py-0.5 text-gray-600 hover:text-navy" onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                  {h.text}
                </a>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

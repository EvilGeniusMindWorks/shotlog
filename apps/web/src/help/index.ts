// The help guide's content (plan artifact 16b5f92f, accepted 2026-09-08):
// Markdown files in apps/web/help/<section>/<page>.md, bundled at build
// time so the guide is offline and versioned with the app. This module
// reads their headers, orders them, renders them with `marked`, indexes
// them for search, and maps app routes to the page that explains them.
import { marked } from 'marked';

export type HelpStatus = 'draft' | 'reviewed' | 'planned';

export interface HelpSection {
  id: string;
  title: string;
  /** Who it is for, in one line — the landing card's sub-line */
  blurb: string;
}

export interface HelpPage {
  section: string;
  slug: string;
  title: string;
  order: number;
  /** App routes (with :params) this page explains — About this screen links here */
  screens: string[];
  updated: string;
  status: HelpStatus;
  /** Markdown body (without the header) */
  body: string;
  /** Second-level headings, for "On this page" */
  headings: { id: string; text: string }[];
  /** Lower-cased plain text, for search */
  text: string;
}

export const SECTIONS: HelpSection[] = [
  { id: 'start-here', title: 'Start here', blurb: 'Everyone: your invitation, PIN, install, offline, profile, help' },
  { id: 'blaster', title: 'Blaster', blurb: 'Your day, the drill plan, the blasting log, filing' },
  { id: 'driller', title: 'Driller', blurb: 'Your tiles, the plan you were sent, the drill log, the rig checklist' },
  { id: 'supervisor', title: 'Supervisor', blurb: 'Reviewing days, approving, sending back, time cards' },
  { id: 'shop', title: 'Shop', blurb: 'The queue, tickets, the fleet, PM due, the locator' },
  { id: 'office', title: 'Office', blurb: 'Your queue, records, approvals, compliance clocks, people' },
  { id: 'admin', title: 'Admin', blurb: 'People and roles, invitations, catalog, equipment, company' },
  { id: 'reference', title: 'Reference', blurb: 'What ShotLog calculates and checks, and where the numbers come from' },
  { id: 'troubleshooting', title: "Something's wrong", blurb: "Can't sign in, stuck syncing, forgot PIN, a day sent back" },
];

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ── markdown rendering ───────────────────────────────────────────────────
marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      return `<h${depth} id="${slugify(text.replace(/<[^>]+>/g, ''))}">${text}</h${depth}>\n`;
    },
    image({ href, text }) {
      const src = /^(https?:)?\/\//.test(href) || href.startsWith('/') ? href : `/help-img/${href}`;
      return `<figure><img src="${src}" alt="${text}" loading="lazy" /><figcaption>${text}</figcaption></figure>`;
    },
  },
});

export function renderHelp(body: string): string {
  return marked.parse(body, { async: false }) as string;
}

// ── loading ──────────────────────────────────────────────────────────────
const files = import.meta.glob('../../help/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function parse(path: string, raw: string): HelpPage | null {
  const m = path.match(/\/help\/([^/]+)\/([^/]+)\.md$/);
  if (!m) return null;
  const [, section, slug] = m;
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta: Record<string, string> = {};
  if (fm) for (const line of fm[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const body = fm ? raw.slice(fm[0].length) : raw;
  const headings = [...body.matchAll(/^## (.+)$/gm)].map((h) => ({ id: slugify(h[1]), text: h[1] }));
  const text = `${meta.title ?? ''}\n${body}`
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#>*_`]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const status = meta.status === 'reviewed' || meta.status === 'planned' ? meta.status : 'draft';
  return {
    section,
    slug,
    title: meta.title ?? slug,
    order: Number(meta.order ?? 99),
    screens: (meta.screens ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    updated: meta.updated ?? '',
    status,
    body,
    headings,
    text,
  };
}

const sectionRank = new Map(SECTIONS.map((s, i) => [s.id, i]));
export const HELP_PAGES: HelpPage[] = Object.entries(files)
  .map(([path, raw]) => parse(path, raw))
  .filter((p): p is HelpPage => p !== null)
  .sort((a, b) => (sectionRank.get(a.section) ?? 99) - (sectionRank.get(b.section) ?? 99) || a.order - b.order || a.title.localeCompare(b.title));

export const pagesOf = (section: string) => HELP_PAGES.filter((p) => p.section === section);
export const findPage = (section: string, slug: string) => HELP_PAGES.find((p) => p.section === section && p.slug === slug);
export const helpPath = (p: Pick<HelpPage, 'section' | 'slug'>) => `/help/${p.section}/${p.slug}`;

// ── route → page ─────────────────────────────────────────────────────────
function matchPattern(pattern: string, pathname: string): boolean {
  const [path, query] = pattern.split('?');
  const p = path.split('/').filter(Boolean);
  const a = pathname.split('/').filter(Boolean);
  if (p.length !== a.length) return false;
  if (!p.every((seg, i) => seg.startsWith(':') || seg === a[i])) return false;
  return !query;
}

/** The page that explains an app route — a `?view=` pattern beats the plain one */
export function helpForRoute(pathname: string, search = ''): HelpPage | null {
  const view = new URLSearchParams(search).get('view');
  let generic: HelpPage | null = null;
  for (const p of HELP_PAGES) {
    for (const s of p.screens) {
      const [path, query] = s.split('?');
      if (!matchPattern(path, pathname)) continue;
      if (query) {
        if (view && query === `view=${view}`) return p;
      } else generic ??= p;
    }
  }
  return generic;
}

// ── search ───────────────────────────────────────────────────────────────
export interface HelpHit {
  page: HelpPage;
  score: number;
  snippet: string;
}

export function searchHelp(query: string, limit = 8): HelpHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (terms.length === 0) return [];
  const hits: HelpHit[] = [];
  for (const page of HELP_PAGES) {
    let score = 0;
    let first = -1;
    for (const t of terms) {
      const i = page.text.indexOf(t);
      if (i < 0) { score = 0; break; }
      if (first < 0 || i < first) first = i;
      score += 1;
      if (page.title.toLowerCase().includes(t)) score += 3;
      if (page.headings.some((h) => h.text.toLowerCase().includes(t))) score += 2;
    }
    if (score === 0) continue;
    const start = Math.max(0, first - 40);
    const raw = page.text.slice(start, start + 130).trim();
    hits.push({ page, score, snippet: `${start > 0 ? '…' : ''}${raw}…` });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

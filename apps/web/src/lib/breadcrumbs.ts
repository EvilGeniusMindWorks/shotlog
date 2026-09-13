// Breadcrumbs (Round S11, Sep 13 2026): the last screens opened, buttons
// tapped and connection changes before a crash, so "how did they get there"
// is answered without a phone call. Labels only — never what was typed.
export interface Breadcrumb {
  at: string;
  kind: 'nav' | 'tap' | 'net' | 'sync' | 'app';
  text: string;
}

const MAX = 40;
const trail: Breadcrumb[] = [];

export function addBreadcrumb(kind: Breadcrumb['kind'], text: string) {
  const last = trail[trail.length - 1];
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!clean) return;
  // collapse an immediate repeat (a double-tap, a re-render of the same route)
  if (last && last.kind === kind && last.text === clean) return;
  trail.push({ at: new Date().toISOString(), kind, text: clean });
  if (trail.length > MAX) trail.splice(0, trail.length - MAX);
}

export function getBreadcrumbs(): Breadcrumb[] {
  return trail.slice();
}

/** What a person tapped, by its label — a button's text, an aria-label, a
 *  data-* hook the harnesses use — never an input's value. */
function labelFor(el: Element): string | null {
  const target = el.closest('button, a, [role="button"], [role="menuitem"], [role="tab"], summary, label, input[type="checkbox"], input[type="radio"], select') as HTMLElement | null;
  if (!target) return null;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input') {
    const input = target as HTMLInputElement;
    const name = input.getAttribute('aria-label') ?? input.name ?? input.id ?? '';
    return `${input.type} ${name}${input.type === 'checkbox' ? (input.checked ? ' → on' : ' → off') : ''}`.trim();
  }
  if (tag === 'select') return `select ${(target as HTMLSelectElement).name || target.id || ''}`.trim();
  const aria = target.getAttribute('aria-label');
  const hook = [...target.attributes].find((a) => a.name.startsWith('data-') && a.name !== 'data-state')?.name;
  const text = (target.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const base = aria || text || hook || tag;
  return hook && base !== hook ? `${base} [${hook}]` : base;
}

let installed = false;
export function installBreadcrumbs() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  document.addEventListener(
    'click',
    (ev) => {
      const el = ev.target as Element | null;
      if (!el || !(el instanceof Element)) return;
      const label = labelFor(el);
      if (label) addBreadcrumb('tap', label);
    },
    { capture: true, passive: true },
  );
  window.addEventListener('online', () => addBreadcrumb('net', 'online'));
  window.addEventListener('offline', () => addBreadcrumb('net', 'offline'));
  document.addEventListener('visibilitychange', () => addBreadcrumb('app', document.visibilityState === 'visible' ? 'foreground' : 'background'));
  addBreadcrumb('app', `start ${window.location.pathname}${window.location.search}`);
}

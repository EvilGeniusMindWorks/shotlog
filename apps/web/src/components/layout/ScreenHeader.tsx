// The one header every screen below a root uses (the navigation round): the
// arrow says where it goes ("‹ Blasting log"), wide screens show the path,
// and the rule behind the arrow lives in lib/nav.ts — a screen cannot ship
// with an arrow that goes somewhere of its own.
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useBack, type NavParent } from '@/lib/nav';

export interface Crumb {
  label: string;
  to?: string;
}

/** The labelled arrow alone — for screens that keep their own header markup */
export function BackButton({ back, tone = 'navy' }: { back: { to?: string; label: string; go: () => void } | null; tone?: 'navy' | 'gray' }) {
  if (!back) return null;
  return (
    <button
      type="button"
      className={
        'h-10 shrink-0 max-w-[40%] rounded-lg flex items-center gap-1 pl-1.5 pr-2.5 -ml-1.5 ' +
        (tone === 'navy' ? 'text-navy-100 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-navy hover:bg-gray-100')
      }
      data-nav-back
      data-nav-back-to={back.to ?? ''}
      aria-label={`Back to ${back.label}`}
      onClick={back.go}
    >
      <ArrowLeft className="h-5 w-5 shrink-0" />
      <span className="text-sm font-semibold truncate" data-nav-back-label>
        {back.label}
      </span>
    </button>
  );
}

export function ScreenHeader({
  parent,
  title,
  subtitle,
  path,
  actions,
  trailLabel,
  override,
  maxWidth = 'max-w-5xl',
  className = '',
  titleAttrs,
}: {
  /** null on a root: no arrow */
  parent: NavParent | null;
  title: ReactNode;
  subtitle?: ReactNode;
  /** wide screens: the path down from the root, every step tappable */
  path?: Crumb[];
  actions?: ReactNode;
  /** what the next screen's arrow calls this one (defaults to a string title) */
  trailLabel?: string;
  /** a screen with a step of its own before leaving (the day's fact sheet) */
  override?: { label: string; go: () => void } | null;
  maxWidth?: string;
  className?: string;
  titleAttrs?: Record<string, string | undefined>;
}) {
  const navigate = useNavigate();
  const back = useBack(parent, trailLabel ?? (typeof title === 'string' ? title : undefined));
  const arrow = override ?? back;
  return (
    <div className={`bg-navy text-white px-4 py-3 sticky top-0 z-20 ${className}`} data-screen-header>
      <div className={`${maxWidth} mx-auto flex items-center gap-2 sm:gap-3`}>
        {arrow && (
          <button
            type="button"
            className="h-10 shrink-0 max-w-[40%] rounded-lg flex items-center gap-1 pl-1.5 pr-2.5 -ml-1.5 text-navy-100 hover:text-white hover:bg-white/10"
            data-nav-back
            data-nav-back-to={'to' in arrow ? arrow.to : ''}
            aria-label={`Back to ${arrow.label}`}
            onClick={arrow.go}
          >
            <ArrowLeft className="h-5 w-5 shrink-0" />
            <span className="text-sm font-semibold truncate" data-nav-back-label>
              {arrow.label}
            </span>
          </button>
        )}
        <div className="flex-1 min-w-0" {...titleAttrs}>
          {path && path.length > 0 && (
            <p className="hidden sm:block text-[11px] text-navy-200 truncate" data-nav-path>
              {path.map((c, i) => (
                <span key={i}>
                  {i > 0 && <span className="mx-1 text-navy-300">▸</span>}
                  {c.to ? (
                    <button type="button" className="hover:underline" onClick={() => navigate(c.to!)}>
                      {c.label}
                    </button>
                  ) : (
                    c.label
                  )}
                </span>
              ))}
            </p>
          )}
          <h2 className="font-bold text-lg truncate leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-navy-200 truncate">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </div>
  );
}

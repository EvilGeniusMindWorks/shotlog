// Soft nag on the home screen until the profile is complete: license (licensed
// roles) and signature (anyone who signs). "Later" hides it for a day on
// this device; it never blocks — the hard stop lives at the signature.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IdCard, PenLine, ChevronRight } from 'lucide-react';
import { hasProfileGaps, profileGaps } from './profileCompletion';

const LATER_KEY = 'shotlog-profile-nag-until';

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(LATER_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function ProfileNagCard() {
  const [hidden, setHidden] = useState(snoozed);
  const gaps = profileGaps();
  if (hidden || !hasProfileGaps(gaps)) return null;
  const items = [
    gaps.license && { icon: IdCard, text: 'Add your blasting license — sign-off needs it' },
    gaps.signature && { icon: PenLine, text: 'Sign once — every sign-off becomes one tap' },
  ].filter(Boolean) as { icon: typeof IdCard; text: string }[];
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 sm:p-4" data-profile-nag>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-orange-700">Finish setting up</p>
          <ul className="mt-1 space-y-1">
            {items.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2 text-sm text-gray-800">
                <Icon className="h-4 w-4 text-safety-orange shrink-0" /> {text}
              </li>
            ))}
          </ul>
        </div>
        <Link
          to="/profile"
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-navy text-white text-sm font-medium px-3 py-2"
        >
          My Profile <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <button
        className="mt-2 text-xs text-gray-500 underline underline-offset-2"
        onClick={() => {
          try {
            localStorage.setItem(LATER_KEY, String(Date.now() + 86_400_000));
          } catch {
            /* private mode */
          }
          setHidden(true);
        }}
      >
        Later
      </button>
    </div>
  );
}

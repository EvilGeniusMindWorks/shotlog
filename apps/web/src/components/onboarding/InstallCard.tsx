// "Install ShotLog on this device" — the one card that knows the platform.
// Android/Chrome: replays the captured install prompt. iOS: Share → Add to
// Home Screen steps (Safari never offers a prompt). Already installed or
// nothing to offer: renders nothing. `always` ignores a prior "Not now"
// (the welcome screen wants it once regardless).
import { Share, SquarePlus } from 'lucide-react';
import { dismissInstall, promptInstall, useInstallState } from '@/lib/install';
import { ShotLogTile } from '@/components/brand/ShotLogLogo';
import { Button } from '@/components/ui/button';

export function InstallCard({ always = false, tone = 'card' }: { always?: boolean; tone?: 'card' | 'plain' }) {
  const s = useInstallState();
  if (s.standalone) return null;
  if (!always && s.dismissed) return null;
  // Android without Chrome's prompt (Samsung Internet, Firefox, a prompt Chrome
  // already spent): the manual route, never nothing (S9b follow-up, 2026-09-09)
  if (!s.canPrompt && !s.ios && !s.android) return null;

  const shell =
    tone === 'card'
      ? 'rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-2'
      : 'rounded-xl bg-gray-50 p-4 space-y-2';

  return (
    <div className={shell} data-install-card>
      <div className="flex items-start gap-3">
        {/* the actual app icon, so people know what to look for on the home screen */}
        <ShotLogTile size={40} className="shrink-0" />
        <div className="space-y-1 min-w-0">
          <p className="font-semibold text-gray-900">Install ShotLog on this device</p>
          {s.ios ? (
            <ol className="text-sm text-gray-600 space-y-1 list-none">
              <li className="flex items-center gap-2">
                <span className="text-gray-400">1.</span> Tap <Share className="h-4 w-4 inline text-navy" /> <b>Share</b> in Safari
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gray-400">2.</span> Choose <SquarePlus className="h-4 w-4 inline text-navy" /> <b>Add to Home Screen</b>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gray-400">3.</span> Open ShotLog from the icon from now on
              </li>
            </ol>
          ) : s.canPrompt ? (
            <p className="text-sm text-gray-600">
              Opens like an app, works offline, and keeps you signed in with your PIN.
            </p>
          ) : (
            <ol className="text-sm text-gray-600 space-y-1 list-none" data-install-manual={s.samsung ? 'samsung' : 'android'}>
              <li className="flex items-center gap-2">
                <span className="text-gray-400">1.</span> Open the browser menu <b>⋮</b> (top right)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gray-400">2.</span> Choose {s.samsung ? <><b>Add page to</b> → <b>Home screen</b></> : <><b>Install app</b> (or <b>Add to Home screen</b>)</>}
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gray-400">3.</span> Open ShotLog from the icon from now on
              </li>
            </ol>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 pl-12">
        {s.canPrompt && (
          <Button size="sm" onClick={() => void promptInstall()}>
            Install
          </Button>
        )}
        <button className="text-xs text-gray-500 underline underline-offset-2" onClick={dismissInstall}>
          Not now
        </button>
      </div>
    </div>
  );
}

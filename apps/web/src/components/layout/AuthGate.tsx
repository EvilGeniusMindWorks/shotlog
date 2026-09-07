import { useEffect, useState, type ReactNode } from 'react';
import { Delete, LockKeyhole, KeyRound, Sparkles } from 'lucide-react';
import {
  DEFAULT_SERVER_URL,
  changeMyPassword,
  forgotPassword,
  getRealSessionUser,
  getSession,
  getSessionUser,
  login,
  logout,
  markOnboarded,
  updateMyPin,
} from '@/lib/session';
import { connectPowerSync } from '@/db/powersync/client';
import { myHomeDashboard } from '@/lib/perms';
import { clearDevicePin, devicePinHash, setDevicePin } from '@/lib/pin';
import { InstallCard } from '@/components/onboarding/InstallCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShotLogTile } from '@/components/brand/ShotLogLogo';

// The PIN lives in lib/pin.ts — per ACCOUNT on this device (2026-09-07)
const LAST_ACTIVE_KEY = 'shotlog-last-active';
const LOCK_AFTER_MS = 5 * 60_000; // relock after 5 minutes hidden

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`shotlog-pin-salt:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

type GateState = 'login' | 'forgot' | 'change-password' | 'set-pin' | 'welcome' | 'locked' | 'open';

/**
 * App access control (offline-first):
 * - No session → online login (activates the device); Forgot password →
 *   emailed reset link (public /reset/:token page)
 * - Temp password from an admin → forced change before anything else
 * - Session but no PIN → set one (the offline unlock)
 * - First sign-in on the ACCOUNT → one welcome screen (role blurb + install)
 * - Session + PIN → locked on launch and after 5 min hidden; PIN unlocks
 *   offline. Forgot PIN = logout → online login required.
 */
const touchActivity = () => localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));

/** Where a signed-in device goes next, in order: forced password change →
 *  PIN → welcome → open. Read the REAL user: view-as never affects the gate. */
function nextGateState(): GateState {
  const user = getRealSessionUser();
  if (user?.mustChangePassword) return 'change-password';
  if (!devicePinHash(user?.id)) return 'set-pin';
  if (user && !user.onboardedAt) return 'welcome';
  return 'open';
}

export function AuthGate({ children }: { children: ReactNode }) {
  // The temp password typed at sign-in, kept only long enough to satisfy
  // "current password" on the forced-change screen (never persisted)
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [state, setState] = useState<GateState>(() => {
    if (!getSession().loggedIn) return 'login';
    const next = nextGateState();
    if (next !== 'open') return next;
    // A refresh (or an auto-update reload) within the activity window must
    // NOT demand the PIN again — only real absence does
    const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) ?? 0);
    return Date.now() - last < LOCK_AFTER_MS ? 'open' : 'locked';
  });

  // Track activity so reloads know how recently the app was in use, and
  // relock when the app has been hidden longer than the threshold
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        touchActivity();
      } else if (document.visibilityState === 'visible' && state === 'open') {
        const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) ?? 0);
        if (devicePinHash(getRealSessionUser()?.id) && Date.now() - last > LOCK_AFTER_MS) {
          setState('locked');
        } else {
          touchActivity();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', touchActivity);
    const tick = window.setInterval(() => {
      if (state === 'open' && document.visibilityState === 'visible') touchActivity();
    }, 30_000);
    if (state === 'open') touchActivity();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', touchActivity);
      window.clearInterval(tick);
    };
  }, [state]);

  if (state === 'open') return <>{children}</>;
  if (state === 'login')
    return (
      <LoginScreen
        onForgot={() => setState('forgot')}
        onDone={(password) => {
          // The PIN follows the account: a fresh login seeds this device
          // with the user's existing PIN instead of demanding a new one
          const me = getRealSessionUser();
          if (me?.pinHash && !devicePinHash(me.id)) setDevicePin(me.id, me.pinHash);
          setTempPassword(password);
          touchActivity();
          setState(nextGateState());
        }}
      />
    );
  if (state === 'forgot') return <ForgotScreen onBack={() => setState('login')} />;
  if (state === 'change-password')
    return (
      <ChangePasswordScreen
        currentPassword={tempPassword}
        onDone={() => {
          setTempPassword(null);
          touchActivity();
          setState(nextGateState());
        }}
        onSignOut={async () => {
          await logout();
          setState('login');
        }}
      />
    );
  if (state === 'set-pin')
    return (
      <SetPinScreen
        onDone={() => {
          touchActivity();
          setState(nextGateState());
        }}
      />
    );
  if (state === 'welcome')
    return (
      <WelcomeScreen
        onDone={() => {
          void markOnboarded();
          touchActivity();
          setState('open');
        }}
      />
    );
  return (
    <PinLockScreen
      onUnlock={() => setState(nextGateState())}
      onForgot={async () => {
        clearDevicePin(getRealSessionUser()?.id);
        await logout();
        setState('login');
      }}
    />
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 flex flex-col items-center gap-3">
          <ShotLogTile size={72} />
          <h1 className="text-2xl font-extrabold tracking-tight text-white leading-none">
            SHOT<span className="text-[#EE7A2E]">LOG</span>
          </h1>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-6">{children}</div>
      </div>
    </div>
  );
}

function LoginScreen({ onDone, onForgot }: { onDone: (password: string) => void; onForgot: () => void }) {
  const [form, setForm] = useState({
    serverUrl: getSession().serverUrl || DEFAULT_SERVER_URL,
    email: getSession().email,
    password: '',
  });
  const [showServer, setShowServer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Values come from the DOM, not React state: Chrome autofill can populate
  // fields without firing the events that update state
  const submit = async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      await login(form.serverUrl, email, password);
      // Start replication in the background — don't block entry on hydration
      void connectPowerSync().catch(() => undefined);
      onDone(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed');
      setBusy(false);
    }
  };

  return (
    <Frame>
      <h2 className="font-bold text-lg mb-1">Sign in</h2>
      <p className="text-sm text-gray-500 mb-4">
        Use the account your company admin set up for you.
      </p>
      {/* A real <form> + submit is what lets Chrome offer saved passwords
          and prompt to save after login — onClick-only buttons are
          invisible to the password manager */}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const email = String(data.get('email') ?? '').trim();
          const password = String(data.get('password') ?? '');
          if (!email || !password) {
            setError('enter your email and password');
            return;
          }
          void submit(email, password);
        }}
      >
        <div>
          <Label className="text-xs">Email</Label>
          <Input
            type="email"
            name="email"
            autoComplete="username"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Password</Label>
          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        {showServer ? (
          <div>
            <Label className="text-xs">Server URL</Label>
            <Input
              inputMode="url"
              autoComplete="off"
              value={form.serverUrl}
              onChange={(e) => setForm({ ...form, serverUrl: e.target.value })}
            />
          </div>
        ) : (
          // type="button": inside a form, an untyped button submits
          <button
            type="button"
            className="text-xs text-gray-400 underline"
            onClick={() => setShowServer(true)}
          >
            Advanced: server settings
          </button>
        )}
        {error && <p className="text-sm text-violation">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <button
          type="button"
          className="w-full text-sm text-navy underline underline-offset-2 text-center"
          onClick={onForgot}
        >
          Forgot password?
        </button>
        <p className="text-xs text-gray-400 text-center">
          Requires a connection the first time. After that, ShotLog works fully offline.
        </p>
      </form>
    </Frame>
  );
}

/** Forgot password: ask for an emailed reset link. Never reveals whether
 *  the address has an account; DOES say when the server can't email. */
function ForgotScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState(getSession().email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ emailConfigured: boolean; debugLink?: string } | null>(null);
  const serverUrl = getSession().serverUrl || DEFAULT_SERVER_URL;

  return (
    <Frame>
      <h2 className="font-bold text-lg mb-1">Reset your password</h2>
      {result ? (
        <div className="space-y-3" data-forgot-result>
          {result.emailConfigured ? (
            <p className="text-sm text-gray-600">
              If <span className="font-medium">{email}</span> has a ShotLog account, a reset link is on its way.
              It works once and expires in an hour. Check spam if it takes more than a minute.
            </p>
          ) : (
            <p className="text-sm text-gray-600">
              Email isn't set up for your company yet, so we can't send a link. Ask your admin to reset your
              password — you'll pick a new one at your next sign-in.
            </p>
          )}
          {result.debugLink && (
            <p className="text-xs text-gray-400 break-all">
              Dev: <a className="underline" href={result.debugLink}>{result.debugLink}</a>
            </p>
          )}
          <Button variant="outline" className="w-full" onClick={onBack}>
            Back to sign in
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const value = email.trim();
            if (!value) {
              setError('enter your email');
              return;
            }
            setBusy(true);
            setError(null);
            forgotPassword(serverUrl, value)
              .then(setResult)
              .catch((err: unknown) => setError(err instanceof Error ? err.message : 'request failed'))
              .finally(() => setBusy(false));
          }}
        >
          <p className="text-sm text-gray-500">
            Enter the email on your account and we'll send a link to choose a new password.
          </p>
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-violation">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
          <button type="button" className="w-full text-sm text-gray-500 underline underline-offset-2" onClick={onBack}>
            Back to sign in
          </button>
        </form>
      )}
    </Frame>
  );
}

/** Forced change after an admin temp reset: the temp password is a hand-off,
 *  not a password. `currentPassword` is the one just typed at sign-in (kept
 *  in memory only); when unknown (PIN-unlocked device) we ask for it. */
function ChangePasswordScreen({
  currentPassword,
  onDone,
  onSignOut,
}: {
  currentPassword: string | null;
  onDone: () => void;
  onSignOut: () => void;
}) {
  const [current, setCurrent] = useState(currentPassword ?? '');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const user = getRealSessionUser();

  return (
    <Frame>
      <div className="text-center mb-4">
        <KeyRound className="h-6 w-6 mx-auto text-navy mb-2" />
        <h2 className="font-bold text-lg">Choose your own password</h2>
        <p className="text-sm text-gray-500">
          {user?.name ? `${user.name.split(' ')[0]}, the` : 'The'} password you signed in with was a temporary
          one from your admin. Pick one only you know.
        </p>
      </div>
      <form
        className="space-y-3"
        data-change-password
        onSubmit={(e) => {
          e.preventDefault();
          if (next !== confirm) {
            setError("Passwords don't match");
            return;
          }
          setBusy(true);
          setError(null);
          changeMyPassword(current, next)
            .then(onDone)
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'could not change password'))
            .finally(() => setBusy(false));
        }}
      >
        {currentPassword === null && (
          <div>
            <Label className="text-xs">Temporary password</Label>
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
        )}
        <div>
          <Label className="text-xs">New password (8+ characters)</Label>
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Confirm new password</Label>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <p className="text-sm text-violation">{error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={busy || next.length < 8 || !confirm || !current}>
          {busy ? 'Saving…' : 'Save password'}
        </Button>
        <button type="button" className="w-full text-xs text-gray-400 underline" onClick={onSignOut}>
          Sign out instead
        </button>
      </form>
    </Frame>
  );
}

/** First-run welcome — once per ACCOUNT. Says what this role does here, the
 *  three things to do first, and offers the install. */
const WELCOME: Record<string, { title: string; blurb: string; first: string[] }> = {
  field: {
    title: 'Your work days, one screen each',
    blurb: 'ShotLog is your blasting log and daily report, and it works with no signal.',
    first: [
      'Tap + to start work at a job.',
      'A day runs Drilling → Readiness → Shots → Seismo → File, and Continue always knows the next step.',
      'Add your license and signature in My Profile so sign-off is one tap.',
    ],
  },
  driller: {
    title: 'Checklist · Drill log · My hours',
    blurb: 'Three tiles on your home cover the whole day, and they work with no signal.',
    first: [
      'Drilling starts from a plan the blaster made — open it and log holes as planned in one tap.',
      'Skips and changes are normal; the app records what you actually drilled.',
      'Sign once in My Profile so the log sign-off is one tap.',
    ],
  },
  mechanic: {
    title: 'What is down, what is due',
    blurb: 'Your Shop home is the queue; drag it into the order you want to work it.',
    first: [
      'Down · Tickets · Due soon sit at the top; the worklist below is yours to order.',
      'Locator shows where each machine last worked.',
      'Log a service on the machine page and the clock restarts.',
    ],
  },
  office: {
    title: 'Approvals, cards, and the record book',
    blurb: 'Everything the crews file lands on your Dashboard for review.',
    first: [
      'Review a day and approve it, or send it back with a reason — the blaster sees it right away.',
      'Records holds every filed copy, write-once, with PDFs.',
      'Incidents and expiring paperwork show up on the same screen.',
    ],
  },
  admin: {
    title: 'You run the company side',
    blurb: 'People, roles, catalog and company settings live under Admin.',
    first: [
      'Invite the crew from Admin › People — they set their own password and PIN.',
      'Use View as to see any role’s screens exactly as they do.',
      'Everything the crews file is in Records.',
    ],
  },
};

function WelcomeScreen({ onDone }: { onDone: () => void }) {
  const user = getRealSessionUser();
  const bucket = user?.role === 'admin' ? 'admin' : myHomeDashboard();
  const w = WELCOME[bucket] ?? WELCOME.field;
  const first = user?.name?.split(' ')[0];
  return (
    <Frame>
      <div className="space-y-4" data-welcome>
        <div className="text-center">
          <Sparkles className="h-6 w-6 mx-auto text-safety-orange mb-2" />
          <h2 className="font-bold text-lg">{first ? `Welcome, ${first}` : 'Welcome'}</h2>
          <p className="text-sm text-gray-500">{w.blurb}</p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wider uppercase text-gray-400 mb-1">{w.title}</p>
          <ol className="space-y-2">
            {w.first.map((t, i) => (
              <li key={t} className="flex gap-2 text-sm text-gray-700">
                <span className="text-safety-orange font-bold">{i + 1}.</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </div>
        <InstallCard always tone="plain" />
        <Button className="w-full" size="lg" onClick={onDone}>
          Let’s go
        </Button>
      </div>
    </Frame>
  );
}

function PinPad({
  value,
  onDigit,
  onBackspace,
}: {
  value: string;
  onDigit: (d: string) => void;
  onBackspace: () => void;
}) {
  return (
    <div>
      <div className="flex justify-center gap-3 mb-6">
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full ${i < value.length ? 'bg-navy' : 'border-2 border-gray-300'}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, i) =>
          key === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              className="h-14 rounded-xl text-xl font-semibold text-gray-800 bg-gray-50 active:bg-gray-200 flex items-center justify-center"
              onClick={() => (key === '⌫' ? onBackspace() : onDigit(key))}
            >
              {key === '⌫' ? <Delete className="h-5 w-5" /> : key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function SetPinScreen({ onDone }: { onDone: () => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pin.length < 4) return;
    if (pin.length >= 4 && pin.length <= 6) {
      // wait for explicit confirm at 4-6 via timeout? Use 6 digits or Enter…
    }
    if (pin.length === 6) {
      if (first === null) {
        setFirst(pin);
        setPin('');
      } else if (first === pin) {
        void hashPin(pin).then((h) => {
          const me = getRealSessionUser();
          if (me) setDevicePin(me.id, h);
          // Save to the account too (best effort — offline keeps it local)
          void updateMyPin(h).catch(() => undefined);
          onDone();
        });
      } else {
        setError("PINs didn't match — start again");
        setFirst(null);
        setPin('');
      }
    }
  }, [pin, first, onDone]);

  return (
    <Frame>
      <div className="text-center mb-4">
        <LockKeyhole className="h-6 w-6 mx-auto text-navy mb-2" />
        <h2 className="font-bold text-lg">{first === null ? 'Set a 6-digit PIN' : 'Confirm your PIN'}</h2>
        <p className="text-sm text-gray-500">
          Unlocks ShotLog on this device — even offline.
        </p>
      </div>
      {error && <p className="text-sm text-violation text-center mb-2">{error}</p>}
      <PinPad
        value={pin}
        onDigit={(d) => pin.length < 6 && setPin(pin + d)}
        onBackspace={() => setPin(pin.slice(0, -1))}
      />
    </Frame>
  );
}

function PinLockScreen({ onUnlock, onForgot }: { onUnlock: () => void; onForgot: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const user = getSessionUser();

  useEffect(() => {
    if (pin.length !== 6) return;
    void hashPin(pin).then((h) => {
      if (h === devicePinHash(getRealSessionUser()?.id)) {
        onUnlock();
      } else {
        setError(true);
        setPin('');
      }
    });
  }, [pin, onUnlock]);

  return (
    <Frame>
      <div className="text-center mb-4">
        <LockKeyhole className="h-6 w-6 mx-auto text-navy mb-2" />
        <h2 className="font-bold text-lg">Enter PIN</h2>
        {user && <p className="text-sm text-gray-500">{user.name} · {user.company}</p>}
      </div>
      {error && <p className="text-sm text-violation text-center mb-2">Wrong PIN — try again</p>}
      <PinPad
        value={pin}
        onDigit={(d) => {
          setError(false);
          if (pin.length < 6) setPin(pin + d);
        }}
        onBackspace={() => setPin(pin.slice(0, -1))}
      />
      <button className="w-full text-xs text-gray-400 underline mt-4" onClick={onForgot}>
        Forgot PIN? Sign in again online
      </button>
    </Frame>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { Delete, LockKeyhole } from 'lucide-react';
import {
  DEFAULT_SERVER_URL,
  getSessionUser,
  getSyncConfig,
  login,
  logout,
  syncNow,
} from '@/lib/sync';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PIN_KEY = 'shotlog-pin';
const LAST_ACTIVE_KEY = 'shotlog-last-active';
const LOCK_AFTER_MS = 5 * 60_000; // relock after 5 minutes hidden

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`shotlog-pin-salt:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

type GateState = 'login' | 'set-pin' | 'locked' | 'open';

/**
 * App access control (offline-first):
 * - No session → online login (activates the device)
 * - Session but no PIN → set one (the offline unlock)
 * - Session + PIN → locked on launch and after 5 min hidden; PIN unlocks
 *   offline. Forgot PIN = logout → online login required.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>(() => {
    if (!getSyncConfig().loggedIn) return 'login';
    if (!localStorage.getItem(PIN_KEY)) return 'set-pin';
    return 'locked';
  });

  // Relock when the app has been hidden longer than the threshold
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
      } else if (document.visibilityState === 'visible' && state === 'open') {
        const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) ?? 0);
        if (localStorage.getItem(PIN_KEY) && Date.now() - last > LOCK_AFTER_MS) {
          setState('locked');
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [state]);

  if (state === 'open') return <>{children}</>;
  if (state === 'login')
    return <LoginScreen onDone={() => setState(localStorage.getItem(PIN_KEY) ? 'open' : 'set-pin')} />;
  if (state === 'set-pin') return <SetPinScreen onDone={() => setState('open')} />;
  return (
    <PinLockScreen
      onUnlock={() => setState('open')}
      onForgot={async () => {
        localStorage.removeItem(PIN_KEY);
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
        <div className="text-center mb-8">
          <svg viewBox="0 0 200 200" className="h-16 w-16 mx-auto mb-3" aria-hidden>
            <rect width="200" height="200" rx="44" fill="#DD6B20" />
            <g transform="translate(100,100)">
              <circle cx="0" cy="0" r="50" fill="none" stroke="#fff" strokeWidth="4" opacity="0.3" />
              <line x1="0" y1="-12" x2="0" y2="-34" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
              <line x1="0" y1="12" x2="0" y2="34" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
              <line x1="-12" y1="0" x2="-34" y2="0" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
              <line x1="12" y1="0" x2="34" y2="0" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
              <circle cx="0" cy="0" r="13" fill="#fff" />
              <circle cx="0" cy="0" r="8" fill="#F6AD55" />
              <circle cx="0" cy="0" r="4" fill="#1a365d" />
            </g>
          </svg>
          <h1 className="text-2xl tracking-widest text-white">
            <span className="font-light">SHOT</span>
            <span className="font-extrabold text-safety-orange">LOG</span>
          </h1>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-6">{children}</div>
      </div>
    </div>
  );
}

function LoginScreen({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    serverUrl: getSyncConfig().serverUrl || DEFAULT_SERVER_URL,
    email: getSyncConfig().email,
    password: '',
  });
  const [showServer, setShowServer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(form.serverUrl, form.email, form.password);
      // First sync in the background — don't block entry on it
      void syncNow().catch(() => undefined);
      onDone();
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
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Email</Label>
          <Input
            type="email"
            autoComplete="username"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Password</Label>
          <Input
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        {showServer ? (
          <div>
            <Label className="text-xs">Server URL</Label>
            <Input
              inputMode="url"
              value={form.serverUrl}
              onChange={(e) => setForm({ ...form, serverUrl: e.target.value })}
            />
          </div>
        ) : (
          <button className="text-xs text-gray-400 underline" onClick={() => setShowServer(true)}>
            Advanced: server settings
          </button>
        )}
        {error && <p className="text-sm text-violation">{error}</p>}
        <Button
          className="w-full"
          size="lg"
          disabled={busy || !form.email || !form.password}
          onClick={submit}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-xs text-gray-400 text-center">
          Requires a connection the first time. After that, ShotLog works fully offline.
        </p>
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
          localStorage.setItem(PIN_KEY, h);
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
      if (h === localStorage.getItem(PIN_KEY)) {
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

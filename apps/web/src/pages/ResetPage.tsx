// Public password-reset page (outside AuthGate): the emailed link lands
// here, the user picks a new password, and THIS device is signed in
// straight away (the server returns a session). Other devices sign in again.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DEFAULT_SERVER_URL, storeSession, type SessionPayload } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const serverUrl = () => localStorage.getItem('shotlog-server-url') || DEFAULT_SERVER_URL;

export function ResetPage() {
  const { token } = useParams<{ token: string }>();
  const [who, setWho] = useState<{ name: string; email: string } | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    void fetch(`${serverUrl()}/auth/reset/${token}`)
      .then(async (res) => {
        const body = (await res.json()) as { name: string; email: string; error?: string };
        if (!res.ok) {
          setFatal(body.error ?? 'This reset link is not valid.');
          return;
        }
        setWho(body);
      })
      .catch(() => setFatal("Couldn't reach the server — check your connection and try again."));
  }, [token]);

  const submit = async () => {
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${serverUrl()}/auth/reset/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = (await res.json().catch(() => null)) as (SessionPayload & { error?: string }) | null;
      if (!res.ok || !body?.accessToken) throw new Error(body?.error ?? 'reset failed');
      storeSession(serverUrl(), body);
      setDone(true);
      // Full reload into the gated app — signed in, PIN next if needed
      window.setTimeout(() => window.location.assign('/'), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'reset failed');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-white text-2xl font-bold mb-4">
          <span className="font-light">SHOT</span>
          <span className="text-safety-orange font-extrabold">LOG</span>
        </h1>
        <div className="bg-white rounded-2xl shadow-xl p-6">
          {fatal ? (
            <div className="space-y-3">
              <p className="text-sm text-violation">{fatal}</p>
              <Button variant="outline" className="w-full" onClick={() => window.location.assign('/')}>
                Back to sign in
              </Button>
            </div>
          ) : done ? (
            <div className="text-center space-y-2">
              <p className="font-bold text-lg">Password changed 👍</p>
              <p className="text-sm text-gray-500">Signing you in on this device…</p>
            </div>
          ) : !who ? (
            <p className="text-sm text-gray-400">Checking your link…</p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div>
                <h2 className="font-bold text-lg">Choose a new password</h2>
                <p className="text-sm text-gray-500">
                  For <span className="font-medium">{who.email}</span>. Other devices will ask you to sign in again.
                </p>
              </div>
              <div>
                <Label className="text-xs">New password (8+ characters)</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Confirm password</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-violation">{error}</p>}
              <Button type="submit" className="w-full" size="lg" disabled={busy || password.length < 8 || !confirm}>
                {busy ? 'Saving…' : 'Save and sign in'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

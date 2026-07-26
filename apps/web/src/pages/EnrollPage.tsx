// Public enrollment page (outside AuthGate): a crew member opens their
// invite link, sets a password, and gets a working account. PIN, licenses,
// and signature happen through the normal first-login flows.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DEFAULT_SERVER_URL } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const serverUrl = () => localStorage.getItem('shotlog-server-url') || DEFAULT_SERVER_URL;

interface InviteInfo {
  name: string;
  role: string;
  company: string;
  email: string | null;
}

export function EnrollPage() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    void fetch(`${serverUrl()}/enroll/${token}`)
      .then(async (res) => {
        const body = (await res.json()) as InviteInfo & { error?: string };
        if (!res.ok) {
          setFatal(body.error ?? 'This invite link is not valid.');
          return;
        }
        setInvite(body);
        if (body.email) setEmail(body.email);
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
      const res = await fetch(`${serverUrl()}/enroll/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, email: email.trim() || undefined }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'enrollment failed');
      setDone(true);
      localStorage.setItem('shotlog-user-email', email.trim());
      // Full reload into the gated app — the enroll shell is outside the router
      window.setTimeout(() => window.location.assign('/'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'enrollment failed');
    } finally {
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
            <p className="text-sm text-violation">{fatal}</p>
          ) : done ? (
            <div className="text-center space-y-2">
              <p className="font-bold text-lg">You're in, {invite?.name?.split(' ')[0]} 👍</p>
              <p className="text-sm text-gray-500">
                Taking you to the sign-in screen — use {email.trim()} and your new password.
              </p>
            </div>
          ) : !invite ? (
            <p className="text-sm text-gray-400">Checking your invite…</p>
          ) : (
            <div className="space-y-3">
              <div>
                <h2 className="font-bold text-lg">Welcome, {invite.name}</h2>
                <p className="text-sm text-gray-500">
                  You're joining <span className="font-medium">{invite.company}</span> as{' '}
                  <span className="font-medium">{invite.role}</span>. Set up your login below.
                </p>
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={email}
                  disabled={Boolean(invite.email)}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Choose a password (8+ characters)</Label>
                <Input type="password" autoComplete="new-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Confirm password</Label>
                <Input type="password" autoComplete="new-password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void submit()} />
              </div>
              {error && <p className="text-sm text-violation">{error}</p>}
              <Button className="w-full" size="lg"
                disabled={busy || !email.trim() || password.length < 8 || !confirm}
                onClick={() => void submit()}>
                {busy ? 'Setting up…' : 'Create my account'}
              </Button>
              <p className="text-xs text-gray-400 text-center">
                You'll pick a quick unlock PIN after your first sign-in.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

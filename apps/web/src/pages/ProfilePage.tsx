import { useEffect, useState } from 'react';
import { KeyRound, Lock, LogOut, PenLine } from 'lucide-react';
import {
  changeMyPassword,
  getSessionUser,
  logout,
  refreshSessionUser,
  updateMySignature,
  type SessionUser,
} from '@/lib/sync';
import { blobToDataUrl, dataUrlToBlob } from '@/lib/utils';
import { MyLicensesCard } from '@/components/forms/MyLicensesCard';
import { SignatureField } from '@/components/ui/signature-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PIN_KEY = 'shotlog-pin';

/**
 * The signed-in user's personal page: everything here follows the account
 * to any device (licenses, signature, password) plus this device's PIN.
 * Company/device configuration stays in Settings.
 */
export function ProfilePage() {
  const [user, setUser] = useState<SessionUser | null>(getSessionUser());

  useEffect(() => {
    void refreshSessionUser().then((u) => u && setUser(u));
  }, []);

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold text-gray-900">My Profile</h2>

      {/* Identity */}
      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <span className="h-16 w-16 rounded-full bg-navy text-white flex items-center justify-center text-xl font-bold shrink-0">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold truncate">{user.name}</p>
            <p className="text-sm text-gray-500 truncate">{user.email}</p>
            <p className="text-sm text-gray-500">
              <span className="inline-block px-2 py-0.5 rounded-full bg-navy-50 text-navy text-xs font-semibold mr-1.5 capitalize">
                {user.role}
              </span>
              {user.company}
            </p>
          </div>
        </CardContent>
      </Card>

      <MyLicensesCard />
      <SignatureCard user={user} onChange={setUser} />
      <SecurityCard />
    </div>
  );
}

function SignatureCard({
  user,
  onChange,
}: {
  user: SessionUser;
  onChange: (u: SessionUser) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);

  const save = async (blob: Blob | null) => {
    setStatus('Saving…');
    try {
      const dataUrl = blob ? await blobToDataUrl(blob) : null;
      onChange(await updateMySignature(dataUrl));
      setStatus(null);
    } catch (err) {
      setStatus(
        err instanceof Error && err.message.includes('fetch')
          ? 'Offline — signature changes need a connection'
          : err instanceof Error
            ? err.message
            : 'save failed',
      );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PenLine className="h-4 w-4 text-navy" /> Signature on File
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-gray-500">
          Sign once — it's offered with one tap at every blast-log sign-off.
        </p>
        <SignatureField
          value={user.signature ? dataUrlToBlob(user.signature) : null}
          onChange={(blob) => void save(blob)}
        />
        {status && <p className="text-sm text-gray-500">{status}</p>}
      </CardContent>
    </Card>
  );
}

function SecurityCard() {
  const [changing, setChanging] = useState(false);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [status, setStatus] = useState<string | null>(null);

  const submit = async () => {
    if (form.next !== form.confirm) {
      setStatus('New passwords do not match');
      return;
    }
    if (form.next.length < 8) {
      setStatus('New password must be at least 8 characters');
      return;
    }
    setStatus('Changing…');
    try {
      await changeMyPassword(form.current, form.next);
      // Password change revokes every session's refresh token — re-login
      setStatus('Password changed — signing you out to log back in…');
      await logout();
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'change failed');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="h-4 w-4 text-navy" /> Security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {changing ? (
          <div className="border border-navy rounded-lg p-3 space-y-2">
            <div>
              <Label className="text-xs">Current Password</Label>
              <Input
                type="password"
                autoComplete="current-password"
                value={form.current}
                onChange={(e) => setForm({ ...form, current: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">New Password</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={form.next}
                  onChange={(e) => setForm({ ...form, next: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Confirm New Password</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setChanging(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!form.current || !form.next} onClick={() => void submit()}>
                Change Password
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setChanging(true)}>
              <KeyRound className="h-4 w-4 mr-1" /> Change Password
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Cleared PIN + reload → AuthGate shows the set-PIN screen
                localStorage.removeItem(PIN_KEY);
                window.location.reload();
              }}
            >
              <Lock className="h-4 w-4 mr-1" /> Change PIN
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await logout();
                window.location.reload();
              }}
            >
              <LogOut className="h-4 w-4 mr-1" /> Sign Out
            </Button>
          </div>
        )}
        {status && <p className="text-sm text-gray-500">{status}</p>}
      </CardContent>
    </Card>
  );
}

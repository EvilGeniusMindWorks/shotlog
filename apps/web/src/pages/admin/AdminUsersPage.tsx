// Team management for office staff. Replaces the old TeamCard — every
// action is a proper inline form (no window.prompt), errors surface
// immediately from the REST API, and nothing here touches the offline
// sync path.
import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AlertTriangle, KeyRound, Pencil, Plus, UserX, UserCheck } from 'lucide-react';
import { authedFetch, getSessionUser, type UserLicense } from '@/lib/session';
import { db } from '@/db';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChipSelect } from '@/components/ui/chip-select';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'blaster', label: 'Blaster' },
  { value: 'driller', label: 'Driller' },
  { value: 'mechanic', label: 'Mechanic' },
  { value: 'office', label: 'Office' },
];

interface CompanyUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  licenses?: UserLicense[];
}

const EXPIRY_WARNING_DAYS = 90;
function soonestExpiry(licenses?: UserLicense[]): number | null {
  if (!licenses?.length) return null;
  const days = licenses
    .filter((l) => l.expirationDate)
    .map((l) => Math.ceil((new Date(l.expirationDate).getTime() - Date.now()) / 86_400_000));
  return days.length ? Math.min(...days) : null;
}

function ExpiryChip({ licenses }: { licenses?: UserLicense[] }) {
  const days = soonestExpiry(licenses);
  if (days === null || days > EXPIRY_WARNING_DAYS) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[11px] text-safety-orange">
      <AlertTriangle className="h-3 w-3" />
      {days < 0 ? 'license expired' : `license expires in ${days}d`}
    </span>
  );
}

type RowMode = { kind: 'view' } | { kind: 'edit' } | { kind: 'reset' } | { kind: 'confirm-deactivate' };

export function AdminUsersPage() {
  const { online } = useOutletContext<{ online: boolean }>();
  const me = getSessionUser();
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/users');
      if (!res.ok) throw new Error(`couldn't load users (${res.status})`);
      const body = (await res.json()) as { users: CompanyUser[] };
      setUsers(body.users);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load users');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const visible = users.filter(
    (u) =>
      !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex-1" />
        <Button onClick={() => setAdding(!adding)} disabled={!online}>
          <Plus className="h-4 w-4 mr-1" /> Add User
        </Button>
      </div>

      {error && <p className="text-sm text-violation">{error}</p>}

      {adding && (
        <AddUserForm
          online={online}
          onDone={() => {
            setAdding(false);
            void load();
          }}
        />
      )}

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {visible.map((u) => (
          <UserRow key={u.id} user={u} me={me?.id ?? ''} online={online} onChanged={load} />
        ))}
        {visible.length === 0 && (
          <p className="p-4 text-sm text-gray-400">No users match.</p>
        )}
      </div>
    </div>
  );
}

function AddUserForm({ online, onDone }: { online: boolean; onDone: () => void }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'blaster',
    tempPassword: '',
    addToCrew: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          tempPassword: form.tempPassword,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { user?: { id: string }; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error ?? 'failed to create user');
      if (form.addToCrew && body?.user) {
        const now = new Date().toISOString();
        await db.crewMembers.put({
          id: crypto.randomUUID(),
          name: form.name.trim(),
          licenseNumber: '',
          licenseState: '',
          isActive: true,
          userId: body.user.id,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'local',
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to create user');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <p className="font-medium text-sm">New user</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="nu-name">Name</Label>
          <Input id="nu-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="nu-email">Email</Label>
          <Input id="nu-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label>Role</Label>
          <ChipSelect
            value={form.role}
            onChange={(role) => setForm({ ...form, role })}
            options={ROLE_OPTIONS}
          />
        </div>
        <div>
          <Label htmlFor="nu-pass">Temporary password (8+ characters)</Label>
          <Input id="nu-pass" value={form.tempPassword} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} />
          <p className="text-xs text-gray-400 mt-1">
            Share it with them directly — they can change it on their Profile page.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm self-end pb-2">
          <input
            type="checkbox"
            checked={form.addToCrew}
            onChange={(e) => setForm({ ...form, addToCrew: e.target.checked })}
          />
          Also add to crew roster
        </label>
      </div>
      {error && <p className="text-sm text-violation">{error}</p>}
      <Button
        onClick={submit}
        disabled={busy || !online || !form.name.trim() || !form.email.trim() || form.tempPassword.length < 8}
      >
        Create user
      </Button>
    </div>
  );
}

function UserRow({
  user,
  me,
  online,
  onChanged,
}: {
  user: CompanyUser;
  me: string;
  online: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<RowMode>({ kind: 'view' });
  const [edit, setEdit] = useState({ name: user.name, email: user.email, role: user.role });
  const [tempPassword, setTempPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (path: string, init: RequestInit) => {
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(path, init);
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `request failed (${res.status})`);
      setMode({ kind: 'view' });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={user.isActive ? 'p-3' : 'p-3 opacity-60'}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">
            {user.name}
            {user.id === me && <span className="text-gray-400 font-normal"> (you)</span>}
          </p>
          <p className="text-xs text-gray-400 truncate">{user.email}</p>
        </div>
        <Badge variant={user.role === 'admin' || user.role === 'supervisor' ? 'synced' : 'local'}>
          {user.role}
        </Badge>
        {!user.isActive && <Badge variant="local">deactivated</Badge>}
        <ExpiryChip licenses={user.licenses} />
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" title="Edit" disabled={!online}
            onClick={() => setMode(mode.kind === 'edit' ? { kind: 'view' } : { kind: 'edit' })}>
            <Pencil className="h-4 w-4 text-gray-400" />
          </Button>
          <Button variant="ghost" size="icon" title="Reset password" disabled={!online}
            onClick={() => setMode(mode.kind === 'reset' ? { kind: 'view' } : { kind: 'reset' })}>
            <KeyRound className="h-4 w-4 text-gray-400" />
          </Button>
          {user.id !== me &&
            (user.isActive ? (
              <Button variant="ghost" size="icon" title="Deactivate" disabled={!online}
                onClick={() => setMode({ kind: 'confirm-deactivate' })}>
                <UserX className="h-4 w-4 text-gray-400" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" title="Reactivate" disabled={!online}
                onClick={() => void call(`/users/${user.id}/set-active`, { method: 'POST', body: JSON.stringify({ active: true }) })}>
                <UserCheck className="h-4 w-4 text-green-600" />
              </Button>
            ))}
        </div>
      </div>

      {mode.kind === 'edit' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 rounded-lg bg-gray-50 p-3">
          <div>
            <Label>Name</Label>
            <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Role</Label>
            <ChipSelect value={edit.role} onChange={(role) => setEdit({ ...edit, role })} options={ROLE_OPTIONS} />
            {edit.role !== user.role && (
              <p className="text-xs text-gray-400 mt-1">
                Changing the role signs {user.name} out everywhere — they log back in with
                their new access.
              </p>
            )}
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <Button disabled={busy || !online}
              onClick={() => void call(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(edit) })}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setMode({ kind: 'view' })}>Cancel</Button>
          </div>
        </div>
      )}

      {mode.kind === 'reset' && (
        <div className="mt-3 flex items-end gap-2 rounded-lg bg-gray-50 p-3">
          <div className="flex-1 max-w-xs">
            <Label>New temporary password (8+ characters)</Label>
            <Input value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} />
          </div>
          <Button disabled={busy || !online || tempPassword.length < 8}
            onClick={() => void call(`/users/${user.id}/reset-password`, { method: 'POST', body: JSON.stringify({ tempPassword }) })}>
            Reset
          </Button>
          <Button variant="ghost" onClick={() => setMode({ kind: 'view' })}>Cancel</Button>
        </div>
      )}

      {mode.kind === 'confirm-deactivate' && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm">
          <span className="flex-1">
            Deactivate {user.name}? They're signed out everywhere and can't log in until
            reactivated. Their records are kept.
          </span>
          <Button variant="outline" disabled={busy || !online}
            onClick={() => void call(`/users/${user.id}/set-active`, { method: 'POST', body: JSON.stringify({ active: false }) })}>
            Deactivate
          </Button>
          <Button variant="ghost" onClick={() => setMode({ kind: 'view' })}>Cancel</Button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-violation">{error}</p>}
    </div>
  );
}

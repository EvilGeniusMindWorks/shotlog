import { useEffect, useState } from 'react';
import { KeyRound, Plus, UserX, UserCheck, Users } from 'lucide-react';
import { authedFetch, getSessionUser } from '@/lib/sync';
import { IconChip, SectionCard } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChipSelect } from '@/components/ui/chip-select';

interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
}

const ROLE_OPTIONS = [
  { value: 'blaster', label: 'Blaster' },
  { value: 'driller', label: 'Driller' },
  { value: 'mechanic', label: 'Mechanic / Shop' },
  { value: 'office', label: 'Office' },
  { value: 'admin', label: 'Admin' },
];

/** Admin-only: manage the company's user accounts */
export function TeamCard() {
  const me = getSessionUser();
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'blaster', tempPassword: '' });

  const load = async () => {
    try {
      const res = await authedFetch('/users');
      if (!res.ok) throw new Error(`couldn't load team (${res.status})`);
      const body = (await res.json()) as { users: TeamUser[] };
      setUsers(body.users);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'offline — team management needs a connection');
    }
  };
  useEffect(() => {
    if (me?.role === 'admin') void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (me?.role !== 'admin') return null;

  const addUser = async () => {
    const res = await authedFetch('/users', { method: 'POST', body: JSON.stringify(form) });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setError(body?.error ?? 'failed to add user');
      return;
    }
    setForm({ name: '', email: '', role: 'blaster', tempPassword: '' });
    setAdding(false);
    await load();
  };

  const setActive = async (user: TeamUser, active: boolean) => {
    await authedFetch(`/users/${user.id}/set-active`, {
      method: 'POST',
      body: JSON.stringify({ active }),
    });
    await load();
  };

  const resetPassword = async (user: TeamUser) => {
    const tempPassword = prompt(`New temporary password for ${user.name} (8+ characters):`);
    if (!tempPassword) return;
    const res = await authedFetch(`/users/${user.id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ tempPassword }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) setError(body?.error ?? 'reset failed');
    else alert(`Password reset. Give ${user.name} the temporary password to sign in.`);
  };

  return (
    <SectionCard
      title="Team"
      icon={<IconChip tint="navy"><Users className="h-4 w-4" /></IconChip>}
      subtitle={
        users
          ? `${users.filter((u) => u.isActive).length} active user${users.filter((u) => u.isActive).length === 1 ? '' : 's'} · ${me.company}`
          : me.company
      }
      actions={
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add User
        </Button>
      }
    >
      {error && <p className="text-sm text-violation">{error}</p>}
      {users?.map((user) => (
        <div
          key={user.id}
          className={`flex items-center gap-3 border border-gray-200 rounded-lg p-3 ${user.isActive ? '' : 'opacity-50'}`}
        >
          <div className="h-9 w-9 rounded-full bg-navy-50 text-navy flex items-center justify-center text-sm font-bold shrink-0">
            {user.name
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">
              {user.name}
              {user.id === me.id && <span className="text-gray-400 font-normal"> (you)</span>}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {user.email} · <span className="capitalize">{user.role}</span>
              {!user.isActive && ' · deactivated'}
            </p>
          </div>
          <button
            className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-navy"
            title="Reset password"
            onClick={() => resetPassword(user)}
          >
            <KeyRound className="h-4 w-4" />
          </button>
          {user.id !== me.id &&
            (user.isActive ? (
              <button
                className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-violation"
                title="Deactivate"
                onClick={() => {
                  if (confirm(`Deactivate ${user.name}? Their sessions are revoked immediately.`))
                    void setActive(user, false);
                }}
              >
                <UserX className="h-4 w-4" />
              </button>
            ) : (
              <button
                className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-compliant"
                title="Reactivate"
                onClick={() => void setActive(user, true)}
              >
                <UserCheck className="h-4 w-4" />
              </button>
            ))}
        </div>
      ))}

      {adding && (
        <div className="border border-navy rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <ChipSelect
              className="mt-1"
              value={form.role}
              onChange={(v) => setForm({ ...form, role: v })}
              options={ROLE_OPTIONS}
            />
          </div>
          <div>
            <Label className="text-xs">Temporary password (they can change it after signing in)</Label>
            <Input
              value={form.tempPassword}
              onChange={(e) => setForm({ ...form, tempPassword: e.target.value })}
              placeholder="8+ characters"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!form.name || !form.email || form.tempPassword.length < 8}
              onClick={addUser}
            >
              Add User
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

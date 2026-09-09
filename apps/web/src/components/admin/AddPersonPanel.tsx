// Add a person AND their access in one shot (Matthew, 2026-09-07: "rather
// than forcing me to do it in two steps"). First · Last · Role · Email ·
// Access (invite / create login / roster only). The button says what it
// will do. The roster add works offline; the two login options need signal
// and an email and grey out with the reason. If the server half fails the
// person is still added and the panel says so — the ⋯ row keeps Invite and
// Login for later. Existing people keep the ⋯ path unchanged.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Mail } from 'lucide-react';
import { db } from '@/db';
import type { CrewMember } from '@/db/schema';
import { authedFetch } from '@/lib/session';
import { generateId, nowISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChipSelect } from '@/components/ui/chip-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Access = 'invite' | 'login' | 'none';

interface Result {
  name: string;
  memberId: string;
  access: Access;
  link?: string;
  emailed?: boolean;
  note?: string;
  error?: string;
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AddPersonPanel({
  roleOptions,
  isAdmin,
  online,
  people,
  onDone,
  onClose,
}: {
  roleOptions: { value: string; label: string }[];
  isAdmin: boolean;
  online: boolean;
  people: CrewMember[];
  /** Refresh the users/invites directory after a server write */
  onDone: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [accessChoice, setAccessChoice] = useState<Access | null>(null); // null = follow the email
  const [tempPassword, setTempPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const name = `${first.trim()} ${last.trim()}`.replace(/\s+/g, ' ').trim();
  const emailOk = EMAIL_OK.test(email.trim());
  const loginPossible = isAdmin && online && emailOk;
  // Default follows the email: typed → invite; blank → roster only
  const access: Access = !loginPossible ? 'none' : (accessChoice ?? 'invite');
  const duplicate = useMemo(
    () => (name ? people.find((p) => p.name.toLowerCase() === name.toLowerCase()) : undefined),
    [people, name],
  );
  const needsRole = access !== 'none' && !role;
  const ready =
    name.length > 0 &&
    !duplicate &&
    !needsRole &&
    (access !== 'login' || tempPassword.length >= 8);

  const label =
    access === 'invite'
      ? 'Add & send invite'
      : access === 'login'
        ? 'Add & create login'
        : 'Add person';

  const reasonOff = !isAdmin
    ? 'Only people who manage the roster (supervisors and admins) create logins'
    : !online
      ? 'No signal — add now, invite from their row when you are back online'
      : !emailOk
        ? 'Needs an email'
        : null;

  const rest = async (path: string, body: unknown) => {
    const res = await authedFetch(path, { method: 'POST', body: JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) throw new Error((json?.error as string | undefined) ?? `request failed (${res.status})`);
    return json ?? {};
  };

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    const now = nowISO();
    const memberId = generateId();
    // 1. the roster entry — always, offline included
    await db.crewMembers.put({
      id: memberId,
      name,
      lastName: last.trim() || undefined,
      licenseNumber: '',
      licenseState: '',
      isActive: true,
      ...(role ? { role } : {}),
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    });
    const out: Result = { name, memberId, access };
    // 2. the access, in the same tap
    try {
      if (access === 'invite') {
        const body = await rest('/admin/invites', { name, role, crewMemberId: memberId, email: email.trim() });
        out.link = body.link as string | undefined;
        out.emailed = Boolean(body.emailed);
        if (!out.emailed) {
          out.note = body.emailConfigured
            ? "The email didn't send — share the link instead."
            : 'Email is not set up on the server yet — share the link instead.';
        }
      } else if (access === 'login') {
        const body = await rest('/users', { name, email: email.trim(), role, tempPassword, crewMemberId: memberId });
        // The server stamps the roster row with the new login; stamp it
        // locally too, so this device's own upload of the row (which may
        // land after the server's write) never erases the link
        const created = body.user as { id?: string } | undefined;
        if (created?.id) await db.crewMembers.update(memberId, { userId: created.id, role, updatedAt: nowISO() });
      }
      await onDone();
    } catch (err) {
      out.error = err instanceof Error ? err.message : 'request failed';
    }
    setResult(out);
    setBusy(false);
  };

  const reset = () => {
    setFirst('');
    setLast('');
    setEmail('');
    setAccessChoice(null);
    setTempPassword('');
    setResult(null);
    setCopied(false);
  };

  if (result) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-2" data-add-result={result.access}>
        <p className="text-sm text-green-900 font-medium">
          {result.name} added
          {result.access === 'invite' && !result.error && (result.emailed ? ' · invite emailed' : ' · invite link ready')}
          {result.access === 'login' && !result.error && ' · login created'}
          {result.access === 'none' && ' to the roster'}
        </p>
        {result.error && (
          <p className="text-xs text-orange-800" data-add-error>
            Added to the roster, but the {result.access === 'invite' ? 'invite' : 'login'} failed: {result.error}. Use
            Invite or Login on their row when ready.
          </p>
        )}
        {result.note && !result.error && <p className="text-xs text-orange-700">{result.note}</p>}
        {result.link && !result.error && (
          <div className="flex items-center gap-2">
            <Input readOnly value={result.link} className="font-mono text-xs" data-add-link />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(result.link!).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        )}
        {result.access === 'login' && !result.error && (
          <p className="text-xs text-green-800">
            Hand them the temporary password — they must change it on first sign-in.
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={reset} data-add-another>
            Add another
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" data-add-person>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">First name</Label>
          <Input value={first} onChange={(e) => setFirst(e.target.value)} data-add-first autoFocus />
        </div>
        <div>
          <Label className="text-xs">Last name</Label>
          <Input value={last} onChange={(e) => setLast(e.target.value)} data-add-last />
        </div>
      </div>
      <div>
        <Label className="text-xs">
          Role{access !== 'none' ? '' : <span className="text-gray-400 font-normal"> — optional for roster-only</span>}
        </Label>
        <ChipSelect value={role} onChange={setRole} options={roleOptions} allowEmpty />
      </div>
      <div>
        <Label className="text-xs">
          Email <span className="text-gray-400 font-normal">— needed for a login; optional for roster-only</span>
        </Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-add-email className="max-w-md" />
      </div>
      <div>
        <Label className="text-xs">Access</Label>
        <div className="space-y-1.5 mt-1" data-add-access={access}>
          {(
            [
              ['invite', 'Invite to set up their own login', 'Email the link (and show it here to text). They pick their password, PIN and licenses. The link lasts 7 days.'],
              ['login', 'Create the login now with a temporary password', 'You hand them the password; they must change it on first sign-in.'],
              ['none', 'Roster only, no login', 'They appear on time cards and drill logs. Add a login later from their row.'],
            ] as const
          ).map(([value, title, sub]) => {
            const disabled = value !== 'none' && !loginPossible;
            const on = access === value;
            return (
              <label
                key={value}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${on ? 'border-navy bg-blue-50' : 'border-gray-200'} ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
                data-add-option={value}
              >
                <input
                  type="radio"
                  name="access"
                  className="mt-1"
                  checked={on}
                  disabled={disabled}
                  onChange={() => setAccessChoice(value)}
                />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs text-gray-500">{disabled && reasonOff ? reasonOff : sub}</span>
                </span>
              </label>
            );
          })}
        </div>
        {access === 'login' && (
          <div className="mt-2 max-w-md">
            <Label className="text-xs">Temporary password (8+ characters)</Label>
            <Input value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} data-add-temp />
          </div>
        )}
      </div>
      {duplicate && (
        <p className="text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2" data-add-dup>
          Already on the roster —{' '}
          <Link to={`/crew/${duplicate.id}`} className="underline">
            open {duplicate.name}
          </Link>{' '}
          instead of adding a second one.
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Button disabled={!ready || busy} onClick={() => void submit()} data-add-submit>
          {busy ? 'Adding…' : label}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {needsRole && <span className="text-xs text-gray-500">Pick a role for the login.</span>}
        {access === 'invite' && (
          <span className="text-xs text-gray-400 inline-flex items-center gap-1">
            <Mail className="h-3 w-3" /> Works without email set up — you get a link to text.
          </span>
        )}
      </div>
    </div>
  );
}

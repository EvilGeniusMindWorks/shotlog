// PEOPLE — the one list. Every person in the company is a roster entry; a
// login is a PROPERTY of a person, not a separate list. Merges the old
// Admin › Users page, the Admin › Company roster section, and the Settings
// crew card.
//
// Capability split (server-enforced, mirrored here):
//   supervisor  add people, edit non-login roles, deactivate non-login people
//   admin       everything: invites, create login, reset password, role
//               changes on login people, deactivate anyone
// One deactivate switch: a person with a login loses BOTH the login (sessions
// revoked server-side) and their roster spot in one action.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  AlertTriangle, Check, Copy, KeyRound, Link2, Mail, MoreHorizontal, Plus, Send, UserX, UserCheck,
} from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { authedFetch, getSessionUser, type UserLicense } from '@/lib/session';
import { generateId, nowISO } from '@/lib/utils';
import type { CrewMember } from '@/db/schema';
import { compareByLastName, lastFirst, parsePersonLine } from '@/lib/people';
import { AddPersonPanel } from '@/components/admin/AddPersonPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ChipSelect } from '@/components/ui/chip-select';
import { BUILT_IN_ROLES, BUILT_IN_ROLE_KEYS } from '@shotlog/shared';

// Built-ins + this company's custom role definitions (Admin › Roles) —
// edited built-ins keep their key but show their edited display name
function useRoleOptions(): { value: string; label: string }[] {
  const defs = useLiveQuery(() => db.roleDefinitions.toArray()) ?? [];
  const byKey = new Map(defs.map((d) => [d.key, d]));
  return [
    ...BUILT_IN_ROLES.map((b) => ({
      value: b.key,
      label: b.key === 'admin' ? b.name : (byKey.get(b.key)?.name ?? b.name),
    })),
    ...defs
      .filter((d) => !BUILT_IN_ROLE_KEYS.has(d.key))
      .map((d) => ({ value: d.key, label: d.name })),
  ];
}

interface CompanyUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  licenses?: UserLicense[];
}

interface InviteLite {
  id: string;
  name: string;
  email: string | null;
  role: string;
  crewMemberId: string | null;
  expiresAt: string;
  usedAt: string | null;
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

/** Paste "Last, First" or "First Last" lines to add many people at once.
 *  2026-09-07: a line may carry an email ("Baltazar, Dinis, danny@…" or
 *  "Dean Briggs <dean@…>") — online, each of those gets an invite too. */
function BulkAdd({
  known,
  isAdmin,
  online,
  role,
  onDirectory,
}: {
  known: Set<string>;
  isAdmin: boolean;
  online: boolean;
  role: string;
  onDirectory: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [links, setLinks] = useState<{ name: string; link: string }[]>([]);
  const canInvite = isAdmin && online;
  const run = async () => {
    setBusy(true);
    const seen = new Set(known);
    const now = nowISO();
    let added = 0;
    let invited = 0;
    let emailed = 0;
    let failed = 0;
    const out: { name: string; link: string }[] = [];
    for (const raw of text.split('\n')) {
      const p = parsePersonLine(raw);
      if (!p || seen.has(p.name.toLowerCase())) continue;
      seen.add(p.name.toLowerCase());
      const id = generateId();
      await db.crewMembers.put({
        id, name: p.name, lastName: p.lastName || undefined, licenseNumber: '', licenseState: '', isActive: true,
        ...(role ? { role } : {}),
        createdAt: now, updatedAt: now, syncStatus: 'local',
      });
      added++;
      if (p.email && canInvite) {
        try {
          const res = await authedFetch('/admin/invites', {
            method: 'POST',
            body: JSON.stringify({ name: p.name, role: role || 'blaster', crewMemberId: id, email: p.email }),
          });
          const body = (await res.json().catch(() => null)) as { link?: string; emailed?: boolean } | null;
          if (!res.ok) throw new Error('invite failed');
          invited++;
          if (body?.emailed) emailed++;
          else if (body?.link) out.push({ name: p.name, link: body.link });
        } catch {
          failed++;
        }
      }
    }
    if (invited || failed) await onDirectory();
    const parts = [`Added ${added} ${added === 1 ? 'person' : 'people'}`];
    if (invited) parts.push(`invited ${invited}${emailed ? ` (${emailed} emailed)` : ''}`);
    if (failed) parts.push(`${failed} invite${failed === 1 ? '' : 's'} failed — use Invite on their rows`);
    setResult(`${parts.join(' · ')}.`);
    setLinks(out);
    setText('');
    setBusy(false);
  };
  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)} data-bulk-open>Paste list</Button>
      {open && (
        <div className="space-y-2">
          <textarea
            className="w-full h-32 rounded-lg border border-gray-300 p-2 text-sm"
            placeholder={'One person per line — add an email to invite them too:\nBaltazar, Dinis, dinis@company.com\nDean Briggs <dean@company.com>\nLuis Ferreira'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            data-bulk-text
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" disabled={!text.trim() || busy} onClick={() => void run()} data-bulk-run>
              {busy ? 'Adding…' : 'Add people'}
            </Button>
            <span className="text-xs text-gray-400">
              {canInvite ? 'Lines with an email get an invite (role: the chip picked in Add person, else blaster).' : isAdmin ? 'Offline — people are added; invites can go from their rows later.' : 'Roster only.'}
            </span>
            {result && <p className="text-sm text-gray-500 w-full" data-bulk-result>{result}</p>}
          </div>
          {links.length > 0 && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-2 space-y-1" data-bulk-links>
              <p className="text-xs text-green-800">Email is not set up — text these links:</p>
              {links.map((l) => (
                <p key={l.link} className="text-xs font-mono truncate">
                  <b className="font-sans">{l.name}</b> · {l.link}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type RowPanel = 'none' | 'invite' | 'login' | 'reset' | 'confirm-off';

function PersonRow({
  member, user, invites, isAdmin, meUserId, online, onDirectory,
}: {
  member: CrewMember;
  user?: CompanyUser;
  invites: InviteLite[];
  isAdmin: boolean;
  meUserId: string;
  online: boolean;
  onDirectory: () => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const ROLE_OPTIONS = useRoleOptions();
  const [panel, setPanel] = useState<RowPanel>('none');
  // S4: rows are one line; role edit + actions live behind ⋯
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [emailNote, setEmailNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // direct-login state
  const [loginForm, setLoginForm] = useState({ email: '', tempPassword: '' });
  const [tempPassword, setTempPassword] = useState('');

  const pendingInvite = invites.find((i) => i.crewMemberId === member.id && !i.usedAt);
  const role = user?.role ?? member.role ?? '';
  const isSelf = Boolean(user && user.id === meUserId);

  const rest = async (path: string, init: RequestInit): Promise<unknown> => {
    const res = await authedFetch(path, init);
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new Error(body?.error ?? `request failed (${res.status})`);
    return body;
  };
  // keepPanel: the invite panel must STAY open to show the link + email
  // status (the default close-on-success hid it — S1 finding O2)
  const act = (fn: () => Promise<void>, opts: { keepPanel?: boolean } = {}) => {
    setBusy(true);
    setError(null);
    void fn()
      .then(() => {
        if (!opts.keepPanel) setPanel('none');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'request failed'))
      .finally(() => setBusy(false));
  };

  // ONE role per person: login people update the server (which also stamps
  // the roster tag); non-login people are a local roster edit.
  const changeRole = (next: string) => {
    if (!next || next === role) return;
    if (user) {
      act(async () => {
        await rest(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ role: next }) });
        await db.crewMembers.update(member.id, { role: next, updatedAt: nowISO() });
        await onDirectory();
      });
    } else {
      void db.crewMembers.update(member.id, { role: next, updatedAt: nowISO() });
    }
  };

  // ONE deactivate switch: login + roster together
  const setActive = (active: boolean) => {
    if (user) {
      act(async () => {
        await rest(`/users/${user.id}/set-active`, { method: 'POST', body: JSON.stringify({ active }) });
        await db.crewMembers.update(member.id, { isActive: active, updatedAt: nowISO() });
        await onDirectory();
      });
    } else {
      void db.crewMembers.update(member.id, { isActive: active, updatedAt: nowISO() });
      setPanel('none');
    }
  };

  const sendInvite = () => {
    act(async () => {
      const body = (await rest('/admin/invites', {
        method: 'POST',
        body: JSON.stringify({
          name: member.name,
          role: role || 'blaster',
          crewMemberId: member.id,
          email: inviteEmail.trim() || undefined,
        }),
      })) as { link?: string; emailed?: boolean; emailConfigured?: boolean };
      setInviteLink(body?.link ?? null);
      setEmailed(Boolean(body?.emailed));
      // Tell the truth about why it wasn't emailed
      setEmailNote(
        inviteEmail.trim() && !body?.emailed
          ? body?.emailConfigured
            ? "The email didn't send — share the link instead."
            : 'Email is not set up on the server yet — share the link instead.'
          : null,
      );
      if (!member.role) void db.crewMembers.update(member.id, { role: 'blaster', updatedAt: nowISO() });
      await onDirectory();
      setPanel('invite'); // stay open to show the link
    }, { keepPanel: true });
  };

  const createLogin = () => {
    act(async () => {
      await rest('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: member.name,
          email: loginForm.email.trim(),
          role: role || 'blaster',
          tempPassword: loginForm.tempPassword,
          crewMemberId: member.id,
        }),
      });
      await onDirectory();
    });
  };

  const roleLabel = ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
  const showTools = open || panel !== 'none';
  return (
    <div
      className={`${member.isActive ? '' : 'opacity-60'} ${panel !== 'none' ? 'pb-3 [&>.mt-3]:mx-3' : ''}`}
      data-person-row={member.id}
    >
      {/* One-line row (S4): name · email · role · login · expiry · ⋯ */}
      <div className="flex items-center gap-2 px-3 min-h-[44px]">
        <button
          className="min-w-0 flex-1 text-left py-1.5"
          title="Open person page"
          onClick={() => navigate(`/crew/${member.id}`)}
        >
          <span className="block font-medium text-sm truncate hover:underline" data-person-name>
            {lastFirst(member)}
            {isSelf && <span className="text-gray-400 font-normal"> (you)</span>}
          </span>
          {user && <span className="block text-[11px] text-gray-400 truncate">{user.email}</span>}
        </button>
        {roleLabel && <Badge variant="secondary" className="capitalize hidden sm:inline-flex">{roleLabel}</Badge>}
        {user ? (
          <Badge variant="synced">login</Badge>
        ) : pendingInvite ? (
          <Badge variant="pending">invited</Badge>
        ) : (
          <Badge variant="local">no login</Badge>
        )}
        {!member.isActive && <Badge variant="local">deactivated</Badge>}
        <ExpiryChip licenses={user?.licenses} />
        <button
          className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${showTools ? 'bg-gray-100 text-navy' : 'text-gray-400 hover:text-navy hover:bg-gray-100'}`}
          aria-label="More"
          aria-expanded={showTools}
          data-person-more
          onClick={() => {
            if (showTools) setPanel('none');
            setOpen(!showTools);
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {showTools && (
      <div className="px-3 pb-3 flex items-center gap-2 flex-wrap" data-person-tools>
        <Select
          value={role}
          disabled={Boolean(user) && (!isAdmin || !online)}
          onChange={(e) => changeRole(e.target.value)}
          options={[{ value: '', label: 'Role…' }, ...ROLE_OPTIONS]}
        />
        <div className="flex items-center gap-1">
          {isAdmin && !user && member.isActive && (
            <>
              <Button variant="ghost" size="sm" disabled={!online}
                onClick={() => setPanel(panel === 'invite' ? 'none' : 'invite')}>
                <Send className="h-4 w-4 mr-1" /> {pendingInvite ? 'Re-invite' : 'Invite'}
              </Button>
              <Button variant="ghost" size="sm" disabled={!online} title="Create a login yourself with a temp password"
                onClick={() => setPanel(panel === 'login' ? 'none' : 'login')}>
                <KeyRound className="h-4 w-4 mr-1" /> Login
              </Button>
            </>
          )}
          {isAdmin && user && (
            <Button variant="ghost" size="icon" title="Reset password" disabled={!online}
              onClick={() => setPanel(panel === 'reset' ? 'none' : 'reset')}>
              <KeyRound className="h-4 w-4 text-gray-400" />
            </Button>
          )}
          {!isSelf && (isAdmin || !user) &&
            (member.isActive ? (
              <Button variant="ghost" size="icon" title="Deactivate" disabled={Boolean(user) && !online}
                onClick={() => setPanel('confirm-off')}>
                <UserX className="h-4 w-4 text-gray-400" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" title="Reactivate" disabled={Boolean(user) && !online}
                onClick={() => setActive(true)}>
                <UserCheck className="h-4 w-4 text-green-600" />
              </Button>
            ))}
        </div>
      </div>
      )}

      {panel === 'invite' && !inviteLink && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3 flex items-end gap-2 flex-wrap">
          <div className="flex-1 max-w-xs">
            <Label className="text-xs">Email (optional — leave blank to just share the link)</Label>
            <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          </div>
          <Button size="sm" disabled={busy || !online} onClick={sendInvite}>Create invite</Button>
          <p className="w-full text-xs text-gray-400">
            They set their own password, PIN, and licenses. Uses the role selected on this row.
          </p>
        </div>
      )}
      {panel === 'invite' && inviteLink && (
        <div className="mt-3 rounded-lg bg-green-50 border border-green-200 p-3 space-y-2">
          <p className="text-sm text-green-800 flex items-center gap-1">
            {emailed ? (
              <><Mail className="h-4 w-4" /> Invite emailed. You can also share the link directly:</>
            ) : (
              <>Invite ready — share this link with {member.name.split(' ')[0]} (text works fine):</>
            )}
          </p>
          {emailNote && <p className="text-xs text-orange-700">{emailNote}</p>}
          <div className="flex items-center gap-2">
            <Input readOnly value={inviteLink} className="font-mono text-xs" />
            <Button variant="outline" size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(inviteLink).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                });
              }}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-gray-500">Works once, expires in 14 days.</p>
        </div>
      )}

      {panel === 'login' && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Email</Label>
            <Input type="email" value={loginForm.email}
              onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Temporary password (8+ characters)</Label>
            <Input value={loginForm.tempPassword}
              onChange={(e) => setLoginForm({ ...loginForm, tempPassword: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <Button size="sm"
              disabled={busy || !online || !loginForm.email.trim() || loginForm.tempPassword.length < 8}
              onClick={createLogin}>
              Create login
            </Button>
            <p className="text-xs text-gray-400">Share the temp password directly — they change it on their Profile.</p>
          </div>
        </div>
      )}

      {panel === 'reset' && user && (
        <div className="mt-3 flex items-end gap-2 rounded-lg bg-gray-50 p-3">
          <div className="flex-1 max-w-xs">
            <Label>New temporary password (8+ characters)</Label>
            <Input value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} />
          </div>
          <Button disabled={busy || !online || tempPassword.length < 8}
            onClick={() =>
              act(async () => {
                await rest(`/users/${user.id}/reset-password`, {
                  method: 'POST',
                  body: JSON.stringify({ tempPassword }),
                });
              })
            }>
            Reset
          </Button>
          <Button variant="ghost" onClick={() => setPanel('none')}>Cancel</Button>
        </div>
      )}

      {panel === 'confirm-off' && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm flex-wrap">
          <span className="flex-1 min-w-48">
            Deactivate {member.name}? {user
              ? "They're signed out everywhere and leave every picker — one switch does both."
              : 'They leave every picker and roster list.'}{' '}
            Their records and history are kept.
          </span>
          <Button variant="outline" disabled={busy || (Boolean(user) && !online)} onClick={() => setActive(false)}>
            Deactivate
          </Button>
          <Button variant="ghost" onClick={() => setPanel('none')}>Cancel</Button>
        </div>
      )}

      {error && <p className="mt-2 px-3 pb-2 text-sm text-violation">{error}</p>}
    </div>
  );
}

export function AdminPeoplePage() {
  const { online } = useOutletContext<{ online: boolean }>();
  const me = getSessionUser();
  const isAdmin = me?.role === 'admin';
  const navigate = useNavigate();
  const ROLE_OPTIONS = useRoleOptions();
  const people = useLiveQuery(() => db.crewMembers.toArray()) ?? [];
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [invites, setInvites] = useState<InviteLite[]>([]);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  // S4: 15 rows + Show all (search shows everyone) — Baystate's 24-person
  // roster was 4.4 screens of 3-line blocks
  const [showAll, setShowAll] = useState(false);

  const loadDirectory = useCallback(async () => {
    if (!isAdmin) return; // /users is admin-only; supervisors run roster-only
    try {
      const [usersRes, invitesRes] = await Promise.all([
        authedFetch('/users'),
        authedFetch('/admin/invites'),
      ]);
      if (usersRes.ok) setUsers(((await usersRes.json()) as { users: CompanyUser[] }).users);
      if (invitesRes.ok) setInvites(((await invitesRes.json()) as { invites: InviteLite[] }).invites);
    } catch {
      /* offline — login management disabled anyway */
    }
  }, [isAdmin]);

  useEffect(() => {
    // heal pre-merge ghosts (logins without a roster entry), then load
    void (async () => {
      if (isAdmin && navigator.onLine) {
        await authedFetch('/users/backfill-roster', { method: 'POST' }).catch(() => undefined);
      }
      await loadDirectory();
    })();
  }, [isAdmin, loadDirectory]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const q = search.toLowerCase();
  const visible = people
    .filter((p) => (showInactive ? true : p.isActive))
    .filter((p) => {
      if (!q) return true;
      const u = p.userId ? userById.get(p.userId) : undefined;
      return p.name.toLowerCase().includes(q) || (u?.email ?? '').toLowerCase().includes(q);
    })
    // "Baltazar, Danny" order (Matthew, 2026-09-07)
    .sort(compareByLastName);

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        One list for everyone — crew, drillers, office. A login is a property of a person:
        invite them (they set their own password) or create one directly. People without a
        login still appear on daily reports and person pages.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          show deactivated
        </label>
        <div className="flex-1" />
        <BulkAdd
          known={new Set(people.map((p) => p.name.toLowerCase()))}
          isAdmin={isAdmin}
          online={online}
          role=""
          onDirectory={loadDirectory}
        />
        <Button onClick={() => setAdding(!adding)} data-tour="people-add">
          <Plus className="h-4 w-4 mr-1" /> Add person
        </Button>
      </div>

      {adding && (
        <AddPersonPanel
          roleOptions={ROLE_OPTIONS}
          isAdmin={isAdmin}
          online={online}
          people={people}
          onDone={loadDirectory}
          onClose={() => setAdding(false)}
        />
      )}

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {(showAll || q ? visible : visible.slice(0, 15)).map((p) => (
          <PersonRow
            key={p.id}
            member={p}
            user={p.userId ? userById.get(p.userId) : undefined}
            invites={invites}
            isAdmin={isAdmin}
            meUserId={me?.id ?? ''}
            online={online}
            onDirectory={loadDirectory}
          />
        ))}
        {!showAll && !q && visible.length > 15 && (
          <button
            className="w-full text-left px-3 py-2.5 text-xs text-gray-400 hover:text-navy"
            onClick={() => setShowAll(true)}
            data-people-more
          >
            Show all {visible.length} people ▸
          </button>
        )}
        {visible.length === 0 && (
          <p className="p-4 text-sm text-gray-400">
            {search ? 'Nobody matches.' : 'No people yet — add your roster above.'}
          </p>
        )}
      </div>
      <p className="text-xs text-gray-400 flex items-center gap-1">
        <Link2 className="h-3 w-3" /> Tap a name for their person page — days worked, documents,
        and history. {isAdmin ? '' : 'Login management (invites, passwords) is admin-only.'}
      </p>
      {!isAdmin && (
        <button className="text-xs text-navy underline" onClick={() => navigate('/admin/approvals')}>
          Back to approvals
        </button>
      )}
    </div>
  );
}

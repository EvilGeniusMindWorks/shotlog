// Company settings (synced single doc) + crew↔account linking.
// The crew/equipment rosters themselves are edited on Settings (gated to
// admin/supervisor); this page adds what only admins can do: company
// details and connecting roster names to real login accounts.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Check, Copy, Link2, Mail, Send, UsersRound } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { authedFetch, getSessionUser } from '@/lib/session';
import { generateId, nowISO } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ChipSelect } from '@/components/ui/chip-select';

const SINGLETON = 'companySettings-singleton';

const INVITE_ROLES = [
  { value: 'blaster', label: 'Blaster' },
  { value: 'driller', label: 'Driller' },
  { value: 'mechanic', label: 'Mechanic' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'office', label: 'Office' },
  { value: 'admin', label: 'Admin' },
];

interface CompanyUserLite {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
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

/** Office routing (Tony/Bob/Evette style): who the field calls for what */
function OfficeContactsSection({
  settings,
  online,
}: {
  settings: { officeContacts?: { id: string; label: string; name: string; phone: string }[] } | undefined;
  online: boolean;
}) {
  const contacts = settings?.officeContacts ?? [];
  const [form, setForm] = useState({ label: '', name: '', phone: '' });
  const save = async (next: typeof contacts) => {
    await db.companySettings.update('companySettings-singleton', {
      officeContacts: next,
      updatedAt: nowISO(),
    });
  };
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <p className="font-medium text-sm">Office routing</p>
      <p className="text-xs text-gray-400">
        Shown to every crew under the job's Contacts button — "change in scope → Tony" style.
      </p>
      <div className="space-y-1">
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 uppercase tracking-wide">{c.label}</p>
              <p className="text-sm font-medium">{c.name}</p>
            </div>
            <span className="font-mono text-sm text-navy">{c.phone}</span>
            <Button variant="ghost" size="icon" disabled={!online}
              onClick={() => void save(contacts.filter((x) => x.id !== c.id))}>
              ✕
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        <div className="w-44"><Label className="text-xs">Reason (e.g. Equipment issues)</Label>
          <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
        <div className="w-32"><Label className="text-xs">Name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="w-40"><Label className="text-xs">Phone</Label>
          <Input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <Button size="sm" disabled={!online || !form.label.trim() || !form.phone.trim()}
          onClick={() => {
            void save([...contacts, { id: generateId(), ...form }]);
            setForm({ label: '', name: '', phone: '' });
          }}>
          Add
        </Button>
      </div>
    </section>
  );
}

/** Paste "Last, First" or "First Last" lines; optional email after a comma/tab */
function BulkRosterAdd({ crew }: { crew: { name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    const known = new Set(crew.map((c) => c.name.toLowerCase()));
    const now = nowISO();
    let added = 0;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      // "Baltazar, Dinis" → "Dinis Baltazar"; plain "First Last" passes through
      const m = line.match(/^([^,]+),\s*(.+)$/);
      const name = (m ? `${m[2].trim()} ${m[1].trim()}` : line).replace(/\s+/g, ' ');
      if (known.has(name.toLowerCase())) continue;
      known.add(name.toLowerCase());
      await db.crewMembers.put({
        id: generateId(),
        name,
        licenseNumber: '',
        licenseState: '',
        isActive: true,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'local',
      });
      added++;
    }
    setResult(`Added ${added} crew member${added === 1 ? '' : 's'}.`);
    setText('');
  };

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
        Paste roster
      </Button>
      {open && (
        <div className="space-y-2">
          <textarea
            className="w-full h-32 rounded-lg border border-gray-300 p-2 text-sm"
            placeholder={'One person per line:\nBaltazar, Dinis\nDean Briggs'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={!text.trim()} onClick={() => void run()}>
              Add to roster
            </Button>
            {result && <p className="text-sm text-gray-500">{result}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function CrewRow({
  member,
  users,
  invites,
  online,
  onInvited,
}: {
  member: { id: string; name: string; userId?: string; role?: string };
  users: CompanyUserLite[];
  invites: InviteLite[];
  online: boolean;
  onInvited: () => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const [inviting, setInviting] = useState(false);
  const [role, setRole] = useState('blaster');
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pendingInvite = invites.find((i) => i.crewMemberId === member.id && !i.usedAt);
  const enrolled = Boolean(member.userId);

  const sendInvite = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch('/admin/invites', {
        method: 'POST',
        body: JSON.stringify({
          name: member.name,
          role,
          crewMemberId: member.id,
          email: email.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { link?: string; emailed?: boolean; error?: string }
        | null;
      if (!res.ok) throw new Error(body?.error ?? 'invite failed');
      setLink(body?.link ?? null);
      setEmailed(Boolean(body?.emailed));
      // The invite's role becomes the roster tag too (dispatch picker uses it)
      void db.crewMembers.update(member.id, { role, updatedAt: nowISO() });
      await onInvited();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'invite failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="flex-1 text-sm font-medium truncate text-left hover:underline"
          title="Open person page"
          onClick={() => navigate(`/crew/${member.id}`)}
        >
          {member.name}
        </button>
        {/* Roster role tag — drives the blaster's "Send to drillers" picker */}
        <Select
          value={member.role ?? ''}
          onChange={(e) =>
            void db.crewMembers.update(member.id, {
              role: e.target.value || undefined,
              updatedAt: nowISO(),
            })
          }
          options={[{ value: '', label: 'Role…' }, ...INVITE_ROLES]}
        />
        {enrolled ? (
          <Badge variant="synced">enrolled</Badge>
        ) : pendingInvite ? (
          <Badge variant="pending">invited</Badge>
        ) : (
          <Badge variant="local">no account</Badge>
        )}
        {!enrolled && (
          <Button variant="ghost" size="sm" disabled={!online}
            onClick={() => setInviting(!inviting)}>
            <Send className="h-4 w-4 mr-1" /> {pendingInvite ? 'Re-invite' : 'Invite'}
          </Button>
        )}
        <Select
          value={member.userId ?? ''}
          onChange={(e) => {
            const userId = e.target.value || undefined;
            void db.crewMembers.update(member.id, { userId, updatedAt: nowISO() });
          }}
          options={[
            { value: '', label: 'Not linked' },
            ...users.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` })),
          ]}
        />
      </div>
      {inviting && !link && (
        <div className="rounded-lg bg-gray-50 p-3 space-y-2">
          <div>
            <Label className="text-xs">Role</Label>
            <ChipSelect value={role} onChange={setRole} options={INVITE_ROLES} />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 max-w-xs">
              <Label className="text-xs">Email (optional — leave blank to just share the link)</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button size="sm" disabled={busy || !online} onClick={() => void sendInvite()}>
              Create invite
            </Button>
          </div>
          {error && <p className="text-sm text-violation">{error}</p>}
        </div>
      )}
      {link && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 space-y-2">
          <p className="text-sm text-green-800 flex items-center gap-1">
            {emailed ? (
              <>
                <Mail className="h-4 w-4" /> Invite emailed. You can also share the link directly:
              </>
            ) : (
              <>Invite ready — share this link with {member.name.split(' ')[0]} (text works fine):</>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Input readOnly value={link} className="font-mono text-xs" />
            <Button variant="outline" size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(link).then(() => {
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
    </div>
  );
}

export function AdminCompanyPage() {
  const { online } = useOutletContext<{ online: boolean }>();
  const settings = useLiveQuery(() => db.companySettings.get(SINGLETON));
  const crew = useLiveQuery(() => db.crewMembers.filter((c) => c.isActive).toArray()) ?? [];
  const [users, setUsers] = useState<CompanyUserLite[]>([]);
  const [form, setForm] = useState({
    companyName: '',
    dealerNumber: '',
    address: '',
    city: '',
    state: '',
    phone: '',
  });
  const [loadedFromDoc, setLoadedFromDoc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (loadedFromDoc) return;
    if (settings) {
      setForm({
        companyName: settings.companyName ?? '',
        dealerNumber: settings.dealerNumber ?? '',
        address: settings.address ?? '',
        city: settings.city ?? '',
        state: settings.state ?? '',
        phone: settings.phone ?? '',
      });
      setLoadedFromDoc(true);
    } else {
      const session = getSessionUser();
      if (session) setForm((f) => (f.companyName ? f : { ...f, companyName: session.company }));
    }
  }, [settings, loadedFromDoc]);

  const [invites, setInvites] = useState<InviteLite[]>([]);
  const loadDirectory = useCallback(async () => {
    try {
      const [usersRes, invitesRes] = await Promise.all([
        authedFetch('/users'),
        authedFetch('/admin/invites'),
      ]);
      if (usersRes.ok) {
        const body = (await usersRes.json()) as { users: CompanyUserLite[] };
        setUsers(body.users.filter((u) => u.isActive));
      }
      if (invitesRes.ok) {
        const body = (await invitesRes.json()) as { invites: InviteLite[] };
        setInvites(body.invites);
      }
    } catch {
      /* offline — directory features disabled anyway */
    }
  }, []);
  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await authedFetch('/admin/company', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'save failed');
      setMessage('Saved — every device gets the update on its next sync.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <p className="font-medium text-sm">Company details</p>
        <p className="text-xs text-gray-400">
          Shown on printed blast logs and used to pre-fill forms on every device.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Company name</Label>
            <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </div>
          <div>
            <Label>Dealer number</Label>
            <Input value={form.dealerNumber} onChange={(e) => setForm({ ...form, dealerNumber: e.target.value })} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="w-16">
              <Label>State</Label>
              <Input value={form.state} maxLength={2}
                onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })} />
            </div>
          </div>
        </div>
        <Button onClick={() => void save()} disabled={busy || !online || !form.companyName.trim()}>
          Save company details
        </Button>
        {message && <p className="text-sm text-gray-500">{message}</p>}
      </section>

      <OfficeContactsSection settings={settings} online={online} />

      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <p className="font-medium text-sm flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-gray-400" /> Crew roster
        </p>
        <p className="text-xs text-gray-400">
          Everyone here auto-populates the Work Force list on daily reports. Invite the ones
          who should have their own login — they set their password, PIN, and licenses
          themselves. Link handles people without email: copy it and text it to them.
        </p>
        <BulkRosterAdd crew={crew} />
        <div className="divide-y divide-gray-100">
          {crew.map((member) => (
            <CrewRow
              key={member.id}
              member={member}
              users={users}
              invites={invites}
              online={online}
              onInvited={loadDirectory}
            />
          ))}
          {crew.length === 0 && (
            <p className="py-2 text-sm text-gray-400">No active crew members yet — paste your roster above.</p>
          )}
        </div>
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <Link2 className="h-3 w-3" /> Manual account linking is under each member's dropdown;
          enrolling via invite links automatically.
        </p>
      </section>
    </div>
  );
}

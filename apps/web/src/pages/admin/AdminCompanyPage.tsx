// Company settings (synced single doc) + crew↔account linking.
// The crew/equipment rosters themselves are edited on Settings (gated to
// admin/supervisor); this page adds what only admins can do: company
// details and connecting roster names to real login accounts.
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { authedFetch, getSessionUser } from '@/lib/session';
import { nowISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const SINGLETON = 'companySettings-singleton';

interface CompanyUserLite {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
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

  useEffect(() => {
    void authedFetch('/users')
      .then(async (res) => {
        if (res.ok) {
          const body = (await res.json()) as { users: CompanyUserLite[] };
          setUsers(body.users.filter((u) => u.isActive));
        }
      })
      .catch(() => undefined);
  }, []);

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

      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <p className="font-medium text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4 text-gray-400" /> Crew roster ↔ login accounts
        </p>
        <p className="text-xs text-gray-400">
          Linking a crew name to an account means their daily-report hours and licenses can
          follow the person, not just the name. Edit the roster itself under Settings.
        </p>
        <div className="divide-y divide-gray-100">
          {crew.map((member) => (
            <div key={member.id} className="py-2 flex items-center gap-3">
              <p className="flex-1 text-sm font-medium truncate">{member.name}</p>
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
          ))}
          {crew.length === 0 && (
            <p className="py-2 text-sm text-gray-400">No active crew members yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

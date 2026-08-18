// Company settings (synced single doc): details, office routing contacts,
// and attachment types. People (roster + logins) live on Admin › People.
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useLiveQuery, db } from '@/db';
import { authedFetch, getSessionUser } from '@/lib/session';
import { generateId, nowISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SINGLETON = 'companySettings-singleton';

/** Company-defined attachment types, merged into every attachment picker */
function AttachmentTypesSection({
  settings,
}: {
  settings: { attachmentTypes?: string[] } | undefined;
}) {
  const types = settings?.attachmentTypes ?? [];
  const [draft, setDraft] = useState('');
  const save = async (next: string[]) => {
    await db.companySettings.update('companySettings-singleton', {
      attachmentTypes: next,
      updatedAt: nowISO(),
    });
  };
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <p className="font-medium text-sm">Attachment types</p>
      <p className="text-xs text-gray-400">
        Built-ins (Bill of lading, Shot video, Photo, Other) are always offered — types added here
        appear alongside them on every attachment picker in the field.
      </p>
      <div className="flex gap-1.5 flex-wrap">
        {types.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-medium"
          >
            {t}
            <button
              className="text-gray-400 hover:text-gray-700"
              title={`Remove ${t}`}
              onClick={() => void save(types.filter((x) => x !== t))}
            >
              ✕
            </button>
          </span>
        ))}
        {types.length === 0 && <p className="text-xs text-gray-400">No custom types yet.</p>}
      </div>
      <div className="flex items-end gap-2">
        <div className="w-56">
          <Label className="text-xs">New type (e.g. Permit, Pre-blast survey)</Label>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                void save([...types, draft.trim()]);
                setDraft('');
              }
            }}
          />
        </div>
        <Button
          size="sm"
          disabled={!draft.trim() || types.includes(draft.trim())}
          onClick={() => {
            void save([...types, draft.trim()]);
            setDraft('');
          }}
        >
          Add
        </Button>
      </div>
    </section>
  );
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

/** Pre-blast ritual placeholder language (Round 2) — one item per line,
 *  shown on the day hub's placeholder card. Nothing enforced. */
function PreBlastChecklistSection({
  settings,
}: {
  settings: { preBlastChecklist?: string[] } | undefined;
}) {
  const [text, setText] = useState<string | null>(null);
  const value = text ?? (settings?.preBlastChecklist ?? []).join('\n');
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <p className="font-medium text-sm">Pre-blast checklist (placeholder)</p>
      <p className="text-xs text-gray-400">
        One item per line — shown on every blasting day's hub as a reference list. Nothing is
        recorded or enforced yet; leave empty for the built-in default language.
      </p>
      <textarea
        className="w-full rounded-md border border-gray-300 p-2 text-sm min-h-[90px]"
        value={value}
        placeholder={'Notifications made (FD / abutters per site rules)\nPre-blast surveys current…'}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === null) return;
          const items = text.split('\n').map((s) => s.trim()).filter(Boolean);
          void db.companySettings.update(SINGLETON, {
            preBlastChecklist: items.length > 0 ? items : undefined,
            updatedAt: nowISO(),
          });
        }}
      />
    </section>
  );
}

export function AdminCompanyPage() {
  const { online } = useOutletContext<{ online: boolean }>();
  const settings = useLiveQuery(() => db.companySettings.get(SINGLETON));
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
      <AttachmentTypesSection settings={settings} />
      <PreBlastChecklistSection settings={settings} />
    </div>
  );
}

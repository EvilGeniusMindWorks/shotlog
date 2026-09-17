// Company settings (synced single doc): details, office routing contacts,
// and attachment types. People (roster + logins) live on Admin › People.
import { useEffect, useState } from 'react';
import { ApprovalsMatrix } from '@/components/admin/ApprovalsMatrix';
import { SHEET_ROWS } from '@/lib/contactSheet';
import { useOutletContext } from 'react-router-dom';
import { useLiveQuery, db } from '@/db';
import { authedFetch, getSessionUser } from '@/lib/session';
import { generateId, nowISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DraftInput } from '@/components/ui/draft-input';
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

/** S20 (Matthew, Sep 16 2026): the home's Needs attention line counts an
 *  unfiled draft only once it is this many days old */
function HomeSettingsSection({ settings, online }: { settings: { homeStaleDraftDays?: number } | undefined; online: boolean }) {
  const value = settings?.homeStaleDraftDays ?? 2;
  // no field until the record is here: a default shown for a beat could be "edited" into the record
  if (!settings) return null;
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-2" data-home-settings>
      <p className="font-medium text-sm">The home screen</p>
      <p className="text-xs text-gray-400">
        A blaster's home folds unfiled days into one line under Needs attention. A draft counts once it is this many days old; today's and yesterday's work never nags.
      </p>
      <div className="flex items-center gap-2">
        <Label className="text-xs">Count a draft as unfiled after</Label>
        <DraftInput
          type="number"
          min={0}
          max={60}
          inputMode="numeric"
          className="w-20"
          data-home-stale-days
          value={value}
          disabled={!online}
          onCommit={(text) => {
            const n = Math.max(0, Math.min(60, parseInt(text, 10) || 0));
            if (n === value) return;
            void db.companySettings.update('companySettings-singleton', { homeStaleDraftDays: n, updatedAt: nowISO() });
          }}
        />
        <span className="text-xs text-gray-500">days</span>
      </div>
    </section>
  );
}

let officeSaveQueue: Promise<void> = Promise.resolve();

/** Office routing (Tony/Bob/Evette style): who the field calls for what */
function OfficeContactsSection({
  settings,
  online,
}: {
  settings: { officeContacts?: { id: string; label: string; name: string; phone: string; key?: string }[] } | undefined;
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
  // S22: the sheet's fixed BBI Office rows — every job's contact sheet starts from these
  const officeRows = SHEET_ROWS.filter((r) => r.group === 'office');
  const saveKeyed = (key: string, label: string, patch: { name?: string; phone?: string }) => {
    // one save at a time, each reading the record as it is then — a name blur and a phone blur
    // a beat apart must land on the same keyed row, never make a twin
    officeSaveQueue = officeSaveQueue.then(async () => {
      const fresh = (await db.companySettings.get('companySettings-singleton'))?.officeContacts ?? contacts;
      const cur = fresh.find((c) => c.key === key);
      const next = cur ? fresh.map((c) => (c.key === key ? { ...c, ...patch } : c)) : [...fresh, { id: generateId(), key, label, name: '', phone: '', ...patch }];
      await save(next);
    }).catch(() => undefined);
    return officeSaveQueue;
  };
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <p className="font-medium text-sm">Office routing</p>
      <p className="text-xs text-gray-400">
        The BBI Office rows of every job's contact sheet, and any other routing shown to the crew under the day's ☎ — "change in scope → Tony" style.
      </p>
      {settings && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" data-office-rows>
          {officeRows.map((row) => {
            const cur = contacts.find((c) => c.key === row.key);
            return (
              <div key={row.key} className="rounded-lg border border-gray-200 px-3 py-2" data-office-row={row.key}>
                <p className="text-xs text-gray-400 uppercase tracking-wide">{row.label}</p>
                <div className="flex gap-2 mt-1">
                  <Input placeholder="Name" defaultValue={cur?.name ?? ''} disabled={!online} data-office-row-name onBlur={(e) => { if ((cur?.name ?? '') !== e.target.value) void saveKeyed(row.key, row.label, { name: e.target.value }); }} />
                  <Input placeholder="Phone" inputMode="tel" defaultValue={cur?.phone ?? ''} disabled={!online} data-office-row-phone onBlur={(e) => { if ((cur?.phone ?? '') !== e.target.value) void saveKeyed(row.key, row.label, { phone: e.target.value }); }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="space-y-1">
        {contacts.filter((c) => !c.key).map((c) => (
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

      <ApprovalsMatrix settings={settings} online={online} />
      <OfficeContactsSection settings={settings} online={online} />
      <HomeSettingsSection settings={settings} online={online} />
      <AttachmentTypesSection settings={settings} />
      <PreBlastChecklistSection settings={settings} />
    </div>
  );
}

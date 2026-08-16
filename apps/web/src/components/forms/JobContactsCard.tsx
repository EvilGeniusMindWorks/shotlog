// Jobsite contact sheet: office fills it at job setup; the field reads it
// OFFLINE with tap-to-call numbers. Mirrors Baystate's paper sheet —
// owner/GC, onsite contact, fire chief + detail scheduling, emergency
// numbers, plus company office routing from settings.
import { useState } from 'react';
import { Phone, Plus, Trash2 } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { generateId, nowISO } from '@/lib/utils';
import type { Job, JobContact, JobContactRole } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export const CONTACT_ROLES: { value: JobContactRole; label: string }[] = [
  { value: 'onsite', label: 'Onsite Contact' },
  { value: 'fire_chief', label: 'Fire Chief (Blasting)' },
  { value: 'detail_dispatch', label: 'Detail Scheduling' },
  { value: 'police', label: 'Police Department' },
  { value: 'fire', label: 'Fire Department' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'urgent_care', label: 'Urgent Care' },
  { value: 'custom', label: 'Other' },
];

export function roleLabel(role: JobContactRole, label: string): string {
  if (role === 'custom' && label) return label;
  return CONTACT_ROLES.find((r) => r.value === role)?.label ?? label;
}

/** Read-only tap-to-call list — used in the field panel */
export function ContactList({ contacts, notes }: { contacts: JobContact[]; notes?: string }) {
  const company = useLiveQuery(() => db.companySettings.get('companySettings-singleton'));
  return (
    <div className="space-y-1">
      {contacts.map((c) => (
        <a key={c.id} href={c.phone ? `tel:${c.phone.replace(/[^+\d]/g, '')}` : undefined}
          className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 min-h-[48px]">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 uppercase tracking-wide">{roleLabel(c.role, c.label)}</p>
            <p className="text-sm font-medium truncate">{c.name || '—'}{c.notes ? ` · ${c.notes}` : ''}</p>
          </div>
          {c.phone && (
            <span className="flex items-center gap-1.5 text-navy font-mono text-sm">
              <Phone className="h-4 w-4 text-safety-orange" /> {c.phone}
            </span>
          )}
        </a>
      ))}
      {contacts.length === 0 && <p className="text-sm text-gray-400 py-2">No contacts on file for this job yet.</p>}
      {(company?.officeContacts?.length ?? 0) > 0 && (
        <>
          <p className="text-xs text-gray-400 uppercase tracking-wide pt-2">Office</p>
          {company!.officeContacts!.map((c) => (
            <a key={c.id} href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 min-h-[48px]">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide">{c.label}</p>
                <p className="text-sm font-medium truncate">{c.name}</p>
              </div>
              <span className="flex items-center gap-1.5 text-navy font-mono text-sm">
                <Phone className="h-4 w-4 text-safety-orange" /> {c.phone}
              </span>
            </a>
          ))}
        </>
      )}
      {notes && (
        <p className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 mt-2 whitespace-pre-wrap">
          {notes}
        </p>
      )}
    </div>
  );
}

/** Admin editor on the job page */
export function JobContactsCard({ job, siteId, readOnly }: { job: Job; siteId?: string; readOnly: boolean }) {
  const contacts = job.contacts ?? [];
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ role: 'onsite' as JobContactRole, label: '', name: '', phone: '', notes: '' });

  // Contacts belong to the SITE (the place) when the job is linked;
  // legacy un-linked jobs keep writing their own field
  const save = (next: JobContact[]) =>
    siteId
      ? db.sites.update(siteId, { contacts: next, updatedAt: nowISO() })
      : db.jobs.update(job.id, { contacts: next, updatedAt: nowISO() });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Jobsite Contacts
          {readOnly && <span className="ml-2 text-xs font-normal text-gray-400">tap a number to call</span>}
        </CardTitle>
        {!readOnly && (
          <Button size="sm" onClick={() => setAdding(!adding)}>
            <Plus className="h-4 w-4 mr-1" /> Add Contact
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!readOnly && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Owner</Label>
              <Input defaultValue={job.owner ?? ''} onBlur={(e) => db.jobs.update(job.id, { owner: e.target.value, updatedAt: nowISO() })} />
            </div>
            <div>
              <Label className="text-xs">General contractor</Label>
              <Input defaultValue={job.generalContractor ?? ''} onBlur={(e) => db.jobs.update(job.id, { generalContractor: e.target.value, updatedAt: nowISO() })} />
            </div>
          </div>
        )}
        {readOnly && (job.owner || job.generalContractor) && (
          <p className="text-sm text-gray-500">
            {job.owner && <>Owner: <b>{job.owner}</b></>}
            {job.owner && job.generalContractor && ' · '}
            {job.generalContractor && <>GC: <b>{job.generalContractor}</b></>}
          </p>
        )}

        {adding && !readOnly && (
          <div className="rounded-lg bg-gray-50 p-3 grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as JobContactRole })}
                options={CONTACT_ROLES} />
            </div>
            {form.role === 'custom' && (
              <div>
                <Label className="text-xs">Label</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </div>
            )}
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Notes (hours, call 24h ahead, …)</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <Button size="sm" disabled={!form.phone.trim() && !form.name.trim()}
              onClick={() => {
                void save([...contacts, { id: generateId(), ...form }]);
                setForm({ role: 'onsite', label: '', name: '', phone: '', notes: '' });
                setAdding(false);
              }}>
              Add
            </Button>
          </div>
        )}

        <div className="space-y-1">
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide">{roleLabel(c.role, c.label)}</p>
                <p className="text-sm font-medium truncate">{c.name || '—'}{c.notes ? ` · ${c.notes}` : ''}</p>
              </div>
              <span className="font-mono text-sm text-navy">{c.phone}</span>
              {!readOnly && (
                <Button variant="ghost" size="icon"
                  onClick={() => void save(contacts.filter((x) => x.id !== c.id))}>
                  <Trash2 className="h-4 w-4 text-gray-300" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {!readOnly ? (
          <div>
            <Label className="text-xs">Additional info (fire detail billing, directions…)</Label>
            <textarea
              className="w-full h-20 rounded-lg border border-gray-300 p-2 text-sm"
              defaultValue={job.contactNotes ?? ''}
              onBlur={(e) => (siteId ? db.sites.update(siteId, { contactNotes: e.target.value, updatedAt: nowISO() }) : db.jobs.update(job.id, { contactNotes: e.target.value, updatedAt: nowISO() }))}
            />
          </div>
        ) : (
          job.contactNotes && (
            <p className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 whitespace-pre-wrap">
              {job.contactNotes}
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}

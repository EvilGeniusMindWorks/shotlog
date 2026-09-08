// Admin › Companies (Round S8c, platform admin only). Every company on the
// platform with its environment, people and record counts; New company
// (from another company's reference data or empty); Rename; Switch here;
// Move people here (go-live); Delete for test companies with a typed name.
// The sandbox is listed but only rehearsal enters it.
import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { authedFetch, getRealSessionUser } from '@/lib/session';
import {
  ENV_LABEL,
  createCompany,
  deleteCompany,
  listCompanies,
  movePeople,
  switchCompany,
  updateCompany,
  type CompanySummary,
  type Environment,
} from '@/lib/companies';
import { showToast } from '@/components/ui/undo-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type NewEnv = Exclude<Environment, 'sandbox'>;
const ENV_OPTIONS: { value: NewEnv; label: string }[] = [
  { value: 'alpha', label: 'Alpha — your own testing' },
  { value: 'beta', label: 'Beta — testers you invite' },
  { value: 'production', label: 'Production — the real company' },
];

export function EnvTag({ environment, className }: { environment?: string; className?: string }) {
  const label = ENV_LABEL[(environment as Environment) ?? 'production'] ?? '';
  if (!label) return null;
  const tone =
    environment === 'alpha'
      ? 'bg-amber-100 text-amber-800'
      : environment === 'beta'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-violet-100 text-violet-800';
  return (
    <span className={cn('inline-block rounded px-1.5 py-px text-[10px] font-bold tracking-wider align-middle', tone, className)} data-env-tag={environment}>
      {label}
    </span>
  );
}

interface Person {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
}

export function AdminCompaniesPage() {
  const me = getRealSessionUser();
  const [companies, setCompanies] = useState<CompanySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ name: string; environment: NewEnv; fromCompanyId: string }>({ name: '', environment: 'beta', fromCompanyId: '' });
  const [renaming, setRenaming] = useState<{ id: string; name: string; environment: NewEnv } | null>(null);
  const [moveTo, setMoveTo] = useState<CompanySummary | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<{ id: string; typed: string } | null>(null);

  const reload = async () => {
    try {
      const list = await listCompanies();
      setCompanies(list);
      setError(null);
      if (!form.fromCompanyId) {
        const cur = list.find((c) => c.current);
        if (cur) setForm((f) => ({ ...f, fromCompanyId: cur.id }));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = useMemo(() => companies?.find((c) => c.current), [companies]);
  const suggestName = (env: NewEnv) => {
    const base = (current?.name ?? 'Company').replace(/\s*\((Alpha|Beta)\)/i, '').replace(/\s{2,}/g, ' ').trim();
    return env === 'production' ? base : `${base} (${env === 'alpha' ? 'Alpha' : 'Beta'})`;
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const openMove = async (c: CompanySummary) => {
    setMoveTo(c);
    setPicked({});
    setPeople(null);
    setAdding(false);
    const res = await authedFetch('/users');
    const body = (await res.json().catch(() => null)) as { users?: Person[] } | null;
    setPeople((body?.users ?? []).filter((p) => p.isActive && p.id !== me?.id));
  };

  if (error) return <p className="text-sm text-red-700 p-4" data-companies-error>{error}</p>;
  if (!companies) return <p className="text-sm text-gray-400 p-4">Loading companies…</p>;
  const pickedIds = Object.keys(picked).filter((k) => picked[k]);

  return (
    <div className="space-y-3" data-companies-page>
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-base font-semibold text-gray-900">Companies · {companies.length}</h3>
        <div className="flex-1" />
        <Button
          size="sm"
          onClick={() => {
            setAdding(!adding);
            setMoveTo(null);
            setForm((f) => ({ ...f, name: f.name || suggestName(f.environment) }));
          }}
          data-company-new
        >
          <Plus className="h-4 w-4 mr-1" /> New company
        </Button>
      </div>
      <p className="text-xs text-gray-400">
        Platform admin only. You are in <b>{current?.name ?? '—'}</b>; invites you send go there and the email follows its environment (Alpha and Beta send the testing invitation, Production the real one).
      </p>

      {adding && (
        <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3" data-company-form>
          <p className="text-sm font-semibold">New company</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-company-name placeholder="Baystate Blasting (Beta)" />
            </div>
            <div>
              <Label className="text-xs">Environment</Label>
              <Select
                value={form.environment}
                onChange={(e) => {
                  const environment = e.target.value as NewEnv;
                  setForm((f) => ({ ...f, environment, name: !f.name || f.name === suggestName(f.environment) ? suggestName(environment) : f.name }));
                }}
                options={ENV_OPTIONS}
                data-company-env
              />
            </div>
            <div>
              <Label className="text-xs">Start from</Label>
              <Select
                value={form.fromCompanyId}
                onChange={(e) => setForm({ ...form, fromCompanyId: e.target.value })}
                options={[
                  ...companies.filter((c) => c.environment !== 'sandbox').map((c) => ({ value: c.id, label: `${c.name}'s reference data` })),
                  { value: '', label: 'Empty (catalog only)' },
                ]}
                data-company-from
              />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Reference data = equipment, roster (people arrive without logins), catalog, manufacturers, company settings, custom roles. No days, no records.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!form.name.trim() || busy !== null}
              data-company-create
              onClick={() =>
                void run('create', async () => {
                  const c = await createCompany({ name: form.name.trim(), environment: form.environment, fromCompanyId: form.fromCompanyId || undefined });
                  showToast(`Created ${c.name} — switch to it from the row or from Settings`);
                  setAdding(false);
                  setForm({ name: '', environment: 'beta', fromCompanyId: current?.id ?? '' });
                  await reload();
                })
              }
            >
              {busy === 'create' ? 'Creating…' : 'Create company'}
            </Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white" data-companies-list>
        {companies.map((c) => {
          const sandbox = c.environment === 'sandbox';
          return (
            <div key={c.id} className="p-3" data-company-row={c.id} data-company-env-row={c.environment} data-company-current={c.current ? '1' : '0'}>
              {renaming?.id === c.id ? (
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end" data-company-rename-form>
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} data-company-rename-name />
                  </div>
                  <div>
                    <Label className="text-xs">Environment</Label>
                    <Select value={renaming.environment} onChange={(e) => setRenaming({ ...renaming, environment: e.target.value as NewEnv })} options={ENV_OPTIONS} />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setRenaming(null)}>Cancel</Button>
                  <Button
                    size="sm"
                    disabled={!renaming.name.trim() || busy !== null}
                    data-company-rename-save
                    onClick={() =>
                      void run('rename', async () => {
                        await updateCompany(c.id, { name: renaming.name.trim(), environment: renaming.environment });
                        setRenaming(null);
                        showToast(c.current ? 'Renamed — the header follows at the next sign-in or switch' : 'Renamed');
                        await reload();
                      })
                    }
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      <span>{c.name} <EnvTag environment={c.environment} className="ml-1" /></span>
                      {c.current && <Badge variant="compliant">you are here</Badge>}
                    </div>
                    <p className="text-xs text-gray-400">
                      {c.people} {c.people === 1 ? 'person' : 'people'} · {c.records} records{sandbox ? ' · rehearsal enters this one' : ''}
                    </p>
                  </div>
                  {!sandbox && (
                    <div className="flex flex-wrap gap-1.5">
                      {!c.current && (
                        <Button size="sm" variant="outline" disabled={busy !== null} data-company-switch onClick={() => void run(`switch-${c.id}`, () => switchCompany(c.id))}>
                          {busy === `switch-${c.id}` ? 'Switching…' : 'Switch here'}
                        </Button>
                      )}
                      {!c.current && (
                        <Button size="sm" variant="outline" disabled={busy !== null} data-company-move onClick={() => void openMove(c)}>
                          Move people here
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={busy !== null} data-company-rename onClick={() => setRenaming({ id: c.id, name: c.name, environment: (c.environment === 'sandbox' ? 'beta' : c.environment) as NewEnv })}>
                        Rename
                      </Button>
                      {!c.current && c.environment !== 'production' && (
                        <Button size="sm" variant="ghost" className="text-red-700" disabled={busy !== null} data-company-delete onClick={() => setDeleting({ id: c.id, typed: '' })}>
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {deleting?.id === c.id && (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 space-y-2" data-company-delete-confirm>
                  <p className="text-sm text-red-800">
                    Delete <b>{c.name}</b>? Its records, invites, feedback and hidden twins go with it. Type the company's name to confirm.
                  </p>
                  <div className="flex gap-2 items-center">
                    <Input value={deleting.typed} onChange={(e) => setDeleting({ ...deleting, typed: e.target.value })} placeholder={c.name} data-company-delete-typed />
                    <Button size="sm" variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deleting.typed.trim() !== c.name || busy !== null}
                      data-company-delete-go
                      onClick={() =>
                        void run('delete', async () => {
                          await deleteCompany(c.id);
                          setDeleting(null);
                          showToast(`Deleted ${c.name}`);
                          await reload();
                        })
                      }
                    >
                      Delete company
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {moveTo && (
        <div className="rounded-xl border border-navy bg-white p-3 space-y-3" data-company-move-sheet>
          <p className="text-sm font-semibold">
            Move people from {current?.name} to {moveTo.name}
          </p>
          <p className="text-xs text-gray-500">
            Their account moves — email, password, role, licenses, signature — and their roster entry is linked in {moveTo.name}. Their PIN stays on their devices. Their work here stays here. Each device signs in once and downloads the new company.
          </p>
          {people === null ? (
            <p className="text-sm text-gray-400">Loading people…</p>
          ) : people.length === 0 ? (
            <p className="text-sm text-gray-400">Nobody else has a login here.</p>
          ) : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {people.map((p) => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50" data-move-person={p.id}>
                  <input type="checkbox" checked={!!picked[p.id]} onChange={(e) => setPicked({ ...picked, [p.id]: e.target.checked })} />
                  <span className="flex-1 font-medium">{p.name}</span>
                  <span className="text-xs text-gray-400 capitalize">{p.role}</span>
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setMoveTo(null)}>Cancel</Button>
            <Button
              size="sm"
              disabled={pickedIds.length === 0 || busy !== null}
              data-company-move-go
              onClick={() =>
                void run('move', async () => {
                  const r = await movePeople(moveTo.id, pickedIds);
                  showToast(`Moved ${r.moved} ${r.moved === 1 ? 'person' : 'people'} to ${moveTo.name} — they sign in once on their devices`);
                  setMoveTo(null);
                  await reload();
                })
              }
            >
              {busy === 'move' ? 'Moving…' : `Move ${pickedIds.length} ${pickedIds.length === 1 ? 'person' : 'people'}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// S22 — the Jobsite Contact Sheet's fill-out screen, and the crew's copy.
// One screen: the rows come prefilled with a source chip; tap a row to change
// it and it becomes the job's own; "Use the site's again" puts it back;
// "Make this the site's too" writes it to the site for every job here. When
// a site row changes later, the row shows the offer: Use it, or keep ours.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Phone, Printer, Search } from 'lucide-react';
import { nearestPlaces, webSearchUrl, fmtMiles, type NearbyPlace } from '@/lib/places';
import { ensureSiteGeo, jobPoint } from '@/lib/siteGeo';
import { useLiveQuery, db } from '@/db';
import { formatDate } from '@/lib/utils';
import { can } from '@/lib/perms';
import {
  buildSheet, callableRows, mapsUrl, rowIsBlank, saveSheet, sheetLine, sheetStats, SHEET_GROUPS, snapshot, SOURCE_LABEL, telHref, writeSiteRow,
  type BuiltRow, type RowValue,
} from '@/lib/contactSheet';
import type { Job } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** The job's sheet, built live from the job, its site, its customer and the company */
export function useContactSheet(jobId: string | undefined) {
  const job = useLiveQuery(() => (jobId ? db.jobs.get(jobId) : undefined), [jobId]);
  const site = useLiveQuery(() => (job?.siteId ? db.sites.get(job.siteId) : undefined), [job?.siteId]);
  const customer = useLiveQuery(() => (job?.customerId ? db.customers.get(job.customerId) : undefined), [job?.customerId]);
  const company = useLiveQuery(() => db.companySettings.get('companySettings-singleton'));
  const rows = useMemo(() => (job ? buildSheet({ job, site, customer, company }) : []), [job, site, customer, company]);
  const stats = useMemo(() => sheetStats(rows), [rows]);
  return { job, site, customer, company, rows, stats };
}

export function ContactSheetCard({ jobId }: { jobId: string }) {
  const navigate = useNavigate();
  const { job, site, rows, stats } = useContactSheet(jobId);
  const canEdit = can('jobs', 'PATCH');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<RowValue>({ name: '', phone: '', notes: '' });
  // S22 push 3: Suggest the nearest — hospitals with an emergency department from the federal
  // list, urgent care from OpenStreetMap — from the job's point (its work spot, else the site's address)
  const [suggest, setSuggest] = useState<{ key: string; places?: NearbyPlace[]; error?: string; from?: string; phonesFrom?: string } | null>(null);
  if (!job) return null;
  const suggestFor = async (r: BuiltRow) => {
    const kind = r.key === 'hospital' ? 'hospital' : 'urgent';
    setSuggest({ key: r.key });
    let at = jobPoint(job, site ?? undefined)?.point ?? null;
    if (!at && site) at = await ensureSiteGeo(site.id).catch(() => null);
    if (!at) {
      setSuggest({ key: r.key, error: 'The site has no map point yet — open the site page and set its location, then try again.' });
      return;
    }
    try {
      const { places, phonesFrom } = await nearestPlaces(kind, at);
      setSuggest({ key: r.key, places, from: site ? [site.address, site.city].filter(Boolean).join(', ') : job.name, phonesFrom });
    } catch (err) {
      setSuggest({ key: r.key, error: err instanceof Error ? err.message : 'the lookup did not answer' });
    }
  };
  const pickPlace = async (r: BuiltRow, p: NearbyPlace) => {
    const next = rows.map((x) => (x.key === r.key ? { ...x, name: p.name, phone: p.phone, notes: p.address, source: 'job' as const, takenFrom: undefined, siteChange: undefined, geo: { lat: p.lat, lng: p.lng } } : x));
    await persist(next);
    setSuggest(null);
    setEditing(null);
  };

  const persist = (next: BuiltRow[], accept = false) => saveSheet(job, next.map(({ def: _def, siteChange: _c, siteValue: _v, ...r }) => r), { accept });
  const startEdit = (r: BuiltRow) => {
    setEditing(r.key);
    setDraft({ name: r.name, phone: r.phone, notes: r.notes });
  };
  const saveRow = async (r: BuiltRow) => {
    const next = rows.map((x) => (x.key === r.key ? { ...x, ...draft, source: 'job' as const, takenFrom: undefined, siteChange: undefined } : x));
    await persist(next);
    setEditing(null);
  };
  const useSite = async (r: BuiltRow) => {
    const v = r.siteChange ?? r.siteValue;
    if (!v) return;
    const next = rows.map((x) => (x.key === r.key ? { ...x, ...v, source: 'site' as const, takenFrom: snapshot(v), siteChange: undefined } : x));
    await persist(next);
    setEditing(null);
  };
  const keepOurs = async (r: BuiltRow) => {
    const next = rows.map((x) => (x.key === r.key ? { ...x, source: 'job' as const, takenFrom: undefined, siteChange: undefined } : x));
    await persist(next);
  };
  const makeSite = async (r: BuiltRow) => {
    if (!site) return;
    const v = editing === r.key ? draft : { name: r.name, phone: r.phone, notes: r.notes };
    await writeSiteRow(site, r.def, v);
    const next = rows.map((x) => (x.key === r.key ? { ...x, ...v, source: 'site' as const, takenFrom: snapshot(v), siteChange: undefined } : x));
    await persist(next);
    setEditing(null);
  };
  const acceptAll = () => persist(rows, true);

  const jobLabel = `${job.jobNumber ? `${job.jobNumber} · ` : ''}${site ? [site.city, site.state].filter(Boolean).join(', ') : job.name}`;
  const versionLine = job.contactSheet ? `Sheet v${job.contactSheet.version} · ${formatDate(job.contactSheet.updatedAt.slice(0, 10))} · ${job.contactSheet.updatedByName}${job.contactSheet.acceptedAt ? ` · accepted ${formatDate(job.contactSheet.acceptedAt.slice(0, 10))}` : ''}` : 'not saved yet — the rows below are the starting values';

  return (
    <div className="space-y-3" data-contact-sheet data-sheet-version={job.contactSheet?.version ?? 0} data-sheet-filled={stats.filled}>
      <div>
        <p className="font-semibold text-sm">Jobsite Contact Sheet · {jobLabel}</p>
        <p className="text-xs text-gray-500" data-sheet-stats>{sheetLine(stats)}</p>
        <p className="text-[11px] text-gray-400" data-sheet-version-line>{versionLine}</p>
      </div>
      {stats.changes > 0 && (
        <p className="text-sm text-amber-900 border border-amber-300 bg-amber-50 rounded-lg px-3 py-2" data-sheet-changes={stats.changes}>
          The site changed {stats.changes} row{stats.changes === 1 ? '' : 's'} this job took from it — each says so below: use the site's new value, or keep this job's.
        </p>
      )}
      {SHEET_GROUPS.map((g) => (
        <div key={g.key} className="rounded-xl border border-gray-200 bg-white overflow-hidden" data-sheet-group={g.key}>
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            {g.label}{g.hint ? <span className="normal-case font-normal text-gray-400"> · {g.hint}</span> : null}
          </div>
          {rows.filter((r) => r.def.group === g.key).map((r) => {
            const blank = rowIsBlank(r);
            const isEditing = editing === r.key;
            return (
              <div key={r.key} className="border-b border-gray-50 last:border-b-0" data-sheet-row={r.key} data-sheet-source={r.source} data-sheet-blank={blank ? 'yes' : 'no'}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-gray-50 disabled:hover:bg-transparent"
                  onClick={() => (canEdit ? (isEditing ? setEditing(null) : startEdit(r)) : undefined)}
                  disabled={!canEdit}
                  data-sheet-edit={r.key}
                >
                  <div className="w-40 shrink-0">
                    <p className="text-xs font-medium text-gray-700">{r.def.label}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    {blank ? (
                      <p className="text-sm text-gray-400">{r.def.suggest ? 'not set · Suggest the nearest' : r.def.required ? 'not set · the print needs it' : 'blank · prints blank'}</p>
                    ) : (
                      <>
                        <p className="text-sm truncate">{r.name || (r.def.text ? r.notes : '—')}{r.phone ? <span className="font-mono text-navy"> · {r.phone}</span> : null}</p>
                        {r.notes && !r.def.text && <p className="text-xs text-gray-500 truncate">{r.notes}</p>}
                      </>
                    )}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${r.source === 'job' ? 'bg-navy text-white' : r.source === 'blank' ? 'bg-gray-100 text-gray-500' : 'bg-orange-50 text-safety-orange border border-orange-200'}`} data-sheet-chip={r.source}>
                    {SOURCE_LABEL[r.source]}
                  </span>
                </button>
                {r.siteChange && (
                  <div className="px-3 pb-2 flex items-center gap-2 flex-wrap text-xs text-amber-900" data-sheet-change={r.key}>
                    <span>The site's {r.def.label.split(' (')[0]} is now {rowIsBlank(r.siteChange) ? 'blank' : `${r.siteChange.name}${r.siteChange.phone ? ` · ${r.siteChange.phone}` : ''}`}.</span>
                    {canEdit && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => void useSite(r)} data-sheet-use-change>Use it</Button>
                        <Button size="sm" variant="ghost" onClick={() => void keepOurs(r)} data-sheet-keep-ours>Keep ours</Button>
                      </>
                    )}
                  </div>
                )}
                {r.def.suggest && canEdit && (
                  <div className="px-3 pb-2" data-sheet-suggest-panel={r.key}>
                    {suggest?.key !== r.key ? (
                      <Button size="sm" variant="outline" onClick={() => void suggestFor(r)} data-sheet-suggest={r.key}>
                        <MapPin className="h-4 w-4 mr-1" /> Suggest the nearest{r.key === 'hospital' ? ' with an ER' : ''}
                      </Button>
                    ) : (
                      <div className="rounded-lg border border-gray-200 bg-white p-2 space-y-1 text-sm" data-suggest-list={r.key}>
                        <p className="text-xs text-gray-500">
                          {r.key === 'hospital' ? 'Nearest with an emergency department' : 'Nearest urgent care'}{suggest.from ? ` · from ${suggest.from}` : ''} · {r.key === 'hospital' ? 'the federal hospital list' : 'OpenStreetMap'}
                          <button type="button" className="ml-2 underline" onClick={() => setSuggest(null)}>close</button>
                        </p>
                        {!suggest.places && !suggest.error && <p className="text-xs text-gray-400">Looking…</p>}
                        {suggest.error && <p className="text-xs text-amber-800" data-suggest-error>{suggest.error}</p>}
                        {suggest.places?.map((p, i) => (
                          <div key={`${p.name}-${i}`} className="flex items-center gap-2" data-suggest-option={i}>
                            <button type="button" className="flex-1 text-left rounded-md px-2 py-1.5 hover:bg-gray-50" onClick={() => void pickPlace(r, p)} data-suggest-pick={i}>
                              <p className="font-medium">{p.name}</p>
                              <p className="text-xs text-gray-500">{p.address || 'address not tagged'} · {fmtMiles(p.miles)}{p.minutes ? ` · ${p.minutes} min` : ''}{p.er ? ' · ER yes' : ''}{p.phone ? ` · ${p.phone}` : ' · phone missing'}</p>
                            </button>
                            {!p.phone && (
                              <a href={webSearchUrl(p)} target="_blank" rel="noreferrer" className="text-xs text-navy underline whitespace-nowrap flex items-center gap-1" data-suggest-search={i}><Search className="h-3.5 w-3.5" /> Search the web</a>
                            )}
                          </div>
                        ))}
                        {suggest.places && suggest.places.length === 0 && <p className="text-xs text-gray-400">Nothing within 15 miles on the map — type it by hand.</p>}
                      </div>
                    )}
                  </div>
                )}
                {isEditing && canEdit && (
                  <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-3 gap-2 bg-gray-50 pt-2" data-sheet-editor={r.key}>
                    {!r.def.text && (
                      <>
                        <div>
                          <Label className="text-xs">Name</Label>
                          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-sheet-name />
                        </div>
                        <div>
                          <Label className="text-xs">Number</Label>
                          <Input inputMode="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} data-sheet-phone />
                        </div>
                      </>
                    )}
                    <div className={r.def.text ? 'sm:col-span-3' : ''}>
                      <Label className="text-xs">{r.def.text ? r.def.label : 'Notes'}</Label>
                      <Input value={r.def.text ? draft.name || draft.notes : draft.notes} onChange={(e) => setDraft(r.def.text ? { ...draft, name: r.def.key === 'additional' ? '' : e.target.value, notes: r.def.key === 'additional' ? e.target.value : draft.notes } : { ...draft, notes: e.target.value })} data-sheet-notes />
                    </div>
                    <div className="sm:col-span-3 flex items-center gap-2 flex-wrap">
                      <Button size="sm" onClick={() => void saveRow(r)} data-sheet-save>Save on this job</Button>
                      {r.siteValue && r.source === 'job' && (
                        <Button size="sm" variant="outline" onClick={() => void useSite(r)} data-sheet-use-site>Use the site's again</Button>
                      )}
                      {site && r.def.from.includes('site') && (
                        <Button size="sm" variant="outline" onClick={() => void makeSite(r)} data-sheet-make-site>Make this the site's too</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                      <span className="text-[11px] text-gray-400 ml-auto">{r.source === 'site' ? "the site keeps its value for the next job unless you make this the site's too" : ''}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" onClick={() => navigate(`/jobs/${job.id}/contact-sheet`)} data-sheet-print>
          <Printer className="h-4 w-4 mr-1" /> Print the sheet{stats.printNeeds.length ? ` · ${stats.printNeeds.length} row${stats.printNeeds.length === 1 ? '' : 's'} missing` : ''}
        </Button>
        {canEdit && !job.contactSheet?.acceptedAt && (
          <Button onClick={() => void acceptAll()} data-sheet-accept>Accept all prefilled rows</Button>
        )}
        <span className="text-xs text-gray-400">On the crew's phones from the day's ☎, offline.</span>
      </div>
    </div>
  );
}

/** The crew's copy on the day: every row with a number, one tap to call; the hospital, urgent care and the location open the device's maps */
export function CrewContactSheet({ jobId }: { jobId: string | undefined }) {
  const { job, rows } = useContactSheet(jobId);
  const callable = callableRows(rows);
  if (!job) return <p className="text-sm text-gray-400">No job on this day yet.</p>;
  return (
    <div className="space-y-2" data-crew-sheet data-crew-rows={callable.length}>
      {SHEET_GROUPS.map((g) => {
        const group = callable.filter((r) => r.def.group === g.key);
        if (group.length === 0) return null;
        return (
          <div key={g.key}>
            <p className="text-xs text-gray-400 uppercase tracking-wide pt-1 pb-0.5">{g.label}</p>
            <div className="space-y-1">
              {group.map((r) => {
                const place = r.def.key === 'hospital' || r.def.key === 'urgent_care' || r.def.key === 'location';
                const mapQuery = r.def.key === 'location' ? r.name : [r.name, r.notes].filter(Boolean).join(' ');
                return (
                  <div key={r.key} className="flex items-stretch gap-1" data-crew-row={r.key}>
                    <a
                      href={r.phone ? telHref(r.phone) : undefined}
                      className="flex-1 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 min-h-[48px]"
                      data-crew-call={r.phone ? r.key : undefined}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 uppercase tracking-wide">{r.def.label}</p>
                        <p className="text-sm font-medium truncate">{r.name || r.notes || '—'}{r.name && r.notes && !r.def.text ? ` · ${r.notes}` : ''}</p>
                      </div>
                      {r.phone && (
                        <span className="flex items-center gap-1.5 text-navy font-mono text-sm">
                          <Phone className="h-4 w-4 text-safety-orange" /> {r.phone}
                        </span>
                      )}
                    </a>
                    {place && mapQuery && (
                      <a href={mapsUrl(mapQuery)} target="_blank" rel="noreferrer" className="w-12 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-navy" title="Open in maps" data-crew-maps={r.key}>
                        <MapPin className="h-5 w-5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {callable.length === 0 && <p className="text-sm text-gray-400 py-2">The contact sheet for this job has no numbers yet — the office fills it on the job page.</p>}
      {job.contactSheet && <p className="text-[11px] text-gray-400 pt-1">Sheet v{job.contactSheet.version} · {formatDate(job.contactSheet.updatedAt.slice(0, 10))}</p>}
    </div>
  );
}

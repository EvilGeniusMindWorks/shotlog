// S26 push 2 (Matthew, Oct 5 2026, shape A): a job's setup as tiles — one per
// fact, green when it is in, red when it holds a blasting day, grey when it
// can wait. Each tile opens the place where the fact lives. A job set up from
// the field carries a banner the office confirms once it has looked.
import { useNavigate } from 'react-router-dom';
import { Check, CircleAlert, Clock } from 'lucide-react';
import { db } from '@/db';
import { nowISO } from '@/lib/utils';
import { blastingGate } from '@/lib/dayGate';
import { gateKeys, genericSetupInputs, readSetupValue, useSetupFields, type SetupFieldDef } from '@/lib/setupFields';
import { townContactsFrom } from '@/lib/jobContext';
import { useLiveQuery } from '@/db';
import type { Customer, Job, Site } from '@/db/schema';
import { Button } from '@/components/ui/button';

type Tone = 'done' | 'gate' | 'later';

interface Tile {
  key: string;
  title: string;
  text: string;
  tone: Tone;
  go: () => void;
}

const TONE_CLASS: Record<Tone, string> = {
  done: 'border-green-200 bg-green-50',
  gate: 'border-red-200 bg-red-50',
  later: 'border-gray-200 bg-white',
};

export function SetupTiles({
  job,
  site,
  customer,
  sheet,
  isAdmin,
}: {
  job: Job;
  site?: Site;
  customer?: Customer;
  sheet: { filled: number; total: number; changes: number };
  isAdmin: boolean;
}) {
  const navigate = useNavigate();
  const fields = useSetupFields();
  const sites = useLiveQuery(() => db.sites.toArray()) ?? [];
  const gate = blastingGate(site, gateKeys(fields), customer);
  const gateOk = (key: string) => gate.find((l) => l.key === key)?.ok;
  const memory = site ? townContactsFrom(sites, { city: site.city, state: site.state }, site.id) : null;
  const chief = site?.contacts?.find((c) => c.role === 'fire_chief' && (c.name || c.phone));
  const hospital = site?.contacts?.find((c) => c.role === 'hospital' && (c.name || c.phone));
  const urgent = site?.contacts?.find((c) => c.role === 'urgent_care' && (c.name || c.phone));
  const onsite = job.contacts?.find((c) => c.role === 'onsite' && (c.name || c.phone)) ?? customer?.customerContacts?.find((c) => c.isPrimary);
  const toSite = (tab: string) => () => site && navigate(`/sites/${site.id}?tab=${tab}`);
  const toTab = (tab: string) => () => navigate(`/jobs/${job.id}?tab=${tab}`);
  const toneFor = (present: boolean, gateKey?: string): Tone => (present ? 'done' : gateKey && gateOk(gateKey) === false ? 'gate' : 'later');

  const tiles: Tile[] = [
    { key: 'address', title: 'Address and map', text: site ? `${[site.address, site.city, site.state, site.zip].filter(Boolean).join(', ')}${site.geo ? ' · map ✓' : ' · no map point yet'}` : 'No site on this job', tone: site?.geo ? 'done' : 'later', go: toSite('ground') },
    { key: 'town', title: 'Town contacts', text: chief ? `${chief.name || chief.phone}${site?.contacts?.some((c) => c.role === 'police') ? ' · police, fire, town hall' : ''}` : memory ? `Not set · copy from ${memory.fromSiteName}` : 'Not set · type them or Suggest', tone: toneFor(Boolean(chief), 'fire_chief'), go: toSite('contacts') },
    { key: 'hospital', title: 'Hospital · urgent care', text: hospital ? `${hospital.name || hospital.phone}${urgent ? ` · ${urgent.name || urgent.phone}` : ''}` : 'Not set · Suggest from the map', tone: toneFor(Boolean(hospital), 'hospital'), go: toSite('contacts') },
    { key: 'onsite', title: 'Onsite contact', text: onsite ? `${onsite.name}${onsite.phone ? ` · ${onsite.phone}` : ''}` : 'Not set', tone: onsite ? 'done' : 'later', go: toTab('contact-sheet') },
    { key: 'work', title: 'Type of work', text: job.defaultTypeOfWork ? job.defaultTypeOfWork.replace(/_/g, ' ') : `${job.operation} · type set per day`, tone: 'done', go: toTab('setup') },
    { key: 'permit', title: 'Blasting permit', text: gate.find((l) => l.key === 'permit')?.text ?? (site?.permits?.length ? `${site.permits[0].number || site.permits[0].name}` : 'None on file'), tone: toneFor(gateOk('permit') === true || Boolean(site?.permits?.some((p) => p.number)), 'permit'), go: toSite('jurisdiction') },
    { key: 'k', title: 'K factor', text: site ? `K ${site.kFactor}${memory?.contacts ? '' : ''} · on the site` : `K ${job.kFactor}`, tone: 'done', go: toSite('ground') },
    { key: 'structures', title: 'Structures', text: site?.nearbyStructures?.length ? `${site.nearbyStructures.length} on the site` : 'Pinned on the shot map, or listed on the site', tone: site?.nearbyStructures?.length ? 'done' : 'later', go: toSite('ground') },
    { key: 'po', title: 'PO · insurance', text: [job.customerPO ? `PO ${job.customerPO}` : null, customer?.coiExpires ? `COI to ${customer.coiExpires}` : null].filter(Boolean).join(' · ') || 'Whenever the office has them', tone: job.customerPO || customer?.coiExpires ? 'done' : 'later', go: toTab('setup') },
  ];
  // S26 push 3: the police, fire and insurance rows when the table makes them hold a blasting day
  const police = site?.contacts?.find((c) => c.role === 'police' && (c.name || c.phone));
  const fire = site?.contacts?.find((c) => c.role === 'fire' && (c.name || c.phone));
  if (gate.some((l) => l.key === 'police' || l.key === 'fire')) {
    tiles.splice(2, 0, { key: 'police_fire', title: 'Police · fire', text: [police ? police.name || police.phone : null, fire ? fire.name || fire.phone : null].filter(Boolean).join(' · ') || (memory ? `Not set · copy from ${memory.fromSiteName}` : 'Not set · type them or Suggest'), tone: gate.filter((l) => l.key === 'police' || l.key === 'fire').every((l) => l.ok) ? 'done' : 'gate', go: toSite('contacts') });
  }
  if (gate.some((l) => l.key === 'coi')) {
    const coi = gate.find((l) => l.key === 'coi')!;
    tiles.push({ key: 'coi', title: 'Insurance certificate', text: coi.text.replace(/^Insurance certificate · /, ''), tone: coi.ok ? 'done' : 'gate', go: () => customer && navigate(`/customers/${customer.id}?tab=compliance`) });
  }
  // S26 push 3: a tile for every other row Admin › Setup fields asks for at setup
  const covered = new Set(['onsite']);
  const goFor = (f: SetupFieldDef) => (f.lives === 'customer' ? () => customer && navigate(`/customers/${customer.id}?tab=${f.group === 'money' || f.group === 'compliance' ? 'compliance' : 'company'}`) : f.lives === 'site' ? toSite(f.group === 'compliance' ? 'jurisdiction' : f.key === 'access' || f.key === 'hazards' ? 'access' : 'ground') : toTab('setup'));
  for (const f of [...genericSetupInputs(fields, 'customer'), ...genericSetupInputs(fields, 'site'), ...genericSetupInputs(fields, 'job')]) {
    if (covered.has(f.key)) continue;
    const v = readSetupValue(f, { customer, site, job });
    tiles.push({ key: f.key, title: f.label, text: v ?? 'Not set · asked at setup', tone: v ? 'done' : 'later', go: goFor(f) });
  }
  const done = tiles.filter((t) => t.tone === 'done').length;
  const held = tiles.filter((t) => t.tone === 'gate').length;

  return (
    <div className="px-4 pt-3">
      <div className="max-w-6xl mx-auto space-y-2" data-setup-tiles data-setup-done={done} data-setup-held={held}>
        {job.setupFromField && !job.setupConfirmedAt && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 flex items-center gap-2 flex-wrap" data-setup-from-field>
            <span><b>Set up from the field</b> · {job.setupFromField.name} · {new Date(job.setupFromField.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. The office finishes and confirms it.</span>
            {isAdmin && (
              <Button size="sm" variant="outline" className="ml-auto" data-setup-confirm onClick={() => void db.jobs.update(job.id, { setupConfirmedAt: nowISO(), updatedAt: nowISO() })}>
                Confirm the setup
              </Button>
            )}
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Setup · {done} of {tiles.length}</p>
          <p className="text-xs text-gray-500">{held ? `${held} red · holds a blasting day` : 'nothing holds a blasting day'}{sheet.changes ? ` · the site changed ${sheet.changes} row${sheet.changes === 1 ? '' : 's'}` : ''}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {tiles.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`text-left rounded-xl border px-3 py-2 min-h-[64px] flex flex-col gap-0.5 ${TONE_CLASS[t.tone]} ${site || t.key === 'onsite' || t.key === 'work' || t.key === 'po' ? '' : 'opacity-60'}`}
              onClick={t.go}
              data-setup-tile={t.key}
              data-setup-tone={t.tone}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {t.tone === 'done' ? <Check className="h-3.5 w-3.5 text-green-700" /> : t.tone === 'gate' ? <CircleAlert className="h-3.5 w-3.5 text-red-700" /> : <Clock className="h-3.5 w-3.5 text-gray-400" />}
                {t.title}
              </span>
              <span className="text-xs text-gray-600 line-clamp-2">{t.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

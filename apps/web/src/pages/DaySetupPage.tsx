// The gate (Round S13, docs/day-at-a-job-design.md): /blast-day/:id/setup?next=…
//
// A day with no setup and nothing started → the CARD FORM for its first
// opener: type of work, on-site time, the conditions, the label — prefilled
// from the last day at the job, the clock and the National Weather Service,
// each row saying where its value came from; one tap when the prefill is
// right. A day someone set up → the FACT SHEET: what they set, who is on
// site, "Looks right, continue" (writes only my confirmation row) or
// "Something's wrong — edit" (the form; Save sends one edit per changed
// fact with the version it was based on). After that the page returns to
// wherever the person was going.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CloudSun, Pencil, Users } from 'lucide-react';
import { CARD_PATHS, CARD_PATH_LABEL, getPath, type CardPath } from '@shotlog/shared';
import { db, useLiveQuery } from '@/db';
import type { BlastDay, Job, NwsReading, WorkDayConfirmation } from '@/db/schema';
import { useBlastDay } from '@/hooks/useBlastDay';
import {
  confirmDay,
  hhmm,
  onSiteLine,
  setCardFacts,
  setupStamp,
  useDayCard,
  useDayConfirmations,
  useDayGate,
  type CardValues,
} from '@/lib/dayCard';
import { fetchNws, nwsLine, nwsToCard } from '@/lib/weather';
import { jobPoint } from '@/lib/siteGeo';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { getSessionUser } from '@/lib/session';
import { formatDate, nowISO, todayISO } from '@/lib/utils';
import {
  cardValueLabel,
  GROUND_OPTIONS,
  TEMP_OPTIONS,
  WEATHER_OPTIONS,
  WIND_OPTIONS,
  WORK_TYPE_OPTIONS,
} from '@/lib/cardOptions';
import { Button } from '@/components/ui/button';
import { ChooserSheet, FactRow } from '@/components/ui/fact-row';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function DaySetupPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get('next') || `/blast-day/${id}`;
  const { blastDay: storedDay, job } = useBlastDay(id);
  const day = useDayCard(storedDay);
  const gate = useDayGate(storedDay);
  const confirmations = useDayConfirmations(id);
  const [mode, setMode] = useState<'auto' | 'form'>('auto');

  // Nothing to ask → straight through
  useEffect(() => {
    if (gate === 'none' && mode === 'auto') navigate(next, { replace: true });
  }, [gate, mode, next, navigate]);

  if (!day || gate === undefined || (gate === 'none' && mode === 'auto')) {
    return <div className="p-4 text-center text-gray-500">Loading…</div>;
  }
  const title = job?.name ?? 'the job';
  const when = day.date === todayISO() ? 'Today' : formatDate(day.date);
  const showForm = mode === 'form' || gate === 'form';

  return (
    <div className="min-h-screen bg-gray-50" data-day-setup={showForm ? 'form' : gate}>
      <div className="bg-navy text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            className="h-10 w-10 rounded-lg flex items-center justify-center text-navy-200 hover:text-white hover:bg-white/10"
            onClick={() => (mode === 'form' && gate !== 'form' ? setMode('auto') : navigate('/'))}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg truncate leading-tight">
              {when} at {title}
            </h2>
            <p className="text-xs text-navy-200 truncate">
              {showForm
                ? gate === 'form'
                  ? 'You are first here — set up the day for everyone'
                  : 'Fix what is wrong; everyone on the day sees the change'
                : gate === 'reconfirm'
                  ? 'Shared details were updated since you confirmed'
                  : 'Set up by someone on the crew — does it look right?'}
            </p>
          </div>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-4">
        {showForm ? (
          <DayCardForm
            day={day}
            job={job}
            first={gate === 'form'}
            onDone={() => navigate(next, { replace: true })}
            onCancel={gate === 'form' ? () => navigate('/') : () => setMode('auto')}
          />
        ) : (
          <DayCardConfirm
            day={day}
            confirmations={confirmations}
            reconfirm={gate === 'reconfirm'}
            onLooksRight={async () => {
              await confirmDay(day.id, false);
              navigate(next, { replace: true });
            }}
            onEdit={() => setMode('form')}
          />
        )}
      </div>
    </div>
  );
}

// ── The fact sheet ──────────────────────────────────────────────────────────

const NWS_PATHS: readonly CardPath[] = ['conditions.temperatureRange', 'conditions.weather', 'conditions.windDirection'];

function sourceOf(day: BlastDay, path: CardPath): string {
  const set = day.cardSets?.[path];
  if (set) return `${set.byName || 'someone'}, ${hhmm(set.at)}`;
  if (day.nws && NWS_PATHS.includes(path)) return `NWS ${hhmm(day.nws.observedAt || day.nws.fetchedAt)}`;
  return day.setup?.byName ?? '';
}

function DayCardConfirm({
  day,
  confirmations,
  reconfirm,
  onLooksRight,
  onEdit,
}: {
  day: BlastDay;
  confirmations: WorkDayConfirmation[];
  reconfirm: boolean;
  onLooksRight: () => Promise<void>;
  onEdit: () => void;
}) {
  const me = getSessionUser();
  const mine = confirmations.find((c) => c.userId === me?.id);
  const [busy, setBusy] = useState(false);
  const rows = CARD_PATHS.map((path) => {
    const raw = getPath(day as unknown as Record<string, unknown>, path);
    const set = day.cardSets?.[path];
    return {
      path,
      label: CARD_PATH_LABEL[path],
      value: cardValueLabel(path, raw),
      empty: raw === undefined || raw === null || raw === '',
      source: sourceOf(day, path),
      changed: Boolean(reconfirm && mine && set && set.by !== me?.id && set.at > mine.confirmedAt),
    };
  }).filter((r) => !(r.empty && (r.path === 'conditions.weatherNotes' || r.path === 'name')));
  return (
    <div className="space-y-4" data-day-confirm>
      {day.setup && (
        <p className="text-sm text-gray-600">
          <span className="font-semibold">{day.setup.byName || 'Someone'}</span> set this up at {hhmm(day.setup.at)}
          {reconfirm && ' · the highlighted rows changed since you confirmed'}
        </p>
      )}
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {rows.map((r) => (
          <div
            key={r.path}
            className={`flex items-baseline gap-3 px-3 py-2.5 ${r.changed ? 'bg-amber-50' : ''}`}
            data-fact={r.path}
            data-changed={r.changed ? '1' : undefined}
          >
            <span className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500">{r.label}</span>
            <span className="flex-1 text-sm font-semibold text-gray-900" data-fact-value>
              {r.value}
            </span>
            {r.source && <span className="text-xs text-gray-400 shrink-0">{r.source}</span>}
          </div>
        ))}
      </div>
      {day.nws && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <CloudSun className="h-4 w-4" /> NWS {hhmm(day.nws.observedAt || day.nws.fetchedAt)} · {nwsLine(day.nws)}
        </p>
      )}
      {confirmations.length > 0 && (
        <p className="text-sm text-gray-700 flex items-center gap-1.5" data-on-site>
          <Users className="h-4 w-4 text-gray-400" /> {onSiteLine(confirmations)}
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <Button
          className="flex-1 min-h-[48px] bg-safety-orange hover:bg-safety-orange/90 text-white text-base"
          data-day-looks-right
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onLooksRight().finally(() => setBusy(false));
          }}
        >
          Looks right, continue
        </Button>
        <Button variant="outline" className="min-h-[48px]" data-day-edit onClick={onEdit}>
          <Pencil className="h-4 w-4 mr-1.5" /> Something's wrong — edit
        </Button>
      </div>
    </div>
  );
}

// ── The card form ───────────────────────────────────────────────────────────

interface FormValues {
  typeOfWork: string;
  onsiteTime: string;
  temperatureRange: string;
  weather: string;
  windDirection: string;
  groundConditions: string;
  weatherNotes: string;
  name: string;
}
type FormKey = keyof FormValues;

const PATH_OF: Record<FormKey, CardPath> = {
  typeOfWork: 'typeOfWork',
  onsiteTime: 'onsiteTime',
  temperatureRange: 'conditions.temperatureRange',
  weather: 'conditions.weather',
  windDirection: 'conditions.windDirection',
  groundConditions: 'conditions.groundConditions',
  weatherNotes: 'conditions.weatherNotes',
  name: 'name',
};

const CHOOSER_OPTIONS: Partial<Record<FormKey, { value: string; label: string }[]>> = {
  typeOfWork: WORK_TYPE_OPTIONS,
  temperatureRange: TEMP_OPTIONS,
  weather: WEATHER_OPTIONS,
  windDirection: WIND_OPTIONS,
  groundConditions: GROUND_OPTIONS,
};

function fromDay(d: BlastDay): FormValues {
  return {
    typeOfWork: d.typeOfWork,
    onsiteTime: d.onsiteTime ?? '',
    temperatureRange: d.conditions.temperatureRange,
    weather: d.conditions.weather,
    windDirection: d.conditions.windDirection ?? '',
    groundConditions: d.conditions.groundConditions,
    weatherNotes: d.conditions.weatherNotes ?? '',
    name: d.name ?? '',
  };
}

function clockHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function DayCardForm({
  day,
  job,
  first,
  onDone,
  onCancel,
}: {
  day: BlastDay;
  job: Job | undefined;
  first: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const online = useOnlineStatus();
  const [values, setValues] = useState<FormValues>(() => fromDay(day));
  const [source, setSource] = useState<Partial<Record<FormKey, string>>>({});
  const [touched, setTouched] = useState<Set<FormKey>>(() => new Set());
  const [nws, setNws] = useState<NwsReading | null>(day.nws ?? null);
  const [nwsState, setNwsState] = useState<'idle' | 'loading' | 'done' | 'none'>('idle');
  const [groundHint, setGroundHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chooser, setChooser] = useState<FormKey | null>(null);
  const site = useLiveQuery(() => (job?.siteId ? db.sites.get(job.siteId) : undefined), [job?.siteId]);

  const set = (k: FormKey, v: string, src?: string) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    setSource((prev) => ({ ...prev, [k]: src ?? 'you' }));
    if (!src) setTouched((prev) => new Set(prev).add(k));
  };

  // First opener: the last day at the job and the clock fill the rows
  // (prefills count without a re-tap); the sources say so
  const lastDay = useLiveQuery(
    async () =>
      first
        ? (await db.blastDays.where('jobId').equals(day.jobId).toArray())
            .filter((d) => d.date < day.date)
            .sort((a, b) => b.date.localeCompare(a.date))[0]
        : undefined,
    [first, day.jobId, day.date],
  );
  useEffect(() => {
    if (!first) return;
    setValues((prev) => {
      const nextValues = { ...prev };
      const src: Partial<Record<FormKey, string>> = {};
      if (lastDay) {
        const from = `from ${formatDate(lastDay.date)}`;
        for (const k of ['temperatureRange', 'weather', 'windDirection', 'groundConditions'] as const) {
          if (touched.has(k) || source[k]?.startsWith('NWS')) continue;
          const v = fromDay(lastDay)[k];
          if (v) {
            nextValues[k] = v;
            src[k] = from;
          }
        }
        if (!touched.has('onsiteTime') && lastDay.onsiteTime && !prev.onsiteTime) {
          nextValues.onsiteTime = lastDay.onsiteTime;
          src.onsiteTime = from;
        }
      }
      if (!nextValues.onsiteTime) {
        nextValues.onsiteTime = clockHHmm();
        src.onsiteTime = 'clock';
      }
      setSource((s) => ({ ...s, ...src }));
      return nextValues;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, lastDay?.id]);

  // The National Weather Service, when online and the job has a point
  const point = useMemo(() => jobPoint(job, site)?.point ?? null, [job, site]);
  useEffect(() => {
    if (!online || !point || nwsState !== 'idle') return;
    setNwsState('loading');
    const ctl = new AbortController();
    void fetchNws(point, { signal: ctl.signal }).then((r) => {
      if (ctl.signal.aborted) return;
      if (!r) {
        setNwsState('none');
        return;
      }
      setNws(r);
      setNwsState('done');
      const fill = nwsToCard(r);
      const label = `NWS ${hhmm(r.observedAt || r.fetchedAt)}`;
      setValues((prev) => {
        const nextValues = { ...prev };
        const src: Partial<Record<FormKey, string>> = {};
        if (fill.temperatureRange && !touched.has('temperatureRange')) {
          nextValues.temperatureRange = fill.temperatureRange;
          src.temperatureRange = label;
        }
        if (fill.weather && !touched.has('weather')) {
          nextValues.weather = fill.weather;
          src.weather = label;
        }
        if (fill.windDirection && !touched.has('windDirection')) {
          nextValues.windDirection = fill.windDirection;
          src.windDirection = label;
        }
        setSource((s) => ({ ...s, ...src }));
        return nextValues;
      });
      if (fill.groundSuggested) {
        setGroundHint(
          fill.groundSuggested === 'frozen'
            ? `NWS suggests Frozen — ${r.tempF}°F at ${r.name.split(',')[0]}`
            : `NWS suggests Wet — ${r.precipIn24h} in of rain in the last 24 h`,
        );
      }
    });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, point?.lat, point?.lng]);

  const save = async () => {
    setBusy(true);
    try {
      const changes: CardValues = {};
      for (const k of Object.keys(PATH_OF) as FormKey[]) {
        const path = PATH_OF[k];
        const cur = getPath(day as unknown as Record<string, unknown>, path);
        if ((cur ?? '') !== values[k]) changes[path] = values[k];
      }
      const n = await setCardFacts(day.id, changes);
      const now = nowISO();
      if (first) await db.blastDays.update(day.id, { setup: setupStamp(), ...(nws ? { nws } : {}), updatedAt: now });
      else if (nws && !day.nws) await db.blastDays.update(day.id, { nws, updatedAt: now });
      await confirmDay(day.id, first || n > 0);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const Src = ({ k }: { k: FormKey }) =>
    source[k] ? <span className="ml-2 text-[11px] font-normal text-gray-400 normal-case tracking-normal">{source[k]}</span> : null;

  return (
    <div className="space-y-4" data-day-card-form>
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-4">
        <FactRow path="typeOfWork" label="Type of work" value={cardValueLabel(PATH_OF.typeOfWork, values.typeOfWork)} source={source.typeOfWork} onClick={() => setChooser('typeOfWork')} />
        <div>
          <Label className="text-xs">
            On-site time <Src k="onsiteTime" />
          </Label>
          <Input type="time" className="mt-1 w-40" value={values.onsiteTime} data-onsite-time onChange={(e) => set('onsiteTime', e.target.value)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold tracking-widest text-gray-400 uppercase">Conditions</p>
          <p className="text-xs text-gray-500 flex items-center gap-1" data-nws-state={nwsState}>
            <CloudSun className="h-4 w-4" />
            {nwsState === 'loading' && 'Asking the National Weather Service…'}
            {nwsState === 'done' && nws && `NWS ${hhmm(nws.observedAt || nws.fetchedAt)} · ${nwsLine(nws)}`}
            {nwsState === 'none' && (online ? 'No NWS reading for this spot' : 'Offline — last day’s values')}
            {nwsState === 'idle' && (!online ? 'Offline — last day’s values' : !point ? 'No location on the job for the weather' : '')}
          </p>
        </div>
        <FactRow path="temperatureRange" label="Temperature" value={cardValueLabel(PATH_OF.temperatureRange, values.temperatureRange)} source={source.temperatureRange} onClick={() => setChooser('temperatureRange')} />
        <FactRow path="weather" label="Weather" value={cardValueLabel(PATH_OF.weather, values.weather)} source={source.weather} onClick={() => setChooser('weather')} />
        <FactRow path="windDirection" label="Wind" value={cardValueLabel(PATH_OF.windDirection, values.windDirection)} source={source.windDirection} onClick={() => setChooser('windDirection')} />
        <div>
          <FactRow path="groundConditions" label="Ground" value={cardValueLabel(PATH_OF.groundConditions, values.groundConditions)} source={source.groundConditions} onClick={() => setChooser('groundConditions')} />
          {groundHint && (
            <button
              type="button"
              className="mt-1.5 text-xs text-blue-700 font-semibold"
              data-ground-hint
              onClick={() => {
                const g = groundHint.includes('Frozen') ? 'frozen' : 'wet';
                set('groundConditions', g, `NWS ${nws ? hhmm(nws.observedAt || nws.fetchedAt) : ''}`);
                setGroundHint(null);
              }}
            >
              {groundHint} — tap to use it
            </button>
          )}
        </div>
        <div>
          <Label className="text-xs">Weather notes</Label>
          <Input className="mt-1" value={values.weatherNotes} placeholder="e.g. fog until 9" onChange={(e) => set('weatherNotes', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">
            Day label <span className="text-gray-400 font-normal">— shows in lists & prints</span>
          </Label>
          <Input className="mt-1" value={values.name} placeholder="e.g. North face lift 2" data-day-label onChange={(e) => set('name', e.target.value)} />
        </div>
      </div>
      {chooser && (
        <ChooserSheet
          path={chooser}
          title={CARD_PATH_LABEL[PATH_OF[chooser]]}
          legend={source[chooser] && source[chooser] !== 'you' ? `Currently ${cardValueLabel(PATH_OF[chooser], values[chooser])} · ${source[chooser]}` : undefined}
          options={CHOOSER_OPTIONS[chooser] ?? []}
          value={values[chooser]}
          allowEmpty={chooser === 'windDirection'}
          onPick={(v) => set(chooser, v)}
          onClose={() => setChooser(null)}
        />
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          className="flex-1 min-h-[48px] bg-safety-orange hover:bg-safety-orange/90 text-white text-base"
          data-day-save
          disabled={busy}
          onClick={() => void save()}
        >
          {first ? 'Save and start the day' : 'Save changes'}
        </Button>
        <Button variant="outline" className="min-h-[48px]" onClick={onCancel} disabled={busy}>
          {first ? 'Not now' : 'Back'}
        </Button>
      </div>
    </div>
  );
}

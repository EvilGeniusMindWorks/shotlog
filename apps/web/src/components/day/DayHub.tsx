// The day's tiles (Round S14): one tile per paper for the role, each with the
// paper's real state and one button — Start creates the paper (the word is
// the consent), Open / View opens it. The first unfinished tile carries
// "Up next". Under the blaster's tiles, the crew; under the driller's, the
// rigs. File this day sits at the bottom when a paper exists to file.
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ClipboardList, FileText, Timer, Drill } from 'lucide-react';
import { ReportIncidentSheet } from '@/components/incident/ReportIncidentSheet';
import { INCIDENT_LABEL } from '@/lib/incidentDoNow';
import type { BlastDay, BlastLog, DailyReport, DrillLog, Job, Shot } from '@/db/schema';
import { isBlastingWork } from '@/db/schema';
import { db, useLiveQuery } from '@/db';
import { addBlastLogToDay, createDailyReport } from '@/hooks/useBlastDay';
import { createDrillLog, getShotPlan } from '@/hooks/useDrillLogs';
import { myCard, useDayTimeCards } from '@/hooks/useTimeCards';
import {
  CLOSE_REASONS,
  closeDay,
  reopenDay,
  blastLogTile,
  dailyReportTile,
  dayChecklistsFor,
  dayDrillLogsFor,
  dayFiledAt,
  drillLogTile,
  fileState,
  plannedHoles,
  timeCardTile,
  useCrew,
  type TileState,
} from '@/lib/dayHub';
import { hhmm } from '@/lib/dayCard';
import { formatDate } from '@/lib/utils';
import { can, myHomeDashboard } from '@/lib/perms';
import { getSessionUser } from '@/lib/session';
import { ConsequenceSheet } from '@/components/records/LifecycleMenu';
import { TimeCardsCard } from '@/components/forms/TimeCardsCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CrewList } from './CrewList';
import { RigList } from './RigList';

const TONE_CLASS: Record<TileState['tone'], string> = {
  plain: 'border-gray-200 bg-white',
  next: 'border-gray-200 bg-white',
  warn: 'border-amber-300 bg-amber-50',
  done: 'border-green-300 bg-green-50',
  bad: 'border-red-300 bg-red-50',
};

function Tile({
  id,
  icon,
  name,
  state,
  upNext,
  onAction,
}: {
  id: string;
  icon: ReactNode;
  name: string;
  state: TileState;
  upNext: boolean;
  onAction: () => void;
}) {
  const clickable = state.action !== 'None';
  return (
    <div
      className={`relative rounded-xl border px-3 py-2.5 flex items-center gap-3 min-h-[64px] ${TONE_CLASS[state.tone]} ${upNext ? 'shadow-[inset_4px_0_0_#E6B15B]' : ''}`}
      data-tile={id}
      data-tile-state={state.title}
      data-up-next={upNext ? '1' : undefined}
    >
      <span className="w-7 text-gray-500 shrink-0">{icon}</span>
      <button type="button" className="flex-1 min-w-0 text-left" disabled={!clickable} onClick={onAction}>
        {upNext && <span className="block text-[9px] font-bold tracking-widest uppercase text-safety-orange">Up next</span>}
        <span className="block font-bold text-sm">{name}</span>
        <span className="block text-xs text-gray-600">
          {state.title}
          {state.sub ? ` · ${state.sub}` : ''}
        </span>
        {state.note && <span className="block text-xs text-amber-700 mt-0.5" data-tile-note>{state.note}</span>}
      </button>
      {clickable && (
        <Button
          size="sm"
          variant={state.action === 'Start' ? 'default' : 'secondary'}
          className={state.action === 'Start' ? 'bg-safety-orange hover:bg-safety-orange/90 text-white' : ''}
          data-tile-action={state.action}
          onClick={onAction}
        >
          {state.action}
        </Button>
      )}
    </div>
  );
}

interface Props {
  day: BlastDay;
  job: Job | undefined;
  blastLog: BlastLog | undefined;
  shots: Shot[];
  dailyReport: DailyReport | undefined;
  locked: boolean;
  owner: boolean;
  setView: (v: string) => void;
}

export function DayHub({ day, job, blastLog, shots, dailyReport, locked, owner, setView }: Props) {
  const navigate = useNavigate();
  const me = getSessionUser();
  const home = myHomeDashboard();
  const isOffice = home === 'office';
  const isDriller = home === 'driller';
  const closed = Boolean(day.closed);
  const readOnly = locked || isOffice || closed;
  const [cardSheet, setCardSheet] = useState(false);
  // S20 (Matthew): incidents are papers of the day
  const [incidentSheet, setIncidentSheet] = useState(false);
  const [incidentList, setIncidentList] = useState(false);
  const [closeSheet, setCloseSheet] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closeOther, setCloseOther] = useState('');
  const canClose = !locked && !isOffice && can('blastDays', 'PATCH');

  const filedAt = useLiveQuery(() => dayFiledAt(day.id), [day.id, day.status]);
  const cards = useDayTimeCards(day);
  const mine = myCard(cards);
  const cardsFiled = cards.filter((c) => c.status !== 'draft').length;
  const dayLogs = useLiveQuery(() => dayDrillLogsFor(day), [day.id, day.jobId, day.date]) ?? [];
  const myLogs = dayLogs.filter((l) => l.drillerUserId === me?.id);
  const holes =
    useLiveQuery(async () => {
      const out = new Map<string, number>();
      for (const l of myLogs) out.set(l.id, (await db.drillLogHoles.where('drillLogId').equals(l.id).toArray()).filter((h) => !h.skipped).length);
      return out;
    }, [myLogs.map((l) => l.id).join(',')]) ?? new Map<string, number>();
  const rigRows = useLiveQuery(() => dayChecklistsFor(day, dayLogs), [day.id, day.date, dayLogs.map((l) => l.id).join(',')]) ?? [];
  const incidents = useLiveQuery(() => db.incidents.filter((i) => i.blastDayId === day.id).toArray().then((xs) => xs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))), [day.id]) ?? [];
  const crew = useCrew(!isDriller ? day : undefined);

  const blasting = isBlastingWork(day.typeOfWork) || Boolean(blastLog);
  const planned = plannedHoles(shots);

  // ── the tiles, in role order ──
  const tiles: { id: string; icon: ReactNode; name: string; state: TileState; onAction: () => void }[] = [];
  const logState = isDriller ? null : blastLogTile(day, blastLog, shots, filedAt ?? undefined, !readOnly && can('blastLogs', 'PUT'));
  if (logState) {
    tiles.push({
      id: 'blast-log',
      icon: <FileText className="h-5 w-5" />,
      name: 'Blasting log',
      state: logState,
      onAction: () => {
        // the tile opens the walkthrough; the log itself is one tab away
        if (logState.action === 'Start') void addBlastLogToDay(day.id).then(() => setView('walkthrough'));
        else setView('walkthrough');
      },
    });
  }
  if (isDriller) {
    const startable = shots.length > 0 && !readOnly && can('drillLogs', 'PUT');
    const planInfo = planned > 0 ? `plan sent · ${planned} holes` : blastLog ? 'no plan yet — ask the blaster' : 'no blasting log on this day';
    if (myLogs.length === 0) {
      tiles.push({
        id: 'drill-log',
        icon: <Drill className="h-5 w-5" />,
        name: 'Drill log',
        state: drillLogTile(undefined, 0, planned, planInfo, startable),
        onAction: () => {
          const shot = shots.find((s) => (getShotPlan(s)?.length ?? 0) > 0) ?? shots[0];
          if (!shot) return;
          void createDrillLog(shot, day.id, day.jobId).then((id) => navigate(`/blast-day/${day.id}/drill-log/${id}`));
        },
      });
    }
    for (const l of myLogs) {
      tiles.push({
        id: `drill-log`,
        icon: <Drill className="h-5 w-5" />,
        name: myLogs.length > 1 ? `Drill log · shot ${shots.find((s) => s.id === l.shotId)?.shotNumber ?? ''}` : 'Drill log',
        state: drillLogTile(l, holes.get(l.id) ?? 0, planned, '', false),
        onAction: () => navigate(`/blast-day/${day.id}/drill-log/${l.id}`),
      });
    }
  }
  const reportReadOnly = readOnly || (isDriller && blasting) || (!owner && !isDriller && !can('dailyReports', 'PATCH'));
  const reportState = dailyReportTile(day, dailyReport, cardsFiled, filedAt ?? undefined, can('dailyReports', 'PUT') && !readOnly && (!isDriller || !blasting), reportReadOnly);
  tiles.push({
    id: 'daily-report',
    icon: <ClipboardList className="h-5 w-5" />,
    name: isDriller && blasting ? "Daily report · the blaster's" : 'Daily report',
    state: reportState,
    onAction: () => {
      if (reportState.action === 'Start') void createDailyReport(day.id);
      else setView('daily-report');
    },
  });
  if (!isOffice) {
    tiles.push({
      id: 'time-card',
      icon: <Timer className="h-5 w-5" />,
      name: 'My time card',
      state: timeCardTile(mine),
      onAction: () => setCardSheet(true),
    });
  } else {
    tiles.push({
      id: 'time-cards',
      icon: <Timer className="h-5 w-5" />,
      name: 'Time cards',
      state: { title: cards.length === 0 ? 'None yet' : `${cardsFiled} of ${cards.length} filed`, sub: '', action: cards.length ? 'View' : 'None', tone: 'plain' },
      onAction: () => setView('daily-report'),
    });
  }
  // S20 (Matthew): an Incidents tile on every day — "None today · Report" or the count, the kind and the time
  {
    const canReport = !readOnly && can('incidents', 'PUT');
    const sent = incidents.filter((i) => i.status !== 'open').length;
    const first = incidents[0];
    const state: TileState =
      incidents.length === 0
        ? { title: 'None today', sub: canReport ? 'Report an incident' : '', action: canReport ? 'Start' : 'None', tone: 'plain' }
        : {
            title: `${incidents.length} · ${INCIDENT_LABEL[first.type]}${first.time ? ` ${first.time}` : ''}`,
            sub: sent === incidents.length ? (incidents.length === 1 ? 'sent to the office' : 'all sent to the office') : `${incidents.length - sent} not sent yet`,
            action: 'Open',
            tone: 'bad',
          };
    tiles.push({
      id: 'incidents',
      icon: <AlertTriangle className="h-5 w-5" />,
      name: 'Incidents',
      state,
      onAction: () => {
        if (incidents.length === 0) setIncidentSheet(true);
        else if (incidents.length === 1) navigate(`/incident/${incidents[0].id}`);
        else setIncidentList(true);
      },
    });
  }
  const upNextIndex = readOnly ? -1 : tiles.findIndex((t) => t.state.tone !== 'done' && (t.state.action === 'Start' || t.state.action === 'Open'));

  const file = fileState(day, blastLog, shots, dailyReport, dayLogs.length);
  const showFile = !isOffice && !(isDriller && blasting);

  return (
    <div className="space-y-2" data-day-hub data-day-hub-role={isOffice ? 'office' : isDriller ? 'driller' : 'field'}>
      {closed && day.closed && (
        <div className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2.5 flex items-center gap-3" data-day-closed>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">Closed · {day.closed.reason}</p>
            <p className="text-xs text-gray-600">
              {day.closed.byName || 'Someone'} closed this day{day.closed.at ? ` at ${hhmm(day.closed.at)}` : ''}. Nothing was filed.
            </p>
          </div>
          {canClose && (
            <Button size="sm" variant="secondary" data-day-reopen onClick={() => void reopenDay(day)}>
              Reopen
            </Button>
          )}
        </div>
      )}
      {day.movedFrom && (
        <p className="text-xs text-gray-600 border border-gray-200 bg-white rounded-lg px-3 py-2" data-day-moved>
          Moved from {formatDate(day.movedFrom.date)} by {day.movedFrom.byName || 'someone'} · {hhmm(day.movedFrom.at)}
        </p>
      )}
      {incidentSheet && <ReportIncidentSheet day={day} onClose={() => setIncidentSheet(false)} />}
      {incidentList && (
        <ConsequenceSheet onClose={() => setIncidentList(false)}>
          <div data-incident-list>
            <h3 className="font-bold text-lg">Incidents · {formatDate(day.date)}</h3>
            {incidents.map((i) => (
              <button key={i.id} type="button" className="w-full text-left rounded-lg border border-gray-200 bg-white px-3 py-3 mb-2 min-h-[48px]" data-incident-row={i.id} onClick={() => navigate(`/incident/${i.id}`)}>
                <span className="font-semibold">{INCIDENT_LABEL[i.type]}{i.time ? ` · ${i.time}` : ''}</span>
                <span className="block text-xs text-gray-500">{i.description || 'no description yet'} · {i.status === 'open' ? 'not sent yet' : i.status.replace('_', ' ')}</span>
              </button>
            ))}
            {!readOnly && can('incidents', 'PUT') && (
              <Button variant="outline" className="w-full mt-1" data-incident-report-another onClick={() => { setIncidentList(false); setIncidentSheet(true); }}>
                Report another
              </Button>
            )}
            <Button variant="outline" className="w-full mt-2" onClick={() => setIncidentList(false)}>Close</Button>
          </div>
        </ConsequenceSheet>
      )}
      {isDriller && <RigList day={day} rows={rigRows} readOnly={readOnly} />}
      {tiles.map((t, i) => (
        <Tile key={`${t.id}-${i}`} id={t.id} icon={t.icon} name={t.name} state={t.state} upNext={i === upNextIndex} onAction={t.onAction} />
      ))}
      {!isDriller && crew && <CrewList day={day} model={crew} canAct={!readOnly} />}
      {showFile && (
        <div className="pt-2" data-file-row={file.kind}>
          {file.kind === 'ready' && (
            <>
              <Button className="w-full min-h-[48px] bg-safety-orange hover:bg-safety-orange/90 text-white text-base" data-file-day onClick={() => navigate(`/blast-day/${day.id}/submit`)}>
                {file.label}
              </Button>
              {/* S16 (Matthew's pick i): the job and the date, quietly, under the button */}
              <p className="text-xs text-gray-500 mt-1 text-center" data-file-sub>
                {job?.name ?? 'This job'} · {formatDate(day.date)}
                {file.note ? ` · ${file.note}` : ''}
              </p>
            </>
          )}
          {file.kind === 'blocked' && <p className="text-sm text-amber-800 border border-amber-300 bg-amber-50 rounded-lg px-3 py-2">{file.label}</p>}
          {file.kind === 'filed' && <p className="text-sm text-green-800 border border-green-200 bg-green-50 rounded-lg px-3 py-2" data-file-filed>{file.label}{file.note ? <span className="block text-red-700" data-file-sent-back-papers>{file.note}</span> : null}</p>}
          {file.kind === 'none' && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-400">File this day appears once a paper exists to file.</p>
              {canClose && (
                <button type="button" className="text-sm font-semibold text-gray-600 underline underline-offset-2 shrink-0 min-h-[44px]" data-day-close onClick={() => setCloseSheet(true)}>
                  Close this day
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {isOffice && <p className="text-xs text-gray-400 pt-2">Read-only — the crew's papers as they see them.</p>}
      {closeSheet && (
        <ConsequenceSheet onClose={() => setCloseSheet(false)}>
          <div data-day-close-sheet>
            <h3 className="font-bold text-lg">Close this day</h3>
            <p className="text-xs text-gray-500 mb-2">Nothing gets filed. The day leaves the office's lists with your reason, and Reopen brings it back.</p>
            <div className="space-y-2">
              {CLOSE_REASONS.map((r) => {
                const on = closeReason === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    className={`w-full text-left rounded-lg border px-3 py-3 min-h-[52px] text-base ${on ? 'border-safety-orange bg-orange-50 font-semibold' : 'border-gray-200 bg-white font-medium'}`}
                    data-close-reason={r.value}
                    aria-pressed={on}
                    onClick={() => setCloseReason(r.value)}
                  >
                    {r.label}
                  </button>
                );
              })}
              <Input value={closeOther} placeholder="Other reason…" data-close-other onChange={(e) => { setCloseOther(e.target.value); setCloseReason(''); }} />
            </div>
            <Button
              className="w-full mt-3 min-h-[48px]"
              disabled={!closeReason && !closeOther.trim()}
              data-day-close-confirm
              onClick={() => {
                void closeDay(day, closeReason || closeOther).then(() => setCloseSheet(false));
              }}
            >
              Close the day
            </Button>
            <Button variant="outline" className="w-full mt-2" onClick={() => setCloseSheet(false)}>
              Cancel
            </Button>
          </div>
        </ConsequenceSheet>
      )}
      {cardSheet && (
        <ConsequenceSheet onClose={() => setCardSheet(false)}>
          <div data-time-card-sheet>
            <h3 className="font-bold text-lg mb-2">Time cards · {job?.name ?? 'today'}</h3>
            <TimeCardsCard blastDay={day} />
            <Button variant="outline" className="w-full mt-3" onClick={() => setCardSheet(false)}>
              Close
            </Button>
          </div>
        </ConsequenceSheet>
      )}
    </div>
  );
}

export type { DrillLog };

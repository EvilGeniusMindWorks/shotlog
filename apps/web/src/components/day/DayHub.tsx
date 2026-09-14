// The day's tiles (Round S14): one tile per paper for the role, each with the
// paper's real state and one button — Start creates the paper (the word is
// the consent), Open / View opens it. The first unfinished tile carries
// "Up next". Under the blaster's tiles, the crew; under the driller's, the
// rigs. File this day sits at the bottom when a paper exists to file.
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, FileText, Timer, Drill } from 'lucide-react';
import type { BlastDay, BlastLog, DailyReport, DrillLog, Job, Shot } from '@/db/schema';
import { isBlastingWork } from '@/db/schema';
import { db, useLiveQuery } from '@/db';
import { addBlastLogToDay, createDailyReport } from '@/hooks/useBlastDay';
import { createDrillLog, getShotPlan } from '@/hooks/useDrillLogs';
import { myCard, useDayTimeCards } from '@/hooks/useTimeCards';
import {
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
import { can, myHomeDashboard } from '@/lib/perms';
import { getSessionUser } from '@/lib/session';
import { ConsequenceSheet } from '@/components/records/LifecycleMenu';
import { TimeCardsCard } from '@/components/forms/TimeCardsCard';
import { Button } from '@/components/ui/button';
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
      {upNext && <span className="absolute top-1 right-3 text-[9px] font-bold tracking-widest uppercase text-safety-orange">Up next</span>}
      <span className="w-7 text-gray-500 shrink-0">{icon}</span>
      <button type="button" className="flex-1 min-w-0 text-left" disabled={!clickable} onClick={onAction}>
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
  const readOnly = locked || isOffice;
  const [cardSheet, setCardSheet] = useState(false);

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
        if (logState.action === 'Start') void addBlastLogToDay(day.id).then(() => setView('hub'));
        else setView('hub');
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
  const upNextIndex = readOnly ? -1 : tiles.findIndex((t) => t.state.tone !== 'done' && (t.state.action === 'Start' || t.state.action === 'Open'));

  const file = fileState(day, blastLog, shots, dailyReport, dayLogs.length);
  const showFile = !isOffice && !(isDriller && blasting);

  return (
    <div className="space-y-2" data-day-hub data-day-hub-role={isOffice ? 'office' : isDriller ? 'driller' : 'field'}>
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
              {file.note && <p className="text-xs text-gray-500 mt-1 text-center">{file.note}</p>}
            </>
          )}
          {file.kind === 'blocked' && <p className="text-sm text-amber-800 border border-amber-300 bg-amber-50 rounded-lg px-3 py-2">{file.label}</p>}
          {file.kind === 'filed' && <p className="text-sm text-green-800 border border-green-200 bg-green-50 rounded-lg px-3 py-2">{file.label}</p>}
          {file.kind === 'none' && <p className="text-xs text-gray-400">File this day appears once a paper exists to file.</p>}
        </div>
      )}
      {isOffice && <p className="text-xs text-gray-400 pt-2">Read-only — the crew's papers as they see them.</p>}
      {cardSheet && (
        <ConsequenceSheet onClose={() => setCardSheet(false)}>
          <div data-time-card-sheet>
            <h3 className="font-bold text-lg mb-2">Time cards · {job?.name ?? 'today'}</h3>
            <TimeCardsCard blastDay={day} />
            <Button variant="outline" className="w-full mt-3" onClick={() => setCardSheet(false)}>
              Back to the day
            </Button>
          </div>
        </ConsequenceSheet>
      )}
    </div>
  );
}

export type { DrillLog };

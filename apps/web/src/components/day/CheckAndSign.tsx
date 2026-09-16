// Check and sign — step 5 and 6 of the blasting log's walkthrough (navigation
// round, Matthew: "a check for errors and sign, and then make the blasting
// log complete"). One screen: what the log still needs (each line a tap into
// the place), the signature, and Mark the blasting log complete — which
// lands on the day, where the tile reads Complete · ready to file.
import { useNavigate } from 'react-router-dom';
import { Check, CircleAlert, CircleDot, PenLine } from 'lucide-react';
import { db, useLiveQuery } from '@/db';
import type { BlastDay, BlastLog } from '@/db/schema';
import { logChecks } from '@/lib/logChecks';
import { hhmm } from '@/lib/dayCard';
import { getSessionUser } from '@/lib/session';
import { dataUrlToBlob, nowISO } from '@/lib/utils';
import { signingBlocked } from '@/components/onboarding/profileCompletion';
import { SigningBlocked } from '@/components/onboarding/SigningBlocked';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SignatureField } from '@/components/ui/signature-field';

export function CheckAndSign({
  day,
  blastLog,
  readOnly,
  onComplete,
}: {
  day: BlastDay;
  blastLog: BlastLog;
  readOnly: boolean;
  /** finishing lands forward — the day's tiles */
  onComplete: () => void;
}) {
  const navigate = useNavigate();
  const me = getSessionUser();
  const items = useLiveQuery(() => logChecks(day.id), [day.id, blastLog.updatedAt]) ?? [];
  const signed = Boolean(blastLog.signatureImage);
  const blockers = items.filter((i) => i.level === 'red' && i.key !== 'sig');
  const canComplete = signed && blockers.length === 0 && !readOnly;
  const licensed = Boolean(blastLog.licenseNumber);
  const update = (patch: Partial<BlastLog>) => db.blastLogs.update(blastLog.id, { ...patch, updatedAt: nowISO() });

  return (
    <div className="space-y-3" data-check-and-sign data-check-state={blastLog.doneAt ? 'complete' : signed ? 'signed' : blockers.length ? 'blocked' : 'ready'}>
      {blastLog.doneAt && (
        <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 flex items-center gap-3" data-log-complete-banner>
          <Check className="h-5 w-5 text-green-700 shrink-0" />
          <p className="text-sm flex-1">
            <b>Complete</b> · marked by {blastLog.doneByName || 'the blaster'} {hhmm(blastLog.doneAt)} · ready to file
          </p>
          {!readOnly && (
            <Button size="sm" variant="outline" data-log-undone onClick={() => void update({ doneAt: undefined, doneBy: undefined, doneByName: undefined })}>
              Edit again
            </Button>
          )}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100" data-check-list>
        {items
          .filter((i) => i.key !== 'sig' && i.key !== 'sig-ok' && i.key !== 'complete-ok')
          .map((i) => (
            <div key={i.key} className="flex items-center gap-3 px-4 py-2.5 text-sm" data-check-item={i.key} data-check-level={i.level}>
              {i.level === 'ok' ? (
                <Check className="h-4 w-4 text-green-700 shrink-0" />
              ) : i.level === 'red' ? (
                <CircleAlert className="h-4 w-4 text-violation shrink-0" />
              ) : (
                <CircleDot className="h-4 w-4 text-amber-600 shrink-0" />
              )}
              <span className={`flex-1 min-w-0 ${i.level === 'red' ? 'text-violation font-medium' : i.level === 'amber' ? 'text-amber-800' : 'text-gray-700'}`}>{i.text}</span>
              {i.to && i.level !== 'ok' && (
                <button type="button" className="text-xs font-semibold text-navy underline underline-offset-2 shrink-0" onClick={() => navigate(i.to!)}>
                  {i.toLabel ?? 'Open'} ›
                </button>
              )}
            </div>
          ))}
        {items.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">Checking…</p>}
      </div>

      {/* the signature — S16: one signature covers the log and its shots */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2" data-check-signature data-check-signed={signed ? '1' : '0'}>
        <Label className="text-xs flex items-center gap-1">
          <PenLine className="h-3.5 w-3.5" /> Blaster signature
          {signed && (
            <span className="text-green-700 font-normal">
              — signed{blastLog.blasterName ? ` by ${blastLog.blasterName}` : ''}
            </span>
          )}
        </Label>
        {!licensed && !signed ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" data-check-license>
            Pick the blaster and license first — under <b>Sign-off &amp; Delivery</b> on the log.{' '}
            <button type="button" className="underline font-semibold" onClick={() => navigate(`/blast-day/${day.id}?view=blast-log`)}>
              Open it ›
            </button>
          </p>
        ) : !signed && signingBlocked() ? (
          <SigningBlocked what="this log" />
        ) : readOnly ? (
          <p className="text-sm text-gray-500">{signed ? 'Signed.' : 'Not signed.'}</p>
        ) : (
          <div className="space-y-2">
            {!signed && me?.signature && (
              <Button
                variant="outline"
                size="sm"
                data-check-saved-signature
                onClick={() => {
                  const blob = dataUrlToBlob(me.signature!);
                  if (blob) void update({ signatureImage: blob, blasterName: blastLog.blasterName || me.name, blasterUserId: blastLog.blasterUserId || me.id });
                }}
              >
                <PenLine className="h-4 w-4 mr-1" /> Use saved signature
              </Button>
            )}
            <SignatureField
              value={blastLog.signatureImage}
              onChange={(blob) => void update({ signatureImage: blob, ...(blob ? { blasterName: blastLog.blasterName || me?.name || '', blasterUserId: blastLog.blasterUserId || me?.id } : {}) })}
            />
          </div>
        )}
      </div>

      {!blastLog.doneAt && (
        <div className="space-y-1">
          <Button
            className="w-full min-h-[48px] bg-safety-orange hover:bg-safety-orange/90 text-white text-base"
            disabled={!canComplete}
            data-log-complete
            onClick={() => {
              void update({ doneAt: nowISO(), doneBy: me?.id ?? '', doneByName: me?.name ?? '' }).then(onComplete);
            }}
          >
            Mark the blasting log complete
          </Button>
          {!canComplete && !readOnly && (
            <p className="text-xs text-gray-500 text-center" data-log-complete-why>
              {blockers.length ? `Fix the red line${blockers.length === 1 ? '' : 's'} above first` : !signed ? 'Sign first' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

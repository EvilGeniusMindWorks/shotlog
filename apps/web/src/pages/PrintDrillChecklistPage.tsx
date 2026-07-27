// Print-ready Rock Drill Checklist mirroring Baystate's paper form, plus the
// auto-file mode: filing a checklist routes through here so the office gets
// the point-in-time PDF the moment the driller signs it.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FileDown, Printer } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { formatDate } from '@/lib/utils';
import { savePagesAsPdf } from '@/lib/pdf';
import { fileSubmission, waitForPagesReady } from '@/lib/archive';
import { DRILL_DAILY_CHECKS, DRILL_WEEKLY_CHECKS, type CheckState } from '@/db/schema';
import { Button } from '@/components/ui/button';
import './print-blast-log.css';

const STATE_LABEL: Record<CheckState, string> = { ok: '✓', na: 'N/A', skip: '—' };

function ChecklistSheet({ checklistId }: { checklistId: string }) {
  const checklist = useLiveQuery(() => db.drillChecklists.get(checklistId), [checklistId]);
  const rig = useLiveQuery(
    () => (checklist ? db.equipment.get(checklist.equipmentId) : undefined),
    [checklist?.equipmentId],
  );
  const job = useLiveQuery(
    () => (checklist?.jobId ? db.jobs.get(checklist.jobId) : undefined),
    [checklist?.jobId],
  );
  const company = useLiveQuery(() => db.companySettings.get('companySettings-singleton'));
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!(checklist?.signatureImage instanceof Blob)) return;
    const url = URL.createObjectURL(checklist.signatureImage);
    setSigUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [checklist?.signatureImage]);

  if (!checklist) return null;
  return (
    <div className="page">
      <div className="header-bar">
        <div className="company-info">
          <div className="company-name">{company?.companyName || 'Baystate Blasting, Inc.'}</div>
        </div>
        <h1>Rock Drill Checklist</h1>
      </div>
      <table className="mb4">
        <tbody>
          <tr>
            <td><b>Drill:</b> {rig ? `${rig.assetNumber} — ${rig.description}` : checklist.equipmentId}</td>
            <td><b>Date:</b> {formatDate(checklist.date)}</td>
            <td><b>Starting hours:</b> {checklist.startingHours ?? '—'}</td>
          </tr>
          <tr>
            <td><b>Job:</b> {job?.name ?? '—'}</td>
            <td colSpan={2}><b>Operator:</b> {checklist.drillerName}</td>
          </tr>
        </tbody>
      </table>
      <table className="mb4">
        <thead>
          <tr><th>Daily checks</th><th style={{ width: '15%' }}>Status</th></tr>
        </thead>
        <tbody>
          {DRILL_DAILY_CHECKS.map((key) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{STATE_LABEL[checklist.daily[key] ?? 'skip']}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="mb4">
        <thead>
          <tr><th>Weekly checks{checklist.weeklyDone ? '' : ' (not due)'}</th><th style={{ width: '15%' }}>Status</th></tr>
        </thead>
        <tbody>
          {DRILL_WEEKLY_CHECKS.map((key) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{checklist.weeklyDone ? STATE_LABEL[checklist.weekly[key] ?? 'skip'] : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="mb4">
        <tbody>
          <tr>
            <td>
              <b>Repairs needed:</b> {checklist.repairsNote || 'none'}
              {checklist.outOfService && (
                <span> — <b>OUT OF SERVICE</b></span>
              )}
            </td>
          </tr>
          <tr>
            <td>
              <b>Operator signature:</b>{' '}
              {sigUrl ? <img src={sigUrl} alt="signature" style={{ height: 48 }} /> : '________________'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Plain print/PDF view (route /drill-checklist-print/:checklistId) */
export function PrintDrillChecklistPage() {
  const { checklistId } = useParams<{ checklistId: string }>();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  if (!checklistId) return null;
  return (
    <div className="print-blast-log">
      <div className="no-print flex gap-2 p-3 bg-gray-100">
        <button
          className="px-3 py-1.5 rounded bg-navy text-white text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await savePagesAsPdf(`drill-checklist-${checklistId.slice(0, 8)}.pdf`);
            } finally {
              setSaving(false);
            }
          }}
        >
          <FileDown size={16} /> {saving ? 'Generating…' : 'Save PDF'}
        </button>
        <button
          className="px-3 py-1.5 rounded bg-navy text-white text-sm inline-flex items-center gap-1.5"
          onClick={() => window.print()}
        >
          <Printer size={16} /> Print
        </button>
        <button className="px-3 py-1.5 rounded border text-sm" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>
      <ChecklistSheet checklistId={checklistId} />
    </div>
  );
}

/** Auto-file mode (route /drill-checklist-file/:checklistId): renders the
 *  sheet, archives it, then shows the outcome (incl. repair ticket note). */
export function FileDrillChecklistPage() {
  const { checklistId } = useParams<{ checklistId: string }>();
  const [params] = useSearchParams();
  const ticketOpened = params.get('ticket') === '1';
  const navigate = useNavigate();
  const checklist = useLiveQuery(
    () => (checklistId ? db.drillChecklists.get(checklistId) : undefined),
    [checklistId],
  );
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!checklist || ran.current) return;
    ran.current = true;
    void (async () => {
      try {
        await waitForPagesReady();
        const rig = await db.equipment.get(checklist.equipmentId);
        await fileSubmission({
          type: 'drill_checklist',
          sourceId: checklist.id,
          jobId: checklist.jobId,
          title: `Rig Checklist — ${rig?.assetNumber ?? checklist.equipmentId} · ${checklist.drillerName}`,
          date: checklist.date,
          meta: { rig: rig?.assetNumber, outOfService: checklist.outOfService },
        });
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'filing failed');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklist?.id]);

  return (
    <div className="print-blast-log">
      {checklistId && <ChecklistSheet checklistId={checklistId} />}
      <div className="fixed inset-0 z-50 bg-navy/90 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-6 max-w-sm w-full text-center space-y-3">
          {error ? (
            <>
              <p className="font-bold text-violation">Office filing failed</p>
              <p className="text-sm text-gray-600">
                The checklist itself is saved — only the office copy failed: {error}
              </p>
              <Button variant="outline" onClick={() => navigate('/')}>Done</Button>
            </>
          ) : done ? (
            <>
              <p className="text-3xl">✓</p>
              <p className="font-bold">Checklist filed</p>
              {ticketOpened && (
                <p className="text-sm text-safety-orange font-medium">
                  Repair ticket opened — the shop can see your notes.
                </p>
              )}
              <p className="text-xs text-gray-400">The office has the signed point-in-time copy.</p>
              <Button className="w-full" onClick={() => navigate('/')}>Done</Button>
            </>
          ) : (
            <>
              <div className="h-10 w-10 mx-auto rounded-full border-4 border-safety-orange border-t-transparent animate-spin" />
              <p className="font-bold">Filing checklist…</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

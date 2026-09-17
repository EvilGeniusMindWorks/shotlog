// Print-ready Incident Report (insurance-grade paper copy) + the archive
// mode used by "Send to Office": files the point-in-time PDF, then flips
// the incident into office review.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBackHere } from '@/lib/nav';
import { FileDown, Printer } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { getJobView } from '@/lib/jobContext';
import { formatDate, nowISO } from '@/lib/utils';
import { useFeedbackPaper } from '@/lib/feedbackPaper';
import { fileSubmission } from '@/lib/archive';
import { Button } from '@/components/ui/button';
import './print-blast-log.css';

import { INCIDENT_TITLE as TYPE_TITLE } from '@/lib/incidentDoNow';
import { hhmm } from '@/lib/dayCard';

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <tr>
      <td style={{ width: '35%' }}><b>{label}</b></td>
      <td>{value === undefined || value === null || value === '' ? '—' : String(value)}</td>
    </tr>
  );
}

function IncidentSheet({ incidentId }: { incidentId: string }) {
  const incident = useLiveQuery(() => db.incidents.get(incidentId), [incidentId]);
  const job = useLiveQuery(
    () => getJobView(incident?.jobId),
    [incident?.jobId],
  );
  const company = useLiveQuery(() => db.companySettings.get('companySettings-singleton'));
  if (!incident) return null;
  return (
    <div className="page">
      <div className="header-bar">
        <div className="company-info">
          <div className="company-name">{company?.companyName || 'Baystate Blasting, Inc.'}</div>
        </div>
        <h1>{TYPE_TITLE[incident.type]}</h1>
      </div>
      <table className="mb4">
        <tbody>
          <Row label="Date / time" value={`${formatDate(incident.date)} ${incident.time}`} />
          <Row label="Job" value={job ? `${job.name} — ${job.customer}` : undefined} />
          <Row label="Reported by" value={incident.reportedByName} />
          <Row label="Description" value={incident.description} />
        </tbody>
      </table>
      {incident.type === 'blasting' && (
        <table className="mb4">
          <thead><tr><th colSpan={2}>Structure & readings</th></tr></thead>
          <tbody>
            <Row label="Structure" value={incident.structureType} />
            <Row label="Structure address" value={incident.structureAddress} />
            <Row label="Owner" value={[incident.ownerName, incident.ownerPhone].filter(Boolean).join(' · ')} />
            <Row label="Owner address" value={incident.ownerAddress} />
            <Row label="Pre-blast survey" value={incident.preBlastSurvey} />
            <Row label="PPV (in/s)" value={incident.ppv ?? undefined} />
            <Row label="Air overpressure (dB)" value={incident.db ?? undefined} />
          </tbody>
        </table>
      )}
      {incident.type === 'utility' && (
        <table className="mb4">
          <thead><tr><th colSpan={2}>Utility details</th></tr></thead>
          <tbody>
            <Row label="Provider" value={incident.utilityProvider} />
            <Row label="Dig Safe #" value={incident.digsafeNumber} />
            <Row label="Marking" value={incident.utilityMarked} />
            <Row label="Utility type" value={incident.utilityKind?.replace(/_/g, ' ')} />
          </tbody>
        </table>
      )}
      {incident.type === 'injury' && (
        <table className="mb4">
          <thead><tr><th colSpan={2}>Injury</th></tr></thead>
          <tbody>
            <Row label="Injured person" value={[incident.injuredName, incident.injuredJobTitle].filter(Boolean).join(' · ')} />
            <Row label="Employer" value={incident.injuredEmployer === 'company' ? company?.companyName || 'ours' : incident.injuredEmployer} />
            <Row label="Where on the site" value={incident.whereOnSite} />
            <Row label="What they were doing" value={incident.activity} />
            <Row label="Injury and body part" value={incident.injuryBodyPart} />
            <Row label="Cause" value={incident.injuryCause} />
            <Row label="Treatment" value={[incident.treatment?.replace(/_/g, ' '), incident.treatmentFacility, incident.ambulance ? 'by ambulance' : ''].filter(Boolean).join(' · ')} />
            <Row label="Witnesses" value={incident.witnesses} />
            <Row label="Supervisor" value={incident.supervisorName} />
            <Row label="Lost time" value={incident.lostTime === 'unknown' ? 'not known yet' : incident.lostTime} />
          </tbody>
        </table>
      )}
      {incident.type === 'near_miss' && (
        <table className="mb4">
          <thead><tr><th colSpan={2}>Near miss</th></tr></thead>
          <tbody>
            <Row label="What stopped it" value={incident.whatStoppedIt} />
            <Row label="The hazard" value={incident.hazard} />
            <Row label="What should change" value={incident.correctiveAction} />
            <Row label="Who was told" value={incident.whoWasTold} />
          </tbody>
        </table>
      )}
      {(incident.callLog ?? []).length > 0 && (
        <table className="mb4" data-print-call-log>
          <thead><tr><th colSpan={2}>Who was told, and when</th></tr></thead>
          <tbody>
            {(incident.callLog ?? []).map((e) => (
              <Row key={e.key + e.at} label={`${hhmm(e.at)}${e.byName ? ` · ${e.byName}` : ''}`} value={e.label} />
            ))}
          </tbody>
        </table>
      )}
      {incident.type === 'asset' && (
        <table className="mb4">
          <thead><tr><th colSpan={2}>Asset details</th></tr></thead>
          <tbody>
            <Row label="Kind" value={incident.assetIncidentKind?.replace(/_/g, ' ')} />
            <Row label="Police called" value={incident.policeCalled === undefined ? undefined : incident.policeCalled ? 'yes' : 'no'} />
            <Row label="Other party" value={incident.otherParty} />
          </tbody>
        </table>
      )}
      <table className="mb4">
        <tbody>
          <tr>
            <td><b>Filed by:</b> {incident.reportedByName} — ________________</td>
            <td><b>Date:</b> {formatDate(incident.date)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Plain print/PDF view (route /incident/:incidentId/print) */
export function PrintIncidentPage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const navigate = useNavigate();
  const back = useBackHere('Incident · print');
  const [saving, setSaving] = useState(false);
  const incident = useLiveQuery(() => (incidentId ? db.incidents.get(incidentId) : undefined), [incidentId]);
  useFeedbackPaper(incident ? { label: `Incident report · ${formatDate(incident.date)} · print`, kind: 'incident', recordId: incident.id } : null);
  if (!incidentId) return null;
  return (
    <div className="print-blast-log">
      <div className="no-print flex gap-2 p-3 bg-gray-100">
        <button
          className="px-3 py-1.5 rounded bg-navy text-white text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              const { buildIncidentPdf, downloadPdf } = await import('@/pdfdocs');
              downloadPdf(await buildIncidentPdf(incidentId), `incident-${incidentId.slice(0, 8)}.pdf`);
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
        <button className="px-3 py-1.5 rounded border text-sm" onClick={() => (back ? back.go() : navigate(-1))} data-nav-back data-nav-back-to={back?.to ?? ''}>
          ‹ <span data-nav-back-label>{back?.label ?? 'Back'}</span>
        </button>
      </div>
      <IncidentSheet incidentId={incidentId} />
    </div>
  );
}

/** Archive mode (route /incident/:incidentId/submit): file the PDF with
 *  frozen attachments, then flip the incident into office review. */
export function SubmitIncidentPage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const navigate = useNavigate();
  const incident = useLiveQuery(
    () => (incidentId ? db.incidents.get(incidentId) : undefined),
    [incidentId],
  );
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!incident || ran.current) return;
    ran.current = true;
    void (async () => {
      try {
        const { buildIncidentPdf } = await import('@/pdfdocs');
        const pdf = await buildIncidentPdf(incident.id);
        const job = await getJobView(incident.jobId);
        // Freeze the day's attachments when the incident points at a blast day
        const attachments = incident.blastDayId
          ? await db.attachments.filter((a) => a.parentId === incident.blastDayId).toArray()
          : [];
        await fileSubmission({
          type: 'incident',
          sourceId: incident.id,
          blastDayId: incident.blastDayId,
          jobId: incident.jobId,
          title: `${TYPE_TITLE[incident.type]} — ${job?.name ?? formatDate(incident.date)}`,
          date: incident.date,
          pdf,
          attachments,
          meta: { jobName: job?.name, incidentType: incident.type },
        });
        await db.incidents.update(incident.id, { status: 'office_review', updatedAt: nowISO() });
        navigate(`/incident/${incident.id}`, { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'filing failed');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident?.id]);

  return (
    <div className="print-blast-log">
      {incidentId && <IncidentSheet incidentId={incidentId} />}
      <div className="fixed inset-0 z-50 bg-navy/90 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl p-6 max-w-sm w-full text-center space-y-3">
          {error ? (
            <>
              <p className="font-bold text-violation">Filing failed</p>
              <p className="text-sm text-gray-600">{error}</p>
              <Button variant="outline" onClick={() => navigate(`/incident/${incidentId}`)}>
                Back — not sent
              </Button>
            </>
          ) : (
            <>
              <div className="h-10 w-10 mx-auto rounded-full border-4 border-safety-orange border-t-transparent animate-spin" />
              <p className="font-bold">Sending to the office…</p>
              <p className="text-xs text-gray-400">Filing the point-in-time incident report.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

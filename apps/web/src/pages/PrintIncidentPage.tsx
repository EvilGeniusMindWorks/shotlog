// Print-ready Incident Report (insurance-grade paper copy) + the archive
// mode used by "Send to Office": files the point-in-time PDF, then flips
// the incident into office review.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileDown, Printer } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { formatDate, nowISO } from '@/lib/utils';
import { fileSubmission } from '@/lib/archive';
import { Button } from '@/components/ui/button';
import './print-blast-log.css';

const TYPE_TITLE = {
  blasting: 'Blasting Incident Report',
  utility: 'Utility Strike Report',
  asset: 'Company Asset Incident Report',
} as const;

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
    () => (incident?.jobId ? db.jobs.get(incident.jobId) : undefined),
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
  const [saving, setSaving] = useState(false);
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
        <button className="px-3 py-1.5 rounded border text-sm" onClick={() => navigate(-1)}>
          Back
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
        const job = incident.jobId ? await db.jobs.get(incident.jobId) : undefined;
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

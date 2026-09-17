// S22 — the printed Jobsite Contact Sheet: the job and its rows by group,
// stamped "Sheet v3 · Sep 16 · Evette" so an old paper copy can be told from
// a new one. The back page carries the way to the hospital and the urgent
// care: the maps links now; the route and the QR code arrive with push 3.
import { useNavigate, useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useLiveQuery, db } from '@/db';
import { formatDate } from '@/lib/utils';
import { useBackHere } from '@/lib/nav';
import { recordPrint, rowIsBlank, sheetStats, SHEET_GROUPS, mapsUrl } from '@/lib/contactSheet';
import { useContactSheet } from '@/components/forms/ContactSheetCard';
import { Button } from '@/components/ui/button';
import './print-blast-log.css';

export function PrintContactSheetPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const back = useBackHere('Contact sheet');
  const { job, site, customer, rows, stats } = useContactSheet(id);
  const company = useLiveQuery(() => db.companySettings.get('companySettings-singleton'));
  if (!job) return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  const version = job.contactSheet?.version ?? 0;
  const stamp = job.contactSheet ? `Sheet v${version} · ${formatDate(job.contactSheet.updatedAt.slice(0, 10))} · ${job.contactSheet.updatedByName}` : 'Sheet · not saved yet';
  const missing = stats.printNeeds;
  const print = async () => {
    await recordPrint(job).catch(() => undefined);
    window.print();
  };
  const places = rows.filter((r) => (r.def.key === 'hospital' || r.def.key === 'urgent_care') && !rowIsBlank(r));

  return (
    <div data-print-contact-sheet={job.id} data-print-version={version}>
      <div className="print:hidden bg-navy text-white px-4 py-3 flex items-center gap-3">
        <button className="text-sm underline" onClick={() => (back ? back.go() : navigate(`/jobs/${job.id}`))}>‹ {back?.label ?? 'the job'}</button>
        <p className="flex-1 text-sm font-semibold truncate">Jobsite Contact Sheet · {job.jobNumber ? `${job.jobNumber} · ` : ''}{job.name}</p>
        {missing.length > 0 && <span className="text-xs text-amber-200" data-print-missing={missing.length}>needs {missing.join(', ')}</span>}
        <Button size="sm" variant="secondary" onClick={() => void print()} data-print-sheet-print><Printer className="h-4 w-4 mr-1" /> Print</Button>
      </div>
      <div className="page" style={{ maxWidth: 820, margin: '0 auto', padding: 24 }}>
        <div className="header-bar">
          <div className="company-info">
            <div className="company-name">{company?.companyName || 'Baystate Blasting, Inc.'}</div>
            {company?.phone && <div>{company.phone}</div>}
          </div>
          <h1>Jobsite Contact Sheet</h1>
          <div style={{ fontSize: 11, color: '#555' }} data-print-stamp>{stamp}</div>
        </div>
        <p style={{ fontSize: 13, margin: '6px 0 12px' }}>
          <b>{job.jobNumber ? `${job.jobNumber} · ` : ''}{job.name}</b>
          {customer ? ` · ${customer.name}` : ''}
          {site ? ` · ${[site.address, site.city, site.state].filter(Boolean).join(', ')}` : ''}
        </p>
        {SHEET_GROUPS.map((g) => (
          <table className="mb4" key={g.key} data-print-group={g.key}>
            <thead><tr><th colSpan={3}>{g.label}</th></tr></thead>
            <tbody>
              {rows.filter((r) => r.def.group === g.key).map((r) => (
                <tr key={r.key} data-print-row={r.key}>
                  <td style={{ width: '32%' }}><b>{r.def.label}</b></td>
                  <td style={{ width: '40%' }}>{rowIsBlank(r) ? '' : (r.name || r.notes)}{!rowIsBlank(r) && r.name && r.notes && !r.def.text ? <><br /><span style={{ fontSize: 11, color: '#555' }}>{r.notes}</span></> : null}</td>
                  <td style={{ width: '28%', fontFamily: 'ui-monospace, monospace' }}>{r.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        <p style={{ fontSize: 10, color: '#777' }}>Emergency: dial 911 first. This sheet is the office's living copy for this job; the crew's phones carry the same rows offline.</p>
      </div>
      <div className="page" style={{ maxWidth: 820, margin: '0 auto', padding: 24, pageBreakBefore: 'always' }} data-print-back>
        <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Directions from {site ? [site.address, site.city].filter(Boolean).join(', ') : 'the site'}</h2>
        {places.length === 0 && <p style={{ fontSize: 13 }}>The hospital and urgent care rows are not set yet — fill them on the job page and the way there prints here.</p>}
        {places.map((r) => (
          <div key={r.key} style={{ margin: '0 0 14px' }} data-print-place={r.key}>
            <p style={{ fontSize: 13, margin: 0 }}><b>{r.def.label.replace(' (911)', '')}</b> · {r.name}{r.phone ? ` · ${r.phone}` : ''}</p>
            {r.notes && <p style={{ fontSize: 12, margin: '2px 0', color: '#555' }}>{r.notes}</p>}
            <p style={{ fontSize: 11, color: '#555', margin: '2px 0' }}>Open in maps: <a href={mapsUrl([r.name, r.notes].filter(Boolean).join(' '))}>{mapsUrl([r.name, r.notes].filter(Boolean).join(' '))}</a></p>
            <p style={{ fontSize: 11, color: '#999', margin: 0 }}>The route, one step per line, and the code to scan for live directions print here once the router is on.</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// S22 — the printed Jobsite Contact Sheet: the job and its rows by group,
// stamped "Sheet v3 · Sep 16 · Evette" so an old paper copy can be told from
// a new one. The back page carries the way to the hospital and the urgent
// care: the maps links now; the route and the QR code arrive with push 3.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { driveRoute, liveDirectionsUrl, type DriveRoute } from '@/lib/places';
import { jobPoint } from '@/lib/siteGeo';
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
  return <PrintSheet job={job} site={site} customer={customer} company={company} rows={rows} stats={stats} places={places} stamp={stamp} version={version} missing={missing} print={print} back={back} navigate={navigate} />;
}

function PrintSheet({ job, site, customer, company, rows, stats: _stats, places, stamp, version, missing, print, back, navigate }: { job: NonNullable<ReturnType<typeof useContactSheet>['job']>; site: ReturnType<typeof useContactSheet>['site']; customer: ReturnType<typeof useContactSheet>['customer']; company: ReturnType<typeof useLiveQuery<unknown>> ; rows: ReturnType<typeof useContactSheet>['rows']; stats: ReturnType<typeof useContactSheet>['stats']; places: ReturnType<typeof useContactSheet>['rows']; stamp: string; version: number; missing: string[]; print: () => Promise<void>; back: ReturnType<typeof useBackHere>; navigate: ReturnType<typeof useNavigate> }) {
  const companyRec = company as { companyName?: string; phone?: string } | undefined;
  // the QR code carries a live-directions link; the route comes from our own router when it is on
  const [qr, setQr] = useState<Record<string, string>>({});
  const [routes, setRoutes] = useState<Record<string, DriveRoute | null | 'off'>>({});
  const from = jobPoint(job, site ?? undefined)?.point ?? null;
  const placeKeys = places.map((p) => p.key + ':' + (p.geo ? `${p.geo.lat},${p.geo.lng}` : p.name)).join('|');
  useEffect(() => {
    let alive = true;
    (async () => {
      const codes: Record<string, string> = {};
      const found: Record<string, DriveRoute | null | 'off'> = {};
      for (const p of places) {
        codes[p.key] = await QRCode.toDataURL(liveDirectionsUrl({ name: p.name, address: p.notes, lat: p.geo?.lat, lng: p.geo?.lng }), { margin: 1, width: 132 });
        if (from && p.geo) {
          try {
            const r = await driveRoute(from, p.geo);
            found[p.key] = r === null ? 'off' : r;
          } catch {
            found[p.key] = 'off';
          }
        } else found[p.key] = 'off';
      }
      if (alive) { setQr(codes); setRoutes(found); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeKeys, from?.lat, from?.lng]);

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
            <div className="company-name">{companyRec?.companyName || 'Baystate Blasting, Inc.'}</div>
            {companyRec?.phone && <div>{companyRec.phone}</div>}
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
        {places.map((r) => {
          const route = routes[r.key];
          return (
            <div key={r.key} style={{ margin: '0 0 18px', display: 'flex', gap: 16, alignItems: 'flex-start' }} data-print-place={r.key}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, margin: 0 }}><b>{r.def.label.replace(' (911)', '')}</b> · {r.name}{r.phone ? ` · ${r.phone}` : ''}</p>
                {r.notes && <p style={{ fontSize: 12, margin: '2px 0', color: '#555' }}>{r.notes}{route && route !== 'off' ? ` · ${route.miles} mi · about ${route.minutes} minutes` : ''}</p>}
                {route && route !== 'off' && (
                  <ol style={{ fontSize: 13, lineHeight: 1.5, margin: '6px 0 0 18px', padding: 0 }} data-print-route={r.key}>
                    {route.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                )}
                {route === 'off' && (
                  <p style={{ fontSize: 11, color: '#999', margin: '4px 0 0' }} data-print-route-off={r.key}>
                    {r.geo ? 'The drive, one step per line, prints here once the router is on.' : 'Pick this row from Suggest (or set its map point) and the drive prints here once the router is on.'}
                  </p>
                )}
                <p style={{ fontSize: 11, color: '#555', margin: '4px 0 0' }}>Open in maps: {mapsUrl([r.name, r.notes].filter(Boolean).join(' '))}</p>
              </div>
              {qr[r.key] && (
                <figure style={{ margin: 0, textAlign: 'center', width: 140 }}>
                  <img src={qr[r.key]} alt="" width={132} height={132} data-print-qr={r.key} />
                  <figcaption style={{ fontSize: 10, color: '#555' }}>scan for live directions from where you are</figcaption>
                </figure>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

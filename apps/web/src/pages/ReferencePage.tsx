import { useState } from 'react';
import { usbmRI8507Limit } from '@shotlog/shared';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Tab = 'formulas' | 'glossary' | 'compliance';

const FORMULAS = [
  {
    name: 'Scaled Distance (SD)',
    notation: 'SD = D / √W',
    desc: 'Normalizes structure distance by charge weight — the core regulatory quantity.',
    vars: 'D = distance to structure (ft) · W = max charge weight per delay (lbs)',
    range: 'SD ≥ 50–65 typically required without seismograph monitoring',
  },
  {
    name: 'Peak Particle Velocity (PPV)',
    notation: 'PPV = K × SD⁻¹·⁶',
    desc: 'Predicted ground vibration at the structure, before the shot.',
    vars: 'K = site attenuation factor · SD = scaled distance',
    range: 'Compared against USBM RI 8507 / OSM limits (0.5–2.0 in/s)',
  },
  {
    name: 'K Factor',
    notation: 'K = PPV × SD¹·⁶',
    desc: 'Back-calculated from measured shots — refines predictions for this site.',
    vars: 'PPV = measured (in/s) · SD = scaled distance of that shot',
    range: 'Typical 50–350; conservative default 180',
  },
  {
    name: 'Powder Factor (PF)',
    notation: 'PF = Total Lbs / Total Yd³',
    desc: 'Explosive energy per rock volume — fragmentation economics.',
    vars: 'Lbs = explosives + boosters · Yd³ = rock volume shot',
    range: 'Construction 0.8–1.5 · Quarry 1.0–2.0 lbs/yd³',
  },
  {
    name: 'Rock Volume',
    notation: 'V = (B × S × D × N) / 27',
    desc: 'Cubic yards from the drill pattern.',
    vars: 'B = burden (ft) · S = spacing (ft) · D = avg depth (ft) · N = holes',
    range: '27 ft³ per yd³',
  },
  {
    name: 'Loading Density',
    notation: 'lbs/ft = 0.3405 × De² × ρ',
    desc: 'Pounds of explosive per foot of borehole.',
    vars: 'De = explosive diameter (in) · ρ = density (g/cc)',
    range: 'ANFO ~0.85 g/cc · Emulsion 1.15–1.25 g/cc',
  },
];

const GLOSSARY = [
  ['Burden', 'Distance from a borehole to the nearest free face — the rock it must break.'],
  ['Spacing', 'Distance between holes in a row, measured along the face.'],
  ['Stemming', 'Inert material (crushed stone) loaded above the explosive column to confine energy.'],
  ['Sub Drill', 'Drilling below grade so the shot breaks to full depth without leaving a lip.'],
  ['Air Deck', 'Deliberate gap in the explosive column that distributes energy and reduces overbreak.'],
  ['PPV', 'Peak Particle Velocity — maximum ground vibration speed (in/s) measured by seismograph.'],
  ['ZC Frequency', 'Zero-crossing frequency (Hz) of the vibration waveform — sets the USBM limit.'],
  ['MS Delay', 'Millisecond delay between detonations — spreads energy over time to cut peak vibration.'],
];

// The corrected USBM RI 8507 Z-curve, presented as bands
const USBM_BANDS = [
  { band: '< 4 Hz', limit: '2π·f·0.030 in/s', note: 'displacement-limited (0.030 in)' },
  { band: '4–15 Hz', limit: '0.75 in/s', note: 'drywall / modern homes (plaster: 0.50)' },
  { band: '15–40 Hz', limit: '2π·f·0.008 in/s', note: 'rises along the 0.008-in line' },
  { band: '≥ 40 Hz', limit: '2.00 in/s', note: 'high-frequency cap' },
];

const OSM_BANDS = [
  { band: '0–300 ft', limit: '1.25 in/s' },
  { band: '301–5,000 ft', limit: '1.00 in/s' },
  { band: '> 5,000 ft', limit: '0.75 in/s' },
];

export function ReferencePage() {
  const [tab, setTab] = useState<Tab>('formulas');
  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Reference</h2>

      <div className="flex border-b border-gray-200">
        {(
          [
            ['formulas', 'Formulas'],
            ['glossary', 'Glossary'],
            ['compliance', 'Compliance'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={cn(
              'flex-1 py-3 text-sm font-medium border-b-2 transition-colors min-h-[44px]',
              tab === key ? 'border-navy text-navy' : 'border-transparent text-gray-500',
            )}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'formulas' && (
        <div className="space-y-3">
          {FORMULAS.map((f) => (
            <Card key={f.name}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold">{f.name}</span>
                  <code className="font-mono text-sm font-bold text-navy bg-navy-50 rounded px-2 py-0.5 whitespace-nowrap">
                    {f.notation}
                  </code>
                </div>
                <p className="text-sm text-gray-600 mb-1">{f.desc}</p>
                <p className="text-xs text-gray-500">{f.vars}</p>
                <p className="text-xs text-gray-400 mt-1">{f.range}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === 'glossary' && (
        <div className="space-y-2">
          {GLOSSARY.map(([term, def]) => (
            <Card key={term}>
              <CardContent className="p-3">
                <span className="font-semibold text-sm">{term}</span>
                <p className="text-sm text-gray-600">{def}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === 'compliance' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">USBM RI 8507 — Frequency-Dependent PPV Limits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="py-1.5">Frequency</th>
                    <th className="py-1.5">Limit</th>
                    <th className="py-1.5">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {USBM_BANDS.map((b) => (
                    <tr key={b.band} className="border-b border-gray-100 last:border-0">
                      <td className="py-1.5 font-mono font-semibold">{b.band}</td>
                      <td className="py-1.5 font-mono text-navy">{b.limit}</td>
                      <td className="py-1.5 text-xs text-gray-500">{b.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Worked examples straight from the shared calc — always consistent with the app */}
              <div className="flex flex-wrap gap-2">
                {[5, 10, 20, 30, 40].map((f) => (
                  <Badge key={f} variant="secondary">
                    {f} Hz → {usbmRI8507Limit(f).toFixed(2)} in/s
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                Siskind et al. 1980, Figure B-1 (drywall curve). The app evaluates every seismo
                reading against this exact curve.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">OSMRE — Distance-Based PPV Limits</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="py-1.5">Distance to Structure</th>
                    <th className="py-1.5">Max PPV</th>
                  </tr>
                </thead>
                <tbody>
                  {OSM_BANDS.map((b) => (
                    <tr key={b.band} className="border-b border-gray-100 last:border-0">
                      <td className="py-1.5 font-mono font-semibold">{b.band}</td>
                      <td className="py-1.5 font-mono text-navy">{b.limit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-2">30 CFR 816.67(d)</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regulation Stack</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                ['Federal', 'USBM RI 8507 + OSMRE — always active', true],
                ['State', 'Auto-mapped from the job address (e.g. MA 540 CMR)', true],
                ['Local / Municipal', 'Configured per job — most restrictive wins', false],
              ].map(([tier, desc, active]) => (
                <div
                  key={tier as string}
                  className="flex items-center gap-3 border border-gray-200 rounded-lg p-3"
                >
                  <Badge variant={active ? 'compliant' : 'secondary'}>{tier as string}</Badge>
                  <p className="text-sm text-gray-600 flex-1">{desc as string}</p>
                </div>
              ))}
              <p className="text-xs text-gray-400">
                Every shot is evaluated against the full stack for its job's location — the most
                restrictive threshold wins.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

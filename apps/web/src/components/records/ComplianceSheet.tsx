// Compliance that explains itself (Round 2, blaster study §6): any flag,
// tapped, shows the rule, the numbers, the math, and what would pass.
// Every number here is already computed by the engine — this sheet just
// stops hiding the reasoning. Works for predicted (design-time) and
// measured (seismo) values.
import {
  checkCompliance,
  maxChargeWeight,
  minSafeDistance,
  osmPPVLimit,
  predictedPPV,
  scaledDistance,
  usbmRI8507Limit,
} from '@shotlog/shared';
import { ConsequenceSheet } from '@/components/records/LifecycleMenu';

export interface ComplianceFacts {
  kind: 'predicted' | 'measured';
  ppv: number; // in/s — predicted or measured max
  kFactor: number;
  distanceFt: number; // closest structure
  chargeLbs: number; // max lbs/delay
  /** measured only */
  frequencyHz?: number;
  localReg?: { name: string; limit: number };
}

function Row({ label, value, tone }: { label: React.ReactNode; value: string; tone?: 'bad' | 'good' }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-t border-gray-100 first:border-t-0 text-sm">
      <span className="flex-1 text-gray-600">{label}</span>
      <span
        className={
          'font-mono font-bold ' +
          (tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-compliant' : '')
        }
      >
        {value}
      </span>
    </div>
  );
}

export function ComplianceSheet({ facts, onClose }: { facts: ComplianceFacts; onClose: () => void }) {
  const { ppv, kFactor, distanceFt, chargeLbs, frequencyHz, localReg } = facts;
  const sd = distanceFt > 0 && chargeLbs > 0 ? scaledDistance(distanceFt, chargeLbs) : 0;

  // The governing limit: local bylaw when one exists, else USBM at the
  // measured frequency, else OSM's distance band
  const usbm = frequencyHz != null && frequencyHz > 0 ? usbmRI8507Limit(frequencyHz) : undefined;
  const osm = distanceFt > 0 ? osmPPVLimit(distanceFt) : undefined;
  const governing = localReg
    ? { label: `Limit — ${localReg.name}`, value: localReg.limit }
    : usbm != null
      ? { label: `Limit — USBM RI8507 (${frequencyHz} Hz)`, value: usbm }
      : osm != null
        ? { label: `Limit — OSM at ${distanceFt} ft`, value: osm }
        : undefined;
  const fails = governing != null && ppv > governing.value;
  const margin = governing && governing.value > 0 ? Math.round((1 - ppv / governing.value) * 100) : null;

  // What would pass, against the governing limit (predicted physics only)
  let passLbs: number | null = null;
  let passDist: number | null = null;
  let passPPVAtLbs: number | null = null;
  if (governing && distanceFt > 0 && chargeLbs > 0 && kFactor > 0) {
    const sdNeeded = Math.pow(kFactor / governing.value, 1 / 1.6);
    passLbs = Math.floor(maxChargeWeight(distanceFt, sdNeeded));
    passDist = Math.ceil(minSafeDistance(chargeLbs, sdNeeded));
    if (passLbs > 0) passPPVAtLbs = predictedPPV(kFactor, scaledDistance(distanceFt, passLbs));
  }

  const measured =
    facts.kind === 'measured' && frequencyHz != null && distanceFt >= 0
      ? checkCompliance(ppv, frequencyHz, distanceFt || 5001)
      : undefined;

  return (
    <ConsequenceSheet onClose={onClose}>
      <div className="max-h-[75vh] overflow-y-auto space-y-3">
        <div
          className={
            'rounded-xl border p-3 border-l-4 ' +
            (fails ? 'border-gray-200 border-l-red-500' : 'border-gray-200 border-l-compliant')
          }
        >
          <p
            className={
              'text-[10px] font-bold tracking-widest uppercase mb-1 ' +
              (fails ? 'text-red-600' : 'text-compliant')
            }
          >
            {facts.kind === 'predicted'
              ? fails
                ? 'Predicted PPV exceeds the limit'
                : 'Predicted PPV passes'
              : fails
                ? 'Measured PPV exceeds the limit'
                : 'Measured PPV within limits'}
          </p>
          <Row
            label={facts.kind === 'predicted' ? 'Predicted PPV' : 'Measured PPV'}
            value={`${ppv.toFixed(2)} in/s`}
            tone={fails ? 'bad' : 'good'}
          />
          {governing && <Row label={governing.label} value={`${governing.value.toFixed(2)} in/s`} />}
          {localReg && usbm != null && (
            <Row label={`USBM RI8507 (${frequencyHz} Hz) would allow`} value={`${usbm.toFixed(2)} in/s`} />
          )}
          {osm != null && governing?.label !== `Limit — OSM at ${distanceFt} ft` && (
            <Row label={`OSM at ${distanceFt} ft`} value={`${osm.toFixed(2)} in/s`} />
          )}
          {!fails && margin != null && <Row label="Margin" value={`${margin}%`} tone="good" />}
          {measured && (
            <Row
              label="Overall (USBM + OSM)"
              value={measured.overall}
              tone={measured.overall === 'compliant' ? 'good' : 'bad'}
            />
          )}
        </div>

        {sd > 0 && (
          <div className="rounded-xl border border-gray-200 p-3">
            <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">
              The math
            </p>
            <Row
              label={`SD = ${distanceFt} ft ÷ √${chargeLbs} lbs`}
              value={sd.toFixed(1)}
            />
            {facts.kind === 'predicted' && (
              <Row
                label={
                  <>
                    PPV = {kFactor} × {sd.toFixed(1)}
                    <sup>-1.6</sup>
                  </>
                }
                value={predictedPPV(kFactor, sd).toFixed(2)}
              />
            )}
          </div>
        )}

        {fails && passLbs != null && passDist != null && (
          <div className="rounded-xl border border-gray-200 border-l-4 border-l-compliant p-3">
            <p className="text-[10px] font-bold tracking-widest uppercase text-compliant mb-1">
              To pass
            </p>
            <Row
              label={`Max lbs/delay at ${distanceFt} ft`}
              value={`≤ ${passLbs} lbs${passPPVAtLbs != null ? ` → ${passPPVAtLbs.toFixed(2)} in/s` : ''}`}
            />
            <Row label={`…or distance at ${chargeLbs} lbs`} value={`≥ ${passDist} ft`} />
          </div>
        )}
      </div>
    </ConsequenceSheet>
  );
}

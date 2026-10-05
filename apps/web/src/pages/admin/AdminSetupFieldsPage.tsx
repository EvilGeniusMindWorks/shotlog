// S26 push 3 (Matthew, Oct 5 2026: "is that all there is for setup fields? …
// this may need its own page"): the whole sort from the interview — forty-four
// rows in six groups — on its own page under Admin › Company. Each row says
// where the fact lives, when it is asked (At setup / Later / Rarely) and
// whether a missing one holds a blasting day. Rows that are always asked,
// automatic or live on a screen of their own say so instead of a switch.
// Saved on the company settings doc; the New job sheet, the job's tiles and
// the Start-work gate read it at once.
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db';
import { nowISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  GROUP_LABEL,
  GROUP_ORDER,
  LIVES_LABEL,
  SETUP_FIELD_DEFAULTS,
  WHEN_LABEL,
  useSetupFields,
  type SetupFieldDef,
  type SetupWhen,
} from '@/lib/setupFields';

const SINGLETON = 'companySettings-singleton';

export async function writeSetupField(key: string, patch: { when?: SetupWhen; gate?: boolean }) {
  const cur = await db.companySettings.get(SINGLETON);
  const list = [...(cur?.setupFields ?? [])];
  const i = list.findIndex((s) => s.key === key);
  const def = SETUP_FIELD_DEFAULTS.find((d) => d.key === key);
  if (!def) return;
  const next = { key, when: patch.when ?? list[i]?.when ?? def.when, gate: patch.gate ?? list[i]?.gate ?? def.gate };
  if (i >= 0) list[i] = next; else list.push(next);
  if (cur) await db.companySettings.update(SINGLETON, { setupFields: list, updatedAt: nowISO() });
}

export function setupFieldCounts(fields: SetupFieldDef[]) {
  return {
    rows: fields.length,
    atSetup: fields.filter((f) => f.when === 'setup').length,
    gates: fields.filter((f) => f.gate).length,
    changed: fields.filter((f) => {
      const d = SETUP_FIELD_DEFAULTS.find((x) => x.key === f.key)!;
      return d.when !== f.when || d.gate !== f.gate;
    }).length,
  };
}

export function AdminSetupFieldsPage() {
  const { online } = useOutletContext<{ online: boolean }>();
  const fields = useSetupFields();
  const counts = setupFieldCounts(fields);
  const reset = async () => {
    const cur = await db.companySettings.get(SINGLETON);
    if (cur) await db.companySettings.update(SINGLETON, { setupFields: [], updatedAt: nowISO() });
  };

  return (
    <div className="space-y-4" data-setup-fields data-setup-fields-rows={counts.rows}>
      <div className="flex items-start gap-3 flex-wrap">
        <Link to="/admin/company" className="inline-flex items-center gap-1 text-sm text-navy underline mt-0.5" data-setup-fields-back>
          <ArrowLeft className="h-4 w-4" /> Company
        </Link>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-gray-900">Setup fields</h3>
          <p className="text-sm text-gray-500">
            Every fact a customer, a site or a job can carry — where it lives, whether setting up a job asks for it <b>at setup</b>, <b>later</b> or <b>rarely</b>, and whether a missing one <b>holds a blasting day</b>. A row moved to At setup appears on the New job sheet and as a tile on every job at once; changes reach every device on the next sync.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs text-gray-600" data-setup-fields-summary>
        <span className="rounded-full bg-gray-100 px-2.5 py-1">{counts.rows} rows</span>
        <span className="rounded-full bg-navy/10 text-navy px-2.5 py-1">{counts.atSetup} asked at setup</span>
        <span className="rounded-full bg-red-50 text-red-800 border border-red-200 px-2.5 py-1">{counts.gates} hold a blasting day</span>
        {counts.changed > 0 && <span className="rounded-full bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1">{counts.changed} changed from the defaults</span>}
        {counts.changed > 0 && (
          <Button size="sm" variant="outline" className="ml-auto" disabled={!online} onClick={() => void reset()} data-setup-fields-reset>
            Back to the defaults
          </Button>
        )}
      </div>

      {GROUP_ORDER.map((g) => {
        const rows = fields.filter((f) => f.group === g);
        return (
          <section key={g} className="rounded-xl border border-gray-200 bg-white overflow-hidden" data-setup-group={g}>
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-baseline justify-between">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{GROUP_LABEL[g]}</p>
              <p className="text-[11px] text-gray-400">{rows.filter((r) => r.when === 'setup').length} of {rows.length} at setup</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="py-1.5 pl-4 pr-3 font-semibold">Field</th>
                    <th className="py-1.5 pr-3 font-semibold">Lives on</th>
                    <th className="py-1.5 pr-3 font-semibold">Asked</th>
                    <th className="py-1.5 pr-4 font-semibold">Holds a blasting day</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => (
                    <tr key={f.key} className="border-t border-gray-100" data-setup-field={f.key} data-setup-when={f.when} data-setup-gate={f.gate ? 'yes' : 'no'}>
                      <td className="py-2 pl-4 pr-3 font-medium whitespace-nowrap">{f.label}</td>
                      <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{LIVES_LABEL[f.lives]}</td>
                      <td className="py-2 pr-3">
                        {f.askable ? (
                          <span className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                            {(['setup', 'later', 'rare'] as SetupWhen[]).map((w) => (
                              <button
                                key={w}
                                type="button"
                                disabled={!online}
                                className={`px-2.5 py-1 text-xs ${f.when === w ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                                onClick={() => void writeSetupField(f.key, { when: w })}
                                data-setup-when-pick={w}
                              >
                                {WHEN_LABEL[w]}
                              </button>
                            ))}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500" data-setup-fixed>{f.fixed}{f.when === 'setup' && f.fixed !== 'Always asked' ? ' · at setup' : ''}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {f.gateable ? (
                          <button
                            type="button"
                            disabled={!online}
                            className={`rounded-full px-3 py-1 text-xs font-medium ${f.gate ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}
                            onClick={() => void writeSetupField(f.key, { gate: !f.gate })}
                            data-setup-gate-toggle
                          >
                            {f.gate ? 'Yes' : 'No'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <p className="text-xs text-gray-400">
        Try it: set Quote reference to At setup and the New job sheet asks for it on the job step; set Blasting permit to At setup and the site step asks for the number and expiry; turn Police on under Holds a blasting day and Start work waits for the police row on a blasting type. The town rows (fire chief, police, fire, town hall, hospital) are never typed at setup — they copy from another site in the same town, or Suggest finds them.
      </p>
    </div>
  );
}

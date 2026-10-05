// S26 push 2 — Admin › Company › Setup fields (Matthew: "adjust on the fly as
// they use the system"). One row per setup fact: where it lives, when it is
// asked, whether it gates a blasting day. Saved on the company settings doc;
// the wizard, the site form, the job's tiles and the gate read it at once.
import { db } from '@/db';
import { nowISO } from '@/lib/utils';
import { SETUP_FIELD_DEFAULTS, WHEN_LABEL, useSetupFields, type SetupWhen } from '@/lib/setupFields';

const SINGLETON = 'companySettings-singleton';

export function SetupFieldsSection({ online }: { online: boolean }) {
  const fields = useSetupFields();
  const write = async (key: string, patch: { when?: SetupWhen; gate?: boolean }) => {
    const cur = await db.companySettings.get(SINGLETON);
    const list = [...(cur?.setupFields ?? [])];
    const i = list.findIndex((s) => s.key === key);
    const def = SETUP_FIELD_DEFAULTS.find((d) => d.key === key)!;
    const next = { key, when: patch.when ?? list[i]?.when ?? def.when, gate: patch.gate ?? list[i]?.gate ?? def.gate };
    if (i >= 0) list[i] = next; else list.push(next);
    if (cur) await db.companySettings.update(SINGLETON, { setupFields: list, updatedAt: nowISO() });
  };
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" data-setup-fields>
      <div>
        <p className="font-medium text-sm">Setup fields</p>
        <p className="text-xs text-gray-400">What setting up a job asks for, where each fact lives, when it is asked, and whether a missing one holds a blasting day. Changes apply on every device at the next sync.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400">
              <th className="py-1 pr-3 font-semibold">Field</th>
              <th className="py-1 pr-3 font-semibold">Lives on</th>
              <th className="py-1 pr-3 font-semibold">Asked</th>
              <th className="py-1 font-semibold">Holds a blasting day</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.key} className="border-t border-gray-100" data-setup-field={f.key} data-setup-when={f.when} data-setup-gate={f.gate ? 'yes' : 'no'}>
                <td className="py-2 pr-3 font-medium">{f.label}</td>
                <td className="py-2 pr-3 text-gray-600">{f.lives}</td>
                <td className="py-2 pr-3">
                  {f.askable ? (
                    <span className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                      {(['setup', 'later', 'rare'] as SetupWhen[]).map((w) => (
                        <button
                          key={w}
                          type="button"
                          disabled={!online}
                          className={`px-2.5 py-1 text-xs ${f.when === w ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                          onClick={() => void write(f.key, { when: w })}
                          data-setup-when-pick={w}
                        >
                          {WHEN_LABEL[w]}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">{f.key === 'structures' ? 'On the shot map' : 'From the town, or Suggest'}</span>
                  )}
                </td>
                <td className="py-2">
                  {f.gateable ? (
                    <button
                      type="button"
                      disabled={!online}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${f.gate ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}
                      onClick={() => void write(f.key, { gate: !f.gate })}
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
      <p className="text-xs text-gray-400">Try it: set Customer PO to At setup and the New job sheet asks for it; set Blasting permit to At setup and the site step asks for the number and expiry.</p>
    </section>
  );
}

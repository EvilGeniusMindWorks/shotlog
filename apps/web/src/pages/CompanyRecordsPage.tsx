// Company-wide Records for admin/office/supervisor — first-class, top-level
// (not buried in the admin console). Two lenses (Round S4):
//   Records — the records manager: every document, filed or not, with the
//             tree, the columns, the drawer preview and bulk export (S21)
//   Audit   — the change history lens
// S21: the page fills the window; only the list scrolls. Export binder takes
// the node the office is on (a customer's year, one job, one day).
import { useRef, useState } from 'react';
import { RecordsManager, type RecordsScope } from '@/components/records/RecordsManager';
import { AuditLens } from '@/components/records/AuditLens';
import { BinderExport } from '@/components/records/BinderExport';
import { useFillHeight } from '@/components/records/useFillHeight';

const LENS_LABEL = { records: 'Records', audit: 'Audit' } as const;

export function CompanyRecordsPage() {
  const [lens, setLens] = useState<'records' | 'audit'>('records');
  const [scope, setScope] = useState<RecordsScope | undefined>(undefined);
  const ref = useRef<HTMLDivElement>(null);
  useFillHeight(ref);
  return (
    <div ref={ref} className="p-3 flex flex-col gap-2 min-h-0" data-records-page>
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <h2 className="text-xl font-bold text-gray-900 flex-1">Records</h2>
        {lens === 'records' && <BinderExport scope={scope} />}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          {(['records', 'audit'] as const).map((l) => (
            <button
              key={l}
              className={
                lens === l
                  ? 'px-3 py-1.5 text-sm font-medium bg-navy text-white'
                  : 'px-3 py-1.5 text-sm font-medium bg-white text-gray-600'
              }
              onClick={() => setLens(l)}
              data-records-lens={l}
            >
              {LENS_LABEL[l]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {lens === 'records' ? <RecordsManager scope="company" onScopeChange={setScope} /> : <div className="h-full overflow-y-auto"><AuditLens /></div>}
      </div>
    </div>
  );
}

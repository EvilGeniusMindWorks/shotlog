// Company-wide Records for admin/office/supervisor — first-class, top-level
// (not buried in the admin console). Two lenses (Round S4):
//   Records — the records manager: every document, filed or not, with
//             facets, preview, multi-select and bulk export (R-A)
//   Audit   — the change history lens
import { useState } from 'react';
import { RecordsManager } from '@/components/records/RecordsManager';
import { AuditLens } from '@/components/records/AuditLens';
import { BinderExport } from '@/components/records/BinderExport';

const LENS_LABEL = { records: 'Records', audit: 'Audit' } as const;

export function CompanyRecordsPage() {
  const [lens, setLens] = useState<'records' | 'audit'>('records');
  return (
    <div className="p-4 max-w-6xl mx-auto space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-gray-900 flex-1">Records</h2>
        {lens === 'records' && <BinderExport />}
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
      {lens === 'records' ? <RecordsManager scope="company" /> : <AuditLens />}
    </div>
  );
}

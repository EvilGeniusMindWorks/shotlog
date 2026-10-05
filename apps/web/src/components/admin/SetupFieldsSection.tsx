// S26 push 2 — Admin › Company › Setup fields (Matthew: "adjust on the fly as
// they use the system"). Push 3: the table grew to the whole sort and moved to
// its own page; this card on Company is the door to it, with the counts.
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useSetupFields } from '@/lib/setupFields';
import { setupFieldCounts } from '@/pages/admin/AdminSetupFieldsPage';

export function SetupFieldsSection() {
  const navigate = useNavigate();
  const fields = useSetupFields();
  const c = setupFieldCounts(fields);
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-2" data-setup-fields-card>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm">Setup fields</p>
          <p className="text-xs text-gray-400">What setting up a job asks for, where each fact lives, when it is asked, and whether a missing one holds a blasting day.</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-navy hover:bg-gray-50 whitespace-nowrap"
          onClick={() => navigate('/admin/company/setup-fields')}
          data-setup-fields-open
        >
          Open the table <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-gray-600" data-setup-fields-gist>
        {c.rows} fields · {c.atSetup} asked at setup · {c.gates} hold a blasting day{c.changed ? ` · ${c.changed} changed from the defaults` : ' · the defaults'}
      </p>
    </section>
  );
}

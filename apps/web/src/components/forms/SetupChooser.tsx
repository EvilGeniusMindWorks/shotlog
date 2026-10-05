// S26 (Matthew, Oct 5 2026, shape A): "Set up…" asks what you are setting up
// before it asks anything else. Four doors, each one step: a new customer
// (who they are, who to call), a new site for a customer you have (the
// ground), a new job at a site you have (the engagement), or all three in
// one pass for the one-customer, one-site, one-job day.
import { Building2, MapPin, Briefcase, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type SetupDoor = 'customer' | 'site' | 'job' | 'all';

export function SetupChooser({
  customerName,
  onPick,
  onClose,
}: {
  /** Opened from a customer's page: the customer door is gone, the others carry the name */
  customerName?: string;
  onPick: (door: SetupDoor) => void;
  onClose: () => void;
}) {
  const doors: { door: SetupDoor; icon: React.ReactNode; title: string; text: string }[] = [
    ...(customerName
      ? []
      : [{ door: 'customer' as const, icon: <Building2 className="h-5 w-5" />, title: 'A new customer', text: 'Just who they are and who to call. Sites and jobs come after.' }]),
    { door: 'site', icon: <MapPin className="h-5 w-5" />, title: customerName ? `A new site for ${customerName}` : 'A new site for a customer I have', text: 'An address with its town, map point and the town’s contact rows. The ground outlives the job.' },
    { door: 'job', icon: <Briefcase className="h-5 w-5" />, title: customerName ? `A new job at one of ${customerName}’s sites` : 'A new job at a site I have', text: 'Name, number, type of work, onsite contact. The site brings everything else.' },
    ...(customerName
      ? []
      : [{ door: 'all' as const, icon: <Layers className="h-5 w-5" />, title: 'A brand-new customer, site and job', text: 'All three in one pass, top-down. For the one-customer, one-site, one-job day.' }]),
  ];
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={onClose} data-setup-chooser>
      <div className="w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-xl shadow-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-bold text-gray-900">What are you setting up?</p>
        <div className="space-y-2">
          {doors.map((d) => (
            <button
              key={d.door}
              type="button"
              className="w-full text-left rounded-xl border border-gray-200 hover:bg-gray-50 active:bg-gray-100 px-3 py-3 flex items-start gap-3 min-h-[64px]"
              onClick={() => onPick(d.door)}
              data-setup-door={d.door}
            >
              <span className="text-navy mt-0.5 shrink-0">{d.icon}</span>
              <span className="min-w-0">
                <span className="block font-semibold text-sm">{d.title}</span>
                <span className="block text-xs text-gray-600">{d.text}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose} data-setup-close>Close</Button>
        </div>
      </div>
    </div>
  );
}

// Jobs that lack a customer or a site (Round S11, Sep 13 2026). The rule is
// "a job always has both"; the record type still allows a gap for jobs from
// before the hierarchy, so Admin can see any straggler and fix it from the
// job page ("Move to another site…"). Matthew asked to see for himself that
// Beta has none after the tidy.
import { Link } from 'react-router-dom';
import { useLiveQuery, db } from '@/db';

export function JobsMissingLinks() {
  const jobs = useLiveQuery(async () => {
    const all = await db.jobs.toArray();
    const out: { id: string; name: string; missing: string; ghost: boolean }[] = [];
    for (const j of all) {
      const site = j.siteId ? await db.sites.get(j.siteId) : undefined;
      const customer = j.customerId ? await db.customers.get(j.customerId) : undefined;
      const missing = [
        !j.customerId ? 'no customer link' : !customer ? 'customer missing' : !customer.name.trim() ? 'customer has no name' : '',
        !j.siteId ? 'no site link' : !site ? 'site missing' : !site.name.trim() && !site.address.trim() ? 'site has no name' : '',
      ].filter(Boolean);
      if (missing.length) out.push({ id: j.id, name: j.name, missing: missing.join(', '), ghost: missing.some((m) => m.includes('no name')) });
    }
    return out;
  });
  if (!jobs) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-1" data-jobs-missing-links={jobs.length}>
      <p className="text-sm font-semibold">Jobs missing a customer or site · {jobs.length}</p>
      {jobs.length === 0 ? (
        <p className="text-xs text-gray-400">None. Every job in this company has a real customer and a real site.</p>
      ) : (
        <ul className="text-sm space-y-1">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-2 flex-wrap">
              <Link to={`/jobs/${j.id}`} className="underline underline-offset-2 text-navy">
                {j.name}
              </Link>
              <span className="text-xs text-gray-500">{j.missing}</span>
              <span className="text-xs text-gray-400">→ open it and use "Move to another site…"</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

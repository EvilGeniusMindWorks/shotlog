// Compliance badges are ADVISORY until a blasting engineer signs off the
// USBM RI 8507 curve as implemented here (docs/usbm-curve-signoff.md).
// Matthew's decision D2, 2026-09-09: show it everywhere a badge appears, on
// screen and on the PDF, until the sign-off lands — then flip the flag.
export const COMPLIANCE_ADVISORY = true;

export const ADVISORY_SHORT = 'advisory';
export const ADVISORY_LINE =
  'Advisory — the USBM RI 8507 / OSM check as implemented here is awaiting a blasting engineer’s sign-off. Treat the badge as a guide, not a ruling.';

/** The little grey pill beside a compliance badge */
export function AdvisoryTag({ className = '' }: { className?: string }) {
  if (!COMPLIANCE_ADVISORY) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border border-gray-300 bg-white px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-gray-500 ${className}`}
      title={ADVISORY_LINE}
      data-compliance-advisory
    >
      {ADVISORY_SHORT}
    </span>
  );
}

/** One explanatory line for sheets and print */
export function AdvisoryNote({ className = '' }: { className?: string }) {
  if (!COMPLIANCE_ADVISORY) return null;
  return (
    <p className={`text-xs text-gray-500 ${className}`} data-compliance-advisory-note>
      {ADVISORY_LINE}
    </p>
  );
}

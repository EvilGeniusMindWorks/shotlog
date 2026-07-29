// Text-native (searchable) PDF builders — one per filed document type.
// Import this module DYNAMICALLY (`await import('@/pdfdocs')`) so the
// @react-pdf/renderer chunk stays out of the initial bundle; the service
// worker still precaches it, so offline filing keeps working.
export { buildChecklistPdf } from './checklist';
export { buildDrillLogPdf } from './drillLog';
export { buildIncidentPdf } from './incident';
export { buildDailyReportPdf } from './dailyReport';
export { buildBlastLogPdf } from './blastLog';

/** Download a built PDF blob with a filename (Save PDF buttons). */
export function downloadPdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

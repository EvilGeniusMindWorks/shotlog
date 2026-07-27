import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Rasterize every `.page` element into a letter-size jsPDF document.
 * Pages render at 2× for print-quality output; tall pages scale to fit
 * within the printable area.
 */
async function renderPagesToPdf(): Promise<jsPDF> {
  const pages = document.querySelectorAll<HTMLElement>('.page');
  if (pages.length === 0) throw new Error('nothing to export');

  const pdf = new jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' });
  const margin = 0.4;
  const printableW = 8.5 - margin * 2;
  const printableH = 11 - margin * 2;

  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });
    const ratio = canvas.height / canvas.width;
    let w = printableW;
    let h = w * ratio;
    if (h > printableH) {
      h = printableH;
      w = h / ratio;
    }
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, w, h);
  }

  return pdf;
}

/** Render the current `.page` elements to a PDF and download it. */
export async function savePagesAsPdf(filename: string): Promise<void> {
  (await renderPagesToPdf()).save(filename);
}

/** Render the current `.page` elements to a PDF Blob (the archive path). */
export async function pagesToPdfBlob(): Promise<Blob> {
  return (await renderPagesToPdf()).output('blob');
}

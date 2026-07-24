import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Render every `.page` element into a letter-size PDF and download it.
 * Pages are rasterized at 2× for print-quality output; tall pages scale
 * to fit within the printable area.
 */
export async function savePagesAsPdf(filename: string): Promise<void> {
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

  pdf.save(filename);
}

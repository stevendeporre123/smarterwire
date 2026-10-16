// Echte PDF genereren in de browser (geen afdrukvenster): elke pagina is een SVG in mm (A4 liggend) en wordt als vector in het PDF-bestand gezet.
// jsPDF en svg2pdf.js worden pas geladen als je effectief een PDF maakt.

const PAGE_W = 297, PAGE_H = 210;

/** Afbeeldingen (foto's op het plan, logo's) inlijnen als verkleinde JPEG-data-URL, zodat svg2pdf ze zonder extra netwerkverkeer kan insluiten. */
async function inlineImages(svg: string, cache: Map<string, Promise<string>>): Promise<string> {
  const urls = [...new Set([...svg.matchAll(/<image\b[^>]*?\bhref="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:')))];
  for (const u of urls) {
    if (!cache.has(u)) cache.set(u, toDataUrl(u));
    svg = svg.split(`href="${u}"`).join(`href="${await cache.get(u)}"`);
  }
  return svg;
}

async function toDataUrl(url: string, maxPx = 1800): Promise<string> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

/** Zet SVG-pagina's (A4 liggend, 297 × 210 mm) om naar één PDF-bestand. */
export async function pagesToPdf(pages: string[], opts: { title?: string } = {}): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  if (opts.title) doc.setProperties({ title: opts.title, creator: 'smarterwire' });
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:297mm;height:210mm;overflow:hidden';
  document.body.append(host);
  const cache = new Map<string, Promise<string>>();
  try {
    for (let i = 0; i < pages.length; i++) {
      // jsPDF kent enkel normaal en vet (400/700): 500-600 wordt vet
      host.innerHTML = (await inlineImages(pages[i], cache)).replace(/font-weight(="|:\s*)[56]00/g, 'font-weight$1700');
      const el = host.querySelector('svg');
      if (!el) continue;
      if (i) doc.addPage('a4', 'landscape');
      await svg2pdf(el, doc, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    }
  } finally { host.remove(); }
  return doc.output('blob');
}

export const pdfFileName = (project: string, part: string) =>
  `${(project || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'}-${new Date().toISOString().slice(0, 10)}-${part}.pdf`;

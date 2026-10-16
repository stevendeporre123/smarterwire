// Echt PDF-bestand maken van de voorbeeldpagina's: npx vite --config tools/vite.test.config.ts → /tools/pdf-file-test.html
import './pdf-test';
import { pagesToPdf } from '../src/lib/pdf';

const out = document.getElementById('result')!;
try {
  const pages = [...document.querySelectorAll('.pdf-page')].map((s) => s.innerHTML);
  const t0 = performance.now();
  const blob = await pagesToPdf(pages, { title: 'test' });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = new TextDecoder('latin1').decode(bytes);
  const n = (text.match(/\/Type\s*\/Page\b/g) ?? []).length;
  const mb = (bytes.length / 1048576).toFixed(2);
  out.textContent = `PDF-test: ${text.startsWith('%PDF') ? 'OK' : 'GEEN PDF'} · ${pages.length} pagina's in, ${n} in PDF · ${mb} MB · ${Math.round(performance.now() - t0)} ms · /Image: ${(text.match(/\/Subtype\s*\/Image/g) ?? []).length}`;
  console.log(out.textContent);
  // download-link om het resultaat te bekijken
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'test.pdf'; a.textContent = ' [download]'; out.append(a);
  (window as any).__pdf = bytes;
} catch (e: any) { out.textContent = 'FOUT: ' + (e?.stack ?? e); console.log(out.textContent); }

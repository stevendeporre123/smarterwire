// Handmatige test: npx vite  →  http://localhost:5173/tools/plan-test.html
import { CATALOG, areiSymbol, areiSize, symbolEntry } from '../src/domain/areisymbols';
const k = 6; let out = '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="560" style="background:#fff">';
// muur + stopcontacten met staart op de muur, 4 richtingen
out += '<rect x="60" y="40" width="22" height="260" fill="#999"/><rect x="60" y="40" width="300" height="22" fill="#999"/><rect x="338" y="40" width="22" height="260" fill="#999"/><rect x="60" y="278" width="300" height="22" fill="#999"/>';
const e = symbolEntry('stopcontact')!, e2 = symbolEntry('Stopcontact met tweepolige schakelaar')!;
out += areiSymbol(e.planFile, 82, 120, k, 0, e.anchor, 2.2) + areiSymbol(e.planFile, 338, 200, k, 180, e.anchor, 2.2)
  + areiSymbol(e.planFile, 200, 62, k, 90, e.anchor, 2.2) + areiSymbol(e.planFile, 200, 278, k, -90, e.anchor, 2.2)
  + areiSymbol(e2.planFile, 82, 230, k, 0, e2.anchor, 2.2);
out += '<circle cx="82" cy="120" r="3" fill="red"/><circle cx="338" cy="200" r="3" fill="red"/><circle cx="82" cy="230" r="3" fill="red"/>';
// catalogus
let x = 420, y = 30, rowH = 0; const g = new Map<string, number>();
for (const c of CATALOG) {
  const s = areiSize(c.planFile)!, w = s.w * 3 + 10, h = s.h * 3;
  if (x + 110 > 1390) { x = 420; y += 62; }
  out += areiSymbol(c.planFile, x + 20, y + 22, 3, 0, { x: 0.5, y: 0.5 }, 1.6) + `<text x="${x}" y="${y + 52}" font-size="8">${c.label.slice(0, 22)}</text>`; x += 112;
  g.set(c.group, (g.get(c.group) ?? 0) + 1); void w; void h; void rowH;
}
out += `<text x="420" y="14" font-size="11" font-weight="700">${CATALOG.length} symbolen: ${[...g].map(([a, b]) => a + ' ' + b).join(', ')}</text></svg>`;
document.getElementById('o')!.innerHTML = out;

// AREI-symbolen uit symbols/<categorie>/<naam>.svg, klaar om in een ander SVG te nesten (eendraadschema, situatieplan).
const raw = import.meta.glob(['../../symbols/*/*.svg', '!../../symbols/modules/*.svg'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

interface Parsed { id: number; w: number; h: number; css: string; body: string; rootClass: string }
const byName = new Map<string, Parsed>();
let n = 0;
for (const [path, text] of Object.entries(raw)) {
  const name = path.split('/').pop()!.replace(/\.svg$/, '');
  const vb = text.match(/viewBox="([\d.\- ]+)"/)?.[1].split(/\s+/).map(Number);
  if (!vb) continue;
  const id = ++n;
  // klassen per symbool uniek maken, anders botsen .st1 van verschillende bestanden
  const css = (text.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\.st(\d+)/g, `.a${id}s$1`);
  const body = text.slice(text.indexOf('</style>') + 8, text.lastIndexOf('</svg>'))
    .replace(/<title>[\s\S]*?<\/title>/g, '').replace(/class="st(\d+)"/g, `class="a${id}s$1"`).replace(/ id="[^"]*"/g, '');
  const rc = text.match(/<svg[^>]*class="st(\d+)"/)?.[1];
  byName.set(name, { id, w: vb[2], h: vb[3], css, body, rootClass: rc ? `a${id}s${rc}` : '' });
}

export const hasAreiSymbol = (name: string) => byName.has(name);
export const areiSize = (name: string) => { const p = byName.get(name); return p ? { w: p.w, h: p.h } : null; };

/**
 * Symbool als SVG-fragment, gecentreerd op (cx, cy), `scale` keer vergroot, optioneel gedraaid.
 * Lijnen blijven even dun als in het origineel × scale; geef `stroke` mee om ze dikker te maken.
 */
export function areiSymbol(name: string, cx: number, cy: number, scale = 2.5, rot = 0): string {
  const p = byName.get(name);
  if (!p) return '';
  const w = p.w * scale, h = p.h * scale;
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) translate(${-w / 2} ${-h / 2})"><svg width="${w}" height="${h}" viewBox="0 0 ${p.w} ${p.h}" class="${p.rootClass}" overflow="visible"><style>${p.css}</style>${p.body}</svg></g>`;
}

/** Onze symbool-id's (situatieplan) → AREI-bestand voor het ééndraadsschema. */
export const SCHEMA_SYMBOL: Record<string, string> = {
  lichtpunt: 'Verlichtingstoestel', lichtpunt_wand: 'Wandverlichtingstoestel', tl: 'Fluorescentiearmatuur', noodverlichting: 'Autonoom noodverlichtingstoestel',
  schakelaar: 'Schakelaar algemeen symbool', wissel: 'Enkelpolige wisselschakelaar', kruis: 'Kruisschakelaar', drukknop: 'Drukknop', dimmer: 'Dimmer',
  stopcontact: 'Stopcontact', stopcontact2: 'Stopcontact', stopcontact_ik: 'Stopcontact waterdicht', stopcontact_3p: 'Stopcontact',
  bel: 'Bel', verdeelbord: 'Verdeelkast', kookplaat: 'Kookfornuis voor éénsdraadsschema', boiler: 'Boiler', motor: 'Motor', verwarming: 'Verwarmingstoestel',
  aansluitdoos: 'Aftakdoos', meter: 'kWh-teller',
};

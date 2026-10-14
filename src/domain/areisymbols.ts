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
 * Symbool als SVG-fragment. (cx, cy) is het ankerpunt: standaard het midden van het symbool,
 * voor stopcontacten het uiteinde van de staart (dat tegen de muur komt). `weight` maakt de lijnen dikker.
 */
export function areiSymbol(name: string, cx: number, cy: number, scale = 2.5, rot = 0, anchor = { x: 0.5, y: 0.5 }, weight = 1): string {
  const p = byName.get(name);
  if (!p) return '';
  const w = p.w * scale, h = p.h * scale;
  const css = weight === 1 ? p.css : p.css.replace(/stroke-width:([\d.]+)/g, (_, v) => `stroke-width:${(+v * weight).toFixed(3)}`);
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) translate(${-w * anchor.x} ${-h * anchor.y})"><svg width="${w}" height="${h}" viewBox="0 0 ${p.w} ${p.h}" class="${p.rootClass}" overflow="visible"><style>${css}</style>${p.body}</svg></g>`;
}

// ---- catalogus: elk symbool met een variant voor het situatieplan en/of ééndraadschema ----
export interface SymbolEntry { id: string; label: string; group: string; planFile: string; schemaFile: string; anchor: { x: number; y: number } }
const GROUP_ORDER = ['Stopcontacten', 'Schakelaars', 'Verbruikstoestellen', 'Elektrische Toestellen', 'Beschermingstoestellen', 'Zonnepanelen (≠AREI)'];
const SKIP_GROUPS = new Set(['Elektrische Leidingen', 'Algemeenheden']);
const PLAN_SUF = ' voor situatieschema', SCHEMA_SUF = [' voor ééndraadsschema', ' voor éénsdraadsschema'];
/** Stopcontacten: de staart (die tegen de muur komt) is het ankerpunt. Bij de tweepolige varianten zit die op 40% van de breedte. */
const tailAnchor = (file: string) => ({ x: /tweepolige/.test(file) ? 0.4 : 0, y: 0.5 });

export const CATALOG: SymbolEntry[] = (() => {
  const group = new Map<string, string>();
  for (const path of Object.keys(raw)) group.set(path.split('/').pop()!.replace(/\.svg$/, ''), path.split('/').slice(-2)[0]);
  const out: SymbolEntry[] = [];
  for (const [name, g] of group) {
    if (SKIP_GROUPS.has(g) || name.endsWith(PLAN_SUF) || SCHEMA_SUF.some((x) => name.endsWith(x))) continue;
    const plan = group.has(name + PLAN_SUF) ? name + PLAN_SUF : name;
    const schema = SCHEMA_SUF.map((x) => name + x).find((x) => group.has(x)) ?? name;
    out.push({ id: name, label: name, group: g, planFile: plan, schemaFile: schema, anchor: g === 'Stopcontacten' && plan.endsWith(PLAN_SUF) ? tailAnchor(plan) : { x: 0.5, y: 0.5 } });
  }
  return out.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.label.length - b.label.length || a.label.localeCompare(b.label, 'nl'));
})();

/** Oude (zelfgetekende) symbool-id's in bestaande projecten → AREI-symbool. */
const LEGACY: Record<string, string> = {
  lichtpunt: 'Verlichtingstoestel', lichtpunt_wand: 'Wandverlichtingstoestel', tl: 'Fluorescentiearmatuur', noodverlichting: 'Autonoom noodverlichtingstoestel',
  schakelaar: 'Schakelaar algemeen symbool', wissel: 'Enkelpolige wisselschakelaar', kruis: 'Kruisschakelaar', drukknop: 'Drukknop', dimmer: 'Dimmer',
  stopcontact: 'Stopcontact', stopcontact2: 'Stopcontact', stopcontact_ik: 'Stopcontact waterdicht', stopcontact_3p: 'Stopcontact',
  bel: 'Bel', verdeelbord: 'Verdeelkast', kookplaat: 'Kookfornuis', boiler: 'Boiler', motor: 'Motor', verwarming: 'Verwarmingstoestel',
  aansluitdoos: 'Aftakdoos', meter: 'kWh-teller',
};
const entryById = new Map(CATALOG.map((e) => [e.id, e]));
export const symbolEntry = (type: string): SymbolEntry | undefined => entryById.get(LEGACY[type] ?? type);

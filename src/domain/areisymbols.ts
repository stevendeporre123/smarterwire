// AREI-symbolen uit symbols/<categorie>/<naam>.svg, klaar om in een ander SVG te nesten (eendraadschema, situatieplan).
const raw = import.meta.glob(['../../symbols/*/*.svg', '!../../symbols/modules/*.svg'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

interface Parsed { id: number; w: number; h: number; css: string; body: string; rootClass: string }
const byName = new Map<string, Parsed>();
let counter = 0;
for (const [path, text] of Object.entries(raw)) {
  const name = path.split('/').pop()!.replace(/\.svg$/, '');
  const vb = text.match(/viewBox="([\d.\- ]+)"/)?.[1].split(/\s+/).map(Number);
  if (!vb) continue;
  const id = ++counter;
  // klassen per symbool uniek maken, anders botsen .st1 van verschillende bestanden
  const css = (text.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\.st(\d+)/g, `.a${id}s$1`);
  const body = text.slice(text.indexOf('</style>') + 8, text.lastIndexOf('</svg>'))
    .replace(/<title>[\s\S]*?<\/title>/g, '').replace(/class="st(\d+)"/g, `class="a${id}s$1"`).replace(/ id="[^"]*"/g, '');
  const rc = text.match(/<svg[^>]*class="st(\d+)"/)?.[1];
  byName.set(name, { id, w: vb[2], h: vb[3], css, body, rootClass: rc ? `a${id}s${rc}` : '' });
}

export const hasAreiSymbol = (name: string) => byName.has(name);
export const areiSize = (name: string) => { const p = byName.get(name); return p ? { w: p.w, h: p.h } : null; };

/** Eén geneste <svg> van een AREI-bestand, op positie (ox, oy). `color` vervangt het zwart, `weight` maakt de lijnen dikker. */
function nested(p: Parsed, scale: number, weight: number, color: string, ox = 0, oy = 0) {
  let css = p.css;
  if (weight !== 1) css = css.replace(/stroke-width:([\d.]+)/g, (_, v) => `stroke-width:${(+v * weight).toFixed(3)}`);
  if (color !== '#000000') css = css.replace(/#000000/gi, color);
  return `<svg x="${ox}" y="${oy}" width="${p.w * scale}" height="${p.h * scale}" viewBox="0 0 ${p.w} ${p.h}" class="${p.rootClass}" overflow="visible"><style>${css}</style>${p.body}</svg>`;
}

/**
 * Symbool als SVG-fragment. (cx, cy) is het ankerpunt: standaard het midden van het symbool,
 * voor stopcontacten het uiteinde van de staart (dat tegen de muur komt).
 */
export function areiSymbol(name: string, cx: number, cy: number, scale = 2.5, rot = 0, anchor = { x: 0.5, y: 0.5 }, weight = 1, color = '#000000'): string {
  const p = byName.get(name);
  if (!p) return '';
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) translate(${-p.w * scale * anchor.x} ${-p.h * scale * anchor.y})">${nested(p, scale, weight, color)}</g>`;
}

// ---- catalogus ----
export type Multi = 'socket' | 'switch';
export interface SymbolEntry { id: string; label: string; group: string; func: string; planFile: string; schemaFile: string; anchor: { x: number; y: number }; multi?: Multi }

/** Functionele blokken in het palet (i.p.v. de mappen van de AREI-set). */
export const FUNC_ORDER = ['Stopcontacten', 'Schakelaars', 'Verlichting', 'Toestellen', 'Domotica & regeling', 'Signalisatie & deur', 'Kasten & dozen', 'Zonne-energie'];
const FUNC_BY_NAME: [RegExp, string][] = [
  [/^(Minuterie|Schakelklok|Thermostaat|Rondecontrole)/, 'Domotica & regeling'],
  [/^(Bel|Zoemer|Hoorn|Sirène|Horloge|Moederklok|Elektrisch deurslot)$/, 'Signalisatie & deur'],
  [/^(Verlichtingstoestel|Wandverlichtingstoestel|Fluorescentiearmatuur|Autonoom noodverlichting|Noodverlichting|Verlichtingsarmatuur|Projector)/, 'Verlichting'],
  [/^(Aardingsstrip|Aftakdoos|Aftakkast|Inbouwdoos|Verdeelkast)$/, 'Kasten & dozen'],
];
const FUNC_BY_FOLDER: Record<string, string> = { Stopcontacten: 'Stopcontacten', Schakelaars: 'Schakelaars', Verbruikstoestellen: 'Toestellen', 'Elektrische Toestellen': 'Kasten & dozen', Beschermingstoestellen: 'Beschermingen', 'Zonnepanelen (≠AREI)': 'Zonne-energie' };
const funcOf = (name: string, folder: string) => FUNC_BY_NAME.find(([re]) => re.test(name))?.[1] ?? FUNC_BY_FOLDER[folder] ?? folder;

const SKIP_GROUPS = new Set(['Elektrische Leidingen', 'Algemeenheden']);
const PLAN_SUF = ' voor situatieschema', SCHEMA_SUF = [' voor ééndraadsschema', ' voor éénsdraadsschema'];
/** Stopcontacten: de staart (die tegen de muur komt) is het ankerpunt. Bij de tweepolige varianten zit die op 40% van de breedte. */
const tailAnchor = (file: string) => ({ x: /tweepolige/.test(file) ? 0.4 : 0, y: 0.5 });
/** Schakelaars waarvan we meervoudige varianten genereren (de hendels waaieren uit over één cirkel). */
const MULTI_SWITCH = new Set(['Schakelaar algemeen symbool', 'Tweepolige schakelaar']);

export const CATALOG: SymbolEntry[] = (() => {
  const group = new Map<string, string>();
  for (const path of Object.keys(raw)) group.set(path.split('/').pop()!.replace(/\.svg$/, ''), path.split('/').slice(-2)[0]);
  const out: SymbolEntry[] = [];
  for (const [name, g] of group) {
    if (SKIP_GROUPS.has(g) || name.endsWith(PLAN_SUF) || SCHEMA_SUF.some((x) => name.endsWith(x))) continue;
    const plan = group.has(name + PLAN_SUF) ? name + PLAN_SUF : name;
    const schema = SCHEMA_SUF.map((x) => name + x).find((x) => group.has(x)) ?? name;
    const tail = g === 'Stopcontacten' && plan.endsWith(PLAN_SUF);
    out.push({ id: name, label: name, group: g, func: funcOf(name, g), planFile: plan, schemaFile: schema, anchor: tail ? tailAnchor(plan) : { x: 0.5, y: 0.5 },
      multi: tail && !/transfo/.test(name) ? 'socket' : MULTI_SWITCH.has(name) ? 'switch' : undefined });
  }
  return out.sort((a, b) => FUNC_ORDER.indexOf(a.func) - FUNC_ORDER.indexOf(b.func) || a.label.length - b.label.length || a.label.localeCompare(b.label, 'nl'));
})();

/** Oude (zelfgetekende) symbool-id's in bestaande projecten → AREI-symbool. */
const LEGACY: Record<string, string> = {
  lichtpunt: 'Verlichtingstoestel', lichtpunt_wand: 'Wandverlichtingstoestel', tl: 'Fluorescentiearmatuur', noodverlichting: 'Autonoom noodverlichtingstoestel',
  schakelaar: 'Schakelaar algemeen symbool', wissel: 'Enkelpolige wisselschakelaar', kruis: 'Kruisschakelaar', drukknop: 'Drukknop', dimmer: 'Dimmer',
  stopcontact: 'Stopcontact', stopcontact2: 'Stopcontact#2', stopcontact_ik: 'Stopcontact waterdicht', stopcontact_3p: 'Stopcontact#3',
  bel: 'Bel', verdeelbord: 'Verdeelkast', kookplaat: 'Kookfornuis', boiler: 'Boiler', motor: 'Motor', verwarming: 'Verwarmingstoestel',
  aansluitdoos: 'Aftakdoos', meter: 'kWh-teller',
};
const entryById = new Map(CATALOG.map((e) => [e.id, e]));

/** Opgeslagen type = "<id>" of "<id>#<aantal>" (2 tot 4) voor meervoudige stopcontacten en schakelaars. */
export const splitType = (type: string): { id: string; n: number } => {
  const t = LEGACY[type] ?? type, m = t.match(/^(.*)#(\d)$/);
  return m ? { id: m[1], n: Math.max(1, Math.min(4, Number(m[2]))) } : { id: t, n: 1 };
};
export const joinType = (id: string, n: number) => (n > 1 ? `${id}#${n}` : id);
export const symbolEntry = (type: string): SymbolEntry | undefined => entryById.get(splitType(type).id);
export const symbolCount = (type: string) => { const e = symbolEntry(type); return e?.multi ? splitType(type).n : 1; };

// ---- meervoudige varianten ----
interface Geom { w: number; h: number; anchor: { x: number; y: number } }
type Mode = 'plan' | 'schema';

/** Schakelaar met n hendels die uitwaaieren over één cirkel (n = 1 gebruikt het AREI-bestand zelf). */
function genSwitch(n: number, tick: boolean, weight: number, color: string) {
  const R = 2.83465, L = 10.8, sw = 0.24 * weight;
  const angles = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * (n === 2 ? 42 : n === 3 ? 32 : 26));
  const rad = (d: number) => (d * Math.PI) / 180;
  const levers = angles.map((a) => {
    const s = Math.sin(rad(a)), c = Math.cos(rad(a));
    const from = { x: R * s, y: -R * c }, tip = { x: L * s, y: -L * c };
    return { from, tip, tick: tick ? { x: tip.x + 2.1 * c, y: tip.y + 2.1 * s } : null };
  });
  const xs = [-R, R, ...levers.flatMap((l) => [l.tip.x, l.tick?.x ?? l.tip.x])], ys = [-L, R, ...levers.flatMap((l) => [l.tip.y, l.tick?.y ?? l.tip.y])];
  const x0 = Math.min(...xs) - 0.3, y0 = Math.min(...ys) - 0.3, w = Math.max(...xs) + 0.3 - x0, h = Math.max(...ys) + 0.3 - y0;
  const body = `<circle cx="0" cy="0" r="${R}" fill="#fff" stroke="${color}" stroke-width="${sw}"/>` + levers.map((l) =>
    `<path d="M${l.from.x.toFixed(2)} ${l.from.y.toFixed(2)} L${l.tip.x.toFixed(2)} ${l.tip.y.toFixed(2)}${l.tick ? ` L${l.tick.x.toFixed(2)} ${l.tick.y.toFixed(2)}` : ''}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return { w, h, vb: `${x0.toFixed(2)} ${y0.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`, body };
}

export function symbolGeom(type: string, mode: Mode): Geom | null {
  const { id, n } = splitType(type), e = entryById.get(id); if (!e) return null;
  const p = byName.get(mode === 'plan' ? e.planFile : e.schemaFile); if (!p) return null;
  if (e.multi === 'socket' && n > 1) return mode === 'plan' ? { w: p.w, h: p.h + (n - 1) * p.h * 0.92, anchor: e.anchor } : { w: p.w * n, h: p.h, anchor: { x: 0.5, y: 0.5 } };
  if (e.multi === 'switch' && n > 1) { const g = genSwitch(n, id === 'Tweepolige schakelaar', 1, '#000'); return { w: g.w, h: g.h, anchor: { x: 0.5, y: 0.5 } }; }
  return { w: p.w, h: p.h, anchor: mode === 'plan' ? e.anchor : { x: 0.5, y: 0.5 } };
}

/** Symbool (ook meervoudig) op (cx, cy): ankerpunt volgens symbolGeom. `scale` = px per tekeneenheid van het AREI-bestand. */
export function symbolMarkup(type: string, mode: Mode, cx: number, cy: number, scale: number, rot = 0, weight = 1, color = '#000000'): string {
  const { id, n } = splitType(type), e = entryById.get(id), g = symbolGeom(type, mode);
  if (!e || !g) return '';
  const p = byName.get(mode === 'plan' ? e.planFile : e.schemaFile)!;
  const T = `translate(${cx} ${cy}) rotate(${rot}) translate(${-g.w * scale * g.anchor.x} ${-g.h * scale * g.anchor.y})`;
  if (e.multi === 'switch' && n > 1) {
    const s = genSwitch(n, id === 'Tweepolige schakelaar', weight, color);
    return `<g transform="${T}"><svg width="${g.w * scale}" height="${g.h * scale}" viewBox="${s.vb}" overflow="visible">${s.body}</svg></g>`;
  }
  if (e.multi === 'socket' && n > 1) {
    if (mode === 'schema') return `<g transform="${T}">${Array.from({ length: n }, (_, k) => nested(p, scale, weight, color, k * p.w * scale, 0)).join('')}</g>`;
    const pitch = p.h * 0.92, mid = (p.h + (n - 1) * pitch) / 2, x0 = p.w * e.anchor.x * scale;
    const copies = Array.from({ length: n }, (_, k) => nested(p, scale, weight, color, 0, k * pitch * scale)).join('');
    const bar = `<path d="M${x0} ${(p.h / 2) * scale} V${((n - 1) * pitch + p.h / 2) * scale}" stroke="${color}" stroke-width="${0.24 * weight * scale}" fill="none" stroke-linecap="round"/>`;
    void mid;
    return `<g transform="${T}">${copies}${bar}</g>`;
  }
  return areiSymbol(mode === 'plan' ? e.planFile : e.schemaFile, cx, cy, scale, rot, g.anchor, weight, color);
}

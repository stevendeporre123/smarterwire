import type { Board, Circuit, Device } from './model';
import { cableLabel, deviceTitle, isGroupParent, isFeeder, polesLabel, supplyLabel, isThreePhase, type Supply } from './devices';
import { symbolGeom, symbolMarkup, areiSymbol, isApplianceType } from './areisymbols';
import { esc } from '../lib/dom';

export interface DiagramBoard { board: Board; devices: Device[] }
export interface DiagramResult {
  svg: string; width: number; height: number;
  /** plaatsen waar het schema netjes kan worden afgebroken (einde van een kring of groep); `hard` = einde van een kast */
  cuts: { x: number; hard: boolean; depth: number }[];
}
/** Eén onderdeel op een kring (symbool van het plan of handmatig toegevoegd). `order` bepaalt de volgorde binnen de kring. */
export interface DiagramSymbol { id?: string; src?: 'plan' | 'manual'; order?: number; grp?: string | null; circuit_id?: string | null; type: string; label?: string | null; n?: number }

// ---- maten (px) ----
const SP = 120;        // minimale breedte van één kring
const LX = 40;         // afstand van de linkerrand van de kolom tot de kringlijn
const SPD_W = 70;
const STUB_W = 44;     // ruimte tussen een differentieel-stub en de eerste kring van zijn bus
const STEP = 150;      // hoogteverschil tussen een bus en zijn onderliggende bus
const BUS_PAD = 22;
const BREAKER_TOP = 40; // hoogte van de beveiliging boven de bus
const CABLE_TOP = 205;  // vanaf hier beginnen de verbruikers (daaronder: beveiliging, kabelsymbolen en kabeltekst)
const ROW = 44;         // hoogte per rij met verbruikers
const NAME_LEN = 110;

type Item =
  | { t: 'circuit'; d: Device; x: number; cs: Circuit[]; end: number; w: number }
  | { t: 'spd'; d: Device; x: number; end: number }
  | { t: 'child'; d: Device; stubX: number; bus: Bus; end: number };
interface Bus { head: Device | null; items: Item[]; level: number; x0: number; x1: number }
interface Block { board: Board; bus: Bus; fedBy?: Circuit; fedFrom?: Board; x0: number; x1: number }

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const byPos = (a: Device, b: Device) => a.row_no - b.row_no || a.pos - b.pos;

/** Tekst die van beneden naar boven leest, beginnend op (x,y). */
const vtext = (x: number, y: number, s: string, cls: string, anchor: 'start' | 'end' | 'middle' = 'start') =>
  `<text transform="translate(${x} ${y}) rotate(-90)" class="${cls}" text-anchor="${anchor}">${esc(s)}</text>`;

/** Beveiligingssymbool op een verticale lijn: contact onderaan, schuin mes, daarboven gaat de lijn verder. */
function breakerSymbol(x: number, y: number, kind: 'automaat' | 'diff' | 'schakelaar'): string {
  const p = [`<path d="M${x} ${y} V${y - 10}" class="ln"/>`, `<path d="M${x} ${y - 10} L${x + 11} ${y - 32}" class="ln"/>`, `<path d="M${x} ${y - 36} V${y - 46}" class="ln"/>`];
  if (kind === 'automaat') p.push(`<path d="M${x + 5} ${y - 34} l8 4" class="ln"/>`);
  if (kind === 'diff') p.push(`<path d="M${x + 4} ${y - 34} l9 5" class="ln"/>`, `<path d="M${x - 6} ${y - 36} H${x + 6}" class="ln-thick"/>`);
  if (kind === 'schakelaar') p.push(`<path d="M${x + 5} ${y - 34} l8 4" class="ln"/>`);
  return p.join('');
}

export function buildDiagram(opts: {
  title: string; boards: DiagramBoard[]; circuits: Circuit[]; symbols: DiagramSymbol[]; which: 'bestaand' | 'nieuw';
  supply: Supply; meta?: string[]; ean?: string | null;
  /** voedingskabel naar de hoofdbeveiliging, bv. "XVB Cca 4x10" */
  supplyCable?: string | null;
  /** alleen het deel tussen x0 en x1 (voor PDF-pagina's); zonder titel, legende en gegevens */
  crop?: [number, number];
  /** kring die in het schema is geselecteerd (krijgt een lichte achtergrond) */
  selCircuit?: string | null;
  /** geselecteerd toestel (differentieel, hoofdschakelaar, overspanning) en geselecteerde voeding */
  selDevice?: string | null; selSupply?: boolean;
  /** geselecteerd onderdeel op een kring (sleutel `plan:<id>` of `manual:<id>`) */
  selLoad?: string | null;
  /** oranje invoegpunten tonen: op de kringen (voor onderdelen) of op de bussen (voor kringen/differentiëlen) */
  showSlots?: 'load' | 'bus' | null;
}): DiagramResult {
  const { boards, circuits, which, supply } = opts;
  const threePhase = isThreePhase(supply);
  const devId = (c: Circuit) => (which === 'bestaand' ? c.device_id : c.new_device_id);

  // ---- gegevens ordenen ----
  const devs = new Map<string, Device>(); const boardOf = new Map<string, string>();
  for (const b of boards) for (const d of b.devices) { devs.set(d.id, d); boardOf.set(d.id, b.board.id); }
  const kidsOf = new Map<string | null, Device[]>();
  for (const d of devs.values()) { const k = d.parent_id && devs.has(d.parent_id) ? d.parent_id : `root:${d.board_id}`; (kidsOf.get(k) ?? kidsOf.set(k, []).get(k)!).push(d); }
  for (const l of kidsOf.values()) l.sort(byPos);
  const circuitsOf = new Map<string, Circuit[]>();
  for (const c of circuits) { const id = devId(c); if (id && devs.has(id)) (circuitsOf.get(id) ?? circuitsOf.set(id, []).get(id)!).push(c); }

  interface LoadItem { key: string; type: string; label: string; n: number; order: number; grp: string | null }
  const loads = new Map<string, LoadItem[]>();
  opts.symbols.forEach((sy, idx) => {
    if (!sy.circuit_id) return;
    (loads.get(sy.circuit_id) ?? loads.set(sy.circuit_id, []).get(sy.circuit_id)!).push({ key: sy.id ? `${sy.src}:${sy.id}` : `x${idx}`, type: sy.type, label: (sy.label ?? '').trim(), n: sy.n ?? 1, order: sy.order ?? idx, grp: sy.grp ?? null });
  });
  const loadsOf = (cs: Circuit[]) => cs.flatMap((c) => loads.get(c.id) ?? []).sort((x, y) => x.order - y.order);
  /** Rijen op een kring: onderdelen met dezelfde `grp` staan naast elkaar op één rij (schakelaar gevolgd door lampen). */
  const rowsOf = (cs: Circuit[]): LoadItem[][] => {
    const rows: LoadItem[][] = [];
    for (const it of loadsOf(cs)) { const last = rows[rows.length - 1]; if (it.grp && last && last[0].grp === it.grp) last.push(it); else rows.push([it]); }
    return rows;
  };

  /** Breedte van een kolom: minstens SP, breder als een rij met meerdere onderdelen (schakelaar + lampen) meer ruimte nodig heeft. */
  const colWidth = (cs: Circuit[]) => {
    let wMax = 0;
    for (const row of rowsOf(cs)) {
      if (row.length === 1 && isApplianceType(row[0].type)) continue;
      let w = 14; for (const ld of row) w += (symbolGeom(ld.type, 'schema')?.w ?? 8) * 2.6 + 10;
      wMax = Math.max(wMax, w - 10 + (row.some((r) => r.label) ? 26 : 8));
    }
    return Math.max(SP, LX + wMax + 12);
  };

  // ---- bussen opbouwen ----
  const buildItems = (list: Device[], level: number): Item[] => list.flatMap((d): Item[] => {
    if (isGroupParent(d.kind)) return [{ t: 'child', d, stubX: 0, end: 0, bus: { head: d, items: buildItems(kidsOf.get(d.id) ?? [], level + 1), level: level + 1, x0: 0, x1: 0 } }];
    if (d.kind === 'overspanning') return [{ t: 'spd', d, x: 0, end: 0 }];
    return [{ t: 'circuit', d, x: 0, end: 0, w: colWidth(circuitsOf.get(d.id) ?? []), cs: circuitsOf.get(d.id) ?? [] }];
  });
  const rootBus = (b: DiagramBoard): Bus => {
    const roots = kidsOf.get(`root:${b.board.id}`) ?? [];
    const main = roots.find((d) => d.kind === 'hoofd') ?? roots.find((d) => d.kind === 'differentieel' && (d.sens_ma ?? 0) >= 300);
    const rest = roots.filter((d) => d !== main);
    return { head: main ?? null, level: 0, x0: 0, x1: 0, items: [...(main ? buildItems(kidsOf.get(main.id) ?? [], 0) : []), ...buildItems(rest, 0)] };
  };

  // onderverdelers: een kring die een andere kast voedt
  const targetOf = (feeds: string) => boards.find((b) => (which === 'bestaand' ? b.board.id === feeds : b.board.src_board_id === feeds))?.board;
  const fedBy = new Map<string, { c: Circuit; from: Board }>();
  const boardById = new Map(boards.map((b) => [b.board.id, b.board]));
  const isAncestor = (anc: string, of: string): boolean => { let cur: string | undefined = of; while (cur) { if (cur === anc) return true; cur = fedBy.get(cur)?.from.id; } return false; };
  for (const c of circuits) {
    const id = devId(c); if (!c.feeds_board_id || !id || !devs.has(id)) continue;
    const t = targetOf(c.feeds_board_id), host = boardOf.get(id)!;
    if (!t || t.id === host || fedBy.has(t.id) || isAncestor(t.id, host)) continue;
    fedBy.set(t.id, { c, from: boardById.get(host)! });
  }
  const ordered: DiagramBoard[] = []; const seen = new Set<string>();
  const visit = (b: DiagramBoard) => { if (seen.has(b.board.id)) return; seen.add(b.board.id); ordered.push(b); for (const [tid, f] of fedBy) if (f.from.id === b.board.id) { const t = boards.find((x) => x.board.id === tid); if (t) visit(t); } };
  boards.filter((b) => !fedBy.has(b.board.id)).forEach(visit);
  boards.forEach(visit);

  // ---- horizontale indeling ----
  const layout = (bus: Bus, x0: number): number => {
    let x = x0;
    for (const it of bus.items) {
      if (it.t === 'circuit') { it.x = x + LX; x += it.w; }
      else if (it.t === 'spd') { it.x = x + SPD_W / 2; x += SPD_W; }
      else { it.stubX = x + 18; it.bus.x0 = it.stubX; x = layout(it.bus, x + STUB_W); it.bus.x1 = Math.max(x - 10, it.stubX); }
      it.end = x;
    }
    return x;
  };
  const blocks: Block[] = []; let cursor = 40;
  for (const b of ordered) {
    const bus = rootBus(b), f = fedBy.get(b.board.id);
    const x0 = cursor; bus.x0 = x0 + 20;
    const end = layout(bus, x0 + 78);
    bus.x1 = Math.max(end - 10, bus.x0 + 40);
    blocks.push({ board: b.board, bus, fedBy: f?.c, fedFrom: f?.from, x0, x1: end });
    cursor = end + 50;
  }
  const totalW = Math.max(cursor, 640);
  const cuts: { x: number; hard: boolean; depth: number }[] = [];
  const collectCuts = (bus: Bus, depth: number) => { for (const it of bus.items) { cuts.push({ x: it.end, hard: false, depth }); if (it.t === 'child') collectCuts(it.bus, depth + 1); } };
  for (const blk of blocks) { collectCuts(blk.bus, 0); cuts.push({ x: blk.x1 + 25, hard: true, depth: -1 }); }

  // ---- hoogtes: bus per niveau, kolomhoogte per kring ----
  const colHeight = (it: Item) => {
    if (it.t === 'spd') return 120;
    if (it.t === 'child') return 0;
    const r = rowsOf(it.cs);
    return CABLE_TOP + (r.length ? 14 + r.length * ROW : 0) + NAME_LEN;
  };
  const collect = (bus: Bus, out: { level: number; h: number }[]) => { for (const it of bus.items) { if (it.t === 'child') { out.push({ level: bus.level + 1, h: 90 }); collect(it.bus, out); } else out.push({ level: bus.level, h: colHeight(it) }); } return out; };
  let maxLevel = 0, tops: number[] = [];
  const all = blocks.flatMap((b) => collect(b.bus, []));
  for (const a of all) { maxLevel = Math.max(maxLevel, a.level); }
  // y van level L = BASE - L*STEP; hoogste top bepaalt BASE
  const topOf = all.map((a) => a.level * STEP + a.h);
  const TOP_MARGIN = 70;
  const BASE = TOP_MARGIN + Math.max(...topOf, 200);
  const yOf = (level: number) => BASE - level * STEP;
  void tops;

  // ---- tekenen ----
  const parts: string[] = [];
  let curBoard = '';   // kast waartoe de bus behoort die we tekenen
  const slot = (attrs: string, cx: number, cy: number) => `<g ${attrs} style="cursor:copy"><circle cx="${cx}" cy="${cy}" r="11" fill="#fff" fill-opacity="0.01"/><circle cx="${cx}" cy="${cy}" r="5" fill="#fff" stroke="#e07800" stroke-width="2"/></g>`;
  /** onzichtbaar klikvlak (voor de schema-editor); geselecteerd = lichte achtergrond */
  const hit = (attrs: string, x: number, y: number, w: number, h: number, on: boolean) =>
    `<rect ${attrs} x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#0066aa" fill-opacity="${on ? 0.1 : 0}" style="cursor:pointer"/>`;
  const phaseTxt = (d: Device) => (threePhase && d.phase ? d.phase : '');

  const protText = (d: Device): [string, string] => {
    if (d.kind === 'differentieel') return [`Type ${d.dtype ?? 'A'} - Δ${d.sens_ma ?? 30}mA`, `${polesLabel(d.poles)} - ${d.rating_a ?? '?'}A`];
    if (d.kind === 'hoofd') return ['Hoofdschakelaar', `${polesLabel(d.poles)} - ${d.rating_a ?? '?'}A`];
    if (d.kind === 'automaat' || d.kind === 'aardlekautomaat') {
      const t = `${polesLabel(d.poles)} - ${d.curve ?? ''}${d.rating_a ?? '?'}A`.replace(/\s+-\s+(?=\d)/, ' - ');
      return [t, d.kind === 'aardlekautomaat' ? `Type ${d.dtype ?? 'A'} - Δ${d.sens_ma ?? 30}mA` : ''];
    }
    return [deviceTitle(d), ''];
  };

  /** Kabelsymbolen links van de lijn (E = in wand/plafond/vloer, cirkel = in buis), zoals in de AREI-symbolen voor leidingen. */
  const cableMarks = (x: number, y0: number, c: Circuit | undefined) => {
    if (!c?.install) return '';
    const wall = (yc: number) => `<path d="M${x - 2} ${yc - 11} H${x - 12} V${yc + 11} H${x - 2} M${x - 2} ${yc} H${x - 12}" class="ln"/>`;
    return c.conduit ? wall(y0 - 130) + `<circle cx="${x - 8}" cy="${y0 - 158}" r="4.2" class="ln"/>` + wall(y0 - 186) : wall(y0 - 140) + wall(y0 - 178);
  };

  const drawCircuit = (it: Extract<Item, { t: 'circuit' }>, y0: number, bus: Bus) => {
    const { d, cs, x } = it;
    const rows = rowsOf(it.cs);
    const topY = y0 - CABLE_TOP - (rows.length ? 14 + rows.length * ROW : 0);
    const nr = cs.map((c) => c.nr).filter(Boolean).join('+') || '?';
    const name = cs.map((c) => c.name).filter((n) => n && !/^Kring /.test(n)).join(' / ');
    // klikvlak (voor de schema-weergave): onzichtbaar, geselecteerde kring licht gemarkeerd
    if (cs[0]) parts.push(hit(`data-cid="${cs[0].id}" data-bus="${bus.head?.id ?? ''}" data-board="${curBoard}"`, x - LX + 6, topY - NAME_LEN, it.w - 12, y0 + 44 - topY + NAME_LEN, cs.some((c) => c.id === opts.selCircuit)));
    // lijn + beveiliging
    parts.push(`<path d="M${x} ${y0 - BREAKER_TOP - 6} V${topY}" class="ln"/>`);
    parts.push(breakerSymbol(x, y0, d.kind === 'smelt' ? 'schakelaar' : 'automaat'));
    if (d.kind === 'smelt') parts.push(`<rect x="${x - 3}" y="${y0 - 34}" width="6" height="22" class="box"/>`);
    // kring-letter boven de bus, links van de beveiliging
    parts.push(`<text x="${x - 8}" y="${y0 - 8}" class="t-nr" text-anchor="end">${esc(nr)}</text>`);
    const ph = phaseTxt(d); if (ph) parts.push(`<text x="${x}" y="${y0 + 14}" class="t-s" text-anchor="middle">${esc(ph)}</text>`);
    // opschrift beveiliging rechts van de lijn (van onder naar boven), met het onderbrekingsvermogen erboven
    const [t1, t2] = protText(d);
    parts.push(vtext(x + 22, y0 - 8, t1, 't-s'));
    if (t2) parts.push(vtext(x + 33, y0 - 8, t2, 't-s'));
    if (d.kind === 'automaat' || d.kind === 'aardlekautomaat') {
      const icc = String(Math.round((d.breaking_ka ?? 3) * 1000));
      parts.push(`<rect x="${x + 10}" y="${y0 - 108}" width="12" height="28" class="box-s"/>`, vtext(x + 20, y0 - 94, icc, 't-icc', 'middle'));
    }
    // kabel: symbolen links, tekst rechts
    parts.push(cableMarks(x, y0, cs[0]));
    const cab = cs[0] ? cableLabel(cs[0]).replace(/ · .*/, '') : '';
    if (cab) parts.push(vtext(x + 10, y0 - 116, clip(cab, 18), 't-s'));
    // verbruikers: elke rij = één of meer onderdelen achter elkaar; elk onderdeel is selecteerbaar en versleepbaar
    const SC = 2.6;
    rows.forEach((row, i) => {
      const ry = y0 - CABLE_TOP - i * ROW - 10;
      parts.push(`<text x="${x - 8}" y="${ry + 3}" class="t-s" text-anchor="end">${i + 1}</text>`);
      const label = row.map((r) => r.label).find(Boolean) ?? '';
      if (row.length === 1 && isApplianceType(row[0].type)) {
        // toestel op het einde van de lijn (wasmachine, boiler, fornuis, …)
        const ld = row[0], geo = symbolGeom(ld.type, 'schema'), gw = geo ? geo.w * SC : 24, gh = geo ? geo.h * SC : 24;
        parts.push(hit(`data-lid="${ld.key}"`, x - gw / 2 - 4, ry - gh / 2 - 4, gw + 8, gh + 8, ld.key === opts.selLoad), `<rect x="${x - gw / 2}" y="${ry - gh / 2}" width="${gw}" height="${gh}" fill="#fff"/>`);
        parts.push(symbolMarkup(ld.type, 'schema', x, ry, SC));
        if (label) parts.push(vtext(x + gw / 2 + 8, ry, clip(label, 10), 't-addr', 'middle'));
        if (opts.showSlots === 'load' && cs[0]) parts.push(slot(`data-slot="chain" data-cid="${cs[0].id}" data-idx="${i}"`, x, ry - gh / 2 - 12));
        return;
      }
      let cx = x + 14;
      const spans: string[] = [`<path d="M${x} ${ry} H${cx}" class="ln"/>`];
      for (const ld of row) {
        const geo = symbolGeom(ld.type, 'schema'), gw = geo ? geo.w * SC : 20;
        parts.push(hit(`data-lid="${ld.key}"`, cx - 3, ry - ROW / 2 + 3, gw + 6, ROW - 6, ld.key === opts.selLoad));
        parts.push(geo ? symbolMarkup(ld.type, 'schema', cx + gw / 2, ry, SC) : `<circle cx="${cx + 10}" cy="${ry}" r="9" class="box"/><text x="${cx + 10}" y="${ry + 3}" class="t-s" text-anchor="middle">?</text>`);
        if (ld.n > 1) parts.push(`<text x="${cx + gw / 2}" y="${ry - 14}" class="t-s" text-anchor="middle">${ld.n}×</text>`);
        cx += gw;
        spans.push(`<path d="M${cx} ${ry} H${cx + 10}" class="ln"/>`);
        cx += 10;
      }
      spans.pop(); cx -= 10;   // geen lijn achter het laatste onderdeel
      parts.push(...spans);
      if (label) parts.push(vtext(cx + 9, ry, clip(label, 10), 't-addr', 'middle'));
      if (opts.showSlots === 'load' && cs[0]) parts.push(slot(`data-slot="chain" data-cid="${cs[0].id}" data-idx="${i}"`, cx + (label ? 24 : 14), ry));
    });
    if (opts.showSlots === 'load' && cs[0]) for (let k = 0; k <= rows.length; k++) parts.push(slot(`data-slot="load" data-cid="${cs[0].id}" data-idx="${k}"`, x, y0 - CABLE_TOP - (k - 0.5) * ROW - 10));
    if (name) parts.push(vtext(x + 4, topY - 8, clip(name, 24), 't-c'));
  };

  const drawSpd = (it: Extract<Item, { t: 'spd' }>, y0: number) => {
    const { x, d } = it;
    parts.push(hit(`data-did="${d.id}"`, x - 12, y0 - 86, 90, 90, d.id === opts.selDevice));
    parts.push(`<path d="M${x} ${y0} V${y0 - 40}" class="ln"/>`, `<rect x="${x - 9}" y="${y0 - 80}" width="18" height="40" class="box"/>`,
      `<path d="M${x - 5} ${y0 - 72} l5 12 l5 -12 M${x} ${y0 - 60} v10" class="ln"/>`, `<text x="${x + 14}" y="${y0 - 56}" class="t-s">Overspanning</text>`, `<text x="${x + 14}" y="${y0 - 45}" class="t-s">${esc(polesLabel(d.poles))}</text>`);
  };

  const drawBus = (bus: Bus, parentY: number | null, fromX: number | null) => {
    const y0 = yOf(bus.level);
    const last = bus.items.length ? bus.items[bus.items.length - 1] : null;
    const lastX = last ? (last.t === 'child' ? last.bus.x1 : last.x + (last.t === 'circuit' ? last.w - LX - 14 : SPD_W / 2)) : bus.x0 + 40;
    const x1 = Math.max(bus.x1, lastX, bus.x0 + 40);
    parts.push(hit(`data-bus="${bus.head?.id ?? ''}" data-board="${curBoard}"`, bus.x0 - 8, y0 - 10, x1 - bus.x0 + 18, 20, false));
    if (opts.showSlots === 'bus') {
      const left = (it: Item) => (it.t === 'circuit' ? it.x - LX : it.t === 'spd' ? it.x - SPD_W / 2 : it.stubX - 18);
      for (let j = 0; j <= bus.items.length; j++) parts.push(slot(`data-slot="bus" data-bus="${bus.head?.id ?? ''}" data-board="${curBoard}" data-idx="${j}"`, j === 0 ? (bus.items.length ? left(bus.items[0]) : bus.x0 + 40) : bus.items[j - 1].end, y0));
    }
    parts.push(`<path d="M${bus.x0 - (parentY === null ? 0 : 6)} ${y0} H${x1 + 8}" class="bus"/>`);
    for (const it of bus.items) {
      if (it.t === 'circuit') drawCircuit(it, y0, bus);
      else if (it.t === 'spd') drawSpd(it, y0);
      else {
        const cy = yOf(it.bus.level), d = it.d, [t1, t2] = protText(d);
        // stub van de bovenliggende bus naar de onderliggende, met het differentieel in het midden
        parts.push(`<path d="M${it.stubX} ${y0} V${cy}" class="ln"/>`);
        const my = (y0 + cy) / 2 + 22;
        parts.push(hit(`data-did="${d.id}"`, it.stubX - 12, my - 56, 150, 70, d.id === opts.selDevice));
        parts.push(`<rect x="${it.stubX - 4}" y="${my - 52}" width="8" height="62" fill="#fff"/>`, breakerSymbol(it.stubX, my, 'diff'));
        parts.push(`<text x="${it.stubX + 16}" y="${my - 22}" class="t-b">${esc(t1)}</text>`, `<text x="${it.stubX + 16}" y="${my - 9}" class="t-s">${esc(t2)}</text>`);
        if (d.label) parts.push(`<text x="${it.stubX + 16}" y="${my - 36}" class="t-s">${esc(clip(d.label, 18))}</text>`);
        drawBus(it.bus, y0, it.stubX);
      }
    }
    void fromX;
  };

  for (const blk of blocks) {
    const b = blk.bus, y0 = yOf(0);
    curBoard = blk.board.id;
    drawBus(b, null, null);
    if (blk.fedBy) {
      // onderverdeler: gevoed door een kring van een andere kast
      const sx = b.x0 + 20;
      parts.push(`<path d="M${sx} ${y0} V${y0 + 60}" class="ln"/>`,
        `<text x="${sx + 8}" y="${y0 + 36}" class="t-b">${esc(clip(blk.board.name, 28))}</text>`, `<text x="${sx + 8}" y="${y0 + 50}" class="t-s">gevoed via kring ${esc(blk.fedBy.nr ?? '')} van ${esc(blk.fedFrom?.name ?? '')}</text>`);
    } else {
      // aarding links onder de bus: aardingsstrip met aardinrichting eronder
      const ax = b.x0 + 12;
      parts.push(`<path d="M${ax} ${y0} V${y0 + 6}" class="ln"/>`, areiSymbol('Aardingsstrip', ax, y0 + 6 + 17.15 * 2.6, 2.6), areiSymbol('Aardinrichting', ax, y0 + 6 + 34.3 * 2.6 + 8.6 * 2.6, 2.6));
      // voeding: kabel van de teller → hoofddifferentieel (horizontaal onder de bus) → bus
      const baseY = y0 + 52, ex = b.x0 + 290, runL = b.x0 + 62, dx = runL + 90;
      parts.push(hit('data-sup="1"', runL - 6, baseY - 12, 96, 44, !!opts.selSupply));
      parts.push(`<path d="M${ex} ${y0} V${baseY} H${dx + 46}" class="ln"/>`, `<path d="M${runL} ${baseY} H${dx}" class="ln"/>`);
      if (opts.supplyCable) parts.push(`<text x="${runL + 2}" y="${baseY + 14}" class="t-s">${esc(clip(opts.supplyCable, 20))}</text>`);
      if (opts.ean) parts.push(`<text x="${runL + 2}" y="${baseY + 46}" class="t-s">EAN ${esc(opts.ean)}</text>`);
      if (b.head) {
        const [t1, t2] = protText(b.head);
        parts.push(hit(`data-did="${b.head.id}"`, dx - 8, baseY - 40, 150, 76, b.head.id === opts.selDevice));
        parts.push(`<g transform="translate(${dx} ${baseY}) rotate(90) translate(${-dx} ${-baseY})">${breakerSymbol(dx, baseY, b.head.kind === 'differentieel' ? 'diff' : 'automaat')}</g>`,
          `<text x="${dx}" y="${baseY - 10}" class="t-b">${esc(t1)}</text>`, `<rect x="${dx + 6}" y="${baseY + 6}" width="28" height="12" class="box-s"/><text x="${dx + 20}" y="${baseY + 15}" class="t-icc" text-anchor="middle">3000</text>`, `<text x="${dx + 6}" y="${baseY + 31}" class="t-s">${esc(t2)}</text>`);
      } else parts.push(`<path d="M${dx} ${baseY} H${dx + 46}" class="ln"/>`);
    }
    if (boards.length > 1) parts.push(`<text x="${b.x0 - 20}" y="${y0 + 200}" class="t-h2">${esc(blk.board.name)}</text>`);
  }

  // ---- niet-gekoppelde kringen ----
  const placed = new Set<string>(); for (const l of circuitsOf.values()) l.forEach((c) => placed.add(c.id));
  const unlinked = circuits.filter((c) => !placed.has(c.id));
  let H = BASE + 215;
  let legend = '';
  if (unlinked.length) {
    const y = H;
    legend = `<text x="40" y="${y}" class="t-w">Niet gekoppeld aan een zekering:</text>` + unlinked.map((c, i) => `<text x="40" y="${y + 16 * (i + 1)}" class="t-s">• ${esc(c.nr ?? '')} ${esc(c.name)}</text>`).join('');
    H = y + 16 * (unlinked.length + 1) + 10;
  }
  const meta = opts.crop ? '' : (opts.meta ?? []).map((m, i, a) => `<text x="${totalW - 40}" y="${H - 14 - (a.length - 1 - i) * 14}" text-anchor="end" class="t-s">${esc(m)}</text>`).join('');
  void isFeeder;
  const [vx, vw] = opts.crop ? [opts.crop[0], opts.crop[1] - opts.crop[0]] : [0, totalW];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} 0 ${vw} ${H}" width="${vw}" height="${H}" font-family="Poppins, Arial, sans-serif">
<style>
.ln{stroke:#000;stroke-width:1.4;fill:none}
.ln-thick{stroke:#000;stroke-width:3.2;fill:none}
.bus{stroke:#000;stroke-width:3.4;fill:none;stroke-linecap:square}
.box{fill:#fff;stroke:#000;stroke-width:1.4}
.box-s{fill:#fff;stroke:#000;stroke-width:1}
.t-b{font-size:11px;font-weight:600;fill:#000}
.t-s{font-size:9.5px;fill:#000}
.t-icc{font-size:9px;fill:#000}
.t-c{font-size:11px;font-weight:600;fill:#000}
.t-nr{font-size:15px;font-weight:700;fill:#000}
.t-addr{font-size:9px;font-style:italic;fill:#1d4f91}
.t-w{font-size:11px;font-weight:600;fill:#c00}
.t-h{font-size:16px;font-weight:700;fill:#000}
.t-h2{font-size:12px;font-weight:700;fill:#000}
</style>
${opts.crop ? '' : `<rect width="100%" height="100%" fill="#fff"/>
<text x="40" y="30" class="t-h">${esc(opts.title)}</text>`}
${parts.join(String.fromCharCode(10))}
${opts.crop ? '' : legend}
${meta}
</svg>`;
  return { svg, width: vw, height: H, cuts };
}

export const buildSingleLineSvg = (o: Parameters<typeof buildDiagram>[0]) => buildDiagram(o).svg;

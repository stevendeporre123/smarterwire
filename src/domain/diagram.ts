import type { Board, Circuit, Device } from './model';
import { cableLabel, deviceTitle, isGroupParent, isFeeder, polesLabel, supplyLabel, isThreePhase, type Supply } from './devices';
import { symbolGeom, symbolMarkup } from './areisymbols';
import { esc } from '../lib/dom';

export interface DiagramBoard { board: Board; devices: Device[] }
export interface DiagramSymbol { circuit_id?: string | null; type: string; label?: string | null }

// ---- maten (px) ----
const SP = 120;        // breedte van één kring
const SPD_W = 70;
const STUB_W = 44;     // ruimte tussen een differentieel-stub en de eerste kring van zijn bus
const STEP = 150;      // hoogteverschil tussen een bus en zijn onderliggende bus
const BUS_PAD = 22;
const BREAKER_TOP = 40; // hoogte van de beveiliging boven de bus
const CABLE_TOP = 170;  // vanaf hier beginnen de verbruikers
const ROW = 38;         // hoogte per verbruiker
const NAME_LEN = 110;

type Item =
  | { t: 'circuit'; d: Device; x: number; cs: Circuit[] }
  | { t: 'spd'; d: Device; x: number }
  | { t: 'child'; d: Device; stubX: number; bus: Bus };
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

export function buildSingleLineSvg(opts: {
  title: string; boards: DiagramBoard[]; circuits: Circuit[]; symbols: DiagramSymbol[]; which: 'bestaand' | 'nieuw';
  supply: Supply; meta?: string[]; ean?: string | null;
}): string {
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

  const loads = new Map<string, { type: string; label: string; n: number }[]>();
  for (const s of opts.symbols) {
    if (!s.circuit_id) continue;
    const l = loads.get(s.circuit_id) ?? loads.set(s.circuit_id, []).get(s.circuit_id)!;
    const label = (s.label ?? '').trim(), hit = l.find((x) => x.type === s.type && x.label === label);
    if (hit) hit.n++; else l.push({ type: s.type, label, n: 1 });
  }
  const loadsOf = (cs: Circuit[]) => cs.flatMap((c) => loads.get(c.id) ?? []);

  // ---- bussen opbouwen ----
  const buildItems = (list: Device[], level: number): Item[] => list.flatMap((d): Item[] => {
    if (isGroupParent(d.kind)) return [{ t: 'child', d, stubX: 0, bus: { head: d, items: buildItems(kidsOf.get(d.id) ?? [], level + 1), level: level + 1, x0: 0, x1: 0 } }];
    if (d.kind === 'overspanning') return [{ t: 'spd', d, x: 0 }];
    return [{ t: 'circuit', d, x: 0, cs: circuitsOf.get(d.id) ?? [] }];
  });
  const rootBus = (b: DiagramBoard): Bus => {
    const roots = kidsOf.get(`root:${b.board.id}`) ?? [];
    const main = roots.find((d) => d.kind === 'hoofd');
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
      if (it.t === 'circuit') { it.x = x + SP / 2; x += SP; }
      else if (it.t === 'spd') { it.x = x + SPD_W / 2; x += SPD_W; }
      else { it.stubX = x + 18; it.bus.x0 = it.stubX; x = layout(it.bus, x + STUB_W); it.bus.x1 = Math.max(x - 10, it.stubX); }
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

  // ---- hoogtes: bus per niveau, kolomhoogte per kring ----
  const colHeight = (it: Item) => {
    if (it.t === 'spd') return 120;
    if (it.t === 'child') return 0;
    const l = loadsOf(it.cs);
    return CABLE_TOP + (l.length ? 14 + l.length * ROW : 0) + NAME_LEN;
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

  const drawCircuit = (it: Extract<Item, { t: 'circuit' }>, y0: number) => {
    const { d, cs, x } = it;
    const l = loadsOf(it.cs);
    const topY = y0 - CABLE_TOP - (l.length ? 14 + l.length * ROW : 0);
    const nr = cs.map((c) => c.nr).filter(Boolean).join('+') || '?';
    const name = cs.map((c) => c.name).filter((n) => n && !/^Kring /.test(n)).join(' / ');
    // lijn + beveiliging
    parts.push(`<path d="M${x} ${y0 - BREAKER_TOP - 6} V${topY}" class="ln"/>`);
    parts.push(breakerSymbol(x, y0, d.kind === 'automaat' || d.kind === 'aardlekautomaat' ? 'automaat' : d.kind === 'smelt' ? 'schakelaar' : 'automaat'));
    if (d.kind === 'smelt') parts.push(`<rect x="${x - 3}" y="${y0 - 34}" width="6" height="22" class="box"/>`);
    // opschrift beveiliging (links van de lijn, van onder naar boven)
    const [t1, t2] = protText(d);
    parts.push(vtext(x - 6, y0 - 8, t1, 't-s'));
    if (t2) parts.push(vtext(x - 17, y0 - 8, t2, 't-s'));
    if (d.kind === 'automaat' || d.kind === 'aardlekautomaat') {
      const icc = String(Math.round((d.breaking_ka ?? 3) * 1000));
      parts.push(`<rect x="${x - 17}" y="${y0 - 108}" width="12" height="28" class="box-s"/>`, vtext(x - 7, y0 - 94, icc, 't-icc', 'middle'));
    }
    // kabel (rechts van de lijn)
    const cab = cs[0] ? cableLabel(cs[0]).replace(/ · .*/, '') : '';
    if (cab) parts.push(vtext(x + 10, y0 - 66, clip(cab, 24), 't-s'));
    // kring-letter onder de bus
    parts.push(`<text x="${x}" y="${y0 + 20}" class="t-nr" text-anchor="middle">${esc(nr)}</text>`);
    const ph = phaseTxt(d); if (ph) parts.push(`<text x="${x}" y="${y0 + 33}" class="t-s" text-anchor="middle">${esc(ph)}</text>`);
    // verbruikers: één rij per soort symbool
    l.forEach((ld, i) => {
      const ry = y0 - CABLE_TOP - i * ROW - 10;
      parts.push(`<text x="${x - 8}" y="${ry + 3}" class="t-s" text-anchor="end">${i + 1}</text>`, `<path d="M${x} ${ry} H${x + 15}" class="ln"/>`);
      const geo = symbolGeom(ld.type, 'schema'), sc = 2.6, gw = geo ? geo.w * sc : 20;
      if (geo) parts.push(symbolMarkup(ld.type, 'schema', x + 15 + gw / 2, ry, sc));
      else parts.push(`<circle cx="${x + 29}" cy="${ry}" r="9" class="box"/>`, `<text x="${x + 29}" y="${ry + 3}" class="t-s" text-anchor="middle">?</text>`);
      const txt = [ld.n > 1 ? `${ld.n}×` : '', ld.label].filter(Boolean).join(' ');
      if (txt) parts.push(`<text x="${x + Math.max(48, 15 + gw + 6)}" y="${ry + 3}" class="t-s">${esc(clip(txt, 13))}</text>`);
    });
    if (name) parts.push(vtext(x + 4, topY - 8, clip(name, 24), 't-c'));
    else if (!l.length) parts.push(vtext(x + 4, topY - 8, '', 't-c'));
  };

  const drawSpd = (it: Extract<Item, { t: 'spd' }>, y0: number) => {
    const { x, d } = it;
    parts.push(`<path d="M${x} ${y0} V${y0 - 40}" class="ln"/>`, `<rect x="${x - 9}" y="${y0 - 80}" width="18" height="40" class="box"/>`,
      `<path d="M${x - 5} ${y0 - 72} l5 12 l5 -12 M${x} ${y0 - 60} v10" class="ln"/>`, `<text x="${x + 14}" y="${y0 - 56}" class="t-s">Overspanning</text>`, `<text x="${x + 14}" y="${y0 - 45}" class="t-s">${esc(polesLabel(d.poles))}</text>`);
  };

  const drawBus = (bus: Bus, parentY: number | null, fromX: number | null) => {
    const y0 = yOf(bus.level);
    const last = bus.items.length ? bus.items[bus.items.length - 1] : null;
    const lastX = last ? (last.t === 'child' ? last.bus.x1 : last.x + (last.t === 'circuit' ? SP / 2 - 14 : SPD_W / 2)) : bus.x0 + 40;
    const x1 = Math.max(bus.x1, lastX, bus.x0 + 40);
    parts.push(`<path d="M${bus.x0 - (parentY === null ? 0 : 6)} ${y0} H${x1 + 8}" class="bus"/>`);
    for (const it of bus.items) {
      if (it.t === 'circuit') drawCircuit(it, y0);
      else if (it.t === 'spd') drawSpd(it, y0);
      else {
        const cy = yOf(it.bus.level), d = it.d, [t1, t2] = protText(d);
        // stub van de bovenliggende bus naar de onderliggende, met het differentieel in het midden
        parts.push(`<path d="M${it.stubX} ${y0} V${cy}" class="ln"/>`);
        const my = (y0 + cy) / 2 + 22;
        parts.push(`<rect x="${it.stubX - 4}" y="${my - 52}" width="8" height="62" fill="#fff"/>`, breakerSymbol(it.stubX, my, 'diff'));
        parts.push(`<text x="${it.stubX + 16}" y="${my - 22}" class="t-b">${esc(t1)}</text>`, `<text x="${it.stubX + 16}" y="${my - 9}" class="t-s">${esc(t2)}</text>`);
        if (d.label) parts.push(`<text x="${it.stubX + 16}" y="${my - 36}" class="t-s">${esc(clip(d.label, 18))}</text>`);
        drawBus(it.bus, y0, it.stubX);
      }
    }
    void fromX;
  };

  for (const blk of blocks) {
    const b = blk.bus, y0 = yOf(0), sx = b.x0 + 20;
    drawBus(b, null, null);
    // voeding links onderaan: (hoofdschakelaar) -> teller -> net
    parts.push(`<path d="M${sx} ${y0} V${y0 + 110}" class="ln"/>`);
    const meterY = b.head ? y0 + 80 : y0 + 36;
    if (b.head) {
      const [t1, t2] = protText(b.head);
      parts.push(`<rect x="${sx - 6}" y="${y0 + 12}" width="12" height="54" fill="#fff"/>`, breakerSymbol(sx, y0 + 62, 'diff'),
        `<text x="${sx + 20}" y="${y0 + 32}" class="t-b">${esc(t1)}</text>`, `<text x="${sx + 20}" y="${y0 + 45}" class="t-s">${esc(t2)}</text>`);
    }
    if (blk.fedBy) {
      parts.push(`<text x="${sx}" y="${y0 + 128}" class="t-b" text-anchor="start">${esc(clip(blk.board.name, 28))}</text>`,
        `<text x="${sx}" y="${y0 + 142}" class="t-s">gevoed via kring ${esc(blk.fedBy.nr ?? '')} van ${esc(blk.fedFrom?.name ?? '')}</text>`);
    } else {
      parts.push(`<rect x="${sx - 26}" y="${meterY - 13}" width="52" height="26" class="box"/><text x="${sx}" y="${meterY + 4}" class="t-b" text-anchor="middle">kWh</text>`);
      parts.push(`<text x="${sx}" y="${y0 + 128}" class="t-b" text-anchor="middle">${esc(supplyLabel(supply))}</text>`);
      if (opts.ean) parts.push(`<text x="${sx}" y="${y0 + 142}" class="t-s" text-anchor="middle">EAN ${esc(opts.ean)}</text>`);
    }
    if (boards.length > 1) parts.push(`<text x="${b.x0 - 20 + 0}" y="${y0 + 166}" class="t-h2">${esc(blk.board.name)}</text>`);
  }

  // ---- niet-gekoppelde kringen ----
  const placed = new Set<string>(); for (const l of circuitsOf.values()) l.forEach((c) => placed.add(c.id));
  const unlinked = circuits.filter((c) => !placed.has(c.id));
  let H = BASE + 190;
  let legend = '';
  if (unlinked.length) {
    const y = H;
    legend = `<text x="40" y="${y}" class="t-w">Niet gekoppeld aan een zekering:</text>` + unlinked.map((c, i) => `<text x="40" y="${y + 16 * (i + 1)}" class="t-s">• ${esc(c.nr ?? '')} ${esc(c.name)}</text>`).join('');
    H = y + 16 * (unlinked.length + 1) + 10;
  }
  const meta = (opts.meta ?? []).map((m, i, a) => `<text x="${totalW - 40}" y="${H - 14 - (a.length - 1 - i) * 14}" text-anchor="end" class="t-s">${esc(m)}</text>`).join('');
  void isFeeder;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${H}" width="${totalW}" height="${H}" font-family="Poppins, Arial, sans-serif">
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
.t-w{font-size:11px;font-weight:600;fill:#c00}
.t-h{font-size:16px;font-weight:700;fill:#000}
.t-h2{font-size:12px;font-weight:700;fill:#000}
</style>
<rect width="100%" height="100%" fill="#fff"/>
<text x="40" y="30" class="t-h">${esc(opts.title)}</text>
${parts.join('\n')}
${legend}
${meta}
</svg>`;
}

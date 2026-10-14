import type { Board, Circuit, Device } from './model';
import { cableLabel, deviceTitle, DEVICE_KINDS } from './devices';
import { esc } from '../lib/dom';

interface DevNode { d: Device; kids: DevNode[]; circuits: Circuit[]; subs: SubNode[]; w: number; kw: number; sw: number; x: number }
interface SubNode { board: Board; kids: DevNode[]; via: Circuit; w: number; kw: number; x: number }

const LEAF_W = 128, BOX_H = 44, LEVEL = 120;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const wrap = (s: string, n: number) => {
  const out: string[] = []; let cur = '';
  for (const word of s.split(/\s+/)) {
    if ((cur + ' ' + word).trim().length > n && cur) { out.push(cur); cur = word; } else cur = (cur + ' ' + word).trim();
  }
  if (cur) out.push(cur);
  return out;
};

export interface DiagramBoard { board: Board; devices: Device[] }

/**
 * Eendraadschema als SVG. Alle kasten van dezelfde soort (bestaand of nieuw) komen in één schema;
 * een kring die een onderverdeler voedt (`feeds_board_id`) krijgt die kast als vertakking.
 */
export function buildSingleLineSvg(opts: {
  title: string; boards: DiagramBoard[]; circuits: Circuit[]; which: 'bestaand' | 'nieuw'; meta?: string[]; ean?: string | null;
}): string {
  const { boards, circuits, which } = opts;
  const devId = (c: Circuit) => (which === 'bestaand' ? c.device_id : c.new_device_id);
  const nodes = new Map<string, DevNode>();
  const boardOfDev = new Map<string, string>();
  for (const b of boards) for (const d of b.devices) { nodes.set(d.id, { d, kids: [], circuits: [], subs: [], w: 0, kw: 0, sw: 0, x: 0 }); boardOfDev.set(d.id, b.board.id); }
  const order = (a: DevNode, b: DevNode) => a.d.row_no - b.d.row_no || a.d.pos - b.d.pos;
  const rootsOf = new Map<string, DevNode[]>();
  for (const b of boards) rootsOf.set(b.board.id, []);
  for (const n of nodes.values()) {
    const p = n.d.parent_id ? nodes.get(n.d.parent_id) : undefined;
    (p ? p.kids : rootsOf.get(n.d.board_id)!).push(n);
  }
  for (const n of nodes.values()) n.kids.sort(order);
  for (const r of rootsOf.values()) r.sort(order);
  for (const c of circuits) { const id = devId(c); if (id && nodes.has(id)) nodes.get(id)!.circuits.push(c); }

  // onderverdelers: kring -> kast
  const boardById = new Map(boards.map((b) => [b.board.id, b.board]));
  const targetOf = (feeds: string) => boards.find((b) => (which === 'bestaand' ? b.board.id === feeds : b.board.src_board_id === feeds))?.board;
  const fedBy = new Map<string, string>();
  const isAncestor = (anc: string, of: string): boolean => { let cur: string | undefined = of; while (cur) { if (cur === anc) return true; cur = fedBy.get(cur); } return false; };
  for (const c of circuits) {
    const id = devId(c); if (!c.feeds_board_id || !id || !nodes.has(id)) continue;
    const t = targetOf(c.feeds_board_id); const hostBoard = boardOfDev.get(id)!;
    if (!t || t.id === hostBoard || fedBy.has(t.id) || isAncestor(t.id, hostBoard)) continue;
    fedBy.set(t.id, hostBoard);
    nodes.get(id)!.subs.push({ board: t, kids: rootsOf.get(t.id)!, via: c, w: 0, kw: 0, x: 0 });
  }
  const top = boards.filter((b) => !fedBy.has(b.board.id)).flatMap((b) => rootsOf.get(b.board.id)!);

  // ---- breedtes & posities ----
  const sum = (a: { w: number }[]) => a.reduce((s, k) => s + k.w, 0);
  const measureDev = (n: DevNode) => {
    n.kids.forEach(measureDev); n.subs.forEach(measureSub);
    n.kw = sum(n.kids); n.sw = sum(n.subs);
    n.w = Math.max(n.kw || LEAF_W, n.sw);
  };
  const measureSub = (s: SubNode) => { s.kids.forEach(measureDev); s.kw = sum(s.kids); s.w = Math.max(s.kw, LEAF_W); };
  top.forEach(measureDev);
  const placeDev = (n: DevNode, x0: number) => {
    n.x = x0 + n.w / 2;
    let x = x0 + (n.w - n.kw) / 2; for (const k of n.kids) { placeDev(k, x); x += k.w; }
    x = x0 + (n.w - n.sw) / 2; for (const s of n.subs) { placeSub(s, x); x += s.w; }
  };
  const placeSub = (s: SubNode, x0: number) => {
    s.x = x0 + s.w / 2;
    let x = x0 + (s.w - s.kw) / 2; for (const k of s.kids) { placeDev(k, x); x += k.w; }
  };
  let cursor = 40;
  for (const r of top) { placeDev(r, cursor); cursor += r.w; }
  const totalW = Math.max(cursor + 40, 640);

  // ---- tekenen ----
  const parts: string[] = [];
  const Y0 = 140;
  let maxY = Y0;
  const connect = (x: number, y: number, px: number | null, py: number) => {
    if (px === null) parts.push(`<path d="M${x} ${y} V${y - 28}" class="ln"/>`);
    else parts.push(`<path d="M${x} ${y} V${(y + py) / 2} H${px} V${py}" class="ln"/>`);
  };

  const drawDev = (n: DevNode, y: number, px: number | null, py: number): number => {
    const bw = Math.min(n.w - 16, 132);
    const isMain = n.d.kind === 'differentieel' || n.d.kind === 'hoofd';
    connect(n.x, y, px, py);
    parts.push(`<rect x="${n.x - bw / 2}" y="${y}" width="${bw}" height="${BOX_H}" rx="4" class="${isMain ? 'box-main' : 'box'}"/>`);
    parts.push(`<text x="${n.x}" y="${y + 18}" class="t-b" text-anchor="middle">${esc(clip(deviceTitle(n.d), Math.floor(bw / 6.2)))}</text>`);
    const sub = [DEVICE_KINDS[n.d.kind]?.short, n.d.poles, n.d.phase, n.d.dtype ? `type ${n.d.dtype}` : ''].filter(Boolean).join(' · ');
    parts.push(`<text x="${n.x}" y="${y + 33}" class="t-s" text-anchor="middle">${esc(clip(sub, Math.floor(bw / 5.2)))}</text>`);
    let bottom = y + BOX_H;
    for (const k of n.kids) bottom = Math.max(bottom, drawDev(k, y + LEVEL, n.x, y + BOX_H));
    if (n.circuits.length) {
      let cy = bottom + 28;
      parts.push(`<path d="M${n.x} ${bottom} V${cy - 6}" class="ln"/>`);
      for (const c of n.circuits) {
        const lines = wrap(`${c.nr ? c.nr + ' ' : ''}${c.name}`, 17);
        const cab = wrap(cableLabel(c), 22);
        const h = 14 * lines.length + 12 * cab.length + 12;
        parts.push(`<rect x="${n.x - 62}" y="${cy - 12}" width="124" height="${h}" rx="3" class="circ"/>`);
        lines.forEach((l, i) => parts.push(`<text x="${n.x}" y="${cy + i * 14 + 1}" class="t-c" text-anchor="middle">${esc(l)}</text>`));
        cab.forEach((l, i) => parts.push(`<text x="${n.x}" y="${cy + lines.length * 14 + i * 12 + 1}" class="t-s" text-anchor="middle">${esc(l)}</text>`));
        cy += h + 4;
      }
      bottom = cy;
    }
    for (const s of n.subs) bottom = Math.max(bottom, drawSub(s, bottom + 40, n.x, bottom + 4));
    maxY = Math.max(maxY, bottom + 20);
    return bottom;
  };

  const drawSub = (s: SubNode, y: number, px: number, py: number): number => {
    connect(s.x, y, px, py);
    parts.push(`<rect x="${s.x - 70}" y="${y}" width="140" height="${BOX_H}" rx="4" class="box-sub"/>`);
    parts.push(`<text x="${s.x}" y="${y + 18}" class="t-b" text-anchor="middle">${esc(clip(s.board.name, 21))}</text>`);
    parts.push(`<text x="${s.x}" y="${y + 33}" class="t-s" text-anchor="middle">onderverdeler</text>`);
    let bottom = y + BOX_H;
    for (const k of s.kids) bottom = Math.max(bottom, drawDev(k, y + LEVEL, s.x, y + BOX_H));
    return bottom;
  };

  // net, teller en gemeenschappelijke bus
  if (top.length) {
    const xs = top.map((r) => r.x), mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    parts.push(`<path d="M${Math.min(...xs)} ${Y0 - 28} H${Math.max(...xs)}" class="ln"/>`);
    parts.push(`<path d="M${mid} ${Y0 - 28} V${Y0 - 52}" class="ln"/>`);
    parts.push(`<rect x="${mid - 36}" y="${Y0 - 84}" width="72" height="32" rx="4" class="box"/><text x="${mid}" y="${Y0 - 63}" class="t-b" text-anchor="middle">kWh</text>`);
    if (opts.ean) parts.push(`<text x="${mid + 44}" y="${Y0 - 64}" class="t-s">EAN ${esc(opts.ean)}</text>`);
  }
  for (const r of top) drawDev(r, Y0, null, 0);

  const placed = new Set<string>();
  for (const n of nodes.values()) n.circuits.forEach((c) => placed.add(c.id));
  const unlinked = circuits.filter((c) => !placed.has(c.id));
  let legend = '';
  if (unlinked.length) {
    const y = maxY + 24;
    legend = `<text x="40" y="${y}" class="t-w">Niet gekoppeld aan een zekering:</text>` +
      unlinked.map((c, i) => `<text x="40" y="${y + 16 * (i + 1)}" class="t-s">• ${esc(c.nr ?? '')} ${esc(c.name)}</text>`).join('');
    maxY = y + 16 * (unlinked.length + 1);
  }

  const H = maxY + 70;
  const meta = (opts.meta ?? []).map((m, i, a) => `<text x="${totalW - 40}" y="${H - 20 - (a.length - 1 - i) * 14}" text-anchor="end" class="t-s">${esc(m)}</text>`).join('');
  void boardById;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${H}" width="${totalW}" height="${H}" font-family="Poppins, Arial, sans-serif">
<style>
.ln{stroke:#1a1e1a;stroke-width:1.6;fill:none}
.box{fill:#fff;stroke:#1a1e1a;stroke-width:1.6}
.box-main{fill:#e6f5e6;stroke:#008000;stroke-width:2}
.box-sub{fill:#fff3e0;stroke:#e07800;stroke-width:2}
.circ{fill:#f5f6f5;stroke:#8f9a8f;stroke-width:1}
.t-b{font-size:12px;font-weight:600;fill:#1a1e1a}
.t-s{font-size:10px;fill:#555e55}
.t-c{font-size:11px;fill:#1a1e1a}
.t-w{font-size:11px;font-weight:600;fill:#e07800}
.t-h{font-size:16px;font-weight:700;fill:#1a1e1a}
</style>
<rect width="100%" height="100%" fill="#fff"/>
<text x="40" y="30" class="t-h">${esc(opts.title)}</text>
${parts.join('\n')}
${legend}
${meta}
</svg>`;
}

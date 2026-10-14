import type { Circuit, Device } from './model';
import { deviceTitle, DEVICE_KINDS } from './devices';
import { esc } from '../lib/dom';

interface Node { d: Device; kids: Node[]; w: number; x: number; circuits: Circuit[] }

const LEAF_W = 128;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const wrap = (s: string, n: number) => {
  const out: string[] = []; let cur = '';
  for (const word of s.split(/\s+/)) {
    if ((cur + ' ' + word).trim().length > n && cur) { out.push(cur); cur = word; } else cur = (cur + ' ' + word).trim();
  }
  if (cur) out.push(cur);
  return out;
};

/**
 * Eendraadschema als SVG-string. `which` bepaalt of de kringen via device_id (bestaand)
 * of new_device_id (nieuwe kast) aan een toestel hangen.
 */
export function buildSingleLineSvg(opts: {
  title: string; devices: Device[]; circuits: Circuit[]; which: 'bestaand' | 'nieuw'; meta?: string[];
}): string {
  const { devices, circuits, which } = opts;
  const byId = new Map(devices.map((d) => [d.id, d]));
  const nodes = new Map<string, Node>(devices.map((d) => [d.id, { d, kids: [], w: 0, x: 0, circuits: [] }]));
  for (const c of circuits) {
    const id = which === 'bestaand' ? c.device_id : c.new_device_id;
    if (id && nodes.has(id)) nodes.get(id)!.circuits.push(c);
  }
  const roots: Node[] = [];
  for (const n of nodes.values()) {
    const p = n.d.parent_id && nodes.get(n.d.parent_id);
    (p ? p.kids : roots).push(n);
  }
  const order = (a: Node, b: Node) => a.d.row_no - b.d.row_no || a.d.pos - b.d.pos;
  const sortRec = (n: Node) => { n.kids.sort(order); n.kids.forEach(sortRec); };
  roots.sort(order); roots.forEach(sortRec);

  const measure = (n: Node): number => (n.w = n.kids.length ? n.kids.reduce((s, k) => s + measure(k), 0) : LEAF_W);
  roots.forEach(measure);
  let cursor = 40;
  const place = (n: Node, x0: number) => {
    n.x = x0 + n.w / 2;
    let x = x0;
    for (const k of n.kids) { place(k, x); x += k.w; }
  };
  for (const r of roots) { place(r, cursor); cursor += r.w; }
  const totalW = Math.max(cursor + 40, 600);

  const parts: string[] = [];
  const BOX_H = 44, Y0 = 90, LEVEL = 120;
  let maxY = Y0;
  const unlinked = circuits.filter((c) => !(which === 'bestaand' ? c.device_id : c.new_device_id));

  const draw = (n: Node, y: number, parentX: number | null, parentY: number) => {
    const bw = Math.min(n.w - 16, 118);
    const isGroup = n.kids.length > 0;
    const cls = n.d.kind === 'differentieel' || n.d.kind === 'hoofd' ? 'box-main' : 'box';
    if (parentX !== null) parts.push(`<path d="M${n.x} ${y} V${(y + parentY) / 2} H${parentX} V${parentY}" class="ln"/>`);
    else parts.push(`<path d="M${n.x} ${y} V${y - 28}" class="ln"/>`);
    parts.push(`<rect x="${n.x - bw / 2}" y="${y}" width="${bw}" height="${BOX_H}" rx="4" class="${cls}"/>`);
    parts.push(`<text x="${n.x}" y="${y + 18}" class="t-b" text-anchor="middle">${esc(clip(deviceTitle(n.d), Math.floor(bw / 6.6)))}</text>`);
    const sub = [DEVICE_KINDS[n.d.kind]?.short, n.d.poles, n.d.dtype ? `type ${n.d.dtype}` : ''].filter(Boolean).join(' · ');
    parts.push(`<text x="${n.x}" y="${y + 33}" class="t-s" text-anchor="middle">${esc(sub)}</text>`);
    let bottom = y + BOX_H;
    if (isGroup) {
      for (const k of n.kids) draw(k, y + LEVEL, n.x, y + BOX_H);
      bottom = y + LEVEL + BOX_H;
    }
    // kringen onder het toestel (bladeren of toestellen die zelf kringen voeden)
    if (n.circuits.length) {
      let cy = bottom + 28;
      parts.push(`<path d="M${n.x} ${bottom} V${cy - 6}" class="ln"/>`);
      for (const c of n.circuits) {
        const lines = wrap(`${c.nr ? c.nr + ' ' : ''}${c.name}`, 17);
        const cable = [c.cable_type, c.wires ? `${c.wires}G${c.section_mm2 ?? '?'}` : c.section_mm2 ? `${c.section_mm2}mm²` : ''].filter(Boolean).join(' ');
        parts.push(`<rect x="${n.x - 60}" y="${cy - 12}" width="120" height="${14 * lines.length + 18}" rx="3" class="circ"/>`);
        lines.forEach((l, i) => parts.push(`<text x="${n.x}" y="${cy + i * 14 + 1}" class="t-c" text-anchor="middle">${esc(l)}</text>`));
        parts.push(`<text x="${n.x}" y="${cy + lines.length * 14 + 1}" class="t-s" text-anchor="middle">${esc(cable)}</text>`);
        cy += 14 * lines.length + 26;
      }
      bottom = cy;
    }
    maxY = Math.max(maxY, bottom + 20);
  };

  // gemeenschappelijke bus bovenaan
  if (roots.length) {
    const xs = roots.map((r) => r.x);
    parts.push(`<path d="M${Math.min(...xs)} ${Y0 - 28} H${Math.max(...xs)}" class="ln"/>`);
    parts.push(`<text x="${(Math.min(...xs) + Math.max(...xs)) / 2}" y="${Y0 - 40}" class="t-s" text-anchor="middle">Voeding</text>`);
  }
  roots.forEach((r) => draw(r, Y0, null, 0));

  let legend = '';
  if (unlinked.length) {
    const y = maxY + 24;
    legend = `<text x="40" y="${y}" class="t-w">Niet gekoppeld aan een zekering:</text>` +
      unlinked.map((c, i) => `<text x="40" y="${y + 16 * (i + 1)}" class="t-s">• ${esc(c.nr ?? '')} ${esc(c.name)}</text>`).join('');
    maxY = y + 16 * (unlinked.length + 1);
  }

  const H = maxY + 70;
  const meta = (opts.meta ?? []).map((m, i) => `<text x="${totalW - 40}" y="${H - 44 + i * 14}" text-anchor="end" class="t-s">${esc(m)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${H}" width="${totalW}" height="${H}" font-family="Poppins, Arial, sans-serif">
<style>
.ln{stroke:#1a1e1a;stroke-width:1.6;fill:none}
.box{fill:#fff;stroke:#1a1e1a;stroke-width:1.6}
.box-main{fill:#e6f5e6;stroke:#008000;stroke-width:2}
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

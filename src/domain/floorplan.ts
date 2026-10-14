import type { Shape } from './model';
import { esc } from '../lib/dom';

export interface Pt { x: number; y: number }
export const DEFAULT_PLAN_M = 15; // zonder ingestelde schaal gaan we uit van een plan van 15 m breed

export const FURNITURE: { id: string; label: string; w: number; h: number }[] = [
  { id: 'bed', label: 'Bed', w: 1.6, h: 2.0 }, { id: 'zetel', label: 'Zetel', w: 2.0, h: 0.9 }, { id: 'tafel', label: 'Tafel', w: 1.6, h: 0.9 },
  { id: 'kast', label: 'Kast', w: 1.2, h: 0.6 }, { id: 'aanrecht', label: 'Aanrecht', w: 2.4, h: 0.6 }, { id: 'bad', label: 'Bad', w: 1.7, h: 0.75 },
  { id: 'douche', label: 'Douche', w: 0.9, h: 0.9 }, { id: 'wc', label: 'WC', w: 0.4, h: 0.7 }, { id: 'lavabo', label: 'Lavabo', w: 0.6, h: 0.45 },
  { id: 'meubel', label: 'Meubel', w: 1.0, h: 0.6 },
];

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const wallPts = (w: Shape): [Pt, Pt] => [{ x: w.x1!, y: w.y1! }, { x: w.x2!, y: w.y2! }];

/** Dichtste punt op segment ab bij p; t = positie 0..1 langs het segment. */
export function projectOnSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return { t, q, d: dist(p, q) };
}

/** Dichtstbijzijnde muur bij p (binnen maxD px van de middenlijn), met de normaal naar de kant van p. */
export function nearestWall(walls: Shape[], p: Pt, maxD: number) {
  let best: { wall: Shape; t: number; q: Pt; d: number; n: Pt; u: Pt } | null = null;
  for (const w of walls) {
    const [a, b] = wallPts(w); const r = projectOnSeg(p, a, b);
    if (r.d > maxD || (best && r.d >= best.d)) continue;
    const L = dist(a, b) || 1, u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    let n = { x: -u.y, y: u.x };
    if ((p.x - r.q.x) * n.x + (p.y - r.q.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    best = { wall: w, ...r, n, u };
  }
  return best;
}

/** Punt waar de staart van een stopcontact komt (op het muuroppervlak) en de rotatie (graden) van het symbool. */
export function snapToWallSurface(walls: Shape[], p: Pt, scale: number, maxD: number) {
  const hit = nearestWall(walls, p, maxD + 0.12 * scale);
  if (!hit) return null;
  const half = ((hit.wall.thick ?? 0.2) * scale) / 2;
  return { x: hit.q.x + hit.n.x * half, y: hit.q.y + hit.n.y * half, rot: (Math.atan2(hit.n.y, hit.n.x) * 180) / Math.PI };
}

// ---------- tekenen ----------
const f = (n: number) => +n.toFixed(2);

export function openingGeom(op: Shape, wall: Shape, scale: number) {
  const [a, b] = wallPts(wall), L = dist(a, b) || 1, u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, n = { x: -u.y, y: u.x };
  const c = { x: a.x + (b.x - a.x) * (op.pos ?? 0.5), y: a.y + (b.y - a.y) * (op.pos ?? 0.5) };
  return { u, n, c, hw: ((op.size ?? 0.9) * scale) / 2, t: (wall.thick ?? 0.2) * scale };
}

export function renderFloor(shapes: Shape[], o: { scale: number; selId: string | null }): string {
  const { scale: S, selId } = o;
  const line = 0.012 * S, bold = 0.025 * S;
  const walls = shapes.filter((s) => s.kind === 'wall'), byId = new Map(walls.map((w) => [w.id, w]));
  const out: string[] = [];
  const sel = (s: Shape) => s.id === selId;

  // meubels en trappen onder de muren
  for (const s of shapes) {
    if (s.kind !== 'furniture' && s.kind !== 'stair') continue;
    const x = Math.min(s.x1!, s.x2!), y = Math.min(s.y1!, s.y2!), w = Math.abs(s.x2! - s.x1!), h = Math.abs(s.y2! - s.y1!);
    const g = [`<g data-sid="${s.id}" transform="rotate(${s.rot ?? 0} ${f(x + w / 2)} ${f(y + h / 2)})" style="cursor:pointer">`];
    if (s.kind === 'furniture') {
      g.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#f6f3ec" stroke="${sel(s) ? '#0066aa' : '#6b6b6b'}" stroke-width="${sel(s) ? bold : line}"/>`);
      if (s.sub === 'bed') g.push(`<rect x="${f(x + w * 0.08)}" y="${f(y + h * 0.05)}" width="${f(w * 0.38)}" height="${f(h * 0.16)}" fill="none" stroke="#6b6b6b" stroke-width="${line}"/><rect x="${f(x + w * 0.54)}" y="${f(y + h * 0.05)}" width="${f(w * 0.38)}" height="${f(h * 0.16)}" fill="none" stroke="#6b6b6b" stroke-width="${line}"/>`);
      if (s.sub === 'douche') g.push(`<path d="M${f(x)} ${f(y)} L${f(x + w)} ${f(y + h)} M${f(x + w)} ${f(y)} L${f(x)} ${f(y + h)}" stroke="#6b6b6b" stroke-width="${line}"/>`);
      if (s.sub === 'wc') g.push(`<ellipse cx="${f(x + w / 2)}" cy="${f(y + h * 0.6)}" rx="${f(w * 0.36)}" ry="${f(h * 0.3)}" fill="none" stroke="#6b6b6b" stroke-width="${line}"/>`);
      if (s.sub === 'lavabo') g.push(`<ellipse cx="${f(x + w / 2)}" cy="${f(y + h / 2)}" rx="${f(w * 0.36)}" ry="${f(h * 0.3)}" fill="none" stroke="#6b6b6b" stroke-width="${line}"/>`);
      if (s.sub === 'aanrecht') g.push(`<rect x="${f(x + w * 0.1)}" y="${f(y + h * 0.2)}" width="${f(w * 0.22)}" height="${f(h * 0.6)}" fill="none" stroke="#6b6b6b" stroke-width="${line}"/>`);
      const txt = s.label || (FURNITURE.find((x) => x.id === s.sub)?.label ?? '');
      if (txt && !['wc', 'lavabo', 'douche'].includes(s.sub ?? '')) g.push(`<text x="${f(x + w / 2)}" y="${f(y + h / 2 + Math.min(w, h) * 0.08)}" text-anchor="middle" font-size="${f(Math.min(Math.min(w, h) * 0.22, 0.28 * S))}" fill="#555" font-family="Arial">${esc(txt)}</text>`);
    } else {
      const horiz = w >= h, len = horiz ? w : h, steps = Math.max(2, Math.round(len / (0.27 * S)));
      g.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#fff" stroke="${sel(s) ? '#0066aa' : '#000'}" stroke-width="${sel(s) ? bold : line * 1.4}"/>`);
      for (let i = 1; i < steps; i++) { const d = (len * i) / steps; g.push(horiz ? `<path d="M${f(x + d)} ${f(y)} V${f(y + h)}" stroke="#000" stroke-width="${line}"/>` : `<path d="M${f(x)} ${f(y + d)} H${f(x + w)}" stroke="#000" stroke-width="${line}"/>`); }
      const cx = x + w / 2, cy = y + h / 2, ah = 0.12 * S;
      g.push(horiz ? `<path d="M${f(x + ah)} ${f(cy)} H${f(x + w - ah)} M${f(x + w - ah * 2)} ${f(cy - ah)} L${f(x + w - ah)} ${f(cy)} L${f(x + w - ah * 2)} ${f(cy + ah)}" fill="none" stroke="#000" stroke-width="${line}"/>`
        : `<path d="M${f(cx)} ${f(y + h - ah)} V${f(y + ah)} M${f(cx - ah)} ${f(y + ah * 2)} L${f(cx)} ${f(y + ah)} L${f(cx + ah)} ${f(y + ah * 2)}" fill="none" stroke="#000" stroke-width="${line}"/>`);
      if (s.label) g.push(`<text x="${f(cx)}" y="${f(y - 0.08 * S)}" text-anchor="middle" font-size="${f(0.22 * S)}" font-family="Arial">${esc(s.label)}</text>`);
    }
    g.push('</g>'); out.push(g.join(''));
  }

  // muren: eerst alle omtrekken, dan alle vullingen → één gesloten silhouet zonder lijnen op de knooppunten
  const wd = (w: Shape) => (w.thick ?? 0.2) * S;
  for (const w of walls) out.push(`<path d="M${f(w.x1!)} ${f(w.y1!)} L${f(w.x2!)} ${f(w.y2!)}" stroke="#000" stroke-width="${f(wd(w) + bold)}" stroke-linecap="square" fill="none"/>`);
  for (const w of walls) out.push(`<path data-sid="${w.id}" d="M${f(w.x1!)} ${f(w.y1!)} L${f(w.x2!)} ${f(w.y2!)}" stroke="${sel(w) ? '#6fa8d6' : '#a8a8a8'}" stroke-width="${f(wd(w))}" stroke-linecap="square" fill="none" style="cursor:pointer"/>`);

  // ramen en deuren in de muur
  for (const s of shapes) {
    if (s.kind !== 'window' && s.kind !== 'door') continue;
    const wall = s.ref_id ? byId.get(s.ref_id) : null; if (!wall) continue;
    const { u, n, c, hw, t } = openingGeom(s, wall, S);
    const P = (a: number, b: number) => `${f(c.x + u.x * a + n.x * b)} ${f(c.y + u.y * a + n.y * b)}`;
    const g = [`<g data-sid="${s.id}" style="cursor:pointer">`];
    g.push(`<path d="M${P(-hw, 0)} L${P(hw, 0)}" stroke="${sel(s) ? '#cfe3f5' : '#fff'}" stroke-width="${f(t + bold * 0.6)}" stroke-linecap="butt"/>`);
    g.push(`<path d="M${P(-hw, -t / 2)} L${P(-hw, t / 2)} M${P(hw, -t / 2)} L${P(hw, t / 2)}" stroke="#000" stroke-width="${f(bold)}"/>`);
    if (s.kind === 'window') {
      g.push(`<path d="M${P(-hw, -t / 2)} L${P(hw, -t / 2)} M${P(-hw, t / 2)} L${P(hw, t / 2)} M${P(-hw, 0)} L${P(hw, 0)}" stroke="#000" stroke-width="${f(line)}"/>`);
    } else {
      const side = (s.flip ?? 0) & 1 ? -1 : 1, hinge = (s.flip ?? 0) & 2 ? -1 : 1, r = hw * 2;
      const H = { x: c.x + u.x * hw * hinge, y: c.y + u.y * hw * hinge }, C = { x: c.x - u.x * hw * hinge, y: c.y - u.y * hw * hinge };
      const L = { x: H.x + n.x * side * r, y: H.y + n.y * side * r };
      const cross = (C.x - H.x) * (L.y - H.y) - (C.y - H.y) * (L.x - H.x);
      g.push(`<path d="M${f(H.x)} ${f(H.y)} L${f(L.x)} ${f(L.y)}" stroke="#000" stroke-width="${f(line * 1.3)}"/>`, `<path d="M${f(C.x)} ${f(C.y)} A${f(r)} ${f(r)} 0 0 ${cross > 0 ? 1 : 0} ${f(L.x)} ${f(L.y)}" fill="none" stroke="#000" stroke-width="${f(line)}"/>`);
    }
    g.push('</g>'); out.push(g.join(''));
  }

  // tekst bovenaan
  for (const s of shapes) {
    if (s.kind !== 'text') continue;
    out.push(`<text data-sid="${s.id}" x="${f(s.x1!)}" y="${f(s.y1!)}" text-anchor="middle" font-size="${f((s.size ?? 0.4) * S)}" font-weight="600" font-family="Arial" fill="${sel(s) ? '#0066aa' : '#111'}" style="cursor:pointer">${esc(s.label ?? '')}</text>`);
  }
  return out.join('\n');
}

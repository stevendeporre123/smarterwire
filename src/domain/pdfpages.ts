// Pagina's voor de PDF-export: A4 liggend (297 × 210 mm) met kader en titelblok, zoals op het voorbeeld-eendraadschema.
import type { Board, Circuit, Device, Plan, Project, Shape, Symbol_ } from './model';
import type { Installer } from './settings';
import { buildDiagram, type DiagramSymbol } from './diagram';
import { cableLabel, polesLabel, supplyOf, supplyText, supplyExtra } from './devices';
import { renderFloor, DEFAULT_PLAN_M } from './floorplan';
import { symbolEntry, symbolMarkup } from './areisymbols';
import { circuitColor } from './symbols';
import { esc } from '../lib/dom';

export interface PdfPlan { plan: Plan; shapes: Shape[]; symbols: Symbol_[]; photoUrl: string | null }
export interface PdfPhoto { board: Board; url: string; w: number; h: number }
export interface PdfData {
  project: Project; installer: Installer; boards: Board[]; devices: Device[]; circuits: Circuit[]; symbols: DiagramSymbol[]; plans: PdfPlan[]; photos: PdfPhoto[];
}
export interface PdfOptions { states: ('bestaand' | 'nieuw')[]; plans: boolean; photos: boolean; list: boolean; photoOnPlans: boolean }

const PW = 297, PH = 210, FM = 5;               // pagina en kader
const CX = 10, CY = 10, CW = 277;                // inhoudsgebied
const TB_Y = 175, TB_H = 30, TB_X = 102;         // titelblok rechtsonder
const CH = TB_Y - 3 - CY;                        // hoogte inhoudsgebied
const MAX_SHEET_PX = 1600;                       // brede schema's worden over meerdere pagina's verdeeld

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const lines = (s?: string | null) => (s ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const natural = (a: string, b: string) => a.localeCompare(b, 'nl', { numeric: true });
const txt = (x: number, y: number, s: string, o: { size?: number; bold?: boolean; anchor?: string; fill?: string } = {}) =>
  `<text x="${x}" y="${y}" font-size="${o.size ?? 2.6}" ${o.bold ? 'font-weight="700"' : ''} ${o.anchor ? `text-anchor="${o.anchor}"` : ''} ${o.fill ? `fill="${o.fill}"` : ''}>${esc(s)}</text>`;

interface Sheet { title: string; body: string }

/** Kader + titelblok rond de inhoud van één pagina. */
function framePage(d: PdfData, sh: Sheet, n: number, total: number): string {
  const p = d.project, inst = d.installer, s = supplyOf(p);
  const hasInsp = !!(p.inspector || p.inspector_info);
  const widths = hasInsp ? [50, 62, 38, 40] : [60, 82, 0, 48];
  let x = TB_X;
  const cols = widths.map((w) => { const c = { x, w }; x += w; return c; });
  const out: string[] = [`<rect x="${FM}" y="${FM}" width="${PW - 2 * FM}" height="${PH - 2 * FM}" fill="none" stroke="#000" stroke-width="0.5"/>`, sh.body];
  out.push(`<rect x="${TB_X}" y="${TB_Y}" width="${PW - FM - TB_X}" height="${PH - FM - TB_Y}" fill="#fff" stroke="#000" stroke-width="0.4"/>`);
  const col = (i: number) => cols[i];
  for (let i = 1; i < 4; i++) if (widths[i]) out.push(`<path d="M${col(i).x} ${TB_Y} V${PH - FM}" stroke="#000" stroke-width="0.3"/>`);
  const ty = TB_Y + 4;
  // plaats van de installatie
  out.push(txt(col(0).x + 2, ty, 'Plaats van de elektrische installatie', { bold: true }));
  [p.owner ?? '', ...lines(p.address)].filter(Boolean).slice(0, 6).forEach((l, i) => out.push(txt(col(0).x + 4, ty + 3.6 * (i + 1), clip(l, Math.floor(col(0).w / 1.3)))));
  // installateur
  const ic = col(1), logoW = d.installer.logo ? 22 : 0;
  out.push(txt(ic.x + 2, ty, 'Installateur', { bold: true }));
  [inst.name, ...lines(inst.address), inst.phone && `GSM: ${inst.phone}`, inst.email && `e-mail: ${inst.email}`, inst.vat].filter(Boolean).slice(0, 7)
    .forEach((l, i) => out.push(txt(ic.x + 4, ty + 3.6 * (i + 1), clip(String(l), Math.floor((ic.w - 4 - logoW) / 1.3)))));
  if (inst.logo) out.push(`<image href="${inst.logo}" x="${ic.x + ic.w - logoW - 1}" y="${TB_Y + 8}" width="${logoW}" height="14" preserveAspectRatio="xMaxYMid meet"/>`);
  // keuring
  if (hasInsp) {
    const kc = col(2);
    out.push(txt(kc.x + 2, ty, 'Keuring', { bold: true }));
    [p.inspector ?? '', ...lines(p.inspector_info)].filter(Boolean).slice(0, 7).forEach((l, i) => out.push(txt(kc.x + 4, ty + 3.6 * (i + 1), clip(l, Math.floor(kc.w / 1.3)), { bold: i === 0 && !!p.inspector })));
  }
  // pagina, titel, stroomtype
  const pc = col(3);
  out.push(txt(pc.x + 2, ty, `p. ${n}/${total}`, { bold: true }), txt(pc.x + 2, ty + 3.6, clip(sh.title, Math.floor(pc.w / 1.3)), { bold: true }),
    `<path d="M${pc.x} ${ty + 5.2} H${PW - FM}" stroke="#000" stroke-width="0.3"/>`, txt(pc.x + 2, ty + 9, supplyText(s)),
    `<path d="M${pc.x} ${ty + 10.8} H${PW - FM}" stroke="#000" stroke-width="0.3"/>`, txt(pc.x + 2, ty + 14.4, supplyExtra(s, p.supply_amp)));
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${PW} ${PH}" width="${PW}mm" height="${PH}mm" font-family="Arial, Helvetica, sans-serif">
<rect width="${PW}" height="${PH}" fill="#fff"/>
${out.join('\n')}
</svg>`;
}

/** Een (genest) SVG-stuk met eigen viewBox op positie/grootte in mm zetten. */
const place = (svg: string, x: number, y: number, w: number, h: number) =>
  svg.replace(/^<svg /, `<svg x="${x}" y="${y}" `).replace(/ width="[^"]*" height="[^"]*"/, ` width="${w}" height="${h}"`);

// ---------- eendraadschema ----------
function schemaSheets(d: PdfData, which: 'bestaand' | 'nieuw', multi: boolean): Sheet[] {
  const boards = d.boards.filter((b) => b.kind === which).map((board) => ({ board, devices: d.devices.filter((x) => x.board_id === board.id) }));
  if (!boards.length) return [];
  const base = { title: '', boards, circuits: d.circuits, symbols: d.symbols, which, supply: supplyOf(d.project), ean: d.project.ean, supplyCable: d.project.supply_cable };
  const full = buildDiagram(base);
  // pagina-indeling: breek af op het einde van een kring of groep, bij voorkeur tussen groepen (laagste niveau), anders zo ver mogelijk
  const ranges: { x0: number; x1: number; cont: boolean }[] = [];
  const cuts = full.cuts.slice().sort((a, b) => a.x - b.x || a.depth - b.depth);
  const contentEnd = Math.max(...cuts.map((c) => c.x)); // daarna komt er niets meer
  let start = 0, cont = false;
  while (start < contentEnd - 1) {
    const hard = cuts.find((c) => c.hard && c.x > start + 1);
    const inWindow = cuts.filter((c) => !c.hard && c.x > start + 40 && c.x - start <= MAX_SHEET_PX && (!hard || c.x < hard.x));
    if (hard && hard.x - start <= MAX_SHEET_PX) { ranges.push({ x0: start, x1: hard.x, cont }); start = hard.x; cont = false; continue; }
    if (!hard && contentEnd - start <= MAX_SHEET_PX) { ranges.push({ x0: start, x1: contentEnd, cont }); break; }
    // laagste niveau dat nog minstens 55% van de pagina vult, anders de verste kans
    const good = inWindow.filter((c) => c.x - start >= MAX_SHEET_PX * 0.55);
    const pool = good.length ? good : inWindow;
    const best = pool.length ? pool.reduce((a, c) => (c.depth < a.depth || (c.depth === a.depth && c.x > a.x) ? c : a)) : null;
    const end = best ? best.x : Math.min(start + MAX_SHEET_PX, hard?.x ?? full.width);
    ranges.push({ x0: start, x1: end, cont }); start = end; cont = true;
  }
  const label = which === 'nieuw' ? 'nieuwe toestand' : 'bestaande toestand';
  return ranges.map((r, i) => {
    const part = buildDiagram({ ...base, crop: [r.x0, r.x1] });
    const k = Math.min(CW / part.width, CH / part.height, 0.3);
    const w = part.width * k, h = part.height * k;
    let body = place(part.svg, CX, CY, w, h);
    if (r.cont) body += txt(CX, CY + 3, '← vervolg van vorige pagina', { size: 2.6, fill: '#555' });
    if (i < ranges.length - 1 && ranges[i + 1].cont) body += txt(CX + CW, CY + CH - 1, 'vervolg op volgende pagina →', { size: 2.6, anchor: 'end', fill: '#555' });
    return { title: `Eendraadschema${multi ? ' – ' + label : ''}`, body };
  });
}

// ---------- situatieplan ----------
function planSheet(d: PdfData, pp: PdfPlan, photoOnPlans: boolean): Sheet | null {
  const { plan, shapes, symbols } = pp;
  if (!shapes.length && !symbols.length) return null;
  const W = plan.w ?? 3000, H = plan.h ?? 2100, scale = plan.scale ?? W / DEFAULT_PLAN_M, S = W * 0.022, kk = S / 10;
  const order = d.circuits.map((c) => c.id);
  let inner = '';
  if (photoOnPlans && pp.photoUrl) inner += `<image href="${pp.photoUrl}" x="0" y="0" width="${W}" height="${H}" opacity="0.35"/>`;
  inner += renderFloor(shapes, { scale, selId: null, cableColor: (id) => circuitColor(id, order) });
  const used = new Set<string>();
  for (const sym of symbols) {
    if (sym.circuit_id) used.add(sym.circuit_id);
    const col = sym.circuit_id ? circuitColor(sym.circuit_id, order) : '#000000';
    inner += `<g transform="translate(${sym.x * W} ${sym.y * H}) rotate(${sym.rot})">${symbolEntry(sym.type) ? symbolMarkup(sym.type, 'plan', 0, 0, kk, 0, 2.2, col) : ''}</g>`;
    if (sym.label) inner += `<text x="${sym.x * W + S * 0.9}" y="${sym.y * H + 4}" font-size="${S * 0.55}" font-weight="600" fill="${col}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(sym.label)}</text>`;
  }
  for (const s of shapes) if (s.kind === 'cable' && s.ref_id) used.add(s.ref_id);
  // uitsnede rond de tekening
  const xs: number[] = [], ys: number[] = [];
  for (const s of shapes) { for (const v of [s.x1, s.x2]) if (v != null) xs.push(v); for (const v of [s.y1, s.y2]) if (v != null) ys.push(v); }
  for (const s of symbols) { xs.push(s.x * W); ys.push(s.y * H); }
  const pad = 0.6 * scale;
  const bx = xs.length ? Math.max(0, Math.min(...xs) - pad) : 0, by = ys.length ? Math.max(0, Math.min(...ys) - pad) : 0;
  const bw = xs.length ? Math.min(W, Math.max(...xs) + pad) - bx : W, bh = ys.length ? Math.min(H, Math.max(...ys) + pad) - by : H;
  const legend = d.circuits.filter((c) => used.has(c.id)).sort((a, b) => natural(a.nr ?? '', b.nr ?? ''));
  const LW = legend.length ? 56 : 0, aw = CW - LW - (LW ? 4 : 0);
  const k = Math.min(aw / bw, CH / bh), w = bw * k, h = bh * k;
  let body = `<svg x="${CX}" y="${CY}" width="${w}" height="${h}" viewBox="${bx} ${by} ${bw} ${bh}" overflow="hidden">${inner}</svg>`;
  const mmPerM = k * scale, ratio = Math.round(1000 / mmPerM / 5) * 5;
  body += txt(CX, CY + h + 4, `Schaal ca. 1:${ratio || 1} (A4)${plan.scale ? '' : ' – schaal niet ingesteld'}`, { size: 2.4, fill: '#555' });
  if (legend.length) {
    const lx = CX + CW - LW;
    body += txt(lx, CY + 3, 'Kringen', { bold: true, size: 2.8 });
    legend.slice(0, 30).forEach((c, i) => {
      const y = CY + 8 + i * 5;
      body += `<rect x="${lx}" y="${y - 2.6}" width="3.4" height="3.4" fill="${circuitColor(c.id, order)}"/>` + txt(lx + 5, y, `${c.nr ?? ''}  ${clip(c.name, 28)}`, { size: 2.6 });
    });
  }
  return { title: `Situatieplan – ${clip(plan.name, 18)}`, body };
}

// ---------- foto's ----------
function photoSheets(d: PdfData): Sheet[] {
  const out: Sheet[] = [];
  for (let i = 0; i < d.photos.length; i += 2) {
    const pair = d.photos.slice(i, i + 2), cw = (CW - (pair.length - 1) * 6) / pair.length;
    out.push({ title: 'Foto zekeringskast', body: pair.map((ph, j) => {
      const x = CX + j * (cw + 6);
      return txt(x, CY + 3, ph.board.name, { bold: true }) + `<image href="${ph.url}" x="${x}" y="${CY + 6}" width="${cw}" height="${CH - 8}" preserveAspectRatio="xMidYMid meet"/>`;
    }).join('') });
  }
  return out;
}

// ---------- lijst kringen ----------
function listSheets(d: PdfData, which: 'bestaand' | 'nieuw', multi: boolean): Sheet[] {
  const devs = new Map(d.devices.map((x) => [x.id, x]));
  const rows = d.circuits.filter((c) => (which === 'nieuw' ? c.new_device_id : c.device_id) && devs.has((which === 'nieuw' ? c.new_device_id : c.device_id)!))
    .sort((a, b) => natural(a.nr ?? '', b.nr ?? ''));
  if (!rows.length) return [];
  const protection = (c: Circuit) => {
    const dv = devs.get((which === 'nieuw' ? c.new_device_id : c.device_id)!)!, par = dv.parent_id ? devs.get(dv.parent_id) : null;
    const main = [polesLabel(dv.poles), `${dv.curve ?? ''}${dv.rating_a ?? '?'}A`].filter(Boolean).join(' ');
    return par && par.kind === 'differentieel' ? `${main}  ·  Δ${par.sens_ma ?? 30}mA${par.label ? ' (' + par.label + ')' : ''}` : main;
  };
  const RH = 6.2, per = Math.floor((CH - 9) / RH), label = which === 'nieuw' ? 'nieuwe toestand' : 'bestaande toestand';
  const X = [CX, CX + 16, CX + 118, CX + 172];
  const sheets: Sheet[] = [];
  for (let i = 0; i < rows.length; i += per) {
    let b = `<rect x="${CX}" y="${CY}" width="${CW}" height="7" fill="#e6e9ee"/>` + ['Kring', 'Omschrijving', 'Beveiliging', 'Kabel'].map((h, k) => txt(X[k] + 2, CY + 4.8, h, { bold: true, size: 3 })).join('');
    rows.slice(i, i + per).forEach((c, r) => {
      const y = CY + 7 + r * RH;
      if (r % 2 === 0) b += `<rect x="${CX}" y="${y}" width="${CW}" height="${RH}" fill="#f3f5f8"/>`;
      const name = /^Kring /.test(c.name) ? '' : c.name;
      b += txt(X[0] + 2, y + 4.3, c.nr ?? '', { bold: true, size: 3.6 }) + txt(X[1] + 2, y + 4.2, clip(name, 62), { size: 3.2 })
        + txt(X[2] + 2, y + 4.2, clip(protection(c), 34), { size: 3.2 }) + txt(X[3] + 2, y + 4.2, clip(cableLabel(c), 44), { size: 3.2 });
    });
    sheets.push({ title: `Lijst kringen${multi ? ' – ' + label : ''}`, body: b });
  }
  return sheets;
}

/** Alle pagina's als volledige SVG-strings (A4 liggend). */
export function buildPdfPages(d: PdfData, o: PdfOptions): string[] {
  const multi = o.states.length > 1, sheets: Sheet[] = [];
  for (const st of o.states) sheets.push(...schemaSheets(d, st, multi));
  if (o.plans) for (const pp of d.plans) { const s = planSheet(d, pp, o.photoOnPlans); if (s) sheets.push(s); }
  if (o.photos) sheets.push(...photoSheets(d));
  if (o.list) for (const st of o.states) sheets.push(...listSheets(d, st, multi));
  return sheets.map((s, i) => framePage(d, s, i + 1, sheets.length));
}

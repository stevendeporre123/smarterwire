// Pagina's voor de PDF-export: A4 liggend (297 × 210 mm) met kader en titelblok, zoals op het voorbeeld-eendraadschema.
import type { Board, Circuit, Device, Plan, Project, Shape, Symbol_ } from './model';
import type { Installer } from './settings';
import { buildDiagram, type DiagramSymbol } from './diagram';
import { cableLabel, polesLabel, supplyOf, supplyText, supplyExtra, deviceTitle, devicePlaces } from './devices';
import { runChecks } from './checks';
import { buildBom, type BomEntry } from './bom';
import { renderFloor, DEFAULT_PLAN_M } from './floorplan';
import { symbolEntry, symbolMarkup } from './areisymbols';
import { circuitColor } from './symbols';
import { esc } from '../lib/dom';

export interface PdfPlan { plan: Plan; shapes: Shape[]; symbols: Symbol_[]; photoUrl: string | null }
export interface PdfPhoto { board: Board; url: string; w: number; h: number }
export interface PdfData {
  project: Project; installer: Installer; boards: Board[]; devices: Device[]; circuits: Circuit[]; symbols: DiagramSymbol[]; plans: PdfPlan[]; photos: PdfPhoto[];
  /** merk/referentie per regel van de materiaallijst (door de installateur ingevuld) */
  bomEntries?: Record<string, BomEntry>;
}
export interface PdfOptions { states: ('bestaand' | 'nieuw')[]; plans: boolean; photos: boolean; list: boolean; photoOnPlans: boolean; /** klantdocument "Voorstel nieuwe kast" i.p.v. het keuringsdossier */ proposal?: boolean }

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
  [p.owner ?? '', ...lines(p.address), p.ean ? `EAN ${p.ean}` : ''].filter(Boolean).slice(0, 6).forEach((l, i) => out.push(txt(col(0).x + 4, ty + 3.6 * (i + 1), clip(l, Math.floor(col(0).w / 1.3)))));
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
    `<path d="M${pc.x} ${ty + 10.8} H${PW - FM}" stroke="#000" stroke-width="0.3"/>`, txt(pc.x + 2, ty + 14.4, supplyExtra(s, p.supply_amp)),
    `<path d="M${pc.x} ${ty + 16.2} H${PW - FM}" stroke="#000" stroke-width="0.3"/>`, txt(pc.x + 2, ty + 20, `Datum: ${new Date().toLocaleDateString('nl-BE')}`));
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
  const base = { title: '', boards, circuits: d.circuits, symbols: d.symbols, which, supply: supplyOf(d.project), ean: d.project.ean, supplyCable: d.project.supply_cable, supplyAmp: d.project.supply_amp };
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

// ---------- voorstel nieuwe kast (klantdocument) ----------
const rect = (x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; sw?: number } = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? 'none'}" stroke-width="${o.sw ?? 0.3}"/>`;

function coverSheet(d: PdfData): Sheet {
  const p = d.project, nb = d.boards.filter((b) => b.kind === 'nieuw'), ds = d.devices.filter((x) => nb.some((b) => b.id === x.board_id));
  const diffs = ds.filter((x) => x.kind === 'differentieel').length, autos = ds.filter((x) => x.kind === 'automaat' || x.kind === 'aardlekautomaat').length;
  let b = txt(CX + 6, CY + 24, 'Voorstel nieuwe zekeringskast', { size: 11, bold: true });
  const info: [string, string][] = [['Klant', p.client || p.owner || ''], ['Adres installatie', (p.address ?? '').replace(/\r?\n/g, ', ')], ['Datum', new Date().toLocaleDateString('nl-BE')],
    ['Installateur', [d.installer.name, d.installer.phone, d.installer.email].filter(Boolean).join(' · ')]];
  info.filter(([, v]) => v).forEach(([k, v], i) => { b += txt(CX + 6, CY + 44 + i * 9, k, { size: 3, fill: '#555' }) + txt(CX + 46, CY + 44 + i * 9, clip(v, 90), { size: 3.6, bold: true }); });
  b += txt(CX + 6, CY + 92, 'Wat u in dit voorstel vindt', { size: 3.6, bold: true });
  ['1. De opstelling van de nieuwe kast, rij per rij', '2. Het eendraadschema van de nieuwe toestand', '3. Per kring: wat er verandert tegenover de huidige kast en waarom', '4. Aandachtspunten die we bij de controle vaststelden', '5. Het materiaal dat we voorzien']
    .forEach((l, i) => { b += txt(CX + 10, CY + 100 + i * 6.5, l, { size: 3.2 }); });
  b += txt(CX + 6, CY + 144, `${d.circuits.filter((c) => c.new_device_id).length} kring(en) · ${diffs} differentieel(en) · ${autos} automaten`, { size: 3, fill: '#555' });
  b += txt(CX + 6, CY + 152, 'Dit is een voorstel: zekeringwaarden volgen de kabeldoorsnede en worden ter plaatse nagekeken. Het vervangt de keuring niet.', { size: 2.6, fill: '#555' });
  return { title: 'Voorstel nieuwe kast', body: b };
}

function boardLayoutSheets(d: PdfData): Sheet[] {
  const out: Sheet[] = [], byDev = new Map<string, Circuit[]>();
  for (const c of d.circuits) if (c.new_device_id) (byDev.get(c.new_device_id) ?? byDev.set(c.new_device_id, []).get(c.new_device_id)!).push(c);
  for (const board of d.boards.filter((b) => b.kind === 'nieuw')) {
    const ds = d.devices.filter((x) => x.board_id === board.id);
    if (!ds.length) continue;
    const rows = new Map<number, Device[]>();
    for (const x of ds) (rows.get(x.row_no) ?? rows.set(x.row_no, []).get(x.row_no)!).push(x);
    const keys = [...rows.keys()].sort((a, b) => a - b), widest = Math.max(...keys.map((k) => rows.get(k)!.reduce((s, x) => s + (x.modules || 1), 0)));
    const U = Math.min(11, (CW - 24) / Math.max(widest, 8)), RH = 64, per = Math.max(1, Math.floor((CH - 8) / RH));
    for (let i = 0; i < keys.length; i += per) {
      let b = txt(CX, CY + 3, `${board.name}${keys.length > per ? ` (rij ${keys[i] + 1}–${keys[Math.min(i + per, keys.length) - 1] + 1})` : ''}`, { bold: true, size: 3.2 });
      keys.slice(i, i + per).forEach((rk, r) => {
        const y0 = CY + 8 + r * RH;
        b += txt(CX, y0 + 11, `R${rk + 1}`, { size: 2.6, fill: '#555' }) + rect(CX + 8, y0 + 12.5, widest * U + 4, 1.2, { fill: '#b5bdb5' });
        let x = CX + 10;
        for (const dev of rows.get(rk)!.sort((a, b) => a.pos - b.pos)) {
          const w = Math.max(0.5, dev.modules || 1) * U - 0.6, main = dev.kind === 'differentieel' || dev.kind === 'hoofd', cs = byDev.get(dev.id) ?? [];
          b += rect(x, y0, w, 24, { fill: main ? '#e3f0e3' : '#ececec', stroke: main ? '#008000' : '#555e55', sw: 0.35 });
          b += txt(x + w / 2, y0 + 7, `${dev.curve ?? ''}${dev.rating_a ?? ''}`, { size: Math.min(3.2, w / 2.6), bold: true, anchor: 'middle' }) + txt(x + w / 2, y0 + 11.5, dev.sens_ma ? `${dev.sens_ma}mA` : '', { size: 2, anchor: 'middle', fill: '#555' });
          b += rect(x + w / 2 - 1.6, y0 + 14, 3.2, 6, { fill: '#2b312b' });
          if (dev.phase) b += txt(x + w / 2, y0 + 23, dev.phase, { size: 1.9, anchor: 'middle', fill: '#0066aa' });
          const nm = main ? (dev.label ?? deviceTitle(dev)) : cs.map((c) => c.name).join(' / ');
          if (cs.length) b += txt(x + w / 2, y0 + 28, cs.map((c) => c.nr ?? '').join('+'), { size: 2.8, bold: true, anchor: 'middle', fill: '#008000' });
          if (nm) b += `<text x="0" y="0" transform="translate(${x + w / 2 + 0.8} ${y0 + 31}) rotate(90)" font-size="2.2">${esc(clip(nm, 24))}</text>`;
          x += w + 0.6;
        }
      });
      out.push({ title: 'Opstelling nieuwe kast', body: b });
    }
  }
  return out;
}

/** Wat er verandert van de oude naar de nieuwe zekering, in gewone taal. */
function changeText(o: Device | undefined, n: Device | undefined, op: Device | undefined, np: Device | undefined): string {
  if (!n) return '';
  if (!o) return 'nieuwe zekering';
  const bits: string[] = [];
  const spec = (x: Device) => `${x.curve ?? ''}${x.rating_a ?? '?'}A`;
  if (spec(o) !== spec(n)) bits.push(`${spec(o)} → ${spec(n)}`);
  const oldSens = op?.kind === 'differentieel' ? op.sens_ma : undefined;
  if (!op || op.kind !== 'differentieel') bits.push('nu met 30 mA-bescherming');
  else if ((oldSens ?? 0) > 30 && np?.sens_ma === 30) bits.push(`${oldSens} mA → 30 mA`);
  if (op?.dtype === 'AC' && np?.dtype && np.dtype !== 'AC') bits.push(`differentieel type AC → ${np.dtype}`);
  if (n.phase) bits.push(`fase ${n.phase}`);
  return bits.join(', ') || 'ongewijzigd';
}

function mappingSheets(d: PdfData): Sheet[] {
  const byId = new Map(d.devices.map((x) => [x.id, x])), at = new Map<string, string>();
  for (const b of d.boards) for (const [id, pl] of devicePlaces(d.devices.filter((x) => x.board_id === b.id))) at.set(id, pl);
  const rows = d.circuits.filter((c) => c.new_device_id && byId.has(c.new_device_id)).sort((a, b) => natural(a.nr ?? '', b.nr ?? ''));
  if (!rows.length) return [];
  const RH = 6.8, per = Math.floor((CH - 9) / RH), X = [CX, CX + 14, CX + 74, CX + 116, CX + 158, CX + 190];
  const sheets: Sheet[] = [];
  for (let i = 0; i < rows.length; i += per) {
    let b = rect(CX, CY, CW, 7, { fill: '#e6e9ee' }) + ['Kring', 'Omschrijving', 'Nu (oude zekering)', 'Nieuw (automaat)', 'Differentieel', 'Wat verandert er'].map((hd, k) => txt(X[k] + 2, CY + 4.8, hd, { bold: true, size: 2.9 })).join('');
    rows.slice(i, i + per).forEach((c, r) => {
      const y = CY + 7 + r * RH, o = c.device_id ? byId.get(c.device_id) : undefined, n = byId.get(c.new_device_id!)!, np = n.parent_id ? byId.get(n.parent_id) : undefined, op = o?.parent_id ? byId.get(o.parent_id) : undefined;
      if (r % 2 === 0) b += rect(CX, y, CW, RH, { fill: '#f3f5f8' });
      const name = /^Kring /.test(c.name) ? '' : c.name;
      b += txt(X[0] + 2, y + 4.4, c.nr ?? '', { bold: true, size: 3.4 }) + txt(X[1] + 2, y + 4.4, clip(name, 34), { size: 2.9 })
        + txt(X[2] + 2, y + 4.4, clip(o ? `${at.get(o.id) ?? ''} · ${deviceTitle(o)}` : '—', 26), { size: 2.9 }) + txt(X[3] + 2, y + 4.4, clip(`${at.get(n.id) ?? ''} · ${deviceTitle(n)}`, 26), { size: 2.9 })
        + txt(X[4] + 2, y + 4.4, clip(np ? deviceTitle(np) : '—', 20), { size: 2.9 }) + txt(X[5] + 2, y + 4.4, clip(changeText(o, n, op, np), 62), { size: 2.9 });
    });
    sheets.push({ title: 'Oud → nieuw per kring', body: b });
  }
  return sheets;
}

function attentionSheets(d: PdfData): Sheet[] {
  const fs = runChecks({ circuits: d.circuits, devices: d.devices, loads: d.symbols, projectSupplyAmp: d.project.supply_amp }).filter((f) => f.level !== 'info' || f.state === 'nieuw');
  const sheets: Sheet[] = [];
  const per = Math.floor((CH - 14) / 12.5), col: Record<string, string> = { fout: '#c00', waarschuwing: '#b35c00', info: '#555' };
  const items = fs.length ? fs : null;
  if (!items) return [{ title: 'Aandachtspunten', body: txt(CX, CY + 6, 'Aandachtspunten', { bold: true, size: 3.6 }) + txt(CX, CY + 16, 'De ingebouwde controles vonden geen aandachtspunten. Dat dekt maar een deel van de keuring.', { size: 3 }) }];
  for (let i = 0; i < items.length; i += per) {
    let b = txt(CX, CY + 6, i ? 'Aandachtspunten (vervolg)' : 'Aandachtspunten', { bold: true, size: 3.6 }) + txt(CX + 60, CY + 6, 'Indicatieve controles; ze vervangen de keuring niet.', { size: 2.4, fill: '#555' });
    items.slice(i, i + per).forEach((f, r) => {
      const y = CY + 14 + r * 12.5;
      b += rect(CX, y - 3.6, 2.2, 9.6, { fill: col[f.level] }) + txt(CX + 5, y, `${f.level.toUpperCase()} · ${f.state === 'nieuw' ? 'nieuwe toestand' : 'bestaande toestand'}`, { size: 2.2, fill: col[f.level], bold: true })
        + txt(CX + 5, y + 3.8, clip(f.title, 120), { size: 3, bold: true }) + txt(CX + 5, y + 7.4, clip(`Oplossing: ${f.fix}`, 150), { size: 2.6 });
    });
    sheets.push({ title: 'Aandachtspunten', body: b });
  }
  return sheets;
}

function bomSheets(d: PdfData): Sheet[] {
  const lines = buildBom(d.boards, d.devices, d.circuits);
  if (!lines.length) return [];
  const RH = 6.2, per = Math.floor((CH - 16) / RH), X = [CX, CX + 20, CX + 150, CX + 215], sheets: Sheet[] = [];
  for (let i = 0; i < lines.length; i += per) {
    let b = rect(CX, CY, CW, 7, { fill: '#e6e9ee' }) + ['Aantal', 'Omschrijving', 'Merk / serie', 'Referentie'].map((hd, k) => txt(X[k] + 2, CY + 4.8, hd, { bold: true, size: 3 })).join('');
    lines.slice(i, i + per).forEach((l, r) => {
      const y = CY + 7 + r * RH, e = d.bomEntries?.[l.key];
      if (r % 2 === 0) b += rect(CX, y, CW, RH, { fill: '#f3f5f8' });
      b += txt(X[0] + 2, y + 4.3, String(l.qty), { bold: true, size: 3.4 }) + txt(X[1] + 2, y + 4.3, clip(l.description + (l.est ? ' (schatting)' : ''), 78), { size: 3 }) + txt(X[2] + 2, y + 4.3, clip(e?.brand ?? '', 30), { size: 3 }) + txt(X[3] + 2, y + 4.3, clip(e?.ref ?? '', 24), { size: 3 });
    });
    b += txt(CX, CY + CH - 2, 'Rail, klemmen en labels zijn schattingen. Prijzen en leverancier volgen in de offerte.', { size: 2.4, fill: '#555' });
    sheets.push({ title: 'Materiaallijst', body: b });
  }
  return sheets;
}

/** Alle pagina's als volledige SVG-strings (A4 liggend). */
export function buildPdfPages(d: PdfData, o: PdfOptions): string[] {
  if (o.proposal) {
    const sh: Sheet[] = [coverSheet(d), ...boardLayoutSheets(d), ...schemaSheets(d, 'nieuw', false), ...mappingSheets(d), ...attentionSheets(d), ...bomSheets(d)];
    return sh.map((s, i) => framePage(d, s, i + 1, sh.length));
  }
  const multi = o.states.length > 1, sheets: Sheet[] = [];
  for (const st of o.states) sheets.push(...schemaSheets(d, st, multi));
  if (o.plans) for (const pp of d.plans) { const s = planSheet(d, pp, o.photoOnPlans); if (s) sheets.push(s); }
  if (o.photos) sheets.push(...photoSheets(d));
  if (o.list) for (const st of o.states) sheets.push(...listSheets(d, st, multi));
  return sheets.map((s, i) => framePage(d, s, i + 1, sheets.length));
}

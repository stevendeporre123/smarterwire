import { h, svg, btn, icon, toast, clear } from '../lib/dom';
import { buildForm, formModal, panZoom, type FieldDef } from '../lib/ui';
import { upsert, softDelete, saveImage, assetUrl, assetSize } from '../db/repo';
import { plansOf, symbolsOf, circuitsOf, boardsOf, type Plan, type Project, type Symbol_ } from '../domain/model';
import { circuitColor } from '../domain/symbols';
import { CATALOG, areiSymbol, areiSize, symbolEntry } from '../domain/areisymbols';
import { editCircuit } from './circuits';

const LS = (pid: string) => `smarterwire.plan.${pid}`;
const SYM_SIZE = 0.022; // basisgrootte als fractie van de plan-breedte; schaalbaar via 'Symboolgrootte'
const LS_SIZE = 'smarterwire.symsize', LS_LABEL = 'smarterwire.labelsize';
const pct = (k: string) => Math.min(300, Math.max(30, Number(localStorage.getItem(k)) || 100));

export async function renderPlan(root: HTMLElement, project: Project) {
  const plans = await plansOf(project.id);
  const reload = () => { clear(root); return renderPlan(root, project); };
  const fileInput = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } }) as HTMLInputElement;

  const addPlan = () => {
    fileInput.onchange = async () => {
      const f = fileInput.files?.[0]; if (!f) return;
      const name = prompt('Naam van het plan', `Verdieping ${plans.length}`) ?? 'Plan';
      const img = await saveImage(f, 3200);
      const p = await upsert('plan', { project_id: project.id, name, asset_id: img.id, level: String(plans.length) });
      localStorage.setItem(LS(project.id), p.id); reload();
    };
    fileInput.click();
  };

  if (!plans.length) {
    root.append(h('div', { class: 'page' }, h('div', { class: 'card empty-state' }, icon('Map', 40), h('h3', null, 'Voeg een plattegrond toe'),
      h('p', null, 'Foto, scan of schets van elke verdieping. Daarop plaats je stopcontacten, lichtpunten… en koppel je ze aan een kring.'),
      fileInput, btn('Plan opladen', { icon: 'Upload', variant: 'primary', onClick: addPlan }))));
    return;
  }

  let planId = localStorage.getItem(LS(project.id)); if (!plans.find((p) => p.id === planId)) planId = plans[0].id;
  const plan = plans.find((p) => p.id === planId)!;
  const [symbols, circuits, boards] = await Promise.all([symbolsOf(plan.id), circuitsOf(project.id), boardsOf(project.id)]);
  const order = circuits.map((c) => c.id);
  const url = await assetUrl(plan.asset_id), size = await assetSize(plan.asset_id!);
  const W = size!.width, H = size!.height;
  let S = W * SYM_SIZE * pct(LS_SIZE) / 100, LBL = pct(LS_LABEL) / 100;

  let tool: string | null = 'Stopcontact'; // symbool om te plaatsen; null = selecteren
  let selId: string | null = null;
  let activeCircuit: string | null = null; // nieuwe symbolen krijgen automatisch deze kring

  const planSel = h('select', { onChange: (e: Event) => { localStorage.setItem(LS(project.id), (e.target as HTMLSelectElement).value); reload(); } },
    plans.map((p) => h('option', { value: p.id, selected: p.id === plan.id }, p.name)));
  const circSel = h('select', { title: 'Nieuwe symbolen worden aan deze kring gekoppeld', onChange: (e: Event) => { activeCircuit = (e.target as HTMLSelectElement).value || null; } },
    h('option', { value: '' }, '— geen kring —'), circuits.map((c) => h('option', { value: c.id }, `${c.nr ?? ''} ${c.name}`)));

  const canvas = h('div', { class: 'canvas' }), side = h('div', { class: 'side' }), pal = h('div', { class: 'pal' });
  root.classList.add('page-full');
  root.append(
    h('div', { class: 'toolbar' }, planSel, fileInput,
      btn('', { icon: 'Plus', variant: 'ghost', title: 'Plan toevoegen', onClick: addPlan }),
      btn('', { icon: 'Pencil', variant: 'ghost', title: 'Plan hernoemen', onClick: () => formModal({ title: 'Plan', fields: [{ key: 'name', label: 'Naam', span: 2 }, { key: 'level', label: 'Niveau', span: 2 }], values: plan,
        onSave: async (v) => { await upsert('plan', { ...plan, ...v }); reload(); }, onDelete: async () => { await softDelete('plan', plan.id); reload(); } }) }),
      h('span', { class: 'hint' }, 'Symbool %'), h('input', { type: 'number', value: pct(LS_SIZE), min: 30, max: 300, step: 10, style: { width: '72px' }, onChange: (e: Event) => { localStorage.setItem(LS_SIZE, (e.target as HTMLInputElement).value); S = W * SYM_SIZE * pct(LS_SIZE) / 100; drawSyms(); } }),
      h('span', { class: 'hint' }, 'Label %'), h('input', { type: 'number', value: pct(LS_LABEL), min: 30, max: 300, step: 10, style: { width: '72px' }, onChange: (e: Event) => { localStorage.setItem(LS_LABEL, (e.target as HTMLInputElement).value); LBL = pct(LS_LABEL) / 100; drawSyms(); } }),
      h('span', { class: 'hint' }, 'Actieve kring:'), circSel,
      btn('Nieuwe kring', { icon: 'Plus', variant: 'ghost', onClick: () => editCircuit(project, {}, () => reload()) })),
    h('div', { class: 'split left-pal' }, pal, canvas, side));

  // palet
  function drawPal() {
    clear(pal);
    pal.append(h('button', { class: `pal-item ${tool === null ? 'active' : ''}`, onClick: () => { tool = null; drawPal(); } }, icon('MousePointer2', 18), 'Selecteren'));
    let g = '';
    for (const e of CATALOG.filter((x) => x.group !== 'Beschermingstoestellen')) {
      if (e.group !== g) { g = e.group; pal.append(h('h4', null, g)); }
      const sz = areiSize(e.planFile)!, ic = svg('svg', { width: 26, height: 22, viewBox: `0 0 ${sz.w + 2} ${sz.h + 2}`, preserveAspectRatio: 'xMidYMid meet' });
      ic.innerHTML = areiSymbol(e.planFile, (sz.w + 2) / 2, (sz.h + 2) / 2, 1, 0, { x: 0.5, y: 0.5 }, 1.6);
      pal.append(h('button', { class: `pal-item ${tool === e.id ? 'active' : ''}`, title: e.label, onClick: () => { tool = e.id; selId = null; drawPal(); drawSide(); } }, ic, e.label));
    }
  }

  // canvas
  const s = svg('svg', { preserveAspectRatio: 'xMidYMid meet' }) as SVGSVGElement;
  const pz = panZoom(s, W, H);
  s.append(svg('image', { href: url!, x: 0, y: 0, width: W, height: H }));
  const layer = svg('g'); s.append(layer);
  canvas.append(s);

  function drawSyms() {
    clear(layer);
    for (const sym of symbols) {
      const col = circuitColor(sym.circuit_id, order);
      const g = svg('g', { transform: `translate(${sym.x * W} ${sym.y * H}) rotate(${sym.rot})`, style: `color:${col};cursor:pointer` });
      const e = symbolEntry(sym.type), k = S / 10, sz = e && areiSize(e.planFile);
      // het ankerpunt (bij stopcontacten: de staart) ligt op (sym.x, sym.y); de krans loopt mee met het symbool
      const cx = e && sz ? sz.w * k * (0.5 - e.anchor.x) : 0, r = sz ? Math.max(sz.w, sz.h) * k * 0.62 : S * 0.75;
      g.append(svg('circle', { cx, r, fill: sym.id === selId ? 'rgba(0,102,170,.25)' : '#ffffff99', stroke: sym.circuit_id ? col : '#e07800', 'stroke-width': sym.id === selId ? 3 : 1.5, 'stroke-dasharray': sym.circuit_id ? '' : '4 3', 'vector-effect': 'non-scaling-stroke' }));
      const inner = svg('g'); inner.innerHTML = e ? areiSymbol(e.planFile, 0, 0, k, 0, e.anchor, 2.2) : `<circle r="${S * 0.4}" fill="none" stroke="currentColor"/>`; g.append(inner);
      g.addEventListener('pointerdown', (e) => startDrag(e, sym));
      layer.append(g);
      if (sym.label) layer.append(svg('text', { x: sym.x * W + S * 0.9, y: sym.y * H + 4, 'font-size': S * 0.55 * LBL, 'font-weight': 600, fill: col, stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }, sym.label));
    }
  }

  function startDrag(e: PointerEvent, sym: Symbol_) {
    if (e.button !== 0 || s.classList.contains('panning')) return;
    e.stopPropagation(); selId = sym.id; tool = null; drawPal(); drawSide(); drawSyms();
    const start = pz.toSvg(e.clientX, e.clientY), ox = sym.x, oy = sym.y; let moved = false;
    const move = (ev: PointerEvent) => { const p = pz.toSvg(ev.clientX, ev.clientY); sym.x = ox + (p.x - start.x) / W; sym.y = oy + (p.y - start.y) / H; moved = true; drawSyms(); };
    const up = async () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (moved) await upsert('symbol', sym); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  s.addEventListener('pointerdown', async (e) => {
    if (e.button !== 0 || s.classList.contains('panning') || !tool) return;
    const p = pz.toSvg(e.clientX, e.clientY);
    const sym = await upsert('symbol', { plan_id: plan.id, type: tool, x: p.x / W, y: p.y / H, rot: 0, circuit_id: activeCircuit }) as Symbol_;
    symbols.push(sym); selId = sym.id; drawSyms(); drawSide();
  });
  s.addEventListener('contextmenu', (e) => { e.preventDefault(); tool = null; drawPal(); });

  function drawSide() {
    clear(side);
    const sym = symbols.find((x) => x.id === selId);
    // legende / overzicht per kring
    const counts = new Map<string, number>(); for (const x of symbols) if (x.circuit_id) counts.set(x.circuit_id, (counts.get(x.circuit_id) ?? 0) + 1);
    const unlinked = symbols.filter((x) => !x.circuit_id).length;
    if (!sym) {
      side.append(h('div', null, h('h4', null, 'Plaatsen'), h('p', { class: 'muted' }, tool ? `Klik op het plan om "${symbolEntry(tool)?.label}" te plaatsen. Bij stopcontacten komt de staart op het klikpunt: klik op de muur en draai met R. Rechtsklik om te stoppen.` : 'Klik een symbool aan om het te bewerken, of kies er links een.')),
        h('div', null, h('h4', null, 'Kringen op dit plan'),
          h('div', { class: 'legend', style: { flexDirection: 'column', gap: '4px' } }, circuits.filter((c) => counts.has(c.id)).map((c) =>
            h('div', null, h('i', { style: { background: circuitColor(c.id, order) } }), `${c.nr ?? ''} ${c.name} — ${counts.get(c.id)}`)),
            unlinked ? h('div', { style: { color: '#b35c00' } }, h('i', { style: { background: '#e07800' } }), `${unlinked} symbool/symbolen zonder kring`) : null)));
      return;
    }
    const fields: FieldDef[] = [
      { key: 'type', label: 'Symbool', type: 'select', allowEmpty: false, span: 2, options: CATALOG.map((x) => ({ value: x.id, label: x.label })) },
      { key: 'circuit_id', label: 'Kring', type: 'select', span: 2, options: circuits.map((c) => ({ value: c.id, label: `${c.nr ?? ''} ${c.name}` })) },
      ...(symbolEntry(sym.type)?.id === 'Verdeelkast' ? [{ key: 'board_id', label: 'Kast / onderverdeler', type: 'select' as const, span: 2 as const, options: boards.filter((b) => b.kind === 'bestaand').map((b) => ({ value: b.id, label: b.name })) }] : []),
      { key: 'label', label: 'Label' }, { key: 'rot', label: 'Rotatie (°)', type: 'number' },
      { key: 'notes', label: 'Notities', type: 'textarea', span: 2 },
    ];
    const form = buildForm(fields, sym);
    Object.values(form.inputs).forEach((i) => i.addEventListener('change', async () => {
      const v = form.read(); Object.assign(sym, v, { rot: v.rot ?? 0 }); await upsert('symbol', sym); drawSyms();
    }));
    side.append(h('div', { style: { display: 'flex', alignItems: 'center' } }, h('h3', null, symbolEntry(sym.type)?.label ?? sym.type), h('span', { class: 'spacer' }), btn('', { icon: 'X', variant: 'ghost', onClick: () => { selId = null; drawSyms(); drawSide(); } })),
      form.el,
      btn('Verwijderen', { icon: 'Trash2', variant: 'danger', onClick: async () => { await softDelete('symbol', sym.id); symbols.splice(symbols.indexOf(sym), 1); selId = null; drawSyms(); drawSide(); } }));
  }

  window.addEventListener('keydown', async function onKey(e) {
    if (!root.isConnected) { window.removeEventListener('keydown', onKey); return; }
    if ((e.target as HTMLElement).matches('input,textarea,select')) return;
    const sym = symbols.find((x) => x.id === selId); if (!sym) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { await softDelete('symbol', sym.id); symbols.splice(symbols.indexOf(sym), 1); selId = null; drawSyms(); drawSide(); }
    if (e.key.toLowerCase() === 'r') { sym.rot = (sym.rot + 90) % 360; await upsert('symbol', sym); drawSyms(); drawSide(); }
  });

  drawPal(); drawSyms(); drawSide();
}

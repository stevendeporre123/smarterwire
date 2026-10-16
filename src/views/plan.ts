import { h, svg, btn, icon, toast, clear, download } from '../lib/dom';
import { buildForm, formModal, panZoom, confirmDialog, promptDialog, type FieldDef } from '../lib/ui';
import { upsert, softDelete, saveImage, assetUrl, assetSize } from '../db/repo';
import { plansOf, symbolsOf, shapesOf, circuitsOf, boardsOf, type Plan, type Project, type Symbol_, type Shape } from '../domain/model';
import { circuitColor } from '../domain/symbols';
import { CATALOG, FUNC_ORDER, symbolEntry, symbolGeom, symbolMarkup, splitType, joinType, type SymbolEntry } from '../domain/areisymbols';
import { FURNITURE, CABLE_STYLES, DEFAULT_PLAN_M, dist, projectOnSeg, nearestWall, snapToWallSurface, renderFloor, wallPts, type Pt } from '../domain/floorplan';
import { editCircuit } from './circuits';
import { getSetting, setSetting } from '../domain/settings';
import { schemaLoadsOf, planSymbolRows, type SchemaLoad } from '../domain/loads';

const LS = (pid: string) => `smarterwire.plan.${pid}`;
const SYM_SIZE = 0.022; // basisgrootte van symbolen als fractie van de plan-breedte
const LS_SIZE = 'smarterwire.symsize', LS_LABEL = 'smarterwire.labelsize', LS_OPT = 'smarterwire.planopt';
const pct = (k: string) => Math.min(300, Math.max(30, Number(localStorage.getItem(k)) || 100));
const opt = (k: string, d: boolean) => { const v = localStorage.getItem(`${LS_OPT}.${k}`); return v === null ? d : v === '1'; };
const setOpt = (k: string, v: boolean) => localStorage.setItem(`${LS_OPT}.${k}`, v ? '1' : '0');
const THICKS = [0.1, 0.15, 0.2, 0.3];
const NUM = (s: string) => Number(s.replace(',', '.'));

export async function renderPlan(root: HTMLElement, project: Project) {
  const plans = await plansOf(project.id);
  const reload = () => { clear(root); return renderPlan(root, project); };
  const fileInput = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } }) as HTMLInputElement;

  const addPhotoPlan = () => {
    fileInput.onchange = async () => {
      const f = fileInput.files?.[0]; if (!f) return;
      const name = await promptDialog({ title: 'Nieuw plan', label: 'Naam van het plan', value: `Verdieping ${plans.length}` }); if (!name) return;
      const img = await saveImage(f, 3200);
      const p = await upsert('plan', { project_id: project.id, name, asset_id: img.id, level: String(plans.length), w: img.width, h: img.height });
      localStorage.setItem(LS(project.id), p.id); reload();
    };
    fileInput.click();
  };
  const addBlankPlan = async () => {
    const name = await promptDialog({ title: 'Nieuw plan', label: 'Naam van het plan', value: `Verdieping ${plans.length}` }); if (!name) return;
    const p = await upsert('plan', { project_id: project.id, name, level: String(plans.length), w: 3000, h: 2100, scale: 150 });
    localStorage.setItem(LS(project.id), p.id); reload();
  };

  if (!plans.length) {
    root.append(h('div', { class: 'page' }, h('div', { class: 'card empty-state' }, icon('Map', 40), h('h3', null, 'Maak een plan'),
      h('p', null, 'Begin met een foto van de plattegrond als achtergrond en teken er de muren op, of start met een leeg plan. Daarna plaats je stopcontacten, lichtpunten… en koppel je ze aan een kring.'),
      fileInput, h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center' } }, btn('Foto opladen', { icon: 'Upload', variant: 'primary', onClick: addPhotoPlan }), btn('Leeg plan', { icon: 'Plus', onClick: addBlankPlan })))));
    return;
  }

  let planId = localStorage.getItem(LS(project.id)); if (!plans.find((p) => p.id === planId)) planId = plans[0].id;
  const plan = plans.find((p) => p.id === planId)!;
  const [symbols, shapes, circuits, boards, pending] = await Promise.all([symbolsOf(plan.id), shapesOf(plan.id), circuitsOf(project.id), boardsOf(project.id), schemaLoadsOf(project.id)]);
  const others = (await planSymbolRows(project.id)).filter((r) => !symbols.some((x) => x.id === r.id));   // symbolen op andere plannen tellen mee voor het adres

  /** Adres van een symbool binnen zijn kring: kringnummer + volgnummer in de volgorde van het eendraadschema (bv. A1, E4). */
  function addresses(): Map<string, string> {
    const rows: { id: string; cid: string | null; order: number }[] = [
      ...others.map((r, i) => ({ id: r.id, cid: r.circuit_id, order: r.spos ?? 1e6 + i })),
      ...symbols.map((r, i) => ({ id: r.id, cid: r.circuit_id ?? null, order: (r as any).spos ?? 1e6 + 1e3 + i })),
      ...pending.map((r, i) => ({ id: r.id, cid: r.circuit_id, order: r.pos ?? 1e6 + 5e5 + i })),
    ];
    const out = new Map<string, string>(), seen = new Map<string, number>();
    for (const r of rows.sort((a, b) => a.order - b.order)) {
      if (!r.cid) continue;
      const k = (seen.get(r.cid) ?? 0) + 1; seen.set(r.cid, k);
      out.set(r.id, `${circuits.find((c) => c.id === r.cid)?.nr ?? ''}${k}`);
    }
    return out;
  }
  // onderdelen die op het eendraadschema aan een kring hangen maar nog niet op een plan staan
  const pendingLoad = (id: string) => pending.find((l) => l.id === id);
  const pendingCount = () => pending.reduce((n, l) => n + (l.n || 1), 0);
  const order = circuits.map((c) => c.id);
  // favorieten met sneltoets (blijven bewaard in de database)
  interface Fav { tool: string; key?: string }
  const DEFAULT_FAVS: Fav[] = [{ tool: 'sym:Stopcontact', key: 's' }, { tool: 'sym:Verlichtingstoestel', key: 'l' }, { tool: 'sym:Schakelaar algemeen symbool', key: 'e' }];
  let favs = await getSetting<Fav[]>('planFavs', DEFAULT_FAVS);
  const saveFavs = () => setSetting('planFavs', favs);
  let pendingKey: string | null = null;      // tool waarvoor we een sneltoets aan het opnemen zijn
  let url = await assetUrl(plan.asset_id);
  if (plan.asset_id && (!plan.w || !plan.h)) { const sz = await assetSize(plan.asset_id); if (sz) { plan.w = sz.width; plan.h = sz.height; await upsert('plan', plan); } }
  const W = plan.w ?? 3000, H = plan.h ?? 2100;
  const scale = () => plan.scale ?? W / DEFAULT_PLAN_M;      // px per meter
  let S = W * SYM_SIZE * pct(LS_SIZE) / 100, LBL = pct(LS_LABEL) / 100;

  type Tool = string; // select | wall | window | door | stair | furn:<id> | text | scale | sym:<catalogId>
  let tool: Tool = 'select';
  let selSym: string | null = null, selShape: string | null = null;
  let activeCircuit: string | null = null;
  let wallThick = Number(localStorage.getItem(`${LS_OPT}.thick`)) || 0.2;
  let snapOn = opt('snap', true), ortho = opt('ortho', true), grid = opt('grid', true), showBg = opt('bg', true), showHalo = opt('halo', true);
  let gang = 1;                       // aantal (1-4) voor meervoudige stopcontacten en schakelaars
  let palQuery = '';
  const isLine = (t: string) => t === 'wall' || t.startsWith('cable:');
  let drawing: Pt | null = null;      // beginpunt van het volgende muursegment
  let lenBuf = '';                    // getypte lengte (m)
  let cursor: Pt | null = null;

  const walls = () => shapes.filter((s) => s.kind === 'wall');
  const shapeById = (id: string | null) => shapes.find((s) => s.id === id);

  // ---------- toolbar ----------
  const planSel = h('select', { onChange: (e: Event) => { localStorage.setItem(LS(project.id), (e.target as HTMLSelectElement).value); reload(); } },
    plans.map((p) => h('option', { value: p.id, selected: p.id === plan.id }, p.name)));
  const circSel = h('select', { title: 'Nieuwe symbolen worden aan deze kring gekoppeld', onChange: (e: Event) => { activeCircuit = (e.target as HTMLSelectElement).value || null; } },
    h('option', { value: '' }, '— geen kring —'), circuits.map((c) => h('option', { value: c.id }, `${c.nr ?? ''} ${c.name}`)));
  const check = (label: string, key: string, get: () => boolean, set: (v: boolean) => void, title = '') =>
    h('label', { class: 'hint', title, style: { display: 'inline-flex', gap: '4px', alignItems: 'center', cursor: 'pointer' } },
      h('input', { type: 'checkbox', checked: get(), onChange: (e: Event) => { const v = (e.target as HTMLInputElement).checked; set(v); setOpt(key, v); drawAll(); } }), label);
  const scaleBtn = btn('Schaal', { icon: 'Ruler', variant: 'ghost', onClick: () => { tool = 'scale'; drawing = null; drawPal(); drawSide(); } });
  const updScale = () => { scaleBtn.querySelector('span')!.textContent = plan.scale ? `1 m = ${Math.round(plan.scale)} px` : 'Schaal instellen'; scaleBtn.style.color = plan.scale ? '' : '#b35c00'; };

  const statusChip = h('span', { class: 'hint', style: { fontWeight: '600' } });
  const updStatus = () => {
    const un = symbols.filter((x) => !x.circuit_id).length, pc = pendingCount(), bits: string[] = [];
    if (pc) bits.push(`${pc} nog te plaatsen`); if (un) bits.push(`${un} zonder kring`);
    statusChip.textContent = bits.join(' · '); (statusChip as HTMLElement).style.color = bits.length ? '#b35c00' : '';
  };
  const canvas = h('div', { class: 'canvas' }), side = h('div', { class: 'side' }), pal = h('div', { class: 'pal' });
  root.classList.add('page-full');
  root.append(
    h('div', { class: 'toolbar', style: { flexWrap: 'wrap' } }, planSel, fileInput,
      btn('', { icon: 'Plus', variant: 'ghost', title: 'Plan toevoegen (foto)', onClick: addPhotoPlan }),
      btn('', { icon: 'FilePlus', variant: 'ghost', title: 'Leeg plan toevoegen', onClick: addBlankPlan }),
      btn('', { icon: 'Pencil', variant: 'ghost', title: 'Plan hernoemen', onClick: () => formModal({ title: 'Plan', fields: [{ key: 'name', label: 'Naam', span: 2 }, { key: 'level', label: 'Niveau', span: 2 }], values: plan,
        onSave: async (v) => { await upsert('plan', { ...plan, ...v }); reload(); }, onDelete: async () => { await softDelete('plan', plan.id); reload(); } }) }),
      scaleBtn,
      h('span', { class: 'hint' }, 'Muurdikte'), h('select', { onChange: (e: Event) => { wallThick = Number((e.target as HTMLSelectElement).value); localStorage.setItem(`${LS_OPT}.thick`, String(wallThick)); } },
        THICKS.map((t) => h('option', { value: t, selected: t === wallThick }, `${t * 100} cm`))),
      check('Magneet', 'snap', () => snapOn, (v) => (snapOn = v), 'Kleven aan raster en muurpunten (Shift = tijdelijk uit)'),
      check('Haaks', 'ortho', () => ortho, (v) => (ortho = v), 'Muren horizontaal/verticaal vergrendelen'),
      check('Raster', 'grid', () => grid, (v) => (grid = v)),
      check('Cirkels', 'halo', () => showHalo, (v) => (showHalo = v), 'Cirkel (kleur van de kring) rond symbolen tonen'),
      ...(plan.asset_id ? [check('Foto', 'bg', () => showBg, (v) => (showBg = v), 'Achtergrondfoto tonen'),
        h('input', { type: 'range', min: 10, max: 100, value: Math.round((plan.bg_opacity ?? 0.6) * 100), title: 'Doorzichtigheid foto', style: { width: '80px' }, onInput: async (e: Event) => { plan.bg_opacity = Number((e.target as HTMLInputElement).value) / 100; bgImg?.setAttribute('opacity', String(plan.bg_opacity)); }, onChange: () => upsert('plan', plan) }),
        btn('Foto verwijderen', { icon: 'ImageOff', variant: 'ghost', title: 'Achtergrondfoto verwijderen als alle muren getekend zijn', onClick: async () => {
          if (!(await confirmDialog({ title: 'Achtergrondfoto verwijderen', message: 'De achtergrondfoto van dit plan verwijderen? Je tekening (muren, symbolen) blijft behouden.' }))) return;
          plan.asset_id = null; await upsert('plan', plan); reload(); } })] : []),
      h('span', { class: 'hint' }, 'Symbool %'), h('input', { type: 'number', value: pct(LS_SIZE), min: 30, max: 300, step: 10, style: { width: '64px' }, onChange: (e: Event) => { localStorage.setItem(LS_SIZE, (e.target as HTMLInputElement).value); S = W * SYM_SIZE * pct(LS_SIZE) / 100; drawSyms(); } }),
      h('span', { class: 'hint' }, 'Label %'), h('input', { type: 'number', value: pct(LS_LABEL), min: 30, max: 300, step: 10, style: { width: '64px' }, onChange: (e: Event) => { localStorage.setItem(LS_LABEL, (e.target as HTMLInputElement).value); LBL = pct(LS_LABEL) / 100; drawSyms(); } }),
      statusChip,
      h('span', { class: 'hint' }, 'Actieve kring:'), circSel,
      btn('Nieuwe kring', { icon: 'Plus', variant: 'ghost', onClick: () => editCircuit(project, {}, () => reload()) }),
      btn('SVG', { icon: 'Download', variant: 'ghost', title: 'Tekening (zonder foto) exporteren', onClick: exportSvg })),
    h('div', { class: 'split left-pal' }, pal, canvas, side));
  updScale();

  // ---------- palet ----------
  const BUILD: { id: string; label: string; icon: string; hint: string }[] = [
    { id: 'select', label: 'Selecteren', icon: 'MousePointer2', hint: 'Klik om te selecteren en te verslepen.' },
    { id: 'wall', label: 'Muur', icon: 'BrickWall', hint: 'Klik beginpunt, klik volgende punten. Typ een lengte in meter + Enter. Dubbelklik, Enter of Esc = stoppen.' },
    { id: 'window', label: 'Raam', icon: 'PanelTop', hint: 'Klik op een muur om een raam te plaatsen.' },
    { id: 'door', label: 'Deur', icon: 'DoorOpen', hint: 'Klik op een muur om een deur te plaatsen; de kant waar je klikt is de draairichting.' },
    { id: 'stair', label: 'Trap', icon: 'Footprints', hint: 'Sleep een rechthoek, of klik voor een standaardtrap.' },
    { id: 'text', label: 'Tekst', icon: 'Type', hint: 'Klik om een ruimtenaam of opmerking te plaatsen.' },
  ];
  const TOOLS = BUILD;
  interface PalItem { tool: string; label: string; group: string; icon: () => Element; entry?: SymbolEntry; kw?: string }
  const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const items: PalItem[] = [
    ...BUILD.map((t) => ({ tool: t.id, label: t.label, group: 'Bouw', icon: () => icon(t.icon, 18) })),
    ...FURNITURE.map((f) => ({ tool: `furn:${f.id}`, label: f.label, group: 'Meubilair', icon: () => icon('Square', 18) })),
    ...CATALOG.filter((e) => FUNC_ORDER.includes(e.func)).map((e) => ({ tool: `sym:${e.id}`, label: e.label, group: e.func, entry: e, kw: e.keywords, icon: () => {
      const g = symbolGeom(e.id, 'plan')!, ic = svg('svg', { width: 26, height: 22, viewBox: `0 0 ${g.w + 2} ${g.h + 2}`, preserveAspectRatio: 'xMidYMid meet' });
      ic.innerHTML = symbolMarkup(e.id, 'plan', (g.w + 2) * g.anchor.x + (g.anchor.x === 0 ? 1 : 0), (g.h + 2) / 2, 1, 0, 1.6); return ic; } })),
  ];
  const GROUPS = ['Bouw', 'Meubilair', ...FUNC_ORDER];
  const closed = new Set<string>(JSON.parse(localStorage.getItem(`${LS_OPT}.closed`) || '[]'));
  const multiTool = () => { const e = tool.startsWith('sym:') ? symbolEntry(tool.slice(4)) : undefined; return !!e?.multi; };

  const searchInput = h('input', { type: 'search', class: 'table-search', placeholder: 'Zoek symbool of tool…', value: palQuery,
    onInput: (e: Event) => { palQuery = (e.target as HTMLInputElement).value; drawPalList(); } }) as HTMLInputElement;
  const palList = h('div');
  const gangRow = h('div', { class: 'gang-row', title: 'Aantal stopcontacten of schakelaars in één toestel' });
  function drawGang() {
    clear(gangRow);
    gangRow.append(h('span', { class: 'hint' }, 'Aantal:'), ...[1, 2, 3, 4].map((n) => h('button', { class: `gang-btn ${gang === n ? 'active' : ''}`, onClick: () => { gang = n; drawGang(); } }, String(n))));
    (gangRow as HTMLElement).style.display = multiTool() ? 'flex' : 'none';
  }
  function drawPal() {
    clear(pal);
    pal.append(searchInput, gangRow); drawGang(); drawPalList();
  }
  const favOf = (tool: string) => favs.find((f) => f.tool === tool);
  function toggleFav(tool: string) {
    favs = favOf(tool) ? favs.filter((f) => f.tool !== tool) : [...favs, { tool }];
    saveFavs(); drawPalList();
  }
  function palRow(i: PalItem) {
    const f = favOf(i.tool);
    return h('div', { class: 'pal-row' },
      h('button', { class: `pal-item ${tool === i.tool ? 'active' : ''}`, title: i.label, onClick: () => setTool(i.tool) }, i.icon(), i.label),
      f ? h('button', { class: `pal-key ${pendingKey === i.tool ? 'wait' : ''}`, title: 'Sneltoets instellen (daarna op de gewenste toets drukken)', onClick: () => { pendingKey = pendingKey === i.tool ? null : i.tool; if (pendingKey) toast('Druk op de gewenste toets (Esc = annuleren, Delete = wissen)'); drawPalList(); } }, pendingKey === i.tool ? '…' : (f.key ?? '+').toUpperCase()) : null,
      h('button', { class: `pal-star ${f ? 'on' : ''}`, title: f ? 'Uit favorieten halen' : 'Favoriet maken', onClick: () => toggleFav(i.tool) }, f ? '★' : '☆'));
  }
  function drawPalList() {
    clear(palList);
    const q = norm(palQuery.trim());
    const match = (i: PalItem) => !q || norm(i.label).includes(q) || norm(i.group).includes(q) || norm(i.kw ?? '').includes(q);
    for (const g of favs.length ? ['Favorieten', ...GROUPS] : GROUPS) {
      const its = (g === 'Favorieten' ? favs.map((f) => items.find((i) => i.tool === f.tool)).filter((x): x is PalItem => !!x) : items.filter((i) => i.group === g)).filter(match);
      if (!its.length) continue;
      const det = h('details', { class: 'pal-group', open: q ? true : !closed.has(g) },
        h('summary', null, g === 'Favorieten' ? '★ Favorieten' : g, h('span', { class: 'pal-count' }, String(its.length))),
        ...its.map(palRow));
      det.addEventListener('toggle', () => { if (q) return; if ((det as HTMLDetailsElement).open) closed.delete(g); else closed.add(g); localStorage.setItem(`${LS_OPT}.closed`, JSON.stringify([...closed])); });
      palList.append(det);
    }
    if (!palList.children.length) palList.append(h('p', { class: 'hint', style: { padding: '8px' } }, 'Niets gevonden.'));
    pal.append(palList);
  }
  function setTool(t: Tool) { tool = t; drawing = null; lenBuf = ''; selSym = null; if (t !== 'select') selShape = null; drawGang(); drawPalList(); drawAll(); drawSide(); }

  // ---------- canvas ----------
  const s = svg('svg', { preserveAspectRatio: 'xMidYMid meet' }) as SVGSVGElement;
  const pz = panZoom(s, W, H);
  s.append(svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }));
  const bgImg = url ? svg('image', { href: url, x: 0, y: 0, width: W, height: H, opacity: plan.bg_opacity ?? 0.6, 'pointer-events': 'none' }) : null;
  if (bgImg) s.append(bgImg);
  const gridRect = svg('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#plan-grid)', 'pointer-events': 'none' });
  const defs = svg('defs'); s.append(defs, gridRect);
  const shapesG = svg('g'), layer = svg('g'), ghostG = svg('g', { 'pointer-events': 'none' }), handleG = svg('g');
  s.append(shapesG, layer, ghostG, handleG);
  canvas.append(s);

  const toPlan = (e: PointerEvent | MouseEvent): Pt & { s: number } => pz.toSvg(e.clientX, e.clientY);

  function drawAll() {
    const g = 0.5 * scale();
    defs.innerHTML = `<pattern id="plan-grid" width="${g}" height="${g}" patternUnits="userSpaceOnUse"><path d="M${g} 0H0V${g}" fill="none" stroke="#c9d3de" stroke-width="${0.006 * scale()}"/></pattern>`;
    gridRect.setAttribute('visibility', grid ? 'visible' : 'hidden');
    bgImg?.setAttribute('visibility', showBg ? 'visible' : 'hidden');
    drawShapes(); drawSyms(); drawGhost();
  }
  function drawShapes() { shapesG.innerHTML = renderFloor(shapes, { scale: scale(), selId: selShape, cableColor: (id) => circuitColor(id, order) }); drawHandles(); }

  /** Na het verplaatsen of verkorten van een muur: ramen en deuren blijven binnen de muur. */
  async function clampOpenings(wall: Shape) {
    const [a, b] = wallPts(wall), L = dist(a, b) || 1;
    for (const o of shapes.filter((x) => x.ref_id === wall.id)) {
      const hw = ((o.size ?? 0.9) * scale()) / 2, pos = Math.max(hw / L, Math.min(1 - hw / L, o.pos ?? 0.5));
      if (hw * 2 > L) { await softDelete('shape', o.id); shapes.splice(shapes.indexOf(o), 1); } else if (pos !== o.pos) { o.pos = pos; await upsert('shape', o); }
    }
  }

  // ---- snappen ----
  function snapPt(p: Pt & { s: number }, from: Pt | null, raw = false): Pt {
    if (raw || !snapOn) return { x: p.x, y: p.y };
    const tol = 14 / p.s;
    for (const w of walls()) for (const q of wallPts(w)) if (dist(q, p) < tol) return { ...q };
    let x = p.x, y = p.y, lockX = false, lockY = false;
    if (ortho && from) {
      const dx = Math.abs(x - from.x), dy = Math.abs(y - from.y);
      if (dy < dx * 0.14) { y = from.y; lockY = true; } else if (dx < dy * 0.14) { x = from.x; lockX = true; }
    }
    const gs = 0.05 * scale();
    if (!lockX) x = Math.round(x / gs) * gs;
    if (!lockY) y = Math.round(y / gs) * gs;
    return { x, y };
  }

  // ---- ghost (voorbeeld tijdens het tekenen) ----
  let rectDrag: { a: Pt; b: Pt } | null = null, scaleA: Pt | null = null;
  const fm = (px: number) => (px / scale()).toFixed(2).replace('.', ',');
  function drawGhost() {
    ghostG.innerHTML = '';
    const k = scale(), lw = 0.012 * k;
    if (tool.startsWith('place:')) {
      const ld = pendingLoad(tool.slice(6));
      if (ld && cursor) {
        const q = placeSym(ld.type, cursor as Pt & { s: number }), kk = S / 10;
        ghostG.setAttribute('opacity', '0.7');
        ghostG.innerHTML = `<g transform="translate(${q.x} ${q.y}) rotate(${q.rot ?? 0})">${symbolMarkup(ld.type, 'plan', 0, 0, kk, 0, 2.2, circuitColor(ld.circuit_id, order))}</g>`;
      }
    } else if (isLine(tool) && drawing && cursor) {
      let end = cursor;
      if (lenBuf) { const L = NUM(lenBuf) * k, d = dist(drawing, cursor) || 1; end = { x: drawing.x + ((cursor.x - drawing.x) / d) * L, y: drawing.y + ((cursor.y - drawing.y) / d) * L }; }
      ghostG.innerHTML = `<path d="M${drawing.x} ${drawing.y} L${end.x} ${end.y}" stroke="#0066aa" stroke-opacity=".5" stroke-width="${tool === 'wall' ? wallThick * k : 0.04 * k}" stroke-linecap="square"/>
        <circle cx="${drawing.x}" cy="${drawing.y}" r="${0.06 * k}" fill="#0066aa"/>
        <text x="${(drawing.x + end.x) / 2}" y="${(drawing.y + end.y) / 2 - wallThick * k}" text-anchor="middle" font-size="${0.28 * k}" font-family="Arial" font-weight="700" fill="#0066aa" stroke="#fff" stroke-width="${0.05 * k}" paint-order="stroke">${lenBuf ? lenBuf + ' m' : fm(dist(drawing, end)) + ' m'}</text>`;
    } else if (isLine(tool) && cursor) {
      ghostG.innerHTML = `<circle cx="${cursor.x}" cy="${cursor.y}" r="${0.07 * k}" fill="#0066aa" fill-opacity=".6"/>`;
    } else if ((tool === 'window' || tool === 'door') && cursor) {
      const hit = nearestWall(walls(), cursor, wallThick * k + 20 / (pz.toSvg(0, 0).s || 1));
      if (hit) {
        const [a, b] = wallPts(hit.wall), L = dist(a, b), size = tool === 'door' ? 0.9 : 1.2, pos = Math.max(size * k / 2 / L, Math.min(1 - size * k / 2 / L, hit.t));
        const nW = { x: -hit.u.y, y: hit.u.x }, flip = hit.n.x * nW.x + hit.n.y * nW.y > 0 ? 0 : 1;
        ghostG.setAttribute('opacity', '0.55');
        ghostG.innerHTML = renderFloor([hit.wall, { id: 'ghost', plan_id: '', kind: tool as 'door', ref_id: hit.wall.id, pos, size, flip, rot: 0 }], { scale: k, selId: null });
      }
    } else if (rectDrag && (tool === 'stair' || tool.startsWith('furn:'))) {
      ghostG.setAttribute('opacity', '0.6');
      ghostG.innerHTML = renderFloor([{ id: 'ghost', plan_id: '', kind: tool === 'stair' ? 'stair' : 'furniture', sub: tool.slice(5), x1: Math.min(rectDrag.a.x, rectDrag.b.x), y1: Math.min(rectDrag.a.y, rectDrag.b.y), x2: Math.max(rectDrag.a.x, rectDrag.b.x), y2: Math.max(rectDrag.a.y, rectDrag.b.y), rot: 0 }], { scale: k, selId: null });
      ghostG.innerHTML += `<text x="${(rectDrag.a.x + rectDrag.b.x) / 2}" y="${Math.min(rectDrag.a.y, rectDrag.b.y) - 0.1 * k}" text-anchor="middle" font-size="${0.25 * k}" font-family="Arial" font-weight="700" fill="#0066aa">${fm(Math.abs(rectDrag.b.x - rectDrag.a.x))} × ${fm(Math.abs(rectDrag.b.y - rectDrag.a.y))} m</text>`;
    } else if (tool === 'scale' && scaleA && cursor) {
      ghostG.innerHTML = `<path d="M${scaleA.x} ${scaleA.y} L${cursor.x} ${cursor.y}" stroke="#c2185b" stroke-width="${0.03 * k}"/><circle cx="${scaleA.x}" cy="${scaleA.y}" r="${0.06 * k}" fill="#c2185b"/>`;
    } else ghostG.removeAttribute('opacity');
    if (!(tool === 'window' || tool === 'door' || tool === 'stair' || tool.startsWith('furn:') || tool.startsWith('place:'))) ghostG.removeAttribute('opacity');
  }

  // ---- handvatten van de geselecteerde muur ----
  function drawHandles() {
    clear(handleG);
    const w = shapeById(selShape); if (!w || (w.kind !== 'wall' && w.kind !== 'cable') || tool !== 'select') return;
    const r = 0.09 * scale();
    for (const end of [1, 2] as const) {
      const c = svg('circle', { cx: end === 1 ? w.x1! : w.x2!, cy: end === 1 ? w.y1! : w.y2!, r, fill: '#fff', stroke: '#0066aa', 'stroke-width': r * 0.35, style: 'cursor:crosshair' });
      c.addEventListener('pointerdown', (e) => startEndpointDrag(e as PointerEvent, w, end));
      handleG.append(c);
    }
  }
  function startEndpointDrag(e: PointerEvent, w: Shape, end: 1 | 2) {
    if (e.button !== 0) return; e.stopPropagation();
    const k = end === 1 ? ['x1', 'y1'] as const : ['x2', 'y2'] as const, o = end === 1 ? ['x2', 'y2'] as const : ['x1', 'y1'] as const;
    const from = { x: w[k[0]]!, y: w[k[1]]! };
    // andere muren die op hetzelfde punt eindigen, schuiven mee
    const linked: [Shape, 'x1' | 'x2', 'y1' | 'y2'][] = [];
    for (const v of walls()) { if (v === w) continue; if (dist({ x: v.x1!, y: v.y1! }, from) < 2) linked.push([v, 'x1', 'y1']); if (dist({ x: v.x2!, y: v.y2! }, from) < 2) linked.push([v, 'x2', 'y2']); }
    const other = { x: w[o[0]]!, y: w[o[1]]! };
    const move = (ev: PointerEvent) => {
      const p = toPlan(ev), q = snapPt(p, other, ev.shiftKey);
      w[k[0]] = q.x; w[k[1]] = q.y; for (const [v, a, b] of linked) { v[a] = q.x; v[b] = q.y; }
      drawShapes(); drawSide();
    };
    const up = async () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); await Promise.all([w, ...linked.map((l) => l[0])].map((x) => upsert('shape', x))); for (const x of [w, ...linked.map((l) => l[0])]) await clampOpenings(x); drawShapes(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  // ---- shapes selecteren / verslepen ----
  shapesG.addEventListener('pointerdown', (e) => {
    if (tool !== 'select' || (e as PointerEvent).button !== 0 || s.classList.contains('panning')) return;
    const id = (e.target as Element).closest('[data-sid]')?.getAttribute('data-sid'); const sh = shapeById(id ?? null); if (!sh) return;
    e.stopPropagation(); selShape = sh.id; selSym = null; drawShapes(); drawSyms(); drawSide();
    const start = toPlan(e as PointerEvent), orig = { x1: sh.x1, y1: sh.y1, x2: sh.x2, y2: sh.y2, pos: sh.pos }; let moved = false;
    const wall = sh.ref_id ? shapeById(sh.ref_id) : null;
    const move = (ev: PointerEvent) => {
      const p = toPlan(ev), gs = snapOn && !ev.shiftKey ? 0.05 * scale() : 0.0001;
      if (wall && (sh.kind === 'window' || sh.kind === 'door')) {
        const [a, b] = wallPts(wall), L = dist(a, b), hw = ((sh.size ?? 0.9) * scale()) / 2;
        sh.pos = Math.max(hw / L, Math.min(1 - hw / L, projectOnSeg(p, a, b).t)); moved = true;
      } else {
        const dx = Math.round((p.x - start.x) / gs) * gs, dy = Math.round((p.y - start.y) / gs) * gs;
        if (!dx && !dy && !moved) return; moved = true;
        if (sh.x1 != null) { sh.x1 = orig.x1! + dx; sh.y1 = orig.y1! + dy; }
        if (sh.x2 != null) { sh.x2 = orig.x2! + dx; sh.y2 = orig.y2! + dy; }
      }
      drawShapes();
    };
    const up = async () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (moved) await upsert('shape', sh); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });

  // ---- symbolen ----
  const wallAnchored = (type: string) => { const e = symbolEntry(type); return !!e && e.anchor.x < 0.5; };
  function placeSym(type: string, p: Pt & { s: number }, raw = false) {
    if (wallAnchored(type) && !raw) { const q = snapToWallSurface(walls(), p, scale(), 26 / p.s); if (q) return q; }
    return { x: p.x, y: p.y, rot: null as number | null };
  }
  function drawSyms() {
    clear(layer);
    const addr = addresses();
    for (const sym of symbols) {
      const col = circuitColor(sym.circuit_id, order), ink = sym.id === selSym ? '#0066aa' : sym.circuit_id ? col : '#000000';
      const g = svg('g', { transform: `translate(${sym.x * W} ${sym.y * H}) rotate(${sym.rot})`, style: `cursor:pointer` });
      const e = symbolEntry(sym.type), k = S / 10, geo = e ? symbolGeom(sym.type, 'plan') : null;
      const cx = geo ? geo.w * k * (0.5 - geo.anchor.x) : 0, r = geo ? Math.max(geo.w, geo.h) * k * 0.62 : S * 0.75;
      // krans: zichtbaar als "Cirkels" aan staat (of bij selectie); anders een onzichtbaar klikvlak
      const ring = showHalo || sym.id === selSym || !sym.circuit_id;
      g.append(svg('circle', { class: 'halo', cx, r, fill: ring ? (sym.id === selSym ? 'rgba(0,102,170,.25)' : '#ffffff99') : '#ffffff01', stroke: ring ? (sym.circuit_id ? col : '#e07800') : 'none', ...(sym.circuit_id ? {} : { 'stroke-dasharray': '4 3' }), 'stroke-width': sym.id === selSym ? 3 : 1.5, 'stroke-dasharray': sym.circuit_id ? '' : '4 3', 'vector-effect': 'non-scaling-stroke' }));
      const inner = svg('g'); inner.innerHTML = e ? symbolMarkup(sym.type, 'plan', 0, 0, k, 0, 2.2, ink) : `<circle r="${S * 0.4}" fill="none" stroke="currentColor"/>`; g.append(inner);
      g.addEventListener('pointerdown', (ev) => startSymDrag(ev as PointerEvent, sym));
      layer.append(g);
      const txt = [addr.get(sym.id), sym.label].filter(Boolean).join(' ');
      if (txt) layer.append(svg('text', { x: sym.x * W + S * 0.9, y: sym.y * H + 4, 'font-size': S * 0.55 * LBL, 'font-weight': 600, fill: col, stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke', 'pointer-events': 'none' }, txt));
    }
  }
  function startSymDrag(e: PointerEvent, sym: Symbol_) {
    if (e.button !== 0 || s.classList.contains('panning') || tool !== 'select') return;   // met een tekentool actief klik je dóór het symbool
    e.stopPropagation(); selSym = sym.id; selShape = null; tool = 'select'; drawPal(); drawSide(); drawSyms(); drawShapes();
    const start = toPlan(e), ox = sym.x, oy = sym.y; let moved = false;
    const move = (ev: PointerEvent) => {
      const p = toPlan(ev); moved = true;
      if (wallAnchored(sym.type)) { const q = placeSym(sym.type, { x: p.x, y: p.y, s: p.s }, ev.shiftKey); sym.x = q.x / W; sym.y = q.y / H; if (q.rot != null) sym.rot = q.rot; }
      else { sym.x = ox + (p.x - start.x) / W; sym.y = oy + (p.y - start.y) / H; }
      drawSyms();
    };
    const up = async () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (moved) await upsert('symbol', sym); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  // ---- klikken met een tekentool ----
  const lineProps = (a: Pt, b: Pt): Partial<Shape> => tool === 'wall'
    ? { kind: 'wall', x1: a.x, y1: a.y, x2: b.x, y2: b.y, thick: wallThick }
    : { kind: 'cable', x1: a.x, y1: a.y, x2: b.x, y2: b.y, sub: tool.slice(6), ref_id: activeCircuit };
  async function addShape(o: Partial<Shape>) { const sh = await upsert('shape', { plan_id: plan.id, flip: 0, rot: 0, ...o }) as Shape; shapes.push(sh); return sh; }

  s.addEventListener('pointermove', (e) => {
    cursor = toPlan(e);
    if (isLine(tool)) cursor = snapPt(cursor as Pt & { s: number }, drawing, e.shiftKey);
    else if (rectDrag) rectDrag.b = snapPt(cursor as Pt & { s: number }, null, e.shiftKey);
    else if (tool === 'scale') cursor = snapPt(cursor as Pt & { s: number }, scaleA, e.shiftKey);
    if (tool !== 'select' && !tool.startsWith('sym:')) drawGhost();
  });
  s.addEventListener('pointerleave', () => { cursor = null; drawGhost(); });
  s.addEventListener('contextmenu', (e) => { e.preventDefault(); if (drawing || scaleA) { drawing = null; scaleA = null; lenBuf = ''; drawGhost(); } else setTool('select'); });
  s.addEventListener('dblclick', () => { if (isLine(tool)) { drawing = null; lenBuf = ''; drawGhost(); } });

  s.addEventListener('pointerdown', async (e) => {
    if (e.button !== 0 || s.classList.contains('panning')) return;
    const p = toPlan(e), k = scale();
    if (tool === 'select') { if (selShape || selSym) { selShape = null; selSym = null; drawShapes(); drawSyms(); drawSide(); } return; }
    if (isLine(tool)) {
      const q = snapPt(p, drawing, e.shiftKey);
      if (!drawing) { drawing = q; drawGhost(); return; }
      let end = q;
      if (lenBuf) { const L = NUM(lenBuf) * k, d = dist(drawing, q) || 1; end = { x: drawing.x + ((q.x - drawing.x) / d) * L, y: drawing.y + ((q.y - drawing.y) / d) * L }; lenBuf = ''; }
      if (dist(drawing, end) < 0.05 * k) return;
      await addShape(lineProps(drawing, end));
      drawing = end; drawShapes(); drawGhost(); return;
    }
    if (tool === 'window' || tool === 'door') {
      const hit = nearestWall(walls(), p, wallThick * k + 20 / p.s); if (!hit) { toast('Klik op een muur', 'error'); return; }
      const [a, b] = wallPts(hit.wall), L = dist(a, b), size = tool === 'door' ? 0.9 : 1.2;
      if (L < size * k) { toast('Muur is te kort voor dit element', 'error'); return; }
      const nW = { x: -hit.u.y, y: hit.u.x };
      const sh = await addShape({ kind: tool, ref_id: hit.wall.id, pos: Math.max(size * k / 2 / L, Math.min(1 - size * k / 2 / L, hit.t)), size, flip: hit.n.x * nW.x + hit.n.y * nW.y > 0 ? 0 : 1 });
      selShape = sh.id; drawShapes(); drawGhost(); drawSide(); return;
    }
    if (tool === 'stair' || tool.startsWith('furn:')) {
      const a = snapPt(p, null, e.shiftKey); rectDrag = { a, b: a };
      const up = async () => {
        window.removeEventListener('pointerup', up);
        const d = rectDrag!; rectDrag = null;
        let x1 = Math.min(d.a.x, d.b.x), y1 = Math.min(d.a.y, d.b.y), x2 = Math.max(d.a.x, d.b.x), y2 = Math.max(d.a.y, d.b.y);
        if (x2 - x1 < 0.15 * k && y2 - y1 < 0.15 * k) { const f = FURNITURE.find((x) => `furn:${x.id}` === tool); const w = (f?.w ?? 1.0) * k, hh = (f?.h ?? 2.6) * k; x1 = d.a.x; y1 = d.a.y; x2 = x1 + w; y2 = y1 + hh; }
        const sh = await addShape(tool === 'stair' ? { kind: 'stair', x1, y1, x2, y2, label: 'op' } : { kind: 'furniture', sub: tool.slice(5), x1, y1, x2, y2 });
        selShape = sh.id; ghostG.innerHTML = ''; drawShapes(); drawSide();
      };
      window.addEventListener('pointerup', up); return;
    }
    if (tool === 'text') {
      const t = await promptDialog({ title: 'Tekst op het plan', label: 'Tekst', placeholder: 'bv. KEUKEN' }); if (!t) return;
      const sh = await addShape({ kind: 'text', x1: p.x, y1: p.y, label: t, size: 0.4 }); selShape = sh.id; drawShapes(); drawSide(); return;
    }
    if (tool === 'scale') {
      const q = snapPt(p, scaleA, e.shiftKey);
      if (!scaleA) { scaleA = q; return; }
      const px = dist(scaleA, q); scaleA = null; ghostG.innerHTML = '';
      if (px < 5) return;
      const m = NUM((await promptDialog({ title: 'Schaal instellen', label: 'Hoeveel meter is deze afstand in werkelijkheid?', value: '3', confirmLabel: 'Instellen' })) ?? ''); if (!(m > 0)) return;
      plan.scale = px / m; await upsert('plan', plan); updScale(); toast(`Schaal ingesteld: 1 m = ${Math.round(plan.scale)} px`); setTool('select'); return;
    }
    if (tool.startsWith('place:')) {
      const ld = pendingLoad(tool.slice(6)); if (!ld) { setTool('select'); return; }
      const q = placeSym(ld.type, p, e.shiftKey);
      const sym = await upsert('symbol', { plan_id: plan.id, type: ld.type, x: q.x / W, y: q.y / H, rot: q.rot ?? 0, circuit_id: ld.circuit_id, label: ld.label ?? null, spos: ld.pos ?? null, sgrp: ld.grp ?? null }) as Symbol_;
      symbols.push(sym);
      if ((ld.n || 1) > 1) { ld.n -= 1; await upsert('schema_load', ld); }
      else { await softDelete('schema_load', ld.id); pending.splice(pending.indexOf(ld), 1); }
      // verder met het volgende onderdeel van dezelfde kring
      const nxt = pendingLoad(ld.id) ?? pending.find((l) => l.circuit_id === ld.circuit_id);
      if (nxt) { tool = `place:${nxt.id}`; drawPalList(); drawGhost(); } else { setTool('select'); selSym = sym.id; }
      drawSyms(); drawSide(); return;
    }
    if (tool.startsWith('sym:')) {
      const en = symbolEntry(tool.slice(4)), id = joinType(tool.slice(4), en?.multi ? gang : 1), q = placeSym(id, p, e.shiftKey);
      const sym = await upsert('symbol', { plan_id: plan.id, type: id, x: q.x / W, y: q.y / H, rot: q.rot ?? 0, circuit_id: activeCircuit }) as Symbol_;
      symbols.push(sym); selSym = sym.id; drawSyms(); drawSide();
    }
  });

  // ---------- zijpaneel ----------
  function symIcon(type: string) {
    const g = symbolGeom(type, 'plan'); if (!g) return icon('Square', 16);
    const ic = svg('svg', { width: 26, height: 22, viewBox: `0 0 ${g.w + 2} ${g.h + 2}`, preserveAspectRatio: 'xMidYMid meet' });
    ic.innerHTML = symbolMarkup(type, 'plan', (g.w + 2) * g.anchor.x + (g.anchor.x === 0 ? 1 : 0), (g.h + 2) / 2, 1, 0, 1.6); return ic;
  }
  /** Lijst van wat nog moet gebeuren: onderdelen van kringen die nog niet op het plan staan, en symbolen zonder kring. */
  function pendingPanel() {
    const unlinked = symbols.filter((x) => !x.circuit_id);
    const byCirc = new Map<string, SchemaLoad[]>(); for (const l of pending) byCirc.set(l.circuit_id, [...(byCirc.get(l.circuit_id) ?? []), l]);
    const groups = circuits.filter((c) => byCirc.has(c.id));
    const sections: HTMLElement[] = [];
    if (!groups.length && !unlinked.length) {
      return h('div', null, h('h4', null, 'Te plaatsen'), h('p', { class: 'hint' }, 'Alles wat aan een kring hangt staat op een plan. Onderdelen die je op het eendraadschema toevoegt verschijnen hier om op het plan te zetten.'));
    }
    const pick = (c: { id: string }, l: SchemaLoad) => { activeCircuit = c.id; circSel.value = c.id; setTool(`place:${l.id}`); };
    for (const c of groups) {
      const ls = byCirc.get(c.id)!;
      sections.push(h('div', { style: { marginTop: '6px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', fontSize: '12px' } }, h('i', { style: { width: '10px', height: '10px', borderRadius: '50%', background: circuitColor(c.id, order), display: 'inline-block' } }),
          `${c.nr ?? ''} ${c.name}`, h('span', { class: 'spacer' }), btn('Alles plaatsen', { variant: 'ghost', title: 'Eén voor één plaatsen, in volgorde van het schema', onClick: () => pick(c, ls[0]) })),
        ...ls.map((l) => h('button', { class: `pal-item ${tool === `place:${l.id}` ? 'active' : ''}`, title: 'Klik, daarna op het plan klikken om te plaatsen', onClick: () => pick(c, l) },
          symIcon(l.type), h('span', { style: { flex: '1', textAlign: 'left' } }, symbolEntry(l.type)?.label ?? l.type, l.label ? h('span', { class: 'hint' }, ` · ${l.label}`) : null),
          (l.n || 1) > 1 ? h('span', { class: 'pal-count' }, `× ${l.n}`) : null))));
    }
    return h('div', null, h('h4', null, `Te plaatsen (${pendingCount()})`),
      pendingCount() ? h('p', { class: 'hint' }, 'Nog niet op een plan: gevonden op het eendraadschema. Staat het op een andere verdieping, schakel dan eerst naar dat plan.') : null,
      ...sections,
      unlinked.length ? h('div', { style: { marginTop: '10px' } }, h('h4', { style: { color: '#b35c00' } }, `Zonder kring (${unlinked.length})`), h('p', { class: 'hint' }, 'Gestippelde oranje cirkel op het plan. Klik om te selecteren en een kring te kiezen.'),
        ...unlinked.map((u) => h('button', { class: 'pal-item', onClick: () => { setTool('select'); selSym = u.id; drawSyms(); drawSide(); } }, symIcon(u.type), h('span', { style: { flex: '1', textAlign: 'left' } }, symbolEntry(u.type)?.label ?? u.type, u.label ? h('span', { class: 'hint' }, ` · ${u.label}`) : null)))) : null);
  }

  function drawSide() {
    clear(side); updStatus();
    const sym = symbols.find((x) => x.id === selSym), sh = shapeById(selShape);
    const k = scale();
    if (sh) {
      const fields: FieldDef[] = [], vals: Record<string, any> = { ...sh };
      let title = '';
      if (sh.kind === 'cable') {
        title = 'Leiding'; vals.len = +(dist(...wallPts(sh)) / k).toFixed(3); vals.circ = sh.ref_id; vals.style = sh.sub;
        fields.push({ key: 'len', label: 'Lengte (m)', type: 'number', step: 0.01 }, { key: 'style', label: 'Soort', type: 'select', options: CABLE_STYLES.map((c) => ({ value: c.id, label: c.label })), allowEmpty: false },
          { key: 'circ', label: 'Kring', type: 'select', span: 2, options: circuits.map((c) => ({ value: c.id, label: `${c.nr ?? ''} ${c.name}` })) });
      } else if (sh.kind === 'wall') {
        title = 'Muur'; vals.len = +(dist(...wallPts(sh)) / k).toFixed(3);
        fields.push({ key: 'len', label: 'Lengte (m)', type: 'number', step: 0.01 }, { key: 'thick', label: 'Dikte (m)', type: 'select', options: THICKS, numeric: true, allowEmpty: false });
      } else if (sh.kind === 'window' || sh.kind === 'door') {
        title = sh.kind === 'door' ? 'Deur' : 'Raam';
        fields.push({ key: 'size', label: 'Breedte (m)', type: 'number', step: 0.05 });
        if (sh.kind === 'door') fields.push({ key: 'swing', label: 'Draait naar andere kant', type: 'checkbox' }, { key: 'hinge', label: 'Scharnier aan andere kant', type: 'checkbox' });
        vals.swing = (sh.flip ?? 0) & 1; vals.hinge = ((sh.flip ?? 0) >> 1) & 1;
      } else if (sh.kind === 'stair' || sh.kind === 'furniture') {
        title = sh.kind === 'stair' ? 'Trap' : 'Meubel'; vals.bw = +(Math.abs(sh.x2! - sh.x1!) / k).toFixed(2); vals.bh = +(Math.abs(sh.y2! - sh.y1!) / k).toFixed(2);
        if (sh.kind === 'furniture') fields.push({ key: 'sub', label: 'Soort', type: 'select', options: FURNITURE.map((f) => ({ value: f.id, label: f.label })), allowEmpty: false });
        fields.push({ key: 'label', label: 'Opschrift' }, { key: 'bw', label: 'Breedte (m)', type: 'number', step: 0.05 }, { key: 'bh', label: 'Diepte (m)', type: 'number', step: 0.05 }, { key: 'rot', label: 'Rotatie (°)', type: 'number' });
      } else if (sh.kind === 'text') {
        title = 'Tekst'; fields.push({ key: 'label', label: 'Tekst', span: 2 }, { key: 'size', label: 'Grootte (m)', type: 'number', step: 0.05 });
      }
      const form = buildForm(fields, vals);
      Object.values(form.inputs).forEach((i) => i.addEventListener('change', async () => {
        const v = form.read();
        if (sh.kind === 'cable') { sh.sub = v.style; sh.ref_id = v.circ; }
        if (sh.kind === 'wall' || sh.kind === 'cable') {
          if (v.len && v.len > 0) { // lengte aanpassen: tweede eindpunt schuift mee (met aansluitende muren)
            const [a, b] = wallPts(sh), d = dist(a, b) || 1, nb = { x: a.x + ((b.x - a.x) / d) * v.len * k, y: a.y + ((b.y - a.y) / d) * v.len * k };
            const linked = walls().filter((x) => x !== sh && (dist({ x: x.x1!, y: x.y1! }, b) < 2 || dist({ x: x.x2!, y: x.y2! }, b) < 2));
            for (const x of linked) { if (dist({ x: x.x1!, y: x.y1! }, b) < 2) { x.x1 = nb.x; x.y1 = nb.y; } else { x.x2 = nb.x; x.y2 = nb.y; } await upsert('shape', x); }
            sh.x2 = nb.x; sh.y2 = nb.y;
            await upsert('shape', sh); for (const x of [sh, ...linked]) await clampOpenings(x);
          }
          if (sh.kind === 'wall') sh.thick = v.thick ?? 0.2;
        } else if (sh.kind === 'window' || sh.kind === 'door') {
          sh.size = v.size || sh.size; if (sh.kind === 'door') sh.flip = (v.swing ? 1 : 0) | (v.hinge ? 2 : 0);
        } else if (sh.kind === 'stair' || sh.kind === 'furniture') {
          if (sh.kind === 'furniture') sh.sub = v.sub; sh.label = v.label; sh.rot = v.rot ?? 0;
          const x0 = Math.min(sh.x1!, sh.x2!), y0 = Math.min(sh.y1!, sh.y2!);
          sh.x1 = x0; sh.y1 = y0; sh.x2 = x0 + (v.bw || vals.bw) * k; sh.y2 = y0 + (v.bh || vals.bh) * k;
        } else { sh.label = v.label; sh.size = v.size ?? 0.4; }
        await upsert('shape', sh); drawShapes(); drawSide();
      }));
      side.append(h('div', { style: { display: 'flex', alignItems: 'center' } }, h('h3', null, title), h('span', { class: 'spacer' }), btn('', { icon: 'X', variant: 'ghost', onClick: () => { selShape = null; drawShapes(); drawSide(); } })),
        form.el, btn('Verwijderen', { icon: 'Trash2', variant: 'danger', onClick: () => delShape(sh) }));
      return;
    }
    const counts = new Map<string, number>(); for (const x of symbols) if (x.circuit_id) counts.set(x.circuit_id, (counts.get(x.circuit_id) ?? 0) + 1);
    const unlinked = symbols.filter((x) => !x.circuit_id).length;
    if (!sym) {
      const t = TOOLS.find((x) => x.id === tool), f = FURNITURE.find((x) => `furn:${x.id}` === tool), cb = CABLE_STYLES.find((x) => `cable:${x.id}` === tool);
      const hint = t ? t.hint : cb ? 'Klik de punten van het leidingtraject. De kleur volgt de actieve kring (bovenaan). Typ een lengte + Enter, Esc = stoppen.' : f ? 'Sleep een rechthoek, of klik voor het standaardformaat.' : tool === 'scale' ? 'Klik twee punten waarvan je de afstand kent (bv. de breedte van een deur of een muur) en geef die in meter in.'
        : tool.startsWith('place:') ? `Klik op het plan om "${symbolEntry(pendingLoad(tool.slice(6))?.type ?? '')?.label ?? 'het onderdeel'}" te plaatsen. Daarna volgt het volgende onderdeel van dezelfde kring. Esc of rechtsklik = stoppen.`
        : tool.startsWith('sym:') ? `Klik op het plan om "${symbolEntry(tool.slice(4))?.label}" te plaatsen. Stopcontacten klikken vanzelf tegen de dichtstbijzijnde muur (Shift = vrij). Rechtsklik om te stoppen.` : '';
      side.append(h('div', null, h('h4', null, tool === 'select' ? 'Plan' : 'Tekenen'), h('p', { class: 'muted' }, hint || 'Klik een element of symbool aan om het te bewerken, of kies links een tool.'),
        !plan.scale ? h('p', { style: { color: '#b35c00' } }, '⚠ Schaal niet ingesteld: maten zijn een schatting (plan = 15 m breed). Gebruik "Schaal instellen" bovenaan.') : null,
        ...(tool === 'wall' ? [h('p', { class: 'hint' }, 'Tip: typ de lengte (bv. 3,5) en druk Enter om een muur op maat te zetten.')] : [])),
        pendingPanel(),
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
      ...(symbolEntry(sym.type)?.multi ? [{ key: 'gang', label: 'Aantal (1-4)', type: 'select' as const, options: [1, 2, 3, 4], numeric: true, allowEmpty: false }] : []),
      { key: 'label', label: 'Label' }, { key: 'rot', label: 'Rotatie (°)', type: 'number' },
      { key: 'notes', label: 'Notities', type: 'textarea', span: 2 },
    ];
    const form = buildForm(fields, { ...sym, type: symbolEntry(sym.type)?.id ?? sym.type, gang: splitType(sym.type).n });
    Object.values(form.inputs).forEach((i) => i.addEventListener('change', async () => {
      const v = form.read(), en = symbolEntry(v.type); delete (v as any).gang;
      Object.assign(sym, v, { rot: v.rot ?? 0, type: joinType(v.type, en?.multi ? (form.inputs.gang ? Number((form.inputs.gang as HTMLSelectElement).value) : 1) : 1) }); await upsert('symbol', sym); drawSyms();
    }));
    side.append(h('div', { style: { display: 'flex', alignItems: 'center' } }, h('h3', null, symbolEntry(sym.type)?.label ?? sym.type), h('span', { class: 'spacer' }), btn('', { icon: 'X', variant: 'ghost', onClick: () => { selSym = null; drawSyms(); drawSide(); } })),
      form.el,
      btn('Verwijderen', { icon: 'Trash2', variant: 'danger', onClick: async () => { await softDelete('symbol', sym.id); symbols.splice(symbols.indexOf(sym), 1); selSym = null; drawSyms(); drawSide(); } }));
  }

  async function delShape(sh: Shape) {
    const gone = [sh, ...(sh.kind === 'wall' ? shapes.filter((x) => x.ref_id === sh.id) : [])];
    for (const x of gone) { await softDelete('shape', x.id); shapes.splice(shapes.indexOf(x), 1); }
    selShape = null; drawShapes(); drawSide();
  }

  function exportSvg() {
    const clone = s.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('.halo').forEach((n) => n.remove());
    clone.setAttribute('viewBox', `0 0 ${W} ${H}`); clone.setAttribute('width', String(W)); clone.setAttribute('height', String(H)); clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.querySelector('image')?.remove(); gridRect.isConnected && clone.querySelector('rect[fill^="url"]')?.remove();
    download(`situatieplan-${plan.name}.svg`, clone.outerHTML, 'image/svg+xml');
  }

  window.addEventListener('keydown', async function onKey(e) {
    if (!root.isConnected) { window.removeEventListener('keydown', onKey); return; }
    if ((e.target as HTMLElement).matches?.('input,textarea,select')) return;
    if (pendingKey) {   // sneltoets opnemen voor een favoriet
      e.preventDefault();
      const f = favOf(pendingKey);
      if (f && e.key !== 'Escape') {
        if (e.key === 'Delete' || e.key === 'Backspace') delete f.key;
        else if (/^[a-z0-9]$/i.test(e.key) && e.key.toLowerCase() !== 'r') { const k = e.key.toLowerCase(); favs.forEach((x) => { if (x.key === k) delete x.key; }); f.key = k; }
        else { toast(e.key.toLowerCase() === 'r' ? 'R draait een symbool en kan niet als sneltoets dienen' : 'Kies een letter of cijfer', 'error'); return; }
        saveFavs();
      }
      pendingKey = null; drawPalList(); return;
    }
    if (isLine(tool) && drawing) {
      if (/^[0-9.,]$/.test(e.key)) { lenBuf += e.key; drawGhost(); e.preventDefault(); return; }
      if (e.key === 'Backspace' && lenBuf) { lenBuf = lenBuf.slice(0, -1); drawGhost(); e.preventDefault(); return; }
      if (e.key === 'Enter') {
        if (lenBuf && cursor) {
          const k = scale(), L = NUM(lenBuf) * k, d = dist(drawing, cursor) || 1;
          const end = { x: drawing.x + ((cursor.x - drawing.x) / d) * L, y: drawing.y + ((cursor.y - drawing.y) / d) * L };
          if (L > 0) { await addShape(lineProps(drawing, end)); drawing = end; cursor = end; }
          lenBuf = ''; drawShapes();
        } else drawing = null;
        drawGhost(); return;
      }
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {   // sneltoets van een favoriet
      const fav = favs.find((f) => f.key === e.key.toLowerCase());
      if (fav) { e.preventDefault(); setTool(fav.tool); return; }
    }
    if (e.key === 'Escape') { drawing = null; scaleA = null; rectDrag = null; lenBuf = ''; drawGhost(); if (tool !== 'select') setTool('select'); else { selShape = null; selSym = null; drawShapes(); drawSyms(); drawSide(); } return; }
    const sh = shapeById(selShape);
    if (sh && (e.key === 'Delete' || e.key === 'Backspace')) { await delShape(sh); return; }
    const sym = symbols.find((x) => x.id === selSym); if (!sym) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { await softDelete('symbol', sym.id); symbols.splice(symbols.indexOf(sym), 1); selSym = null; drawSyms(); drawSide(); }
    if (e.key.toLowerCase() === 'r') { sym.rot = (sym.rot + 90) % 360; await upsert('symbol', sym); drawSyms(); drawSide(); }
  });

  drawPal(); drawAll(); drawSide();
}

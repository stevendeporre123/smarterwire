import { h, svg, btn, icon, toast, clear, busy } from '../lib/dom';
import { buildForm, formModal, modal, panZoom, badge, choose, confirmDialog, type FieldDef } from '../lib/ui';
import { upsert, softDelete, saveImage, assetUrl, assetSize, putOp } from '../db/repo';
import { run } from '../db/client';
import { boardsOf, devicesOf, circuitsOf, type Board, type Device, type Project, type Circuit } from '../domain/model';
import { CURVES, DEVICE_KINDS, DIFF_TYPES, deviceTitle, isGroupParent, isFeeder, supplyOf, supplyPhases, supplyPoles, supplyConflict, deviceFieldKeys, defaultModules, normPoles, polesText } from '../domain/devices';
import { ensureCircuits, unlinkDevice } from '../domain/circuits';
import { moduleArt } from '../domain/modules';
import { deviceForm } from './deviceform';
import { openGenerate } from './generate';
import { generateNewBoards, DEFAULT_GEN } from '../domain/newboard';
import { editCircuit } from './circuits';
import { analyzeBoardPhoto } from '../lib/ai';
import { uid } from '../lib/id';

const LS_BOARD = (pid: string) => `smarterwire.board.${pid}`;

/** Leid rij en positie af uit de rechthoeken op de foto. */
export function recomputeLayout(devs: Device[]) {
  const withRect = devs.filter((d) => d.rx != null).sort((a, b) => (a.ry! + a.rh! / 2) - (b.ry! + b.rh! / 2));
  if (!withRect.length) return [];
  const medH = withRect.map((d) => d.rh!).sort((a, b) => a - b)[Math.floor(withRect.length / 2)];
  const rows: Device[][] = [];
  for (const d of withRect) {
    const cy = d.ry! + d.rh! / 2, last = rows[rows.length - 1];
    if (last) { const avg = last.reduce((s, x) => s + x.ry! + x.rh! / 2, 0) / last.length; if (Math.abs(cy - avg) < medH * 0.6) { last.push(d); continue; } }
    rows.push([d]);
  }
  const changed: Device[] = [];
  rows.forEach((r, i) => r.sort((a, b) => a.rx! - b.rx!).forEach((d, j) => {
    if (d.row_no !== i || d.pos !== j) { d.row_no = i; d.pos = j; changed.push(d); }
  }));
  return changed;
}

/** Zet voor elk toestel het differentieel links ervan (zelfde rij) als beschermer, anders de hoofdschakelaar. */
export function guessParents(devs: Device[]) {
  const sorted = devs.slice().sort((a, b) => a.row_no - b.row_no || a.pos - b.pos);
  const main = sorted.find((d) => d.kind === 'hoofd');
  const out: Device[] = [];
  for (const d of sorted) {
    if (d.kind === 'hoofd') continue;
    let p: Device | undefined;
    for (const c of sorted) {
      if (c === d || !isGroupParent(c.kind) || c.kind === 'hoofd') continue;
      if (c.row_no === d.row_no && c.pos < d.pos && (!p || c.pos > p.pos)) p = c;
    }
    const target = (d.kind !== 'differentieel' ? p : undefined) ?? main;
    if (target && d.parent_id !== target.id) { d.parent_id = target.id; out.push(d); }
  }
  return out;
}

export async function renderBoard(root: HTMLElement, project: Project) {
  let boards = await boardsOf(project.id);
  let boardId = localStorage.getItem(LS_BOARD(project.id)) ?? boards[0]?.id;
  if (!boards.find((b) => b.id === boardId)) boardId = boards[0]?.id;

  const reload = () => { clear(root); return renderBoard(root, project); };
  const newBoard = (kind: 'bestaand' | 'nieuw' = 'bestaand') => formModal({
    title: kind === 'nieuw' ? 'Nieuwe kast (ontwerp)' : 'Bestaande zekeringskast',
    fields: [{ key: 'name', label: 'Naam', required: true, span: 2 }, { key: 'location', label: 'Locatie', placeholder: 'bv. kelder, garage…', span: 2 }],
    values: { name: kind === 'nieuw' ? 'Nieuwe kast' : `Kast ${boards.filter((b) => b.kind === 'bestaand').length + 1}` },
    onSave: async (v) => { const b = await upsert('board', { ...v, project_id: project.id, kind }); localStorage.setItem(LS_BOARD(project.id), b.id); await reload(); },
  });

  if (!boards.length) {
    root.append(h('div', { class: 'page' }, h('div', { class: 'card empty-state' }, icon('Camera', 40), h('h3', null, 'Begin met een foto van de zekeringskast'),
      h('p', null, 'Voeg een bestaande kast toe, laad een foto op en markeer de toestellen.'),
      btn('Bestaande kast toevoegen', { icon: 'Plus', variant: 'primary', onClick: () => newBoard('bestaand') }))));
    return;
  }

  const board = boards.find((b) => b.id === boardId)!;
  let devices = await devicesOf(board.id);
  let circuits = await circuitsOf(project.id);
  const supply = supplyOf(project);
  const circuitsByDevice = () => {
    const m = new Map<string, Circuit[]>();
    for (const c of circuits) { const id = board.kind === 'bestaand' ? c.device_id : c.new_device_id; if (id) (m.get(id) ?? m.set(id, []).get(id)!).push(c); }
    return m;
  };

  const photoUrl = await assetUrl(board.asset_id);
  const size = board.asset_id ? await assetSize(board.asset_id) : undefined;
  let view: 'foto' | 'virtueel' = photoUrl ? 'foto' : 'virtueel';
  let selId: string | null = null;

  function feedHint() {
    const srcId = board.kind === 'nieuw' ? board.src_board_id : board.id;
    const c = circuits.find((x) => x.feeds_board_id === srcId);
    return c ? ` · onderverdeler, gevoed via kring ${c.nr ?? ''} ${c.name}` : '';
  }

  // ---------- toolbar ----------
  const boardSel = h('select', { onChange: (e: Event) => { localStorage.setItem(LS_BOARD(project.id), (e.target as HTMLSelectElement).value); reload(); } },
    boards.map((b) => h('option', { value: b.id, selected: b.id === board.id }, `${b.kind === 'nieuw' ? '★ ' : ''}${b.name}`)));
  const fileInput = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: async () => {
    const f = (fileInput as HTMLInputElement).files?.[0]; if (!f) return;
    const img = await saveImage(f); await upsert('board', { ...board, asset_id: img.id }); toast('Foto opgeladen'); reload();
  } });
  const viewBtns = h('div', { style: { display: 'flex', gap: '4px' } });
  const toolbar = h('div', { class: 'toolbar' }, boardSel,
    btn('', { icon: 'Plus', variant: 'ghost', title: 'Kast of onderverdeler toevoegen', onClick: () => newBoard('bestaand') }),
    btn('', { icon: 'Pencil', variant: 'ghost', title: 'Kast hernoemen', onClick: () => formModal({ title: 'Kast bewerken', fields: [{ key: 'name', label: 'Naam', span: 2 }, { key: 'location', label: 'Locatie', span: 2 }, { key: 'notes', label: 'Notities', type: 'textarea', span: 2 }], values: board,
      onSave: async (v) => { await upsert('board', { ...board, ...v }); reload(); },
      onDelete: async () => { await softDelete('board', board.id); localStorage.removeItem(LS_BOARD(project.id)); reload(); } }) }),
    h('span', { class: 'hint' }, board.kind === 'nieuw' ? 'ontwerp nieuwe kast' : 'bestaande toestand', feedHint()),
    h('span', { class: 'spacer' }), viewBtns);

  if (board.kind === 'bestaand') {
    toolbar.append(fileInput, btn(photoUrl ? 'Andere foto' : 'Foto opladen', { icon: 'Camera', onClick: () => fileInput.click() }));
    if (photoUrl) toolbar.append(btn('AI-voorstel', { icon: 'Sparkles', variant: 'accent', title: 'Toestellen herkennen met AI (proxy vereist)', onClick: runAi }),
      btn('Ouders afleiden', { icon: 'GitBranch', title: 'Beschermend differentieel automatisch afleiden uit de positie', onClick: async () => {
        const ch = guessParents(devices); await run(ch.map((d) => putOp('device', d))); toast(`${ch.length} toestel(len) gekoppeld`); refresh(); } }));
  }
  toolbar.append(btn('+ Toestel', { icon: 'Plus', title: 'Toestel manueel toevoegen (zonder foto)', onClick: () => addDeviceManual() }),
    btn('Alles wissen', { icon: 'Trash2', variant: 'ghost', title: 'Alle toestellen van deze kast verwijderen', onClick: () => clearAll() }));
  toolbar.append(btn(board.kind === 'nieuw' ? 'Opnieuw genereren' : 'Nieuwe kast voorstellen', { icon: 'WandSparkles', variant: 'accent', title: 'Voorstel voor alle kasten: elke kring eigen automaat, per 30 mA-differentieel', onClick: genNew }));

  // ---------- canvas ----------
  const canvas = h('div', { class: 'canvas' });
  const side = h('div', { class: 'side' });
  root.classList.add('page-full');
  root.append(toolbar, h('div', { class: 'split' }, canvas, side));

  function setViewButtons() {
    clear(viewBtns);
    if (photoUrl) viewBtns.append(btn('Foto', { icon: 'Image', variant: 'secondary', onClick: () => { view = 'foto'; draw(); } }));
    viewBtns.append(btn('Virtueel', { icon: 'LayoutPanelTop', onClick: () => { view = 'virtueel'; draw(); } }));
    [...viewBtns.children].forEach((c, i) => c.classList.toggle('active', (photoUrl ? ['foto', 'virtueel'][i] : 'virtueel') === view));
  }

  async function refresh() { await ensureCircuits(project); [devices, circuits] = await Promise.all([devicesOf(board.id), circuitsOf(project.id)]); draw(); drawSide(); }

  function draw() {
    setViewButtons(); clear(canvas);
    if (view === 'foto' && photoUrl && size) drawPhoto(size.width, size.height); else drawVirtual();
  }

  // --- foto-modus: rechthoeken tekenen/verplaatsen ---
  function drawPhoto(W: number, H: number) {
    const s = svg('svg', { preserveAspectRatio: 'xMidYMid meet' });
    const pz = panZoom(s as SVGSVGElement, W, H);
    s.append(svg('image', { href: photoUrl!, x: 0, y: 0, width: W, height: H }));
    const cByD = circuitsByDevice();
    const layer = svg('g'); s.append(layer);
    const rects = new Map<string, SVGRectElement>();
    for (const d of devices.filter((d) => d.rx != null)) {
      const warn = isFeeder(d.kind) && !cByD.has(d.id);
      const r = svg('rect', { x: d.rx! * W, y: d.ry! * H, width: d.rw! * W, height: d.rh! * H, class: `dev-rect ${warn ? 'warn' : ''} ${d.id === selId ? 'sel' : ''}` });
      rects.set(d.id, r);
      r.addEventListener('pointerdown', (e) => startMove(e, d, r));
      layer.append(r, svg('text', { x: d.rx! * W + 3, y: d.ry! * H - 4, class: 'dev-tag' }, deviceTitle(d)));
    }
    // nieuw rechthoek tekenen
    let drag: { x0: number; y0: number; el: SVGRectElement } | null = null;
    s.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target as Element).closest('.dev-rect') || s.classList.contains('panning')) return;
      const p = pz.toSvg(e.clientX, e.clientY);
      const el = svg('rect', { x: p.x, y: p.y, width: 0, height: 0, class: 'dev-rect sel', 'pointer-events': 'none' }) as SVGRectElement;
      layer.append(el); drag = { x0: p.x, y0: p.y, el }; s.setPointerCapture(e.pointerId);
    });
    s.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = pz.toSvg(e.clientX, e.clientY);
      drag.el.setAttribute('x', String(Math.min(p.x, drag.x0))); drag.el.setAttribute('y', String(Math.min(p.y, drag.y0)));
      drag.el.setAttribute('width', String(Math.abs(p.x - drag.x0))); drag.el.setAttribute('height', String(Math.abs(p.y - drag.y0)));
    });
    s.addEventListener('pointerup', async () => {
      if (!drag) return;
      const el = drag.el, x = +el.getAttribute('x')!, y = +el.getAttribute('y')!, w = +el.getAttribute('width')!, h_ = +el.getAttribute('height')!;
      drag = null; el.remove();
      if (w < W * 0.008 || h_ < H * 0.008) return;
      const d = await upsert('device', { board_id: board.id, kind: 'automaat', poles: '2P', curve: 'C', breaking_ka: 3, phase: supply === '1x230' ? null : 'L1', modules: Math.max(1, Math.round(w / h_ * 2.2)), row_no: 0, pos: 0, rx: x / W, ry: y / H, rw: w / W, rh: h_ / H });
      devices = await devicesOf(board.id);
      const ch = recomputeLayout(devices); await run(ch.map((c) => putOp('device', c)));
      selId = d.id; await refresh();
    });
    // verplaatsen / selecteren
    function startMove(e: PointerEvent, d: Device, r: SVGRectElement) {
      if (e.button !== 0) return;
      e.stopPropagation(); selId = d.id; drawSide();
      rects.forEach((x, id) => x.classList.toggle('sel', id === d.id));
      const start = pz.toSvg(e.clientX, e.clientY), ox = d.rx!, oy = d.ry!; let moved = false;
      const move = (ev: PointerEvent) => {
        const p = pz.toSvg(ev.clientX, ev.clientY);
        const dx = (p.x - start.x) / W, dy = (p.y - start.y) / H;
        if (Math.abs(dx) + Math.abs(dy) > 0.002) moved = true;
        d.rx = ox + dx; d.ry = oy + dy; r.setAttribute('x', String(d.rx * W)); r.setAttribute('y', String(d.ry * H));
      };
      const up = async () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
        if (!moved) return;
        const ch = recomputeLayout(devices); await run([putOp('device', d), ...ch.map((c) => putOp('device', c))]); await refresh();
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    }
    canvas.append(s, h('div', { class: 'hint', style: { position: 'absolute', left: '10px', bottom: '8px', background: 'rgba(255,255,255,.85)', padding: '2px 8px', borderRadius: '6px' } },
      'Sleep om een toestel te omkaderen · wiel = zoom · spatie of middelknop = pannen'));
  }

  // --- virtuele kast ---
  function drawVirtual() {
    const U = 38, ROW_H = 190, PAD = 40;
    const rows = new Map<number, Device[]>();
    for (const d of devices) (rows.get(d.row_no) ?? rows.set(d.row_no, []).get(d.row_no)!).push(d);
    const rowKeys = [...rows.keys()].sort((a, b) => a - b);
    const cByD = circuitsByDevice();
    let maxW = 600;
    const s = svg('svg');
    rowKeys.forEach((rk, i) => {
      const y = PAD + i * ROW_H; let x = PAD;
      s.append(svg('rect', { x: PAD - 14, y: y + 66, width: 2000, height: 8, fill: '#b5bdb5' }), svg('text', { x: 6, y: y + 18, 'font-size': 11, fill: '#555e55' }, `R${rk + 1}`));
      for (const d of rows.get(rk)!.sort((a, b) => a.pos - b.pos)) {
        const cs = cByD.get(d.id) ?? [], main = isGroupParent(d.kind), art = moduleArt(d);
        const w = Math.max(0.5, d.modules || 1) * U - 4, BOXH = 110;
        const g = svg('g', { style: 'cursor:pointer', onclick: () => { selId = d.id; draw(); drawSide(); } });
        if (art) {
          const ih = BOXH, iy = y + 5;
          g.append(svg('image', { href: art.url, x, y: iy, width: w, height: ih, preserveAspectRatio: 'none' }));
          if (art.label) {
            const l = art.label, lh = l.h * ih / l.lines.length;
            g.append(svg('rect', { x: x + l.x * w, y: iy + l.y * ih, width: l.w * w, height: l.h * ih, fill: '#e2e2e2' }),
              ...l.lines.map((t, i) => svg('text', { x: x + l.x * w + 1, y: iy + l.y * ih + lh * (i + 0.82), 'font-size': Math.min(lh * 0.95, 13), 'font-weight': 700, 'font-family': 'Arial' }, t)));
          }
          g.append(svg('rect', { x: x - 2, y: iy - 2, width: w + 4, height: ih + 4, rx: 3, fill: 'none', stroke: d.id === selId ? '#0066aa' : 'none', 'stroke-width': 3 }),
            ...(d.phase ? [svg('text', { x: x + w / 2, y: iy + ih + 11, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 600, fill: '#0066aa' }, d.phase)] : []));
        } else {
          g.append(svg('rect', { x, y: y + 5, width: w, height: BOXH, rx: 2, fill: main ? '#e3f0e3' : '#e6e6e6', stroke: d.id === selId ? '#0066aa' : main ? '#008000' : '#555e55', 'stroke-width': d.id === selId ? 3 : 1.5 }),
            svg('rect', { x: x + w / 2 - 8, y: y + 46, width: 16, height: 26, rx: 3, fill: '#2b312b' }),
            svg('text', { x: x + w / 2, y: y + 22, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600 }, `${d.curve ?? ''}${d.rating_a ?? ''}`),
            svg('text', { x: x + w / 2, y: y + 36, 'text-anchor': 'middle', 'font-size': 9, fill: '#555e55' }, d.sens_ma ? `${d.sens_ma}mA` : (DEVICE_KINDS[d.kind]?.short ?? '')),
            ...(d.phase ? [svg('text', { x: x + w / 2, y: y + 96, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 600, fill: '#0066aa' }, d.phase)] : []));
          g.append(svg('text', { x: x + w / 2, y: y + 108, 'text-anchor': 'middle', 'font-size': 9, fill: '#555e55' }, (d.label ?? '').slice(0, 8)));
        }
        const warn = isFeeder(d.kind) && !cs.length;
        g.append(svg('text', { x: x + w / 2, y: y + 138, 'text-anchor': 'middle', 'font-size': 10, fill: warn ? '#e07800' : '#008000', 'font-weight': 600 }, warn ? '?' : cs.map((c) => c.nr || '•').join('+')));
        s.append(g);
        x += w + 4;
      }
      maxW = Math.max(maxW, x + PAD);
    });
    if (!rowKeys.length) s.append(svg('text', { x: 40, y: 60, 'font-size': 14, fill: '#555e55' }, view === 'virtueel' && photoUrl ? 'Nog geen toestellen – omkader ze in de fotoweergave.' : 'Nog geen toestellen.'));
    const H = Math.max(240, PAD * 2 + rowKeys.length * ROW_H);
    s.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    panZoom(s as SVGSVGElement, maxW, H);
    canvas.append(s);
    canvas.style.background = '#f5f6f5';
  }

  // ---------- zijpaneel ----------
  function drawSide() {
    clear(side);
    const d = devices.find((x) => x.id === selId);
    if (!d) {
      side.append(h('div', null, h('h4', null, 'Toestellen'), h('p', { class: 'muted' }, devices.length ? `${devices.length} toestel(len). Klik er één aan om te bewerken.` : 'Teken een kader rond een automaat op de foto, of laat AI een voorstel doen.')),
        deviceList());
      return;
    }
    const dform = deviceForm(d, { supply, devices, onChange: async (kindChanged) => { if (kindChanged) await refresh(); else draw(); } });
    const cs = circuitsByDevice().get(d.id) ?? [];
    side.append(
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('h3', null, deviceTitle(d)), h('span', { class: 'spacer' }), btn('', { icon: 'X', variant: 'ghost', onClick: () => { selId = null; draw(); drawSide(); } })),
      ...(dform.conflict ? [badge(dform.conflict, 'err')] : []),
      dform.el,
      h('div', null, h('h4', null, 'Kring van dit toestel'),
        cs.length ? h('div', null, cs.map((c) => h('div', { style: { padding: '4px 0' } }, h('a', { href: '#', onClick: (e: Event) => { e.preventDefault(); editCircuit(project, c, () => refresh()); } }, `${c.nr ?? ''} ${c.name}`)))) : h('p', { class: 'hint' }, isFeeder(d.kind) ? 'Wordt aangemaakt…' : 'Dit toestel voedt zelf geen kring.'),
        cs.length > 1 ? badge('Meerdere kringen op één zekering', 'warn') : null,
        ...(cs.length ? [btn('Kring bewerken', { icon: 'Pencil', variant: 'primary', onClick: () => editCircuit(project, cs[0], () => refresh()) })] : [])),
      btn('Toestel verwijderen', { icon: 'Trash2', variant: 'danger', onClick: async () => { if (!(await confirmDialog({ title: 'Toestel verwijderen', message: 'Dit toestel verwijderen?' }))) return; await softDelete('device', d.id); await unlinkDevice(d.id); selId = null; await refresh(); } }));
  }

  function deviceList() {
    const cByD = circuitsByDevice();
    return h('div', null, devices.slice().sort((a, b) => a.row_no - b.row_no || a.pos - b.pos).map((d) =>
      h('div', { class: 'pal-item', onClick: () => { selId = d.id; draw(); drawSide(); } },
        h('span', { class: 'muted', style: { width: '28px' } }, `R${d.row_no + 1}`), h('span', { style: { flex: 1 } }, deviceTitle(d)),
        isFeeder(d.kind) && !cByD.has(d.id) ? badge('?', 'warn') : null)));
  }

  async function addDeviceManual() {
    const row = devices.length ? Math.max(...devices.map((d) => d.row_no)) : 0;
    const pos = devices.filter((d) => d.row_no === row).length;
    const d = await upsert('device', { board_id: board.id, kind: 'automaat', poles: '2P', curve: 'C', rating_a: 16, breaking_ka: 3, phase: supply === '1x230' ? null : 'L1', row_no: row, pos, modules: 1 });
    selId = d.id; await refresh();
  }

  function genNew() { return openGenerate(project, () => reload()); }

  /** Alle toestellen van deze kast verwijderen (lege automatische kringen verdwijnen mee). */
  async function removeAllDevices() {
    for (const d of devices) { await softDelete('device', d.id); await unlinkDevice(d.id); }
    devices = []; selId = null;
  }
  async function clearAll() {
    if (!devices.length) return;
    if (!(await confirmDialog({ title: 'Alle toestellen verwijderen', message: `Alle ${devices.length} toestellen van "${board.name}" verwijderen? Kringen met gegevens blijven bestaan, maar zonder zekering.`, confirmLabel: 'Alles verwijderen' }))) return;
    await removeAllDevices(); await refresh(); toast('Toestellen gewist');
  }

  let aiRunning = false;
  async function runAi() {
    if (aiRunning) return;
    aiRunning = true;
    let stop = busy('Foto wordt geanalyseerd door AI… (kan even duren)');
    try {
      const prop = await analyzeBoardPhoto(photoUrl!);
      stop();
      let mode: 'add' | 'replace' = 'add';
      if (devices.length) {
        const c = await choose(`${prop.length} toestel(len) gevonden`, `Er staan al ${devices.length} toestel(len) in deze kast. Wat wil je met de nieuwe voorstellen doen?`,
          [{ key: 'replace', label: `Alles vervangen (${devices.length} wissen)`, variant: 'danger' }, { key: 'add', label: 'Toevoegen aan de bestaande', variant: 'primary' }]);
        if (!c) return;
        mode = c as 'add' | 'replace';
      }
      stop = busy('Toestellen worden opgeslagen…');
      if (mode === 'replace') await removeAllDevices();
      const stmts = prop.map((p) => {
        const kind = p.kind in DEVICE_KINDS ? p.kind : 'anders', poles = p.poles ? normPoles(p.poles) : null;
        return putOp('device', { id: uid(), board_id: board.id, kind, label: p.label, poles, rating_a: p.rating_a, curve: p.curve, sens_ma: p.sens_ma, dtype: p.dtype, modules: p.modules ?? defaultModules(kind, poles), rx: p.rect.x, ry: p.rect.y, rw: p.rect.w, rh: p.rect.h, row_no: 0, pos: 0, notes: p.notes });
      });
      await run(stmts);
      devices = await devicesOf(board.id);
      const ch = recomputeLayout(devices); ch.push(...guessParents(devices));
      await run(ch.map((c) => putOp('device', c)));
      toast(`${prop.length} toestellen ${mode === 'replace' ? 'ingelezen' : 'toegevoegd'} – controleer ze!`); await refresh();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { stop(); aiRunning = false; }
  }

  draw(); drawSide();
}

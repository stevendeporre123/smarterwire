import { h, svg, btn, icon, download, clear, toast } from '../lib/dom';
import { buildForm, badge, type FieldDef } from '../lib/ui';
import { upsert, putOp, setOp, whereOp, softDelete } from '../db/repo';
import { run, type Op } from '../db/client';
import { uid } from '../lib/id';
import { boardsOf, circuitsOf, allDevicesOfProject, type Project, type Circuit, type Device } from '../domain/model';
import { buildDiagram } from '../domain/diagram';
import {
  CABLE_TYPES, FIRE_CLASSES, FUNCTIONS, INSTALL_MODES, CONDUIT_MODES, SECTIONS, STATUSES, CABLE_PRESETS, SUPPLIES, supplyOf, isThreePhase, defaultModules, deviceTitle, DEVICE_KINDS,
} from '../domain/devices';
import { cableLabel } from '../domain/devices';
import { CATALOG, FUNC_ORDER, symbolEntry, symbolGeom, symbolMarkup, splitType, joinType, type SymbolEntry } from '../domain/areisymbols';
import { schemaLoadsOf, planSymbolRows, toDiagramLoads, type SchemaLoad, type PlanSymbolRow } from '../domain/loads';
import { ensureCircuits, unlinkDevice } from '../domain/circuits';
import { getSetting, setSetting } from '../domain/settings';
import { deviceForm } from './deviceform';
import { openGenerate } from './generate';
import { SETS, setById, type CircuitSet } from '../domain/sets';

type Sel = { kind: 'circuit' | 'device' | 'supply' | 'load'; id: string } | null;
interface Fav { tool: string; key?: string }
interface PalItem { tool: string; label: string; group: string; icon: () => Element; kw?: string }

export async function renderSchema(root: HTMLElement, project: Project) {
  const boards = await boardsOf(project.id);
  if (!boards.length) {
    root.append(h('div', { class: 'page' }, h('div', { class: 'card empty-state' }, icon('Workflow', 40), h('h3', null, 'Nog geen schema'), h('p', null, 'Voeg eerst een zekeringskast toe en documenteer enkele kringen.'))));
    return;
  }
  let circuits: Circuit[] = [], devices: Device[] = [], planSyms: PlanSymbolRow[] = [], manual: SchemaLoad[] = [];
  const reloadData = async () => { [circuits, devices, planSyms, manual] = await Promise.all([circuitsOf(project.id), allDevicesOfProject(project.id), planSymbolRows(project.id), schemaLoadsOf(project.id)]); };
  await reloadData();
  let favs = await getSetting<Fav[]>('planFavs', [{ tool: 'sym:Stopcontact', key: 's' }, { tool: 'sym:Verlichtingstoestel', key: 'l' }, { tool: 'sym:Schakelaar algemeen symbool', key: 'e' }]);

  // standaardwaarden bij het plaatsen van een kabel uit het palet (blijven bewaard)
  const cabParams = await getSetting<Record<string, any>>('cableParams', { wires: 3, has_earth: 1, section_mm2: 2.5, cable_type: 'XVB', fire_class: 'Cca', install: null, conduit: null });
  const cabFields: FieldDef[] = [
    { key: 'wires', label: 'Aantal aders', type: 'number' }, { key: 'has_earth', label: 'Bevat aarding (G)', type: 'checkbox' },
    { key: 'section_mm2', label: 'Doorsnede (mm²)', type: 'select', options: SECTIONS, numeric: true }, { key: 'cable_type', label: 'Kabeltype', type: 'select', options: CABLE_TYPES },
    { key: 'fire_class', label: 'Brandklasse', type: 'select', options: FIRE_CLASSES }, { key: 'install', label: 'Plaatsing', type: 'select', options: INSTALL_MODES },
    { key: 'conduit', label: 'Los of in buis', type: 'select', options: CONDUIT_MODES, numeric: true, span: 2 },
  ];

  let which: 'bestaand' | 'nieuw' = boards.some((b) => b.kind === 'nieuw') ? 'nieuw' : 'bestaand';
  let tool = 'select', sel: Sel = null, gang = 1, palQuery = '', dragging = false, justDragged = false;
  const supply = () => supplyOf(project);
  const devOf = (c: Circuit) => devices.find((d) => d.id === (which === 'nieuw' ? c.new_device_id : c.device_id));
  const circuitOfDevice = (d: Device) => circuits.find((c) => (which === 'nieuw' ? c.new_device_id : c.device_id) === d.id);
  const allLoads = () => toDiagramLoads(planSyms, manual);
  const loadOf = (key: string) => allLoads().find((l) => `${l.src}:${l.id}` === key);

  const out = h('div', { class: 'schema-wrap' }), side = h('div', { class: 'side' }), pal = h('div', { class: 'pal' });
  root.classList.add('page-full');
  let current = '';

  // ---------- schema ----------
  const setKind = () => (tool.startsWith('set:') ? setById(tool.slice(4))?.kind : undefined);
  const slotMode = (): 'load' | 'bus' | null => (dragging || tool.startsWith('sym:') || setKind() === 'load' ? 'load' : tool === 'kring' || tool === 'diff' || tool === 'spd' || setKind() === 'circuit' ? 'bus' : null);
  async function draw() {
    const bs = boards.filter((b) => b.kind === which);
    const withDevs = bs.map((board) => ({ board, devices: devices.filter((d) => d.board_id === board.id) }));
    current = buildDiagram({
      title: `Eendraadschema – ${which === 'nieuw' ? 'nieuwe toestand' : 'bestaande toestand'}`, boards: withDevs, circuits, symbols: allLoads(), which, supply: supply(), ean: project.ean, supplyCable: project.supply_cable,
      selCircuit: sel?.kind === 'circuit' ? sel.id : null, selDevice: sel?.kind === 'device' ? sel.id : null, selSupply: sel?.kind === 'supply', selLoad: sel?.kind === 'load' ? sel.id : null, showSlots: slotMode(),
      meta: [project.name, [project.owner, project.address?.replace(/\n/g, ', ')].filter(Boolean).join(' · '), project.inspector ?? '', new Date().toLocaleDateString('nl-BE')].filter(Boolean) as string[],
    }).svg;
    out.innerHTML = current;
  }
  async function after(msg?: string) { await reloadData(); await draw(); drawSide(); if (msg) toast(msg); }
  const select = (s: Sel) => { sel = s; draw(); drawSide(); };

  // ---------- toestellen toevoegen / verwijderen ----------
  /** Voegt een toestel in op een bus, vóór het `index`-de toestel van die bus (zelfde volgorde als in het schema). */
  async function addDevice(kind: 'automaat' | 'differentieel' | 'overspanning', parentId: string, boardId: string, index: number, preset?: CircuitSet) {
    const three = isThreePhase(supply()), polesAll = three ? (supply() === '3x230' ? '3P' : '4P') : '2P';
    const mine = devices.filter((d) => d.board_id === boardId);
    const sib = mine.filter((d) => (d.parent_id ?? '') === parentId && !(parentId === '' && d.kind === 'hoofd')).sort((a, b) => a.row_no - b.row_no || a.pos - b.pos);
    let row = mine.length ? Math.max(...mine.map((d) => d.row_no)) : 0, pos = Math.max(-1, ...mine.filter((d) => d.row_no === row).map((d) => d.pos)) + 1;
    if (sib.length) {
      const i = Math.max(0, Math.min(index, sib.length));
      if (i === 0) { row = sib[0].row_no; pos = sib[0].pos - 1; }
      else if (i >= sib.length) { row = sib[sib.length - 1].row_no; pos = sib[sib.length - 1].pos + 1; }
      else { const a = sib[i - 1], b = sib[i]; row = a.row_no; pos = a.row_no === b.row_no ? (a.pos + b.pos) / 2 : a.pos + 1; }
    }
    const base: Partial<Device> = kind === 'automaat' ? { poles: '2P', curve: 'C', rating_a: 16, breaking_ka: 3, modules: 1, phase: three ? 'L1' : null }
      : kind === 'differentieel' ? { poles: polesAll, rating_a: 40, sens_ma: 30, dtype: 'A', modules: defaultModules('differentieel', polesAll) } : { poles: polesAll, modules: 2 };
    const dev = await upsert('device', { board_id: boardId, parent_id: parentId || null, kind, row_no: row, pos, ...base, ...(preset?.device ?? {}) });
    await ensureCircuits(project); await reloadData();
    let c = circuitOfDevice(dev as Device);
    if (preset && c) {   // set: leiding en onderdelen van de kring meteen invullen
      await upsert('circuit', { ...c, ...preset.circuit }); await reloadData();
      for (const types of preset.rows ?? []) await placeLoad({ newTypes: types }, c.id, 9999);
      c = circuitOfDevice(dev as Device);
    }
    sel = c ? { kind: 'circuit', id: c.id } : { kind: 'device', id: dev.id };
    await draw(); drawSide();
  }
  async function removeDevice(d: Device) {
    const kids = devices.filter((x) => x.parent_id === d.id);
    if (!confirm(`${deviceTitle(d)} verwijderen${kids.length ? ` (de ${kids.length} toestellen eronder komen dan los te hangen)` : ''}?`)) return;
    await run([whereOp('device', { parent_id: null }, { parent_id: d.id })]);
    await softDelete('device', d.id); await unlinkDevice(d.id);
    sel = null; await after();
  }

  // ---------- onderdelen op een kring: plaatsen en verplaatsen ----------
  type Entry = ReturnType<typeof allLoads>[number];
  const keyOf = (l: Entry) => `${l.src}:${l.id}`;
  /** Rijen van een kring: onderdelen met dezelfde `grp` staan naast elkaar (schakelaar gevolgd door lampen). */
  const rowsOfCircuit = (cid: string): Entry[][] => {
    const rows: Entry[][] = [];
    for (const l of allLoads().filter((x) => x.circuit_id === cid).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) { const last = rows[rows.length - 1]; if (l.grp && last && last[0].grp === l.grp) last.push(l); else rows.push([l]); }
    return rows;
  };
  /**
   * Zet een nieuw (`newType`) of bestaand (`key`) onderdeel op `circuitId`: op een nieuwe rij vóór rij `index`,
   * of (chain) achter de laatste van rij `index`. De volgorde en rij-indeling van de kring worden hernummerd.
   */
  async function placeLoad(what: { key?: string; newType?: string; newTypes?: string[] }, circuitId: string, index: number, chain = false) {
    const before = rowsOfCircuit(circuitId);
    const moving = what.key ? allLoads().find((l) => keyOf(l) === what.key) : undefined;
    const fr = moving ? before.findIndex((r) => r.some((l) => keyOf(l) === what.key)) : -1;
    const rows = before.map((r) => r.filter((l) => !moving || keyOf(l) !== what.key)).filter((r) => r.length);
    const rowGone = fr >= 0 && before[fr].length === 1;
    let at = Math.max(0, Math.min(index, before.length));
    if (rowGone && fr < at) at--;
    if (chain && fr === index && !rowGone) return;                          // op de eigen rij laten vallen: niets te doen
    const added: any[] = moving ? [moving] : (what.newTypes ?? (what.newType ? [what.newType] : [])).map((type) => ({ src: 'manual', id: uid(), fresh: true, type, label: null }));
    if (chain && rows.length) { const t = Math.min(at, rows.length - 1); const lbl = rows[t].map((l) => l.label).find(Boolean) ?? null; for (const e of added) { e.label = e.label ?? lbl; rows[t].push(e); } }
    else rows.splice(Math.min(at, rows.length), 0, added);
    const stmts: Op[] = [];
    let order = 0;
    for (const row of rows) {
      const grp = row.length > 1 ? (row.find((l) => l.grp && !(l as any).fresh)?.grp ?? uid()) : null;
      for (const l of row) {
        order += 10;
        if ((l as any).fresh) stmts.push(putOp('schema_load', { id: l.id, circuit_id: circuitId, type: l.type, label: l.label ?? null, n: 1, pos: order, grp }));
        else if (l.src === 'plan') stmts.push(setOp('symbol', l.id!, { spos: order, sgrp: grp, circuit_id: circuitId }));
        else stmts.push(setOp('schema_load', l.id!, { pos: order, grp, circuit_id: circuitId }));
      }
    }
    await run(stmts);
    if (moving) sel = { kind: 'load', id: what.key! }; else if (added.length) sel = { kind: 'load', id: `manual:${added[0].id}` };
    await after();
  }
  async function removeLoad(key: string) {
    const l = loadOf(key); if (!l) return;
    if (l.src === 'manual') await softDelete('schema_load', l.id!);
    else await run([setOp('symbol', l.id!, { circuit_id: null })]);
    sel = null; await after();
  }

  // ---------- klikken en slepen in het schema ----------
  out.addEventListener('click', async (e) => {
    if (justDragged) { justDragged = false; return; }
    const t = e.target as Element, slotEl = t.closest('[data-slot]'), lEl = t.closest('[data-lid]'), cEl = t.closest('[data-cid]'), dEl = t.closest('[data-did]'), sEl = t.closest('[data-sup]'), bEl = t.closest('[data-bus]');
    if (tool === 'select') {
      if (lEl) select({ kind: 'load', id: lEl.getAttribute('data-lid')! });
      else if (cEl) select({ kind: 'circuit', id: cEl.getAttribute('data-cid')! });
      else if (dEl) select({ kind: 'device', id: dEl.getAttribute('data-did')! });
      else if (sEl) select({ kind: 'supply', id: project.id });
      else select(null);
    } else if (tool.startsWith('sym:')) {
      const en = symbolEntry(tool.slice(4)), type = joinType(tool.slice(4), en?.multi ? gang : 1);
      if (slotEl && slotEl.getAttribute('data-slot') !== 'bus') await placeLoad({ newType: type }, slotEl.getAttribute('data-cid')!, Number(slotEl.getAttribute('data-idx')), slotEl.getAttribute('data-slot') === 'chain');
      else if (cEl) await placeLoad({ newType: type }, cEl.getAttribute('data-cid')!, rowsOfCircuit(cEl.getAttribute('data-cid')!).length);
      else toast('Klik op een oranje invoegpunt op een kring', 'error');
    } else if (setKind() === 'load') {
      const set = setById(tool.slice(4)) as Extract<typeof SETS[number], { kind: 'load' }>;
      if (slotEl && slotEl.getAttribute('data-slot') !== 'bus') await placeLoad({ newTypes: set.types }, slotEl.getAttribute('data-cid')!, Number(slotEl.getAttribute('data-idx')), slotEl.getAttribute('data-slot') === 'chain');
      else if (cEl) await placeLoad({ newTypes: set.types }, cEl.getAttribute('data-cid')!, rowsOfCircuit(cEl.getAttribute('data-cid')!).length);
      else toast('Klik op een oranje invoegpunt op een kring', 'error');
    } else if (tool.startsWith('cab:')) {
      if (cEl) await applyCable(cEl.getAttribute('data-cid')!); else toast('Klik op een kring om de kabel te plaatsen', 'error');
    } else if (tool === 'kring' || tool === 'diff' || tool === 'spd' || setKind() === 'circuit') {
      const preset = setKind() === 'circuit' ? setById(tool.slice(4)) as CircuitSet : undefined;
      const kind = tool === 'diff' ? 'differentieel' : tool === 'spd' ? 'overspanning' : 'automaat';
      if (slotEl?.getAttribute('data-slot') === 'bus') await addDevice(kind, slotEl.getAttribute('data-bus') ?? '', slotEl.getAttribute('data-board') ?? '', Number(slotEl.getAttribute('data-idx')), preset);
      else if (bEl) await addDevice(kind, bEl.getAttribute('data-bus') ?? '', bEl.getAttribute('data-board') ?? '', 9999, preset);
      else toast('Klik op een oranje invoegpunt op de bus', 'error');
    }
  });
  /** Zet de kabel uit het palet (met de ingestelde parameters) op een kring. Lege parameters laten de bestaande waarde staan. */
  async function applyCable(circuitId: string) {
    const c = circuits.find((x) => x.id === circuitId); if (!c) return;
    const p = cabParams, patch: Record<string, any> = { wires: p.wires ?? null, has_earth: p.has_earth ? 1 : 0, section_mm2: p.section_mm2 ?? null };
    for (const k of ['cable_type', 'fire_class', 'install', 'conduit']) if (p[k] != null && p[k] !== '') patch[k] = p[k];
    await upsert('circuit', { ...c, ...patch });
    sel = { kind: 'circuit', id: c.id }; await after(`Kabel ${cableLabel({ ...c, ...patch }).replace(/ · .*/, '')} geplaatst op kring ${c.nr ?? ''}`);
  }

  // een onderdeel met de muis oppakken en op een oranje invoegpunt loslaten (ook op een andere kring)
  out.addEventListener('pointerdown', (e) => {
    if (tool !== 'select' || (e as PointerEvent).button !== 0) return;
    const lEl = (e.target as Element).closest('[data-lid]'); if (!lEl) return;
    const key = lEl.getAttribute('data-lid')!, x0 = (e as PointerEvent).clientX, y0 = (e as PointerEvent).clientY;
    const move = async (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) { dragging = true; sel = { kind: 'load', id: key }; await draw(); drawSide(); document.body.style.cursor = 'grabbing'; }
    };
    const up = async (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.style.cursor = '';
      if (!dragging) return;
      const slotEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-slot="load"], [data-slot="chain"]');
      dragging = false; justDragged = true; setTimeout(() => { justDragged = false; }, 50);
      if (slotEl) await placeLoad({ key }, slotEl.getAttribute('data-cid')!, Number(slotEl.getAttribute('data-idx')), slotEl.getAttribute('data-slot') === 'chain'); else await draw();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });

  // ---------- palet links ----------
  const BUILD: { id: string; label: string; icon: string; hint: string }[] = [
    { id: 'select', label: 'Selecteren', icon: 'MousePointer2', hint: 'Klik op een onderdeel, kring, differentieel of de voeding om de eigenschappen rechts te bewerken. Onderdelen kun je naar een oranje invoegpunt slepen, ook op een andere kring.' },
    { id: 'kring', label: 'Kring (automaat)', icon: 'Plus', hint: 'Klik op een oranje invoegpunt op de bus: er komt een nieuwe automaat met kring.' },
    { id: 'diff', label: 'Differentieel', icon: 'Split', hint: 'Klik op een oranje invoegpunt op de bus: er komt een differentieel (met eigen bus).' },
    { id: 'spd', label: 'Overspanningsbeveiliging', icon: 'Zap', hint: 'Klik op een oranje invoegpunt op de bus.' },
  ];
  const items: PalItem[] = [
    ...BUILD.map((t) => ({ tool: t.id, label: t.label, group: 'Schema', icon: () => icon(t.icon, 18) })),
    ...CATALOG.filter((e: SymbolEntry) => FUNC_ORDER.includes(e.func)).map((e) => ({ tool: `sym:${e.id}`, label: e.label, group: e.func, kw: e.keywords, icon: () => {
      const g = symbolGeom(e.id, 'schema')!, ic = svg('svg', { width: 26, height: 22, viewBox: `0 0 ${g.w + 2} ${g.h + 2}`, preserveAspectRatio: 'xMidYMid meet' });
      ic.innerHTML = symbolMarkup(e.id, 'schema', (g.w + 2) / 2, (g.h + 2) / 2, 1, 0, 1.6); return ic; } })),
  ];
  items.push(...CABLE_PRESETS.map((k) => ({ tool: `cab:${k.id}`, label: `Kabel ${k.id.replace('.', ',')}`, group: 'Kabels', kw: 'kabel leiding draad aders', icon: () => icon('Cable', 18) })),
    { tool: 'cab:custom', label: 'Kabel (eigen waarden)', group: 'Kabels', kw: 'kabel leiding draad aders', icon: () => icon('Cable', 18) });
  items.splice(BUILD.length, 0, ...SETS.map((st) => ({ tool: `set:${st.id}`, label: st.label, group: 'Sets', kw: 'set combinatie', icon: () => icon('Layers', 18) })));
  const GROUPS = ['Schema', 'Sets', 'Kabels', ...FUNC_ORDER];
  const closed = new Set<string>(JSON.parse(localStorage.getItem('smarterwire.schemaclosed') || '[]'));
  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const favOf = (t: string) => favs.find((f) => f.tool === t);
  const multiTool = () => !!(tool.startsWith('sym:') && symbolEntry(tool.slice(4))?.multi);
  const setTool = (t: string) => {
    tool = t;
    const pre = CABLE_PRESETS.find((k) => `cab:${k.id}` === t);
    if (pre) { Object.assign(cabParams, { wires: pre.wires, has_earth: pre.has_earth, section_mm2: pre.section_mm2 }); setSetting('cableParams', cabParams); } drawPal(); draw(); drawSide(); };

  const searchInput = h('input', { type: 'search', class: 'table-search', placeholder: 'Zoek symbool of tool…', value: palQuery, onInput: (e: Event) => { palQuery = (e.target as HTMLInputElement).value; drawPalList(); } }) as HTMLInputElement;
  const palList = h('div'), gangRow = h('div', { class: 'gang-row', title: 'Aantal stopcontacten of schakelaars in één toestel' });
  function drawPal() {
    clear(pal); pal.append(searchInput, gangRow);
    clear(gangRow); gangRow.append(h('span', { class: 'hint' }, 'Aantal:'), ...[1, 2, 3, 4].map((n) => h('button', { class: `gang-btn ${gang === n ? 'active' : ''}`, onClick: () => { gang = n; drawPal(); } }, String(n))));
    (gangRow as HTMLElement).style.display = multiTool() ? 'flex' : 'none';
    drawPalList();
  }
  function palRow(i: PalItem) {
    const f = favOf(i.tool), isSym = i.tool.startsWith('sym:');
    return h('div', { class: 'pal-row' },
      h('button', { class: `pal-item ${tool === i.tool ? 'active' : ''}`, title: i.label, onClick: () => setTool(i.tool) }, i.icon(), i.label),
      f?.key ? h('span', { class: 'pal-key', title: 'Sneltoets (instellen kan op het situatieplan)' }, f.key.toUpperCase()) : null,
      isSym ? h('button', { class: `pal-star ${f ? 'on' : ''}`, title: f ? 'Uit favorieten halen' : 'Favoriet maken', onClick: () => { favs = f ? favs.filter((x) => x.tool !== i.tool) : [...favs, { tool: i.tool }]; setSetting('planFavs', favs); drawPalList(); } }, f ? '★' : '☆') : null);
  }
  function drawPalList() {
    clear(palList);
    const q = norm(palQuery.trim()), match = (i: PalItem) => !q || norm(i.label).includes(q) || norm(i.group).includes(q) || norm(i.kw ?? '').includes(q);
    for (const g of favs.some((f) => items.some((i) => i.tool === f.tool)) ? ['Favorieten', ...GROUPS] : GROUPS) {
      const its = (g === 'Favorieten' ? favs.map((f) => items.find((i) => i.tool === f.tool)).filter((x): x is PalItem => !!x) : items.filter((i) => i.group === g)).filter(match);
      if (!its.length) continue;
      const det = h('details', { class: 'pal-group', open: q ? true : !closed.has(g) }, h('summary', null, g === 'Favorieten' ? '★ Favorieten' : g, h('span', { class: 'pal-count' }, String(its.length))), ...its.map(palRow));
      det.addEventListener('toggle', () => { if (q) return; if ((det as HTMLDetailsElement).open) closed.delete(g); else closed.add(g); localStorage.setItem('smarterwire.schemaclosed', JSON.stringify([...closed])); });
      palList.append(det);
    }
    if (!palList.children.length) palList.append(h('p', { class: 'hint', style: { padding: '8px' } }, 'Niets gevonden.'));
    pal.append(palList);
  }

  // ---------- property inspector rechts ----------
  const iconFor = (type: string) => {
    const g = symbolGeom(type, 'schema'), el = svg('svg', { width: 28, height: 22, viewBox: `0 0 ${(g?.w ?? 10) + 2} ${(g?.h ?? 10) + 2}`, preserveAspectRatio: 'xMidYMid meet' });
    if (g) el.innerHTML = symbolMarkup(type, 'schema', (g.w + 2) / 2, (g.h + 2) / 2, 1, 0, 1.6);
    return el;
  };
  const stock = CATALOG.filter((e) => FUNC_ORDER.includes(e.func));
  let loadQuery = '';

  /** Formulier met auto-opslag: elke wijziging gaat meteen naar de database. */
  function autoForm(fields: FieldDef[], obj: Record<string, any>, table: string) {
    const form = buildForm(fields, obj);
    Object.values(form.inputs).forEach((i) => i.addEventListener('change', async () => { Object.assign(obj, form.read()); await upsert(table, obj); await after(); }));
    return form.el;
  }
  const field = (label: string, input: Element) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);

  /** Eigenschappen van één onderdeel (stopcontact, lamp, …): soort, aantal, adres, kring. */
  function loadInspector(key: string) {
    const l = loadOf(key); if (!l) { select(null); return h('div'); }
    const { id: baseId, n: gangN } = splitType(l.type), en = symbolEntry(baseId), isPlan = l.src === 'plan';
    const circ = circuits.find((c) => c.id === l.circuit_id);
    const save = async (patch: { type?: string; label?: string | null; n?: number; circuit_id?: string | null }) => {
      if (isPlan) { const { n: _n, ...rest } = patch as any; if (Object.keys(rest).length) await run([setOp('symbol', l.id!, rest)]); }
      else { const row = manual.find((m) => m.id === l.id)!; Object.assign(row, patch); await upsert('schema_load', row); }
      await after();
    };
    const el = h('div');
    el.append(h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, iconFor(l.type), h('h3', null, en?.label ?? l.type), h('span', { class: 'spacer' }), btn('', { icon: 'X', variant: 'ghost', onClick: () => select(null) })),
      h('p', { class: 'muted' }, `${isPlan ? 'Symbool van het situatieplan' : 'Toegevoegd op het schema'}${circ ? ` · kring ${circ.nr ?? ''}` : ''}`),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field span-2' }, h('span', { class: 'field-label' }, 'Soort'), h('select', { onChange: (e: Event) => { const id = (e.target as HTMLSelectElement).value; save({ type: joinType(id, symbolEntry(id)?.multi ? gangN : 1) }); } },
          stock.map((x) => h('option', { value: x.id, selected: x.id === baseId }, x.label)))),
        en?.multi ? field('Aantal (enkel, dubbel…)', h('select', { onChange: (e: Event) => save({ type: joinType(baseId, Number((e.target as HTMLSelectElement).value)) }) }, [1, 2, 3, 4].map((n) => h('option', { value: n, selected: n === gangN }, String(n))))) : null,
        !en?.multi && !isPlan ? field('Aantal', h('input', { type: 'number', min: 1, max: 20, value: l.n ?? 1, onChange: (e: Event) => save({ n: Math.max(1, Number((e.target as HTMLInputElement).value) || 1) }) })) : null,
        h('label', { class: 'field span-2' }, h('span', { class: 'field-label' }, 'Adres (ruimte)'), h('input', { value: l.label ?? '', placeholder: 'bv. keuken, living', onChange: (e: Event) => save({ label: (e.target as HTMLInputElement).value || null }) })),
        h('label', { class: 'field span-2' }, h('span', { class: 'field-label' }, 'Kring'), h('select', { onChange: async (e: Event) => { const v = (e.target as HTMLSelectElement).value; if (!v) { await save({ circuit_id: null }); sel = null; drawSide(); } else await placeLoad({ key }, v, 9999); } },
          h('option', { value: '' }, '— niet gekoppeld —'), circuits.map((c) => h('option', { value: c.id, selected: c.id === l.circuit_id }, `${c.nr ?? ''} ${c.name}`))))),
      ...(() => { const rows = l.circuit_id ? rowsOfCircuit(l.circuit_id) : [], ri = rows.findIndex((r) => r.some((x) => keyOf(x) === key)); return ri >= 0 && rows[ri].length > 1
        ? [h('p', { class: 'hint' }, `Staat op één rij met ${rows[ri].length - 1} ander(e) onderdeel/onderdelen (bv. lamp achter schakelaar).`), btn('Op een eigen rij zetten', { variant: 'secondary', onClick: () => placeLoad({ key }, l.circuit_id!, ri + 1) })] : []; })(),
      h('p', { class: 'hint' }, 'Tip: sleep het onderdeel in het schema naar een oranje invoegpunt: op een kring om een nieuwe rij te maken, of achter een onderdeel om op dezelfde rij (bv. lamp achter schakelaar) te komen.'),
      btn(isPlan ? 'Van de kring loskoppelen' : 'Verwijderen', { icon: isPlan ? 'Unlink' : 'Trash2', variant: 'danger', onClick: () => removeLoad(key) }));
    return el;
  }

  function loadsSection(c: Circuit) {
    const mine = allLoads().filter((l) => l.circuit_id === c.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const unlinked = new Map<string, { type: string; label: string; ids: string[] }>();
    for (const s of planSyms.filter((x) => !x.circuit_id)) { const k = `${s.type}|${s.label ?? ''}`; (unlinked.get(k) ?? unlinked.set(k, { type: s.type, label: s.label ?? '', ids: [] }).get(k)!).ids.push(s.id); }
    const nameOf = (t: string) => symbolEntry(t)?.label ?? t;
    const el = h('div');
    el.append(h('h4', null, `Onderdelen (${mine.length})`),
      ...mine.map((l, i) => h('div', { class: 'load-row clickable', onClick: () => select({ kind: 'load', id: `${l.src}:${l.id}` }) }, h('span', { class: 'hint', style: { width: '16px' } }, String(i + 1)), iconFor(l.type), h('span', { style: { flex: 1 } }, `${nameOf(splitType(l.type).id)}${splitType(l.type).n > 1 ? ' ' + splitType(l.type).n + 'x' : ''}${l.label ? ' – ' + l.label : ''}`), h('span', { class: 'hint' }, l.src === 'plan' ? 'plan' : ''))));
    if (!mine.length) el.append(h('p', { class: 'hint' }, 'Nog geen onderdelen. Kies links een symbool en klik op een oranje invoegpunt, of zoek hieronder.'));
    const input = h('input', { type: 'search', class: 'table-search', placeholder: 'Toevoegen: lamp, stopcontact, boiler…', value: loadQuery, style: { width: '100%', boxSizing: 'border-box' }, onInput: (e: Event) => { loadQuery = (e.target as HTMLInputElement).value; fill(); } }) as HTMLInputElement;
    const results = h('div', { class: 'load-results' });
    function fill() {
      clear(results); const q = norm(loadQuery.trim());
      if (!q) return;
      for (const e of stock.filter((x) => norm(x.label).includes(q) || norm(x.keywords).includes(q) || norm(x.func).includes(q)).slice(0, 8))
        results.append(h('button', { class: 'pal-item', title: 'Achteraan deze kring toevoegen', onClick: () => placeLoad({ newType: e.id }, c.id, 9999) }, iconFor(e.id), e.label));
    }
    el.append(input, results); fill();
    if (unlinked.size) el.append(h('h4', null, 'Nog niet gekoppeld op het plan'), ...[...unlinked.values()].map((g) => h('div', { class: 'load-row' }, iconFor(g.type), h('span', { style: { flex: 1 } }, `${g.ids.length}× ${nameOf(splitType(g.type).id)}${g.label ? ' – ' + g.label : ''}`),
      btn('Koppel', { variant: 'secondary', title: `Aan kring ${c.nr ?? ''} koppelen`, onClick: async () => {
        await run(g.ids.map((id) => setOp('symbol', id, { circuit_id: c.id }))); await after(`${g.ids.length} symbool/symbolen gekoppeld`);
      } }))));
    return el;
  }

  function drawSide() {
    clear(side);
    const head = (title: string, sub?: string) => h('div', null, h('div', { style: { display: 'flex', alignItems: 'center' } }, h('h3', null, title), h('span', { class: 'spacer' }), btn('', { icon: 'X', variant: 'ghost', onClick: () => select(null) })), sub ? h('p', { class: 'muted' }, sub) : null);
    if (!sel && tool.startsWith('cab:')) {
      const form = buildForm(cabFields, cabParams);
      Object.values(form.inputs).forEach((i) => i.addEventListener('change', () => { Object.assign(cabParams, form.read()); setSetting('cableParams', cabParams); }));
      side.append(h('div', null, h('h4', null, 'Kabel plaatsen'), h('p', { class: 'muted' }, 'Klik op een kring in het schema: de kabel met onderstaande eigenschappen komt op die kring. Lege velden (plaatsing, buis…) laten de bestaande waarde ongemoeid. Esc = stoppen.'), form.el));
      return;
    }
    if (!sel) {
      const t = BUILD.find((x) => x.id === tool);
      side.append(h('div', null, h('h4', null, 'Eigenschappen'),
        h('p', { class: 'muted' }, t && t.id !== 'select' ? t.hint : tool.startsWith('sym:') ? `Klik op een oranje invoegpunt op een kring om "${symbolEntry(tool.slice(4))?.label}" te plaatsen. Esc = stoppen.`
          : setKind() === 'load' ? `Klik op een oranje invoegpunt op een kring: de hele set "${setById(tool.slice(4))?.label}" komt op één rij. Esc = stoppen.`
          : setKind() === 'circuit' ? `Klik op een oranje invoegpunt op de bus: er komt een kring met automaat, leiding en onderdelen ("${setById(tool.slice(4))?.label}"). Esc = stoppen.` : BUILD[0].hint)));
      return;
    }
    if (sel.kind === 'load') { side.append(loadInspector(sel.id)); return; }
    if (sel.kind === 'supply') {
      const proj = project as Record<string, any>;
      if (!proj.supply) proj.supply = '1x230';
      side.append(head('Voeding', 'Net, teller en aansluiting'),
        autoForm([{ key: 'supply', label: 'Voeding', type: 'select', options: SUPPLIES, allowEmpty: false, span: 2 }, { key: 'supply_amp', label: 'Voeding (A)', type: 'number' }, { key: 'supply_cable', label: 'Voedingskabel', placeholder: 'bv. XVB Cca 4x10', span: 2 }, { key: 'ean', label: 'EAN-code meter', span: 2 }], proj, 'project'));
      return;
    }
    if (sel.kind === 'device') {
      const d = devices.find((x) => x.id === sel!.id); if (!d) { select(null); return; }
      const kids = devices.filter((x) => x.parent_id === d.id);
      const dform = deviceForm(d, { supply: supply(), devices, onChange: async () => { await after(); } });
      side.append(head(deviceTitle(d), DEVICE_KINDS[d.kind]?.label), ...(dform.conflict ? [badge(dform.conflict, 'err')] : []), dform.el,
        h('p', { class: 'hint' }, `Beschermt ${kids.length} toestel(len).`), btn('Toestel verwijderen', { icon: 'Trash2', variant: 'danger', onClick: () => removeDevice(d) }));
      return;
    }
    const c = circuits.find((x) => x.id === sel!.id); if (!c) { select(null); return; }
    const dev = devOf(c), form: FieldDef[] = [
      { key: 'nr', label: 'Kring' }, { key: 'func', label: 'Functie', type: 'select', options: FUNCTIONS },
      { key: 'name', label: 'Omschrijving', span: 2 },
      { key: 'cable_type', label: 'Kabeltype', type: 'select', options: CABLE_TYPES }, { key: 'fire_class', label: 'Brandklasse', type: 'select', options: FIRE_CLASSES },
      { key: 'section_mm2', label: 'Doorsnede (mm²)', type: 'select', options: SECTIONS, numeric: true }, { key: 'wires', label: 'Aantal aders', type: 'number' }, { key: 'has_earth', label: 'Bevat aarding (G)', type: 'checkbox' },
      { key: 'install', label: 'Plaatsing', type: 'select', options: INSTALL_MODES }, { key: 'conduit', label: 'Los of in buis', type: 'select', options: CONDUIT_MODES, numeric: true },
      { key: 'rooms', label: 'Ruimtes', advanced: true, span: 2 }, { key: 'level', label: 'Verdieping', advanced: true }, { key: 'status', label: 'Status', type: 'select', options: STATUSES, allowEmpty: false, advanced: true },
      { key: 'lock_group', label: 'Samen houden (gedeelde nul)', advanced: true, span: 2 }, { key: 'notes', label: 'Notities', type: 'textarea', advanced: true, span: 2 },
    ];
    side.append(head(`Kring ${c.nr ?? ''}`, c.name), autoForm(form, c, 'circuit'));
    if (dev) {
      const dform = deviceForm(dev, { supply: supply(), devices, onChange: async () => { await after(); } });
      side.append(h('h4', null, 'Beveiliging'), ...(dform.conflict ? [badge(dform.conflict, 'err')] : []), dform.el);
    }
    side.append(loadsSection(c));
    if (dev) side.append(btn('Kring met zekering verwijderen', { icon: 'Trash2', variant: 'danger', onClick: () => removeDevice(dev) }));
  }

  // ---------- toolbar ----------
  const stateSel = h('select', { onChange: (e: Event) => { which = (e.target as HTMLSelectElement).value as any; sel = null; draw(); drawSide(); } },
    (['bestaand', 'nieuw'] as const).filter((k) => boards.some((b) => b.kind === k)).map((k) => h('option', { value: k, selected: k === which }, k === 'nieuw' ? '★ Nieuwe toestand (ontwerp)' : 'Bestaande toestand')));
  root.append(h('div', { class: 'toolbar' }, stateSel,
    btn('Opnieuw opbouwen vanuit kringen', { icon: 'WandSparkles', variant: 'accent', title: 'Nieuwe kast(en) en schema opnieuw opbouwen uit de kringen', onClick: () => openGenerate(project, () => { clear(root); renderSchema(root, project); }) }),
    h('span', { class: 'spacer' }),
    btn('SVG', { icon: 'Download', onClick: () => download(`eendraadschema-${which}.svg`, current, 'image/svg+xml') }),
    btn('Afdrukken', { icon: 'Printer', onClick: () => window.print() })),
    h('div', { class: 'split left-pal' }, pal, h('div', { class: 'schema-scroll' }, out), side));

  // sneltoetsen: favorieten kiezen een tool, Esc = selecteren, Delete = verwijderen
  window.addEventListener('keydown', function onKey(e) {
    if (!root.isConnected) { window.removeEventListener('keydown', onKey); return; }
    if ((e.target as HTMLElement).matches?.('input,textarea,select')) return;
    if (e.key === 'Escape') { if (tool !== 'select') setTool('select'); else select(null); return; }
    if (e.key === 'Delete' && sel) {
      if (sel.kind === 'load') removeLoad(sel.id);
      else if (sel.kind === 'device') { const d = devices.find((x) => x.id === sel!.id); if (d) removeDevice(d); }
      else if (sel.kind === 'circuit') { const c = circuits.find((x) => x.id === sel!.id), dv = c && devOf(c); if (dv) removeDevice(dv); }
      return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      const fav = favs.find((f) => f.key === e.key.toLowerCase());
      if (fav && items.some((i) => i.tool === fav.tool)) { e.preventDefault(); setTool(fav.tool); }
    }
  });

  drawPal(); await draw(); drawSide();
}

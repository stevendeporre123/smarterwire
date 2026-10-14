import { h, svg, btn, icon, download, clear, toast } from '../lib/dom';
import { buildForm, badge, type FieldDef } from '../lib/ui';
import { upsert, softDelete } from '../db/repo';
import { sql } from '../db/client';
import { boardsOf, circuitsOf, allDevicesOfProject, type Project, type Circuit, type Device } from '../domain/model';
import { buildDiagram } from '../domain/diagram';
import {
  CABLE_TYPES, FIRE_CLASSES, FUNCTIONS, INSTALL_MODES, SECTIONS, STATUSES, SUPPLIES, supplyOf, isThreePhase, defaultModules, deviceTitle, DEVICE_KINDS,
} from '../domain/devices';
import { CATALOG, FUNC_ORDER, symbolEntry, symbolGeom, symbolMarkup, splitType, joinType, type SymbolEntry } from '../domain/areisymbols';
import { schemaLoadsOf, planSymbolRows, type SchemaLoad, type PlanSymbolRow } from '../domain/loads';
import { ensureCircuits, unlinkDevice } from '../domain/circuits';
import { getSetting, setSetting } from '../domain/settings';
import { deviceForm } from './deviceform';
import { openGenerate } from './generate';

type Sel = { kind: 'circuit' | 'device' | 'supply'; id: string } | null;
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

  let which: 'bestaand' | 'nieuw' = boards.some((b) => b.kind === 'nieuw') ? 'nieuw' : 'bestaand';
  let tool = 'select', sel: Sel = null, gang = 1, palQuery = '';
  const supply = () => supplyOf(project);
  const devOf = (c: Circuit) => devices.find((d) => d.id === (which === 'nieuw' ? c.new_device_id : c.device_id));
  const circuitOfDevice = (d: Device) => circuits.find((c) => (which === 'nieuw' ? c.new_device_id : c.device_id) === d.id);

  const out = h('div', { class: 'schema-wrap' }), side = h('div', { class: 'side' }), pal = h('div', { class: 'pal' });
  root.classList.add('page-full');
  let current = '';

  // ---------- schema ----------
  async function draw() {
    const bs = boards.filter((b) => b.kind === which);
    const withDevs = bs.map((board) => ({ board, devices: devices.filter((d) => d.board_id === board.id) }));
    const symbols = [...planSyms.map((s) => ({ circuit_id: s.circuit_id, type: s.type, label: s.label })), ...manual.map((m) => ({ circuit_id: m.circuit_id, type: m.type, label: m.label, n: m.n }))];
    current = buildDiagram({
      title: `Eendraadschema – ${which === 'nieuw' ? 'nieuwe toestand' : 'bestaande toestand'}`, boards: withDevs, circuits, symbols, which, supply: supply(), ean: project.ean,
      selCircuit: sel?.kind === 'circuit' ? sel.id : null, selDevice: sel?.kind === 'device' ? sel.id : null, selSupply: sel?.kind === 'supply',
      meta: [project.name, [project.owner, project.address?.replace(/\n/g, ', ')].filter(Boolean).join(' · '), project.inspector ?? '', new Date().toLocaleDateString('nl-BE')].filter(Boolean) as string[],
    }).svg;
    out.innerHTML = current;
    out.classList.toggle('tool-add', tool !== 'select');
  }
  async function after(msg?: string) { await reloadData(); await draw(); drawSide(); if (msg) toast(msg); }
  const select = (s: Sel) => { sel = s; draw(); drawSide(); };

  // ---------- toestellen toevoegen / verwijderen ----------
  async function addDevice(kind: 'automaat' | 'differentieel' | 'overspanning', parentId: string, boardId: string) {
    const three = isThreePhase(supply()), polesAll = three ? (supply() === '3x230' ? '3P' : '4P') : '2P';
    const mine = devices.filter((d) => d.board_id === boardId), row = mine.length ? Math.max(...mine.map((d) => d.row_no)) : 0;
    const pos = Math.max(-1, ...mine.filter((d) => d.row_no === row).map((d) => d.pos)) + 1;
    const base: Partial<Device> = kind === 'automaat' ? { poles: '2P', curve: 'C', rating_a: 16, breaking_ka: 3, modules: 1, phase: three ? 'L1' : null }
      : kind === 'differentieel' ? { poles: polesAll, rating_a: 40, sens_ma: 30, dtype: 'A', modules: defaultModules('differentieel', polesAll) } : { poles: polesAll, modules: 2 };
    const dev = await upsert('device', { board_id: boardId, parent_id: parentId || null, kind, row_no: row, pos, ...base });
    await ensureCircuits(project); await reloadData();
    const c = circuitOfDevice(dev as Device);
    sel = c ? { kind: 'circuit', id: c.id } : { kind: 'device', id: dev.id };
    await draw(); drawSide();
  }
  async function removeDevice(d: Device) {
    const kids = devices.filter((x) => x.parent_id === d.id);
    if (!confirm(`${deviceTitle(d)} verwijderen${kids.length ? ` (de ${kids.length} toestellen eronder komen dan los te hangen)` : ''}?`)) return;
    await sql.run('UPDATE device SET parent_id=NULL, updated_at=? WHERE parent_id=?', [Date.now(), d.id]);
    await softDelete('device', d.id); await unlinkDevice(d.id);
    sel = null; await after();
  }
  async function addLoad(circuitId: string, type: string) {
    const pos = manual.filter((m) => m.circuit_id === circuitId).length + 1;
    await upsert('schema_load', { circuit_id: circuitId, type, label: null, n: 1, pos }); await after();
  }

  // ---------- klikken in het schema ----------
  out.addEventListener('click', async (e) => {
    const t = e.target as Element, cEl = t.closest('[data-cid]'), dEl = t.closest('[data-did]'), sEl = t.closest('[data-sup]'), bEl = t.closest('[data-bus]');
    if (tool === 'select') {
      if (cEl) select({ kind: 'circuit', id: cEl.getAttribute('data-cid')! });
      else if (dEl) select({ kind: 'device', id: dEl.getAttribute('data-did')! });
      else if (sEl) select({ kind: 'supply', id: project.id });
      else select(null);
    } else if (tool.startsWith('sym:')) {
      if (!cEl) { toast('Klik op een kring om er dit symbool aan toe te voegen', 'error'); return; }
      const en = symbolEntry(tool.slice(4));
      await addLoad(cEl.getAttribute('data-cid')!, joinType(tool.slice(4), en?.multi ? gang : 1));
    } else if (tool === 'kring' || tool === 'diff' || tool === 'spd') {
      if (!bEl) { toast('Klik op een bus (de dikke lijn) of een kring om te bepalen waar het toestel komt', 'error'); return; }
      await addDevice(tool === 'kring' ? 'automaat' : tool === 'diff' ? 'differentieel' : 'overspanning', bEl.getAttribute('data-bus') ?? '', bEl.getAttribute('data-board') ?? '');
    }
  });

  // ---------- palet links ----------
  const BUILD: { id: string; label: string; icon: string; hint: string }[] = [
    { id: 'select', label: 'Selecteren', icon: 'MousePointer2', hint: 'Klik op een kring, differentieel of de voeding om de eigenschappen rechts te bewerken.' },
    { id: 'kring', label: 'Kring (automaat)', icon: 'Plus', hint: 'Klik op een bus of kring: er komt een nieuwe automaat met kring bij.' },
    { id: 'diff', label: 'Differentieel', icon: 'Split', hint: 'Klik op een bus: er komt een differentieel (met eigen bus) onder.' },
    { id: 'spd', label: 'Overspanningsbeveiliging', icon: 'Zap', hint: 'Klik op een bus om een overspanningsbeveiliging toe te voegen.' },
  ];
  const items: PalItem[] = [
    ...BUILD.map((t) => ({ tool: t.id, label: t.label, group: 'Schema', icon: () => icon(t.icon, 18) })),
    ...CATALOG.filter((e: SymbolEntry) => FUNC_ORDER.includes(e.func)).map((e) => ({ tool: `sym:${e.id}`, label: e.label, group: e.func, kw: e.keywords, icon: () => {
      const g = symbolGeom(e.id, 'schema')!, ic = svg('svg', { width: 26, height: 22, viewBox: `0 0 ${g.w + 2} ${g.h + 2}`, preserveAspectRatio: 'xMidYMid meet' });
      ic.innerHTML = symbolMarkup(e.id, 'schema', (g.w + 2) / 2, (g.h + 2) / 2, 1, 0, 1.6); return ic; } })),
  ];
  const GROUPS = ['Schema', ...FUNC_ORDER];
  const closed = new Set<string>(JSON.parse(localStorage.getItem('smarterwire.schemaclosed') || '[]'));
  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const favOf = (t: string) => favs.find((f) => f.tool === t);
  const multiTool = () => !!(tool.startsWith('sym:') && symbolEntry(tool.slice(4))?.multi);
  const setTool = (t: string) => { tool = t; drawPal(); draw(); drawSide(); };

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

  function loadsSection(c: Circuit) {
    const fromPlan = new Map<string, { type: string; label: string; n: number }>();
    for (const s of planSyms.filter((x) => x.circuit_id === c.id)) { const k = `${s.type}|${s.label ?? ''}`; (fromPlan.get(k) ?? fromPlan.set(k, { type: s.type, label: s.label ?? '', n: 0 }).get(k)!).n++; }
    const mine = manual.filter((m) => m.circuit_id === c.id);
    const unlinked = new Map<string, { type: string; label: string; ids: string[] }>();
    for (const s of planSyms.filter((x) => !x.circuit_id)) { const k = `${s.type}|${s.label ?? ''}`; (unlinked.get(k) ?? unlinked.set(k, { type: s.type, label: s.label ?? '', ids: [] }).get(k)!).ids.push(s.id); }
    const nameOf = (t: string) => symbolEntry(t)?.label ?? t;
    const el = h('div');
    el.append(h('h4', null, 'Verbruikers'),
      ...[...fromPlan.values()].map((g) => h('div', { class: 'load-row' }, iconFor(g.type), h('span', { style: { flex: 1 } }, `${g.n}× ${nameOf(g.type)}${g.label ? ' – ' + g.label : ''}`), h('span', { class: 'hint' }, 'plan'))),
      ...mine.map((m) => {
        const { id: baseId, n: gangN } = splitType(m.type), en = symbolEntry(baseId);
        const save = async (patch: Partial<SchemaLoad>) => { Object.assign(m, patch); await upsert('schema_load', m); await after(); };
        return h('div', { class: 'load-row load-edit' }, iconFor(m.type),
          h('select', { onChange: async (e: Event) => { const id = (e.target as HTMLSelectElement).value; await save({ type: joinType(id, symbolEntry(id)?.multi ? gangN : 1) }); } }, stock.map((x) => h('option', { value: x.id, selected: x.id === baseId }, x.label))),
          en?.multi ? h('select', { title: 'Enkel, dubbel, drie- of vierdubbel', onChange: async (e: Event) => { await save({ type: joinType(baseId, Number((e.target as HTMLSelectElement).value)) }); } }, [1, 2, 3, 4].map((n) => h('option', { value: n, selected: n === gangN }, `${n}x`))) : null,
          h('input', { placeholder: 'label', value: m.label ?? '', style: { width: '80px' }, onChange: (e: Event) => save({ label: (e.target as HTMLInputElement).value || null }) }),
          h('input', { type: 'number', min: 1, max: 20, value: m.n, title: 'Aantal', style: { width: '48px' }, onChange: (e: Event) => save({ n: Math.max(1, Number((e.target as HTMLInputElement).value) || 1) }) }),
          btn('', { icon: 'Trash2', variant: 'ghost', title: 'Verwijderen', onClick: async () => { await softDelete('schema_load', m.id); await after(); } }));
      }));
    if (!fromPlan.size && !mine.length) el.append(h('p', { class: 'hint' }, 'Nog geen verbruikers. Kies links een symbool en klik op de kring, of zoek hieronder.'));
    const input = h('input', { type: 'search', class: 'table-search', placeholder: 'Verbruiker toevoegen: lamp, stopcontact, boiler…', value: loadQuery, style: { width: '100%', boxSizing: 'border-box' }, onInput: (e: Event) => { loadQuery = (e.target as HTMLInputElement).value; fill(); } }) as HTMLInputElement;
    const results = h('div', { class: 'load-results' });
    function fill() {
      clear(results); const q = norm(loadQuery.trim());
      if (!q) return;
      for (const e of stock.filter((x) => norm(x.label).includes(q) || norm(x.keywords).includes(q) || norm(x.func).includes(q)).slice(0, 8))
        results.append(h('button', { class: 'pal-item', onClick: () => addLoad(c.id, e.id) }, iconFor(e.id), e.label));
    }
    el.append(input, results); fill();
    if (unlinked.size) el.append(h('h4', null, 'Nog niet gekoppeld op het plan'), ...[...unlinked.values()].map((g) => h('div', { class: 'load-row' }, iconFor(g.type), h('span', { style: { flex: 1 } }, `${g.ids.length}× ${nameOf(g.type)}${g.label ? ' – ' + g.label : ''}`),
      btn('Koppel', { variant: 'secondary', title: `Aan kring ${c.nr ?? ''} koppelen`, onClick: async () => {
        const now = Date.now(); await sql.batch(g.ids.map((id) => ({ sql: 'UPDATE symbol SET circuit_id=?, updated_at=? WHERE id=?', bind: [c.id, now, id] }))); await after(`${g.ids.length} symbool/symbolen gekoppeld`);
      } }))));
    return el;
  }

  function drawSide() {
    clear(side);
    const head = (title: string, sub?: string) => h('div', null, h('div', { style: { display: 'flex', alignItems: 'center' } }, h('h3', null, title), h('span', { class: 'spacer' }), btn('', { icon: 'X', variant: 'ghost', onClick: () => select(null) })), sub ? h('p', { class: 'muted' }, sub) : null);
    if (!sel) {
      const t = BUILD.find((x) => x.id === tool);
      side.append(h('div', null, h('h4', null, 'Eigenschappen'),
        h('p', { class: 'muted' }, t && t.id !== 'select' ? t.hint : tool.startsWith('sym:') ? `Klik op een kring om "${symbolEntry(tool.slice(4))?.label}" toe te voegen. Esc = stoppen.` : 'Klik op een kring, een differentieel of de voeding in het schema om de eigenschappen hier te bewerken.')));
      return;
    }
    if (sel.kind === 'supply') {
      const proj = project as Record<string, any>;
      if (!proj.supply) proj.supply = '1x230';
      side.append(head('Voeding', 'Net, teller en aansluiting'),
        autoForm([{ key: 'supply', label: 'Voeding', type: 'select', options: SUPPLIES, allowEmpty: false, span: 2 }, { key: 'supply_amp', label: 'Voeding (A)', type: 'number' }, { key: 'ean', label: 'EAN-code meter', span: 2 }], proj, 'project'));
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
      { key: 'section_mm2', label: 'Doorsnede (mm²)', type: 'select', options: SECTIONS, numeric: true }, { key: 'wires', label: 'Aantal aders', type: 'number' },
      { key: 'install', label: 'Plaatsing', type: 'select', options: INSTALL_MODES, span: 2 },
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
      if (sel.kind === 'device') { const d = devices.find((x) => x.id === sel!.id); if (d) removeDevice(d); }
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

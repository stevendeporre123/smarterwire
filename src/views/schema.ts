import { h, svg, btn, icon, download, clear, toast } from '../lib/dom';
import { upsert, softDelete } from '../db/repo';
import { sql } from '../db/client';
import { boardsOf, devicesOf, circuitsOf, type Project, type Circuit } from '../domain/model';
import { buildDiagram } from '../domain/diagram';
import { supplyOf } from '../domain/devices';
import { CATALOG, FUNC_ORDER, symbolEntry, symbolGeom, symbolMarkup, splitType, joinType } from '../domain/areisymbols';
import { schemaLoadsOf, planSymbolRows, type SchemaLoad, type PlanSymbolRow } from '../domain/loads';

export async function renderSchema(root: HTMLElement, project: Project) {
  const boards = await boardsOf(project.id);
  if (!boards.length) {
    root.append(h('div', { class: 'page' }, h('div', { class: 'card empty-state' }, icon('Workflow', 40), h('h3', null, 'Nog geen schema'), h('p', null, 'Voeg eerst een zekeringskast toe en documenteer enkele kringen.'))));
    return;
  }
  let circuits = await circuitsOf(project.id);
  let planSyms: PlanSymbolRow[] = [], manual: SchemaLoad[] = [];
  const reloadData = async () => { [circuits, planSyms, manual] = await Promise.all([circuitsOf(project.id), planSymbolRows(project.id), schemaLoadsOf(project.id)]); };
  await reloadData();

  const kinds: ('bestaand' | 'nieuw')[] = ['bestaand', 'nieuw'];
  let which: 'bestaand' | 'nieuw' = boards.some((b) => b.kind === 'nieuw') ? 'nieuw' : 'bestaand';
  let selCid: string | null = null;
  const out = h('div', { class: 'schema-wrap' }), side = h('div', { class: 'side' });
  root.classList.add('page-full');

  const sel = h('select', { onChange: (e: Event) => { which = (e.target as HTMLSelectElement).value as any; selCid = null; draw(); drawSide(); } },
    kinds.filter((k) => boards.some((b) => b.kind === k)).map((k) => h('option', { value: k, selected: k === which }, k === 'nieuw' ? '★ Nieuwe toestand (ontwerp)' : 'Bestaande toestand')));
  let current = '';
  async function draw() {
    const bs = boards.filter((b) => b.kind === which);
    const withDevs = await Promise.all(bs.map(async (board) => ({ board, devices: await devicesOf(board.id) })));
    const symbols = [...planSyms.map((s) => ({ circuit_id: s.circuit_id, type: s.type, label: s.label })), ...manual.map((m) => ({ circuit_id: m.circuit_id, type: m.type, label: m.label, n: m.n }))];
    current = buildDiagram({
      title: `Eendraadschema – ${which === 'nieuw' ? 'nieuwe toestand' : 'bestaande toestand'}`, boards: withDevs, circuits, symbols, which, supply: supplyOf(project), ean: project.ean, selCircuit: selCid,
      meta: [project.name, [project.owner, project.address?.replace(/\n/g, ', ')].filter(Boolean).join(' · '), project.inspector ?? '', new Date().toLocaleDateString('nl-BE')].filter(Boolean) as string[],
    }).svg;
    out.innerHTML = current;
  }

  // klik op een kring in het schema = verbruikers van die kring bewerken
  out.addEventListener('click', (e) => {
    const id = (e.target as Element).closest('[data-cid]')?.getAttribute('data-cid') ?? null;
    selCid = id === selCid ? null : id; draw(); drawSide();
  });

  const iconFor = (type: string) => {
    const g = symbolGeom(type, 'schema'), el = svg('svg', { width: 28, height: 22, viewBox: `0 0 ${(g?.w ?? 10) + 2} ${(g?.h ?? 10) + 2}`, preserveAspectRatio: 'xMidYMid meet' });
    if (g) el.innerHTML = symbolMarkup(type, 'schema', (g.w + 2) / 2, (g.h + 2) / 2, 1, 0, 1.6);
    return el;
  };
  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const stock = CATALOG.filter((e) => FUNC_ORDER.includes(e.func));   // verbruikers, geen beschermingstoestellen
  let query = '';

  async function after(msg?: string) { await reloadData(); await draw(); drawSide(); if (msg) toast(msg); }

  function drawSide() {
    clear(side);
    const c = circuits.find((x) => x.id === selCid) as Circuit | undefined;
    if (!c) {
      side.append(h('div', null, h('h4', null, 'Verbruikers op het schema'),
        h('p', { class: 'muted' }, 'Klik op een kring in het schema om er lampen, stopcontacten of toestellen aan toe te voegen. Symbolen die je op het situatieplan aan een kring hangt, verschijnen er vanzelf.')));
      return;
    }
    const fromPlan = new Map<string, { type: string; label: string; n: number }>();
    for (const s of planSyms.filter((x) => x.circuit_id === c.id)) { const k = `${s.type}|${s.label ?? ''}`; const g = fromPlan.get(k) ?? fromPlan.set(k, { type: s.type, label: s.label ?? '', n: 0 }).get(k)!; g.n++; }
    const mine = manual.filter((m) => m.circuit_id === c.id);
    const unlinked = new Map<string, { type: string; label: string; ids: string[] }>();
    for (const s of planSyms.filter((x) => !x.circuit_id)) { const k = `${s.type}|${s.label ?? ''}`; (unlinked.get(k) ?? unlinked.set(k, { type: s.type, label: s.label ?? '', ids: [] }).get(k)!).ids.push(s.id); }
    const nameOf = (t: string) => symbolEntry(t)?.label ?? t;

    side.append(h('div', { style: { display: 'flex', alignItems: 'center' } }, h('h3', null, `Kring ${c.nr ?? ''}`), h('span', { class: 'spacer' }), btn('', { icon: 'X', variant: 'ghost', onClick: () => { selCid = null; draw(); drawSide(); } })),
      h('p', { class: 'muted' }, c.name));

    // 1) van het situatieplan
    side.append(h('h4', null, 'Van het situatieplan'),
      fromPlan.size ? h('div', null, [...fromPlan.values()].map((g) => h('div', { class: 'load-row' }, iconFor(g.type), h('span', { style: { flex: 1 } }, `${g.n}× ${nameOf(g.type)}${g.label ? ' – ' + g.label : ''}`))))
        : h('p', { class: 'hint' }, 'Nog geen symbolen aan deze kring gekoppeld.'));

    // 2) handmatig
    side.append(h('h4', null, 'Toegevoegd op het schema'),
      mine.length ? h('div', null, mine.map((m) => {
        const { id: baseId, n: gang } = splitType(m.type), en = symbolEntry(baseId);
        const save = async (patch: Partial<SchemaLoad>) => { Object.assign(m, patch); await upsert('schema_load', m); await after(); };
        return h('div', { class: 'load-row load-edit' }, iconFor(m.type),
          h('select', { onChange: async (e: Event) => { const id = (e.target as HTMLSelectElement).value; await save({ type: joinType(id, symbolEntry(id)?.multi ? gang : 1) }); } },
            stock.map((x) => h('option', { value: x.id, selected: x.id === baseId }, x.label))),
          en?.multi ? h('select', { title: 'Enkel, dubbel, drie- of vierdubbel', onChange: async (e: Event) => { await save({ type: joinType(baseId, Number((e.target as HTMLSelectElement).value)) }); } },
            [1, 2, 3, 4].map((n) => h('option', { value: n, selected: n === gang }, `${n}x`))) : null,
          h('input', { placeholder: 'label', value: m.label ?? '', style: { width: '80px' }, onChange: (e: Event) => save({ label: (e.target as HTMLInputElement).value || null }) }),
          h('input', { type: 'number', min: 1, max: 20, value: m.n, title: 'Aantal', style: { width: '48px' }, onChange: (e: Event) => save({ n: Math.max(1, Number((e.target as HTMLInputElement).value) || 1) }) }),
          btn('', { icon: 'Trash2', variant: 'ghost', title: 'Verwijderen', onClick: async () => { await softDelete('schema_load', m.id); await after(); } }));
      })) : h('p', { class: 'hint' }, 'Nog niets toegevoegd.'));

    // 3) uit het assortiment
    const input = h('input', { type: 'search', class: 'table-search', placeholder: 'Zoek lamp, stopcontact, boiler…', value: query, style: { width: '100%', boxSizing: 'border-box' },
      onInput: (e: Event) => { query = (e.target as HTMLInputElement).value; fillResults(); } }) as HTMLInputElement;
    const results = h('div', { class: 'load-results' });
    function fillResults() {
      clear(results);
      const q = norm(query.trim());
      const list = stock.filter((e) => !q || norm(e.label).includes(q) || norm(e.keywords).includes(q) || norm(e.func).includes(q)).slice(0, q ? 12 : 8);
      for (const e of list) results.append(h('button', { class: 'pal-item', title: 'Toevoegen aan deze kring', onClick: async () => {
        const pos = (manual.filter((m) => m.circuit_id === c!.id).length + 1);
        await upsert('schema_load', { circuit_id: c!.id, type: e.id, label: null, n: 1, pos }); await after();
      } }, iconFor(e.id), e.label));
    }
    side.append(h('h4', null, 'Toevoegen uit assortiment'), input, results); fillResults();

    // 4) symbolen op het plan zonder kring
    if (unlinked.size) side.append(h('h4', null, 'Nog niet gekoppeld op het plan'),
      h('div', null, [...unlinked.values()].map((g) => h('div', { class: 'load-row' }, iconFor(g.type), h('span', { style: { flex: 1 } }, `${g.ids.length}× ${nameOf(g.type)}${g.label ? ' – ' + g.label : ''}`),
        btn('Koppel', { variant: 'secondary', title: `Aan kring ${c.nr ?? ''} koppelen`, onClick: async () => {
          const now = Date.now(); await sql.batch(g.ids.map((id) => ({ sql: 'UPDATE symbol SET circuit_id=?, updated_at=? WHERE id=?', bind: [c.id, now, id] }))); await after(`${g.ids.length} symbool/symbolen gekoppeld`);
        } })))));
  }

  root.append(h('div', { class: 'toolbar' }, sel, h('span', { class: 'hint' }, 'Klik een kring om verbruikers toe te voegen'), h('span', { class: 'spacer' }),
    btn('SVG', { icon: 'Download', onClick: () => download(`eendraadschema-${which}.svg`, current, 'image/svg+xml') }),
    btn('Afdrukken', { icon: 'Printer', onClick: () => window.print() })),
    h('div', { class: 'split' }, h('div', { class: 'schema-scroll' }, out), side));
  await draw(); drawSide();
}

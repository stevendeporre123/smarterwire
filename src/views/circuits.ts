import { h, btn, icon, toast, loading } from '../lib/dom';
import { dataTable, formModal, badge, type FieldDef } from '../lib/ui';
import { upsert, softDelete, whereOp, putOp } from '../db/repo';
import { q, run } from '../db/client';
import { runChecks, type Finding } from '../domain/checks';
import { projectLoads } from '../domain/loads';
import { boardsOf, devicesOf, circuitsOf, plansOf, type Circuit, type Device, type Project } from '../domain/model';
import { CABLE_TYPES, FIRE_CLASSES, FUNCTIONS, INSTALL_MODES, CONDUIT_MODES, SECTIONS, STATUSES, EARTH_MODES, autoStatus, cableLabel, cableMissing, deviceTitle, devicePlaces, isFeeder, supplyOf, supplyVoltages } from '../domain/devices';

/** Verdiepingen = de aangemaakte plannen (geen vrije tekst meer: typfouten gaven dubbele groepen). Een bestaande afwijkende waarde blijft kiesbaar. */
const levelOptions = (plans: { name: string; level?: string | null }[], current?: string | null) => {
  const v = [...new Set(plans.map((p) => p.level || p.name))];
  if (current && !v.includes(current)) v.push(current);
  return v;
};

/** Kabelgegevens die je van een andere kring kunt overnemen. */
const COPY_KEYS = ['cable_type', 'fire_class', 'section_mm2', 'wires', 'has_earth', 'install', 'conduit', 'level'] as const;

/** `ctx.list` = kringen in tabelvolgorde (voor "vorige" en "Opslaan & volgende"); `ctx.prev` = de net opgeslagen vorige kring in een rondgang. */
export async function editCircuit(project: Project, circuit: Partial<Circuit>, onDone: () => void, ctx: { list?: Circuit[]; prev?: Partial<Circuit> } = {}) {
  const [boards, plans] = await Promise.all([boardsOf(project.id), plansOf(project.id)]);
  const old = boards.filter((b) => b.kind === 'bestaand');
  const opts: { value: string; label: string }[] = [];
  let hostBoard: string | undefined;
  for (const b of old) { const devs = await devicesOf(b.id), at = devicePlaces(devs); for (const d of devs) { if (d.id === circuit.device_id) hostBoard = b.id; if (isFeeder(d.kind)) opts.push({ value: d.id, label: `${old.length > 1 ? b.name + ': ' : ''}${at.get(d.id)} · ${deviceTitle(d)}` }); } }
  const supply = supplyOf(project);
  const fields: FieldDef[] = [
    { key: 'nr', label: 'Kring' },
    { key: 'name', label: 'Omschrijving', required: true, placeholder: 'bv. Stopcontacten living + keuken' },
    { key: 'func', label: 'Functie', type: 'select', options: FUNCTIONS },
    { key: 'device_id', label: 'Zekering (bestaande kast)', type: 'select', options: opts },
    { key: 'cable_type', label: 'Kabeltype *', type: 'select', options: CABLE_TYPES },
    { key: 'fire_class', label: 'Brandklasse *', type: 'select', options: FIRE_CLASSES },
    { key: 'section_mm2', label: 'Doorsnede (mm²) *', type: 'select', options: SECTIONS, numeric: true },
    { key: 'wires', label: 'Aantal aders (incl. aarde)', type: 'number', placeholder: '3 = 3G, 5 = 5G…' },
    { key: 'has_earth', label: 'Aarding (beschermgeleider)', type: 'select', options: EARTH_MODES },
    { key: 'install', label: 'Plaatsing *', type: 'select', options: INSTALL_MODES },
    { key: 'conduit', label: 'Los of in buis', type: 'select', options: CONDUIT_MODES, numeric: true },
    // --- zelden nodig ---
    { key: 'level', label: 'Verdieping', type: 'select', options: levelOptions(plans, circuit.level), advanced: true },
    { key: 'rooms', label: 'Ruimtes', placeholder: 'living, keuken…', advanced: true },
    ...(supply === '3N400' ? [{ key: 'voltage', label: 'Spanning (V)', type: 'select' as const, options: supplyVoltages(supply), numeric: true, allowEmpty: false, advanced: true }] : []),
    { key: 'status', label: 'Status (gedocumenteerd volgt vanzelf uit de kabelgegevens)', type: 'select', options: STATUSES, allowEmpty: false, advanced: true },
    { key: 'feeds_board_id', label: 'Voedt onderverdeler', type: 'select', options: old.filter((b) => b.id !== hostBoard).map((b) => ({ value: b.id, label: b.name })), advanced: true },
    { key: 'lock_group', label: 'Samen houden (gedeelde nul)', placeholder: 'zelfde tekst = zelfde differentieel', advanced: true },
    { key: 'notes', label: 'Notities / opmerkingen keuring', type: 'textarea', span: 2, advanced: true },
  ];
  const idx = ctx.list && circuit.id ? ctx.list.findIndex((c) => c.id === circuit.id) : -1;
  const next = idx >= 0 ? ctx.list![idx + 1] : undefined;
  const prev = ctx.prev ?? (idx > 0 ? ctx.list![idx - 1] : undefined);
  const extra = h('div', null, h('p', { class: 'hint' }, '* verplicht: zodra deze gegevens compleet zijn, wordt de kring vanzelf "gedocumenteerd".'));
  const form = formModal({
    title: circuit.id ? `Kring ${circuit.nr ?? ''} bewerken` : 'Nieuwe kring', fields, wide: true,
    values: { status: 'onbekend', voltage: 230, ...circuit },
    extra,
    saveNext: next ? { label: `Opslaan & volgende (${next.nr ?? ''})`, then: () => editCircuit(project, next, onDone, { list: ctx.list, prev: { ...circuit, ...form.read() } }) } : undefined,
    onSave: async (v) => {
      if (!v.name) return false;
      const missing = cableMissing(v);
      if (v.status === 'gecontroleerd' && missing.length) { toast(`Kabelgegevens onvolledig: ${missing.join(', ')}. Vul aan voor je de kring als gecontroleerd markeert.`, 'error'); return false; }
      await upsert('circuit', { ...circuit, ...v, project_id: project.id, status: autoStatus(v) });
      toast('Kring opgeslagen');
      onDone();
    },
    onDelete: circuit.id ? async () => { await softDelete('circuit', circuit.id!); onDone(); } : undefined,
  });
  if (prev) extra.prepend(btn(`Kabelgegevens overnemen van kring ${prev.nr ?? ''}`, { icon: 'Copy', variant: 'secondary', title: 'Kabeltype, brandklasse, doorsnede, aders, aarding, plaatsing en verdieping van de vorige kring', onClick: () => {
    for (const k of COPY_KEYS) { const el = form.inputs[k] as HTMLInputElement | undefined; if (el) el.value = prev[k] == null ? '' : String(prev[k]); }
  } }));
}

/** Meerdere kringen tegelijk aanpassen: enkel ingevulde velden worden overschreven ("—" = ongewijzigd). */
async function bulkEdit(project: Project, chosen: Circuit[], onDone: () => void) {
  const plans = await plansOf(project.id);
  const fields: FieldDef[] = [
    { key: 'func', label: 'Functie', type: 'select', options: FUNCTIONS },
    { key: 'level', label: 'Verdieping', type: 'select', options: levelOptions(plans) },
    { key: 'cable_type', label: 'Kabeltype', type: 'select', options: CABLE_TYPES },
    { key: 'fire_class', label: 'Brandklasse', type: 'select', options: FIRE_CLASSES },
    { key: 'section_mm2', label: 'Doorsnede (mm²)', type: 'select', options: SECTIONS, numeric: true },
    { key: 'wires', label: 'Aantal aders (incl. aarde)', type: 'number' },
    { key: 'has_earth', label: 'Aarding (beschermgeleider)', type: 'select', options: EARTH_MODES, numeric: true },
    { key: 'install', label: 'Plaatsing', type: 'select', options: INSTALL_MODES },
    { key: 'conduit', label: 'Los of in buis', type: 'select', options: CONDUIT_MODES, numeric: true },
  ];
  formModal({
    title: `${chosen.length} kring(en) aanpassen`, fields, values: {}, wide: true, saveLabel: 'Toepassen',
    extra: h('p', { class: 'hint' }, 'Enkel de velden die je invult worden overschreven; bij "—" blijft de bestaande waarde. De status volgt vanzelf uit de kabelgegevens.'),
    onSave: async (v) => {
      const patch = Object.fromEntries(Object.entries(v).filter(([, x]) => x != null && x !== ''));
      if (!Object.keys(patch).length) { toast('Niets ingevuld: er is niets aangepast', 'error'); return false; }
      await run(chosen.map((c) => putOp('circuit', { ...c, ...patch, status: autoStatus({ ...c, ...patch }) })));
      toast(`${chosen.length} kring(en) aangepast`); onDone();
    },
  });
}

/** Kringen in bulk verwijderen. Symbolen op het plan blijven staan (zonder kring), handmatige verbruikers en leidingtrajecten van de kring verdwijnen/ontkoppelen. */
async function deleteCircuits(ids: string[], alsoDevices: boolean, devIds: string[]) {
  const ops = [
    whereOp('circuit', { deleted: 1 }, { id: ids }),
    whereOp('symbol', { circuit_id: null }, { circuit_id: ids }),
    whereOp('schema_load', { deleted: 1 }, { circuit_id: ids }),
    whereOp('shape', { ref_id: null }, { kind: 'cable', ref_id: ids }),
  ];
  if (alsoDevices && devIds.length) ops.push(whereOp('device', { deleted: 1 }, { id: devIds }));
  await run(ops);
}

export async function renderCircuits(root: HTMLElement, project: Project) {
  const [circuits, boards] = await Promise.all([circuitsOf(project.id), boardsOf(project.id)]);
  const devs = new Map<string, Device>();
  const boardName = new Map(boards.map((b) => [b.id, b.name]));
  for (const b of boards) for (const d of await devicesOf(b.id)) devs.set(d.id, d);
  const found = runChecks({ circuits, devices: [...devs.values()], loads: await projectLoads(project.id), projectSupplyAmp: project.supply_amp });
  const foundBy = new Map<string, Finding[]>();
  for (const f of found) if (f.circuitId) (foundBy.get(f.circuitId) ?? foundBy.set(f.circuitId, []).get(f.circuitId)!).push(f);
  const symCounts = new Map<string, number>((await q('symCounts', { project: project.id }))
    .map((r: any) => [r.id, r.n]));
  const shared = new Map<string, number>();
  for (const c of circuits) if (c.device_id) shared.set(c.device_id, (shared.get(c.device_id) ?? 0) + 1);

  const orphan: Device[] = [];
  const oldIds = new Set(boards.filter((b) => b.kind === 'bestaand').map((b) => b.id));
  for (const d of devs.values()) if (oldIds.has(d.board_id) && isFeeder(d.kind) && !shared.has(d.id)) orphan.push(d);

  const reload = () => { loading(root); renderCircuits(root, project); };
  const selection = new Set<string>();
  const delBtn = btn('', { icon: 'Trash2', variant: 'danger', onClick: () => {
    const chosen = circuits.filter((c) => selection.has(c.id));
    if (!chosen.length) return;
    const devIds = [...new Set(chosen.flatMap((c) => [c.device_id, c.new_device_id]).filter(Boolean) as string[])];
    formModal({
      title: `${chosen.length} kring(en) verwijderen`, fields: devIds.length ? [{ key: 'devs', label: `Ook de ${devIds.length} gekoppelde zekering(en) uit de kast verwijderen`, type: 'checkbox', span: 2 }] : [], values: { devs: 0 }, saveLabel: 'Verwijderen',
      extra: h('div', null,
        h('p', null, 'Symbolen op het situatieplan blijven staan, maar zonder kring. Op het schema toegevoegde verbruikers van deze kringen verdwijnen.'),
        devIds.length ? h('p', { class: 'hint' }, 'Een zekering is altijd een kring: laat je de zekeringen staan, dan krijgen ze bij het volgende openen een lege nieuwe kring.') : null),
      onSave: async (v) => { await deleteCircuits(chosen.map((c) => c.id), !!v.devs, devIds); toast(`${chosen.length} kring(en) verwijderd`); reload(); },
    });
  } });
  const editBtn = btn('', { icon: 'ListChecks', variant: 'secondary', title: 'Kabelgegevens van de geselecteerde kringen in één keer aanpassen', onClick: () => { const chosen = circuits.filter((c) => selection.has(c.id)); if (chosen.length) bulkEdit(project, chosen, reload); } });
  const updDel = () => { const n = selection.size; (delBtn.querySelector('span') ?? delBtn.appendChild(h('span'))).textContent = n ? `Verwijder selectie (${n})` : 'Verwijder selectie'; delBtn.disabled = !n;
    (editBtn.querySelector('span') ?? editBtn.appendChild(h('span'))).textContent = n ? `Bewerk selectie (${n})` : 'Bewerk selectie'; editBtn.disabled = !n; };
  updDel();
  const bname = (d: Device) => (oldIds.size > 1 ? `${boardName.get(d.board_id)}: ` : '') + deviceTitle(d);

  root.append(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h2', null, 'Kringen'), h('span', { class: 'hint' }, `${circuits.length} kring(en)`), h('span', { class: 'spacer' }),
      editBtn, delBtn,
      btn('Nieuwe kring', { icon: 'Plus', variant: 'primary', onClick: () => editCircuit(project, {}, reload) })),
    orphan.length ? h('div', { class: 'card card-pad', style: { marginBottom: '16px' } },
      h('div', { class: 'hint', style: { marginBottom: '8px' } }, icon('TriangleAlert', 14), ` ${orphan.length} zekering(en) zonder gedocumenteerde kring – klik om te documenteren:`),
      h('div', { class: 'legend' }, orphan.map((d) => btn(bname(d), { variant: 'secondary', onClick: () => editCircuit(project, { device_id: d.id }, reload) })))) : null,
    dataTable({
      selection, onSelect: updDel, rows: circuits, search: (c) => `${c.nr} ${c.name} ${c.func} ${c.rooms} ${c.cable_type} ${c.level}`, empty: 'Nog geen kringen. Documenteer ze per zekering of via het situatieplan.',
      onRow: (c) => editCircuit(project, c, reload, { list: circuits }),
      rowClass: (c) => (c.device_id && shared.get(c.device_id)! > 1 ? 'row-warn' : ''),
      columns: [
        { key: 'nr', label: 'Nr', width: '60px' },
        { key: 'name', label: 'Omschrijving', render: (c) => h('span', null, h('strong', null, c.name), c.feeds_board_id ? badge(`→ ${boardName.get(c.feeds_board_id) ?? 'onderverdeler'}`, 'info') : null) },
        { key: 'func', label: 'Functie' },
        { key: 'level', label: 'Verd.' },
        { key: 'device_id', label: 'Zekering (nu)', sort: (c) => (c.device_id ? bname(devs.get(c.device_id)!) : ''),
          render: (c) => { const d = c.device_id ? devs.get(c.device_id) : null;
            return d ? h('span', null, bname(d), shared.get(d.id)! > 1 ? badge(`deelt met ${shared.get(d.id)! - 1}`, 'warn') : null) : badge('niet gekoppeld', 'err'); } },
        { key: 'cable', label: 'Kabel', sort: (c) => cableLabel(c),
          render: (c) => { const m = cableMissing(c); return h('span', null, cableLabel(c) || '—', m.length ? badge(`mist: ${m.join(', ')}`, 'warn') : null); } },
        { key: 'checks', label: 'Controle', sort: (c) => (foundBy.get(c.id) ?? []).reduce((s, f) => s + (f.level === 'fout' ? 100 : f.level === 'waarschuwing' ? 10 : 1), 0),
          render: (c) => { const fs = foundBy.get(c.id) ?? [], n = (l: string) => fs.filter((f) => f.level === l).length; if (!fs.length) return '—';
            return h('a', { href: `#/p/${project.id}/bevindingen`, title: fs.map((f) => f.title).join(String.fromCharCode(10)), onClick: (e: Event) => e.stopPropagation() }, n('fout') ? badge(`${n('fout')} fout`, 'err') : null, n('waarschuwing') ? badge(`${n('waarschuwing')} waarsch.`, 'warn') : null, n('info') ? badge(`${n('info')} info`, 'info') : null); } },
        { key: 'new_device_id', label: 'Nieuwe kast', render: (c) => { const d = c.new_device_id ? devs.get(c.new_device_id) : null; return d ? deviceTitle(d) + (d.phase ? ` · ${d.phase}` : '') : '—'; } },
        { key: 'sym', label: 'Symb.', align: 'right', render: (c) => String(symCounts.get(c.id) ?? 0), sort: (c) => symCounts.get(c.id) ?? 0 },
        { key: 'status', label: 'Status', render: (c) => badge(c.status, c.status === 'gecontroleerd' ? 'ok' : c.status === 'gedocumenteerd' ? 'info' : 'muted') },
      ],
    })));
}

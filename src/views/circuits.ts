import { h, btn, icon } from '../lib/dom';
import { dataTable, formModal, badge, type FieldDef } from '../lib/ui';
import { upsert, softDelete } from '../db/repo';
import { sql } from '../db/client';
import { boardsOf, devicesOf, circuitsOf, type Circuit, type Device, type Project } from '../domain/model';
import { CABLE_TYPES, FUNCTIONS, SECTIONS, STATUSES, deviceTitle, isFeeder } from '../domain/devices';

export async function editCircuit(project: Project, circuit: Partial<Circuit>, onDone: () => void) {
  const boards = await boardsOf(project.id);
  const devs: { b: string; d: Device }[] = [];
  for (const b of boards) for (const d of await devicesOf(b.id)) devs.push({ b: b.kind, d });
  const opt = (kind: string) => devs.filter((x) => x.b === kind && isFeeder(x.d.kind))
    .map(({ d }) => ({ value: d.id, label: `${deviceTitle(d)}${d.row_no !== undefined ? ` (rij ${d.row_no + 1})` : ''}` }));

  const fields: FieldDef[] = [
    { key: 'nr', label: 'Nr.' },
    { key: 'name', label: 'Omschrijving', required: true, placeholder: 'bv. Stopcontacten living + keuken' },
    { key: 'func', label: 'Functie', type: 'select', options: FUNCTIONS },
    { key: 'rooms', label: 'Ruimtes', placeholder: 'living, keuken…' },
    { key: 'device_id', label: 'Zekering (bestaande kast)', type: 'select', options: opt('bestaand'), span: 2 },
    { key: 'cable_type', label: 'Kabeltype', type: 'select', options: CABLE_TYPES },
    { key: 'section_mm2', label: 'Doorsnede (mm²)', type: 'select', options: SECTIONS, numeric: true },
    { key: 'wires', label: 'Aantal aders', type: 'number', placeholder: '3 = 3G, 5 = 5G…' },
    { key: 'voltage', label: 'Spanning (V)', type: 'select', options: [230, 400], numeric: true },
    { key: 'status', label: 'Status', type: 'select', options: STATUSES, allowEmpty: false },
    { key: 'has_earth', label: 'Aarding aanwezig', type: 'checkbox' },
    { key: 'notes', label: 'Notities / opmerkingen keuring', type: 'textarea', span: 2 },
  ];
  formModal({
    title: circuit.id ? `Kring ${circuit.nr ?? ''} bewerken` : 'Nieuwe kring', fields, wide: true,
    values: { status: 'onbekend', voltage: 230, has_earth: 1, ...circuit },
    onSave: async (v) => {
      if (!v.name) return;
      // zekering gewijzigd? (device_id komt uit <select> als string)
      await upsert('circuit', { ...circuit, ...v, project_id: project.id, status: v.status ?? 'onbekend' });
      onDone();
    },
    onDelete: circuit.id ? async () => { await softDelete('circuit', circuit.id!); onDone(); } : undefined,
  });
}

export async function renderCircuits(root: HTMLElement, project: Project) {
  const [circuits, boards] = await Promise.all([circuitsOf(project.id), boardsOf(project.id)]);
  const devs = new Map<string, Device>();
  for (const b of boards) for (const d of await devicesOf(b.id)) devs.set(d.id, d);
  const symCounts = new Map<string, number>((await sql.query(
    `SELECT s.circuit_id id, COUNT(*) n FROM symbol s JOIN plan p ON p.id=s.plan_id WHERE s.deleted=0 AND p.project_id=? AND s.circuit_id IS NOT NULL GROUP BY s.circuit_id`, [project.id]))
    .map((r: any) => [r.id, r.n]));
  const shared = new Map<string, number>();
  for (const c of circuits) if (c.device_id) shared.set(c.device_id, (shared.get(c.device_id) ?? 0) + 1);

  // bestaande zekeringen zonder kring -> snelle actie
  const orphan: Device[] = [];
  for (const b of boards.filter((b) => b.kind === 'bestaand'))
    for (const d of devs.values()) if (d.board_id === b.id && isFeeder(d.kind) && !shared.has(d.id)) orphan.push(d);

  const reload = () => { root.innerHTML = ''; renderCircuits(root, project); };
  const cableStr = (c: Circuit) => [c.cable_type, c.wires ? `${c.wires}G` : '', c.section_mm2 ? `${c.section_mm2} mm²` : ''].filter(Boolean).join(' ');

  root.append(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h2', null, 'Kringen'), h('span', { class: 'hint' }, `${circuits.length} kring(en)`), h('span', { class: 'spacer' }),
      btn('Nieuwe kring', { icon: 'Plus', variant: 'primary', onClick: () => editCircuit(project, {}, reload) })),
    orphan.length ? h('div', { class: 'card card-pad', style: { marginBottom: '16px' } },
      h('div', { class: 'hint', style: { marginBottom: '8px' } }, icon('TriangleAlert', 14), ` ${orphan.length} zekering(en) zonder gedocumenteerde kring – klik om te documenteren:`),
      h('div', { class: 'legend' }, orphan.map((d) => btn(deviceTitle(d), { variant: 'secondary', onClick: () => editCircuit(project, { device_id: d.id }, reload) })))) : null,
    dataTable({
      rows: circuits, search: (c) => `${c.nr} ${c.name} ${c.func} ${c.rooms} ${c.cable_type}`, empty: 'Nog geen kringen. Documenteer ze per zekering of via het situatieplan.',
      onRow: (c) => editCircuit(project, c, reload),
      rowClass: (c) => (c.device_id && shared.get(c.device_id)! > 1 ? 'row-warn' : ''),
      columns: [
        { key: 'nr', label: 'Nr', width: '60px' },
        { key: 'name', label: 'Omschrijving', render: (c) => h('strong', null, c.name) },
        { key: 'func', label: 'Functie' },
        { key: 'rooms', label: 'Ruimtes' },
        { key: 'device_id', label: 'Zekering (nu)', sort: (c) => (c.device_id ? deviceTitle(devs.get(c.device_id)!) : ''),
          render: (c) => { const d = c.device_id ? devs.get(c.device_id) : null;
            return d ? h('span', null, deviceTitle(d), shared.get(d.id)! > 1 ? badge(`deelt met ${shared.get(d.id)! - 1}`, 'warn') : null) : badge('niet gekoppeld', 'err'); } },
        { key: 'cable', label: 'Kabel', render: (c) => cableStr(c) || '—' },
        { key: 'new_device_id', label: 'Nieuwe kast', render: (c) => { const d = c.new_device_id ? devs.get(c.new_device_id) : null; return d ? deviceTitle(d) : '—'; } },
        { key: 'sym', label: 'Symbolen', align: 'right', render: (c) => String(symCounts.get(c.id) ?? 0), sort: (c) => symCounts.get(c.id) ?? 0 },
        { key: 'status', label: 'Status', render: (c) => badge(c.status, c.status === 'gecontroleerd' ? 'ok' : c.status === 'gedocumenteerd' ? 'info' : 'muted') },
      ],
    })));
}

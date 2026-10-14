import { h, btn, icon, toast } from '../lib/dom';
import { dataTable, formModal, badge, type FieldDef } from '../lib/ui';
import { upsert, softDelete } from '../db/repo';
import { sql } from '../db/client';
import { boardsOf, devicesOf, circuitsOf, plansOf, type Circuit, type Device, type Project } from '../domain/model';
import { CABLE_TYPES, FIRE_CLASSES, FUNCTIONS, INSTALL_MODES, SECTIONS, STATUSES, cableLabel, cableMissing, deviceTitle, isFeeder } from '../domain/devices';

export async function editCircuit(project: Project, circuit: Partial<Circuit>, onDone: () => void) {
  const [boards, plans] = await Promise.all([boardsOf(project.id), plansOf(project.id)]);
  const old = boards.filter((b) => b.kind === 'bestaand');
  const opts: { value: string; label: string }[] = [];
  let hostBoard: string | undefined;
  for (const b of old) for (const d of await devicesOf(b.id)) { if (d.id === circuit.device_id) hostBoard = b.id; if (isFeeder(d.kind)) opts.push({ value: d.id, label: `${old.length > 1 ? b.name + ': ' : ''}${deviceTitle(d)} (rij ${d.row_no + 1})` }); }
  const fields: FieldDef[] = [
    { key: 'nr', label: 'Nr.' },
    { key: 'name', label: 'Omschrijving', required: true, placeholder: 'bv. Stopcontacten living + keuken' },
    { key: 'func', label: 'Functie', type: 'select', options: FUNCTIONS },
    { key: 'level', label: 'Verdieping', list: plans.map((p) => p.level || p.name) },
    { key: 'device_id', label: 'Zekering (bestaande kast)', type: 'select', options: opts, span: 2 },
    { key: 'rooms', label: 'Ruimtes', placeholder: 'living, keuken…', span: 2 },
    { key: 'cable_type', label: 'Kabeltype *', type: 'select', options: CABLE_TYPES },
    { key: 'fire_class', label: 'Brandklasse *', type: 'select', options: FIRE_CLASSES },
    { key: 'section_mm2', label: 'Doorsnede (mm²) *', type: 'select', options: SECTIONS, numeric: true },
    { key: 'wires', label: 'Aantal aders (incl. aarde)', type: 'number', placeholder: '3 = 3G, 5 = 5G…' },
    { key: 'install', label: 'Plaatsing *', type: 'select', options: INSTALL_MODES, span: 2 },
    { key: 'voltage', label: 'Spanning (V)', type: 'select', options: [230, 400], numeric: true, allowEmpty: false },
    { key: 'status', label: 'Status', type: 'select', options: STATUSES, allowEmpty: false },
    { key: 'feeds_board_id', label: 'Voedt onderverdeler', type: 'select', options: old.filter((b) => b.id !== hostBoard).map((b) => ({ value: b.id, label: b.name })) },
    { key: 'lock_group', label: 'Samen houden (bv. gedeelde nul)', placeholder: 'zelfde tekst = zelfde differentieel' },
    { key: 'has_earth', label: 'Aarding aanwezig', type: 'checkbox' },
    { key: 'notes', label: 'Notities / opmerkingen keuring', type: 'textarea', span: 2 },
  ];
  formModal({
    title: circuit.id ? `Kring ${circuit.nr ?? ''} bewerken` : 'Nieuwe kring', fields, wide: true,
    values: { status: 'onbekend', voltage: 230, has_earth: 1, ...circuit },
    extra: h('p', { class: 'hint' }, '* verplicht om een kring als "gedocumenteerd" te kunnen markeren.'),
    onSave: async (v) => {
      if (!v.name) return false;
      const status = v.status ?? 'onbekend';
      const missing = cableMissing(v);
      if (status !== 'onbekend' && missing.length) { toast(`Kabelgegevens onvolledig: ${missing.join(', ')}. Vul aan of zet de status op "onbekend".`, 'error'); return false; }
      await upsert('circuit', { ...circuit, ...v, project_id: project.id, status });
      onDone();
    },
    onDelete: circuit.id ? async () => { await softDelete('circuit', circuit.id!); onDone(); } : undefined,
  });
}

export async function renderCircuits(root: HTMLElement, project: Project) {
  const [circuits, boards] = await Promise.all([circuitsOf(project.id), boardsOf(project.id)]);
  const devs = new Map<string, Device>();
  const boardName = new Map(boards.map((b) => [b.id, b.name]));
  for (const b of boards) for (const d of await devicesOf(b.id)) devs.set(d.id, d);
  const symCounts = new Map<string, number>((await sql.query(
    `SELECT s.circuit_id id, COUNT(*) n FROM symbol s JOIN plan p ON p.id=s.plan_id WHERE s.deleted=0 AND p.project_id=? AND s.circuit_id IS NOT NULL GROUP BY s.circuit_id`, [project.id]))
    .map((r: any) => [r.id, r.n]));
  const shared = new Map<string, number>();
  for (const c of circuits) if (c.device_id) shared.set(c.device_id, (shared.get(c.device_id) ?? 0) + 1);

  const orphan: Device[] = [];
  const oldIds = new Set(boards.filter((b) => b.kind === 'bestaand').map((b) => b.id));
  for (const d of devs.values()) if (oldIds.has(d.board_id) && isFeeder(d.kind) && !shared.has(d.id)) orphan.push(d);

  const reload = () => { root.innerHTML = ''; renderCircuits(root, project); };
  const bname = (d: Device) => (oldIds.size > 1 ? `${boardName.get(d.board_id)}: ` : '') + deviceTitle(d);

  root.append(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h2', null, 'Kringen'), h('span', { class: 'hint' }, `${circuits.length} kring(en)`), h('span', { class: 'spacer' }),
      btn('Nieuwe kring', { icon: 'Plus', variant: 'primary', onClick: () => editCircuit(project, {}, reload) })),
    orphan.length ? h('div', { class: 'card card-pad', style: { marginBottom: '16px' } },
      h('div', { class: 'hint', style: { marginBottom: '8px' } }, icon('TriangleAlert', 14), ` ${orphan.length} zekering(en) zonder gedocumenteerde kring – klik om te documenteren:`),
      h('div', { class: 'legend' }, orphan.map((d) => btn(bname(d), { variant: 'secondary', onClick: () => editCircuit(project, { device_id: d.id }, reload) })))) : null,
    dataTable({
      rows: circuits, search: (c) => `${c.nr} ${c.name} ${c.func} ${c.rooms} ${c.cable_type} ${c.level}`, empty: 'Nog geen kringen. Documenteer ze per zekering of via het situatieplan.',
      onRow: (c) => editCircuit(project, c, reload),
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
        { key: 'new_device_id', label: 'Nieuwe kast', render: (c) => { const d = c.new_device_id ? devs.get(c.new_device_id) : null; return d ? deviceTitle(d) + (d.phase ? ` · ${d.phase}` : '') : '—'; } },
        { key: 'sym', label: 'Symb.', align: 'right', render: (c) => String(symCounts.get(c.id) ?? 0), sort: (c) => symCounts.get(c.id) ?? 0 },
        { key: 'status', label: 'Status', render: (c) => badge(c.status, c.status === 'gecontroleerd' ? 'ok' : c.status === 'gedocumenteerd' ? 'info' : 'muted') },
      ],
    })));
}

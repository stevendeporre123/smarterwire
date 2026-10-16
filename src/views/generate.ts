import { h, toast } from '../lib/dom';
import { formModal, confirmDialog, alertDialog, modal } from '../lib/ui';
import { btn } from '../lib/dom';
import { boardsOf, circuitsOf, allDevicesOfProject, type Project } from '../domain/model';
import { DIFF_TYPES, deviceTitle, devicePlaces } from '../domain/devices';
import { generateNewBoards, DEFAULT_GEN } from '../domain/newboard';

/** Bouwt de nieuwe kast(en) opnieuw op vanuit de kringen (hoofddifferentieel, 30 mA-groepen, rijen). Vervangt bestaande voorstellen. */
export async function openGenerate(project: Project, onDone: () => void) {
  const [boards, circuits] = await Promise.all([boardsOf(project.id), circuitsOf(project.id)]);
  if (!circuits.length) { toast('Documenteer eerst enkele kringen', 'error'); return; }
  if (boards.some((b) => b.kind === 'nieuw') && !(await confirmDialog({ title: 'Nieuwe kast opbouwen', message: 'Bestaande voorstellen voor de nieuwe kast(en) worden vervangen. Doorgaan?', confirmLabel: 'Doorgaan', danger: false }))) return;
  const noPhase = !project.supply;
  formModal({ title: 'Nieuwe kast opbouwen vanuit de kringen', wide: true, saveLabel: 'Opbouwen', fields: [
    { key: 'maxPerDiff', label: 'Max. kringen per 30 mA-differentieel', type: 'number' },
    { key: 'diffRating', label: 'Differentieel (A)', type: 'number' },
    { key: 'mainDiffRating', label: 'Hoofddifferentieel 300 mA (A)', type: 'number' },
    { key: 'mainDiffType', label: 'Type hoofddifferentieel', type: 'select', options: DIFF_TYPES, allowEmpty: false },
    { key: 'mainDiffSelective', label: 'Hoofddifferentieel selectief (type S)', type: 'checkbox' },
    { key: 'diffType', label: 'Type 30 mA-differentiëlen', type: 'select', options: ['A', 'F', 'B'], allowEmpty: false },
    { key: 'reservePct', label: 'Reserve in de kast (% vrije modules)', type: 'number' },
    { key: 'rowModules', label: 'Breedte van de nieuwe kast (modules per rij)', type: 'number' },
    { key: 'rows', label: 'Aantal rijen', type: 'number' },
    { key: 'bigPerDiff', label: 'Grote verbruikers per differentieel', type: 'number' },
    { key: 'splitByLevel', label: 'Groeperen per verdieping', type: 'checkbox' },
    { key: 'mergeLeftovers', label: 'Kleine restgroepen van opeenvolgende verdiepingen samenvoegen', type: 'checkbox', span: 2 },
    { key: 'bigOwnDiff', label: 'Grote verbruikers (kookplaat, oven, droogkast, boiler, verwarming, airco, laadpaal) apart', type: 'checkbox', span: 2 }],
    values: { ...DEFAULT_GEN },
    extra: h('div', { class: 'hint' },
      h('p', null, `${circuits.length} kring(en) → elke kring krijgt een eigen automaat. Onderverdelers blijven onderverdelers. Zekeringwaarde volgt de kabeldoorsnede, altijd zelf nakijken.`),
      h('p', null, 'De kast begint met een hoofddifferentieel van 300 mA; de hoofdautomaat blijft buiten de kast (aan de meter). Elk 30 mA-differentieel met zijn automaten blijft liefst op één rij.'),
      h('p', null, 'Kringen die samen moeten blijven (bestaande bekabeling) markeer je bij de kring met "Samen houden". Fases worden verdeeld volgens de voeding in de projectgegevens.'),
      noPhase ? h('p', { style: { color: '#b35c00' } }, '⚠ Voeding (mono/driefasig) is niet ingevuld bij de projectgegevens; er wordt monofasig gerekend.') : null),
    onSave: async (v) => {
      const r = await generateNewBoards(project, { ...DEFAULT_GEN, ...v } as any);
      toast(`${r.diffs} differentieel(en) voorgesteld`);
      const nb = (await boardsOf(project.id)).find((x) => x.kind === 'nieuw'); if (nb) localStorage.setItem(`smarterwire.board.${project.id}`, nb.id);
      onDone();
      if (r.warnings.length) await alertDialog('Opmerkingen', [...new Set(r.warnings)].join('\n'));
      await showMapping(project);
    } });
}

/** Overzicht van de bestaande zekering naar de nieuwe (kring, automaat, differentieel, fase) na het opbouwen. */
export async function showMapping(project: Project) {
  const [circuits, devices] = await Promise.all([circuitsOf(project.id), allDevicesOfProject(project.id)]);
  const byId = new Map(devices.map((d) => [d.id, d])), at = new Map<string, string>();
  for (const b of new Set(devices.map((d) => d.board_id))) for (const [id, pl] of devicePlaces(devices.filter((d) => d.board_id === b))) at.set(id, pl);
  const rows = circuits.filter((c) => c.new_device_id).map((c) => {
    const o = c.device_id ? byId.get(c.device_id) : undefined, n = byId.get(c.new_device_id!), p = n?.parent_id ? byId.get(n.parent_id) : undefined;
    return { c, old: o ? `${at.get(o.id)} · ${deviceTitle(o)}` : '—', nu: n ? `${at.get(n.id)} · ${deviceTitle(n)}${n.phase ? ' · ' + n.phase : ''}` : '—', diff: p ? deviceTitle(p) : '—' };
  });
  if (!rows.length) return;
  const th = (t: string) => h('th', null, t), td = (t: string) => h('td', null, t);
  const table = h('table', { class: 'table' }, h('thead', null, h('tr', null, ['Kring', 'Omschrijving', 'Oude zekering', 'Nieuwe automaat', 'Differentieel'].map(th))),
    h('tbody', null, rows.map((r) => h('tr', null, td(r.c.nr ?? ''), td(r.c.name), td(r.old), td(r.nu), td(r.diff)))));
  modal({ title: 'Oud → nieuw', wide: true, body: h('div', null, h('p', { class: 'hint' }, 'Elke kring behoudt zijn nummer; de nieuwe automaat staat onder het genoemde differentieel. Zekeringwaarden volgen de kabeldoorsnede: altijd zelf nakijken.'), h('div', { class: 'table-scroll' }, table)),
    actions: (close) => [h('span', { class: 'spacer' }), btn('Sluiten', { variant: 'primary', onClick: close })] });
}

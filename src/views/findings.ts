import { h, btn, icon, loading } from '../lib/dom';
import { badge } from '../lib/ui';
import { circuitsOf, allDevicesOfProject, boardsOf, type Project } from '../domain/model';
import { projectLoads } from '../domain/loads';
import { runChecks, type Finding, type Level } from '../domain/checks';
import { editCircuit } from './circuits';

const LEVELS: { id: Level; label: string; kind: 'err' | 'warn' | 'info' }[] = [
  { id: 'fout', label: 'Fouten', kind: 'err' }, { id: 'waarschuwing', label: 'Waarschuwingen', kind: 'warn' }, { id: 'info', label: 'Info', kind: 'info' },
];

/** Alle controles voor een project uitvoeren. */
export async function projectFindings(project: Project): Promise<Finding[]> {
  const [circuits, devices, loads] = await Promise.all([circuitsOf(project.id), allDevicesOfProject(project.id), projectLoads(project.id)]);
  return runChecks({ circuits, devices, loads, projectSupplyAmp: project.supply_amp, earthOhm: project.earth_ohm });
}

export async function renderFindings(root: HTMLElement, project: Project) {
  const [findings, circuits, boards] = await Promise.all([projectFindings(project), circuitsOf(project.id), boardsOf(project.id)]);
  const reload = () => { loading(root); renderFindings(root, project); };
  let only: Level | null = null, state: 'alle' | 'bestaand' | 'nieuw' = 'alle';
  const hasNew = boards.some((b) => b.kind === 'nieuw');
  const list = h('div');

  const draw = () => {
    list.replaceChildren();
    const shown = findings.filter((f) => (!only || f.level === only) && (state === 'alle' || f.state === state));
    if (!shown.length) list.append(h('div', { class: 'card empty-state' }, icon('ShieldCheck', 40), h('h3', null, findings.length ? 'Geen bevindingen met deze filter' : 'Geen bevindingen'),
      h('p', null, findings.length ? 'Pas de filter aan om de andere bevindingen te zien.' : 'De ingebouwde controles vonden niets. Dat betekent niet dat de installatie in orde is: ze dekken maar een deel van de keuring.')));
    for (const f of shown) {
      const lv = LEVELS.find((l) => l.id === f.level)!, c = f.circuitId ? circuits.find((x) => x.id === f.circuitId) : undefined;
      list.append(h('div', { class: 'card card-pad', style: { marginBottom: '10px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, badge(lv.id, lv.kind), badge(f.state === 'nieuw' ? 'nieuwe toestand' : 'bestaande toestand', 'muted'), h('strong', null, f.title)),
        h('p', { style: { margin: '8px 0 4px' } }, f.why),
        h('p', { style: { margin: '4px 0' } }, h('strong', null, 'Oplossing: '), f.fix),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' } }, h('span', { class: 'hint' }, `Bron: ${f.source}`), h('span', { class: 'spacer' }),
          c ? btn('Kring openen', { icon: 'Pencil', variant: 'secondary', onClick: () => editCircuit(project, c, reload) }) : null,
          f.deviceId ? btn('Naar de kast', { icon: 'LayoutPanelTop', variant: 'ghost', onClick: () => { location.hash = `#/p/${project.id}/kast`; } }) : null)));
    }
  };

  const chips = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } });
  const drawChips = () => {
    chips.replaceChildren(
      btn(`Alles (${findings.length})`, { variant: only === null ? 'primary' : 'ghost', onClick: () => { only = null; drawChips(); draw(); } }),
      ...LEVELS.map((l) => btn(`${l.label} (${findings.filter((f) => f.level === l.id).length})`, { variant: only === l.id ? 'primary' : 'ghost', onClick: () => { only = only === l.id ? null : l.id; drawChips(); draw(); } })),
      ...(hasNew ? [h('select', { onChange: (e: Event) => { state = (e.target as HTMLSelectElement).value as typeof state; draw(); } },
        [['alle', 'Beide toestanden'], ['bestaand', 'Bestaande toestand'], ['nieuw', 'Nieuwe toestand']].map(([v, t]) => h('option', { value: v, selected: v === state }, t)))] : []));
  };
  drawChips(); draw();

  root.append(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h2', null, 'Bevindingen'), h('span', { class: 'hint' }, `${findings.length} bevinding(en)`), h('span', { class: 'spacer' }), chips),
    h('div', { class: 'card card-pad', style: { marginBottom: '12px' } }, h('p', { class: 'hint', style: { margin: 0 } },
      icon('Info', 14), ' Indicatieve controles op basis van vuistregels uit de praktijk (kabeldoorsnede vs. zekering, 30 mA bij stopcontacten, type differentieel, grote verbruikers, aantal punten, ontbrekende gegevens). Ze vervangen de keuring niet en verwijzen nog niet naar artikels van het AREI: controleer elke bevinding in de actuele tekst.')),
    list));
}

import { h, toast } from '../lib/dom';
import { formModal, confirmDialog, alertDialog } from '../lib/ui';
import { boardsOf, circuitsOf, type Project } from '../domain/model';
import { DIFF_TYPES } from '../domain/devices';
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
      if (r.warnings.length) await alertDialog('Opmerkingen', [...new Set(r.warnings)].join('\n'));
      const nb = (await boardsOf(project.id)).find((x) => x.kind === 'nieuw'); if (nb) localStorage.setItem(`smarterwire.board.${project.id}`, nb.id);
      onDone();
    } });
}

import { h, toast } from '../lib/dom';
import { formModal } from '../lib/ui';
import { sql } from '../db/client';
import { assetUrl, assetSize } from '../db/repo';
import { boardsOf, circuitsOf, plansOf, shapesOf, symbolsOf, allDevicesOfProject, type Project } from '../domain/model';
import { getInstaller } from '../domain/settings';
import { buildPdfPages, type PdfData, type PdfOptions } from '../domain/pdfpages';

/** Verzamelt alles wat op de PDF komt. */
export async function loadPdfData(project: Project): Promise<PdfData> {
  const [boards, circuits, devices, plans, installer, symbols] = await Promise.all([
    boardsOf(project.id), circuitsOf(project.id), allDevicesOfProject(project.id), plansOf(project.id), getInstaller(),
    sql.query<{ circuit_id: string | null; type: string; label: string | null }>(
      `SELECT s.circuit_id, s.type, s.label FROM symbol s JOIN plan p ON p.id=s.plan_id WHERE s.deleted=0 AND p.deleted=0 AND p.project_id=? ORDER BY p.level, p.name, s.rowid`, [project.id]),
  ]);
  const pdfPlans = await Promise.all(plans.map(async (plan) => ({ plan, shapes: await shapesOf(plan.id), symbols: await symbolsOf(plan.id), photoUrl: await assetUrl(plan.asset_id) })));
  const photos = (await Promise.all(boards.filter((b) => b.kind === 'bestaand' && b.asset_id).map(async (board) => {
    const url = await assetUrl(board.asset_id), sz = await assetSize(board.asset_id!);
    return url && sz ? { board, url, w: sz.width, h: sz.height } : null;
  }))).filter((x): x is NonNullable<typeof x> => !!x);
  return { project, installer, boards, devices, circuits, symbols, plans: pdfPlans, photos };
}

/** Zet de pagina's in het document en opent het afdrukvenster (kies "Opslaan als PDF"). */
export function printPages(pages: string[]) {
  const root = h('div', { id: 'print-root' });
  root.innerHTML = pages.map((p) => `<section class="pdf-page">${p}</section>`).join('');
  document.body.append(root); document.body.classList.add('printing');
  const done = () => { root.remove(); document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 150);
}

export async function openPdfExport(project: Project) {
  const data = await loadPdfData(project);
  const hasNew = data.boards.some((b) => b.kind === 'nieuw'), hasOld = data.boards.some((b) => b.kind === 'bestaand');
  if (!hasNew && !hasOld) { toast('Voeg eerst een zekeringskast toe', 'error'); return; }
  const warn: string[] = [];
  if (!data.installer.name) warn.push('Installateur is nog niet ingevuld (knop "Installateur" bovenaan).');
  if (!project.inspector) warn.push('Keuringsinstelling ontbreekt in de projectgegevens.');
  if (!project.owner && !project.address) warn.push('Eigenaar en adres van de installatie ontbreken in de projectgegevens.');
  formModal({
    title: 'PDF exporteren', wide: true, saveLabel: 'Exporteren',
    fields: [
      { key: 'state', label: 'Eendraadschema', type: 'select', allowEmpty: false, span: 2, options: [
        ...(hasNew ? [{ value: 'nieuw', label: 'Nieuwe toestand (ontwerp)' }] : []), ...(hasOld ? [{ value: 'bestaand', label: 'Bestaande toestand' }] : []), ...(hasNew && hasOld ? [{ value: 'beide', label: 'Beide' }] : [])] },
      { key: 'plans', label: `Situatieplannen (${data.plans.length})`, type: 'checkbox' }, { key: 'photoOnPlans', label: 'Foto als achtergrond op het plan', type: 'checkbox' },
      { key: 'photos', label: `Foto's van de bestaande kast (${data.photos.length})`, type: 'checkbox' }, { key: 'list', label: 'Lijst van de kringen', type: 'checkbox' },
    ],
    values: { state: hasNew ? 'nieuw' : 'bestaand', plans: data.plans.length ? 1 : 0, photoOnPlans: 0, photos: data.photos.length ? 1 : 0, list: 1 },
    extra: h('div', null, ...warn.map((w) => h('p', { style: { color: '#b35c00', margin: '4px 0' } }, '⚠ ' + w)),
      h('p', { class: 'hint' }, 'Het afdrukvenster opent met A4 liggend. Kies als printer "Opslaan als PDF" en zet marges op "Geen".')),
    onSave: async (v) => {
      const o: PdfOptions = { states: v.state === 'beide' ? ['bestaand', 'nieuw'] : [v.state], plans: !!v.plans, photos: !!v.photos, list: !!v.list, photoOnPlans: !!v.photoOnPlans };
      const pages = buildPdfPages(data, o);
      if (!pages.length) { toast('Er is niets om te exporteren', 'error'); return false; }
      printPages(pages);
    },
  });
}

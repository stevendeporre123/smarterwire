import { h, btn, toast, download } from '../lib/dom';
import { modal } from '../lib/ui';
import { boardsOf, circuitsOf, allDevicesOfProject, type Project } from '../domain/model';
import { buildBom, bomCsv, type BomEntry } from '../domain/bom';
import { getSetting, setSetting } from '../domain/settings';
import { pdfFileName } from '../lib/pdf';

/** Materiaallijst van de nieuwe kast: merk/serie en referentie zijn vrij in te vullen en worden per omschrijving onthouden. */
export async function openBom(project: Project) {
  const [boards, devices, circuits, saved] = await Promise.all([boardsOf(project.id), allDevicesOfProject(project.id), circuitsOf(project.id), getSetting<Record<string, BomEntry>>('bomEntries', {})]);
  const lines = buildBom(boards, devices, circuits);
  if (!lines.length) { toast('Bouw eerst een nieuwe kast op (of voeg toestellen toe aan de nieuwe kast)', 'error'); return; }
  const entries = { ...saved };
  const field = (key: string, prop: 'brand' | 'ref', ph: string) => h('input', { type: 'text', value: entries[key]?.[prop] ?? '', placeholder: ph, style: { width: '100%' },
    onChange: async (e: Event) => { entries[key] = { ...entries[key], [prop]: (e.target as HTMLInputElement).value }; await setSetting('bomEntries', entries); } });
  const groups = ['Beveiliging', 'Kast en toebehoren'] as const;
  const table = h('table', { class: 'table' }, h('thead', null, h('tr', null, ['Aantal', 'Omschrijving', 'Merk / serie', 'Referentie'].map((t) => h('th', null, t)))),
    h('tbody', null, groups.flatMap((g) => [
      h('tr', null, h('td', { colSpan: 4, style: { fontWeight: '600', background: 'var(--color-neutral-50, #f3f5f3)' } }, g)),
      ...lines.filter((l) => l.group === g).map((l) => h('tr', null, h('td', { class: 'right' }, String(l.qty)), h('td', null, l.description, l.est ? h('span', { class: 'hint' }, ' (schatting)') : null), h('td', null, field(l.key, 'brand', 'bv. Hager')), h('td', null, field(l.key, 'ref', 'referentie')))),
    ])));
  modal({
    title: 'Materiaallijst nieuwe kast', wide: true,
    body: h('div', null, h('p', { class: 'hint' }, 'Afgeleid uit de toestellen van de nieuwe kast. Rail, klemmen en labels zijn schattingen. Merk en referentie vul je zelf in; ze blijven bewaard per omschrijving.'), h('div', { class: 'table-scroll' }, table)),
    actions: (close) => [h('span', { class: 'spacer' }),
      btn('CSV downloaden', { icon: 'Download', onClick: () => download(pdfFileName(project.name, 'materiaallijst').replace(/\.pdf$/, '.csv'), bomCsv(lines, entries), 'text/csv;charset=utf-8') }),
      btn('Sluiten', { variant: 'primary', onClick: close })],
  });
}

import { h, btn, icon, download, clear } from '../lib/dom';
import { boardsOf, devicesOf, circuitsOf, type Project } from '../domain/model';
import { buildSingleLineSvg } from '../domain/diagram';
import { supplyOf } from '../domain/devices';
import { sql } from '../db/client';

export async function renderSchema(root: HTMLElement, project: Project) {
  const boards = await boardsOf(project.id);
  if (!boards.length) {
    root.append(h('div', { class: 'page' }, h('div', { class: 'card empty-state' }, icon('Workflow', 40), h('h3', null, 'Nog geen schema'), h('p', null, 'Voeg eerst een zekeringskast toe en documenteer enkele kringen.'))));
    return;
  }
  const circuits = await circuitsOf(project.id);
  const symbols = await sql.query<{ circuit_id: string | null; type: string; label: string | null }>(
    `SELECT s.circuit_id, s.type, s.label FROM symbol s JOIN plan p ON p.id=s.plan_id WHERE s.deleted=0 AND p.deleted=0 AND p.project_id=? ORDER BY p.level, p.name, s.rowid`, [project.id]);
  const kinds: ('bestaand' | 'nieuw')[] = ['bestaand', 'nieuw'];
  let which: 'bestaand' | 'nieuw' = boards.some((b) => b.kind === 'nieuw') ? 'nieuw' : 'bestaand';
  const out = h('div', { class: 'schema-wrap' });
  root.classList.add('page-full'); out.style.flex = '1';

  const sel = h('select', { onChange: (e: Event) => { which = (e.target as HTMLSelectElement).value as any; draw(); } },
    kinds.filter((k) => boards.some((b) => b.kind === k)).map((k) => h('option', { value: k, selected: k === which }, k === 'nieuw' ? '★ Nieuwe toestand (ontwerp)' : 'Bestaande toestand')));
  let current = '';
  async function draw() {
    const bs = boards.filter((b) => b.kind === which);
    const withDevs = await Promise.all(bs.map(async (board) => ({ board, devices: await devicesOf(board.id) })));
    current = buildSingleLineSvg({
      title: `Eendraadschema – ${which === 'nieuw' ? 'nieuwe toestand' : 'bestaande toestand'}`, boards: withDevs, circuits, symbols, which, supply: supplyOf(project), ean: project.ean,
      meta: [project.name, [project.owner, project.address].filter(Boolean).join(' · '), project.inspector ?? '', new Date().toLocaleDateString('nl-BE')].filter(Boolean) as string[],
    });
    clear(out); out.innerHTML = current;
  }
  root.append(h('div', { class: 'toolbar' }, sel, h('span', { class: 'spacer' }),
    btn('SVG', { icon: 'Download', onClick: () => download(`eendraadschema-${which}.svg`, current, 'image/svg+xml') }),
    btn('Afdrukken / PDF', { icon: 'Printer', variant: 'primary', onClick: () => window.print() })), out);
  await draw();
}

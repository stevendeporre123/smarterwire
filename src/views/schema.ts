import { h, btn, icon, download, clear } from '../lib/dom';
import { boardsOf, devicesOf, circuitsOf, type Project } from '../domain/model';
import { buildSingleLineSvg } from '../domain/diagram';

export async function renderSchema(root: HTMLElement, project: Project) {
  const boards = await boardsOf(project.id);
  if (!boards.length) {
    root.append(h('div', { class: 'page' }, h('div', { class: 'card empty-state' }, icon('Workflow', 40), h('h3', null, 'Nog geen schema'), h('p', null, 'Voeg eerst een zekeringskast toe en documenteer enkele kringen.'))));
    return;
  }
  const circuits = await circuitsOf(project.id);
  let idx = Math.max(0, boards.findIndex((b) => b.kind === 'nieuw') >= 0 ? 0 : 0);
  const out = h('div', { class: 'schema-wrap' });
  root.classList.add('page-full'); out.style.flex = '1';

  const sel = h('select', { onChange: (e: Event) => { idx = +(e.target as HTMLSelectElement).value; draw(); } },
    boards.map((b, i) => h('option', { value: i }, `${b.kind === 'nieuw' ? '★ ' : ''}${b.name} (${b.kind})`)));
  let current = '';
  async function draw() {
    const b = boards[idx];
    current = buildSingleLineSvg({
      title: `Eendraadschema – ${b.name}`, devices: await devicesOf(b.id), circuits, which: b.kind,
      meta: [project.name, project.address ?? '', b.kind === 'nieuw' ? 'ontwerp nieuwe kast' : 'bestaande toestand', new Date().toLocaleDateString('nl-BE')].filter(Boolean) as string[],
    });
    clear(out); out.innerHTML = current;
  }
  root.append(h('div', { class: 'toolbar' }, sel, h('span', { class: 'spacer' }),
    btn('SVG', { icon: 'Download', onClick: () => download(`eendraadschema-${boards[idx].name}.svg`, current, 'image/svg+xml') }),
    btn('Afdrukken / PDF', { icon: 'Printer', variant: 'primary', onClick: () => window.print() })), out);
  await draw();
}

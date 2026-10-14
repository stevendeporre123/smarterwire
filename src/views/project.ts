import { h, clear } from '../lib/dom';
import { icon } from '../lib/dom';
import { sql } from '../db/client';
import { topbar } from './shell';
import { renderBoard } from './board';
import { renderCircuits } from './circuits';
import { renderPlan } from './plan';
import { renderSchema } from './schema';
import type { Project } from '../domain/model';

const TABS = [
  { id: 'kast', label: 'Zekeringskast', icon: 'LayoutPanelTop', render: renderBoard },
  { id: 'kringen', label: 'Kringen', icon: 'Cable', render: renderCircuits },
  { id: 'plan', label: 'Situatieplan', icon: 'MapPin', render: renderPlan },
  { id: 'schema', label: 'Eendraadschema', icon: 'Workflow', render: renderSchema },
];

export async function renderProject(app: HTMLElement, id: string, tab: string) {
  const project = await sql.one<Project>('SELECT * FROM project WHERE id=? AND deleted=0', [id]);
  if (!project) { location.hash = '#/'; return; }
  const body = h('div', { class: 'main' });
  app.append(h('div', { class: 'shell' }, topbar(project.name),
    h('nav', { class: 'tabs' }, TABS.map((t) => h('a', { class: `tab ${t.id === tab ? 'active' : ''}`, href: `#/p/${id}/${t.id}` }, icon(t.icon, 16), t.label))),
    body));
  const t = TABS.find((x) => x.id === tab) ?? TABS[0];
  clear(body);
  await t.render(body, project);
}

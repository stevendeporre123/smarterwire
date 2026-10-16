import { h, clear, loading, refreshRoute, btn, toast } from '../lib/dom';
import { exportProject } from '../db/transfer';
import { upsert } from '../db/repo';
import { formModal } from '../lib/ui';
import { projectFields, validateProject } from './projects';
import { icon } from '../lib/dom';
import { q } from '../db/client';
import { topbar } from './shell';
import { renderBoard } from './board';
import { renderCircuits } from './circuits';
import { renderPlan } from './plan';
import { renderSchema } from './schema';
import { renderFindings } from './findings';
import { openPdfExport } from './pdf';
import { ensureCircuits } from '../domain/circuits';
import type { Project } from '../domain/model';

const TABS = [
  { id: 'kast', label: 'Zekeringskast', icon: 'LayoutPanelTop', render: renderBoard },
  { id: 'kringen', label: 'Kringen', icon: 'Cable', render: renderCircuits },
  { id: 'plan', label: 'Situatieplan', icon: 'MapPin', render: renderPlan },
  { id: 'schema', label: 'Eendraadschema', icon: 'Workflow', render: renderSchema },
  { id: 'bevindingen', label: 'Bevindingen', icon: 'ShieldAlert', render: renderFindings },
];

export async function renderProject(app: HTMLElement, id: string, tab: string) {
  const project = (await q<Project>('project', { id }))[0];
  if (!project) { location.hash = '#/'; return; }
  await ensureCircuits(project);
  const body = h('div', { class: 'main' });
  app.append(h('div', { class: 'shell' }, topbar(project.name),
    h('nav', { class: 'tabs' }, TABS.map((t) => h('a', { class: `tab ${t.id === tab ? 'active' : ''}`, href: `#/p/${id}/${t.id}` }, icon(t.icon, 16), t.label)),
      h('span', { class: 'spacer' }),
      btn('PDF', { icon: 'FileDown', variant: 'primary', title: 'Eendraadschema, situatieplannen en lijst van de kringen als PDF', onClick: () => openPdfExport(project) }),
      btn('Exporteer', { icon: 'Download', variant: 'ghost', title: 'Project met foto\'s exporteren (.smarterwire.json)', onClick: () => exportProject(project).catch((e) => toast(e.message, 'error')) }),
      btn('Projectgegevens', { icon: 'FileText', variant: 'ghost', onClick: () => formModal({ title: 'Projectgegevens', fields: projectFields, values: { ...project, supply: project.supply ?? '1x230' }, wide: true,
        onSave: async (v) => { if (!(await validateProject(v))) return false; await upsert('project', { ...project, ...v }); toast('Projectgegevens opgeslagen'); refreshRoute(); } }) })),
    body));
  const t = TABS.find((x) => x.id === tab) ?? TABS[0];
  clear(body);
  await t.render(body, project);
}

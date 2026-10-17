import { h, clear, loading, refreshRoute, btn, toast } from '../lib/dom';
import { exportProject } from '../db/transfer';
import { upsert } from '../db/repo';
import { formModal, menuButton } from '../lib/ui';
import { projectFields, validateProject } from './projects';
import { icon } from '../lib/dom';
import { q } from '../db/client';
import { topbar } from './shell';
import type { MenuItem } from '../lib/ui';
import { renderBoard } from './board';
import { renderCircuits } from './circuits';
import { renderPlan } from './plan';
import { renderSchema } from './schema';
import { renderFindings } from './findings';
import { openPdfExport } from './pdf';
import { ensureCircuits } from '../domain/circuits';
import type { Project } from '../domain/model';

const TABS = [
  { id: 'kast', label: 'Zekeringskast', short: 'Kast', icon: 'LayoutPanelTop', render: renderBoard },
  { id: 'kringen', label: 'Kringen', icon: 'Cable', render: renderCircuits },
  { id: 'plan', label: 'Situatieplan', short: 'Plan', icon: 'MapPin', render: renderPlan },
  { id: 'schema', label: 'Eendraadschema', short: 'Schema', icon: 'Workflow', render: renderSchema },
  { id: 'bevindingen', label: 'Bevindingen', icon: 'ShieldAlert', render: renderFindings },
];

export async function renderProject(app: HTMLElement, id: string, tab: string) {
  const project = (await q<Project>('project', { id }))[0];
  if (!project) { location.hash = '#/'; return; }
  await ensureCircuits(project);
  const body = h('div', { class: 'main' });
  const projectItems: MenuItem[] = [
    { label: 'PDF exporteren', icon: 'FileDown', cls: 'only-sm', onClick: () => openPdfExport(project) },
    { label: 'Projectgegevens', icon: 'FileText', onClick: () => formModal({ title: 'Projectgegevens', fields: projectFields, values: { ...project, supply: project.supply ?? '1x230' }, wide: true,
      onSave: async (v) => { if (!(await validateProject(v))) return false; await upsert('project', { ...project, ...v }); toast('Projectgegevens opgeslagen'); refreshRoute(); } }) },
    { label: 'Project exporteren (met foto\'s)', icon: 'Download', onClick: () => exportProject(project).catch((e) => toast(e.message, 'error')) },
  ];
  // op een gsm: tabbalk onderaan (icoon + naam), projectacties in een menu bovenaan
  const pdfBtn = btn('PDF', { icon: 'FileDown', variant: 'primary', title: 'Eendraadschema, situatieplannen en lijst van de kringen als PDF', onClick: () => openPdfExport(project) });
  const tabs = h('nav', { class: 'tabs', 'aria-label': 'Onderdelen van het project' },
    TABS.map((t) => h('a', { class: `tab ${t.id === tab ? 'active' : ''}`, href: `#/p/${id}/${t.id}`, title: t.label, 'aria-current': t.id === tab ? 'page' : null }, icon(t.icon, 20), h('span', { class: 'tab-label' }, h('span', { class: 'full' }, t.label), h('span', { class: 'short' }, (t as any).short ?? t.label)))),
    h('span', { class: 'spacer' }),
    h('span', { class: 'tabs-actions' }, pdfBtn, menuButton({ title: 'Meer: projectgegevens, project exporteren' }, projectItems.filter((i) => !i.cls))));
  const projectMenu = h('span', { class: 'only-sm' }, menuButton({ title: 'Project: PDF, gegevens, exporteren' }, projectItems));
  app.append(h('div', { class: 'shell has-tabs' }, topbar(project.name, projectMenu), tabs, body));
  const t = TABS.find((x) => x.id === tab) ?? TABS[0];
  clear(body);
  await t.render(body, project);
}

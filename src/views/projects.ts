import { h, btn, icon, toast } from '../lib/dom';
import { dataTable, formModal } from '../lib/ui';
import { sql } from '../db/client';
import { exportProject, importProject } from '../db/transfer';
import { upsert } from '../db/repo';
import { topbar } from './shell';
import type { Project } from '../domain/model';

import { INSPECTORS, INSPECTOR_PRESETS, SUPPLIES } from '../domain/devices';

export const projectFields = [
  { key: 'name', label: 'Projectnaam', required: true, span: 2 as const },
  { key: 'owner', label: 'Naam eigenaar (plaats van de installatie)', span: 2 as const },
  { key: 'address', label: 'Adres installatie', type: 'textarea' as const, placeholder: 'Straat en nummer\npostcode gemeente', span: 2 as const },
  { key: 'client', label: 'Opdrachtgever' },
  { key: 'ean', label: 'EAN-code meter', placeholder: '18 cijfers (541…)' },
  { key: 'supply', label: 'Voeding *', type: 'select' as const, options: SUPPLIES, allowEmpty: false },
  { key: 'supply_amp', label: 'Voeding (A)', type: 'number' as const, placeholder: 'bv. 20' },
  { key: 'supply_cable', label: 'Voedingskabel', placeholder: 'bv. XVB Cca 4x10' },
  { key: 'inspector', label: 'Keuringsinstelling', list: INSPECTORS },
  { key: 'inspector_info', label: 'Adres en contact keuringsinstelling', type: 'textarea' as const, placeholder: 'Straat en nummer\npostcode gemeente\nondernemingsnummer…', span: 2 as const },
  { key: 'notes', label: 'Notities', type: 'textarea' as const, span: 2 as const },
];

/** Valideert EAN en toont fout; geeft false terug als de gebruiker moet bijsturen. */
export function validateProject(v: Record<string, any>): boolean {
  if (!v.name) return false;
  if (v.inspector && !v.inspector_info && INSPECTOR_PRESETS[v.inspector]) v.inspector_info = INSPECTOR_PRESETS[v.inspector];
  if (v.ean) { v.ean = String(v.ean).replace(/\s/g, ''); if (!/^\d{18}$/.test(v.ean)) { alert('Een EAN-code bestaat uit 18 cijfers.'); return false; } }
  return true;
}

export async function renderProjects(app: HTMLElement) {
  const rows = await sql.query<Project & { circuits: number; boards: number; done: number }>(`
    SELECT p.*,
      (SELECT COUNT(*) FROM board b WHERE b.project_id=p.id AND b.deleted=0) boards,
      (SELECT COUNT(*) FROM circuit c WHERE c.project_id=p.id AND c.deleted=0) circuits,
      (SELECT COUNT(*) FROM circuit c WHERE c.project_id=p.id AND c.deleted=0 AND c.status!='onbekend') done
    FROM project p WHERE p.deleted=0 ORDER BY p.updated_at DESC`);

  const open = (p: Project) => { location.hash = `#/p/${p.id}/kast`; };
  const edit = (p?: Project) => formModal({
    title: p ? 'Project bewerken' : 'Nieuw project', fields: projectFields, values: { ...(p ?? {}), supply: p?.supply ?? '1x230' }, wide: true,
    onSave: async (v) => {
      if (!validateProject(v)) return false;
      const saved = await upsert('project', { ...(p ?? {}), ...v });
      if (!p) open(saved as any); else location.reload();
    },
    onDelete: p ? async () => { await sql.run('UPDATE project SET deleted=1, updated_at=? WHERE id=?', [Date.now(), p.id]); location.reload(); } : undefined,
  });

  app.append(h('div', { class: 'shell' }, topbar(),
    h('div', { class: 'main' }, h('div', { class: 'page' },
      h('div', { class: 'page-head' }, h('h2', null, 'Projecten'), h('span', { class: 'spacer' }),
        btn('Importeer project', { icon: 'Upload', variant: 'secondary', title: 'Project (.smarterwire.json) importeren', onClick: () => importProject(() => location.reload()) }),
        btn('Nieuw project', { icon: 'Plus', variant: 'primary', onClick: () => edit() })),
      rows.length ? dataTable({
        rows, onRow: open, search: (r) => `${r.name} ${r.address} ${r.owner} ${r.ean}`,
        columns: [
          { key: 'name', label: 'Project', render: (r) => h('strong', null, r.name) },
          { key: 'address', label: 'Adres' },
          { key: 'owner', label: 'Eigenaar' },
          { key: 'boards', label: 'Kasten', align: 'right' },
          { key: 'circuits', label: 'Kringen', align: 'right', render: (r) => (r.circuits ? `${r.done}/${r.circuits}` : '—') },
          { key: 'updated_at', label: 'Gewijzigd', render: (r) => new Date(r.updated_at).toLocaleDateString('nl-BE'), sort: (r) => r.updated_at },
          { key: 'e', label: '', width: '80px', render: (r) => h('span', null,
            btn('', { icon: 'Download', variant: 'ghost', title: 'Project exporteren', onClick: (e) => { e.stopPropagation(); exportProject(r).catch((x) => toast(x.message, 'error')); } }),
            btn('', { icon: 'Pencil', variant: 'ghost', onClick: (e) => { e.stopPropagation(); edit(r); } })) },
        ],
      }) : h('div', { class: 'card empty-state' }, icon('ClipboardList', 40), h('h3', null, 'Nog geen projecten'),
        h('p', null, 'Start met een keuring: maak een project en voeg een foto van de zekeringskast toe.'),
        btn('Nieuw project', { icon: 'Plus', variant: 'primary', onClick: () => edit() })),
    ))));
}

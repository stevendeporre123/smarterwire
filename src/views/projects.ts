import { h, btn, icon } from '../lib/dom';
import { dataTable, formModal, badge } from '../lib/ui';
import { sql } from '../db/client';
import { upsert } from '../db/repo';
import { topbar } from './shell';
import type { Project } from '../domain/model';

import { INSPECTORS, SUPPLIES } from '../domain/devices';

export const projectFields = [
  { key: 'name', label: 'Projectnaam', required: true, span: 2 as const },
  { key: 'address', label: 'Adres installatie', span: 2 as const },
  { key: 'owner', label: 'Naam eigenaar' },
  { key: 'client', label: 'Opdrachtgever' },
  { key: 'ean', label: 'EAN-code meter', placeholder: '18 cijfers (541…)' },
  { key: 'supply', label: 'Voeding', type: 'select' as const, options: SUPPLIES },
  { key: 'inspector', label: 'Keuringsinstantie', list: INSPECTORS, span: 2 as const },
  { key: 'notes', label: 'Notities', type: 'textarea' as const, span: 2 as const },
];

/** Valideert EAN en toont fout; geeft false terug als de gebruiker moet bijsturen. */
export function validateProject(v: Record<string, any>): boolean {
  if (!v.name) return false;
  if (v.ean) { v.ean = String(v.ean).replace(/\s/g, ''); if (!/^\d{18}$/.test(v.ean)) { alert('Een EAN-code bestaat uit 18 cijfers.'); return false; } }
  return true;
}

export async function renderProjects(app: HTMLElement) {
  const info = await sql.info();
  const rows = await sql.query<Project & { circuits: number; boards: number; done: number }>(`
    SELECT p.*,
      (SELECT COUNT(*) FROM board b WHERE b.project_id=p.id AND b.deleted=0) boards,
      (SELECT COUNT(*) FROM circuit c WHERE c.project_id=p.id AND c.deleted=0) circuits,
      (SELECT COUNT(*) FROM circuit c WHERE c.project_id=p.id AND c.deleted=0 AND c.status!='onbekend') done
    FROM project p WHERE p.deleted=0 ORDER BY p.updated_at DESC`);

  const open = (p: Project) => { location.hash = `#/p/${p.id}/kast`; };
  const edit = (p?: Project) => formModal({
    title: p ? 'Project bewerken' : 'Nieuw project', fields: projectFields, values: p ?? {}, wide: true,
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
        !info.persistent && badge('Tijdelijke opslag – OPFS niet beschikbaar', 'err'),
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
          { key: 'e', label: '', width: '40px', render: (r) => btn('', { icon: 'Pencil', variant: 'ghost', onClick: (e) => { e.stopPropagation(); edit(r); } }) },
        ],
      }) : h('div', { class: 'card empty-state' }, icon('ClipboardList', 40), h('h3', null, 'Nog geen projecten'),
        h('p', null, 'Start met een keuring: maak een project en voeg een foto van de zekeringskast toe.'),
        btn('Nieuw project', { icon: 'Plus', variant: 'primary', onClick: () => edit() })),
    ))));
}

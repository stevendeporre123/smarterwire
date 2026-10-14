import { h, btn, icon, clear } from './dom';

// ---------- formulier ----------
export type FieldDef = {
  key: string; label: string;
  type?: 'text' | 'number' | 'select' | 'textarea' | 'checkbox';
  options?: (string | number | { value: string | number; label: string })[];
  allowEmpty?: boolean; placeholder?: string; step?: number; required?: boolean; span?: 1 | 2; list?: string[]; numeric?: boolean;
};

export function buildForm(fields: FieldDef[], values: Record<string, any>) {
  const inputs: Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = {};
  const wrap = h('div', { class: 'form-grid' });
  for (const f of fields) {
    let input: any;
    const v = values[f.key];
    if (f.type === 'select') {
      input = h('select', null,
        f.allowEmpty !== false && h('option', { value: '' }, '—'),
        (f.options ?? []).map((o) => {
          const val = typeof o === 'object' ? o.value : o, lab = typeof o === 'object' ? o.label : o;
          return h('option', { value: String(val), selected: String(v ?? '') === String(val) }, String(lab));
        }));
    } else if (f.type === 'textarea') {
      input = h('textarea', { rows: 3, placeholder: f.placeholder }, v ?? '');
    } else if (f.type === 'checkbox') {
      input = h('input', { type: 'checkbox', checked: !!v });
    } else {
      input = h('input', { type: f.type ?? 'text', value: v ?? '', placeholder: f.placeholder, step: f.step ?? (f.type === 'number' ? 'any' : undefined), required: f.required });
      if (f.list) {
        const id = `dl-${f.key}-${Math.random().toString(36).slice(2, 6)}`;
        input.setAttribute('list', id);
        wrap.appendChild(h('datalist', { id }, f.list.map((o) => h('option', { value: o }))));
      }
    }
    inputs[f.key] = input;
    wrap.appendChild(h('label', { class: `field ${f.span === 2 ? 'span-2' : ''} ${f.type === 'checkbox' ? 'field-check' : ''}` },
      h('span', { class: 'field-label' }, f.label), input));
  }
  const read = () => {
    const out: Record<string, any> = {};
    for (const f of fields) {
      const el: any = inputs[f.key];
      if (f.type === 'checkbox') out[f.key] = el.checked ? 1 : 0;
      else if (f.type === 'number' || (f.type === 'select' && f.numeric)) out[f.key] = el.value === '' ? null : Number(el.value);
      else out[f.key] = el.value === '' ? null : el.value;
    }
    return out;
  };
  return { el: wrap, read, inputs };
}

// ---------- modal ----------
export function modal(opts: { title: string; body: HTMLElement; actions: (close: () => void) => HTMLElement[]; wide?: boolean }) {
  const dlg = h('dialog', { class: `modal ${opts.wide ? 'modal-wide' : ''}` });
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.append(
    h('header', { class: 'modal-head' }, h('h3', null, opts.title), btn('', { icon: 'X', variant: 'ghost', onClick: close, title: 'Sluiten' })),
    h('div', { class: 'modal-body' }, opts.body),
    h('footer', { class: 'modal-foot' }, ...opts.actions(close)),
  );
  dlg.addEventListener('cancel', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  return close;
}

export function formModal(opts: {
  title: string; fields: FieldDef[]; values: Record<string, any>;
  onSave: (v: Record<string, any>) => Promise<void | false> | void | false;
  onDelete?: () => Promise<void> | void; wide?: boolean; extra?: HTMLElement;
}) {
  const form = buildForm(opts.fields, opts.values);
  const body = h('div', null, form.el, opts.extra);
  modal({
    title: opts.title, body, wide: opts.wide,
    actions: (close) => [
      opts.onDelete ? btn('Verwijderen', { icon: 'Trash2', variant: 'danger', onClick: async () => { if (confirm('Zeker verwijderen?')) { await opts.onDelete!(); close(); } } }) : h('span'),
      h('span', { class: 'spacer' }),
      btn('Annuleren', { variant: 'ghost', onClick: close }),
      btn('Opslaan', { icon: 'Check', variant: 'primary', onClick: async () => { if ((await opts.onSave(form.read())) !== false) close(); } }),
    ],
  });
  return form;
}

// ---------- tabel met zoek & sorteer ----------
export type Col<T> = { key: string; label: string; render?: (r: T) => Node | string; sort?: (r: T) => string | number; width?: string; align?: 'right' };

export function dataTable<T extends { id: string }>(opts: {
  columns: Col<T>[]; rows: T[]; onRow?: (r: T) => void; selectedId?: string | null; search?: (r: T) => string; empty?: string; rowClass?: (r: T) => string;
}) {
  let sortKey: string | null = null, dir = 1, q = '';
  const input = h('input', { type: 'search', class: 'table-search', placeholder: 'Zoeken…', onInput: (e: Event) => { q = (e.target as HTMLInputElement).value.toLowerCase(); draw(); } });
  const tbody = h('tbody');
  const thead = h('thead', null, h('tr', null, opts.columns.map((c) =>
    h('th', { class: c.align === 'right' ? 'right' : '', style: c.width ? { width: c.width } : undefined, onClick: () => { if (sortKey === c.key) dir = -dir; else { sortKey = c.key; dir = 1; } draw(); } }, c.label))));
  const table = h('table', { class: 'table' }, thead, tbody);
  const root = h('div', { class: 'table-wrap' }, opts.search ? h('div', { class: 'table-tools' }, icon('Search', 16), input) : null, h('div', { class: 'table-scroll' }, table));
  function draw() {
    let rows = opts.rows.slice();
    if (q && opts.search) rows = rows.filter((r) => opts.search!(r).toLowerCase().includes(q));
    const col = opts.columns.find((c) => c.key === sortKey);
    if (col) {
      const f = col.sort ?? ((r: T) => (r as any)[col.key] ?? '');
      rows.sort((a, b) => { const x = f(a), y = f(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'nl', { numeric: true })) * dir; });
    }
    clear(tbody);
    if (!rows.length) tbody.appendChild(h('tr', null, h('td', { colSpan: opts.columns.length, class: 'empty' }, opts.empty ?? 'Geen gegevens')));
    for (const r of rows) {
      tbody.appendChild(h('tr', { class: `${opts.onRow ? 'clickable' : ''} ${opts.selectedId === r.id ? 'selected' : ''} ${opts.rowClass?.(r) ?? ''}`, onClick: () => opts.onRow?.(r) },
        opts.columns.map((c) => h('td', { class: c.align === 'right' ? 'right' : '' }, c.render ? c.render(r) : String((r as any)[c.key] ?? '')))));
    }
  }
  draw();
  return root;
}

export const badge = (text: string, kind: 'ok' | 'warn' | 'err' | 'muted' | 'info' = 'muted') => h('span', { class: `badge badge-${kind}` }, text);

// ---------- pan & zoom voor SVG ----------
export function panZoom(svgEl: SVGSVGElement, w: number, h_: number) {
  let vb = { x: 0, y: 0, w, h: h_ };
  const apply = () => svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  apply();
  const toSvg = (cx: number, cy: number) => {
    const r = svgEl.getBoundingClientRect();
    // preserveAspectRatio = xMidYMid meet
    const s = Math.min(r.width / vb.w, r.height / vb.h);
    const ox = (r.width - vb.w * s) / 2, oy = (r.height - vb.h * s) / 2;
    return { x: vb.x + (cx - r.left - ox) / s, y: vb.y + (cy - r.top - oy) / s, s };
  };
  svgEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = toSvg(e.clientX, e.clientY);
    const k = e.deltaY < 0 ? 0.85 : 1 / 0.85;
    const nw = Math.min(w * 4, Math.max(w / 20, vb.w * k)), kk = nw / vb.w;
    vb = { x: p.x - (p.x - vb.x) * kk, y: p.y - (p.y - vb.y) * kk, w: nw, h: vb.h * kk };
    apply();
  }, { passive: false });
  // pannen: middelste muisknop, of spatie + slepen
  let panning: { sx: number; sy: number; vx: number; vy: number; s: number } | null = null;
  let space = false;
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !(e.target as HTMLElement).matches('input,textarea,select')) { space = true; svgEl.classList.add('panning'); } });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') { space = false; svgEl.classList.remove('panning'); } });
  svgEl.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || (space && e.button === 0)) {
      e.preventDefault(); e.stopPropagation();
      panning = { sx: e.clientX, sy: e.clientY, vx: vb.x, vy: vb.y, s: toSvg(0, 0).s };
      svgEl.setPointerCapture(e.pointerId);
    }
  }, true);
  svgEl.addEventListener('pointermove', (e) => {
    if (!panning) return;
    vb.x = panning.vx - (e.clientX - panning.sx) / panning.s;
    vb.y = panning.vy - (e.clientY - panning.sy) / panning.s;
    apply();
  });
  svgEl.addEventListener('pointerup', () => { panning = null; });
  return {
    toSvg: (cx: number, cy: number) => toSvg(cx, cy),
    reset: () => { vb = { x: 0, y: 0, w, h: h_ }; apply(); },
  };
}

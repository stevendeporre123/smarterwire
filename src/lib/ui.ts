import { h, btn, icon, clear } from './dom';

// ---------- formulier ----------
export type FieldDef = {
  key: string; label: string;
  type?: 'text' | 'number' | 'select' | 'textarea' | 'checkbox' | 'password' | 'date';
  options?: (string | number | { value: string | number; label: string })[];
  allowEmpty?: boolean; advanced?: boolean; placeholder?: string; step?: number; required?: boolean; span?: 1 | 2; list?: string[]; numeric?: boolean;
};

export function buildForm(fields: FieldDef[], values: Record<string, any>) {
  const inputs: Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = {};
  const wrap = h('div', { class: 'form-grid' });
  const advGrid = h('div', { class: 'form-grid' });
  const adv = h('details', { class: 'adv' }, h('summary', null, 'Meer opties'), advGrid);
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
    (f.advanced ? advGrid : wrap).appendChild(h('label', { class: `field ${f.span === 2 ? 'span-2' : ''} ${f.type === 'checkbox' ? 'field-check' : ''}` },
      h('span', { class: 'field-label' }, f.label), input));
  }
  const el = h('div', null, wrap, fields.some((f) => f.advanced) ? adv : null);
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
  return { el, read, inputs };
}

// ---------- modal ----------
export function modal(opts: { title: string; body: HTMLElement; actions: (close: () => void) => HTMLElement[]; wide?: boolean; onClose?: () => void }) {
  const dlg = h('dialog', { class: `modal ${opts.wide ? 'modal-wide' : ''}` });
  const close = () => { dlg.close(); dlg.remove(); opts.onClose?.(); };
  dlg.append(
    h('header', { class: 'modal-head' }, h('h3', null, opts.title), btn('', { icon: 'X', variant: 'ghost', onClick: close, title: 'Sluiten' })),
    h('div', { class: 'modal-body' }, opts.body),
    h('footer', { class: 'modal-foot' }, ...opts.actions(close)),
  );
  dlg.addEventListener('cancel', () => { dlg.remove(); opts.onClose?.(); });
  document.body.appendChild(dlg);
  dlg.showModal();
  return close;
}

// ---------- dialogen (vervangen alert / confirm / prompt) ----------
const message = (m: string | Node) => h('p', { style: { margin: 0, whiteSpace: 'pre-line' } }, m);
const spacer = () => h('span', { class: 'spacer' });

/** Vraagt tussen meerdere acties; geeft de gekozen sleutel terug, of null bij annuleren (knop, X of Esc). */
export function choose(title: string, text: string | Node, options: { key: string; label: string; variant: 'primary' | 'danger' | 'secondary' }[]): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | null, close?: () => void) => { if (done) return; done = true; close?.(); resolve(v); };
    modal({ title, body: message(text), onClose: () => finish(null), actions: (close) => {
      const cancel = btn('Annuleren', { variant: 'ghost', onClick: () => finish(null, close) });
      cancel.autofocus = true;   // veilige standaard: Enter verwijdert niets per ongeluk
      return [spacer(), cancel, ...options.map((o) => btn(o.label, { variant: o.variant, onClick: () => finish(o.key, close) }))];
    } });
  });
}

/** Ja/nee-vraag. Geeft false bij annuleren, X of Esc. */
export async function confirmDialog(o: { title: string; message: string | Node; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return (await choose(o.title, o.message, [{ key: 'ok', label: o.confirmLabel ?? 'Verwijderen', variant: o.danger === false ? 'primary' : 'danger' }])) === 'ok';
}

/** Melding met één knop. */
export function alertDialog(title: string, text: string | Node): Promise<void> {
  return new Promise((resolve) => {
    modal({ title, body: message(text), onClose: () => resolve(), actions: (close) => { const ok = btn('OK', { variant: 'primary', onClick: close }); ok.autofocus = true; return [spacer(), ok]; } });
  });
}

/** Vraagt één waarde. Geeft null bij annuleren; Enter bevestigt. */
export function promptDialog(o: { title: string; label?: string; value?: string; placeholder?: string; confirmLabel?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | null, close?: () => void) => { if (done) return; done = true; close?.(); resolve(v); };
    const input = h('input', { type: 'text', value: o.value ?? '', placeholder: o.placeholder, style: { width: '100%' } }) as HTMLInputElement;
    let closeFn: (() => void) | undefined;
    const ok = () => finish(input.value.trim(), closeFn);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    closeFn = modal({
      title: o.title, onClose: () => finish(null),
      body: h('label', { class: 'field' }, o.label ? h('span', { class: 'field-label' }, o.label) : null, input),
      actions: (close) => [spacer(), btn('Annuleren', { variant: 'ghost', onClick: () => finish(null, close) }), btn(o.confirmLabel ?? 'OK', { icon: 'Check', variant: 'primary', onClick: ok })],
    });
    input.focus(); input.select();
  });
}

export function formModal(opts: {
  title: string; fields: FieldDef[]; values: Record<string, any>;
  onSave: (v: Record<string, any>) => Promise<void | false> | void | false;
  onDelete?: () => Promise<void> | void; wide?: boolean; extra?: HTMLElement; saveLabel?: string;
  /** Tweede opslaan-knop (bv. "Opslaan & volgende"): bewaart via `onSave`, sluit en roept daarna dit aan met de opgeslagen waarden. */
  saveNext?: { label: string; then: (v: Record<string, any>) => void };
}) {
  const form = buildForm(opts.fields, opts.values);
  const body = h('div', null, form.el, opts.extra);
  modal({
    title: opts.title, body, wide: opts.wide,
    actions: (close) => [
      opts.onDelete ? btn('Verwijderen', { icon: 'Trash2', variant: 'danger', onClick: async () => { if (await confirmDialog({ title: 'Verwijderen', message: 'Zeker verwijderen?' })) { await opts.onDelete!(); close(); } } }) : h('span'),
      h('span', { class: 'spacer' }),
      btn('Annuleren', { variant: 'ghost', onClick: close }),
      ...(opts.saveNext ? [btn(opts.saveNext.label, { icon: 'ChevronsRight', variant: 'secondary', onClick: async () => { const v = form.read(); if ((await opts.onSave(v)) !== false) { close(); opts.saveNext!.then(v); } } })] : []),
      btn(opts.saveLabel ?? 'Opslaan', { icon: 'Check', variant: 'primary', onClick: async () => { if ((await opts.onSave(form.read())) !== false) close(); } }),
    ],
  });
  return form;
}

// ---------- uitklapmenu (⋯) ----------
export interface MenuItem { label: string; icon?: string; danger?: boolean; header?: boolean; /** extra CSS-klasse, bv. 'only-sm' = enkel in het menu op smalle schermen */ cls?: string; onClick?: () => void }
/** Knop met uitklapmenu. Het menu is vast gepositioneerd, zodat het niet afgeknipt wordt door scrollende balken. */
export function menuButton(o: { icon?: string; label?: string; title?: string; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' }, items: MenuItem[]) {
  const pop = h('div', { class: 'menu-pop', role: 'menu' });
  pop.hidden = true;
  const close = () => { pop.hidden = true; document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true); };
  const away = (e: Event) => { if (!wrap.contains(e.target as Node)) close(); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  const trigger = btn(o.label ?? '', { icon: o.icon ?? 'Ellipsis', variant: o.variant ?? 'ghost', title: o.title, onClick: () => {
    if (!pop.hidden) { close(); return; }
    pop.hidden = false;
    const r = trigger.getBoundingClientRect();
    pop.style.top = `${r.bottom + 4}px`; pop.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
    document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key, true);
  } });
  for (const it of items) {
    pop.append(it.header ? h('div', { class: 'menu-head' }, it.label)
      : h('button', { type: 'button', role: 'menuitem', class: `menu-item ${it.danger ? 'danger' : ''} ${it.cls ?? ''}`, onClick: () => { close(); it.onClick?.(); } }, it.icon ? icon(it.icon, 16) : null, it.label));
  }
  const wrap = h('span', { class: 'menu' }, trigger, pop);
  return wrap;
}

/** Op gsm en smalle tablet is het palet verborgen; deze knop (enkel daar zichtbaar) toont het als blad over de tekening. */
export function palToggle(split: HTMLElement) {
  const b = btn('Symbolen', { icon: 'Shapes', variant: 'secondary', title: 'Symbolen en gereedschap tonen of verbergen', onClick: () => b.classList.toggle('active', split.classList.toggle('pal-open')) });
  b.classList.add('only-md');
  return b;
}

// ---------- tabel met zoek & sorteer ----------
/** `cls: 'hide-sm'` verbergt de kolom op een gsm; `primary` = hoofdtekst van de kaart op een gsm (volle breedte, zonder label). */
export type Col<T> = { key: string; label: string; render?: (r: T) => Node | string; sort?: (r: T) => string | number; width?: string; align?: 'right'; cls?: string; primary?: boolean };

export function dataTable<T extends { id: string }>(opts: {
  columns: Col<T>[]; rows: T[]; onRow?: (r: T) => void; selectedId?: string | null; search?: (r: T) => string; empty?: string; rowClass?: (r: T) => string;
  /** vinkjes per rij; de set wordt door de tabel bijgehouden en `onSelect` meldt elke wijziging */
  selection?: Set<string>; onSelect?: () => void;
}) {
  let sortKey: string | null = null, dir = 1, q = '';
  const input = h('input', { type: 'search', class: 'table-search', placeholder: 'Zoeken…', onInput: (e: Event) => { q = (e.target as HTMLInputElement).value.toLowerCase(); draw(); } });
  const tbody = h('tbody');
  const sel = opts.selection, visible: T[] = [];
  const selAll = h('input', { type: 'checkbox', title: 'Alles (zichtbaar) selecteren', onChange: (e: Event) => { const on = (e.target as HTMLInputElement).checked; visible.forEach((r) => (on ? sel!.add(r.id) : sel!.delete(r.id))); opts.onSelect?.(); draw(); } }) as HTMLInputElement;
  const thead = h('thead', null, h('tr', null, sel ? h('th', { style: { width: '34px' } }, selAll) : null, opts.columns.map((c) =>
    h('th', { class: `${c.align === 'right' ? 'right' : ''} ${c.cls ?? ''}`, style: c.width ? { width: c.width } : undefined, onClick: () => { if (sortKey === c.key) dir = -dir; else { sortKey = c.key; dir = 1; } draw(); } }, c.label))));
  const table = h('table', { class: 'table cards-sm' }, thead, tbody);
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
    visible.length = 0; visible.push(...rows);
    if (sel) { selAll.checked = rows.length > 0 && rows.every((r) => sel.has(r.id)); selAll.indeterminate = !selAll.checked && rows.some((r) => sel.has(r.id)); }
    if (!rows.length) tbody.appendChild(h('tr', null, h('td', { colSpan: opts.columns.length, class: 'empty' }, opts.empty ?? 'Geen gegevens')));
    for (const r of rows) {
      tbody.appendChild(h('tr', { class: `${opts.onRow ? 'clickable' : ''} ${opts.selectedId === r.id ? 'selected' : ''} ${opts.rowClass?.(r) ?? ''}`, onClick: () => opts.onRow?.(r) },
        sel ? h('td', { onClick: (e: Event) => e.stopPropagation() }, h('input', { type: 'checkbox', checked: sel.has(r.id), onChange: (e: Event) => { if ((e.target as HTMLInputElement).checked) sel.add(r.id); else sel.delete(r.id); opts.onSelect?.(); draw(); } })) : null,
        opts.columns.map((c) => h('td', { class: `${c.align === 'right' ? 'right' : ''} ${c.cls ?? ''} ${c.primary ? 'primary' : ''}`, 'data-label': c.label }, c.render ? c.render(r) : String((r as any)[c.key] ?? '')))));
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
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !(e.target as HTMLElement).matches?.('input,textarea,select')) { space = true; svgEl.classList.add('panning'); } });
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

  // aanraking: twee vingers = zoomen en verschuiven (één vinger blijft voor tekenen/selecteren)
  const fingers = new Map<number, { x: number; y: number }>();
  let pinch: { d0: number; vb0: typeof vb; p0: { x: number; y: number }; s0: number } | null = null, quiet = false;
  const two = () => { const [a, b] = [...fingers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; };
  svgEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2) {
      const t = two(), p = toSvg(t.cx, t.cy);
      pinch = { d0: t.d, vb0: { ...vb }, p0: { x: p.x, y: p.y }, s0: p.s }; quiet = true;
      e.stopImmediatePropagation(); e.preventDefault();
      svgEl.dispatchEvent(new Event('pz-gesture'));   // laat een begonnen kader of verplaatsing vallen
    } else if (fingers.size > 2) { e.stopImmediatePropagation(); }
  }, true);
  svgEl.addEventListener('pointermove', (e) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!quiet) return;
    e.stopImmediatePropagation();
    if (!pinch || fingers.size !== 2) return;
    const t = two(), k = Math.min(Math.max(t.d / pinch.d0, 0.05), 20);
    const nw = Math.min(w * 4, Math.max(w / 20, pinch.vb0.w / k)), f = nw / pinch.vb0.w;
    vb = { x: vb.x, y: vb.y, w: nw, h: pinch.vb0.h * f };
    const q = toSvg(t.cx, t.cy);            // houd het punt onder je vingers op dezelfde plaats
    vb.x += pinch.p0.x - q.x; vb.y += pinch.p0.y - q.y;
    apply();
  }, true);
  const lift = (e: PointerEvent) => {
    if (!fingers.delete(e.pointerId)) return;
    if (quiet) e.stopImmediatePropagation();
    if (fingers.size < 2) pinch = null;
    if (!fingers.size) quiet = false;       // pas weer tekenen als alle vingers los zijn
  };
  svgEl.addEventListener('pointerup', lift, true); svgEl.addEventListener('pointercancel', lift, true);
  return {
    toSvg: (cx: number, cy: number) => toSvg(cx, cy),
    reset: () => { vb = { x: 0, y: 0, w, h: h_ }; apply(); },
    /** Zoom op een rechthoek (met wat marge). */
    fit: (b: { x: number; y: number; w: number; h: number }) => { const pad = Math.max(b.w, b.h) * 0.08; vb = { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad }; apply(); },
  };
}

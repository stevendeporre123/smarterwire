import { createElement as lucide } from 'lucide';
import * as L from 'lucide';

type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, any>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}

function append(el: Node, kids: Child[]) {
  for (const k of kids) {
    if (Array.isArray(k)) append(el, k);
    else if (k == null || k === false) continue;
    else el.appendChild(typeof k === 'object' ? k : document.createTextNode(String(k)));
  }
}

export const clear = (el: Element) => { while (el.firstChild) el.removeChild(el.firstChild); };

export function icon(name: string, size = 16): SVGElement {
  const node = (L.icons as any)[name];
  const el = node ? lucide(node) : lucide((L.icons as any).Circle);
  el.setAttribute('width', String(size)); el.setAttribute('height', String(size));
  return el as SVGElement;
}

export function btn(label: string, opts: { icon?: string; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'; onClick?: (e: Event) => void; title?: string; type?: string } = {}) {
  return h('button', { class: `btn btn-${opts.variant ?? 'secondary'}`, type: opts.type ?? 'button', title: opts.title, onClick: opts.onClick },
    opts.icon && icon(opts.icon, 16), label && h('span', null, label));
}

export const SVGNS = 'http://www.w3.org/2000/svg';
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, String(v));
  }
  append(el, kids);
  return el;
}

export function toast(msg: string, kind: 'ok' | 'error' = 'ok') {
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

export function download(name: string, data: BlobPart, mime: string) {
  const a = h('a', { href: URL.createObjectURL(new Blob([data], { type: mime })), download: name });
  document.body.appendChild(a); a.click(); a.remove();
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

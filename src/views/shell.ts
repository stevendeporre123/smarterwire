import { h, icon, btn, download, toast } from '../lib/dom';
import { sql } from '../db/client';

export function topbar(crumb?: string) {
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark' }, icon('Zap', 18)), h('span', null, 'smarter', h('b', null, 'wire'))),
    crumb && h('div', { class: 'crumb' }, icon('ChevronRight', 14), h('strong', null, crumb)),
    h('span', { class: 'spacer' }),
    btn('Back-up', { icon: 'Download', variant: 'ghost', title: 'Volledige database exporteren (.sqlite)', onClick: exportDb }),
    btn('Herstel', { icon: 'Upload', variant: 'ghost', title: 'Database importeren (overschrijft alles)', onClick: importDb }),
  );
}

async function exportDb() {
  const bytes = await sql.exportDb();
  download(`smarterwire-${new Date().toISOString().slice(0, 10)}.sqlite3`, bytes as BlobPart, 'application/vnd.sqlite3');
}

function importDb() {
  const inp = h('input', { type: 'file', accept: '.sqlite3,.sqlite,.db' }) as HTMLInputElement;
  inp.onchange = async () => {
    const f = inp.files?.[0];
    if (!f || !confirm('Alle huidige gegevens worden vervangen door dit bestand. Doorgaan?')) return;
    try { await sql.importDb(new Uint8Array(await f.arrayBuffer())); toast('Database hersteld'); location.hash = '#/'; location.reload(); }
    catch (e: any) { toast(e.message, 'error'); }
  };
  inp.click();
}

// Project exporteren/importeren (JSON incl. foto's): zo verhuis je een project tussen omgevingen (lokaal ↔ productie) of toestellen.
import { download, h, toast } from '../lib/dom';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

export async function exportProject(p: { id: string; name: string }) {
  const r = await fetch(`/api/project/${p.id}/export`);
  if (!r.ok) throw new Error(`Exporteren mislukt (${r.status})`);
  download(`${slug(p.name)}-${new Date().toISOString().slice(0, 10)}.smarterwire.json`, await r.text(), 'application/json');
}

/** Kiest een bestand en importeert het. Rijen met hetzelfde id worden samengevoegd (de nieuwste wijziging wint). */
export function importProject(onDone: (projectId?: string) => void) {
  const inp = h('input', { type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
  inp.onchange = async () => {
    const f = inp.files?.[0];
    if (!f) return;
    try {
      const r = await fetch('/api/project/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: await f.text() });
      const res = await r.json();
      if (!r.ok) throw new Error(res.error ?? String(r.status));
      toast('Project geïmporteerd');
      onDone(res.project_id);
    } catch (e: any) { toast(e.message, 'error'); }
  };
  inp.click();
}

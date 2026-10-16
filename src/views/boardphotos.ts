// Meer foto's per kast + foto van de beschrijvingen (strookjes/legende) die automatisch aan de zekeringen gekoppeld wordt.
import { h, btn, toast, busy } from '../lib/dom';
import { modal, badge, alertDialog, confirmDialog } from '../lib/ui';
import { run } from '../db/client';
import { list, saveImage, assetUrl, upsert, softDelete, putOp } from '../db/repo';
import { analyzeLabelPhoto, type ProposedLabel } from '../lib/ai';
import { ensureCircuits } from '../domain/circuits';
import { circuitsOf, devicesOf, type Board, type Circuit, type Device, type Project } from '../domain/model';
import { deviceTitle, devicePlaces, isFeeder, FUNCTIONS } from '../domain/devices';

export interface BoardPhoto { id: string; board_id: string; asset_id: string; kind: string; note?: string | null }
export const PHOTO_KINDS: Record<string, string> = { kast: 'Kast (extra foto)', beschrijving: 'Beschrijvingen / legende', bekabeling: 'Bekabeling', typeplaatje: 'Typeplaatje', overig: 'Overig' };

/** Functie afleiden uit de omschrijving ("Stopcontacten living" → Stopcontacten). Bij twijfel (meerdere soorten) niets invullen. */
export function guessFunc(text: string): string | null {
  const t = text.toLowerCase();
  const rules: [RegExp, string][] = [
    [/stopcont|stct|\bstc\b|contactdoos/, 'Stopcontacten'], [/verlicht|licht|lamp|spots?\b/, 'Verlichting'], [/kookplaat|fornuis|inductie/, 'Kookplaat'], [/\boven\b/, 'Oven'],
    [/wasmachine|\bwas\b/, 'Wasmachine'], [/droog/, 'Droogkast'], [/vaatwas/, 'Vaatwasser'], [/boiler|warm water|waterverwarm/, 'Boiler'], [/verwarming|convector|radiator/, 'Verwarming'],
    [/airco|warmtepomp/, 'Airco / warmtepomp'], [/laadpaal|laadstation/, 'Laadpaal'], [/buiten|tuin|terras|garage poort/, 'Buiten'], [/\bbel\b|deurbel/, 'Bel / laagspanning'],
  ];
  const hits = [...new Set(rules.filter(([re]) => re.test(t)).map(([, f]) => f))].filter((f) => FUNCTIONS.includes(f));
  return hits.length === 1 ? hits[0] : null;
}

const pick = (capture: boolean): Promise<File | null> => new Promise((resolve) => {
  const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } }) as HTMLInputElement;
  if (capture) inp.setAttribute('capture', 'environment');
  inp.onchange = () => { resolve(inp.files?.[0] ?? null); inp.remove(); };
  inp.addEventListener('cancel', () => { resolve(null); inp.remove(); });
  document.body.append(inp); inp.click();
});

/** Beschrijvingen van een foto laten lezen en voorstellen aan de zekeringen; de installateur controleert vóór het toepassen. */
export async function linkLabels(project: Project, board: Board, photoAssetId: string, onDone: () => void) {
  await ensureCircuits(project);
  const [devices, circuits] = await Promise.all([devicesOf(board.id), circuitsOf(project.id)]);
  const feeders = devices.filter((d) => isFeeder(d.kind)).sort((a, b) => a.row_no - b.row_no || a.pos - b.pos);
  if (!feeders.length) { toast('Voeg eerst de toestellen van de kast toe', 'error'); return; }
  const at = devicePlaces(devices);
  const stop = busy('Beschrijvingen worden gelezen door AI…');
  let found: ProposedLabel[];
  try { found = await analyzeLabelPhoto((await assetUrl(photoAssetId))!, feeders.map((d) => ({ id: d.id, row: d.row_no + 1, pos: Number((at.get(d.id) ?? '').split('·')[1]) || d.pos + 1, title: deviceTitle(d) }))); }
  catch (e: any) { toast(e?.message ?? 'Analyse mislukt', 'error'); return; }
  finally { stop(); }
  const byDev = new Map<string, ProposedLabel>();
  for (const l of found) { if (!feeders.some((d) => d.id === l.device_id) || !l.text?.trim()) continue; const cur = byDev.get(l.device_id); if (!cur || (l.confidence ?? 0) > (cur.confidence ?? 0)) byDev.set(l.device_id, l); }
  if (!byDev.size) { await alertDialog('Geen beschrijvingen gevonden', 'De AI kon geen leesbare beschrijvingen aan de toestellen koppelen. Probeer een scherpere foto, dichterbij en recht van voren.'); return; }
  review(project, board, feeders, circuits, [...byDev.values()], at, onDone);
}

function review(project: Project, board: Board, feeders: Device[], circuits: Circuit[], labels: ProposedLabel[], at: Map<string, string>, onDone: () => void) {
  const circOf = (devId: string) => circuits.find((c) => c.device_id === devId);
  const hasOwn = (c?: Circuit) => !!c && !!c.name && !/^Kring /.test(c.name);
  let overwrite = false;
  type Row = { label: ProposedLabel; devId: string; text: string; on: boolean };
  const rows: Row[] = labels.sort((a, b) => { const da = feeders.findIndex((d) => d.id === a.device_id), db = feeders.findIndex((d) => d.id === b.device_id); return da - db; })
    .map((l) => ({ label: l, devId: l.device_id, text: l.text.trim(), on: (l.confidence ?? 0.6) >= 0.5 }));
  const tbody = h('tbody');
  const draw = () => {
    tbody.replaceChildren(...rows.map((r) => {
      const c = circOf(r.devId), conflict = hasOwn(c) && !overwrite;
      const conf = Math.round((r.label.confidence ?? 0.6) * 100);
      return h('tr', null,
        h('td', null, h('input', { type: 'checkbox', checked: r.on && !conflict, disabled: conflict, onChange: (e: Event) => { r.on = (e.target as HTMLInputElement).checked; } })),
        h('td', null, h('select', { onChange: (e: Event) => { r.devId = (e.target as HTMLSelectElement).value; draw(); } },
          feeders.map((d) => h('option', { value: d.id, selected: d.id === r.devId }, `${at.get(d.id)} · ${deviceTitle(d)}${circOf(d.id)?.nr ? ` (kring ${circOf(d.id)!.nr})` : ''}`)))),
        h('td', null, h('input', { type: 'text', value: r.text, style: { width: '100%' }, onChange: (e: Event) => { r.text = (e.target as HTMLInputElement).value; } }),
          conflict ? h('div', { class: 'hint' }, `heeft al: "${c!.name}"`) : null, r.label.reason ? h('div', { class: 'hint' }, r.label.reason) : null),
        h('td', null, badge(`${conf}%`, conf >= 75 ? 'ok' : conf >= 50 ? 'warn' : 'err')));
    }));
  };
  draw();
  modal({
    title: `Beschrijvingen koppelen – ${board.name}`, wide: true,
    body: h('div', null,
      h('p', { class: 'hint' }, 'De AI las deze beschrijvingen en koppelde ze aan een zekering. Controleer de koppeling (kies zo nodig een ander toestel) en pas de tekst aan. Ze worden de omschrijving van de kring; de functie wordt afgeleid als ze duidelijk is. Laag-betrouwbare regels staan uit.'),
      h('label', { class: 'hint', style: { display: 'inline-flex', gap: '6px', alignItems: 'center', margin: '4px 0' } }, h('input', { type: 'checkbox', onChange: (e: Event) => { overwrite = (e.target as HTMLInputElement).checked; rows.forEach((r) => { if (overwrite && hasOwn(circOf(r.devId))) r.on = true; }); draw(); } }), 'Bestaande omschrijvingen overschrijven'),
      h('div', { class: 'table-scroll' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, ['', 'Zekering', 'Beschrijving', 'Zekerheid'].map((t) => h('th', null, t)))), tbody))),
    actions: (close) => [h('span', { class: 'spacer' }), btn('Annuleren', { variant: 'ghost', onClick: close }),
      btn('Toepassen', { icon: 'Check', variant: 'primary', onClick: async () => {
        const used = new Set<string>(), ops = [];
        for (const r of rows) {
          const c = circOf(r.devId); if (!c || !r.on || !r.text.trim() || used.has(c.id) || (hasOwn(c) && !overwrite)) continue;
          used.add(c.id);
          ops.push(putOp('circuit', { ...c, name: r.text.trim().slice(0, 120), func: c.func || guessFunc(r.text) }));
        }
        if (!ops.length) { toast('Niets om toe te passen', 'error'); return; }
        await run(ops); toast(`${ops.length} beschrijving(en) gekoppeld aan kringen`); close(); onDone();
      } })],
  });
}

/** Snel: foto van de beschrijvingen nemen/kiezen, bewaren bij de kast en meteen koppelen. */
export async function captureLabels(project: Project, board: Board, camera: boolean, onDone: () => void) {
  const f = await pick(camera); if (!f) return;
  const stop = busy('Foto wordt opgeslagen…');
  let id: string;
  try { id = (await saveImage(f)).id; await upsert('board_photo', { board_id: board.id, asset_id: id, kind: 'beschrijving' }); }
  catch (e: any) { toast(e?.message ?? 'Foto opslaan mislukt', 'error'); return; }
  finally { stop(); }
  await linkLabels(project, board, id, onDone);
}

/** Galerij van alle foto's van een kast (extra foto's, beschrijvingen, bekabeling, typeplaatjes). */
export async function openGallery(project: Project, board: Board, onDone: () => void) {
  const photos = await list<BoardPhoto>('board_photo', board.id);
  let kind = 'kast';
  const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', marginTop: '10px' } });
  const kindSel = h('select', { onChange: (e: Event) => { kind = (e.target as HTMLSelectElement).value; } }, Object.entries(PHOTO_KINDS).map(([v, l]) => h('option', { value: v, selected: v === kind }, l))) as HTMLSelectElement;
  const add = async (camera: boolean) => {
    const f = await pick(camera); if (!f) return;
    const stop = busy('Foto wordt opgeslagen…');
    try { const img = await saveImage(f); await upsert('board_photo', { board_id: board.id, asset_id: img.id, kind }); toast('Foto toegevoegd'); }
    catch (e: any) { toast(e?.message ?? 'Foto opslaan mislukt', 'error'); stop(); return; }
    stop(); closeFn?.(); openGallery(project, board, onDone);
  };
  let closeFn: (() => void) | undefined;
  for (const p of photos) {
    const url = await assetUrl(p.asset_id);
    grid.append(h('figure', { style: { margin: 0 } },
      h('a', { href: url ?? '#', target: '_blank', rel: 'noopener' }, h('img', { src: url ?? '', alt: PHOTO_KINDS[p.kind] ?? p.kind, style: { width: '100%', height: '110px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #ccc' } })),
      h('figcaption', { class: 'hint', style: { display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' } }, PHOTO_KINDS[p.kind] ?? p.kind,
        p.kind === 'beschrijving' ? btn('Koppelen', { icon: 'Link', variant: 'ghost', title: 'Beschrijvingen lezen en aan de zekeringen koppelen', onClick: () => { closeFn?.(); linkLabels(project, board, p.asset_id, onDone); } }) : null,
        btn('', { icon: 'Trash2', variant: 'ghost', title: 'Foto verwijderen', onClick: async () => { if (await confirmDialog({ title: 'Foto verwijderen', message: 'Deze foto verwijderen?' })) { await softDelete('board_photo', p.id); closeFn?.(); openGallery(project, board, onDone); } } }))));
  }
  if (!photos.length) grid.append(h('p', { class: 'hint' }, 'Nog geen extra foto\'s. De hoofdfoto van de kast staat in de kastweergave; hier komen foto\'s van de beschrijvingen, bekabeling en typeplaatjes.'));
  modal({
    title: `Foto's – ${board.name}`, wide: true,
    body: h('div', null, h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, h('span', { class: 'hint' }, 'Soort:'), kindSel,
      btn('Camera', { icon: 'Camera', onClick: () => add(true) }), btn('Foto kiezen', { icon: 'Upload', onClick: () => add(false) })), grid),
    onClose: () => { closeFn = undefined; },
    actions: (close) => { closeFn = close; return [h('span', { class: 'spacer' }), btn('Sluiten', { variant: 'primary', onClick: close })]; },
  });
}

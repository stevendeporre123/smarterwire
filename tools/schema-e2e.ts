// Eendraadschema met verbruikers uit het assortiment en van het plan: /tools/schema-e2e.html?mem
import '../src/styles/tokens.css';
import '../src/styles/app.css';
import { upsert } from '../src/db/repo';
import { renderSchema } from '../src/views/schema';
import { ensureCircuits } from '../src/domain/circuits';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const proj: any = await upsert('project', { name: 'Test', supply: '1x230' });
const board: any = await upsert('board', { project_id: proj.id, name: 'Kast', kind: 'bestaand' });
const d1: any = await upsert('device', { board_id: board.id, kind: 'differentieel', poles: '2P', rating_a: 40, sens_ma: 30, dtype: 'A', row_no: 0, pos: 0, modules: 2 });
for (let i = 0; i < 4; i++) await upsert('device', { board_id: board.id, kind: 'automaat', poles: '2P', curve: 'C', rating_a: 16, parent_id: d1.id, row_no: 0, pos: i + 1, modules: 1 });
await ensureCircuits(proj);
const { sql } = await import('../src/db/client');
const cs: any[] = await sql.query('SELECT * FROM circuit WHERE project_id=? ORDER BY nr', [proj.id]);
await upsert('circuit', { ...cs[0], name: 'Verlichting living', cable_type: 'VOB', fire_class: 'Cca', section_mm2: 1.5, wires: 3, install: 'In wand' });
await upsert('circuit', { ...cs[1], name: 'Stopcontacten keuken' });
const plan: any = await upsert('plan', { project_id: proj.id, name: 'GV', w: 3000, h: 2100, scale: 150 });
await upsert('symbol', { plan_id: plan.id, type: 'Verlichtingstoestel', x: .2, y: .2, rot: 0, circuit_id: cs[0].id, label: 'living' });
await upsert('symbol', { plan_id: plan.id, type: 'Verlichtingstoestel', x: .3, y: .2, rot: 0, circuit_id: cs[0].id, label: 'keuken' });
await upsert('symbol', { plan_id: plan.id, type: 'Stopcontact#2', x: .4, y: .2, rot: 0, circuit_id: null, label: 'bureau' });
await upsert('schema_load', { circuit_id: cs[1].id, type: 'Stopcontact', label: 'E1 keuken', n: 1, pos: 10 });
await upsert('schema_load', { circuit_id: cs[1].id, type: 'Stopcontact#2', label: 'E2 keuken', n: 1, pos: 20 });
await upsert('schema_load', { circuit_id: cs[1].id, type: 'Stopcontact', label: 'E3 gang', n: 1, pos: 30 });
await renderSchema(document.getElementById('root')!, proj);
await sleep(500);
const click = (el: Element | null) => { if (!el) throw new Error('element niet gevonden'); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
const root = document.getElementById('root')!;
const tool = async (label: string) => { click([...root.querySelectorAll('.pal-item')].find((b) => b.getAttribute('title') === label) ?? null); await sleep(150); };
const q = new URLSearchParams(location.search);
const logEl = document.createElement('pre'); logEl.style.cssText = 'position:fixed;right:0;bottom:0;background:#ffd;margin:0;font-size:11px;z-index:99'; document.body.append(logEl);
const rows = async () => (await sql.query('SELECT c.nr, l.type, l.label, l.pos FROM schema_load l JOIN circuit c ON c.id=l.circuit_id WHERE l.deleted=0 ORDER BY c.nr, l.pos')).map((r: any) => `${r.nr}:${r.type}/${r.label}@${r.pos}`).join(' | ');
const mid = (el: Element) => { const r = el.getBoundingClientRect(); return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; };
if (q.has('slots')) { await tool('Lamp (lichtpunt)'); }
else if (q.has('place')) {   // lamp tussen E1 en E2 van kring B
  await tool('Lamp (lichtpunt)');
  click(root.querySelector(`[data-slot="load"][data-cid="${cs[1].id}"][data-idx="1"]`)); await sleep(500);
  logEl.textContent = await rows();
} else if (q.has('move')) {   // E2 via de inspector naar kring C
  click(root.querySelectorAll('[data-lid]')[3]); await sleep(300);
  const sel = [...root.querySelectorAll('.side select')].find((x) => [...(x as HTMLSelectElement).options].some((o) => o.value === cs[2].id)) as HTMLSelectElement;
  sel.value = cs[2].id; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(600);
  logEl.textContent = await rows();
} else if (q.has('drag')) {   // E3 slepen naar het begin van kring A
  const el = root.querySelectorAll('[data-lid]')[4];
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ...mid(el) }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, ...mid(el), clientX: mid(el).clientX + 30 })); await sleep(500);
  const slot = root.querySelector(`[data-slot="load"][data-cid="${cs[0].id}"][data-idx="0"]`)!;
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, ...mid(slot) })); await sleep(700);
  logEl.textContent = await rows();
} else if (q.has('bus')) {   // nieuwe kring tussen A en B
  await tool('Kring (automaat)');
  const sl = [...root.querySelectorAll('[data-slot="bus"]')].filter((x) => x.getAttribute('data-idx') === '2')[0];
  click(sl); await sleep(700);
  const ds: any[] = await sql.query("SELECT d.pos, c.nr FROM device d LEFT JOIN circuit c ON c.device_id=d.id WHERE d.deleted=0 AND d.kind='automaat' ORDER BY d.pos");
  logEl.textContent = ds.map((x) => `${x.nr}@${x.pos}`).join(' ');
} else if (q.has('circ')) click([...root.querySelectorAll('[data-cid]')][1]);
else click(root.querySelectorAll('[data-lid]')[3]);
await sleep(400);

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
await upsert('symbol', { plan_id: plan.id, type: 'Stopcontact#2', x: .4, y: .2, rot: 0, circuit_id: null, label: 'keuken' });
await upsert('symbol', { plan_id: plan.id, type: 'Stopcontact#2', x: .5, y: .3, rot: 0, circuit_id: null, label: 'keuken' });
await upsert('schema_load', { circuit_id: cs[1].id, type: 'Stopcontact', label: 'werkblad', n: 3, pos: 1 });
await upsert('schema_load', { circuit_id: cs[1].id, type: 'Wandverlichtingstoestel', label: '', n: 1, pos: 2 });
await renderSchema(document.getElementById('root')!, proj);
await sleep(500);
const click = (el: Element | null) => { if (!el) throw new Error('element niet gevonden'); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
const root = document.getElementById('root')!;
const tool = async (label: string) => { click([...root.querySelectorAll('.pal-item')].find((b) => b.getAttribute('title') === label) ?? null); await sleep(150); };
const q = new URLSearchParams(location.search);
if (q.has('add')) {
  await tool('Kring (automaat)'); click(root.querySelector('[data-bus]')); await sleep(400);   // nieuwe automaat met kring op de bus
  await tool('Lamp (lichtpunt)'); click([...root.querySelectorAll('[data-cid]')][0]); await sleep(400);   // lamp op kring A
  await tool('Selecteren');
} else if (q.has('dev')) click(root.querySelector('[data-did]'));
else if (q.has('sup')) click(root.querySelector('[data-sup]'));
else click([...root.querySelectorAll('[data-cid]')][1]);
await sleep(500);

// Kringen in bulk verwijderen: /tools/circuits-e2e.html?mem[&stop]
import '../src/styles/tokens.css';
import '../src/styles/app.css';
import { upsert } from '../src/db/repo';
import { sql } from '../src/db/client';
import { renderCircuits } from '../src/views/circuits';
import { ensureCircuits } from '../src/domain/circuits';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const proj: any = await upsert('project', { name: 'Test', supply: '1x230' });
const board: any = await upsert('board', { project_id: proj.id, name: 'Kast', kind: 'bestaand' });
for (let i = 0; i < 6; i++) await upsert('device', { board_id: board.id, kind: 'automaat', poles: '2P', curve: 'C', rating_a: 16, row_no: 0, pos: i, modules: 1 });
await ensureCircuits(proj);
const plan: any = await upsert('plan', { project_id: proj.id, name: 'GV', w: 3000, h: 2100, scale: 150 });
const c0: any = (await sql.query('SELECT id FROM circuit WHERE project_id=? ORDER BY nr', [proj.id]))[0];
await upsert('symbol', { plan_id: plan.id, type: 'Stopcontact', x: .2, y: .2, rot: 0, circuit_id: c0.id });
const root = document.getElementById('root')!;
await renderCircuits(root, proj); await sleep(300);
const boxes = [...root.querySelectorAll('thead input[type=checkbox], tbody input[type=checkbox]')] as HTMLInputElement[];
boxes[0].click(); await sleep(100);   // alles selecteren
boxes[3].click(); await sleep(100);   // één rij weer uitvinken
const del = [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('Verwijder selectie')) as HTMLButtonElement;
del.click(); await sleep(300);
const log = (m: string) => { const d = document.createElement('pre'); d.style.cssText = 'position:fixed;right:0;bottom:0;background:#ffd;margin:0;font-size:12px;z-index:99'; d.textContent = m; document.body.append(d); };
if (!location.search.includes('stop')) {
  const dlg = document.querySelector('dialog')!;
  (dlg.querySelector('input[type=checkbox]') as HTMLInputElement).click();
  ([...dlg.querySelectorAll('button')].find((b) => b.textContent?.includes('Verwijderen')) as HTMLButtonElement).click();
  await sleep(800);
  const [c] = await sql.query('SELECT COUNT(*) n FROM circuit WHERE deleted=0 AND project_id=?', [proj.id]);
  const [d] = await sql.query('SELECT COUNT(*) n FROM device WHERE deleted=0 AND board_id=?', [board.id]);
  const [s] = await sql.query('SELECT circuit_id FROM symbol WHERE deleted=0');
  log(`kringen over: ${c.n}, zekeringen over: ${d.n}, symbool-kring: ${s.circuit_id}`);
}

// Voorstel nieuwe kast met echte database: /tools/gen-e2e.html?mem
import '../src/styles/tokens.css';
import '../src/styles/app.css';
import { upsert } from '../src/db/repo';
import { renderBoard } from '../src/views/board';
import { generateNewBoards, DEFAULT_GEN } from '../src/domain/newboard';
import { boardsOf } from '../src/domain/model';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const q = new URLSearchParams(location.search);
const proj: any = await upsert('project', { name: 'Test', supply: q.get('s') ?? '1x230' });
const old: any = await upsert('board', { project_id: proj.id, name: 'Oude kast', kind: 'bestaand' });
for (let i = 0; i < 12; i++) {
  const d: any = await upsert('device', { board_id: old.id, kind: 'automaat', poles: '2P', curve: 'B', rating_a: 16, row_no: 0, pos: i, modules: 1 });
  await upsert('circuit', { project_id: proj.id, nr: String.fromCharCode(65 + i), name: ['Verlichting', 'Stopcontacten', 'Keuken', 'Badkamer', 'Boiler', 'Wasmachine', 'Droogkast', 'Oven', 'Tuin', 'Garage', 'Zolder', 'Bureau'][i], func: i === 4 || i === 7 ? 'Boiler' : i === 0 ? 'Verlichting' : 'Stopcontacten', device_id: d.id, section_mm2: i === 7 ? 4 : 2.5, status: 'onbekend' });
}
const r = await generateNewBoards(proj, { ...DEFAULT_GEN, maxPerDiff: 4, rowModules: Number(q.get('cols') ?? 18), rows: Number(q.get('rows') ?? 3) });
const nb = (await boardsOf(proj.id)).find((b) => b.kind === 'nieuw')!;
localStorage.setItem(`smarterwire.board.${proj.id}`, nb.id);
await renderBoard(document.getElementById('root')!, proj);
await sleep(300);
const pre = document.createElement('pre'); pre.style.cssText = 'position:fixed;right:8px;bottom:8px;background:#ffd;margin:0;font-size:11px;max-width:520px;white-space:pre-wrap'; pre.textContent = r.diffs + ' diff, waarschuwingen: ' + [...new Set(r.warnings)].join(' | '); document.body.append(pre);

// Virtuele kast met echte database: npx vite build -c tools/vite.test.config.ts → /tools/board-e2e.html?mem
import '../src/styles/tokens.css';
import '../src/styles/app.css';
import { upsert } from '../src/db/repo';
import { renderBoard } from '../src/views/board';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const proj: any = await upsert('project', { name: 'Test', supply: '3N400' });
const board: any = await upsert('board', { project_id: proj.id, name: 'Kast', kind: 'bestaand' });
localStorage.setItem(`smarterwire.board.${proj.id}`, board.id);
let pos = 0;
const dev = (o: any) => upsert('device', { board_id: board.id, row_no: 0, pos: pos++, ...o });
await dev({ kind: 'differentieel', poles: '4P', modules: 4, rating_a: 63, sens_ma: 300, dtype: 'A' });
await dev({ kind: 'automaat', poles: '2P', modules: 1, curve: 'C', rating_a: 10 });   // mini-automaat: 2 polen op 1 module
await dev({ kind: 'automaat', poles: '2P', modules: 2, curve: 'C', rating_a: 16 });
await dev({ kind: 'automaat', poles: '1P', modules: 1, curve: 'B', rating_a: 16 });
await dev({ kind: 'automaat', poles: '4P', modules: 4, curve: 'C', rating_a: 25 });
await dev({ kind: 'smelt', modules: 1, rating_a: 20, label: 'Gardy' });
await dev({ kind: 'overspanning', poles: '4P', modules: 2 });
const sel: any = await dev({ kind: 'automaat', poles: '1P+N', modules: 1, curve: 'C', rating_a: 20 });   // oude waarde → 2 polen
await renderBoard(document.getElementById('root')!, proj);
await sleep(500);
(document.querySelector('.pal-item, .side .pal-item') as HTMLElement | null);
const items = [...document.querySelectorAll('.side .pal-item')] as HTMLElement[];
items[1]?.click(); await sleep(300);

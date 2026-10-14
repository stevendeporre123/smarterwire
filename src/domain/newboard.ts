import { sql, type Stmt } from '../db/client';
import { upsertStmt } from '../db/repo';
import { uid } from '../lib/id';
import { DEFAULT_RATING_FOR_SECTION } from './devices';
import type { Circuit } from './model';

export interface GenOptions { maxPerDiff: number; diffRating: number; mainRating: number; splitByFunction: boolean }
export const DEFAULT_GEN: GenOptions = { maxPerDiff: 6, diffRating: 40, mainRating: 40, splitByFunction: true };

const groupOf = (c: Circuit) =>
  c.func === 'Verlichting' ? 'Verlichting' : c.func === 'Stopcontacten' ? 'Stopcontacten' : 'Toestellen';

/**
 * Bouwt een voorstel voor een nieuwe kast: elke kring krijgt een EIGEN automaat
 * (dus gedeelde zekeringen uit de oude kast worden gesplitst), gegroepeerd onder
 * 30mA-differentiëlen. Het is een voorstel: ratings uit de doorsnede en groepering
 * moeten altijd door de installateur nagekeken worden.
 */
export async function generateNewBoard(projectId: string, boardId: string, circuits: Circuit[], opt: GenOptions) {
  const stmts: Stmt[] = [];
  // oude voorstel wissen
  stmts.push({ sql: `UPDATE device SET deleted=1, updated_at=? WHERE board_id=?`, bind: [Date.now(), boardId] });
  stmts.push({ sql: `UPDATE circuit SET new_device_id=NULL, updated_at=? WHERE project_id=?`, bind: [Date.now(), projectId] });

  const mainId = uid();
  stmts.push(upsertStmt('device', { id: mainId, board_id: boardId, kind: 'hoofd', label: 'Hoofdautomaat', poles: '2P', rating_a: opt.mainRating, curve: 'B', row_no: 0, pos: 0, modules: 2 }));

  const groups = new Map<string, Circuit[]>();
  for (const c of circuits) {
    const g = opt.splitByFunction ? groupOf(c) : 'Alle';
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(c);
  }
  let row = 1, n = 1;
  for (const [g, cs] of groups) {
    for (let i = 0; i < cs.length; i += opt.maxPerDiff) {
      const chunk = cs.slice(i, i + opt.maxPerDiff);
      const diffId = uid();
      stmts.push(upsertStmt('device', {
        id: diffId, board_id: boardId, parent_id: mainId, kind: 'differentieel', label: `ID${n}`, poles: '2P',
        rating_a: opt.diffRating, sens_ma: 30, dtype: 'A', row_no: row, pos: 0, modules: 2, notes: g,
      }));
      chunk.forEach((c, k) => {
        const devId = uid();
        const rating = (c.section_mm2 && DEFAULT_RATING_FOR_SECTION[c.section_mm2]) || (c.func === 'Verlichting' ? 10 : 16);
        stmts.push(upsertStmt('device', {
          id: devId, board_id: boardId, parent_id: diffId, kind: 'automaat', label: c.nr ? `K${c.nr}` : null, poles: '1P+N',
          rating_a: rating, curve: 'B', row_no: row, pos: 1 + k, modules: 1,
        }));
        stmts.push({ sql: `UPDATE circuit SET new_device_id=?, updated_at=? WHERE id=?`, bind: [devId, Date.now(), c.id] });
      });
      row++; n++;
    }
  }
  await sql.batch(stmts);
}

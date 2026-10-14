import { sql, type Stmt } from '../db/client';
import { upsertStmt } from '../db/repo';
import { uid } from '../lib/id';
import { DEFAULT_RATING_FOR_SECTION } from './devices';
import { boardsOf, circuitsOf, allDevicesOfProject, type Board, type Circuit, type Device, type Project } from './model';

export interface GenOptions {
  maxPerDiff: number;       // max. kringen per 30 mA-differentieel
  diffRating: number;
  mainDiffRating: number;   // hoofddifferentieel 300 mA aan het begin van de keten (de hoofdautomaat staat buiten de kast, aan de meter)
  mainDiffType: string;
  rowModules: number;       // breedte van de nieuwe kast in modules per rij
  rows: number;             // aantal rijen
  splitByLevel: boolean;    // groeperen per verdieping
  mergeLeftovers: boolean;  // kleine restgroepen van opeenvolgende verdiepingen samenvoegen
  bigOwnDiff: boolean;      // grote verbruikers op eigen differentieel
  bigPerDiff: number;
}
export const DEFAULT_GEN: GenOptions = { maxPerDiff: 8, diffRating: 40, mainDiffRating: 40, mainDiffType: 'A', rowModules: 18, rows: 4, splitByLevel: true, mergeLeftovers: true, bigOwnDiff: true, bigPerDiff: 1 };

export const BIG_FUNCS = new Set(['Kookplaat', 'Oven', 'Droogkast', 'Boiler', 'Verwarming', 'Airco / warmtepomp', 'Laadpaal']);

interface Item { cs: Circuit[]; level: string; big: boolean }
interface Chunk { items: Item[]; size: number; level: string; big: boolean }
export interface GenResult { diffs: number; circuits: number; warnings: string[] }

const is3p = (c: Circuit) => c.voltage === 400 || (c.wires ?? 0) >= 4;
const sizeOf = (it: Item[]) => it.reduce((s, i) => s + i.cs.length, 0);

/**
 * Bouwt voor elke bestaande kast een voorstel voor een nieuwe kast (onderverdelers blijven onderverdelers).
 * Elke kring krijgt een eigen automaat. Het is een VOORSTEL: kringen die door de bestaande bekabeling
 * niet te splitsen zijn, kan je met "samen houden" markeren en daarna ter plaatse aanpassen.
 */
export async function generateNewBoards(project: Project, opt: GenOptions): Promise<GenResult> {
  const [boards, circuits, devices, symLevels] = await Promise.all([
    boardsOf(project.id), circuitsOf(project.id), allDevicesOfProject(project.id),
    sql.query<{ circuit_id: string; level: string; n: number }>(
      `SELECT s.circuit_id, COALESCE(p.level, p.name) level, COUNT(*) n FROM symbol s JOIN plan p ON p.id=s.plan_id
       WHERE s.deleted=0 AND p.deleted=0 AND p.project_id=? AND s.circuit_id IS NOT NULL GROUP BY s.circuit_id, p.id`, [project.id]),
  ]);
  const old = boards.filter((b) => b.kind === 'bestaand');
  if (!old.length) throw new Error('Geen bestaande kast gevonden');
  const devBoard = new Map(devices.map((d) => [d.id, d.board_id]));
  const warnings: string[] = [];

  // welke kasten worden gevoed door een kring (= onderverdeler)?
  const fedBy = new Map<string, string>();
  for (const c of circuits) {
    const host = c.device_id ? devBoard.get(c.device_id) : null;
    if (c.feeds_board_id && host && host !== c.feeds_board_id) fedBy.set(c.feeds_board_id, host);
  }
  const root = old.find((b) => !fedBy.has(b.id)) ?? old[0];

  // verdieping: expliciet, anders waar de meeste symbolen staan
  const bestLevel = new Map<string, { level: string; n: number }>();
  for (const r of symLevels) { const cur = bestLevel.get(r.circuit_id); if (!cur || r.n > cur.n) bestLevel.set(r.circuit_id, { level: r.level, n: r.n }); }
  const levelOf = (c: Circuit) => c.level || bestLevel.get(c.id)?.level || '';

  const threePhase = project.supply === '3N400' || project.supply === '3x230';
  const phaseNames = project.supply === '3x230' ? ['L1-L2', 'L2-L3', 'L3-L1'] : ['L1', 'L2', 'L3'];

  const stmts: Stmt[] = [];
  let diffCount = 0;
  const now = Date.now();
  stmts.push({ sql: `UPDATE circuit SET new_device_id=NULL, updated_at=? WHERE project_id=?`, bind: [now, project.id] });

  for (const src of old) {
    // bijhorende nieuwe kast zoeken of aanmaken
    let nb = boards.find((b) => b.kind === 'nieuw' && b.src_board_id === src.id);
    if (!nb) {
      nb = { id: uid(), project_id: project.id, name: `${src.name} (nieuw)`, kind: 'nieuw', src_board_id: src.id } as Board;
      stmts.push(upsertStmt('board', nb));
    }
    stmts.push({ sql: `UPDATE device SET deleted=1, updated_at=? WHERE board_id=?`, bind: [now, nb.id] });

    const mine = circuits.filter((c) => (c.device_id ? devBoard.get(c.device_id) === src.id : src.id === root.id));
    if (!mine.length && src.id !== root.id) continue;

    // items: kringen met dezelfde lock_group blijven samen
    const items: Item[] = []; const locks = new Map<string, Item>();
    for (const c of mine) {
      const big = BIG_FUNCS.has(c.func ?? '');
      if (c.lock_group) {
        const it = locks.get(c.lock_group);
        if (it) { it.cs.push(c); it.big ||= big; continue; }
        const n: Item = { cs: [c], level: levelOf(c), big }; locks.set(c.lock_group, n); items.push(n);
      } else items.push({ cs: [c], level: levelOf(c), big });
    }
    for (const it of items) if (it.cs.length > opt.maxPerDiff) warnings.push(`Samen-houden-groep "${it.cs[0].lock_group}" heeft ${it.cs.length} kringen (> ${opt.maxPerDiff})`);

    const lvlSort = (a: string, b: string) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'nl', { numeric: true }));
    const normal = items.filter((i) => !(opt.bigOwnDiff && i.big));
    const bigs = items.filter((i) => opt.bigOwnDiff && i.big);

    // normale kringen: per verdieping vullen tot maxPerDiff
    const chunks: Chunk[] = [];
    const levels = opt.splitByLevel ? [...new Set(normal.map((i) => i.level))].sort(lvlSort) : [''];
    for (const lv of levels) {
      let cur: Chunk | null = null;
      for (const it of normal.filter((i) => !opt.splitByLevel || i.level === lv)) {
        if (!cur || cur.size + it.cs.length > opt.maxPerDiff) { cur = { items: [], size: 0, level: lv, big: false }; chunks.push(cur); }
        cur.items.push(it); cur.size += it.cs.length;
      }
    }
    if (opt.splitByLevel && opt.mergeLeftovers) {
      for (let i = 0; i < chunks.length - 1;) {
        if (chunks[i].size + chunks[i + 1].size <= opt.maxPerDiff) { chunks[i].items.push(...chunks[i + 1].items); chunks[i].size += chunks[i + 1].size; chunks.splice(i + 1, 1); } else i++;
      }
    }
    // grote verbruikers
    for (let i = 0; i < bigs.length; i += Math.max(1, opt.bigPerDiff)) {
      const its = bigs.slice(i, i + Math.max(1, opt.bigPerDiff));
      chunks.push({ items: its, size: sizeOf(its), level: its[0].level, big: true });
    }

    // kast opbouwen: eerst de toestellen aanmaken (per groep), daarna in rijen leggen volgens de breedte van de kast
    const isRoot = src.id === root.id;
    const mainId = uid();
    type Dev = Record<string, any>;
    const polesAll = threePhase ? (project.supply === '3x230' ? '3P' : '4P') : '2P', modsAll = threePhase ? (project.supply === '3x230' ? 3 : 4) : 2;
    const groups: Dev[][] = [];
    const circuitStmts: Stmt[] = [];
    if (isRoot) groups.push([{ id: mainId, board_id: nb.id, kind: 'differentieel', label: 'Hoofddifferentieel', poles: polesAll, rating_a: opt.mainDiffRating, sens_ma: 300, dtype: opt.mainDiffType || 'A', modules: modsAll, notes: 'hoofddifferentieel 300 mA' }]);
    const globalLoad: Record<string, number> = Object.fromEntries(phaseNames.map((p) => [p, 0]));
    let n = 1;
    for (const ch of chunks) {
      const diffId = uid();
      const diffLoad: Record<string, number> = Object.fromEntries(phaseNames.map((p) => [p, 0]));
      const lv = ch.level || '';
      const group: Dev[] = [{ id: diffId, board_id: nb.id, parent_id: isRoot ? mainId : null, kind: 'differentieel', label: `ID${n}`, poles: polesAll, rating_a: opt.diffRating, sens_ma: 30, dtype: 'A', modules: modsAll,
        notes: [ch.big ? 'grote verbruiker(s)' : '', lv].filter(Boolean).join(' · ') || null }];
      for (const it of ch.items) {
        const usedInItem = new Set<string>();
        for (const c of it.cs) {
          const devId = uid();
          const rating = (c.section_mm2 && DEFAULT_RATING_FOR_SECTION[c.section_mm2]) || (c.func === 'Verlichting' ? 10 : 16);
          if (!c.section_mm2) warnings.push(`Kring "${c.name}": geen doorsnede, standaardzekering ${rating}A`);
          let phase: string | null = null, poles = '2P', modules = 1;
          if (threePhase) {
            if (is3p(c)) { phase = '3P'; poles = project.supply === '3x230' ? '3P' : '4P'; modules = project.supply === '3x230' ? 3 : 4; }
            else {
              const cands = phaseNames.filter((p) => !usedInItem.has(p));
              const pool = cands.length ? cands : phaseNames;
              phase = pool.reduce((a, b) => (diffLoad[a] + globalLoad[a] <= diffLoad[b] + globalLoad[b] ? a : b));
              usedInItem.add(phase);
              if (project.supply === '3x230') poles = '2P';
            }
            if (phase !== '3P') { diffLoad[phase] += rating; globalLoad[phase] += rating; } else phaseNames.forEach((p) => { diffLoad[p] += rating; globalLoad[p] += rating; });
          }
          group.push({ id: devId, board_id: nb.id, parent_id: diffId, kind: 'automaat', label: c.nr ? `K${c.nr}` : null, poles, phase, rating_a: rating, curve: 'B', modules });
          circuitStmts.push({ sql: `UPDATE circuit SET new_device_id=?, updated_at=? WHERE id=?`, bind: [devId, now, c.id] });
        }
      }
      groups.push(group); n++; diffCount++;
    }

    // in rijen leggen: een groep (differentieel + zijn automaten) blijft liefst op één rij; past ze niet meer, dan begint een nieuwe rij
    const cols = Math.max(4, Math.round(opt.rowModules || 18)), rowCount: number[] = [0];
    let row = 0, used = 0;
    const put = (d: Dev) => { if (used > 0 && used + d.modules > cols) { row++; used = 0; rowCount[row] = 0; } d.row_no = row; d.pos = rowCount[row]++; used += d.modules; };
    for (const g of groups) {
      const w = g.reduce((sum, d) => sum + d.modules, 0);
      if (used > 0 && used + w > cols && w <= cols) { row++; used = 0; rowCount[row] = 0; }
      g.forEach(put);
    }
    const rowsUsed = row + 1;
    if (rowsUsed > opt.rows) warnings.push(`${nb.name}: ${rowsUsed} rijen nodig bij ${cols} modules breed, maar er zijn er ${opt.rows} ingesteld. Maak de kast breder of voeg een rij toe.`);
    stmts.push(...groups.flat().map((d) => upsertStmt('device', d)), ...circuitStmts);
    if (threePhase) warnings.push(`${nb.name}: belasting (A) per fase ≈ ${phaseNames.map((p) => `${p}: ${globalLoad[p]}`).join(', ')}`);
  }

  await sql.batch(stmts);
  return { diffs: diffCount, circuits: circuits.length, warnings };
}

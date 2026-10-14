import { sql } from '../db/client';
import type { DiagramSymbol } from './diagram';

/** Verbruiker die rechtstreeks op het eendraadschema werd toegevoegd. */
export interface SchemaLoad { id: string; circuit_id: string; type: string; label?: string | null; n: number; pos?: number | null }

export const schemaLoadsOf = (pid: string) => sql.query<SchemaLoad>(
  `SELECT l.* FROM schema_load l JOIN circuit c ON c.id=l.circuit_id WHERE l.deleted=0 AND c.deleted=0 AND c.project_id=? ORDER BY l.pos, l.rowid`, [pid]);

export interface PlanSymbolRow { id: string; circuit_id: string | null; type: string; label: string | null; plan: string }
export const planSymbolRows = (pid: string) => sql.query<PlanSymbolRow>(
  `SELECT s.id, s.circuit_id, s.type, s.label, p.name plan FROM symbol s JOIN plan p ON p.id=s.plan_id WHERE s.deleted=0 AND p.deleted=0 AND p.project_id=? ORDER BY p.level, p.name, s.rowid`, [pid]);

/** Alle verbruikers per kring: symbolen van het situatieplan plus de handmatig toegevoegde. */
export async function projectLoads(pid: string): Promise<DiagramSymbol[]> {
  const [syms, manual] = await Promise.all([planSymbolRows(pid), schemaLoadsOf(pid)]);
  return [...syms.map((s) => ({ circuit_id: s.circuit_id, type: s.type, label: s.label })), ...manual.map((m) => ({ circuit_id: m.circuit_id, type: m.type, label: m.label, n: m.n }))];
}

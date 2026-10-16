import { q } from '../db/client';
import type { DiagramSymbol } from './diagram';

/** Verbruiker die rechtstreeks op het eendraadschema werd toegevoegd. */
export interface SchemaLoad { id: string; circuit_id: string; type: string; label?: string | null; n: number; pos?: number | null; grp?: string | null }

export const schemaLoadsOf = (pid: string) => q<SchemaLoad>('schemaLoads', { project: pid });

export interface PlanSymbolRow { id: string; circuit_id: string | null; type: string; label: string | null; plan: string; spos: number | null; sgrp: string | null }
export const planSymbolRows = (pid: string) => q<PlanSymbolRow>('planSymbols', { project: pid });

export const loadKey = (src: 'plan' | 'manual', id: string) => `${src}:${id}`;

/** Elk onderdeel op een kring is één rij: symbolen van het situatieplan en handmatig toegevoegde, in hun volgorde op het schema. */
export function toDiagramLoads(syms: PlanSymbolRow[], manual: SchemaLoad[]): DiagramSymbol[] {
  return [
    ...syms.map((s, i) => ({ id: s.id, src: 'plan' as const, order: s.spos ?? 1e6 + i, grp: s.sgrp, circuit_id: s.circuit_id, type: s.type, label: s.label })),
    ...manual.map((m, i) => ({ id: m.id, src: 'manual' as const, order: m.pos ?? 1e6 + 5e5 + i, grp: m.grp, circuit_id: m.circuit_id, type: m.type, label: m.label, n: m.n })),
  ];
}

export async function projectLoads(pid: string): Promise<DiagramSymbol[]> {
  const [syms, manual] = await Promise.all([planSymbolRows(pid), schemaLoadsOf(pid)]);
  return toDiagramLoads(syms, manual);
}

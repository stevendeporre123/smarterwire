// Materiaallijst (BOM) voor de nieuwe kast(en), afgeleid uit de toestellen. Merk/serie en referentie vult de installateur zelf in
// (bewaard per omschrijving); regels met `est` zijn schattingen (rail, klemmen, labels).
import type { Board, Circuit, Device } from './model';
import { DEVICE_KINDS, deviceTitle, normPoles, polesText } from './devices';

export interface BomLine { key: string; group: 'Beveiliging' | 'Kast en toebehoren'; description: string; qty: number; est?: boolean; note?: string }
export interface BomEntry { brand?: string; ref?: string }

const kA = (d: Device) => (d.breaking_ka ?? 3);

function describe(d: Device): { group: BomLine['group']; description: string } {
  const poles = d.poles ? polesText(normPoles(d.poles)) : '';
  switch (d.kind) {
    case 'differentieel': {
      const sel = /selectief|type S/i.test(`${d.notes ?? ''} ${d.label ?? ''}`) ? ' selectief (S)' : '';
      return { group: 'Beveiliging', description: `Differentieelschakelaar ${poles} ${d.rating_a ?? '?'}A ${d.sens_ma ?? 30}mA type ${d.dtype ?? 'A'}${sel}`.replace(/\s+/g, ' ') };
    }
    case 'automaat': return { group: 'Beveiliging', description: `Automaat ${poles} ${d.curve ?? 'C'}${d.rating_a ?? '?'}A ${kA(d)}kA`.replace(/\s+/g, ' ') };
    case 'aardlekautomaat': return { group: 'Beveiliging', description: `Aardlekautomaat ${poles} ${d.curve ?? 'C'}${d.rating_a ?? '?'}A ${d.sens_ma ?? 30}mA type ${d.dtype ?? 'A'}`.replace(/\s+/g, ' ') };
    default: return { group: 'Beveiliging', description: `${DEVICE_KINDS[d.kind]?.label ?? deviceTitle(d)} ${poles}${d.rating_a ? ` ${d.rating_a}A` : ''}`.replace(/\s+/g, ' ').trim() };
  }
}

/** Materiaallijst van alle nieuwe kasten van het project. */
export function buildBom(boards: Board[], devices: Device[], circuits: Circuit[]): BomLine[] {
  const nieuw = boards.filter((b) => b.kind === 'nieuw');
  const ids = new Set(nieuw.map((b) => b.id));
  const mine = devices.filter((d) => ids.has(d.board_id));
  const map = new Map<string, BomLine>();
  for (const d of mine) {
    const { group, description } = describe(d);
    const l = map.get(description) ?? map.set(description, { key: description, group, description, qty: 0 }).get(description)!;
    l.qty++;
  }
  const lines = [...map.values()].sort((a, b) => (a.description.startsWith('Differentieel') ? 0 : 1) - (b.description.startsWith('Differentieel') ? 0 : 1) || a.description.localeCompare(b.description, 'nl', { numeric: true }));
  for (const b of nieuw) {
    const ds = mine.filter((d) => d.board_id === b.id);
    if (!ds.length) continue;
    const rows = new Map<number, number>();
    for (const d of ds) rows.set(d.row_no, (rows.get(d.row_no) ?? 0) + (d.modules || 1));
    const widest = Math.max(...rows.values());
    lines.push({ key: `kast:${b.id}`, group: 'Kast en toebehoren', description: `Verdeelkast "${b.name}": ${rows.size} rij(en), minstens ${widest} modules breed (plus reserve)`, qty: 1, est: true, note: 'kies de kast groot genoeg voor de gewenste reserve' });
    lines.push({ key: `rail:${b.id}`, group: 'Kast en toebehoren', description: `DIN-rail voor "${b.name}"`, qty: rows.size, est: true });
    lines.push({ key: `klem:${b.id}`, group: 'Kast en toebehoren', description: `Nulklemmenblok en aardingsklemmenblok voor "${b.name}"`, qty: 2, est: true });
  }
  const nCirc = circuits.filter((c) => c.new_device_id && ids.size && mine.some((d) => d.id === c.new_device_id)).length;
  if (nCirc) lines.push({ key: 'labels', group: 'Kast en toebehoren', description: 'Kringlabels / opschriften', qty: nCirc, est: true });
  return lines;
}

/** CSV (puntkomma, UTF-8 met BOM zodat Excel de accenten goed leest). */
export function bomCsv(lines: BomLine[], entries: Record<string, BomEntry>): string {
  const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Aantal', 'Omschrijving', 'Merk / serie', 'Referentie', 'Opmerking'], ...lines.map((l) => [l.qty, l.description, entries[l.key]?.brand ?? '', entries[l.key]?.ref ?? '', l.est ? `schatting${l.note ? ' – ' + l.note : ''}` : l.note ?? ''])];
  return '﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n');
}

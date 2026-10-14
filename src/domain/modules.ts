// Foto-realistische DIN-modules voor de virtuele kast (uit symbols/verdeelkastelementen.svg, geknipt met tools/split-modules.mjs).
import index from '../../symbols/modules/index.json';
import type { Device } from './model';
import { normPoles } from './devices';

const urls = import.meta.glob('../../symbols/modules/{automaat,differentieel,overspanning}-*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const urlOf = (name: string) => urls[`../../symbols/modules/${name}.svg`];
const dims = (name: string) => index.find((m) => m.name === name)!;

/** Breedte van 1 module in de brontekening (Visio-eenheden); `unit` in de kast = px per module. */
export const SRC_UNIT = 62.5;

export interface ModuleArt {
  url: string; w: number; h: number;
  /** vlak (fractie van breedte/hoogte) waar het originele opschrift staat; wordt overschilderd met ons eigen label */
  label?: { x: number; y: number; w: number; h: number; lines: string[] };
}

const art = (name: string, label?: { x: number; y: number; w: number; h: number; lines: string[] }): ModuleArt | null => {
  const url = urlOf(name);
  return url ? { url, w: dims(name).w, h: dims(name).h, label } : null;
};

/** Kies de foto waarvan de natuurlijke breedte het best bij het aantal modules past; de breedte wordt daarna exact uitgerekt. */
const nearest = (names: string[], modules: number) =>
  names.reduce((best, n) => (Math.abs(dims(n).modules - modules) < Math.abs(dims(best).modules - modules) ? n : best), names[0]);

export function moduleArt(d: Pick<Device, 'kind' | 'poles' | 'rating_a' | 'curve' | 'sens_ma' | 'modules'>): ModuleArt | null {
  const amp = d.rating_a ? `${d.rating_a}A` : '', m = d.modules || 1;
  if (d.kind === 'automaat') return art(nearest(['automaat-C16', 'automaat-1pn-C16', 'automaat-2p-C16'], m), { x: 0.06, y: 0.2, w: 0.7, h: 0.17, lines: [`${d.curve ?? ''}${d.rating_a ?? ''}`] });
  if (d.kind === 'differentieel' || d.kind === 'aardlekautomaat')
    return art(nearest(['differentieel-2p-40A-300mA', 'differentieel-4p-40A-300mA'], m), { x: 0.04, y: 0.2, w: 0.92, h: 0.27, lines: [amp, d.sens_ma ? `${d.sens_ma}mA` : ''].filter(Boolean) });
  if (d.kind === 'overspanning') {
    const p = normPoles(d.poles);
    return art(p === '4P' ? 'overspanning-4p' : p === '3P' ? 'overspanning-3p' : 'overspanning-1p');
  }
  return null;
}

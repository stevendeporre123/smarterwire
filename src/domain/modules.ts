// Foto-realistische DIN-modules voor de virtuele kast (uit symbols/verdeelkastelementen.svg, geknipt met tools/split-modules.mjs).
import index from '../../symbols/modules/index.json';
import type { Device } from './model';

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

export function moduleArt(d: Pick<Device, 'kind' | 'poles' | 'rating_a' | 'curve' | 'sens_ma'>): ModuleArt | null {
  const amp = d.rating_a ? `${d.rating_a}A` : '';
  if (d.kind === 'automaat') {
    const base = d.poles === '2P' ? 'automaat-2p-C16' : d.poles === '1P+N' ? 'automaat-1pn-C16' : d.poles === '1P' || !d.poles ? 'automaat-C16' : null;
    return base && art(base, { x: 0.06, y: 0.2, w: 0.7, h: 0.17, lines: [`${d.curve ?? ''}${d.rating_a ?? ''}`] });
  }
  if (d.kind === 'differentieel' || d.kind === 'aardlekautomaat') {
    const four = d.poles === '4P' || d.poles === '3P+N' || d.poles === '3P';
    const base = four ? 'differentieel-4p-40A-300mA' : 'differentieel-2p-40A-300mA';
    return art(base, { x: 0.04, y: 0.2, w: 0.92, h: 0.27, lines: [amp, d.sens_ma ? `${d.sens_ma}mA` : ''].filter(Boolean) });
  }
  if (d.kind === 'overspanning') {
    const base = d.poles === '4P' ? 'overspanning-4p' : d.poles === '3P' || d.poles === '3P+N' ? 'overspanning-3p' : 'overspanning-1p';
    return art(base);
  }
  return null;
}

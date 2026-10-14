import type { Circuit, Device } from './model';

/** Componentenset: meerdere onderdelen op één rij van een kring (bv. schakelaar gevolgd door lamp). */
export interface LoadSet { kind: 'load'; id: string; label: string; types: string[] }
/** Componentenset: een volledige kring (automaat + leiding, eventueel met onderdelen erop). */
export interface CircuitSet { kind: 'circuit'; id: string; label: string; device: Partial<Device>; circuit: Partial<Circuit>; rows?: string[][] }
export type ComponentSet = LoadSet | CircuitSet;

const SW = 'Schakelaar algemeen symbool', WISSEL = 'Enkelpolige wisselschakelaar', LAMP = 'Verlichtingstoestel';
const cable = (section: number): Partial<Circuit> => ({ cable_type: 'XVB', fire_class: 'Cca', wires: 3, section_mm2: section, has_earth: 1, install: 'In wand', voltage: 230 });

export const SETS: ComponentSet[] = [
  { kind: 'circuit', id: 'kring-stopcontacten-c16', label: 'Stopcontacten · C16 + XVB Cca 3G2,5', device: { rating_a: 16, curve: 'C', poles: '2P' }, circuit: { ...cable(2.5), func: 'Stopcontacten' } },
  { kind: 'circuit', id: 'kring-stopcontacten-c20', label: 'Stopcontacten · C20 + XVB Cca 3G2,5', device: { rating_a: 20, curve: 'C', poles: '2P' }, circuit: { ...cable(2.5), func: 'Stopcontacten' } },
  { kind: 'circuit', id: 'kring-verlichting', label: 'Verlichting · C10 + XVB Cca 3G1,5 + schakelaar en lamp', device: { rating_a: 10, curve: 'C', poles: '2P' }, circuit: { ...cable(1.5), func: 'Verlichting' }, rows: [[SW, LAMP]] },
  { kind: 'circuit', id: 'kring-wasmachine', label: 'Wasmachine · C20 + XVB Cca 3G2,5', device: { rating_a: 20, curve: 'C', poles: '2P' }, circuit: { ...cable(2.5), func: 'Wasmachine' } },
  { kind: 'circuit', id: 'kring-kookplaat', label: 'Kookplaat · C32 + XVB Cca 3G6', device: { rating_a: 32, curve: 'C', poles: '2P' }, circuit: { ...cable(6), func: 'Kookplaat' } },
  { kind: 'load', id: 'sw-lamp', label: 'Schakelaar + lamp', types: [SW, LAMP] },
  { kind: 'load', id: 'sw-lamp-lamp', label: 'Schakelaar + 2 lampen', types: [SW, LAMP, LAMP] },
  { kind: 'load', id: 'wissel-lamp', label: 'Wisselschakeling (2 schakelaars) + lamp', types: [WISSEL, WISSEL, LAMP] },
];

export const setById = (id: string) => SETS.find((s) => s.id === id);

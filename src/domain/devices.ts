export const DEVICE_KINDS: Record<string, { label: string; short: string; protective: boolean }> = {
  hoofd: { label: 'Hoofdschakelaar / hoofdautomaat', short: 'HS', protective: true },
  differentieel: { label: 'Differentieelschakelaar', short: 'ID', protective: true },
  automaat: { label: 'Automaat', short: 'A', protective: true },
  aardlekautomaat: { label: 'Aardlekautomaat (RCBO)', short: 'AA', protective: true },
  smelt: { label: 'Smeltveiligheid / patroon', short: 'S', protective: true },
  overspanning: { label: 'Overspanningsbeveiliging', short: 'OB', protective: true },
  contactor: { label: 'Contactor / teleruptor', short: 'C', protective: false },
  schakelaar: { label: 'Schakelaar / tijdschakelaar', short: 'SW', protective: false },
  trafo: { label: 'Transformator / voeding', short: 'T', protective: false },
  anders: { label: 'Anders', short: '?', protective: false },
};

/** Toestellen waar kringen onder kunnen hangen (geen verdeler-niveau). */
export const isGroupParent = (kind: string) => kind === 'differentieel' || kind === 'hoofd';
export const isFeeder = (kind: string) => kind !== 'differentieel' && kind !== 'hoofd' && kind !== 'overspanning';

export const CURVES = ['B', 'C', 'D'];
export const POLES = ['1P', '1P+N', '2P', '3P', '3P+N', '4P'];
export const DIFF_TYPES = ['AC', 'A', 'F', 'B'];
export const FUNCTIONS = [
  'Verlichting', 'Stopcontacten', 'Kookplaat', 'Oven', 'Wasmachine', 'Droogkast', 'Vaatwasser',
  'Boiler', 'Verwarming', 'Airco / warmtepomp', 'Laadpaal', 'Buiten', 'Bel / laagspanning', 'Andere',
];
export const CABLE_TYPES = ['VOB', 'XVB', 'XGB', 'EXVB', 'XVB-F2', 'H07V-U', 'H07V-K', 'YMvK', 'Onbekend'];
export const FIRE_CLASSES = ['Eca', 'Dca', 'Cca', 'B2ca', 'Fca', 'Onbekend'];
export const INSTALL_MODES = ['In muur', 'Op muur', 'In buis', 'Los'];
export const SUPPLIES = [{ value: '1x230', label: 'Monofasig 230 V' }, { value: '3N400', label: 'Driefasig 3N 400 V' }, { value: '3x230', label: 'Driefasig 3x230 V (geen nul)' }];
export const PHASES = ['L1', 'L2', 'L3', '3P'];
export const INSPECTORS = ['AIB-Vinçotte', 'BTV', 'Technics', 'SECO', 'Vinçotte'];
export const SECTIONS = [1.5, 2.5, 4, 6, 10, 16];
export const STATUSES = ['onbekend', 'gedocumenteerd', 'gecontroleerd'];

/** Gangbare maximum-zekering per kabeldoorsnede (voorstel; altijd zelf nakijken). */
export const DEFAULT_RATING_FOR_SECTION: Record<number, number> = { 1.5: 10, 2.5: 16, 4: 25, 6: 32, 10: 40, 16: 63 };

export function deviceTitle(d: { kind: string; label?: string | null; rating_a?: number | null; curve?: string | null; sens_ma?: number | null }) {
  const bits: (string | number | null | undefined)[] = [d.label];
  if (d.rating_a) bits.push(`${d.curve ?? ''}${d.rating_a}A`);
  else if (d.curve) bits.push(d.curve);
  if (d.sens_ma) bits.push(`${d.sens_ma}mA`);
  const t = bits.filter(Boolean).join(' ');
  return t || DEVICE_KINDS[d.kind]?.label.split(' ')[0] || 'Toestel';
}

const dec = (n: number) => String(n).replace('.', ',');

/** Een kabel is pas volledig als type, doorsnede, brandklasse en plaatsing gekend zijn. */
export function cableMissing(c: { cable_type?: string | null; section_mm2?: number | null; fire_class?: string | null; install?: string | null }): string[] {
  const m: string[] = [];
  if (!c.cable_type || c.cable_type === 'Onbekend') m.push('type');
  if (!c.section_mm2) m.push('doorsnede');
  if (!c.fire_class || c.fire_class === 'Onbekend') m.push('brandklasse');
  if (!c.install) m.push('plaatsing');
  return m;
}

/** "VOB Eca 3G2,5 · in buis" */
export function cableLabel(c: { cable_type?: string | null; section_mm2?: number | null; fire_class?: string | null; install?: string | null; wires?: number | null }): string {
  const core = c.section_mm2 ? `${c.wires ? c.wires + 'G' : ''}${dec(c.section_mm2)}` : '';
  const main = [c.cable_type, c.fire_class && c.fire_class !== 'Onbekend' ? c.fire_class : '', core].filter(Boolean).join(' ');
  return [main, c.install?.toLowerCase()].filter(Boolean).join(' · ');
}

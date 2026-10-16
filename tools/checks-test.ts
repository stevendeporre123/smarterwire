// Controles op het testproject uit de issues (#12): npx vite --config tools/vite.test.config.ts → /tools/checks-test.html
import { runChecks } from '../src/domain/checks';
const dev = (id: string, o: any) => ({ id, board_id: 'b', row_no: 0, pos: 0, modules: 1, ...o });
const devices: any[] = [
  dev('h', { kind: 'hoofd', rating_a: 40, poles: '2P' }),
  dev('d1', { kind: 'differentieel', sens_ma: 30, dtype: 'A', parent_id: 'h', rating_a: 40 }),
  dev('d2', { kind: 'differentieel', sens_ma: 30, dtype: 'AC', parent_id: 'h', rating_a: 40 }),
  dev('a', { kind: 'automaat', rating_a: 16, curve: 'B', parent_id: 'd1' }),
  dev('e', { kind: 'automaat', rating_a: 20, curve: 'C', parent_id: 'd2' }),
];
const c = (id: string, nr: string, name: string, device_id: string, o: any = {}) => ({ id, project_id: 'p', nr, name, device_id, status: 'onbekend', ...o });
const circuits: any[] = [
  c('c1', 'A', 'Stopcontacten living', 'a', { func: 'Stopcontacten', cable_type: 'VOB', section_mm2: 1.5, fire_class: 'Cca', install: 'In wand', wires: 3, has_earth: 1 }),
  c('c2', 'E', 'Wasmachine + droogkast', 'e', { func: 'Wasmachine', cable_type: 'VOB', section_mm2: 2.5, fire_class: 'Cca', install: 'In wand', wires: 3, has_earth: 1 }),
];
const loads: any[] = [{ circuit_id: 'c1', type: 'Stopcontact#2' }, { circuit_id: 'c2', type: 'Wasmachine' }];
document.getElementById('o')!.textContent = runChecks({ circuits, devices, loads }).map((f) => `[${f.level}] ${f.title}\n    ${f.why}\n    → ${f.fix}`).join('\n\n');

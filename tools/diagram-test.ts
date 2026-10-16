// Handmatige test: npx vite  →  http://localhost:5173/tools/diagram-test.html
import { buildSingleLineSvg } from '../src/domain/diagram';
const b = { id: 'b1', project_id: 'p', name: 'Hoofdkast', kind: 'nieuw' } as any;
const mk = (id: string, o: any) => ({ id, board_id: 'b1', row_no: 0, pos: 0, modules: 1, ...o });
const devices = [
  mk('h', { kind: 'hoofd', poles: '2P', rating_a: 63, row_no: 0 }),
  mk('d1', { kind: 'differentieel', poles: '2P', rating_a: 40, sens_ma: 30, dtype: 'A', parent_id: 'h', row_no: 1, label: 'ID1' }),
  mk('a1', { kind: 'automaat', poles: '1P+N', curve: 'B', rating_a: 16, parent_id: 'd1', row_no: 1, pos: 1, breaking_ka: 3 }),
  mk('a2', { kind: 'automaat', poles: '1P+N', curve: 'B', rating_a: 16, parent_id: 'd1', row_no: 1, pos: 2, breaking_ka: 3 }),
  mk('a3', { kind: 'automaat', poles: '1P+N', curve: 'C', rating_a: 20, parent_id: 'd1', row_no: 1, pos: 3, breaking_ka: 3 }),
  mk('d2', { kind: 'differentieel', poles: '2P', rating_a: 40, sens_ma: 30, dtype: 'A', parent_id: 'h', row_no: 2, label: 'ID2' }),
  mk('a4', { kind: 'automaat', poles: '1P+N', curve: 'C', rating_a: 32, parent_id: 'd2', row_no: 2, pos: 1, breaking_ka: 3 }),
  mk('a5', { kind: 'automaat', poles: '1P+N', curve: 'C', rating_a: 20, parent_id: 'd2', row_no: 2, pos: 2, breaking_ka: 3 }),
  mk('s1', { kind: 'overspanning', poles: '2P', parent_id: 'h', row_no: 3 }),
] as any[];
const c = (id: string, nr: string, name: string, dev: string, extra: any = {}) => ({ id, nr, name, new_device_id: dev, project_id: 'p', status: 'onbekend', cable_type: 'VOB', fire_class: 'Cca', section_mm2: 1.5, wires: 3, install: 'In wand', ...extra }) as any;
const circuits = [c('c1', 'A', 'Verlichting living', 'a1'), c('c2', 'B', 'Stopcontacten living', 'a2', { section_mm2: 2.5 }), c('c3', 'C', 'Keuken', 'a3', { section_mm2: 2.5 }), c('c4', 'D', 'Kookplaat', 'a4', { section_mm2: 6, wires: 5 }), c('c5', 'E', 'Boiler', 'a5', { section_mm2: 2.5 })];
const sym = (cid: string, type: string, label = '') => ({ circuit_id: cid, type, label });
const symbols = [sym('c1', 'lichtpunt', 'living'), sym('c1', 'lichtpunt', 'living'), sym('c1', 'schakelaar', 'living'), sym('c1', 'wissel', 'gang'), sym('c1', 'lichtpunt_wand', 'keuken'),
  sym('c2', 'stopcontact', 'living'), sym('c2', 'stopcontact', 'living'), sym('c2', 'stopcontact', 'living'), sym('c2', 'stopcontact2', 'tv'), sym('c3', 'stopcontact', 'keuken'), sym('c3', 'stopcontact_ik', 'keuken'),
  sym('c4', 'kookplaat', 'keuken'), sym('c5', 'boiler', 'berging'), sym('c5', 'stopcontact', 'berging')];
document.getElementById('o')!.innerHTML = buildSingleLineSvg({ title: 'Eendraadschema – test', boards: [{ board: b, devices }], circuits, symbols, which: 'nieuw', supply: '1x230', supplyAmp: 40, ean: '541449200000000000', meta: ['Testproject'] });

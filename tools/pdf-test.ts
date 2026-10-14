// PDF-test met voorbeeldgegevens (zonder database). Bouwen: npx vite build -c tools/vite.test.config.ts
import '../src/styles/tokens.css';
import '../src/styles/app.css';
import photoUrl from '../reference/oude_kast.jpeg?url';
import { buildPdfPages, type PdfData } from '../src/domain/pdfpages';
import { INSPECTOR_PRESETS } from '../src/domain/devices';

const b1: any = { id: 'b1', project_id: 'p', name: 'Hoofdkast', kind: 'bestaand', asset_id: 'x' };
const dev = (id: string, o: any) => ({ id, board_id: 'b1', row_no: 0, pos: 0, modules: 1, ...o });
const devices: any[] = [
  dev('h', { kind: 'differentieel', poles: '4P', rating_a: 40, sens_ma: 300, dtype: 'A', row_no: 0 }),
  dev('d1', { kind: 'differentieel', poles: '4P', rating_a: 40, sens_ma: 30, dtype: 'A', parent_id: 'h', row_no: 1, label: 'ID1' }),
  dev('d2', { kind: 'differentieel', poles: '2P', rating_a: 40, sens_ma: 30, dtype: 'A', parent_id: 'h', row_no: 2, label: 'ID2' }),
];
const names = ['Garage internet stct', 'Living stct + brander', 'Garage stct rechts', 'Verlichting keuken + garage + stct keuken', 'Verlichting + stct slaapkamers', 'reserve', 'reserve', 'Verlichting + stct Aanbouw', 'Diepvries + wasmachine', 'Verlichting + stct badkamer en bureau', 'Verlichting + Stopcontacten living', 'verlichting hall + wc', 'Fornuis + stct keuken', 'Verlichting buiten straatkant', 'reserve'];
const circuits: any[] = names.map((name, i) => {
  const id = 'a' + i, parent = i < 7 ? 'd1' : i < 12 ? 'd2' : 'h';
  devices.push(dev(id, { kind: 'automaat', poles: '1P+N', curve: 'C', rating_a: i === 12 ? 25 : i === 0 ? 20 : 16, breaking_ka: 3, parent_id: parent, row_no: 3, pos: i, phase: 'L' + ((i % 3) + 1) }));
  return { id: 'c' + i, project_id: 'p', nr: String.fromCharCode(65 + i), name, device_id: id, cable_type: 'VOB', fire_class: 'Cca', section_mm2: i === 12 ? 6 : 2.5, wires: 3, install: 'In wand', status: 'onbekend' };
});
const symbols: any[] = [];
const sym = (c: number, type: string, label = '') => symbols.push({ circuit_id: 'c' + c, type, label });
sym(0, 'Stopcontact'); sym(1, 'Stopcontact#2', 'living'); sym(3, 'lichtpunt', 'keuken'); sym(3, 'lichtpunt', 'garage'); sym(3, 'Stopcontact', 'keuken'); sym(4, 'lichtpunt', 'slaapkamer'); sym(4, 'Stopcontact#3', 'slaapkamer'); sym(12, 'kookplaat', 'keuken');
const mkShape = (kind: string, x1: number, y1: number, x2: number, y2: number, o: any = {}) => ({ id: Math.random().toString(36).slice(2), plan_id: 'pl', kind, x1, y1, x2, y2, flip: 0, rot: 0, ...o });
const w1 = mkShape('wall', 300, 300, 1500, 300, { thick: 0.2 }), w2 = mkShape('wall', 1500, 300, 1500, 1200, { thick: 0.2 }), w3 = mkShape('wall', 1500, 1200, 300, 1200, { thick: 0.2 }), w4 = mkShape('wall', 300, 1200, 300, 300, { thick: 0.2 });
const shapes: any[] = [w1, w2, w3, w4, mkShape('door', 0, 0, 0, 0, { ref_id: w1.id, pos: 0.3, size: 0.9 }), mkShape('window', 0, 0, 0, 0, { ref_id: w2.id, pos: 0.5, size: 1.2 }), mkShape('text', 700, 800, 0, 0, { label: 'KEUKEN', size: 0.4 }), mkShape('cable', 600, 600, 1200, 600, { sub: 'wand', ref_id: 'c3' })];
const plSyms: any[] = [
  { id: 's1', plan_id: 'pl', type: 'Stopcontact', x: 315 / 3000, y: 500 / 2100, rot: 0, circuit_id: 'c0' },
  { id: 's2', plan_id: 'pl', type: 'Stopcontact#2', x: 1485 / 3000, y: 700 / 2100, rot: 180, circuit_id: 'c1' },
  { id: 's3', plan_id: 'pl', type: 'lichtpunt', x: 900 / 3000, y: 600 / 2100, rot: 0, circuit_id: 'c3', label: 'keuken' },
  { id: 's4', plan_id: 'pl', type: 'Stopcontact#3', x: 800 / 3000, y: 1185 / 2100, rot: -90, circuit_id: 'c4' },
];
const data: PdfData = {
  project: { id: 'p', name: 'Agnes Verbruggen', owner: 'Agnes Verbruggen', address: 'Scheldeweg 57\n9090 Merelbeke-Melle', supply: '3N400', supply_amp: 20, inspector: 'Keurtech', inspector_info: INSPECTOR_PRESETS.Keurtech, ean: '541449200000000000', updated_at: 0 } as any,
  installer: { name: 'Steven De Porre - Smarterhomes', address: 'Petrus De Broestraat 12\n9030 Gent', phone: '0491 59 92 67', email: 'steven@smarterhomes.be', vat: 'BE 0896.971.767', logo: '' },
  boards: [b1], devices, circuits, symbols,
  plans: [{ plan: { id: 'pl', project_id: 'p', name: 'Gelijkvloers', w: 3000, h: 2100, scale: 150 } as any, shapes, symbols: plSyms, photoUrl: null }],
  photos: [{ board: b1, url: photoUrl, w: 800, h: 600 }, { board: { ...b1, name: 'Nieuwe opstelling' }, url: photoUrl, w: 800, h: 600 }],
};
const pages = buildPdfPages(data, { states: ['bestaand'], plans: true, photos: true, list: true, photoOnPlans: false });
document.getElementById('print-root')!.innerHTML = pages.map((p) => `<section class="pdf-page" style="margin:0 auto 8px;background:#fff">${p}</section>`).join('');
document.title = pages.length + ' pagina’s';

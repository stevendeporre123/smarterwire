// Voorstel nieuwe kast (klantdocument) met voorbeeldgegevens: npx vite --config tools/vite.test.config.ts → /tools/proposal-test.html
import '../src/styles/tokens.css';
import '../src/styles/app.css';
import { buildPdfPages, type PdfData } from '../src/domain/pdfpages';

const b1: any = { id: 'b1', project_id: 'p', name: 'Hoofdkast', kind: 'bestaand' }, b2: any = { id: 'b2', project_id: 'p', name: 'Hoofdkast (nieuw)', kind: 'nieuw', src_board_id: 'b1' };
const dev = (id: string, board: string, o: any) => ({ id, board_id: board, row_no: 0, pos: 0, modules: 1, ...o });
const devices: any[] = [dev('h', 'b1', { kind: 'differentieel', poles: '4P', rating_a: 40, sens_ma: 300, dtype: 'AC', modules: 4 })];
const names = ['Stopcontacten living', 'Verlichting beneden', 'Wasmachine + droogkast', 'Kookplaat', 'Boiler', 'Stopcontacten keuken', 'Verlichting boven', 'Stopcontacten slaapkamers'];
const circuits: any[] = [];
devices.push(dev('n0', 'b2', { kind: 'differentieel', poles: '2P', rating_a: 40, sens_ma: 300, dtype: 'A', modules: 2, label: 'Hoofddifferentieel S', notes: 'selectief (type S)' }));
devices.push(dev('n1', 'b2', { kind: 'differentieel', poles: '2P', rating_a: 40, sens_ma: 30, dtype: 'A', modules: 2, label: 'ID1', parent_id: 'n0', pos: 1 }));
names.forEach((name, i) => {
  devices.push(dev('o' + i, 'b1', { kind: 'automaat', poles: '2P', curve: 'B', rating_a: 16, row_no: 1, pos: i, parent_id: 'h' }));
  devices.push(dev('m' + i, 'b2', { kind: 'automaat', poles: '2P', curve: 'C', rating_a: i === 3 ? 32 : i === 4 ? 20 : 16, parent_id: 'n1', row_no: 0, pos: 2 + i, breaking_ka: 6 }));
  circuits.push({ id: 'c' + i, project_id: 'p', nr: String.fromCharCode(65 + i), name, device_id: 'o' + i, new_device_id: 'm' + i, func: i === 3 ? 'Kookplaat' : i === 0 ? 'Stopcontacten' : 'Verlichting', cable_type: 'VOB', section_mm2: i === 0 ? 1.5 : 2.5, wires: 3, has_earth: 1, fire_class: 'Cca', install: 'In wand', status: 'gedocumenteerd' });
});
const data: PdfData = {
  project: { id: 'p', name: 'Testproject', owner: 'Familie Janssens', client: 'Familie Janssens', address: 'Voorbeeldstraat 1\n9000 Gent', supply: '1x230', supply_amp: 40, ean: '541449200000000000', updated_at: 0 } as any,
  installer: { name: 'Smarterhomes', address: 'Gent', phone: '0491 00 00 00', email: 'info@example.be', vat: 'BE 0000.000.000', logo: '' },
  boards: [b1, b2], devices, circuits, symbols: [{ circuit_id: 'c0', type: 'Stopcontact#2', id: 's', src: 'plan', order: 1 } as any], plans: [], photos: [],
  bomEntries: { 'Differentieelschakelaar 2-polig 40A 30mA type A': { brand: 'Hager', ref: 'CDA240D' } },
};
const pages = buildPdfPages(data, { states: ['nieuw'], plans: false, photos: false, list: false, photoOnPlans: false, proposal: true });
document.getElementById('print-root')!.innerHTML = pages.map((p) => `<section class="pdf-page" style="margin:0 auto 8px;background:#fff">${p}</section>`).join('');
document.title = pages.length + ' pagina’s';

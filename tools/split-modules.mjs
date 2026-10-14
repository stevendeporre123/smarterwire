// Knipt symbols/verdeelkastelementen.svg (Visio-export, 1 pagina) in losse module-SVG's in symbols/modules/.
// Gebruik: node tools/split-modules.mjs   (vereist Chrome of Edge om de bounding boxes te meten)
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SRC = 'symbols/verdeelkastelementen.svg';
const OUT = 'symbols/modules';
const UNIT = 62.5; // breedte van 1 DIN-module in het Visio-bestand

// Vaste namen voor de bruikbare onderdelen (mNNN = volgorde in het Visio-bestand).
const NAMES = {
  m005: 'automaat-C2', m000: 'automaat-C4', m008: 'automaat-C6', m010: 'automaat-C10', m009: 'automaat-C16', m011: 'automaat-C20',
  m006: 'automaat-C25', m012: 'automaat-C32', m087: 'automaat-C40', m088: 'automaat-C50', m089: 'automaat-C63',
  m057: 'automaat-1pn-C16', m093: 'automaat-1pn-C25', m055: 'automaat-2p-C16', m092: 'automaat-2p-C25',
  m004: 'differentieel-2p-40A-30mA', m003: 'differentieel-2p-40A-300mA', m022: 'differentieel-4p-40A-30mA', m007: 'differentieel-4p-40A-300mA',
  m001: 'overspanning-1p', m002: 'overspanning-1p-b', m023: 'overspanning-3p', m024: 'overspanning-4p',
  m021: 'voeding-meanwell-dr-60-24', m059: 'trafo-8v-12v', m104: 'trafo-12v-24v',
  m060: 'contactor-siemens-5tt5', m061: 'contactor-siemens-5tt5-hulp', m112: 'contactor-ctx-20a', m094: 'relais-schrack', m098: 'relais-schrack-b',
  m096: 'schakelaar-16a-1', m097: 'schakelaar-16a-2', m095: 'impulsrelais-290', m099: 'impulsrelais-290-b', m100: 'contactor-plts',
  m025: 'tijdrelais-finder-80-41', m026: 'tijdrelais-tempolec', m027: 'trappenlichtschakelaar-theben-elpa7', m028: 'trappenlichtschakelaar-schneider',
  m039: 'trappenlichtschakelaar-elpa8', m053: 'multifunctioneel-tijdrelais',
  m029: 'eltako-relais-a', m030: 'eltako-relais-b', m062: 'eltako-esr12ddx', m064: 'eltako-relais-c',
  m054: 'theben-tm345m', m058: 'niko-330-00701', m108: 'schemerschakelaar-merlin-gerin-ic200',
  m105: 'logo-basis', m106: 'logo-dm8', m107: 'logo-dm16',
  m113: 'dimmer-theben-dimax-544', m114: 'dimmer-niko-310-0280', m115: 'dimmer-niko-310-0130', m116: 'dimmer-niko-310-0130-b',
  m032: 'inbouw-schakelaar-1', m033: 'inbouw-schakelaar-2', m034: 'inbouw-schakelaar-3', m035: 'inbouw-schakelaar-4',
  m036: 'inbouw-schakelaar-5', m037: 'inbouw-schakelaar-6', m038: 'inbouw-schakelaar-7',
  m084: 'kam-1p-n-3x', m085: 'kam-3p-n-6x', m086: 'kam-3p', m056: 'kam-1p-n-8x', m123: 'kam-3p-n-6', m141: 'kam-3p-n-18', m178: 'kam-3p-n-5',
  m019: 'blindmodules', m020: 'aardingsklemmenstrip', m090: 'lamp-aan', m091: 'lamp-uit',
  m117: 'ballast-vosslohschwabe', m118: 'starter-philips', m119: 'starter-noxion', m120: 'tl-led-philips', m121: 'tl-osram',
  m109: 'bewegingsmelder-sensor', m110: 'bewegingsmelder-theben', m122: 'bewegingsmelder-plafond',
};

const browser = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!browser) throw new Error('Geen Chrome/Edge gevonden');

const svg = readFileSync(SRC, 'utf8');
const vb = svg.match(/viewBox="([\d. -]+)"/)[1].split(/\s+/).map(Number);

// 1) bounding boxes meten in de browser (SVG als XML laden zodat v:groupContext behouden blijft; 1 eenheid = 1 px)
const script = `<script type="text/javascript"><![CDATA[
const page = [...document.querySelectorAll('g')].find(g => g.getAttribute('v:groupContext') === 'foregroundPage');
const rr = document.documentElement.getBoundingClientRect();
const res = [];
[...page.children].filter(e => e.localName === 'g').forEach((e, i) => {
  const r = e.getBoundingClientRect();
  const texts = [...e.querySelectorAll('text')].map(t => t.textContent.trim()).filter(Boolean).join(' ');
  res.push({ i, id: e.id, x: r.x - rr.x, y: r.y - rr.y, w: r.width, h: r.height, texts });
});
const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
t.textContent = 'JSON' + JSON.stringify(res) + 'JSON';
document.documentElement.appendChild(t);
]]></script>`;
const doc = svg.replace(/width="[^"]*in" height="[^"]*in"/, `width="${vb[2]}" height="${vb[3]}"`).replace('</svg>', script + '</svg>');
const tmp = join(tmpdir(), 'split-modules.svg');
writeFileSync(tmp, doc);
const dom = execFileSync(browser, ['--headless', '--disable-gpu', '--dump-dom', 'file:///' + tmp.split(String.fromCharCode(92)).join('/')], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
const items = JSON.parse(dom.match(/JSON(\[.*?\])JSON/s)[1]);

// 2) elk benoemd element als eigen SVG
const head = svg.slice(0, svg.indexOf('<g v:mID="0"'));
const body = svg.slice(svg.indexOf('<g v:mID="0"'));
const styleLines = head.match(/\t\t\.st\d+ \{[^\n]*\}/g) ?? [];
const markerDefs = head.match(/<g id="lend\d+">[\s\S]*?<\/g>\s*<marker[\s\S]*?<\/marker>/g) ?? [];

function grab(id) {
  const s = body.indexOf(`<g id="${id}"`);
  let depth = 0;
  const re = /<g[\s>]|<\/g>/g;
  re.lastIndex = s;
  for (let m; (m = re.exec(body)); ) {
    depth += m[0] === '</g>' ? -1 : 1;
    if (depth === 0) return body.slice(s, m.index + 4);
  }
  throw new Error('onafgesloten groep ' + id);
}

// Enkel de stijlen en markers meenemen die het element echt gebruikt (houdt de bestanden klein).
function slim(el) {
  const used = new Set((el.match(/class="[^"]*"/g) ?? []).flatMap((c) => c.slice(7, -1).split(/\s+/)));
  const css = styleLines.filter((l) => used.has(l.match(/\.(st\d+)/)[1])).join('\n');
  const marks = new Set(el.match(/mrkr[\w-]+/g) ?? []);
  const defs = markerDefs.filter((d) => [...marks].some((m) => d.includes(`id="${m}"`))).join('\n');
  return `<style type="text/css"><![CDATA[\n${css}\n]]></style>\n${defs ? `<defs>\n${defs}\n</defs>\n` : ''}`;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const index = [];
for (const it of items) {
  const name = NAMES['m' + String(it.i).padStart(3, '0')];
  if (!name) continue;
  const pad = 1, el = grab(it.id);
  const box = [vb[0] + it.x - pad, vb[1] + it.y - pad, it.w + 2 * pad, it.h + 2 * pad].map((n) => n.toFixed(2));
  writeFileSync(join(OUT, `${name}.svg`),
    `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:v="http://schemas.microsoft.com/visio/2003/SVGExtensions/" viewBox="${box.join(' ')}" width="${box[2]}" height="${box[3]}">\n${slim(el)}${el}\n</svg>\n`);
  index.push({ name, file: `${name}.svg`, w: +it.w.toFixed(1), h: +it.h.toFixed(1), modules: Math.max(1, Math.round((it.w / UNIT) * 2) / 2), texts: it.texts });
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1) + '\n');
console.log(index.length, 'modules geschreven naar', OUT);

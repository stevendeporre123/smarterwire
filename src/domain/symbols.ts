// Vereenvoudigde AREI-situatieplansymbolen op een 24x24 raster, middelpunt (12,12).
// Het zijn werksymbolen; de officiële grafische symbolen (AREI boek 1) komen in een volgende stap
// als pixel-nauwkeurige set. Elke `draw` is SVG-markup met stroke=currentColor.
export interface SymbolDef { id: string; label: string; group: string; draw: string }

const circ = (r = 5, cx = 12, cy = 12) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;

export const SYMBOLS: SymbolDef[] = [
  { id: 'lichtpunt', label: 'Lichtpunt (plafond)', group: 'Verlichting', draw: circ(6) + '<path d="M7.8 7.8l8.4 8.4M16.2 7.8l-8.4 8.4"/>' },
  { id: 'lichtpunt_wand', label: 'Lichtpunt (wand)', group: 'Verlichting', draw: circ(6) + '<path d="M7.8 7.8l8.4 8.4M16.2 7.8l-8.4 8.4"/><path d="M6 20h12"/>' },
  { id: 'tl', label: 'TL-armatuur', group: 'Verlichting', draw: '<rect x="3" y="9" width="18" height="6"/><path d="M3 12h18"/>' },
  { id: 'noodverlichting', label: 'Noodverlichting', group: 'Verlichting', draw: circ(6) + '<path d="M7.8 7.8l8.4 8.4M16.2 7.8l-8.4 8.4"/><path d="M12 2v3"/>' },
  { id: 'schakelaar', label: 'Enkelpolige schakelaar', group: 'Bediening', draw: circ(3, 8, 16) + '<path d="M10 14l8-9"/>' },
  { id: 'wissel', label: 'Wisselschakelaar', group: 'Bediening', draw: circ(3, 8, 16) + '<path d="M10 14l8-9M12 12l-6-7"/>' },
  { id: 'kruis', label: 'Kruisschakelaar', group: 'Bediening', draw: circ(3, 8, 16) + '<path d="M10 14l8-9M10 14l-3-9M13 11l-3-6"/>' },
  { id: 'drukknop', label: 'Drukknop', group: 'Bediening', draw: circ(5) + '<circle cx="12" cy="12" r="2" fill="currentColor"/>' },
  { id: 'dimmer', label: 'Dimmer', group: 'Bediening', draw: '<rect x="4" y="4" width="16" height="16"/><path d="M7 17L17 7"/><path d="M12 7l5 0 0 5"/>' },
  { id: 'bewegingsmelder', label: 'Bewegingsmelder', group: 'Bediening', draw: circ(6) + '<path d="M8 14q4-8 8 0"/>' },
  { id: 'stopcontact', label: 'Stopcontact (enkel)', group: 'Stopcontacten', draw: '<path d="M12 5a7 7 0 0 1 0 14" fill="none"/><path d="M12 5v14M5 12h7"/>' },
  { id: 'stopcontact2', label: 'Stopcontact (dubbel)', group: 'Stopcontacten', draw: '<path d="M12 5a7 7 0 0 1 0 14" fill="none"/><path d="M12 5v14M5 9h7M5 15h7"/>' },
  { id: 'stopcontact_ik', label: 'Stopcontact (waterdicht)', group: 'Stopcontacten', draw: '<path d="M12 5a7 7 0 0 1 0 14" fill="none"/><path d="M12 5v14M5 12h7"/><path d="M4 21h16"/>' },
  { id: 'stopcontact_3p', label: 'Driefasig stopcontact', group: 'Stopcontacten', draw: '<path d="M12 5a7 7 0 0 1 0 14" fill="none"/><path d="M12 5v14M5 9h7M5 12h7M5 15h7"/>' },
  { id: 'data', label: 'Data / UTP', group: 'Laagspanning', draw: '<path d="M4 6h16v12H4z"/><path d="M8 18v3M16 18v3M8 11h8"/>' },
  { id: 'bel', label: 'Beldrukknop / bel', group: 'Laagspanning', draw: '<path d="M12 4a6 6 0 0 1 6 6v5l2 2H4l2-2v-5a6 6 0 0 1 6-6z"/><path d="M10 20h4"/>' },
  { id: 'verdeelbord', label: 'Verdeelbord', group: 'Toestellen', draw: '<rect x="3" y="4" width="18" height="16"/><path d="M3 4l18 16M21 4L3 20"/>' },
  { id: 'kookplaat', label: 'Kookplaat / fornuis', group: 'Toestellen', draw: '<rect x="3" y="3" width="18" height="18"/>' + circ(3, 8, 8) + circ(3, 16, 8) + circ(3, 8, 16) + circ(3, 16, 16) },
  { id: 'boiler', label: 'Boiler', group: 'Toestellen', draw: circ(8) + '<path d="M12 8v8M8 12h8"/>' },
  { id: 'motor', label: 'Motor / pomp', group: 'Toestellen', draw: circ(8) + '<text x="12" y="16" text-anchor="middle" font-size="11" fill="currentColor" stroke="none" font-weight="600">M</text>' },
  { id: 'verwarming', label: 'Verwarming', group: 'Toestellen', draw: '<rect x="3" y="7" width="18" height="10"/><path d="M6 7v10M10 7v10M14 7v10M18 7v10"/>' },
  { id: 'aansluitdoos', label: 'Aansluitdoos / lasdoos', group: 'Toestellen', draw: '<rect x="6" y="6" width="12" height="12"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>' },
  { id: 'meter', label: 'Teller', group: 'Toestellen', draw: '<rect x="4" y="4" width="16" height="16"/><text x="12" y="16" text-anchor="middle" font-size="9" fill="currentColor" stroke="none" font-weight="600">kWh</text>' },
];

export const symbolById = (id: string) => SYMBOLS.find((s) => s.id === id);

/** Verpakt het symbool als <g> met (x,y,rot,size) in plan-eenheden. */
export function symbolSvg(type: string, size = 24): string {
  const d = symbolById(type);
  const k = size / 24;
  return `<g transform="scale(${k}) translate(-12 -12)" fill="none" stroke="currentColor" stroke-width="${1.6}" stroke-linecap="round" stroke-linejoin="round">${d?.draw ?? circ(6)}</g>`;
}

const PALETTE = ['#008000', '#0066aa', '#e07800', '#8a2be2', '#cc2200', '#00897b', '#6d4c41', '#c2185b', '#546e7a', '#7cb342', '#f9a825', '#3949ab'];
export const circuitColor = (key: string | null | undefined, order: string[]) => {
  if (!key) return '#8f9a8f';
  const i = order.indexOf(key);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
};

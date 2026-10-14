# smarterwire

Browser-app om AREI-conforme eendraadschema's en situatieplannen te maken voor keuringen, vertrekkend van
**bestaande** zekeringskasten en niet-gedocumenteerde gebouwen.

## Werkwijze in de app
1. **Zekeringskast** – foto opladen, toestellen omkaderen (of AI-voorstel), type/amperage/curve/differentieel invullen. Virtuele weergave van de kast.
2. **Kringen** – per zekering documenteren (functie, ruimtes, kabel, doorsnede). Meerdere kringen op één zekering worden gemarkeerd.
3. **Situatieplan** – plattegrond opladen, AREI-symbolen plaatsen en aan een kring koppelen (kleurcodering per kring).
4. **Nieuwe kast** – voorstel genereren: elke kring krijgt een eigen automaat onder 30 mA-differentiëlen.
5. **Eendraadschema** – SVG-export of afdrukken naar PDF, voor bestaande én nieuwe kast.

## Techniek
- Vite + TypeScript (geen framework), SVG voor kast, plan en schema.
- SQLite WASM in een Web Worker, opgeslagen in OPFS → volledig **offline**. Back-up/herstel van het hele `.sqlite3`-bestand via de knoppen bovenaan.
- Elke tabel heeft `id` (uuid), `updated_at`, `deleted` → klaar voor last-write-wins sync met Cloudflare D1 (nog niet gebouwd).
- `cloudflare/worker.ts`: proxy voor AI-fotoanalyse (sleutel blijft server-side).

```bash
npm install
npm run dev          # http://localhost:5173
npm run build
# optioneel, AI-analyse:
cd cloudflare && npx wrangler secret put ANTHROPIC_API_KEY && npx wrangler dev
```

## Status
Eerste werkende versie. Nog niet gedaan: sync, officiële AREI-symbolen als exacte set, AREI-controles (aantal punten per kring, doorsnede/zekering…), pinch-zoom op touch, PDF-kaft met meetgegevens.

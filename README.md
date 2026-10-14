# smarterwire

Browser-app om AREI-conforme eendraadschema's en situatieplannen te maken voor keuringen, vertrekkend van
**bestaande** zekeringskasten en niet-gedocumenteerde gebouwen.

## Werkwijze in de app
1. **Projectgegevens** – adres, eigenaar, EAN-code van de meter (18 cijfers), voeding (mono-/driefasig), keuringsinstantie.
2. **Zekeringskast** – foto opladen, toestellen omkaderen (of AI-voorstel), type/amperage/curve/differentieel invullen. Meerdere kasten mogelijk; een onderverdeler is gewoon een tweede kast die door een kring van de eerste gevoed wordt ("Voedt onderverdeler" bij de kring).
3. **Kringen** – per zekering documenteren. Verplicht om een kring als "gedocumenteerd" te markeren: kabeltype (VOB/XVB/XGB…), doorsnede, brandklasse en plaatsing (in muur / op muur / in buis / los). Meerdere kringen op één zekering worden gemarkeerd.
4. **Situatieplan** – meerdere plattegronden (verdiepingen), AREI-symbolen plaatsen en aan een kring koppelen (kleur per kring), symbool- en labelgrootte instelbaar.
5. **Nieuwe kast(en)** – voorstel: elke kring een eigen automaat, max. 8 kringen per 30 mA-differentieel, gegroepeerd per verdieping, grote verbruikers apart, verdeeld over de fases. Kringen die door de bestaande bekabeling samen moeten blijven (bv. gedeelde nul) markeer je met "samen houden".
6. **Eendraadschema** – bestaande én nieuwe toestand, inclusief teller/EAN en onderverdelers. SVG-export of afdrukken naar PDF.

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

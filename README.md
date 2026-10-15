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
- **Cloudflare D1** is de enige opslag. De Worker (`cloudflare/worker.ts`) bevat de API: `/api/db/*` (SQL-statements, enkel SELECT/INSERT/UPDATE/DELETE), `/api/asset/:id` (foto's als BLOB in D1, max. ~2 MB, de app verkleint ze), project export/import en de AI-proxy (sleutel blijft server-side).
- Schema = `cloudflare/migrations/*.sql` (wrangler d1 migrations).
- Elke tabel heeft `id` (uuid), `updated_at`, `deleted` (soft delete).
- **"Sync"** = project exporteren/importeren (`*.smarterwire.json`, incl. foto's) tussen omgevingen of toestellen. Bij importeren worden rijen met hetzelfde id samengevoegd: de laatst gewijzigde versie wint.
- De app is niet meer offline bruikbaar. De API heeft **geen eigen login**: zet Cloudflare Access (of gelijkaardig) op het domein.

```bash
npm install
npm run dev          # http://localhost:5173 – start ook de API met een lokale D1 (.wrangler/state), schema wordt vanzelf toegepast
npm run build
# AI-analyse lokaal: zet je sleutel in cloudflare/.dev.vars (zie .dev.vars.example).

# Eerste keer productie:
npx wrangler d1 create smarterwire          # database_id invullen in cloudflare/wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY -c cloudflare/wrangler.toml
npm run deploy                              # build + migraties (remote) + deploy
```

### Oude offline back-up (.sqlite3) overnemen
```bash
node tools/sqlite-to-project.mjs smarterwire-2026-10-14.sqlite3 export/   # Node 22+, één bestand per project
```
Daarna in de app: **Importeer project**. (Installateurgegevens zijn niet per project en vul je opnieuw in.)

## Status
Eerste werkende versie. Nog niet gedaan: officiële AREI-symbolen als exacte set, AREI-controles (aantal punten per kring, doorsnede/zekering…), pinch-zoom op touch, PDF-kaft met meetgegevens.

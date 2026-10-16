# smarterwire

Browser-app om AREI-conforme eendraadschema's en situatieplannen te maken voor keuringen, vertrekkend van
**bestaande** zekeringskasten en niet-gedocumenteerde gebouwen.

## Werkwijze in de app
1. **Projectgegevens** – adres, eigenaar, EAN-code van de meter (18 cijfers), voeding (mono-/driefasig), keuringsinstantie.
2. **Zekeringskast** – foto opladen, toestellen omkaderen (of AI-voorstel), type/amperage/curve/differentieel invullen. Meerdere kasten mogelijk; een onderverdeler is gewoon een tweede kast die door een kring van de eerste gevoed wordt ("Voedt onderverdeler" bij de kring).
3. **Kringen** – per zekering documenteren. De status volgt vanzelf: "gedocumenteerd" zodra kabeltype (VOB/XVB/XGB…), doorsnede, brandklasse en plaatsing gekend zijn ("gecontroleerd" is een bewuste bevestiging). Aarding is onbekend / aanwezig / afwezig, standaard onbekend. Meerdere kringen op één zekering worden gemarkeerd.
4. **Situatieplan** – meerdere plattegronden (verdiepingen), AREI-symbolen plaatsen en aan een kring koppelen (kleur per kring), symbool- en labelgrootte instelbaar.
5. **Nieuwe kast(en)** – voorstel: elke kring een eigen automaat, max. 8 kringen per 30 mA-differentieel, gegroepeerd per verdieping, grote verbruikers apart, verdeeld over de fases. Kringen die door de bestaande bekabeling samen moeten blijven (bv. gedeelde nul) markeer je met "samen houden".
6. **Eendraadschema** – bestaande én nieuwe toestand, inclusief teller/EAN en onderverdelers. SVG-export of afdrukken naar PDF.

## Techniek
- Vite + TypeScript (geen framework), SVG voor kast, plan en schema.
- **Cloudflare D1** is de enige opslag. De Worker (`cloudflare/`) is de API: er gaat **geen SQL** over de lijn, de client stuurt bewerkingen (`put/set/where`) en benoemde queries (`data.ts`); de server controleert bij elke bewerking dat het project van de ingelogde gebruiker is. Foto's staan als BLOB in D1 (max. ~2 MB, de app verkleint ze).
- **Accounts** (`auth.ts`): e-mail + wachtwoord (PBKDF2-SHA256), sessie via HttpOnly-cookie, throttling op login/registratie, CSRF-controle. Elke gebruiker is installateur met eigen projecten, eigen installateurgegevens (komen op de PDF) en eigen voorkeuren.
- **Registratie** is open; zet `INVITE_CODE` (secret) om enkel met een uitnodigingscode te laten registreren. De eerste gebruiker neemt bestaande projecten zonder eigenaar over.
- **Klantenportaal (gepland)**: de tabel `project_member` (rol `client`) en de toegangscontrole (`Ctx.access`) zijn er al op voorbereid; een klant krijgt dan lees-toegang tot een project zonder het te kunnen wijzigen.
- Schema = `cloudflare/migrations/*.sql` (wrangler d1 migrations). Elke tabel heeft `id` (uuid), `updated_at`, `deleted` (soft delete).
- **"Sync"** = project exporteren/importeren (`*.smarterwire.json`, incl. foto's) tussen omgevingen of toestellen. Het geïmporteerde project wordt van jou; bij samenvoegen wint per rij de laatst gewijzigde versie.
- De app is niet meer offline bruikbaar. Nog niet gebouwd: e-mailverificatie en "wachtwoord vergeten" (vereist een mailprovider).
- Wachtwoordhashing gebruikt ~100k PBKDF2-iteraties per aanmelding: dat vraagt het Workers Paid-plan (de gratis limiet van 10 ms CPU is te krap).

```bash
npm install
npm run dev          # http://localhost:5173 – start ook de API met een lokale D1 (.wrangler/state), schema wordt vanzelf toegepast
npm run build
# AI-analyse lokaal: zet je sleutel in .dev.vars in de hoofdmap (zie cloudflare/.dev.vars.example).

# Eerste keer productie:
npx wrangler d1 create smarterwire          # database_id invullen in wrangler.toml
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put INVITE_CODE     # optioneel, om registratie te beperken
npm run deploy                              # build + migraties (remote) + deploy
```
Via GitHub kan het ook zonder terminal: workflow **D1 aanmaken** maakt de productie- én de preview-database (`smarterwire-preview`, voor `wrangler preview` van branches met Cloudflare Workers Builds), vult de id's in en past de migraties toe.
```bash
```

### Oude offline back-up (.sqlite3) overnemen
```bash
node tools/sqlite-to-project.mjs smarterwire-2026-10-14.sqlite3 export/   # Node 22+, één bestand per project
```
Meld je aan, daarna in de app: **Importeer project** (het project wordt van jou). Installateurgegevens zijn niet per project en vul je opnieuw in.

NB: de testpagina's in `tools/*-e2e.*` gebruikten de oude in-browser database en werken niet meer zonder aanmelding.

## Status
Eerste werkende versie. Nog niet gedaan: officiële AREI-symbolen als exacte set, AREI-controles (aantal punten per kring, doorsnede/zekering…), pinch-zoom op touch, PDF-kaft met meetgegevens.

## Wijzigingen per issue
- #8 "Ouders afleiden" zegt nu wat er gebeurde: hoeveel nieuw gekoppeld, "alles was al gekoppeld", of bij hoeveel toestellen geen differentieel gevonden werd.
- #9 Toestelopschriften zonder dubbele tekst ("B16" + 16A wordt één keer "B16"); in dropdowns en lijsten staat de plaats in de kast (R1·3 = rij 1, 3e van links) zodat gelijke zekeringen onderscheidbaar zijn; op de foto kun je de opschriften met de knop *Labels* verbergen (het geselecteerde toestel toont zijn opschrift altijd), kleiner lettertype.
- #11 Kring-status wordt afgeleid uit de kabelgegevens (volledig = *gedocumenteerd*, anders *onbekend*; *gecontroleerd* blijft handmatig). Aarding is drieweg en standaard onbekend (migratie 0010 zet de oude aanname op onbekend bij kringen zonder kabelgegevens); in de kabeltekst staat G (aarding), x (zonder) of ? (onbekend).

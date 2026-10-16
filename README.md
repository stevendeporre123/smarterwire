# smarterwire

Browser-app om AREI-conforme eendraadschema's en situatieplannen te maken voor keuringen, vertrekkend van
**bestaande** zekeringskasten en niet-gedocumenteerde gebouwen.

## Werkwijze in de app
1. **Projectgegevens** – adres, eigenaar, EAN-code van de meter (18 cijfers), voeding (mono-/driefasig), keuringsinstantie.
2. **Zekeringskast** – foto opladen, toestellen omkaderen (of AI-voorstel), type/amperage/curve/differentieel invullen. Meerdere kasten mogelijk; een onderverdeler is gewoon een tweede kast die door een kring van de eerste gevoed wordt ("Voedt onderverdeler" bij de kring).
3. **Kringen** – per zekering documenteren. De status volgt vanzelf: "gedocumenteerd" zodra kabeltype (VOB/XVB/XGB…), doorsnede, brandklasse en plaatsing (in wand/plafond/vloer, opbouw, kabelgoot, in isolatie, ondergronds; los of in buis apart) gekend zijn ("gecontroleerd" is een bewuste bevestiging). Aarding is onbekend / aanwezig / afwezig, standaard onbekend. Meerdere kringen op één zekering worden gemarkeerd. Snel invullen: vink kringen aan en kies **Bewerk selectie** (enkel ingevulde velden worden overschreven), neem in de kringmodal de kabelgegevens van de vorige kring over, of loop alle kringen na met **Opslaan & volgende**.
4. **Situatieplan** – meerdere plattegronden (verdiepingen), AREI-symbolen plaatsen en aan een kring koppelen (kleur per kring), symbool- en labelgrootte instelbaar. Muren teken je met klik-klik of door te slepen; de muurtool blijft actief (Esc stopt de ketting, een tweede Esc gaat terug naar Selecteren). Ongedaan maken/opnieuw met Ctrl+Z / Ctrl+Shift+Z of de knoppen, en "Passend zoomen". Een leeg plan vraagt de afmetingen in meter (standaard 12 × 8 m, eerste plan heet Gelijkvloers).
5. **Nieuwe kast(en)** – voorstel: elke kring een eigen automaat, max. 8 kringen per 30 mA-differentieel, gegroepeerd per verdieping, grote verbruikers apart, verdeeld over de fases. Kringen die door de bestaande bekabeling samen moeten blijven (bv. gedeelde nul) markeer je met "samen houden".
6. **Bevindingen** – indicatieve controles met uitleg en voorgestelde oplossing (zekering vs. doorsnede, 30 mA bij stopcontacten, type AC, grote verbruikers samen, aantal punten, ontbrekende gegevens); badge per kring in de kringentabel.
7. **Eendraadschema** – bestaande én nieuwe toestand, inclusief teller/EAN en onderverdelers. SVG-export, of de knop **PDF** (keuringsdossier, of het klantdocument *Voorstel nieuwe kast*: voorblad, kastopstelling, schema, oud → nieuw per kring, aandachtspunten en materiaallijst): een echt PDF-bestand (A4 liggend, vector) als download, zonder afdrukvenster.

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

Tests: `npm run test:e2e` (Playwright, start zelf `npm run dev`; lokaal met je geïnstalleerde Chrome, in CI met Chromium via de workflow *E2E*) doorloopt de hele flow tot de PDF-download. Let op: registreren wordt lokaal gethrottled; bij veel herhalingen: `npx wrangler d1 execute smarterwire --local --command "DELETE FROM auth_attempt"`. De oude testpagina's in `tools/*-e2e.*` werken niet meer (oude in-browser database); `tools/*-test.*` (diagram, PDF, bevindingen, voorstel) draaien met `npx vite --config tools/vite.test.config.ts`.

## Status
Eerste werkende versie. Nog niet gedaan: officiële AREI-symbolen als exacte set, AREI-controles (aantal punten per kring, doorsnede/zekering…), pinch-zoom op touch, PDF-kaft met meetgegevens.

## Wijzigingen per issue
- #8 "Ouders afleiden" zegt nu wat er gebeurde: hoeveel nieuw gekoppeld, "alles was al gekoppeld", of bij hoeveel toestellen geen differentieel gevonden werd.
- #9 Toestelopschriften zonder dubbele tekst ("B16" + 16A wordt één keer "B16"); in dropdowns en lijsten staat de plaats in de kast (R1·3 = rij 1, 3e van links) zodat gelijke zekeringen onderscheidbaar zijn; op de foto kun je de opschriften met de knop *Labels* verbergen (het geselecteerde toestel toont zijn opschrift altijd), kleiner lettertype.
- #11 Kring-status wordt afgeleid uit de kabelgegevens (volledig = *gedocumenteerd*, anders *onbekend*; *gecontroleerd* blijft handmatig). Aarding is drieweg en standaard onbekend (migratie 0010 zet de oude aanname op onbekend bij kringen zonder kabelgegevens); in de kabeltekst staat G (aarding), x (zonder) of ? (onbekend).
- #13 Plaatsing uitgebreid: opbouw (op wand), in kabelgoot, in isolatie, ondergronds en onbekend (telt als ontbrekend); doorsnede 0,75–35 mm²; extra kabeltypes (EXAVB, H05VV-F, H07RN-F). Op het eendraadschema krijgt enkel in wand/plafond/vloer het E-symbool; de andere plaatsingen staan als tekst bij de kabel.
- #7 Geen lege pagina meer bij navigeren/opslaan: een laad-indicator vervangt het lege scherm, opslaan herlaadt enkel de pagina (niet de hele app) en geeft een "opgeslagen"-melding. Optimistische updates (lokale state meteen aanpassen) zijn nog niet gedaan.
- #14 Situatieplan: één tekenmodel voor muren (klik-klik of slepen), tool blijft actief na Esc, undo/redo (laatste 100 stappen van vormen, symbolen en nog te plaatsen onderdelen), passend zoomen (ook bij het openen) en een kleiner standaardplan met afmetingen bij het aanmaken.
- #19 Projectformulier: EAN wordt gecontroleerd (18 cijfers, begint met 54, GS1-controlecijfer; bij een fout controlecijfer kun je bewust toch bewaren); opdrachtgever blijft leeg = zelfde als eigenaar. De keuringsinstelling blijft een keuzelijst met vrije invoer; enkel van Keurtech zijn de gegevens vooraf ingevuld (andere instellingen: vul het adres één keer in). Koppeling voeding ↔ fasenverdeling in het voorstel staat nog open.
- #10 Kringen: bulkbewerking van de selectie, "kabelgegevens overnemen van vorige kring" en "Opslaan & volgende" (rondgang). Omschrijving, functie en verdieping pas je rechtstreeks in de tabel aan, je filtert op functie, verdieping, status en bevindingen, en de knop **Excel** exporteert de kringen (tabblad *Kringen*) plus een tabblad *Labels* (kring, tekst, beveiliging) om labels van te printen.
- #5 PDF-export maakt nu een echt bestand in de browser (jsPDF + svg2pdf.js, wordt pas geladen bij het exporteren): bestandsnaam `<project>-<datum>-<toestand>.pdf`, geen afdrukvenster meer. Testpagina: `tools/pdf-file-test.html`. Nog niet getest op iOS Safari / Android Chrome.
- #16 Eendraadschema: de teller heeft een symbool met label "Teller" en de aansluiting (bv. 40A Voeding - 2 polig) eronder; ontbreekt de hoofdbeveiliging dan staat dat er in rood; lange kringnamen en differentieellabels worden niet meer vroeg afgekapt (kleiner lettertype); het titelblok van de PDF toont ook EAN en datum. Nog niet: aardingswaarde/-weerstand (komt met de metingen, #20).
- #15 Verdieping is nu een keuzelijst op basis van de plannen (kringformulier, bulkbewerking, schema) en het eerste plan heet standaard Gelijkvloers; de naam van de verdieping stel je in bij *Plan hernoemen*. Ruimtes als object op het plan zijn nog niet gebouwd.
- #12 Tab *Bevindingen* met een regelmotor (fout / waarschuwing / info, per regel uitleg + oplossing) en een badge per kring in de kringentabel. De regels zijn vuistregels: de verwijzing naar de AREI-artikels ontbreekt bewust nog tot ze tegen de officiële tekst nagekeken zijn (veld `source` in `src/domain/checks.ts`). Nog niet: pagina in de PDF, reservecapaciteit.
- #17 Nieuwe kast: instelbare reserve (% vrije modules), selectief (type S) hoofddifferentieel, type 30 mA-differentieel (A/F/B); na het opbouwen een tabel *oud → nieuw* (kring, oude zekering, nieuwe automaat, differentieel, fase), melding over kringen met meerdere grote verbruikers, de som van de automaten naast de aansluiting en het aantal gebruikte modules; in de virtuele kast staat de kringomschrijving onder de modules. Een echte belastingsstudie (gelijktijdigheid) is er niet.
- #6 + #21 PDF-keuze *Voorstel nieuwe kast (klantdocument)* en een **Materiaallijst** (knop in de nieuwe kast): aantallen per type automaat/differentieel, kast, rail, klemmen en labels (schattingen), merk/serie en referentie zelf in te vullen, export als CSV of in de PDF. Prijzen/offerte en marge-instellingen zijn nog niet gebouwd.
- #20 Metingen: isolatieweerstand, lusimpedantie en datum per kring (kringformulier, *Meer opties*), type en weerstand van de aarding bij de projectgegevens, gemeten uitschakelstroom/-tijd per differentieel; bevindingen bij te lage isolatie, te trage of te gevoelige differentiëlen en een aardingsweerstand boven 100 Ω; in het keuringsdossier-PDF komt een pagina *Metingen*. **Nieuwe migratie 0011**: voer `npm run db:migrate` uit (of deploy met migraties).
- #18 Foto's en beschrijvingen: knop **Beschrijvingen** (camera/foto): de AI leest de strookjes of de legende en koppelt elke tekst aan een zekering (op plaats in de kast of volgorde); je controleert de koppeling in een overzicht met zekerheid per regel (laag = standaard uit), kiest zo nodig een ander toestel en past de tekst aan; bij toepassen wordt het de omschrijving van de kring en wordt de functie afgeleid als die duidelijk is (bestaande omschrijvingen blijven, tenzij je overschrijven aanvinkt). Knop **Foto's** bewaart meerdere foto's per kast (extra kastfoto, beschrijvingen, bekabeling, typeplaatje) en laat je een beschrijvingsfoto later opnieuw koppelen. **Nieuwe migratie 0012** (tabel board_photo): `npm run db:migrate`. De AI-koppeling is niet getest op echte foto's (de E2E-test gebruikt een nagebootste AI). Eerder (deels) Zekeringskast: knop *Camera* opent op telefoon/tablet meteen de camera, en het opslaan van de foto toont een melding. Nog niet: meerdere foto's per kast, foto per kring, betrouwbaarheid per toestel en een meting op echte foto's uit `reference/`.
- #22 E2E-test met Playwright (`e2e/flow.spec.ts`) + GitHub-workflow *E2E*: registreren, project, kast met toestellen, kring invullen (status wordt vanzelf gedocumenteerd), schema, bevindingen, nieuwe kast opbouwen (opmerkingen + oud → nieuw) en PDF-download. De AI-analyse is niet gedekt (vraagt een sleutel).

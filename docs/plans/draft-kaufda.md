# Kaufda (Bonial) — Recherche-Dossier: offene JSON-Schnittstellen für Prospekte UND Angebote

Stand: 2026-10-19, alle Angaben live per curl/Playwright verifiziert. Kein Login nötig.
Kontext: Dossier `2026-10-19-scrape-recon.md`, offene Frage 4 (Kaufda/Bonial).

## 0. Ergebnis in einem Satz

**Kaufda liefert strukturierte Produktpreise (inkl. Streichpreis, Gültigkeit, Händler, Marke,
Grundpreis) — nicht nur Prospekt-Bilder.** Zwei offene JSON-Endpunkte auf `www.kaufda.de`
reichen aus: `/api/shelf` (Prospekte) und `/api/personalisedOffers` (Angebote je Prospekt).
Der Streichpreis-Anteil ist bei Kaufda **deutlich höher als bei Marktguru** (Kaufland 278/484
mit `secondaryPrice` vs. Marktguru `oldPrice` ~0). Kaufda deckt zusätzlich Ketten ab, die
Marktguru gar nicht liefert (Aldi Nord, Netto Supermarkt, Marktkauf, famila, combi, V-Markt,
Globus, tegut, Metro u. a.).

## 1. Echte kaufda.de-URLs (verifiziert, HTTP 200)

`/Prospekte` ist tot (404), `sitemap.xml` existiert nicht (404). Die echten URLs stehen im
HTML der Startseite (`href`s) und in `robots.txt`:

| Typ | URL-Muster | Beispiel (200) |
|---|---|---|
| Händler-Landingpage | `https://www.kaufda.de/Geschaefte/<Kette>` | `/Geschaefte/Lidl`, `/Geschaefte/Aldi-Nord` |
| Filial-/Stadtseite | `https://www.kaufda.de/<Stadt>/<Kette>/p-r74` | `/Berlin/Lidl/p-r74` |
| Keyword-/Kategorieseite | `https://www.kaufda.de/Angebote/<Produkt>` | `/Angebote/Butter` |
| Sortimentsseite | `https://www.kaufda.de/<Kette>/Sortiment` | `/Lidl/Sortiment` |
| Stadtindex | `https://www.kaufda.de/<Stadt>` | `/Berlin` |
| Gesamt-Händlerindex | `https://www.kaufda.de/Geschaefte` | ~180 Ketten-Links |

`robots.txt` (200) verbirgt historische Pfade: `/Catalogue/`, `/mv/`, `/brochure-viewer/brochure`,
`/api/febe/`, `/api/frontend/`, `/dyn/`, `/sessionData`, `/shelf`, `/search`, `/webapp/` — alle
heute ohne Funktion bzw. Next.js-404/308. Verlangt `crawl-delay: 2`.
`__APP_CONFIG__` im HTML nennt Hosts: `seopages.kaufda.de` (Next.js-Assets), `content-media.bonial.biz`
(Prospektbilder), `publisher-media.bonial.biz` (Logos), `seoapiv2-internal.kaufda.de` (**nicht
öffentlich erreichbar**, Verbindung schlägt fehl), `tk.kaufda.de` (Tracking).

## 2. Netzwerk-Mitschnitt (Playwright, `page.on('response')`)

Drei Läufe: `https://www.kaufda.de/Geschaefte/Lidl`, `https://www.kaufda.de/Berlin/Lidl/p-r74`,
`https://www.kaufda.de/shelf` (je Chromium headless, de-DE, inkl. Scrollen/Klick).

**Ergebnis Läufe 1+2 (Prospekt-/Filialseiten):** Die Angebotsdaten sind **serverseitig im
`__NEXT_DATA__`-JSON des HTML enthalten**. Zusätzlich fahren die Seiten nur:
- `GET www.kaufda.de/sessionData?optOut=true&cb=<ts>` → `{"visitId","userIdent","token"}` (JWT, Header `sessiontoken`)
- `GET www.kaufda.de/api/user/account/id?deliveryChannel=dest.kaufda&userPlatformCategory=desktop.web.browser&userPlatformOs=linux&userId=anonymous-<visitId>` (Header `sessiontoken`) → `{"bonialAccountId":"<uuid>"}`
- `POST tk.kaufda.de/v3s/…` (Tracking, irrelevant), NewRelic, Usercentrics (Consent)

**Ergebnis Lauf 3 (`/shelf` = Prospekt-Kiosk, Ziel des Buttons „Mehr Angebote") — hier kommen die
echten JSON-APIs:**

```
[200] GET www.kaufda.de/api/shelf?lat=50.0845&lng=8.4719&size=24&page=1&sectorIds=   (79.709 B)
[200] GET www.kaufda.de/api/shelf?lat=50.0845&lng=8.4719&size=24&page=2&sectorIds=
[200] GET www.kaufda.de/api/shelf?lat=50.0845&lng=8.4719&size=24&page=3&sectorIds=
[200] GET www.kaufda.de/api/personalisedOffers?brochureId=<uuid>&size=20&bonialAccountId=<uuid>&userPlatformCategory=desktop.web.browser  (32–55 KB)
```

**Auth-Header: keine.** Weder `/api/shelf` noch `/api/personalisedOffers` senden im Mitschnitt
Token/Cookie-Header. Die `bonialAccountId` ist eine UUID, die der Client per `sessionData`+`account/id`
holt — funktioniert auch als **Zufalls-UUID** (verifiziert, s. u.).

## 3. Die Endpunkte per curl nachgetestet

### 3.1 Prospekte: `GET /api/shelf`

```bash
curl -s -A "Mozilla/5.0" "https://www.kaufda.de/api/shelf?lat=50.0845&lng=8.4719&size=24&page=1&sectorIds="
```

→ `200`, `{"contents":[…24 Brochures…],"page":{"size":24,"totalElements":102,"totalPages":5,"number":1}}`

- **Paginierung funktioniert** (`page=1..5`; Seiten 4/5 kleiner, weil leerer).
- Jeder Eintrag: `content` mit `_links` (auf `contentlookupapi-internal.kaufda.de`, intern), `id`
  (legacy), `contentId` (UUID), `closestStore{id,externalId,name,latitude,longitude,street,zip,city}`,
  `title`, `type:"BROCHURE"`, `publishedFrom/Until`, **`validFrom`/`validUntil`**, `pageCount`,
  `publisher{id,name,type:"RETAILER"|"MANUFACTURER"}`, `brochureImage`, `brochureImages[{size,url}]`
  (JPG-Seiten auf `content-media.bonial.biz/<contentId>/…jpg`), `badges`, `contentBadges`, `score`.
- `sectorIds=` filtert (z. B. `sectorIds=DE-104` „Lebensmittel und Getränke" → 1 Ergebnis für die
  Test-Location); `publisherIds`/`publisherId` werden **ignoriert** (identische 24 Ergebnisse).
- Ort via `lat`/`lng` (kein `zipCode`-Parameter nötig; PLZ vorher in Koordinaten übersetzen).

### 3.2 Angebote je Prospekt: `GET /api/personalisedOffers`

```bash
curl -s -A "Mozilla/5.0" \
  "https://www.kaufda.de/api/personalisedOffers?brochureId=5c82953e-002b-4bf9-8d0b-c51e7102dc4b&size=500&bonialAccountId=11111111-2222-3333-4444-555555555555&userPlatformCategory=desktop.web.browser"
```

→ `200`, `{"contents":[…]}` — **437 Angebote der Lidl-Broschüre „LIDL LOHNT SICH" in einem Call.**

- Pflicht-Parameter: `brochureId`, `size`, `bonialAccountId`, `userPlatformCategory`. Ohne
  `brochureId` → `400 {"message":"brochureId is required"}`, ohne `userPlatformCategory` → `400`,
  ohne `bonialAccountId` → `400`. **`bonialAccountId` darf eine beliebige UUID sein** (verifiziert:
  `11111111-2222-…` liefert 200) — der Umweg über `sessionData`/`account/id` ist damit entbehrlich.
  Der `sessiontoken`-JWT aus `/sessionData` (lebt ~30 min, `exp`-Claim) wird nur für
  `/api/user/account/id` gebraucht.
- **`size=500` liefert die vollständige Broschüre** (Lidl: 437/437). Der Parameter `page` wird
  **ignoriert** (page=2 liefert identische IDs) — also großes `size` statt Paginierung.
- Felder je Angebot (Union über alle Items, verifiziert):

| Feld | Typ | Bedeutung | Füllrate (Lidl 437) |
|---|---|---|---|
| `id` | UUID | Offer-ID | 437/437 |
| `type` | `"OFFER"` | — | 437/437 |
| `parentContent` | `{id, legacyId, type:"static_brochure"\|"dynamic_brochure", page:{number}}` | Prospekt + **Seitennummer** | 437/437 |
| `publisherId`, `publisherName` | `"DE-1013"`, `"Lidl"` | Händler | 437/437 |
| `title` | string | Produktname | 437/437 |
| `description` | string | Zusatz („250-g-Pckg.") | 431/437 |
| `brand` | string | Marke | 388/437 |
| `categories`, `categoryPaths` | arrays | Kategoriepfade mit IDs (`DE-1349` „Butter") | teils |
| **`validFrom`, `validUntil`** | ISO (UTC) | Gültigkeit | **437/437** |
| **`prices.mainPrice`** | float | Angebotspreis (EUR) | 436/437 |
| `prices.mainPriceFormatted` | string | „1,29 €" | 436/437 |
| **`prices.secondaryPrice`** | float | **Streichpreis/UVP** (0 = keiner) | **207/437** |
| `prices.secondaryPriceFormatted` | string | „3,29 €" | 207/437 |
| **`prices.secondaryPriceIsUVP`** | bool | true = UVP-Streichpreis, false = alter Aktionspreis | 207/437 |
| `prices.priceByBaseUnit` | string | Grundpreis („1 kg = 8.45/6.76") | 230/437 |
| `prices.mainPriceFrequency` | `"ONCE"` | einmalig | — |
| `prices.conditions`, `showConditions`, `priceRange`, `description`, `currencyCode` | — | Rabattbedingungen, „2 für"-Aktionen, Preis-Spanne, `"EUR"` | — |
| `offerImages.url.{thumbnail,normal,large}` | URL | **Ausschnitt aus der Prospektseite** auf `content-media.bonial.biz` | 437/437 |
| `offerImages.metaData.{imageAlt,imageTitle}` | string | „Feine Butter von Meggle für 1,29 € bei REWE im Angebot" | teils |
| `score`, `adPlacement`, `adFormat`, `preview`, `externalTracking` | — | Ranking/Ads | — |

**Konsequenz für Mikes Pflichtfelder:** Geschäft = `publisherName`, Angebotspreis = `prices.mainPrice`,
Alter Preis = `prices.secondaryPrice` (wo gefüllt), prozentuale Ersparnis = direkt berechenbar.
Achtung: `mainPrice` ist ein Float mit Artefakten (1.7899999618530273) → preislich runden oder
`mainPriceFormatted` parsen.

### 3.3 Angebots-Suche: `GET /api/search`

```bash
curl -s -A "Mozilla/5.0" "https://www.kaufda.de/api/search?lat=50.0845&lng=8.4719&query=Butter&size=24&bonialAccountId=<uuid>&userPlatformCategory=desktop.web.browser"
```

→ `200`, `{"searchResults":{"contents":{"brochures":[24],"offers":[24]},"metadata":{"contentCount":{"offer":39,"brochure":40},"filters":[…publisher-Liste…]}}}`

- Liefert **Angebote mit demselben Schema** inkl. `prices.secondaryPrice` (Bsp. „Golden Hills
  Irische Butter" 2,29 € → 1,79 €) plus Prospekt-Treffer mit Seitenzahl.
- `size`/`page` werden **ignoriert** (immer Top-24); `publisher`/`publisherIds`/`filters`/`contentType`
  werden ebenfalls ignoriert. Gut für Keyword-Suche („Butter", „Vegan"), **nicht** für Vollständigkeit.
- `metadata.filters` (name `publisher`) listet alle im Suchergebnis vertretenden Ketten inkl. IDs
  (z. B. `DE-77` ALDI SÜD, `DE-1013` Lidl, `DE-220164` EDEKA, `DE-13901552` tegut).
- Ohne `bonialAccountId` ebenfalls 200 (einziger Endpunkt, der sie nicht braucht).

### 3.4 Serverseitiges JSON der SEO-Seiten: Next.js-Datenroute

```bash
B=$(curl -s -A "Mozilla/5.0" https://www.kaufda.de/Angebote/Butter | grep -o '"buildId":"[^"]*"' | cut -d'"' -f4)
curl -s -A "Mozilla/5.0" "https://www.kaufda.de/_next/data/$B/de-DE/Geschaefte/Lidl.json"
```

→ `200`, 108 KB JSON = `pageProps.pageInformation` (identisch zum `__NEXT_DATA__` des HTML):
`offers.main{items[16], totalItems}` (Top-Angebote, `totalItems` = Ketten-Gesamtzahl, Lidl 1000),
`brochures.{viewer,brand,publisher,intendedSearchArea,sector}` mit den aktuellen **Broschüren**
(`contentId`, Titel, Seitenzahl, Gültigkeit), `keyword`, `location`, `type`
(`GLOBAL_RETAILER_LANDING_PAGE` / `LOCAL_PUBLISHER_PAGE` / `GLOBAL_SEARCH_RESULTS_PAGE`).
`buildId` ändert sich bei Deploy (im HTML von jeder Seite auslesen); Query-Parameter (`?page=2` etc.)
werden ignoriert. Vorteil: ein Call nennt alle aktuellen `contentId` einer Kette.

### 3.5 Rate-Limit / Robustheit

10 Anfragen in schneller Folge an `/api/personalisedOffers` → **10× HTTP 200**, kein 429.
`robots.txt` verlangt `crawl-delay: 2` — für den Wochenlauf irrelevant (wenige Dutzend Calls),
aber einhalten. Kein Token-Ablaufproblem, da keine Auth nötig.

## 4. Empfohlene Abruf-Kette (einfach, reines HTTP-JSON)

```
1) buildId aus https://www.kaufda.de/ (HTML, __NEXT_DATA__)
2) PRO JE KETTE: GET /_next/data/<buildId>/de-DE/Geschaefte/<Kette>.json
   → brochures.viewer[].contentId + brochures.intendedSearchArea[].contentId (Ketteigen-Broschüren!)
3) PRO BROSCHÜRE: GET /api/personalisedOffers?brochureId=<contentId>&size=500
   &bonialAccountId=<feste Zufalls-UUID>&userPlatformCategory=desktop.web.browser
   → vollständige Angebotsliste mit price/oldPrice/validity/store/brand
Optional: GET /api/shelf?lat=…&lng=…&size=24&page=N  (alle Prospekte der Region, inkl. Nicht-Lebensmittel)
```

Wichtig: Die **ketten-eigenen** Broschüren stehen bei manchen Ketten (Aldi Nord, Netto Supermarkt,
Marktkauf, famila, combi, V-Markt) im Bucket `intendedSearchArea`, nicht `viewer`; `brand` enthält
**Hersteller-Werbung** (Nutella, duplo …) und ist für die Kette-Zuordnung unbrauchbar.

## 5. Kaufda vs. Marktguru — belegter Vergleich (2026-10-19)

Kaufda = Angebote der Kette-Hauptbroschüre, per `personalisedOffers` (size=500); Marktguru =
`totalResults` aus `2026-10-19-scrape-recon.md` (PLZ 56377). Spalte „Streichpreis" = Kaufda
`secondaryPrice>0` in der Hauptbroschüre.

| Kette | Marktguru | Kaufda | Kaufda Streichpreis | Bewertung |
|---|---|---|---|---|
| lidl | 816 | 439 (+2 weitere Broschüren) | 207 | MG zählt mehr (Filialvarianten), KD hat Streichpreise |
| kaufland | 489 | 484 | 278 | Parität; KD massiv besser bei Streichpreis |
| aldi-sued | 485 | 201 | 45 | MG vollständiger |
| netto-marken-discount | 393 | 384 | 249 | Parität; KD Streichpreise |
| penny | 288 | 305 | 151 | Parität |
| rewe | 242 | 229 (+2. Broschüre „Dein Markt") | 12 | Parität |
| edeka | 222 | 245 | 48 | Parität |
| rossmann | 294 | (Drogerie, vorhanden) | — | nur wenn relevant |
| **aldi-nord** | **0** | **308** | **112** | **nur Kaufda** |
| **netto-supermarkt** (Scottie) | **0** | **346** | **168** | **nur Kaufda** |
| **marktkauf** | **0** | **282** | **227** | **nur Kaufda** |
| **famila-nordwest** | **0** | **335** | **223** | **nur Kaufda** |
| **combi** | **0** | **258** | **149** | **nur Kaufda** |
| **v-markt** | **0** | **229** | **166** | **nur Kaufda** |
| **globus** | **0** | **206** | **78** | **nur Kaufda** |
| **tegut** | **0** | **236** | **130** | **nur Kaufda** |
| **e-center** | **0** | **305** | **48** | **nur Kaufda** |
| **metro** | **0** | **350** (2 Broschüren) | teils | **nur Kaufda** |
| **denns-biomarkt** | **0** | **78** | **50** | **nur Kaufda** |
| **nahkauf** | **0** | **66** | 0 | **nur Kaufda** (ohne Streichpreis) |
| dm | 0/1 | 128 | 0 | nur Kaufda (keine Streichpreise) |
| mueller | 0/1 | 59 | 0 | nur Kaufda (keine Streichpreise) |
| norma | 0 | 0 strukturiert (28-Seiten-Prospekt nur als Bilder) | — | **keine Quelle** |
| hit-markt | 0 | aktuell keine Broschüre auffindbar | — | offen |
| alnatura | 0 | 0 (Magazin ohne Preise) | — | keine Quelle |
| selgros | 0 | 0 strukturiert | — | keine Quelle |
| aetka, wasgau, diska, kodi, niedrig-preis | 0 | aktuell keine Broschüre | — | offen |

Beispiel-Ausbeute Streichpreis (echte Werte): Aldi Nord „Landkäse 2,49 € → 1,39 €", Netto Scottie
„H-Milch 0,85 € → 0,69 €", Kaufland „Cerealien 4,49 € → 2,39 €", Marktkauf 227/282 mit Streichpreis.

## 6. Klare Antworten auf die Leitfragen

**a) Liefert Kaufda strukturierte Produktpreise oder nur Prospekt-Bilder?**
Beides, aber **strukturierte Preise sind der Hauptwert**: `/api/personalisedOffers` liefert pro
Angebot `prices.mainPrice`, `prices.secondaryPrice` (Streichpreis/UVP-Flag), Grundpreis, Marke,
Gültigkeit, Händler und die Prospektseite als Bild-Crop. Die Prospektseiten als JPG
(`content-media.bonial.biz`) sind nur die visuelle Referenz.

**b) Brauchen wir Kaufda überhaupt, wenn Marktguru die großen Ketten liefert?**
**Ja, als zweite Quelle — aber gezielt, nicht als Ersatz.** Zwei Gründe, belegt:
1. **Streichpreis:** Marktguru hat `oldPrice` fast nie (1/257 REWE). Kaufda liefert ihn bei
   Kaufland 278/484, Netto-MD 249/384, Penny 151/305, Lidl 207/437. Für Mikes Pflichtfeld
   „Alter Preis / Ersparnis" ist Kaufda die **einzige Quelle, die das flächig liefert**.
2. **Ketten-Lücken:** Aldi Nord, Netto Supermarkt, Marktkauf, famila, combi, V-Markt, Globus,
   tegut, E-Center, Metro, denns, nahkauf, dm, Müller hat Marktguru nicht (0 Treffer); Kaufda
   liefert davon 12 Ketten mit strukturierten Angeboten.
Empfehlung für Mikes „einfach, wenig Overhead": **Marktguru als Basis** (ein Call je Kette,
`/api/v1/publishers/retailer/<name>/offers`), **Kaufda ergänzend** für (a) Streichpreise und
(b) die Marktguru-Lücken-Ketten. Beide sind reine HTTP-JSON-Quellen ohne Browser. Doppelte
Ketten (Lidl, Kaufland, …) pro Lauf entweder aus einer Quelle nehmen oder per offer-ID/Name
deduplizieren; Kaufda-Angebote haben eine stabile UUID + Prospektseiten-Referenz.

**c) Welche Ketten deckt Kaufda zusätzlich ab?**
Vollständig neu (strukturiert, live gemessen): **Aldi Nord (308), Netto Supermarkt (346),
Marktkauf (282), famila (335), combi (258), V-Markt (229), Globus (206), tegut (236),
E-Center (305), Metro (350), denns (78), nahkauf (66), dm (128), Müller (59)**. Dazu ~180
weitere Nicht-Lebensmittel-Ketten über `/Geschaefte` (toom, OBI, Rossmann, …), falls relevant.
Keine strukturierten Daten trotz Prospekt: Norma, Alnatura, Selgros. Aktuell ohne Prospekt
gefunden: HIT, aetka, Wasgau, diska, KODi, Niedrig-Preis (möglicherweise nur regional/local).

## 7. Offene Punkte

1. **Lokale Abweichung:** `personalisedOffers` liefert die **bundesweite** Broschüre; regionale
   Varianten („Dein Markt" REWE gibt es in 2 Ausgaben, Lidl Berlin vs. bundesweit) existieren.
   Für PLZ-nahe Genauigkeit bräuchte man pro `contentId` die passende Region —
   `/api/shelf?lat=&lng=` listet bereits regionsbezogene Broschüren (mit `closestStore`).
2. **`personalisedOffers` = volle Liste?** 437/437 bei Lidl spricht dafür, der Name „personalised"
   impliziert aber eine gewichtete Auswahl. Gegenprobe über `offers.main.totalItems`
   (Ketten-Landingpage) steht aus (Lidl zeigt 1000 als Obergrenze, Summe der Broschüren > 437).
3. **Norma/HIT/diska/aetka/Wasgau/KODi:** Prospekte ohne strukturierte Angebote bzw. derzeit ohne
   Broschüre. Ggf. lohnt der Blick in lokale Seiten (`/<Stadt>/<Kette>/p-r74`) — nicht getestet.
4. **`buildId`-Lebensdauer** der Next.js-Datenroute: ändert sich bei Deploy, muss je Lauf frisch
   aus dem HTML gezogen werden (unkritisch, 1 Request). `/api/shelf` + `/api/personalisedOffers`
   brauchen keine `buildId` und sind damit die robustere Basis.
5. **Kampagnen-Texte** („25 % auf alles") stehen teils in `prices.conditions`/`showConditions`,
   noch nicht systematisch ausgewertet.
6. **Netiquette:** `robots.txt` verlangt `crawl-delay: 2`; kein Rate-Limit beobachtet (10×200).
   Wochenlauf mit ~1 Request/Kette + 1/Broschüre bleibt weit im Rahmen.
7. **Preis-Typen:** `mainPrice` als Float mit Rundungsartefakten (1.7899999618530273) — im
   Importer runden (2 Nachkommastellen) oder `mainPriceFormatted` nehmen.

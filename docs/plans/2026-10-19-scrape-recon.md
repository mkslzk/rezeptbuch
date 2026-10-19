# Dossier: MOCA Angebots-Scraping — Ist-Zustand + Recherche-Ergebnisse

Stand 2026-10-19 (Charlie, live verifiziert). Grundlage für den Umbau-Plan.

## 1. Anforderung (Mike)

- **Wöchentliche Angebote aller deutschen Lebensmittelgeschäfte** erfassen.
- Pflichtfelder pro Angebot: **Geschäft**, **Alter Preis**, **Angebotspreis**, **prozentuale Ersparnis**.
- **Einfache Lösung mit möglichst wenig Overhead** — Mike will ausdrücklich keinen Wildwuchs.
- Fokus: **möglichst genaue Ermittlung der aktuellen Angebote**; Quellen: **Kaufda** und **Marktguru**;
  vorhandene APIs abgreifen statt HTML/Browser-Kratzen, wo möglich.
- Kontext: Ernährung verschiebt sich Richtung pflanzlich/vegan → Angebote sollen später filterbar sein
  (Kategorie/Brand/Produktname), aber das ist NICHT Teil dieses Umbaus.

## 2. Ist-Zustand im Code

Datei: `~/services/moca/server/src/services/offersScraper.cjs` (1.675 Zeilen, CommonJS).

| Funktion | Quelle | Methode | Felder |
|---|---|---|---|
| `scrapeWithBrowser(store)` | Direkt bei 8 Stores (aldi, lidl, netto, penny, norma, rewe, nettoLebensmittel, edeka) | Playwright (Firefox/Chromium), store-spezifische CSS-Selektoren, Scrollen | name, price, original_price (teils), store |
| `scrapeAldiApi()` | api.aldi-sued.de | HTTP/JSON | name, price, original_price |
| `scrapeEdekaApi()` | EDEKA-Markt-API | HTTP/JSON | name, price |
| `scrapeNormaHtml()` | norma-online.de | HTTP + HTML-Parsing | name, price |
| `scrapeFlipbook(store)` | Prospekt-Flipbooks | Screenshots + OCR (tesseract.js) | unzuverlässig, Rest |
| `scrapeMarktguruStore(page, info)` | marktguru.de/r/<store> | Playwright: Cookies akzeptieren, 8 s warten, bis zu 50× „Mehr Angebote" klicken, dann DOM-Extraktion | name, brand, price, unitPrice, offerId, url — **`originalPrice: null` ist hart verdrahtet** |
| `scrapeAllStores()` / `scrapeAllMarktguruStores()` | Orchestrierung | parallel/sequenziell | — |
| `hydrateOffersFromHistory()` | rezeptbuch.db | letzten Scrape-Durchlauf in den RAM laden | — |
| `scrapeAndPersist(source)` | — | Scrape + Historie schreiben (Automations-Pfad) | — |
| `matchItemsToOffers(items)` | — | Fuzzy-Matching Einkaufsliste ↔ Angebote | — |

Aktueller Lauf (2026-10-19): **913 Angebote in 169 s** über die 8 Direkt-Stores; Marktguru-Stores (kaufland,
netto-marken-discount, nahkauf, obi, toom, hornbach, hellweg, kabs) seit Mai ohne frischen Lauf.

Persistence: `rezeptbuch.db` → `offer_scrape_records` (ein Datensatz je Store+Lauf) und `offer_history`
(19.223 Zeilen, 16 Stores). Kein Feld für Rabatt-Prozentsatz, keine Gültigkeitsdaten, `oldPrice` faktisch nie gefüllt.
Datenweg ins Frontend: `GET /recipe/api/offers` → `{offers: {store: [{name, price, original_price, url, offer_id, source_url, store}]}, lastUpdated}`.

## 3. Recherche-Ergebnis: Marktguru-API funktioniert (verifiziert!)

1. `https://www.marktguru.de/r/<retailer>?zipCode=56377` ist **serverseitig gerendert**: die ersten **14**
   Angebote stehen als JSON im HTML (inkl. `price`, `oldPrice`, `referencePrice`, `validFrom`, `validTo`),
   `"totalResults"` nennt die echte Zahl (REWE 277, Lidl 810, Penny 295, Kaufland 489, Netto-MD 436).
   Query-Parameter wie `page`/`limit`/`offset` werden dort **ignoriert**.
2. Die Client-Config mit dem **öffentlichen** API-Key steckt ebenfalls im HTML:
   `{"config":{"apiHostAddress":"api.marktguru.de","apiKey":"…","clientKey":"…"}}`.
3. Damit funktioniert die JSON-API direkt (kein Browser, kein Login):

```bash
KEY=$(python3 -c "import re;print(re.search(r'\"apiKey\": \"?([^\"]+)', open('/tmp/mg.html').read()).group(1))")
curl -s -H "x-apikey: $KEY" -H "accept: application/json" \
  "https://api.marktguru.de/api/v1/offers?zipCode=56377&limit=512&offset=0"
```

Antwort: `{"totalResults":5207,"skippedResults":0,"results":[{id, description, volume, quantity, price,
oldPrice, referencePrice, requiresLoyalityMembership, leafletFlightId, validityDates:[{from,to}], externalId,
retailer:{…}, brand:{…}, product:{…}, images:[…]} …]}`

**Verifizierte Grenzen:**
- `limit` wird bei **512** gekappt (512 von 5.207 mit `limit=512`, `1000` und `5000` liefern ebenfalls 512).
  → Vollständige Erfassung braucht **Offset-Paginierung** (0, 512, 1024, …).
- `zipCode` wirkt (5.207 Angebote für 56377).
- **Offen:** Wie filtert man auf ein Geschäft? Getestet ohne Wirkung: `retailers`, `retailerUniqueName`,
  `allowedRetailers`, `retailer`, `storeChainIds` (totalResults blieb 5.207). Auch die exakte Struktur der
  `retailer`-Objekte und wie viele Angebote tatsächlich `oldPrice` gefüllt haben, ist noch offen (in den ersten
  50 REWE-Ergebnissen war `oldPrice` überwiegend `null`; im SSR-HTML gab es sehr wohl gefüllte `oldPrice`-Paare).
- Der Endpunkt `/api/v1/advertisementcollections?as=mobiledetailed&limit=20&type=teaser&zipCode=…` antwortet
  ebenfalls (Prospekt-Teaser), dito `/api/v1/configurations/web` (braucht `x-apikey`).
- Zweiter Host: `mppx.marktguru.de` (nur Tracking/Engage — irrelevant).

## 3b. NACHGETRAGEN (verifiziert, wichtigster Baustein)

**Der Endpunkt für „alle Angebote eines Geschäfts" ist gefunden** — Mitschnitt des echten
Web-Clients (Playwright, Klick auf „MEHR ANGEBOTE" löst die Paginierung aus):

```
GET https://api.marktguru.de/api/v1/publishers/retailer/<uniqueName>/offers?as=mobile&limit=512&offset=0&zipCode=56377
Header: x-apikey: <apiKey aus dem Seiten-HTML>  +  x-clientkey: <clientKey aus dem Seiten-HTML>
```

- **Ein Call pro Kette** liefert die komplette Liste (REWE: 257/257 in einem Aufruf mit `limit=512`).
- Feld-Abdeckung bei REWE (257 Angebote): `price` 257/257, `referencePrice` 257/257, `product.name`
  257/257, `brand.name` 257/257, `retailer.uniqueName` 257/257, `unit` 257/257, `quantity` 257/257,
  `validFrom`/`validTo` 257/257, `images` 257/257, `volume` 57/257 — **`oldPrice` nur 1/257.**
- Angebots-Objekt enthält genau: `id, description, product{id,name}, retailer{id,name,uniqueName},
  brand{id,name,uniqueName}, unit{shortName,name}, price, oldPrice, referencePrice, volume, quantity,
  storeId, storeAddress, validFrom, validTo, images, crossLinks`.
- `as=` (mobile/web/detailed/mobiledetailed/full) ändert **nichts** — identische Felder und Werte.
- `limit=512` ist das Maximum; darüber wird gekappt (512 von 5.207). Offset-Paginierung funktioniert.
- Ohne Retailer-Pfad liefert `/api/v1/offers` einen Mix, in dem `retailer` **null** ist → keine
  Store-Zuordnung möglich. Der Retailer-Pfad ist also Pflicht.

**Ketten-Abdeckung (live gemessen, PLZ 56377, `totalResults`):**

| Kette | Angebote | | Kette | Angebote |
|---|---|---|---|---|
| lidl | 816 | | edeka | 222 |
| kaufland | 489 | | rossmann (Drogerie) | 294 |
| aldi-sued | 485 | | penny | 288 |
| netto-marken-discount | 393 | | rewe | 242 |

Ohne Treffer im Gebiet / nicht geführt: `aldi-nord`, `norma`, `nahkauf`, `marktkauf`, `globus`, `tegut`,
`hit`, `famila`, `combi`, `v-markt`, `real`, `netto`, `dm`, `mueller`, `alnatura`, `denn-reform`,
`bio-company` (jeweils 0 oder 1 Treffer).

**Konsequenz für „alter Preis / Ersparnis":** Der Streichpreis ist bei Marktguru die Ausnahme (1/257).
Die prozentuale Ersparnis lässt sich also **nicht** allein aus der Quelle ableiten. Naheliegende Lösung
ohne Zusatzaufwand: **alter Preis = `oldPrice` aus der Quelle, sonst der zuletzt in unserer eigenen
`offer_history` gesehene Preis desselben Produkts/Stores** (19.223 Zeilen Historie sind schon da).
Dann ist `discount_percent` für Wiederholungs-Angebote berechenbar und sonst ehrlich `null`.

## 4. Offene Fragen (aktualisiert)

1. ~~Retailer-Filter~~ → **gelöst** (siehe 3b, `/api/v1/publishers/retailer/<uniqueName>/offers`).
2. **Streichpreis-Lücke**: Ist `oldPrice` bei anderen Ketten besser gefüllt (Stichprobe Lidl/Kaufland/Aldi)?
   Gibt es zusätzlich einen Endpunkt mit Kampagnen-Rabatten („25 % auf alles")? Wie schlägt sich
   `referencePrice` (Grundpreis) vs. `oldPrice`?
3. **Ketten-Vollständigkeit**: Sind `norma`/`marktkauf`/`globus`/`tegut`/`hit`/`famila` unter anderen
   `uniqueName`-Schreibweisen erreichbar (z. B. `norma-online`, `marktkauf-…`)? Wie listet man die
   verfügbaren Retailer sauber auf (Endpoint/`advertisementcollections`)?
4. **Kaufda/Bonial**: Netzwerkmitschnitt ergab nur `www.kaufda.de/sessionData` (JWT-Token) und
   `/api/user/account/id`; die Prospekt-/Angebots-API ist noch nicht gefunden (getestete URLs liefen in
   Next.js-404). Fragen: gibt es strukturierte Angebotsdaten (Preis/Streichpreis/Gültigkeit) oder nur
   Prospekt-Bilder? Brauchen wir Kaufda überhaupt, wenn Marktguru die großen Ketten liefert?
5. **Gültigkeit**: `validFrom`/`validTo` sind UTC mit 22:00/21:59-Grenzen (= Mitternacht deutscher Zeit) —
   Semantik „ab Montag" korrekt auf deutsche Woche abbilden.
6. **Zielarchitektur** (Wunsch Mikes: einfach, wenig Overhead): Ein einheitliches Angebots-Schema
   (store, product, brand, price, old_price, discount_percent, valid_from/to, url) und möglichst
   **wenige, reine HTTP-JSON-Aufrufe** statt Playwright/Store-Selektoren/OCR.

## 5. Randbedingungen für den Plan

- Node 22, CommonJS, `better-sqlite3`, kein TypeScript, keine neuen schweren Abhängigkeiten (fetch ist eingebaut).
- Kostenlos, privat, für einen Haushalt — keine Cloud-Scraping-Dienste, kein Apify-Abo o. Ä.
- Der Plan muss Befehle/Dateien konkret benennen und einen Verifikationsschritt pro Baustein enthalten.
- Bestehende API (`GET /recipe/api/offers` → `{offers:{store:[…]}, lastUpdated}`) und die Persistenz
  (`offer_history`, `offer_scrape_records`) sowie `matchItemsToOffers` sollen weiter funktionieren;
  Schema-Änderungen sind erlaubt, müssen aber migrationssicher sein.
- Deutsche Antwort bevorzugt.

# Gegenentwurf + Aufräum-Plan: Angebots-Scraping über Marktguru-API

Stand 2026-10-19 (Kimi, alle Aussagen heute live per curl verifiziert).
Gegenprobe zu `docs/plans/2026-10-19-scrape-recon.md` (Charlie) — bestätigt dessen Kernbefund und schärft ihn an mehreren Stellen.

## 1. Empfehlung in fünf Sätzen

1. Wir ersetzen sämtliche Playwright-/OCR-/Store-Selektor-Scraper durch **eine** reine HTTP-JSON-Integration gegen `api.marktguru.de/api/v1/publishers/retailer/<uniqueName>/offers` — ein Request pro Kette (plus Offset-Paginierung ab 512 Treffern), ohne Browser, ohne Login, ohne neue Abhängigkeit (`fetch` ist in Node 22 eingebaut).
2. **Einzige Ausnahme: NORMA bleibt Direkt-Scrape** (`scrapeNormaHtml`, reines HTTP+cheerio), weil Marktguru für NORMA regional nur 15 Non-Food-Artikel liefert und die Lebensmittel-Angebote der Kette dort faktisch fehlen (Beleg §3).
3. Die Pflichtfelder Geschäft / Angebotspreis / Gültigkeit liefert die API vollständig (`retailer.name`, `price`, `validFrom`/`validTo` je 100 % befüllt); **alter Preis und prozentuale Ersparnis** kommen primär aus `oldPrice` (dünn: 0–18 % je Kette) und sekundär aus unserer eigenen `offer_history` (19.223 Zeilen) als Fallback — `discount_percent` ist sonst ehrlich `null`.
4. Der API-Key ist öffentlich im HTML von marktguru.de eingebettet und wird bei HTTP 401 **automatisch neu aus dem HTML gezogen** (Verfahren §2.3, heute verifiziert); `x-clientkey` ist nachweislich unnötig (Antwort byte-identisch mit/ohne).
5. Rollout hinter Feature-Flag `offersSource` mit Parallelbetrieb: alte Pfade schreiben weiter `source='direct'`, der neue Pfad `source='marktguru'`; nach zwei sauberen Wochenläufen werden ~1.100 Zeilen toter Code sowie die Dependencies `playwright` und `tesseract.js` entfernt.

## 2. API-Verifikation (heute, PLZ 56377)

### 2.1 Stabilität und Grenzen

| Prüfung | Ergebnis |
|---|---|
| `GET …/publishers/retailer/rewe/offers?as=mobile&limit=512&offset=0&zipCode=56377` mit `x-apikey` | HTTP 200, 168.502 Bytes, 0,42 s |
| `limit` | wird bei **512** gekappt; Offset-Paginierung lückenlos: lidl 512 + 304 = 816 = `totalResults`, **0 ID-Überlappung** |
| Unbekannter Retailer (`gibts-nicht-xyz`) | HTTP 200, `{"totalResults":0,"results":[]}` — kein Fehler |
| 10 schnelle Requests hintereinander | 10 × HTTP 200, kein Rate-Limit beobachtet |
| Antwort-Header | `cache-control: public,max-age=900`, `x-servercacheusage: Hit` → Server cached 15 min, Wiederholungen sind billig |
| `as=` (mobile/web/…) | ohne Wirkung (Charlies Befund, nicht widerlegt) |
| `oldPrice`-Typ | immer Zahl (`float`); **0.0 = „kein Streichpreis"** → Prüfung muss `oldPrice > 0` sein, nicht `!= null` |
| `referencePrice` | ist der **Grundpreis** (€/kg bzw. €/l), KEIN Streichpreis — darf nicht als „alter Preis" missverstanden werden |

Abdeckung heute (`totalResults`, PLZ 56377): lidl 816, kaufland 504, aldi-sued 500,
netto-marken-discount 408, rossmann 309, penny 303, rewe 257, edeka 237.
`oldPrice > 0`: aldi-sued 18 %, rossmann 17 %, edeka 3 %, rewe 1/257, lidl/kaufland/penny/netto-md **0 %**.

### 2.2 Gegenprobe `x-clientkey`

- Request **ohne** `x-clientkey` (nur `x-apikey`): HTTP 200, Antwort **byte-identisch** zur Variante mit beiden Headern (`cmp` ohne Diff).
- Request ganz ohne Header oder mit erfundenen Keys: HTTP 401, Body `"Invalid or missing api key"`.
- **Fazit:** Nur `x-apikey` wird serverseitig geprüft. `x-clientkey` kann im Code entfallen.

### 2.3 Key-Rotation und automatische Erneuerung

- Der **clientKey im HTML hat sich seit der heutigen Ablage in `.opencode-scratch/mg_keys.txt` bereits geändert** (frisches HTML ≠ gespeicherter Wert) — Rotation passiert real, ist aber irrelevant, weil der Server den clientKey nicht prüft (§2.2).
- Der **apiKey ist stabil**: frisch aus dem HTML extrahierter Wert == gespeicherter Wert (44 Zeichen).
- Erneuerungsverfahren (heute verifiziert, genau so im Code umzusetzen):

```bash
curl -s -A 'Mozilla/5.0' 'https://www.marktguru.de/r/rewe?zipCode=56377' \
  | grep -oP '"apiKey":\s*"\K[^"]+'   # liefert den aktuellen apiKey
```

  Im Scraper: Key im RAM cachen; bei HTTP 401 einmalig HTML nachladen, Key per Regex
  `/["']apiKey["']:\s*"([^"]+)"/` neu extrahieren, Request wiederholen. Schlägt auch das fehl → Kette für diesen Lauf überspringen und Fehler in `offer_scrape_records.error` protokollieren (bestehendes Feld).

### 2.4 Gültigkeits-Semantik

`validFrom`/`validTo` kommen als UTC mit 22:00-/21:59-Grenzen, z. B. `2026-10-18T22:00:00Z` bis `2026-10-24T21:59:00Z` = **Montag 00:00 bis Samstag 23:59 deutscher Zeit** (Oktober = CEST, UTC+2). Die Umrechnung muss über die Zeitzone `Europe/Berlin` erfolgen, **nicht** über hart kodiertes +2 — nach der CEST→CET-Umstellung (25.10.2026) verschiebt sich die UTC-Grenze auf 23:00. Anzeige-Regel: `gültig = validTo >= jetzt`, Wochenlabel aus `validFrom` in lokaler Zeit.

## 3. Löschliste: was WEG kann, was BLEIBEN muss

### 3.1 WEG (mit Beleg)

| Funktion / Block | Zeilen (ca.) | Begründung + Beleg |
|---|---|---|
| `scrapeWithBrowser` generische Playwright-Engine | 757–839 | Nach Umstellung braucht **keine** Kette mehr einen Browser (MG = HTTP, NORMA = HTTP+cheerio). |
| `SCRAPE_CONFIG`-Selektoren für `aldi`, `lidl`, `netto`, `nettoLebensmittel`, `penny`, `rewe` | 109–404 | Alle sechs Ketten liefert die MG-API vollständig (§2.1: lidl 816, penny 303, rewe 257 …). `netto` und `nettoLebensmittel` scrapen ohnehin dieselbe Kette (netto-online.de = Netto Marken-Discount), die MG als `netto-marken-discount` (408) abdeckt — doppelt redundant. |
| `scrapeAldiApi` + `fetchAldiCategoryWithPagination` | 844–989 | Startet selbst Playwright nur für Session-Cookies; MG liefert `aldi-sued` mit 500 Angeboten und 18 % `oldPrice` — besser als die meisten Ketten. |
| `scrapeEdekaApi` | 994–1114 | Braucht Firefox + Markt-ID-Rätselraten (`__NEXT_DATA__`-Parsing); liefert keinerlei `original_price`. MG liefert `edeka` (237, davon 3 % mit `oldPrice`) per einem HTTP-Call. |
| `scrapeFlipbook` | 565–628 | **Tot**: kein Eintrag in `SCRAPE_CONFIG` hat mehr `isFlipbook` — der Codepfad ist unerreichbar. |
| Tesseract-OCR (`getTesseractWorker`, `ocrImage`, `USE_OCR`, Exit-Hook) | 85–86, 426–447, 1663–1670 | Wird nur vom toten Flipbook-Pfad benutzt. Dependency `tesseract.js` aus `package.json` entfernen. |
| `parseWithOllama` + LLM-Fallback in diesem Modul (`USE_OLLAMA`, `getLlmClient`-Import) | 85–90, 450–560 | Wird nur vom Flipbook-OCR-Pfad aufgerufen. **`llmClient.cjs` selbst bleibt** (wird von anderen Modulen genutzt) — entfernt wird nur der Import/die Verwendung hier. |
| `scrapeMarktguruStore` (Playwright-Version) | 1131–1188 | Klickt bis zu 50× „Mehr Angebote", wartet 8 s, verdrahtet `originalPrice: null` hart — die API liefert dasselbe in 0,4 s ohne Browser **und** mit `oldPrice`. |
| `scrapeAllMarktguruStores` (Browser-Orchestrierung) | 1190–1265 | Wird durch `fetchMarktguruRetailer()`-Schleife ersetzt. Baumarkt-/Möbel-Ketten (toom, hornbach, obi, hellweg, kabs, XXXLutz …) fliegen mit raus — Mikes Fokus ist Lebensmittel; `rossmann` kommt stattdessen dazu. |
| `parseCheerio` generischer Fallback-Parser | 1266–1366 | Wird ausschließlich von `scrapeWithBrowser` aufgerufen. |

Summe: grob **1.100 von 1.675 Zeilen** entfallen; die Datei schrumpft auf ~500 Zeilen.

### 3.2 MUSS bleiben (mit Beleg)

| Funktion | Begründung + Beleg |
|---|---|
| **`scrapeNormaHtml` + `parseNormaPage`** | **Einzige Kette, die Marktguru nicht abdeckt.** MG liefert für `norma` heute 15 Treffer — allesamt Non-Food (Jumbotopf, Tranchierbrett, Backformen; Stichprobe §Test 8). Die NORMA-Eigen-Seite liefert ~200 Lebensmittel-Angebote über serverseitig gerenderte Wochenseiten — reines HTTP+cheerio, kein Browser, kein Akamai-Problem. Billig zu behalten, funktional nicht ersetzbar. |
| `fetchWithRetry` | Wird von `scrapeNormaHtml` und dem neuen MG-Key-Refresh genutzt. |
| Progress-Tracking (`setProgress`/`getProgress`/`clearProgress`) | Frontend pollt `/api/offers/scrape/progress` — Schnittstelle bleibt. |
| `scrapeAndPersist`, `hydrateOffersFromHistory`, `getOffers`, `matchItemsToOffers` | Kern-Infrastruktur: Persistenz, Neustart-Hydration, Einkaufslisten-Matching. Unverändert weiterbenutzt; `matchItemsToOffers` profitiert sogar (mehr Kette, Felder unverändert). |
| Store-Exclusion (`getExcludedStores`/`STORE_EXCLUDED`) | Settings-Feature, greift quellunabhängig. |
| Mutual-Lock (`currentScrapePromise`) | Verhindert Doppel-Scrapes, bleibt nötig. |

## 4. Datenmodell

Angebots-Objekt im RAM/JSON (rückwärtskompatibel zum bestehenden Frontend-Shape
`{offers:{store:[…]}, lastUpdated}` — bestehende Keys bleiben, neue kommen hinzu):

```js
{
  store: 'rewe',               // Schlüssel = MG uniqueName bzw. 'norma'
  name: 'Südtiroler',          // product.name (+ ggf. description angehängt)
  brand: 'Merano Speck',       // brand.name (Spalte existiert bereits!)
  price: 2.79,                 // Angebotspreis (Pflicht, > 0)
  original_price: 3.49 | null, // oldPrice>0, sonst Historien-Fallback, sonst null
  discount_percent: 20 | null, // gerundet, nur wenn original_price > price
  valid_from: '2026-10-19',    // aus validFrom, Europe/Berlin → YYYY-MM-DD
  valid_to: '2026-10-24',      // aus validTo, Europe/Berlin
  url: 'https://www.marktguru.de/offers/<id>',
  offer_id: '<id>',            // stabile Dedup-ID (besser als name|price)
  source_url: 'marktguru:rewe',
  source: 'marktguru'          // oder 'direct-norma'
}
```

DB-Migration (additiv, idempotent — exakt das vorhandene try/catch-Muster aus
`offersHistory.cjs` Zeilen 44–47):

```sql
ALTER TABLE offer_history ADD COLUMN discount_percent REAL;
ALTER TABLE offer_history ADD COLUMN valid_from TEXT;
ALTER TABLE offer_history ADD COLUMN valid_to TEXT;
```

`original_price` und `brand` existieren bereits als Spalten. Kein Feld der Pflichtliste
fehlt danach: Geschäft=`store`, alter Preis=`original_price`, Angebotspreis=`price`,
Ersparnis=`discount_percent`.

**Ersparnis-Logik (wichtig, weil `oldPrice` dünn ist):**
1. `oldPrice > 0` aus der API → `original_price = oldPrice`.
2. Sonst: letzter bekannter Preis desselben Produkts+Stores aus `offer_history`
   (Normalisierung wie `normalizeText`, exakter Match auf `offer_id` wo vorhanden),
   sofern älter als der aktuelle Gültigkeitsbeginn.
3. `discount_percent = round(100 * (1 - price/original_price))`, nur wenn
   `original_price > price > 0`; sonst `null` — niemals `referencePrice`
   (Grundpreis!) als Streichpreis verwenden.

## 5. Migrationspfad (19.223 Zeilen Historie bleiben erhalten)

1. **Keine Zeile wird angefasst.** Die drei neuen Spalten sind bei Altdaten `NULL` —
   Abfragen, die sie nicht kennen, laufen unverändert; `hydrateOffersFromHistory`
   liest nur die alten Spalten.
2. Schlüssel-Kontinuität: Die Direkt-Scraper benutzten bereits die Store-Schlüssel
   `lidl`, `penny`, `rewe`, `edeka` — identisch zu den MG-`uniqueName`s. Umbenannt
   werden nur: `aldi` → `aldi-sued`, `netto`/`nettoLebensmittel` → `netto-marken-discount`.
   Einmaliger, protokollierter Update:
   `UPDATE offer_history SET store='aldi-sued' WHERE store='aldi';`
   `UPDATE offer_history SET store='netto-marken-discount' WHERE store IN ('netto','nettoLebensmittel');`
   (vorher `cp rezeptbuch.db rezeptbuch.db.bak-2026-10-19`).
3. Der Historien-Fallback für `original_price` greift ab Tag 1 auf die
   vorhandenen 19.223 Zeilen zu — dafür wurde sie ja behalten.
4. `offer_scrape_records.source` kennt bereits Werte außer `direct`
   (Spalte mit Default vorhanden) → neue Läufe schreiben `'marktguru'` bzw.
   `'direct-norma'`, Auswertungen nach Quelle bleiben möglich.

## 6. Sanfter Rollout (Feature-Flag / Parallelbetrieb)

1. **Flag**: `offersSource` in `offers-config.json` (`direct` | `marktguru` | `both`,
   Default zunächst `direct` — kein Verhaltenswechsel beim Deploy).
2. **Phase 1 (`both`, 1–2 Wochenläufe):** Neuer Pfad läuft zusätzlich und schreibt mit
   `source='marktguru'` in dieselben Tabellen; der Cache für `/recipe/api/offers`
   bleibt vorerst beim alten Pfad. Vergleichs-Report pro Lauf: Anzahl je Kette alt
   vs. neu, Stichprobe der Felder.
3. **Phase 2 (`marktguru`):** Flag umgestellt → `scrapeAndPersist` ruft nur noch
   `fetchMarktguruRetailer()` für `[lidl, kaufland, aldi-sued, netto-marken-discount,
   rossmann, penny, rewe, edeka]` + `scrapeNormaHtml('norma', …)`; Hydration und
   Frontend bleiben unverändert.
4. **Phase 3 (Aufräumen, erst nach zwei fehlerfreichen Wochenläufen):** §3.1-Liste
   löschen, `playwright` + `tesseract.js` aus `package.json` entfernen
   (`npm prune`), diese Plan-Datei als erledigt markieren.
5. **Rollback** in jeder Phase: Flag zurück auf `direct` — alter Code ist bis Phase 3
   unangetastet.

## 7. Verifikation (pro Baustein ein prüfbarer Schritt)

| Baustein | Prüfung | Erfolgskriterium |
|---|---|---|
| Key-Refresh | Temporär ungültigen Key setzen, Lauf starten | 401 → automatischer HTML-Reload → HTTP 200, Lauf komplett |
| Vollständigkeit | `node -e` auf neuen Fetcher für die 8 Ketten | Summen ≥ §2.1-Werte −10 % (lidl ≥ 730, kaufland ≥ 450, …); `totalResults` == geladene Summe inkl. Paginierung |
| Pflichtfelder | Stichprobe 50 Angebote über alle Ketten | `store`, `price`, `valid_from/to` zu 100 % befüllt; `discount_percent` entweder korrekt gerechnet (Nachrechnen!) oder `null`, nie NaN |
| NORMA | `scrapeNormaHtml`-Lauf | ≥ 100 Angebote, alle mit `price`, `store='norma'` |
| Historie | `SELECT COUNT(*) FROM offer_history` vor/nach Migration | identisch (19.223), neue Spalten vorhanden (`.schema`) |
| Frontend | `GET /recipe/api/offers` | Shape `{offers:{store:[…]}, lastUpdated}` unverändert; `matchItemsToOffers` mit Testliste liefert Treffer |
| Parallelbetrieb | Ein Lauf `both` | Pro Kette zwei `offer_scrape_records` (source `direct` + `marktguru`), kein Lock-Konflikt |

## 8. Risiken (offen benannt)

1. **Rechtlich/ToS:** Der apiKey ist zwar öffentlich im eigenen HTML der Seite ausgeliefert und es wird kein Login umgangen, aber die API ist undokumentiert — automatisierte Nutzung kann den Nutzungsbedingungen von marktguru widersprechen. Privater Haushalt, ~10 Requests pro Woche, Server cached ohnehin 15 min → geringe reale Last, aber kein Freibrief. Wenn Marktguru sperrt, steht mit `scrapeNormaHtml` nur NORMA als funktionierender Direkt-Fallback da; die Playwright-Pfade müssten aus dem Git-Verlauf zurückgeholt werden (daher erst in Phase 3 löschen).
2. **API-Änderung ohne Ankündigung:** v1-Endpunkt, Feldnamen oder Retailer-Pfad können kippen → Verifikations-Schritt „Vollständigkeit" als wöchentlicher Smoke-Test; bei `totalResults=0` über alle Ketten Alarm im Log statt leerem Cache (alter Cache bleibt bestehen).
3. **Key-Rotation:** Für den clientKey heute bereits beobachtet (§2.3) — beim apiKey jederzeit möglich → Auto-Refresh ist Pflichtbestandteil, nicht optional; zusätzlich sollte der Regex zwei Varianten (`"apiKey": "…"` und `"apiKey":"…"`) tolerieren.
4. **Rate-Limits:** Heute keine beobachtet (10 × 200 in Folge, Server-Cache), aber nicht garantiert → max. 1 Request/2 s, sequenziell statt parallel, bei HTTP 429 exponentieller Backoff.
5. **Datenqualität `oldPrice`:** 0 % bei lidl/kaufland/penny/netto-md (§2.1) — ohne Historien-Fallback ist „prozentuale Ersparnis" für diese Ketten überwiegend `null`; der Fallback funktioniert erst ab der zweiten Woche mit Daten und nur für wiederkehrende Produkte. Mike muss wissen: Das Pflichtfeld „Ersparnis" ist quellenseitig nicht vollständig abdeckbar — ehrliches `null` statt erfundener Werte.
6. **Gültigkeits-Semantik:** UTC→Europe/Berlin-Umrechnung muss Zeitzonen-DB nutzen (CEST→CET-Wechsel 25.10.2026); falsch gerechnet erscheinen Angebote einen Tag zu früh/spät. Zusätzlich können einzelne Angebote kürzere Laufzeiten innerhalb der Woche haben (Daten zeigen durchgängig Mo–Sa, aber nicht garantiert).
7. **Regionale Abweichung:** MG-Angebote gelten für PLZ 56377 aggregiert; marktindividuelle EDEKA-/REWE-Sonderaktionen können abweichen — hinnehmbar für einen Haushalt, aber als bekannte Ungenauigkeit dokumentiert.
8. **Verlust der Penny-Streichpreise:** Der alte Penny-Scraper las UVP-Streichpreise aus `data-label-cross-out` — MG liefert für penny 0 % `oldPrice`. Bewusster Trade-off zugunsten von Einfachheit; über den Historien-Fallback teilweise kompensiert.

# Umsetzungsplan: Angebots-Scraping Rework (MOCA)

Stand 2026-10-19 · von Charlie, auf Basis von drei Modell-Entwürfen (`draft-glm.md`, `draft-kimi.md`,
`draft-kaufda.md`) **plus eigener Live-Verifikation**. Alle Zahlen sind selbst per curl/Node gemessen —
Rohdaten: `docs/plans/2026-10-19-scrape-recon.md`, Scratch: `~/services/moca/.opencode-scratch/`.

---

## 1. Auftrag (Mike)

- Wöchentliche Angebote **aller deutschen Lebensmittelgeschäfte** erfassen.
- Pflichtfelder pro Angebot: **Geschäft · alter Preis · Angebotspreis · prozentuale Ersparnis**.
- **Einfach, wenig Overhead** — keine Store-Selektoren, kein Overengineering.
- Fokus liegt auf **genauer Ermittlung der aktuellen Angebote**; vorhandene APIs sind zu bevorzugen.

---

## 2. Ist-Zustand: Funktionsinventar mit Urteil

Live-Lauf heute (Playwright, PLZ 56377): **913 Angebote in 169 s** —
norma 405, penny 258, rewe 84, nettoLebensmittel 53, aldi 43, netto 37, edeka 19, lidl 14.
Persistence: `offer_history` (19.223 Zeilen), `offer_scrape_records`; `GET /recipe/api/offers` →
`{offers:{store:[…]}, lastUpdated}`.

| Funktion (heute) | Quelle | Liefert heute | Urteil | Beleg |
|---|---|---|---|---|
| `scrapeWithBrowser` + `SCRAPE_CONFIG` + `STORES` | 8 Stores per Playwright/CSS | 913 Angebote / 169 s | **WEG** (außer NORMA) | Marktguru liefert dieselben Ketten vollständiger: lidl 816 vs. 14, kaufland 504, aldi-sued 500 vs. 43, penny 303 vs. 258, rewe 257 vs. 84, edeka 237 vs. 19 |
| `scrapeAldiApi` | api.aldi-sued.de | aldi 43 | **WEG** | aldi-sued 500 via Marktguru |
| `scrapeEdekaApi` | EDEKA-Markt-API | edeka 19 | **WEG** | edeka 237 via Marktguru |
| `scrapeNormaHtml` + `parseNormaPage` | norma-online.de (HTML) | **405** (größter Lieferant!) | **BLEIBT** | Marktguru kennt NORMA nur mit 15 Non-Food-Alt-Treffern; NORMA-Lebensmittel gibt es nur direkt |
| `scrapeFlipbook` + `getTesseractWorker`/`ocrImage` + `parseWithOllama` | Prospekt-Bilder/OCR/LLM | Restposten, unzuverlässig | **WEG** | ersetzt durch JSON-Quellen |
| `scrapeMarktguruStore` (Playwright, „Mehr Angebote" klicken) | marktguru.de DOM | im Mai 8 Ketten | **WEG → API** | `/api/v1/publishers/retailer/<name>/offers` liefert dasselbe strukturiert |
| `parseCheerio` (Marktguru-SSR) | marktguru.de HTML | 14/Seite | **WEG** | API liefert alles auf einmal |
| Progress-Tracking, Scrape-Lock, `getConfig`/PLZ, `fetchWithRetry`, Fuzzy-Matching (`matchItemsToOffers`), `getOffers`, `hydrateOffersFromHistory`, `scrapeAndPersist` | intern | — | **BLEIBT** | Pfad wird nur intern umgesteckt |

Dependencies: `playwright`, `playwright-extra`, `playwright-stealth`, `tesseract.js` → entfernen (nach Grep-Prüfung;
`cheerio` bleibt für `recipeImporter.cjs` und den NORMA-Scraper).

---

## 3. Datenquellen (beide live verifiziert)

### 3.1 Marktguru-API — Primärquelle (Breite)

```
GET https://api.marktguru.de/api/v1/publishers/retailer/<uniqueName>/offers
      ?as=mobile&limit=512&offset=<n>&zipCode=<PLZ>
Header: x-apikey: <apiKey>          # reicht allein — eigener Test: identische Antwort ohne x-clientkey
```
- **Keys** stehen öffentlich im SSR-HTML von `https://www.marktguru.de/r/rewe`
  (`"apiKey":"…"`); Auto-Refresh bei 401/403 = 1 curl + Regex.
- `limit` max. **512** (darüber gekappt) → Offset-Paginierung (nur Lidl braucht 2 Calls).
- `/api/v1/offers` **ohne** Retailer-Pfad liefert `retailer: null` → unbrauchbar, Retailer-Pfad ist Pflicht.

| Kette | Angebote | Calls | `oldPrice > price` (echter Streichpreis) | `validFrom/To` |
|---|---|---|---|---|
| lidl | 816 | 2 | 0 | 100 % |
| kaufland | 504 | 1 | 0 | 100 % |
| aldi-sued | 500 | 1 | 89 | 100 % |
| netto-marken-discount | 408 | 1 | 0 | 100 % |
| penny | 303 | 1 | 0 | 100 % |
| rewe | 257 | 1 | 1 | 100 % |
| edeka | 237 | 1 | 6 | 100 % |
| rossmann *(Drogerie, optional)* | 309 | 1 | 52 | 100 % |
| **Σ** | **3.334** | **9** | **148** | **100 %** |

**Laufzeit: 2,8 s für alle 8 Ketten** (Playwright heute: 169 s). Rohfeld-Schema:
`id, description, product{name}, retailer{name,uniqueName}, brand{name}, unit, price, oldPrice,
referencePrice, volume, quantity, storeId, validFrom, validTo, images`.
**Wichtig:** `oldPrice` ist fast immer `0` oder **kleiner als `price`** → nur `oldPrice > price` ist ein
echter Streichpreis. `referencePrice` ist der **Grundpreis** (€/kg), kein alter Preis.
**Gültigkeit:** je Kette ~15 abgelaufene Altreffer; 1.755 von 3.025 sind aktuell gültig → Filter
`validTo >= jetzt` beim Persistieren ist Pflicht (sonst 2024er-Leichen bei norma/aldi-nord/nahkauf).

### 3.2 Kaufda/Bonial — Streichpreis- und Ketten-Ergänzung

Kette von Aufrufen (**kein Login, kein Token**; `robots.txt` verlangt `crawl-delay: 2`):

1. `GET https://www.kaufda.de/api/shelf?lat=<lat>&lng=<lng>&size=24&page=N` → **Prospekt-Kiosk der
   Region** (`contents[]` mit `contentId`, `title`, `validFrom/validUntil`, `pageCount`,
   `publisher{name,type}`, `closestStore{name,zip,city}`), paginiert (102 Prospekte = 5 Seiten).
   Braucht **keine** buildId → robustester Einstieg. PLZ vorher in lat/lng übersetzen.
2. Alternativ/vorher pro Kette: `GET https://www.kaufda.de/_next/data/<buildId>/de-DE/Geschaefte/<Kette>.json`
   → `pageProps.pageInformation.brochures.{viewer,intendedSearchArea}` mit `contentId`, `pageCount`,
   Gültigkeit. **Achtung:** bei Aldi Nord, Netto Supermarkt, Marktkauf, famila, combi, V-Markt liegen die
   ketteneigenen Prospekte im Bucket `intendedSearchArea`, nicht in `viewer`. `buildId` aus dem HTML
   jeder kaufda-Seite (`"buildId":"…"`), ändert sich bei Deploy.
3. Pro Prospekt: `GET https://www.kaufda.de/api/personalisedOffers?brochureId=<contentId>&size=500
   &bonialAccountId=<beliebige-UUID>&userPlatformCategory=desktop.web.browser`
   → `contents[]` = **vollständige** Broschüren-Angebote (Lidl 437/437; der Parameter `page` wird
   ignoriert, also großes `size` statt Paginierung).

Felder je Angebot: `id` (UUID), `title`, `brand`, `description`, **`prices.mainPrice`** +
`mainPriceFormatted`, **`prices.secondaryPrice`** + `secondaryPriceFormatted`,
`prices.secondaryPriceIsUVP` (true = UVP, false = alter Aktionspreis), `prices.priceByBaseUnit`,
`prices.conditions`/`showConditions` („2 für“-Aktionen), **`validFrom`/`validUntil`**,
`publisherName`, `publisherId`, `categories`/`categoryPaths`, `parentContent.page.number`
(Prospektseite), `offerImages` (Bildausschnitt).
**Achtung:** `mainPrice` ist ein Float mit Artefakten (`1.7899999618530273`) → auf 2 Nachkommastellen
runden oder `mainPriceFormatted` parsen.

**Eigener Beleg (Kaufland, heute):** 484 Angebote, **278 mit Streichpreis** (57 %), 457 mit Hauptpreis;
Beispiele: „Cerealien“ 4,49 € → 2,39 €, „Schokolade“ 1,59 € → 0,88 €.

| Kette (Kaufda, live gemessen) | Angebote | mit Streichpreis | bei Marktguru? |
|---|---|---|---|
| Lidl | 439 | 207 | ja (0 Streichpreise) |
| Kaufland | 484 | 278 | ja (0) |
| Netto Marken-Discount | 384 | 249 | ja (0) |
| Penny | 305 | 151 | ja (0) |
| REWE | 229 (+ „Dein Markt“) | 12 | ja (1) |
| EDEKA | 245 | 48 | ja (6) |
| Aldi Süd | 201 | 45 | ja (89) |
| **Aldi Nord** | **308** | **112** | **nein** |
| **Netto Supermarkt (rot/Scottie)** | **346** | **168** | **nein** |
| **Marktkauf** | **282** | **227** | **nein** |
| **famila** | **335** | **223** | **nein** |
| **Combi** | **258** | **149** | **nein** |
| **V-Markt** | **229** | **166** | **nein** |
| **Globus** | **206** | **78** | **nein** |
| **tegut** | **236** | **130** | **nein** |
| **E-Center** | **305** | **48** | **nein** |
| **METRO** | **350** (2 Prospekte) | teils | **nein** |
| **denns Biomarkt** | **78** | **50** | **nein** |
| nahkauf | 66 | 0 | nur Altreffer |
| dm / Müller *(Drogerie)* | 128 / 59 | 0 | **nein** |

→ Kaufda liefert die **Ersparnis** dort flächig, wo Marktguru sie nicht hat, und erschließt **12+
zusätzliche Ketten**. Keine strukturierten Daten: Norma (nur Prospektbilder), Alnatura, Selgros;
aktuell kein Prospekt auffindbar: HIT, aetka, Wasgau, diska, KODi, Niedrig-Preis (regional).
Kein Rate-Limit beobachtet (10 × HTTP 200 in Folge).

### 3.3 Open Food Facts (bereits im Projekt)

`ingredients_analysis_tags` (`en:vegan`/`en:non-vegan`) — Basis für den veganen Fokus **später**.
Kein Bestandteil dieses Umbaus, aber der Grund, `product_name` + `brand` strukturiert zu persistieren.

---

## 4. Zielarchitektur (`scrapeAndPersist()` bleibt der einzige Einstieg)

```
Marktguru-API ─┐
               ├─> services/marktguruApi.cjs  ─┐
Kaufda-API   ─┘   services/kaufdaApi.cjs    ─┤─> normalize + merge ─> offersScraper.cjs
                                              │        (old_price/discount_percent-Regeln)
NORMA (direkt, HTML) ─────────────────────────┘              │
                                                             ▼
                                          routes/offersHistory.cjs → rezeptbuch.db
                                                             ▼
                                     GET /recipe/api/offers (Contract unverändert, nur additive Felder)
```

**Merge-Regel (Kern der Genauigkeit):** Schlüssel `(store, normalisierter Produktname)`.
- Angebot nur bei Marktguru → übernehmen, `source='marktguru'`.
- Nur bei Kaufda → übernehmen, `source='kaufda'` (bringt Netto-Scottie, Aldi-Nord, tegut, E-center …).
- Bei beiden → Marktguru-Datensatz gewinnt (bessere Produkt-/Store-Struktur), aber `old_price` wird
  aus Kaufdas `secondaryPrice` gefüllt, wenn dort gültig.
- NORMA bleibt als dritte Quelle für `norma`.

**`old_price` / `discount_percent` — feste Reihenfolge:**
1. API-Streichpreis `oldPrice > price` (Marktguru) → `old_price_source='api'`.
2. Kaufda-`secondaryPrice > mainPrice` desselben Produkts → `old_price_source='kaufda'`.
3. Eigene `offer_history`: letzter Preis desselben Store+Produkts **vor** diesem Lauf, nur wenn höher
   → `old_price_source='history'` (ab Woche 2 greift das flächendeckend).
4. Sonst `old_price = NULL` → `discount_percent = NULL` (**ehrlich leer statt erfunden**).
   `discount_percent = round((old_price − price) / old_price × 100, 1)`; Deckel: `> 80 %` verwerfen.

**Datenmodell** (Zielobjekt): `store, product, brand, price, old_price, old_price_source,
discount_percent, valid_from, valid_to, source, url, offer_id`.
Migration per idempotentem `ALTER TABLE` (Muster wie bestehend in `offersHistory.cjs`):
`brand, valid_from, valid_to, discount_percent, old_price_source` neu; **`old_price` nutzt die
bestehende Spalte `original_price`** (keine Dopplung); `offer_scrape_records` + `duration_ms`.
Vorher `cp rezeptbuch.db rezeptbuch.db.bak-$(date +%F)`.

**Geschäftsliste (Config, kein Code):** `marktguruStores` auf Lebensmittel trimmen (Baumarkt/Möbel raus:
toom, hornbach, obi, hellweg, kabs, xxxl, sb-moebel-boss), ergänzen: `aldi-sued`, `edeka`; optional
`rossmann`. `plz` sauber auf `56377` setzen (steht heute auf `""`). Kaufda-Ketten separat mappen.

**Automatik:** bestehender `autoScrapeIfStale` (24 h / 30-min-Check) wird umgesteckt; ein voller Sweep
kostet jetzt **Sekunden statt Minuten** → zusätzlich täglicher Lauf unkritisch. Wochenwechsel wird über
`valid_from/valid_to` abgebildet, nicht über Scrape-Zeitpunkte.

---

## 5. Umsetzungsreihenfolge

| # | Schritt | Aufwand | Verifikation |
|---|---|---|---|
| 1 | `services/marktguruApi.cjs`: Key-Load/Refresh (untracked `data/mg-keys.json`), `fetchRetailerOffers` (Pagination, Retry, 401→Refresh), `normalizeOffer`, `sweep` | 2 h | `node -e "require('./server/src/services/marktguruApi.cjs').sweep(['rewe'],'56377')"` → 257 |
| 2 | `routes/offersHistory.cjs`: Migration + `saveOffers`/`saveScrapeRecord` um neue Felder erweitern; DB-Backup | 1 h | 2× Serverstart ohne ALTER-Fehler; 19.223 Altzeilen unverändert |
| 3 | `offersScraper.cjs` umbauen: Sweep-Orchestrierung, Gültigkeitsfilter, `old_price`-Regeln 1+3, Hydration um neue Spalten erweitern | 3 h | `POST /recipe/api/offers/scrape` → ~3.000 Angebote, 7 Ketten, < 30 s; Restart → Daten sofort da |
| 4 | Routen + Config: beide Scrape-Routen → `scrapeAndPersist('marktguru')`; `offers-config.json` bereinigen/erweitern | 0,5 h | `GET /recipe/api/offers` enthält weiterhin alle Altfelder + neue |
| 5 | **Kaufda-Ergänzung** `services/kaufdaApi.cjs`: buildId, Prospekt-Discovery, `personalisedOffers`, Merge (Regel 2) + Zusatzketten | 3–4 h | Netto-Scottie/Aldi-Nord/tegut erscheinen; `old_price_source='kaufda'` ≥ 200 Zeilen |
| 6 | Cleanup: Playwright/OCR/Ollama-Codepfade löschen, `package.json` entschlacken, `npm install`, Smoke-Test | 1 h | Server startet; alte Scrape-Funktionen weg, `npm ls playwright` leer |
| 7 | *Optional UI*: Badge „−xx %“ + „bis Sa“ in Angebote-Ansicht | 1–2 h | Screenshot mit Rabatt-Badge |

**Phase A (1–4): ~6,5 h** → sofortiger Nutzen (3.000+ Angebote, Sekunden statt Minuten).
**Phase B (5): ~4 h** → löst die Streichpreis-Lücke + neue Ketten. **Phase C (6): 1 h** Aufräumen.
Verifikationsschritte immer **vor** dem Löschen ausführen, damit der alte Pfad notfalls noch trägt.

---

## 6. Verifikations-Checks (konkret)

1. Sweep-Modul einzeln (s. Schritt 1) — Anzahl je Kette, Stichprobe `old_price_source='api'` (aldi-sued ≥ 30).
2. Key-Refresh: `rm server/src/data/mg-keys.json` + Sweep → Datei neu erzeugt, Sweep läuft.
3. Kaufda: `curl -s -A "Mozilla/5.0" "https://www.kaufda.de/api/personalisedOffers?brochureId=<id>&size=500&bonialAccountId=11111111-2222-3333-4444-555555555555"` → 484 Angebote, 278 Streichpreise (Kaufland).
4. Gegenprobe Rohdaten: `curl -s -H "x-apikey: <key>" 'https://api.marktguru.de/api/v1/publishers/retailer/lidl/offers?as=mobile&limit=512&offset=0&zipCode=56377'` → `totalResults ≈ 816`.
5. Eigene API: `POST /recipe/api/offers/scrape` → Start; `GET …/scrape/progress` → `done`, Dauer < 30 s.
6. DB: `SELECT store, COUNT(*), SUM(original_price IS NOT NULL), SUM(discount_percent IS NOT NULL) FROM offer_history WHERE … GROUP BY store;`
   → 7–10 Ketten; **Gültigkeits-Check:** `WHERE valid_to < datetime('now')` → 0 Treffer.
7. UI: Angebote-Ansicht zeigt alle Ketten + Preise nach Server-Neustart sofort; Rabatt-Badge korrekt.
8. Regression: `GET /recipe/api/offers` liefert weiter `{offers:{store:[…]}, lastUpdated}` und die Altfelder
   (`name, price, original_price, url, offer_id, store`) **plus** `brand, valid_from, valid_to, discount_percent`.

---

## 7. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Undokumentierte APIs (ToS-Änderung, Schema-Drift) | Defensive Normalisierung (`?? null`), Kette mit 0 Treffern → Warnung + `success=0`-Record; eigener API-Contract bleibt fix; Kaufda/NORMA nur als Zusatz |
| Key-/buildId-Rotation | Marktguru-Keys & Kaufda-`buildId` werden **zur Laufzeit aus dem HTML** gelesen, bei 401/404 einmal automatisch erneuert; nichts hartcodiert |
| Streichpreis-Lücke | Dreistufige Regel (§4) + Kaufda; wo nichts belegbar ist, bleibt das Feld leer |
| Falsche Rabatte durch Historien-Fallback | nur `historienPreis > price`, Deckel 80 % |
| Zeitzonen-Falle (`validFrom/To` sind UTC mit 22:00/21:59 = dt. Mitternacht, CEST→CET am 25.10.) | ISO-UTC unverändert speichern, erst im UI auf deutsche Zeit umrechnen; Datumsfilter gegen `datetime('now')` |
| Migration beschädigt Historie | Backup vor Schritt 2, nur additive `ALTER TABLE` im try/catch |
| Ketten-Abdeckung täuscht (Marktguru liefert 15 Fake-Treffer für norma/aldi-nord) | Gültigkeitsfilter + `totalResults`-Drift im Log; Mindestanzahl-Schwelle pro Kette |
| `netto` vs. `netto-marken-discount` verwechselt (zwei verschiedene Ketten!) | Mapping im Code explizit: Marktguru `netto-marken-discount` (schwarz, netto-online.de) ≠ Kaufda „Netto-Scottie“ (rot, netto.de) |

---

## 8. Offene Entscheidungen für Mike

1. **Kaufda als Zweitquelle** — Empfehlung: **ja, Phase B.** Ohne Kaufda bleibt der „alte Preis“ fast
   überall leer (Marktguru liefert ihn nur bei Aldi Süd/Rossmann nennenswert); mit Kaufda sind es
   >1.500 Angebote mit echtem Streichpreis **plus 12 zusätzliche Ketten** (Aldi Nord, Netto rot,
   Marktkauf, famila, Combi, V-Markt, Globus, tegut, E-Center, METRO, denns, nahkauf).
2. **Kettenumfang festlegen:** Nur die 7–8 großen (REWE, Lidl, Penny, Kaufland, Netto MD, Aldi Süd,
   EDEKA, NORMA) oder die erweiterte Liste inkl. der Kaufda-Zusatzketten? Drogerie (Rossmann/dm/Müller)
   wäre ebenfalls nur Config — reinnehmen oder bei Lebensmitteln bleiben?
3. **Regionale Genauigkeit:** `personalisedOffers` liefert die **bundesweite** Broschüre; regionale
   Ausgaben existieren (REWE „Dein Markt“, Lidl). Genauigkeit für PLZ 56377 ginge über
   `/api/shelf?lat=&lng=` (liefert regionsbezogene Prospekte + `closestStore`). Soll Phase B direkt
   regional arbeiten (etwas mehr Aufwand) oder erst bundesweit starten?
4. **Kommende Angebote** (Aldi Süd: nur 119 von 500 heute gültig): im UI als „ab Montag“ separat zeigen
   oder nur aktuell gültige?
5. **Kampagnen-Hinweise** („30 % auf Old El Paso bei REWE“, 18 Leaflets über
   `advertisementcollections`, teils auch in `prices.conditions`) als kleine Zusatzliste — nice-to-have
   oder weglassen?

# Plan: Angebote-Umbau auf Marktguru-JSON-API (ohne Playwright/OCR)

Stand: 2026-10-19. Grundlage: `docs/plans/2026-10-19-scrape-recon.md` + eigene Live-Belege
(bash+curl, PLZ 56377; Rohdaten in `~/.hermes/cache/scratch/opencode/mg/`, Skripte `mg_pull.sh`, `mg_sweep.cjs`).

## 0. Live-Befunde (heute selbst gemessen)

### 0.1 Volle Pulls je Kette (`/api/v1/publishers/retailer/<name>/offers?as=mobile&limit=512&offset=…&zipCode=56377`)

| Kette | Calls | Angebote | `oldPrice` gefüllt | davon **echter** Streichpreis (`oldPrice > price`) | `validFrom`/`validTo` | `referencePrice` | aktuell gültig (heute) |
|---|---|---|---|---|---|---|---|
| rewe | 1 | 257 | 257 | **1** (Ø 71 %) | 257 | 257 | 241 |
| lidl | 2 | 816 | 816 | **0** | 816 | 816 | 314 |
| kaufland | 1 | 504 | 504 | **0** | 504 | 504 | 370 |
| penny | 1 | 303 | 303 | **0** | 303 | 303 | 169 |
| netto-marken-discount | 1 | 408 | 408 | **0** | 408 | 408 | 335 |
| aldi-sued | 1 | 500 | 500 | **89** (aktuell gültig: 39/119, Ø 30 %) | 500 | 500 | 119 |
| edeka | 1 | 237 | 237 | **6** (aktuell gültig: 4/207, Ø 43 %) | 237 | 237 | 207 |
| **Σ** | **8** | **3.025** | 3.025 | **96** | 3.025 | 3.025 | **1.755** |

**Wichtige Korrektur zum Dossier:** `oldPrice` ist *nie* null, aber in der Regel `0.0` oder **kleiner** als `price`
(lidl: 816/816 `oldPrice < price`). Nur `oldPrice > price` ist ein echter Streichpreis (rewe 1, aldi-sued 89, edeka 6).
`referencePrice` ist der **Grundpreis** (€/kg bzw. €/Stk, z. B. Mandeln 2,79 € → 18,60 €/kg), kein Alter Preis.
→ Regel „`old_price` nur wenn `oldPrice > price`" ist zwingend; sonst ist der Fallback aus eigener Historie die Hauptquelle für `old_price`.

**Gültigkeit:** `validFrom`/`validTo` 100 % gefüllt (UTC mit 22:00/21:59/21:59:59 = dt. Mitternacht).
Je Kette exakt **15 abgelaufene** Offers (Alt-Kampagnen) + viele **zukünftige** (kommende Woche, v. a. aldi-sued/lidl).
Aktuell gültig nur 1.755/3.025 → Filter **`validTo >= jetzt`** (aktuell + kommend) ist Pflicht.
Extremfall ohne Filter: `norma`/`aldi-nord`/`nahkauf` liefern je 15 Offers vom **2024-10-13** (2 Jahre alt!);
mit Gültigkeits-Filter fallen sie korrekt auf 0. `rossmann`: 309 gültige Offers (Drogerie, optional konfigurierbar).

### 0.2 Kampagnen-Rabatte + Store-Zuordnung

- **Kampagnen:** `/api/v1/advertisementcollections?as=mobiledetailed&zipCode=…` → **18 Leaflets** mit
  `description` („30 % Rabatt beim Kauf von mind. 2 Produkten auf das Old El Paso Sortiment"),
  `advertisers[{name}]` (REWE …), `quantityBuy/quantityGet`, `validFrom/validTo`; `type=teaser` → 10 Teaser.
  `type=all|flyer|coupon|deal|campaign` → leer. **Es gibt KEINEN Endpunkt für Kampagnen-Rabatte pro Produkt** —
  Leaflets sind Kampagnen-Metadaten (Text + Prospektseiten-Referenzen). Nutzbar als kleine Zusatzliste, nicht für
  `discount_percent` pro Angebot.
- **`/api/v1/offers` ohne Retailer-Pfad:** 512/512 Offers mit `retailer: null` (100 %), `storeId: 0` →
  **keine** Store-Zuordnung. Retailer-Pfad (`/api/v1/publishers/retailer/<uniqueName>/offers`) bleibt Pflicht (bestätigt).

### 0.3 Sweep-Kosten (gemessen, sequenziell wie im künftigen Modul)

- **7 Ketten vollständig: 8 HTTP-Calls** (nur lidl braucht 2 Pages à 512), **kalt 7,7 s / warm 0,67 s**.
- + 1 Call `advertisementcollections` (optional) ≈ 0,3 s.
- Vergleich alt: 913 Angebote in **169 s** über Playwright. Neu: ~3.000 Offers in < 10 s, null Browser, null OCR.

## 1. Zielarchitektur

**Ein Weg, eine Quelle, null Browser:** Weekly-Scrape = ~9 reine HTTP/JSON-Calls gegen die öffentliche
Marktguru-API (Keys stehen im SSR-HTML von marktguru.de → Auto-Refresh, keine hartcodierten Keys).
Kein Playwright, kein Tesseract/OCR, kein Ollama-Parsing, keine Store-CSS-Selektoren. Node-eigenes `fetch`,
`better-sqlite3` wie bisher. Der gemeinsame Persistenz-Pfad `scrapeAndPersist()` bleibt der einzige Entry-Point
für API-Route + Auto-Scrape.

```
Marktguru-API ──fetch──> marktguruApi.cjs ──normalize──> offersScraper.cjs (Orchestrierung)
                                  │                          │  scrapeAndPersist()
                                  │                          ▼
                                  │                   offersHistory.cjs (saveScrapeRecord/saveOffers)
                                  │                          │
                                  └── Retry/Key-Refresh      ▼  rezeptbuch.db (offer_history/offer_scrape_records)
                                                        GET /recipe/api/offers → Client (Contract bleibt)
```

## 2. Modullayout + Dateien

| Datei | Aktion | Inhalt |
|---|---|---|
| `server/src/services/marktguruApi.cjs` | **NEU** (~180 Zeilen, keine Fremd-Deps) | `loadKeys()` (aus `server/src/data/mg-keys.json`, untracked); `refreshKeysFromHtml()` (GET `https://www.marktguru.de/r/rewe`, `"apiKey"`/`"clientKey"` aus der Config im HTML ziehen, Datei neu schreiben); `getKeyHeaders()`; `fetchRetailerOffers(uniqueName, plz)` — Paginierung `limit=512`, solange `results.length === 512` bis `offset<4096`, Retry 2× mit Backoff, bei 401/403 einmal `refreshKeysFromHtml()`+Repeat; `fetchCampaignLeaflets(plz)` (optional, 1 Call); `normalizeOffer(raw)` → Zielobjekt unten; `sweep(retailers, plz, onProgress)` |
| `server/src/services/offersScraper.cjs` | **UMBAU** (1.675 → ~350 Zeilen) | Behalten: Progress-Tracking (`setProgress/getProgress/clearProgress`), Scrape-Lock (`currentScrapePromise`), `getConfig`/PLZ/`excludedStores`, `fetchWithRetry`, Fuzzy-Matching (`matchItemsToOffers` + Helfer), `getOffers`, `hydrateOffersFromHistory` (+ neue Spalten), `scrapeAndPersist` (auf `marktguruApi.sweep()` umgeschaltet). Neu: `retailersFromConfig()` (aus `marktguruStores` − `excludedStores`), `oldPriceFromHistory()` (Fallback, s. §4) |
| `server/src/routes/offersHistory.cjs` | **ERWEITERN** | `ALTER TABLE`-Migration (§3), `saveOffers`/`saveScrapeRecord` schreiben `brand, valid_from, valid_to, discount_percent, old_price_source, duration_ms`; `updatePriceHistoryFlags` unverändert |
| `server/src/routes/offers.cjs` | **KLEIN ANPASSEN** | `POST /scrape` und `POST /scrape/marktguru` rufen beide `scrapeAndPersist('marktguru')` (zweite Route wird Alias; UI-Buttons unberührt). Contract `GET /` bleibt `{offers:{store:[…]}, lastUpdated}`, Objekte bekommen nur additive Felder |
| `server/src/index.js` | **UNVERÄNDERT** | `autoScrapeIfStale` (24 h/30 min) + `hydrateOffersFromHistory` beim Start bleiben, da sie nur `scrapeAndPersist()` rufen |
| `server/src/data/offers-config.json` | **ERGÄNZEN** | `marktguruStores` um `aldi-sued`, `edeka`; `plz: "56377"` sauber setzen (steht heute auf `""`) |
| `server/src/data/mg-keys.json` | **NEU, untracked** | `{apiKey, clientKey}`, von `refreshKeysFromHtml()` selbst geschrieben; `.gitignore`-Eintrag |
| `client/src/pages/ShoppingListPage.jsx` | **OPTIONAL** | Badge `−xx %` neben Preis + Gültigkeit („bis Sa"), Felder kommen additiv über die bestehende API |
| `.gitignore` | **ERGÄNZEN** | `server/src/data/mg-keys.json` |

## 3. Datenmodell + Migration

Zielobjekt pro Angebot (Normalisierung in `normalizeOffer`):

```js
{
  store:            raw.retailer.uniqueName,        // 'rewe', 'lidl', …
  product:          raw.product?.name,              // 100 % gefüllt (Tabelle 0.1)
  brand:            raw.brand?.name ?? null,         // 100 % gefüllt
  price:            raw.price,
  old_price:        null,                           // wird in offersScraper per Regel (§4) gesetzt
  discount_percent: null,                           // dito
  valid_from:       raw.validFrom,                  // ISO-UTC belassen, UI formatiert
  valid_to:         raw.validTo,
  source:           'marktguru',
  url:              'https://www.marktguru.de/offers/' + raw.id,   // wie bisherige Marktguru-URLs
  offer_id:         String(raw.id)                  // stabiler Dedup-/Historie-Schlüssel
}
```

**Migration `offer_history`** (idempotent, gleiches try/catch-`ALTER TABLE`-Muster wie die bestehenden
`is_lowest_price`-Spalten in `offersHistory.cjs:43-52`; bestehende Spalten bleiben: `store, product_name, price,
url, original_price, source, offer_id, …`):

```sql
ALTER TABLE offer_history ADD COLUMN brand            TEXT;
ALTER TABLE offer_history ADD COLUMN valid_from       TEXT;
ALTER TABLE offer_history ADD COLUMN valid_to         TEXT;
ALTER TABLE offer_history ADD COLUMN discount_percent REAL;
ALTER TABLE offer_history ADD COLUMN old_price_source TEXT;  -- 'api' | 'history' | NULL
```

`old_price` → **bestehende Spalte `original_price`** wiederverwenden (keine Dopplung).
`product` → bestehende `product_name`. Vor Schritt 2: `cp rezeptbuch.db rezeptbuch.db.bak-$(date +%F)`.

**Migration `offer_scrape_records`** (minimal, Observability): `ADD COLUMN duration_ms INTEGER`.

**Gültigkeits-Filter beim Schreiben:** nur Offers mit `validTo >= jetzt` persistieren (wirft die 15 Alt-Offers
je Kette und die 2024er-Leichen ab; kommende Woche bleibt drin und ist per `valid_from` auswertbar).
Dedup innerhalb eines Laufs: `offer_id` (ein Offer kann in mehreren Offsets nicht vorkommen, aber Defensive schadet nicht).

## 4. Regeln für `old_price` / `discount_percent` (in dieser Reihenfolge)

1. **API-Streichpreis:** `oldPrice > price` (die *einzige* verlässliche API-Semantik; `oldPrice` 0.0 oder < price
   wird **nie** übernommen — Befund 0.1)
   → `old_price = oldPrice`, `old_price_source = 'api'`.
2. **Fallback eigene Historie:** letzter Eintrag in `offer_history` für denselben `store` +
   (gleiches `offer_id`, falls vorhanden, sonst exakt normalisierter `product_name`: lowercase/trim/
   Whitespace-Kollaps — gleiche Quelle liefert gleiche Namen), *zeitlich vor* dem aktuellen Lauf,
   und nur wenn `historienPreis > price`
   → `old_price = historienPreis`, `old_price_source = 'history'`.
   (Ab Tag 2 wertet der wiederkehrende Wochenpreis auf: „Milch letzte Woche 1,49 €, heute 1,19 €" → −20 %.)
3. **Sonst:** `old_price = NULL`, `discount_percent = NULL` — ehrlich leer statt erfunden.

`discount_percent = round((old_price − price) / old_price × 100, 1)` — **nur** wenn Regel 1/2 griff,
sonst `NULL`. `referencePrice` wird **nicht** für Rabatte benutzt (Grundpreis), nur optional persistierbar
(weglassen — Minimalismus).

## 5. Cron-/Auto-Scrape-Integration

- **Kein neuer Cron nötig.** `index.js:207-223` (`autoScrapeIfStale`, `MOCA_AUTO_SCRAPE_MAX_AGE_H=24`,
  Check alle 30 min) ruft bereits `scrapeAndPersist('direct')` → Internes wird auf den Marktguru-Sweep
  umgeschaltet, `source='marktguru'`. Daily = ~9 Calls/~1 s — Alltag des Haushalts: Sonntag/Montag-Wechsel
  wird über `valid_from/valid_to` abgebildet, nicht über Scrape-Zeitpunkte.
- `scrapeAndPersist()` bleibt der **einzige** Pfad (Route + Auto-Scrape): intern wird auf den Marktguru-Sweep
  umgeschaltet; pro Kette
  `saveScrapeRecord(store, n, ok, err, 'marktguru', duration_ms)` + `saveOffers(...)` → Cache +
  `lastUpdated` setzen (wie bisher in `scrapeAllStores`).
- Lock + `POST /scrape`-409 („Scrape läuft bereits") bleiben unverändert wirksam.

## 6. Alter Scraper: Löschen / Behalten

**Löschen** (aus `offersScraper.cjs`):
- `scrapeWithBrowser` + kompletter `SCRAPE_CONFIG`-Selektoren-Apparat + `STORES`-Direktliste (aldi/lidl/netto/
  penny/norma/rewe/nettoLebensmittel/edeka-URLs)
- `scrapeAldiApi`, `fetchAldiCategoryWithPagination`, `scrapeEdekaApi` (Marktguru deckt aldi-sued 500 + edeka 237)
- `scrapeNormaHtml`, `parseNormaPage` (norma@56377 nur 2024er-Leichen)
- OCR: `getTesseractWorker`, `ocrImage`, `scrapeFlipbook`; LLM: `parseWithOllama` (+ llmClient-Fallback)
- Playwright-Marktguru: `scrapeMarktguruStore`, `scrapeAllMarktguruStores`, `MARKTGURU_STORE_URLS`, `parseCheerio`
- `require('cheerio'/'playwright'/'tesseract.js')` im Modul

**Behalten:** `setProgress/getProgress/clearProgress`, Scrape-Lock, `getConfig`/PLZ/`excludedStores`,
`fetchWithRetry`, Fuzzy-Matching komplett, `getOffers`, `hydrateOffersFromHistory` (erweitert um
`brand, valid_from, valid_to, discount_percent` im Rückgabeobjekt — hydrate muss die neuen Spalten lesen,
sonst sind sie nach Neustart weg), `scrapeAndPersist`.

**Dependencies:** `tesseract.js`, `playwright`, `playwright-extra`, `playwright-stealth` aus
`server/package.json` entfernen (**nach** grep, dass außer `rewe-test-parser.js` (Alt-Test → mitlöschen) nichts
sie importiert; `videoTranscriber.cjs` nutzt sie nicht). **`cheerio` bleibt** (`recipeImporter.cjs` braucht es).

## 7. Umsetzungsreihenfolge + Zeitaufwand

| # | Schritt | Aufwand |
|---|---|---|
| 1 | `marktguruApi.cjs`: Keys (`mg-keys.json` + `refreshKeysFromHtml`), `fetchRetailerOffers` (Pagination/Retry/Key-Refresh), `normalizeOffer`, `sweep` | 2 h |
| 2 | `offersHistory.cjs`: `ALTER TABLE`-Migration + `saveOffers`/`saveScrapeRecord` erweitern (`brand, valid_from, valid_to, discount_percent, old_price_source, duration_ms`); vorher DB-Backup | 1 h |
| 3 | `offersScraper.cjs` umbauen: Sweep-Orchestrierung + Progress, Gültigkeits-Filter, `old_price`-Regeln (§4 inkl. `oldPriceFromHistory`), `hydrateOffersFromHistory` erweitern | 3 h |
| 4 | `offers.cjs`: beide Scrape-Routen → `scrapeAndPersist('marktguru')`; `offers-config.json`: `+aldi-sued, +edeka, plz`; `.gitignore` | 0,5 h |
| 5 | Verifikation (§8 komplett durchlaufen) | 1 h |
| 6 | Cleanup: Playwright/OCR/Ollama-Nutzer löschen (§6), `package.json` entschlacken, `npm install`, Serverstart-Smoke-Test | 1 h |
| 7 | *Optional:* UI-Badge `−xx %` + Gültigkeitsanzeige (`ShoppingListPage.jsx`); Kampagnen-Leaflets als kleine Zusatzliste | 1–2 h |

**Kern (1–6): ~8,5 h.** Reihenfolge bewusst: zuerst Client + Persistenz standalone testbar (1–2), dann Umbau (3–4),
Verifikation **vor** dem Cleanup (5 vor 6) — falls Marktguru doch zickt, läuft der alte Pfad noch.

## 8. Verifikationsschritte (konkret)

1. **API-Client einzeln:** `node -e "require('./server/src/services/marktguruApi.cjs').sweep(['lidl'],'56377').then(r=>console.log(r.map(x=>({s:x.store,n:x.n}))))"`
   → lidl ≈ 816, Felder `brand/valid_from/valid_to/old_price` korrekt gesetzt (Stichprobe `old_price_source='api'` bei aldi-sued ≥ 30).
2. **Key-Refresh:** `rm server/src/data/mg-keys.json` + Sweep erneut → Datei wird neu erzeugt, Sweep läuft durch.
3. **Rohdaten-Gegenprobe (immer möglich):**
   `K=$(sed -n 1p .opencode-scratch/mg_keys.txt); C=$(sed -n 2p .opencode-scratch/mg_keys.txt); curl -s -H "x-apikey: $K" -H "x-clientkey: $C" 'https://api.marktguru.de/api/v1/publishers/retailer/lidl/offers?as=mobile&limit=512&offset=0&zipCode=56377' | jq '.totalResults'` → ≈ 816.
4. **Scrape über die eigene API:** `curl -s -X POST http://localhost:PORT/recipe/api/offers/scrape` → `{started:true}`;
   `curl -s http://localhost:PORT/recipe/api/offers/scrape/progress` → `done`, ~3.000 Offers, 7 Ketten, Dauer < 30 s.
5. **DB-Inhalt:** `sqlite3 server/src/data/rezeptbuch.db "SELECT store, COUNT(*) n, SUM(original_price IS NOT NULL) op, SUM(discount_percent IS NOT NULL) dp FROM offer_history WHERE scrape_id=(SELECT MAX(id) FROM offer_scrape_records WHERE source='marktguru') GROUP BY store;"`
   → 7 Zeilen, `n`≈{rewe 241, lidl 314, kaufland 370, penny 169, netto 335, aldi-sued 119, edeka 207} (aktuell gültige),
   `dp>0` mind. bei aldi-sued/edeka; **Gültigkeits-Check:** `… AND valid_to < datetime('now')` → 0 Treffer.
6. **API-Contract regressionsfrei:** `curl -s http://localhost:PORT/recipe/api/offers | jq '{keys: (.offers|keys), probe: .offers.rewe[0]}'`
   → 7 Ketten; Objekt enthält weiterhin `name, price, original_price, url, offer_id, store` **plus** `brand, valid_from, valid_to, discount_percent`.
7. **UI:** Angebote-Ansicht (ShoppingListPage) zeigt alle Ketten + Preise; nach Server-Neustart sofort da
   (♻️-Hydrate-Log); Matching-Check: `curl -s 'http://localhost:PORT/recipe/api/offers/match?listId=<id>'` → Treffer für ein übliches Produkt.
8. **Migration idempotent:** Server zweimal starten → keine ALTER-Fehler; alte Zeilen (19.223) unangetastet.

## 9. Risiken + Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Key-Rotation / 401-403 | `refreshKeysFromHtml()` bei Fehler + 1 Repeat; Keys untracked in `mg-keys.json`; scheitert es → Fehler über Progress, **alter Stand bleibt hydratiert** |
| Rate-Limiting / IP-Block | Sequenzielle Calls (1–2 je Kette, gesamt ~9/Lauf), Retry 2× mit Backoff, nur 1 Lauf/24 h |
| API-Schema-Drift | Defensive Normalisierung (`?? null`), Kette mit 0 Results → Warnung + `success=0`-Record statt still; Contract der eigenen API bleibt fix |
| `oldPrice`-Semantik-Falle (0.0 / < price) | Regel §4.1 explizit `oldPrice > price`; `referencePrice` tabu für Rabatte |
| Alt-/Future-Offers (norma 2024er, 15 je Kette) | Persistenz-Filter `validTo >= jetzt`; Null-Angebots-Ketten loggen |
| Migration zerstört Historie | `cp rezeptbuch.db …bak` vor Schritt 2; nur additive `ALTER TABLE` im try/catch (wie bestehender Code); 19.223 Altzeilen bleiben lesbar |
| Historie-Fallback liefert unsinnige Rabatte (z. B. Wochenpreis-Schwankung als „−50 %") | Nur `historienPreis > price`; Deckel vorsehen: `discount_percent > 80` → verwerfen und `old_price=NULL` |
| Doppel-Scrape / Clobber | Bestehender Lock + 409 bleibt; `hydrateOffersFromHistory`-Wave-Window unverändert |
| Marktguru deckt Kette nicht mehr (z. B. pandemia-bedingte Lücke) | `totalResults`-Drift im Log; `excludedStores`/`marktguruStores` sind reine Config, kein Code-Change nötig |

## 10. Offene Punkte

1. **Kaufda/Bonial:** verwerfen? Marktguru deckt die 7 Lebensmittelketten vollständig (Befund 0.3); Kaufda liefert nur
   JWT/Account-Endpunkte + Prospektbilder. Empfehlung: ja, verwerfen.
2. **Kampagnen-Leaflets** (`advertisementcollections`, 18 Stück): eigene Mini-Tabelle/Anzeige („20 % auf Lipton bei REWE,
   bis 24.10.")? Nice-to-have, 1 Call — **Entscheidung Mike**.
3. **Zukünftige Offers** (aldi-sued nur 119/500 aktuell gültig): kommende Woche separat ausweisen (`valid_from > heute`)
   oder ins UI mischen? — **Entscheidung Mike**.
4. **`plz` steht auf `""`** in offers-config.json (Fallback 56377 greift): sauber setzen (Schritt 4 erledigt das mit).
5. **Drogerie-Ketten** (rossmann 309 Offers verifiziert, evtl. dm): reiner Config-Eintrag, kein Code — bei Bedarf.
6. **Vegan-/Kategorie-Filter** (Mikes späterer Wunsch): `brand` + `product` liegen ab sofort strukturiert vor — Umbau
   dann rein lesend auf der API/UI-Seite.
7. **Fuzzy-Historie-Match**: jetzt exakt-normalisiert; falls Trefferquote nach 2 Wochen zu niedrig (Namensdrift),
   `levenshteinSimilarity` aus dem Bestand nachrüsten.

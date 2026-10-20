# TODO: „Sonstiges" in den Angeboten weiter schärfen

**Stand 2026-10-20:** 4.142 Angebote, davon **~760 in „Sonstiges" (18 %)** — vorher 30 %.
Der Rest sind echte Einzelfälle: Markenartikel ohne Warengruppen-Wort und ohne OFF-Treffer.

## Wie die Einordnung funktioniert

1. `server/src/services/offerClassifier.cjs` — Heuristik über Produktname, Marke und Beschreibung.
   Regeln laufen **in fester Reihenfolge** (drogerie → nonfood → tiefkühl → getränke → pflanzlich →
   fleisch → backwaren → süßwaren → milch → vorrat → obst → sonstiges), erste Übereinstimmung gewinnt.
2. `server/src/services/offLookup.cjs` — Open-Food-Facts-Matching gegen `server/src/data/off.db`.
   Liefert bei Score ≥ 0,6 eine Warengruppe aus den OFF-Kategorien (englisch + deutsch).
   Nur wenn die Heuristik „sonstiges" ergibt, darf OFF sie überschreiben.

## Ablauf, um die Liste abzuarbeiten

```bash
cd ~/services/moca/server
# 1. aktuelle Restliste exportieren (Name|Marke, häufigste zuerst)
node -e "
const D=require('better-sqlite3'); const db=new D('src/data/rezeptbuch.db',{readonly:true});
const rows=db.prepare('SELECT product_name, brand, COUNT(DISTINCT offer_id) c FROM offer_history '+
  \"WHERE scrape_id IN (SELECT id FROM offer_scrape_records ORDER BY scraped_at DESC LIMIT 11) \"+
  \"AND category='sonstiges' GROUP BY product_name, brand ORDER BY c DESC LIMIT 100\").all();
for (const r of rows) console.log(r.product_name+'|'+(r.brand||''));
"
# 2. Keywords in offerClassifier.cjs ergänzen (passende Kategorie-Liste)
# 3. neu scrapen und vergleichen
systemctl --user stop moca.service
node -e "require('./src/services/offersScraper.cjs').scrapeAndPersist('marktguru').then(r=>{console.log(r);process.exit(0)})"
systemctl --user start moca.service
```

**Regeln beim Ergänzen**
- Kurze Begriffe (≤ 3 Zeichen) werden mit Wortgrenze geprüft — nicht auf `includes` verlassen.
- Deutsche Komposita: spezifische Warengruppe vor allgemeiner prüfen (sonst gewinnt „Käse" gegen „Käsekuchen").
- Marken nur aufnehmen, wenn sie eindeutig sind (Knoppers → Süßwaren, aber „Gold" ist mehrdeutig).
- Werbezeilen („20 % Rabatt") gehören in `aktion`, nicht in eine Warengruppe.

## Top-100 der verbleibenden Fälle

- [ ] **Eisenbahn-Set** — _Lupilu_  · 4×
- [ ] **Cremefine** — _Rama_  · 3×
- [ ] **Gold** — _Nescafé_  · 3×
- [ ] **Grand Dessert** — _Ehrmann_  · 3×
- [ ] **Heidekraut**  · 3×
- [ ] **Knoppers** — _Storck_  · 3×
- [ ] **Münchner Hell** — _Paulaner_  · 3×
- [ ] **Nasenspreizer Starter-Set** — _VentiCross_  · 3×
- [ ] **Spezi** — _Paulaner_  · 3×
- [ ] **20% Rabatt**  · 2×
- [ ] **Actimel** — _Danone_  · 2×
- [ ] **Activia XXL** — _Danone_  · 2×
- [ ] **Alpenveilchen**  · 2×
- [ ] **Bausets** — _LEGO_  · 2×
- [ ] **Bausteine-Set** — _LEGO_  · 2×
- [ ] **Bodyspray** — _Axe_  · 2×
- [ ] **CPE C7 Stationärer Router** — _Zte_  · 2×
- [ ] **Cerealien** — _Kellogg's_  · 2×
- [ ] **Choco Crossies** — _Nestlé_  · 2×
- [ ] **Coffee Pads XXL** — _Senseo_  · 2×
- [ ] **Duplo** — _Ferrero_  · 2×
- [ ] **Eis** — _Mövenpick_  · 2×
- [ ] **Fix** — _Maggi_  · 2×
- [ ] **Grabgesteck**  · 2×
- [ ] **Grableger**  · 2×
- [ ] **Halloween Berliner** — _Lidl Backshop_  · 2×
- [ ] **Haselnusscreme** — _Milka_  · 2×
- [ ] **Haselnusskerne vegan** — _Back Family_  · 2×
- [ ] **Herbstheide**  · 2×
- [ ] **High Protein Wraps** — _Bäckerkrönung_  · 2×
- [ ] **Holz-Rollenspiel-Set** — _Toylino_  · 2×
- [ ] **Iced Coffee** — _Mövenpick_  · 2×
- [ ] **Irish Whiskey** — _Jameson_  · 2×
- [ ] **Isolierbecher** — _Fackelmann_  · 2×
- [ ] **Kaki**  · 2×
- [ ] **Katzennassfutter** — _Whiskas_  · 2×
- [ ] **Kinder Country** — _Ferrero_  · 2×
- [ ] **Kinder Pingui** — _Ferrero_  · 2×
- [ ] **Kinder-Nicki-Schlafanzug** — _Lily & Dan_  · 2×
- [ ] **Kipferl** — _Favorina_  · 2×
- [ ] **Knoppers Minis** — _Storck_  · 2×
- [ ] **Kompositions Ollicht** — _K-Classic_  · 2×
- [ ] **Korean Style Noodles** — _Maggi_  · 2×
- [ ] **Kraft Aktiv Duftspüler** — _WC Frisch_  · 2×
- [ ] **Kraft-Aktiv** — _WC Frisch_  · 2×
- [ ] **LED-Lichterkette** — _Livarno Home_  · 2×
- [ ] **Longhetti Classique** — _Aoste_  · 2×
- [ ] **Mandel Spekulatius vegan** — _Favorina_  · 2×
- [ ] **Minis** — _Haribo_  · 2×
- [ ] **Münchner Hell** — _Spaten_  · 2×
- [ ] **Perfume & Style Raumduft** — _Domol_  · 2×
- [ ] **Premium Beer** — _Heineken_  · 2×
- [ ] **Pülleken Helles** — _Veltins_  · 2×
- [ ] **Raffaello** — _Ferrero_  · 2×
- [ ] **Reinigungstücher** — _Bebe_  · 2×
- [ ] **Schmetterlingsorchidee**  · 2×
- [ ] **Ski- und Snowboardbrille** — _Crivit_  · 2×
- [ ] **Toffifee** — _Storck_  · 2×
- [ ] **Tuc Bake Rolls** — _LU_  · 2×
- [ ] **Tuchmaske** — _Garnier_  · 2×
- [ ] **Weihnachtsmann-Figur**  · 2×
- [ ] **Wäschewanne** — _W5_  · 2×
- [ ] **Zimtsterne** — _Favorina_  · 2×
- [ ] **1881 Homme EdT** — _Cerruti_  · 1×
- [ ] **20 % Rabatt** — _Otto Kern_  · 1×
- [ ] **24 Geschichten zum Vorlesen – Wir warten auf Weihnachten**  · 1×
- [ ] **30 % Exklusive Rabatte für**  · 1×
- [ ] **30 % Rabatt** — _Borchers_  · 1×
- [ ] **3D-LED-Leuchtstern** — _Home Creation_  · 1×
- [ ] **3D-Weihnachtsbaum**  · 1×
- [ ] **4fach** — _Regia_  · 1×
- [ ] **5 Minuten Terrine** — _Maggi_  · 1×
- [ ] **7-Zonen-Kaltschaum-Topper Big Komfort Plus** — _f.a.n._  · 1×
- [ ] **ABC Pulverfeuerlöscher** — _Unitec_  · 1×
- [ ] **Abgießhilfe** — _FACKELMANN_  · 1×
- [ ] **Activia** — _Danone_  · 1×
- [ ] **Adblue** — _K-Classic_  · 1×
- [ ] **After Eight Hauchdünne Täfelchen** — _Nestlé_  · 1×
- [ ] **Age Supreme Extra Reichhaltig** — _Diadermine_  · 1×
- [ ] **Airfryer Snack** — _Original Wagner_  · 1×
- [ ] **Airwaves Menthol & Eucalyptus** — _Wrigley´s_  · 1×
- [ ] **Akora** — _Bahlsen_  · 1×
- [ ] **Aldi Gipfel** — _Choceur_  · 1×
- [ ] **All in 1 Caps** — _K-Classic_  · 1×
- [ ] **All-in-One Balkonkraftwerk Speicher** — _Solakon_  · 1×
- [ ] **Alm-Striezel Mohn** — _Lidl Backshop_  · 1×
- [ ] **Almighurt** — _Ehrmann_  · 1×
- [ ] **Almzeit** — _Bergader_  · 1×
- [ ] **Aloe Vera-Ganzjahresdecke** — _Emma_  · 1×
- [ ] **Alpen Cordon Bleu**  · 1×
- [ ] **AlpenRace** — _Alpengaudi_  · 1×
- [ ] **Aluguss-Bräter** — _Meine Küche Just Cooking by Elo_  · 1×
- [ ] **Amaro** — _Ramazzotti_  · 1×
- [ ] **Amaro** — _Romanetti_  · 1×
- [ ] **Amaro Siciliano** — _Averna_  · 1×
- [ ] **Amarone della Valpolicella** — _Lamberti_  · 1×
- [ ] **Amaryllis** — _Gardenline_  · 1×
- [ ] **Amaryllis Bund**  · 1×
- [ ] **Amaryllis gewachst** — _Gardenline_  · 1×
- [ ] **American Blended Whiskey 3 Years** — _Kentucky Highway_  · 1×

## Bekannte Muster (Kandidaten für Sammel-Keywords)

- **Kaffee-/Kapselmarken:** Nescafé Gold, Melitta Barista Kapseln, Senseo Pads → `getraenke`
- **Biermarken regional:** Münchner Hell, Spezi, Paulaner → `getraenke`
- **Molkereimarken:** Actimel, Activia, Ehrmann Grand Dessert, Rama Cremefine, Zott → `milch-eier`
- **Süßwarenmarken:** Knoppers, Ültje, M&M's → `suesses-snacks`
- **Drogerie:** Always Discreet, Garnier, L'Oréal Men Expert, WC Frisch, Dr. Beckmann → `drogerie-haushalt`
- **Haushalt:** Vileda, Glitzi, Küchentücher, Küchensieb, Spannbetttuch, Nachtwäsche → `nonfood`
- **Tierbedarf:** Pedigree Denta Stix, Catsan Streu → `nonfood`
- **Blumen/Pflanzen:** Heidekraut, Alpenveilchen → `nonfood`
- **Bücher/Spiele:** Escape Room, LAMA, Fasermaler, Glücksbärchi → `nonfood`

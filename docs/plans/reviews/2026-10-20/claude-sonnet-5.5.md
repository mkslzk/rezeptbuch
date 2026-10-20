# Review: anthropic/claude-sonnet-5.5

# Review: MOCA Angebote-Seite

## 1. Kritik

**Hierarchie**
- Der Primary-Button „Angebote neu einlesen“ ist die lauteste Fläche der Seite, obwohl er höchstens wöchentlich gebraucht wird.
- `offers-sub` ist ein Fließtext mit fünf Kennzahlen. Ø-Ersparnis und Kettenzahl helfen beim Suchen nicht.
- Nach dem Filtern fehlt eine Treffer-Anzahl. Das ist die wichtigste Rückmeldung eines Filters.

**Filter-UX**
- Der Veganfokus ist hinter einem `<select>` versteckt, während zwei Checkboxen prominent stehen.
- Die Toolbar (Suche, 2 Checkboxen, 2 Selects) bricht per `flex-wrap` zufällig um.
- Ketten- und Warengruppen-Chips umfassen bis zu 24 plus rund 20 Chips. Auf 390 px sind das 6 bis 10 Zeilen, und das Grid beginnt unter dem Fold.
- Die Chip-Zähler sind statisch. „Aldi 300“ kann bei aktivem Vegan-Filter 12 Treffer ergeben.
- Es gibt kein „Alles zurücksetzen“, nur je ein Reset pro Gruppe.
- Die Filter werden nicht gespeichert. Jeder Besuch beginnt bei null.

**Lesbarkeit und Karten**
- Eine Karte hat bis zu 8 Informationen: Kette, Rabatt, Name, Marke, Preis, Altpreis und eine Meta-Zeile mit 5 Items bei 12 px in `--color-text-light`.
- Preis und Rabatt-Pille nutzen beide die Akzentfarbe und konkurrieren.
- Die Quelle des Streichpreises steckt in `title` und ist auf dem iPhone unsichtbar.
- Die Store-Emojis sind mehrdeutig (🟡 steht für Lidl und Netto, 🟦 für dm, V-Markt und Müller). Sie tragen keine Information und sind für Screenreader Rauschen.
- Bei `.offer-prices { margin-top:auto }` rutscht die Meta-Zeile unter den Preis, sodass Karten ungleich „enden“.

**Mobile (320–430 px)**
- `minmax(160px,1fr)` ergibt bei 320 px nur eine Spalte (288 px Inhalt), bei 390 px zwei. Das Layout springt.
- Input- und Select-Schriftgrößen liegen bei 0,9 bis 0,95 rem, also unter 16 px. iOS Safari zoomt beim Fokus hinein.
- Die Hover-`translateY`-Effekte bleiben auf Touch „kleben“.

**Leerzustände**
- „Keine Angebote…“ ist kursiv und grau, ohne Aktion und ohne Hinweis, welche Filter aktiv sind.
- „Lade…“ ist nur ein Text ohne Skeleton.
- Der Fehlerzustand hat keinen „Erneut versuchen“-Button.

**Accessibility**
- Die Chips sind rund 30 px hoch (Kategorie-Chips rund 26 px), Ziel sind 44 px.
- Es fehlen `aria-pressed` und ein `:focus-visible`-Stil für Chips und Karten.
- Die Suche hat kein Label, die Selects haben nur Option-Text.
- Der Fortschrittsbalken hat kein `role="status"`.
- Der Fokusring der Suche in `--color-accent-light` hat vermutlich unter 3:1 Kontrast auf Creme.
- Prüfen: `--color-text-light` bei 12 px muss mindestens 4,5:1 erreichen.

## 2. Top 5 Änderungen

1. **Filter komprimieren: eine Zeile statt vier.** Sichtbar bleiben Suche, ein Vegan-Segment und ein Button „Filter (n)“. Ketten und Warengruppen wandern in ein `<dialog>` als Bottom-Sheet (Desktop: Popover oder `<details>`). Die Chips in der Sheet bekommen `min-height:44px`. Dadurch rutscht das Grid nach oben, und die Chip-Wände verschwinden.

2. **Ernährung zum Segmented Control machen und Zustand sichtbar halten.** Das Segment `Alle | 🌱 Vegan | 🥚 Veg.` ersetzt das Select (`role="group"`, Buttons mit `aria-pressed`). „Nur Lebensmittel“ wird Standard-an. „Nur mit Ersparnis“ entfällt. Darunter steht eine Zeile „412 Treffer · REWE × · Obst × · Zurücksetzen“. Filter in `localStorage` oder URL-Params persistieren. Zähler facettiert berechnen, also mit den übrigen aktiven Filtern, und Chips mit 0 ausgrauen.

3. **Karte entschlacken.** Der Preis wird größer und in `--color-text` gesetzt. Nur der Rabatt trägt die Akzentfarbe. Die Karte hat drei Zonen:
   - oben Kette (Text) und Diät-Icon (mit `aria-label`),
   - Mitte Name mit Marke als Zeile darunter,
   - unten Preis, Altpreis und Rabatt, darunter eine Zeile „1,99 €/kg · bis Sa. 14.06.“.

   Die Warengruppe fliegt aus der Karte. Die Streichpreis-Quelle lässt sich über ein kleines „i“ als Button/Popover erreichen oder entfällt.

4. **Mobile- und A11y-Basics.**
   - Eingabefelder auf `font-size:16px`.
   - Mobiles Grid auf `grid-template-columns:repeat(2,minmax(0,1fr))`.
   - Hover-Effekte nur in `@media (hover:hover)`.
   - `:focus-visible { outline:2px solid var(--color-brown); outline-offset:2px }` für alle Controls.
   - Meta-Text auf mindestens 13 px und geprüften Kontrast.
   - `aria-label` an der Suche und `role="status"` am Fortschritt.

5. **Header beruhigen.** Der Titel steht in einer Zeile mit einem Icon-/Ghost-Button „↻“, der Text lautet „Neu einlesen“ und ist sekundär gestaltet. Die Statistik schrumpft auf „3.848 Angebote · Stand 12.06., 08:14“. Die Filterleiste wird auf Mobile `position:sticky; top:0` mit Creme-Hintergrund.

## 3. Streichen

- Checkbox „nur mit Ersparnis“, denn die Sortierung nach Ersparnis deckt das ab.
- Sortieroption „Markt“ (sortiert aktuell nach Key, nicht nach Label).
- Ø-Ersparnis und Ketten-Zähler im Header.
- Die 24-Einträge-Emoji-Map. Der Kettenname als Text genügt; wer Farbe will, nimmt einen CSS-Punkt je Kette.
- Das separate Styling der Warengruppen-Zeile (gestrichelter Rand, andere Grünfarbe, andere Größe). Gleiche Chips reichen.
- Hover-Lift auf Karten und Chips.
- Der Diät-Filter „Fleisch/Fisch“ als gleichrangige Option. Er ist für diesen Nutzer ein Randfall und gehört höchstens in die Sheet.

Nicht ergänzen: Virtualisierung und Infinite Scroll. Das Limit von 600 plus ein Button „Mehr anzeigen“ reicht.

## 4. Skizze (Mobile, 390 px)

```
┌──────────────────────────────┐
│ 🏷️ Angebote             [↻]  │
│ 3.848 Angebote · Stand 12.06.│
├──────────────────────────────┤  ← sticky
│ 🔍 Produkt oder Marke…       │
│ [Alle│🌱Vegan│🥚Veg.] [⚙ 2]  │
├──────────────────────────────┤
│ 412 Treffer   Ersparnis ▾    │
│ REWE ×  Obst ×  Zurücksetzen │
├───────────────┬──────────────┤
│ REWE      🌱  │ LIDL     🌱  │
│ Hafer-Drink   │ Tofu natur   │
│ Alpro         │ Vemondo      │
│ 1,49 € 1,99€  │ 1,29 €       │
│ −25 %         │ −18 %        │
│ 1,49 €/l·Sa.  │ 3,2 €/kg·Sa. │
└───────────────┴──────────────┘
```

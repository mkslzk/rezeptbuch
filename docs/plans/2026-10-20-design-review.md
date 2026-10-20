# Design-Review Angebote-Seite (2026-10-20)

**Methode:** Drei Modellfamilien haben `client/src/pages/OffersPage.jsx` + `.css` unabhängig
reviewed (Prompt identisch, keine Skizzen, nur Code): **Claude Sonnet 5.5**, **Gemini 2.5 Pro**,
**Kimi K3**. Rohfassungen: `docs/plans/reviews/2026-10-20/`.

**Getestete Ansicht:** Angebote-Tab mit 3.848 Angeboten, 9 Ketten, Warengruppen-Chips +
Ernährungs-Dropdown + zwei Checkboxen.

---

## 1. Befund (Konsens)

### 1.1 Filter fressen den Bildschirm
Alle drei: Zwei Chip-Zeilen (bis 24 Ketten + ~12 Warengruppen) plus Toolbar belegen auf dem
iPhone 5–10 Zeilen — die erste Karte liegt unter dem Fold. Auf 390 px ist das der größte
Einzelmangel. Vorschlag übereinstimmend: **Chips in ein Bottom-Sheet/Popover** („Filter (2)")
verlagern, oben nur Suche + Ernährungs-Segment.

### 1.2 Der Header ist laut an der falschen Stelle
Konsens: „Angebote neu einlesen" ist der einzige Primary-Button, obwohl es eine seltene
Wartungsaktion ist. Die Statistik-Zeile ist eine Textwurst aus 5 Kennzahlen (Angebote, Ketten,
Ø-Ersparnis, vegan, Stand) — nicht scanbar. Vorschlag: Button sekundär („↻ neu einlesen"),
Statistik auf 2–3 Werte kürzen oder als kleine Kacheln.

### 1.3 Karten sind überladen
Konsens: Bis zu 8 Informationen pro Karte, die Meta-Zeile hat 5 Einträge bei 12 px in
`--color-text-light` (Kontrast fraglich). Preis und Rabatt-Pille konkurrieren um die Akzentfarbe.
Uneinheitliche Kartenhöhen durch `margin-top:auto` in `.offer-prices`.
Divergenz: Gemini will die Meta-Zeile bei Hover einblenden — **verworfen**, weil es auf Touch
kein Hover gibt. Stattdessen: eine kompakte Zeile (Einheitspreis · Gültigkeit), Warengruppe raus
aus der Karte (steht im Filter).

### 1.4 Mobile- und A11y-Basics fehlen
- Eingabefelder mit 0,9–0,95 rem → iOS zoomt beim Fokus rein. **16 px** Pflicht.
- Chips 26–30 px hoch, Ziel **44 px** Touch-Target.
- Kein `:focus-visible` an Chips/Selects/Karten → Tastaturnavigation unsichtbar.
- Chips ohne `aria-pressed`, Suche ohne Label, Fortschritt ohne `role="status"`.
- Hover-`translateY` „klebt" auf Touch → in `@media (hover:hover)` packen.

### 1.5 Der Vegan-Fokus ist versteckt
Konsens (Claude/Kimi): Für diesen Nutzer ist vegan das wichtigste Kriterium, liegt aber in einem
`<select>` hinter zwei Checkboxen. Vorschlag: **Segmented Control** `Alle | 🌱 vegan | 🥚 vegetarisch`
mit `aria-pressed`, „nur Lebensmittel" standardmäßig an.

### 1.6 Filter-Feedback fehlt
- Keine **Trefferzahl** nach dem Filtern (wichtigste Rückmeldung).
- Zwei Reset-Chips, von denen einer nur die Ketten zurücksetzt — irreführend. **Ein** „Alles zurücksetzen".
- Zähler an den Chips sind statisch, nicht facettiert (bei aktivem Vegan-Filter zeigt „Aldi 300" weiter 300).
- Filter werden nicht gespeichert (jeder Besuch startet bei null).

### 1.7 Vertrauen: Streichpreis-Quelle
Claude/Kimi: Ob ein Altpreis UVP oder Marktpreis ist, steckt nur im `title`-Attribut — auf dem
iPhone unsichtbar. Da wir bewusst zwischen UVP und echtem Streichpreis unterscheiden, sollte das
sichtbar sein (kleines „UVP"-Tag statt Tooltip).

---

## 2. Priorisierter Umbau

### P0 — vor dem nächsten Screenshot nötig (zusammen ~2 h)
1. **Filter-Sheet:** Toolbar behält Suche + Ernährungs-Segment + Button `Filter (n)`.
   Ketten- und Warengruppen-Chips wandern in ein `<dialog>` (Bottom-Sheet mobil, Popover ab 768 px),
   Chips dort mit `min-height:44px`, Suchfeld innerhalb der Kettenliste.
2. **Trefferzeile** unter der Toolbar: `412 Treffer · REWE × · Obst × · Alles zurücksetzen`.
3. **A11y-Basics:** `:focus-visible` (2 px `--color-brown`, Offset 2), `aria-pressed` an Chips,
   Label an der Suche, `role="status"` am Fortschritt, Inputs auf 16 px, Touch-Targets ≥ 44 px.
4. **Header beruhigen:** „neu einlesen" als Ghost-Button mit ↻, Statistik auf
   `3.848 Angebote · Stand 14:20` (+ vegan nur, wenn > 0).

### P1 — Feinschliff (~1,5 h)
5. **Karte:** drei Zonen (Kette + Diät-Icon / Name + Marke / Preis + Altpreis + Rabatt),
   darunter **eine** Meta-Zeile `1,49 €/l · bis Sa.`. Warengruppe raus, `title`-Tooltip durch
   sichtbares „UVP"-Tag ersetzen.
6. **Filter merken** in `localStorage` (URL-Params wären schöner, lohnt bei Einzelnutzer nicht).
7. **Chip-Zähler facettiert** berechnen (mit den übrigen aktiven Filtern), 0-Treffer ausgrauen.
8. **Streichen:** Checkbox „nur mit Ersparnis" (Sortierung deckt das ab), Sortieroption „Markt"
   (sortiert nach Key statt Label — entweder fixen oder raus), Emoji-Map je Kette (mehrdeutig:
   🟡 = Lidl *und* Netto; stattdessen Kettenname + CSS-Farbpunkt).

### P2 — später
9. Skeleton beim Laden statt „Lade …", „Erneut versuchen" im Fehlerzustand.
10. Pagination/„Mehr anzeigen" statt harter 600er-Kappung im `visible`-Slice (Kimi).
11. **Nicht** bauen: Virtualisierung, Infinite Scroll, Dark Mode — Overhead ohne Nutzen bei dieser Datenmenge.

---

## 3. Was die Modelle unterschiedlich sehen (und wie wir entscheiden)

| Thema | Claude | Gemini | Kimi | Entscheidung |
|---|---|---|---|---|
| Meta-Zeile der Karte | eine kompakte Zeile | bei Hover ausblenden | ganz reduzieren | kompakte Zeile (Touch!) |
| Statistik im Header | auf 2 Werte kürzen | als Kacheln | kürzen | 2 Werte, eine Zeile |
| Filter-UI | Bottom-Sheet | Dropdown/Popover | Sheet + Trefferzahl | Sheet ab 768 px Popover |
| „Fleisch/Fisch"-Filter | Randfall, in die Sheet | behalten | nicht erwähnt | in die Sheet, nicht prominent |
| Sortierung „Markt" | streichen | behalten | nicht erwähnt | fixen (Label) oder streichen |

---

## 4. Nächster Schritt

P0 umsetzen, dann Screenshot-Vergleich vorher/nachher. Die Modelle waren sich bei P0
vollständig einig — das ist der Teil mit dem größten Hebel pro Stunde.

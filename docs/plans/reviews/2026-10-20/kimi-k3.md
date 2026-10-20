# Review: moonshotai/kimi-k3

## 1. Kritik

**Informationshierarchie:** Die Sub-Zeile ist eine Textwurst: „3.848 Angebote aus 24 Ketten · 2.100 mit Ersparnis (Ø 32 %) · 🌱 800 vegan · Stand …" — vier Fakten in einer Zeile, nicht scanbar. Gleichzeitig bekommt die Wartungsaktion „Angebote neu einlesen" den einzigen Primary-Button, obwohl sie selten genutzt wird. Vor dem ersten Angebot stehen bis zu 4 Filterzeilen (Toolbar + 24 Ketten-Chips + Warengruppen) — auf dem iPhone ist die Kartenliste unter der Falz.

**Filter-UX:** 24 Ketten-Chips mit kaum unterscheidbaren Emoji-Punkten (🟡/🟨, 🔵/🔷/🟦, 🟤/🟫) plus Zähler = visuelles Rauschen. Zwei separate Reset-Chips („× Filter" setzt nur Ketten zurück!) sind irreführend; es gibt kein „Alle Filter zurücksetzen" und keine Trefferzahl in Filter-Nähe. Der Ernährungs-Filter — für einen Vegan-Fokus der wichtigste — versteckt sich in einem Select. Die 600er-Kappung ohne Pagination erzeugt bis zu 600 DOM-Knoten auf dem Handy.

**Lesbarkeit/Karten:** Meta-Zeile mit bis zu 5 Einträgen in 12 px, dazu 3-zeiliger Name, Brand-Zeile, Preiszeile — die Karten sind unruhig und uneinheitlich hoch. Die Quelle des Streichpreises (UVP vs. Marktguru) steckt nur im `title`-Attribut: auf Touch-Geräten unsichtbar, für Screenreader praktisch nicht existent — dabei ist das vertrauensrelevant.

**Mobile:** Chips sind ~28–30 px hoch (Touch-Target-Empfehlung: 44 px), Warengruppen-Chips noch kleiner. Bei 320 px kollabiert das Grid auf 1 Sp

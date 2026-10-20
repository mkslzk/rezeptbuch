# Review: google/gemini-2.5-pro

Absolut. Als Senior Product Designer übernehme ich gerne das Review. Hier ist meine Analyse und meine Empfehlungen, zugeschnitten auf den Kontext und die Zielgruppe.

---

### 1. Konkrete Design-Kritik

**Informationshierarchie:**
*   **Header:** Die Sub-Headline (`.offers-sub`) ist eine lange, unstrukturierte Textwurst. Wichtige Kennzahlen wie die Anzahl veganer Angebote oder die durchschnittliche Ersparnis gehen unter.
*   **Karten:** Die Karten (`.offer-card`) sind überladen. Die visuelle Hierarchie ist schwach. Preis (`.offer-price`) und Rabatt (`.offer-discount`) stechen zwar hervor, aber der Rest (`.offer-meta`) ist eine Ansammlung gleichrangiger, sehr kleiner Texte, was das schnelle Scannen erschwert.

**Filter-UX:**
*   **Überladung:** Die beiden Chip-Zeilen (`.offers-stores`, `.offers-cats`) sind das Kernproblem. Bei 3.848 Angeboten sind das Dutzende Chips, die den Viewport fluten. Das zwingt den Nutzer, erst zu scrollen, um Ergebnisse zu sehen – besonders auf Mobilgeräten.
*   **Interaktion:** Die Interaktion ist ineffizient. Um eine bestimmte Kette zu finden, muss der Nutzer die gesamte Liste visuell durchsuchen. Ein Suchfeld innerhalb der Filterauswahl fehlt.

**Lesbarkeit:**
*   **Schriftgrößen:** Viele Schriftgrößen sind zu klein (`0.75rem`, `0.78rem`, `0.8rem`). Für einen Nutzer in den 40ern, selbst auf einem guten Display, ist das anstrengend. Das widerspricht einer entspannten "Papier-Optik".
*   **Kontrast:** `color: var(--color-text-light)` auf einem Creme/Sepia-Hintergrund hat wahrscheinlich ein zu geringes Kontrastverhältnis und fällt bei Accessibility-Prüfungen durch.

**Karten-Layout:**
*   Der `gap: 0.3rem` in `.offer-card` ist sehr eng und lässt die Elemente gedrungen wirken. Die Meta-Infos im Footer (`.offer-meta`) sind zwar per `flex-wrap` umbrechend, erzeugen aber schnell eine unruhige, zweizeilige Textwüste am unteren Kartenrand.

**Mobile (320–430 px):**
*   **Katastrophal.** Die Kombination aus `.offers-toolbar`, `.offers-stores` und `.offers-cats` mit `flex-wrap` führt auf schmalen Bildschirmen zu einem Chaos aus 5-10 Zeilen an Bedienelementen, bevor der erste Inhalt sichtbar wird. Die Grid-Anpassung (`minmax(160px, 1fr)`) ist gut, aber sie greift zu spät.

**Leerzustände:**
*   Gut gelöst. Die Meldung unterscheidet korrekt zwischen "keine Daten" und "keine Ergebnisse für Filter". Das ist hilfreich.

**Accessibility:**
*   **Fokus:** Nur das Suchfeld hat einen klaren `:focus`-Stil. Die Chip-Buttons und Select-Boxen haben keinen, was die Tastaturnavigation unmöglich macht.
*   **Touch-Targets:** Die Chip-Buttons, insbesondere `.offers-chip-cat` (`padding: 0.28rem 0.6rem`), sind auf Touch-Geräten zu klein und schwer zu treffen.

---

### 2. Die 5 wichtigsten Änderungen (priorisiert)

1.  **Filter-Chips durch Dropdowns ersetzen:** Die zwei Chip-Zeilen auflösen. Stattdessen zwei Buttons "Ketten" und "Warengruppen" anzeigen, die bei Klick eine Liste (ggf. mit Suchfunktion) in einem Popover oder Dropdown öffnen.
    *   **Begründung:** Reduziert die visuelle Unruhe drastisch und macht die Seite sofort übersichtlicher. Der Nutzer sieht direkt die Ergebnisse.
    *   **Markup-Idee:** Statt `.map()` über alle Stores/Cats zu iterieren, nur einen `<button onClick={() => setStoresOpen(true)}>Ketten ({activeStores.length})</button>` rendern, der ein Modal/Popover steuert.

2.  **Mobile Filter konsolidieren:** Auf mobilen Geräten (< 768px) die gesamte `.offers-toolbar` und die Filter-Buttons hinter einem einzigen Button "Filter & Sortierung" verbergen, der eine Bottom-Sheet/Modal-Ansicht öffnet.
    *   **Begründung:** Das ist ein etabliertes Mobile-Pattern, das den Bildschirm für den Inhalt freigibt und die Bedienung auf Touch-Geräten verbessert.
    *   **CSS-Idee:** `@media (max-width: 768px) { .offers-toolbar, .offers-stores { display: none; } /* .mobile-filter-btn { display: block; } */ }`

3.  **Karten-Layout entschlacken:** Die Detail-Infos in `.offer-meta` (Einheitspreis, Gültigkeit) standardmäßig verbergen und nur bei Hover/Fokus oder per Klick auf ein kleines Info-Icon anzeigen.
    *   **Begründung:** Verbessert die Scanbarkeit der Karten erheblich, da der Fokus auf Name, Preis und Marke liegt.
    *   **CSS-Idee:** `.offer-card .offer-meta { display: none; } .offer-card:hover .offer-meta { display: flex; }` (Für Touch-Geräte wäre eine Klick-Lösung via React-State besser).

4.  **Accessibility & Lesbarkeit fixen:** Schriftgrößen global anheben (z.B. `0.85rem` als Minimum für Meta-Text) und einen `:focus-visible` Stil für alle interaktiven Elemente definieren.
    *   **Begründung:** Macht die App für den Nutzer angenehmer und barrierefreier. Eine Grundvoraussetzung für gute UX.
    *   **CSS-Idee:** `.offers-chip:focus-visible, .offers-select:focus-visible { outline: 2px solid var(--color-accent-light); outline-offset: 2px; }`

5.  **Header-Statistiken strukturieren:** Die `.offers-sub` Zeile in einzelne, beschriftete Blöcke aufteilen.
    *   **Begründung:** Macht die wichtigsten Kennzahlen (für den datengetriebenen Nutzer relevant) auf einen Blick erfassbar.
    *   **Markup-Idee:** `<div class="offers-stats"><div class="stat"><strong>{totals.count}</strong> Angebote</div> <div class="stat"><strong>🌱 {totals.vegan}</strong> vegan</div> ...</div>`

---

### 3. Was würde ich streichen?

Die visuelle Unterscheidung zwischen Markt-Chips und Warengruppen-Chips (`.offers-chip-cat`). Sie fügt eine weitere Stil-Variation hinzu, die bei der vorgeschlagenen Dropdown-Lösung ohnehin obsolet wird. Eine einheitliche Chip-Gestaltung innerhalb der Filter-Popovers ist sauberer und reduziert die CSS-Komplexität.

---

### 4. ASCII-Skizze: Oberer Bereich (Desktop)

So könnte der Bereich nach Umsetzung von Vorschlag 1 und 5 aussehen. Aufgeräumt, kontrolliert und die wichtigsten Infos im Blick.

```
+-------------------------------------------------------------------------+
| 🏷️ Angebote                                        [Angebote neu einlesen] |
| [3.848 Angebote] [15 Ketten] [🌱 812 vegan] [Ø 27% Rabatt] [_ 15:30]      |
+-------------------------------------------------------------------------+
| [🔍 Produkt oder Marke suchen...        ] [Ketten (2) v] [Warengruppe (1) v] |
| [Ernährung: Vegan v]  [ ] nur Lebensmittel   [Sortierung: Ersparnis v]   |
+-------------------------------------------------------------------------+
|                                                                         |
| [Card 1] [Card 2] [Card 3] [Card 4]                                      |
```

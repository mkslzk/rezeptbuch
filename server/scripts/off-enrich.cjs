#!/usr/bin/env node
/**
 * OFF-Tag-Anreicherung (Batch): holt `ingredients_analysis_tags` für die in Angeboten
 * gematchten Produktcodes und aktualisiert `offer_history.diet_tag`.
 *
 * Aufruf:
 *   node scripts/off-enrich.cjs            # bis zu 300 Codes
 *   node scripts/off-enrich.cjs 1000       # bis zu 1000 Codes
 *   node scripts/off-enrich.cjs --codes 4008400301327,4008400301328
 *
 * Rate-Limit: OFF erlaubt ~100 Anfragen/Minute → wir bleiben bei 1 Anfrage / 700 ms.
 * Bereits geholte Codes werden nie erneut abgefragt (Tabelle `off_analysis`).
 */

const path = require('path');
const Database = require('better-sqlite3');
const off = require('../src/services/offLookup.cjs');

const DB_PATH = path.join(__dirname, '..', 'src', 'data', 'rezeptbuch.db');
const DELAY_MS = 700;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const explicitCodes = args[0] === '--codes' ? (args[1] || '').split(',').filter(Boolean) : null;
  const limit = explicitCodes ? explicitCodes.length : Number(args[0] || 300);

  const db = new Database(DB_PATH);
  off.ensureAnalysisTable();

  const codes = explicitCodes || db.prepare(`
    SELECT DISTINCT h.off_code AS code
    FROM offer_history h
    WHERE h.off_code IS NOT NULL
      AND h.scrape_id IN (SELECT id FROM offer_scrape_records ORDER BY scraped_at DESC, id DESC LIMIT 8)
      AND NOT EXISTS (SELECT 1 FROM off_analysis a WHERE a.code = h.off_code)
    LIMIT ?
  `).all(limit).map((r) => r.code);

  console.log(`OFF-Anreicherung: ${codes.length} Codes (Limit ${limit}), Verzögerung ${DELAY_MS} ms`);

  let fetched = 0;
  let vegan = 0;
  let vegetarian = 0;
  let failed = 0;

  for (const code of codes) {
    const row = await off.fetchAnalysis(code);
    if (!row) { failed++; }
    else {
      fetched++;
      if (row.vegan) vegan++;
      else if (row.vegetarian && !row.non_vegan) vegetarian++;
    }
    if ((fetched + failed) % 25 === 0) {
      console.log(`  … ${fetched + failed}/${codes.length} (vegan ${vegan}, vegetarisch ${vegetarian}, Fehler ${failed})`);
    }
    await sleep(DELAY_MS);
  }

  // Ernährungslabels in der Historie aktualisieren (nur wo OFF eine klare Aussage hat)
  const update = db.prepare(`
    UPDATE offer_history SET diet_tag = ?
    WHERE off_code = ? AND EXISTS (
      SELECT 1 FROM off_analysis a WHERE a.code = offer_history.off_code
        AND (a.vegan = 1 OR a.vegetarian = 1 OR a.non_vegan = 1)
    )
  `);
  let updated = 0;
  const tx = db.transaction(() => {
    for (const code of codes) {
      const diet = off.dietFromCachedAnalysis(code);
      if (!diet) continue;
      const label = diet === 'nicht-vegan' ? null : diet;   // "nicht-vegan" überschreibt den Heuristik-Wert nicht mit null
      if (label) updated += update.run(label, code).changes;
    }
  });
  tx();

  console.log(`Fertig: ${fetched} abgerufen, ${failed} Fehler, ${updated} Zeilen aktualisiert `
    + `(vegan ${vegan}, vegetarisch ${vegetarian}).`);
  console.log('Hinweis: Der Angebote-Tab liest den Speicher-Cache — nach dem Lauf den Dienst neu starten '
    + '(systemctl --user restart moca.service) oder den nächsten Scrape abwarten.');
  db.close();
}

main().catch((e) => {
  console.error('FEHLER:', e.stack || e.message);
  process.exit(1);
});

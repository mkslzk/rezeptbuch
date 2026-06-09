// Smart amount scaler for recipe servings adjustment.
// Parses German/decimal amounts, multiplies by a factor, and re-formats
// with sensible rounding (no "0.3333333333" outputs).

// Units that don't scale (qualitative / non-divisible):
//   "Prise"  → pinch
//   "etwas"  → some
//   "nach Geschmack" → to taste
//   empty / non-numeric
const NON_SCALABLE_UNITS = new Set(['prise']);  // empty unit is OK — it just means 'no unit'
const NON_SCALABLE_KEYWORDS = ['etwas', 'nach geschmack', 'nach belieben', 'beliebig', 'einige'];

/**
 * Check whether a (amount, unit) pair should be scaled.
 */
export function isScalable(amount, unit) {
  if (amount == null || amount === '') return false;
  const u = String(unit || '').toLowerCase().trim();
  if (NON_SCALABLE_UNITS.has(u)) return false;
  const a = String(amount).toLowerCase();
  if (NON_SCALABLE_KEYWORDS.some(kw => a.includes(kw))) return false;
  // Must contain a parseable number
  return parseGermanNumber(String(amount)) !== null;
}

/**
 * Parse a German-style number string ("1,5" / "0.5" / "200") → number.
 * Returns null if not parseable.
 */
export function parseGermanNumber(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(',', '.');
  if (!s) return null;
  // Allow leading "ca." or "~" etc.
  const cleaned = s.replace(/^(ca\.?|~|≈|circa)\s*/i, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format a number with German-style decimals (comma).
 * - Whole numbers stay whole ("3" not "3.0")
 * - Rounds to max 2 decimals ("0.33" not "0.33333333")
 * - Trims trailing zeros
 */
export function formatGermanNumber(n) {
  if (!Number.isFinite(n)) return '';
  // Round to 2 decimals
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded).replace('.', ',');
}

/**
 * Scale an amount string by a multiplier.
 * Returns null if not scalable, otherwise { amount, unit }.
 *
 * Examples:
 *   scaleAmount("200", "g", 1.5)  → { amount: "300", unit: "g" }
 *   scaleAmount("1,5", "L", 2)    → { amount: "3", unit: "L" }
 *   scaleAmount("1", "", 0.5)     → { amount: "0,5", unit: "" }
 *   scaleAmount("etwas", "", 2)   → null
 */
export function scaleAmount(amount, unit, multiplier) {
  if (multiplier === 1) return { amount: String(amount ?? ''), unit: unit ?? '' };
  if (!isScalable(amount, unit)) return null;
  const n = parseGermanNumber(String(amount));
  if (n == null) return null;
  const scaled = n * multiplier;
  return { amount: formatGermanNumber(scaled), unit: unit ?? '' };
}

/**
 * Get a human-readable scaling message for the UI.
 */
export function scalingBadge(multiplier) {
  if (multiplier === 1) return '';
  if (multiplier === 0.5) return '½× Portionen';
  if (multiplier === 2) return '2× Portionen';
  return `${formatGermanNumber(multiplier)}× Portionen`;
}

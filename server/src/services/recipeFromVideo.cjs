/**
 * Extract recipe data from video metadata using an LLM.
 * The input is an object: { description, transcript, title, uploader }
 * The LLM prefers the description (TikTok/IG caption — often has the full
 * recipe!) and falls back to the audio transcript.
 *
 * Uses local Ollama (llama3.2) when available, falls back to keyword extraction.
 *
 * @param {Object} input - { description, transcript, title, uploader }
 * @param {string} platform - 'tiktok' | 'instagram'
 * @returns {Promise<Object>} { title, ingredients, steps, servings, prepTime, cookTime }
 */
async function extractRecipeFromTranscript(input, platform = 'tiktok', fallbackProviders = []) {
  const data = typeof input === 'string'
    ? { description: '', transcript: input }
    : input || {};
  const frameText = data.frameText || '';

  if (!data.description?.trim() && !data.transcript?.trim()) {
    throw new Error('Weder Caption noch Transkript vorhanden — nichts zum Extrahieren');
  }

  // 1) Try LLM (best when it works, struggles on small models)
  let llmResult = null;
  try {
    llmResult = await extractWithOllama(data, platform);
  } catch (e) {
    console.log('Ollama failed:', e.message);
  }

  // Surface what the LLM returned (or didn't) so we can see why the
  // German-caption parser / keyword fallback is being used.
  console.log('[recipeFromVideo] llmResult ingredients:', llmResult?.ingredients?.length, 'steps:', llmResult?.steps?.length);
  if (llmResult && (llmResult.ingredients?.length || 0) < 2) {
    console.log('[recipeFromVideo] LLM result has <2 ingredients — falling through to caption parser');
  }
  if (llmResult && (llmResult.ingredients?.length || 0) >= 2 && (llmResult.steps?.length || 0) < 1) {
    console.log('[recipeFromVideo] LLM result has ingredients but no steps — falling through to caption parser');
  }

  // If LLM produced real structured output, use it
  if (llmResult && llmResult.ingredients.length >= 2 && llmResult.steps.length >= 1) {
    return llmResult;
  }

  // 2) Rule-based parser on the caption (very reliable for German TikTok/IG captions)
  const parsed = parseGermanRecipeCaption(data.description || '');
  if (parsed && parsed.ingredients.length >= 2) {
    console.log('✅ Used German-caption parser');
    return {
      title: parsed.title || data.title || `Rezept von ${platform}`,
      ingredients: parsed.ingredients,
      steps: parsed.steps,
      servings: llmResult?.servings ?? null,
      prepTime: llmResult?.prepTime ?? null,
      cookTime: llmResult?.cookTime ?? null
    };
  }

  // 3) Keyword fallback as last resort
  if (llmResult) return llmResult;
  return extractWithKeywords(data, platform);
}

const { chatJSON } = require('./llmClient.cjs');

async function extractWithOllama(data, platform, fallbackProviders = []) {
  // Prefer description (real recipe text) over transcript (often hallucinated by Whisper)
  const description = (data.description || '').trim();
  const transcript = (data.transcript || '').trim();
  const descriptionLooksUseful = description.length >= 40;
  const transcriptLooksUseful = transcript.length >= 40 && !/^\s*\d+\.\s*$/.test(transcript);

  let source = '';
  if (descriptionLooksUseful) {
    source = `CAPTION (vom Ersteller geschrieben, enthält oft das Rezept):\n${description.substring(0, 3000)}`;
    if (transcriptLooksUseful) {
      source += `\n\nAUDIO-TRANSKRIPT (zur Ergänzung):\n${transcript.substring(0, 2000)}`;
    }
  } else if (transcriptLooksUseful) {
    source = `AUDIO-TRANSKRIPT:\n${transcript.substring(0, 4000)}`;
  } else {
    source = `CAPTION (kurz):\n${description.substring(0, 1000)}`;
  }

  // Multilingual prompt: the caption may be in any language (German, Turkish,
  // English, Arabic, etc.) and is frequently a mix of several. The LLM must
  // detect the language(s), extract the recipe in whatever language it
  // appears, and still emit the final JSON in German.
  const prompt = `STRICT JSON ONLY - no text before or after the JSON block. You are a multilingual recipe extraction system. The input is the text of a ${platform === 'tiktok' ? 'TikTok' : 'Instagram'} cooking video. The creator may write the caption in any language (German, Turkish, English, Arabic, Russian, …) and frequently mixes multiple languages in one caption (for example a Turkish ingredient list + German instructions + English hashtags).

Your task:
1. Detect the language(s) present in the input.
2. Extract the recipe — ingredients and steps — from whatever language they appear in. Do NOT skip a section just because it is in a different language.
3. Translate everything into German for the final output (JSON values must be in German).
4. Be robust against mixed-language / misspelled captions: still extract a complete recipe.

Output ONLY valid JSON (no explanation, no markdown, no code fences):
{
  "title": "Recipe name (in German)",
  "ingredients": ["250g Mehl", "4 Eier"],
  "steps": ["Schritt 1", "Schritt 2"],
  "servings": 4,
  "prepTime": 15,
  "cookTime": 30
}

Rules:
- Translate ALL ingredients and step descriptions into German (preserve the original numbers / quantities as digits).
- Convert US / imperial units to metric:
  * 1 cup flour / Mehl / un → 140g
  * 1 cup butter / Butter → 225g
  * 1 cup sugar / Zucker → 200g
  * 1 cup milk / Milch / water / Wasser → 240ml
  * 1 cup liquid honey / flüssiger Honig / syrup → 320g
  * 1 stick butter (US) → 113g
  * 1 tbsp (Esslöffel / yemek kaşığı) → 15ml
  * 1 tsp (Teelöffel / çay kaşığı) → 5ml
  * 1 oz (weight) → 28g
  * 1 lb (Pfund) → 450g
  * Fahrenheit → Celsius: (°F − 32) × 5/9
  * 1 cup general liquid → 240ml
- ingredients: each ingredient as a single string with quantity, metric unit, and German name.
- steps: short, numbered, in German.
- servings / prepTime / cookTime: null if unknown.
- If the text contains no recipe, return empty arrays.
- Do NOT invent ingredients or steps that are not in the source.

CRITICAL: Output EXACTLY one valid JSON object and nothing else. No sentences before or after. Start with { and end with }.

Source text:
${source}
`;

  const recipe = await chatJSON([
    { role: 'user', content: prompt }
  ], { maxTokens: 1000, fallbackProviders });

  // Logging: surface what the LLM produced so we can debug extraction failures.
  // The prompt can be 4–6 KB; truncate to 600 chars for readability.
  try {
    const safe = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
    console.log('[recipeFromVideo] LLM output:', safe(recipe).substring(0, 300));
    console.log('[recipeFromVideo] transcript length:', transcript.length, 'description length:', description.length);
    console.log('[recipeFromVideo] LLM parsed: title=%s, ingredients=%d, steps=%d, servings=%s, prep=%s, cook=%s',
      JSON.stringify(recipe.title || '').substring(0, 120),
      Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0,
      Array.isArray(recipe.steps) ? recipe.steps.length : 0,
      recipe.servings, recipe.prepTime, recipe.cookTime);
  } catch (logErr) {
    console.log('[recipeFromVideo] logging failed:', logErr.message);
  }

  return {
    title: recipe.title || '',
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
    steps: Array.isArray(recipe.steps) ? recipe.steps : [],
    servings: recipe.servings ?? null,
    prepTime: recipe.prepTime ?? null,
    cookTime: recipe.cookTime ?? null
  };
}

function extractWithKeywords(data, platform = 'tiktok') {
  // Last-resort fallback: pick lines that look like ingredients/steps
  const text = ((data.description || '') + '\n' + (data.transcript || '')).trim();
  if (text.length < 10) {
    return { title: data.title || `Rezept von ${platform}`, ingredients: [], steps: [], servings: null, prepTime: null, cookTime: null };
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const ingredients = [];
  const steps = [];
  const INGRED_HINT = /(\d+\s*(g|kg|ml|l|el|tl|stk|stück|prise|beutel|packung|dose|dose|bund)\b|^\d+\s|esslöffel|teelöffel)/i;
  const STEP_HINT = /^(schritt|\d+\.|zuerst|dann|anschließend|danach|zuletzt|erst|als nächstes|rühre|mische|backe|koche|brate|gieße|schneide|wasche|heize|gieß|füge|verrühre|schlage)/i;

  for (const line of lines) {
    if (INGRED_HINT.test(line) && ingredients.length < 20) {
      ingredients.push(line.replace(/^[•\-\*]\s*/, ''));
    } else if (STEP_HINT.test(line) && steps.length < 15) {
      steps.push(line.replace(/^\d+\.\s*/, ''));
    }
  }

  return {
    title: data.title || `Rezept von ${platform}`,
    ingredients,
    steps,
    servings: null,
    prepTime: null,
    cookTime: null
  };
}

module.exports = { extractRecipeFromTranscript };

/**
 * Rule-based parser for German recipe captions.
 * Designed to handle the typical TikTok/IG caption style:
 *   "<long title with mentions> Zutaten - Teig: 250g Butter 250g Zucker ... Lemon Curd: ... Zubereitung: - Step 1 - Step 2"
 * Everything is usually on one line, so we split at quantity boundaries.
 */
function parseGermanRecipeCaption(caption) {
  if (!caption || caption.length < 50) return null;

  // Multilingual section headers. The first occurrence of an ingredients
  // header and the first subsequent occurrence of an instructions header
  // are used. The list intentionally covers common spellings / typos that
  // appear in real TikTok / Instagram captions (e.g. "Malzemeler", the
  // Turkish plural, which is often written as "Malzemeler" or "Malzemeleri").
  const INGREDIENT_HEADERS = [
    // German
    'Zutaten', 'Zutat',
    // Turkish
    'Malzemeler', 'Malzeme', 'Malzemeleri', 'Malzemesi',
    // English
    'Ingredients', 'Ingredient',
    // French
    'Ingrédients', 'Ingredient',
    // Italian
    'Ingredienti',
    // Spanish / Portuguese
    'Ingredientes',
    // Russian / Polish
    'Ингредиенты', 'Składniki',
    // Arabic
    'المكونات'
  ];
  const INSTRUCTION_HEADERS = [
    // German
    'Zubereitung', 'Zubereit', 'Anleitung', 'Anweisungen', 'Zubereitungsanleitung',
    // Turkish
    'Hazırlanışı', 'Hazırlanış', 'Hazırlama', 'Yapılışı', 'Yapılış', 'Tarif', 'Hazırlanış Şekli',
    // English
    'Instructions', 'Instruction', 'Method', 'Directions', 'Preparation', 'Steps', 'Procedure',
    // French
    'Préparation', 'Réalisation', 'Instructions',
    // Italian
    'Preparazione', 'Istruzioni', 'Procedimento',
    // Spanish
    'Preparación', 'Elaboración', 'Instrucciones',
    // Portuguese
    'Modo de Preparo', 'Modo de preparo', 'Preparo',
    // Russian
    'Приготовление', 'Способ приготовления', 'Инструкция',
    // Polish
    'Przygotowanie', 'Sposób przygotowania',
    // Arabic
    'طريقة التحضير', 'التحضير'
  ];

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Unicode-aware word boundaries: JS \\b is ASCII-only, which would not match
  // around Turkish characters like ı, ş, ğ, ö, ü, ç (they are non-\\w in JS).
  // (?<!\\p{L}) / (?!\\p{L}) requires the u flag and works for any letter.
  const ingRe = new RegExp('(?<!\\p{L})(?:' + INGREDIENT_HEADERS.map(esc).join('|') + ')(?!\\p{L})\\s*[-:]?\\s*', 'iu');
  const instRe = new RegExp('(?<!\\p{L})(?:' + INSTRUCTION_HEADERS.map(esc).join('|') + ')(?!\\p{L})\\s*:?\\s*', 'iu');

  // Find the first ingredients header and the first instructions header
  // that comes strictly after it.
  const zMatch = caption.match(ingRe);
  const bMatch = caption.match(instRe);
  if (!zMatch || !bMatch || bMatch.index <= zMatch.index) return null;

  const preText = caption.substring(0, zMatch.index).trim();
  const zutatenText = caption.substring(zMatch.index + zMatch[0].length, bMatch.index).trim();
  const zubereitungText = caption.substring(bMatch.index + bMatch[0].length).trim();

  // Title: first sentence(s) before the first ingredients header. Strip
  // leading non-letter characters (emojis, hashtags, @mentions). The regex
  // uses \\p{L} so non-Latin scripts (Cyrillic, Turkish, Arabic, …) survive.
  let title = preText
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}]+/u, '')
    .trim();
  const sentenceEnd = title.search(/[.!?]\s/);
  if (sentenceEnd > 20 && sentenceEnd < 120) title = title.substring(0, sentenceEnd);
  if (title.length > 120) title = title.substring(0, 117) + '…';
  if (title.length < 3) title = 'Rezept';

  // Split at whitelisted sub-section headers (German cooking sub-sections).
  // A multi-word regex was too greedy ("Backpulver Lemon Curd:" would match
  // as a single header and eat the previous ingredient). Whitelist is safer.
  const SUBHEADERS = ['Teig','Boden','Böden','Lemon Curd','Lemon-Curd','Curd',
    'Mascarpone-Creme','Mascarponecreme','Creme','Füllung','Glasur','Topping',
    'Deko','Sahne','Sauce','Soße','Rührteig','Mürbeteig','Baiser','Biskuit'];
  let processed = zutatenText;
  for (const h of SUBHEADERS) {
    processed = processed.replace(new RegExp('\\b' + h + '\\s*:', 'gi'),
                                  '||SUB||' + h + ':');
  }
  const sections = processed.split('||SUB||').map(s => s.trim()).filter(Boolean);

  // Match a quantity at the start: "<digit><unit><name>" or "<digit> <name>"
  // Units: g, kg, ml, l, el, tl, etc., plus "Eier", "Eigelb"
  const SPLIT_AT_QTY = /(?=\b\d+(?:[.,/]\d+)?\s*(?:g|kg|ml|l|cl|el|tl|esslöffel|teelöffel|stk|stück|prise|becher|packung|dose|bund|zehe|msp|prise)\b|\b\d+\s+(?:Eier|Eigelb|Ei\b|[A-ZÄÖÜ][a-zäöüß]+))/gi;
  // Strip leading garbage that might leak from a sub-header
  // IMPORTANT: do NOT strip leading digits — those are ingredient quantities (e.g. "4 Eier")
  const stripLead = s => s
    .replace(/^[A-ZÄÖÜ][a-zäöüß]+(?:[\s-][A-ZÄÖÜ&][a-zäöüß-]*)*\s*:\s*/, '') // "Lemon Curd: "
    .replace(/^[\s,;]+/, '')
    .replace(/^[•\-\*,]\s*/, '')
    .replace(/^\d+[.)]\s+/, '')         // list markers: "1. " or "2) " only
    .trim();

  let ingredients = [];
  for (const section of sections) {
    const cleaned = stripLead(section);
    if (cleaned.length < 2) continue;
    const parts = cleaned.split(SPLIT_AT_QTY).map(p => p.trim()).filter(Boolean);
    for (const p of parts) {
      const text = stripLead(p);
      if (text.length >= 2 && /\d/.test(text)) ingredients.push(text);
    }
  }
  // Post-process: reattach trailing prepositions like "von" / "mit" / "aus" to the next item
  // e.g. "1 TL Vanilleextrakt Abrieb von" + "1 Zitrone" → "1 TL Vanilleextrakt" + "Abrieb von 1 Zitrone"
  const PREP_AT_END = /\s+(von|mit|aus|nach|oder)\s*$/i;
  const merged = [];
  for (const ing of ingredients) {
    if (merged.length > 0 && PREP_AT_END.test(merged[merged.length - 1])) {
      const last = merged.pop();
      merged.push(last + ' ' + ing);
    } else {
      merged.push(ing);
    }
  }
  // Dedupe while preserving order
  ingredients = [...new Set(merged)];

  // Steps: split on " - " separators (TikTok style: "- step1 - step2 - step3")
  // Lowered the length threshold from 10 to 4 so that short imperative steps
  // in any language (Turkish "Pişir.", English "Mix.", Italian "Cuoci.") are
  // not silently dropped. The downstream LLM pass and human review are the
  // real quality gates — we want to keep candidates here.
  let steps = zubereitungText
    .replace(/^[•\-\s]+/, '')
    .split(/(?:\s+)?-\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 4);

  if (ingredients.length < 2) return null;
  if (steps.length < 1) return null;

  return { title, ingredients, steps };
}

module.exports.parseGermanRecipeCaption = parseGermanRecipeCaption;

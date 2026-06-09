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
async function extractRecipeFromTranscript(input, platform = 'tiktok') {
  const data = typeof input === 'string'
    ? { description: '', transcript: input }
    : input || {};

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

async function extractWithOllama(data, platform) {
  const { spawn } = require('child_process');

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

  const prompt = `Du bist ein deutsches Rezept-Extraktions-System. Extrahiere aus dem folgenden Text eines ${platform === 'tiktok' ? 'TikTok' : 'Instagram'}-Rezeptvideos die Zutaten und Schritte.

Gib NUR gültiges JSON zurück (keine Erklärung, kein Markdown):
{
  "title": "Rezeptname",
  "ingredients": ["250g Mehl", "4 Eier"],
  "steps": ["Schritt 1", "Schritt 2"],
  "servings": 4,
  "prepTime": 15,
  "cookTime": 30
}

Regeln:
- ingredients: jede Zutat mit Menge und Einheit als ein String
- steps: kurze, durchnummerierbare Schritte
- servings/prepTime/cookTime: null wenn unbekannt
- Wenn der Text kein Rezept enthält, gib leere Arrays zurück
- Halluziniere NICHTS — nur was im Text steht

Quelltext:
${source}
`;

  return new Promise((resolve, reject) => {
    const ollama = spawn('curl', [
      '-s', 'http://localhost:11434/api/generate',
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-d', JSON.stringify({
        model: 'llama3.2:3b',
        prompt: prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 800 }
      })
    ]);

    let output = '';
    ollama.stdout.on('data', d => { output += d.toString(); });
    ollama.on('error', e => reject(e));
    ollama.on('close', code => {
      if (code !== 0) return reject(new Error('Ollama exit ' + code));
      try {
        const parsed = JSON.parse(output);
        const text = parsed.response || '';
        // Pull the first {...} block (may be wrapped in markdown)
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return reject(new Error('No valid JSON in Ollama response'));
        const recipe = JSON.parse(match[0]);
        // Normalize shape
        return resolve({
          title: recipe.title || '',
          ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
          steps: Array.isArray(recipe.steps) ? recipe.steps : [],
          servings: recipe.servings ?? null,
          prepTime: recipe.prepTime ?? null,
          cookTime: recipe.cookTime ?? null
        });
      } catch (e) {
        reject(new Error('Failed to parse Ollama response: ' + e.message));
      }
    });
  });
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

  // Split caption at section headers (case-insensitive, anywhere in text)
  const ZUTATEN_RE = /\bZutaten\b\s*[-:]?\s*/i;
  const ZUBEREITUNG_RE = /\bZubereitung\b\s*:?\s*/i;
  const zMatch = caption.match(ZUTATEN_RE);
  const bMatch = caption.match(ZUBEREITUNG_RE);
  if (!zMatch || !bMatch || bMatch.index <= zMatch.index) return null;

  const preText = caption.substring(0, zMatch.index).trim();
  const zutatenText = caption.substring(zMatch.index + zMatch[0].length, bMatch.index).trim();
  const zubereitungText = caption.substring(bMatch.index + bMatch[0].length).trim();

  // Title: first sentence(s) before "Zutaten", or just first ~80 chars
  let title = preText
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-zÄÖÜäöüß]+/, '')
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
  let steps = zubereitungText
    .replace(/^[•\-\s]+/, '')
    .split(/(?:\s+)?-\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 10);

  if (ingredients.length < 2) return null;
  if (steps.length < 1) return null;

  return { title, ingredients, steps };
}

module.exports.parseGermanRecipeCaption = parseGermanRecipeCaption;

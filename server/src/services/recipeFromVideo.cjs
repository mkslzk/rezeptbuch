/**
 * Extract recipe data from a video transcript using LLM
 * Uses local Ollama (llama3.2) when available, falls back to keyword extraction
 * 
 * @param {string} transcript - The video transcript text
 * @param {string} platform - 'tiktok' or 'instagram'
 * @returns {Promise<Object>} Extracted recipe data { title, ingredients, steps, servings, prepTime, cookTime }
 */
async function extractRecipeFromTranscript(transcript, platform = 'tiktok') {
  if (!transcript || transcript.trim().length < 20) {
    throw new Error('Transcript too short or empty');
  }

  // Try Ollama first for high-quality extraction
  try {
    const result = await extractWithOllama(transcript, platform);
    return result;
  } catch (e) {
    console.log('Ollama extraction failed, trying keyword fallback:', e.message);
    return extractWithKeywords(transcript);
  }
}

async function extractWithOllama(transcript, platform) {
  const { spawn } = require('child_process');
  
  const prompt = `Du bist ein Rezept-Extraktions-System. Extrahiere aus dem folgenden Transkript eines ${platform === 'tiktok' ? 'TikTok' : 'Instagram'}-Rezeptvideos alle relevanten Informationen.

Gib NUR gültiges JSON zurück im folgenden Format (keine Erklärung, nur JSON):
{
  "title": "Rezeptname",
  "ingredients": ["Zutat 1 mit Menge", "Zutat 2 mit Menge"],
  "steps": ["Schritt 1", "Schritt 2", "Schritt 3"],
  "servings": 4,
  "prepTime": 15,
  "cookTime": 30
}

Wenn Zutaten oder Schritte nicht eindeutig identifizierbar sind, verwende leere Arrays [].
Verwende "null" für fehlende Zeiten.

Transkript:
${transcript.substring(0, 4000)}
`;

  return new Promise((resolve, reject) => {
    const ollama = spawn('curl', [
      '-s', 'http://localhost:11434/api/generate',
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-d', JSON.stringify({
        model: 'llama3.2',
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 500
        }
      })
    ]);

    let output = '';
    ollama.stdout.on('data', (data) => { output += data.toString(); });
    ollama.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Ollama exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(output);
        const responseText = parsed.response || '';
        
        // Extract JSON from response (may be wrapped in markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const recipe = JSON.parse(jsonMatch[0]);
          resolve(recipe);
        } else {
          reject(new Error('No valid JSON in Ollama response'));
        }
      } catch (e) {
        reject(new Error('Failed to parse Ollama response: ' + e.message));
      }
    });
    ollama.on('error', (e) => reject(e));
  });
}

function extractWithKeywords(transcript) {
  // Simple keyword-based fallback extraction
  // Looks for German cooking words and ingredient patterns
  
  const ingredientKeywords = [
    'g', 'kg', 'ml', 'l', 'el', 'tl', '杯', '捆', '块', '把', '勺',
    'gramm', 'kilogramm', 'milliliter', 'liter', 'esslöffel', 'teelöffel'
  ];
  
  const actionKeywords = [
    'geben', 'nehmen', 'mischen', 'rühren', 'kochen', 'braten', 'backen',
    'schneiden', 'waschen', 'abgießen', 'dazugeben', 'einrühren', 'aufgießen',
    'füllen', 'legen', 'stellen', 'nehmen', 'servieren', 'anrichten'
  ];

  const lines = transcript.split(/[.。\n]+/).filter(l => l.trim().length > 5);
  const ingredients = [];
  const steps = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    const hasQuantity = /[\d]+[\s]*[\w]+/.test(lower);
    const hasIngredientWord = ingredientKeywords.some(k => lower.includes(k));
    const hasActionWord = actionKeywords.some(k => lower.includes(k));

    if (hasQuantity && (hasIngredientWord || hasActionWord)) {
      if (hasIngredientWord && ingredients.length <= 20) {
        ingredients.push(line.trim());
      } else if (hasActionWord) {
        steps.push(line.trim());
      }
    }
  }

  return {
    title: `Rezept von ${platform || 'Video'}`,
    ingredients: ingredients.slice(0, 15),
    steps: steps.slice(0, 10),
    servings: null,
    prepTime: null,
    cookTime: null
  };
}

module.exports = { extractRecipeFromTranscript, extractWithOllama, extractWithKeywords };
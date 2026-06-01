const { chromium } = require('playwright');

async function importRecipe(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ 
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    
    // Handle cookie consent
    try {
      const consentBtn = page.locator('.cc-btn.cc-allow').first();
      if (await consentBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await consentBtn.click({ timeout: 3000 });
        await page.waitForTimeout(1500);
      }
    } catch (e) {}
    
    await page.waitForTimeout(1000);
    
    const data = await page.evaluate(() => {
      function parseDuration(iso) {
        if (!iso) return null;
        const match = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
        if (match) return (parseInt(match[1] || 0) * 60) + parseInt(match[2] || 0);
        return null;
      }
      
      function parseYield(yield_) {
        if (!yield_) return null;
        const match = String(yield_).match(/\d+/);
        return match ? parseInt(match[0]) : null;
      }
      
      function extractImage(image) {
        if (!image) return '';
        if (typeof image === 'string') return image;
        if (Array.isArray(image)) return extractImage(image[0]);
        if (typeof image === 'object') return image.url || image.contentUrl || '';
        return '';
      }
      
      function parseInstructions(instructions) {
        if (!instructions) return [];
        if (typeof instructions === 'string') return [instructions];
        if (!Array.isArray(instructions)) return [String(instructions)];
        
        const result = [];
        for (const item of instructions) {
          if (typeof item === 'string') {
            result.push(item);
          } else if (item['@type'] === 'HowToStep') {
            result.push(item.text || item.name || '');
          } else if (item['@type'] === 'HowToSection') {
            if (item.itemListElement) {
              for (const step of item.itemListElement) {
                result.push(step.text || step.name || '');
              }
            } else if (item.text) {
              result.push(item.text);
            }
          } else if (item.text) {
            result.push(item.text);
          }
        }
        return result.filter(Boolean).map(s => s.trim());
      }
      
      function parseRecipeData(recipe) {
        return {
          title: recipe.name || '',
          description: typeof recipe.description === 'string' ? recipe.description : (Array.isArray(recipe.description) ? recipe.description[0] : ''),
          ingredients: Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [],
          steps: parseInstructions(recipe.recipeInstructions),
          category: recipe.recipeCategory || '',
          servings: parseYield(recipe.recipeYield),
          prepTime: parseDuration(recipe.prepTime),
          cookTime: parseDuration(recipe.cookTime),
          imageUrl: extractImage(recipe.image)
        };
      }
      
      // --- COOKMATE: Try window.recipe first ---
      if (window.recipe && window.recipe.title) {
        const wr = window.recipe;
        
        // Parse HTML ingredients list
        function parseIngredientsHtml(html) {
          if (!html) return [];
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          const ingredients = [];
          const seen = new Set();
          
          // Walk through all elements, but skip section headers (<strong>, <h3>) 
          // and only collect actual ingredient items:
          // - <em> tags directly containing ingredient text (e.g. "450 g Rinderhackfleisch")
          // - <li> tags that are NOT inside a sub-<ul> preceded by a section header
          
          const allElements = tmp.querySelectorAll('*');
          for (const el of allElements) {
            // Skip section headers
            if (['H1','H2','H3','H4','STRONG','B'].includes(el.tagName)) continue;
            
            // Collect <em> text content - these are usually the main ingredient quantities
            if (el.tagName === 'EM') {
              const text = el.textContent.replace(/\*+$/g, '').trim();
              if (text && !seen.has(text)) {
                ingredients.push(text);
                seen.add(text);
              }
            }
            
            // Collect <li> items, but skip those that are section header siblings
            // (li containing only a <strong> tag with no useful quantity info)
            if (el.tagName === 'LI') {
              const text = el.textContent.replace(/\*+$/g, '').trim();
              // Skip list items that are just section dividers (contain only bold text, no quantity)
              const isSectionHeader = el.querySelector('strong, h3, h4');
              const hasQuantity = /\d/.test(text) && text.length > 3;
              if (text && !isSectionHeader && !seen.has(text)) {
                if (hasQuantity || !text.includes(':')) {
                  ingredients.push(text);
                  seen.add(text);
                }
              }
            }
          }
          
          return [...new Set(ingredients)];
        }
        
        // Parse HTML directions/recipe string (each <li> = one step)
        function parseDirectionsHtml(html) {
          if (!html) return [];
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          const steps = [];
          tmp.querySelectorAll('li').forEach(li => {
            const text = li.textContent.trim();
            if (text) steps.push(text);
          });
          if (steps.length === 0 && tmp.textContent) {
            steps.push(tmp.textContent.trim());
          }
          return steps;
        }
        
        return {
          title: wr.title || '',
          description: '',
          ingredients: parseIngredientsHtml(wr.ingredients),
          steps: parseDirectionsHtml(wr.recipe),
          category: '',
          servings: null,
          prepTime: null,
          cookTime: null,
          imageUrl: ''
        };
      }
      
      // Try JSON-LD
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const json = JSON.parse(script.textContent);
          const items = Array.isArray(json) ? json : [json];
          for (const item of items) {
            if (item['@type'] === 'Recipe') return parseRecipeData(item);
            if (item['@graph']) {
              const recipe = item['@graph'].find(g => g['@type'] === 'Recipe');
              if (recipe) return parseRecipeData(recipe);
            }
          }
        } catch (e) {}
      }
      
      // Fallback: OG tags
      return {
        title: document.querySelector('meta[property="og:title"]')?.content || document.title || 'Imported Recipe',
        description: document.querySelector('meta[property="og:description"]')?.content || '',
        ingredients: [],
        steps: [],
        category: '',
        servings: null,
        prepTime: null,
        cookTime: null,
        imageUrl: document.querySelector('meta[property="og:image"]')?.content || ''
      };
    });
    
    return { ...data, source_url: url };
    
  } finally {
    await browser.close();
  }
}

module.exports = { importRecipe };
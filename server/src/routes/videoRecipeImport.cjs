const express = require('express');
const router = express.Router();
const { unlinkSync } = require('fs');
const Database = require('better-sqlite3');
const path = require('path');
const { extractVideoUrl } = require('../services/videoRecipeExtractor.cjs');
const { transcribeVideo, extractTextFromFrames } = require('../services/videoTranscriber.cjs');
const { extractRecipeFromTranscript } = require('../services/recipeFromVideo.cjs');
const { getConfig, PROVIDERS } = require('../services/llmClient.cjs');

// Separate SQLite connection (WAL mode allows this safely).
// Used to auto-save imported recipes so the user lands on the detail page
// instead of having to click "Speichern" manually.
const saveDb = new Database(path.join(__dirname, '..', 'data', 'moca.db'));
saveDb.pragma('journal_mode = WAL');


// Parse ingredient strings like "250g Mehl", "4 Eier, Größe L" or "1/2 TL Salz" into objects.
const KNOWN_UNITS = new Set([
  'g', 'kg', 'mg', 'ml', 'l', 'cl',
  'el', 'tl', 'esslöffel', 'teelöffel',
  'stk', 'stück', 'stücke', 'prise', 'prisen',
  'becher', 'packung', 'packungen', 'dose', 'dosen',
  'bund', 'zehe', 'zehen', 'msp', 'spritzer', 'tropfen'
]);
function parseIngredientString(str) {
  if (typeof str !== 'string') return null;
  const text = str.trim();
  if (!text) return null;
  // Pattern: <number>[<unit>] <item>
  //   "250g Mehl"      → amount=250, unit=g,  item=Mehl
  //   "250 g Mehl"     → amount=250, unit=g,  item=Mehl
  //   "1/2 TL Salz"    → amount=1/2, unit=TL, item=Salz
  //   "1,5 l Milch"    → amount=1.5, unit=l,  item=Milch
  //   "4 Eier"         → amount=4,   unit='',  item=Eier
  const m = text.match(/^(\d+(?:[.,/]\d+)?)\s*([A-Za-zäöüÄÖÜß]{1,5}\.?)?\s+(.+)$/);
  if (m) {
    const amount = m[1].replace(',', '.');
    const rawUnit = (m[2] || '').toLowerCase().replace('.', '');
    const rest = m[3].trim();
    // If a unit was found AND it's a known measurement, use it
    if (rawUnit && KNOWN_UNITS.has(rawUnit)) {
      return { item: rest, amount, unit: rawUnit };
    }
    // No recognized unit → whole thing (incl. possible misread unit) is the item
    return { item: text, amount, unit: '' };
  }
  // Fallback: whole string is the item
  return { item: text, amount: '', unit: '' };
}
function normalizeIngredients(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(ing => {
    // Already an object? Keep it.
    if (ing && typeof ing === 'object' && 'item' in ing) return ing;
    return parseIngredientString(ing) || { item: String(ing), amount: '', unit: '' };
  });
}

function saveImportedRecipe(recipe) {
  if (!recipe || !recipe.title) return null;
  try {
    // Schema must include import_method, video_transcript, video_caption
    // (columns were added in the db migration). Truncate transcript/caption
    // to 2000 chars to keep the DB row size sane — full text is still
    // available in the job result for the UI to show.
    const stmt = saveDb.prepare(`
      INSERT INTO recipes (title, description, ingredients, steps, category, tags,
                           image_url, servings, prep_time, cook_time, source_url,
                           import_method, video_transcript, video_caption)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      recipe.title,
      recipe.description || null,
      JSON.stringify(normalizeIngredients(recipe.ingredients)),
      JSON.stringify(recipe.steps || []),
      recipe.category || null,
      JSON.stringify(recipe.tags || []),
      recipe.image_url || null,
      recipe.servings || null,
      recipe.prepTime || recipe.prep_time || null,
      recipe.cookTime || recipe.cook_time || null,
      recipe.source_url || null,
      recipe.import_method || null,
      (recipe.video_transcript || '').substring(0, 2000),
      (recipe.video_caption || '').substring(0, 2000)
    );
    return result.lastInsertRowid;
  } catch (e) {
    console.error('saveImportedRecipe failed:', e.message);
    return null;
  }
}
const { importRecipe: importRecipeFromUrl } = require('../services/recipeImporter.cjs');

// ============================================================================
// Multi-Job model
// ----------------------------------------------------------------------------
// - Single video import: job of type 'video', runs on POST /import-video
// - Batch import: many jobs queued under a batchId, processed sequentially
// - All jobs are tracked in the `jobs` Map; result/error/message live there
// - Clients can poll /import/active to see all running jobs (used by start page)
// ============================================================================

const jobs = new Map();
const batches = new Map();

const MAX_CONCURRENT_JOBS = 1; // Sequential processing per batch — saves CPU/network

function newId(prefix) {
  return `${prefix}_${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createJob({ type, url, batchId = null }) {
  const jobId = newId('job');
  jobs.set(jobId, {
    jobId,
    batchId,
    type, // 'video' | 'url'
    url,
    status: 'pending', // pending | running | done | error | cancelled
    stage: 'queued',
    message: 'In Warteschlange…',
    progress: 0,
    platform: null,
    startedAt: null,
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    result: null, // { title, ingredients, steps, source_url, ... } OR null
    error: null
  });
  return jobId;
}

function patchJob(jobId, patch) {
  const j = jobs.get(jobId);
  if (!j) return;
  Object.assign(j, patch, { updatedAt: new Date().toISOString() });
  if (patch.status === 'done' || patch.status === 'error' || patch.status === 'cancelled') {
    j.finishedAt = j.updatedAt;
  }
}

function setJobMessage(jobId, stage, message, progress) {
  patchJob(jobId, { stage, message, progress });
  const j = jobs.get(jobId);
  console.log(`📋 [${jobId}] ${stage}: ${message}${typeof progress === 'number' ? ` (${progress}%)` : ''}`);
}

function isVideoUrl(url) {
  return /tiktok\.com|instagram\.com/.test(url);
}

function createBatch(items) {
  const batchId = newId('batch');
  const jobIds = items.map(item => {
    const type = isVideoUrl(item.url) ? 'video' : 'url';
    return createJob({ type, url: item.url, batchId });
  });
  batches.set(batchId, {
    batchId,
    jobIds,
    createdAt: new Date().toISOString(),
    totalJobs: jobIds.length,
    completedJobs: 0,
    failedJobs: 0,
    status: 'pending'
  });
  return { batchId, jobIds };
}

function patchBatch(batchId, patch) {
  const b = batches.get(batchId);
  if (!b) return;
  Object.assign(b, patch);
}

function batchProgress(batchId) {
  const b = batches.get(batchId);
  if (!b) return null;
  const jobsView = b.jobIds.map(id => {
    const j = jobs.get(id);
    if (!j) return null;
    return {
      jobId: j.jobId,
      type: j.type,
      url: j.url,
      status: j.status,
      stage: j.stage,
      message: j.message,
      progress: j.progress,
      title: j.result?.title || null,
      error: j.error
    };
  });
  const completed = b.jobIds.filter(id => jobs.get(id)?.status === 'done').length;
  const failed = b.jobIds.filter(id => jobs.get(id)?.status === 'error').length;
  return {
    batchId: b.batchId,
    totalJobs: b.totalJobs,
    completedJobs: completed,
    failedJobs: failed,
    status: b.status,
    jobs: jobsView
  };
}

// ============================================================================
// Job runners
// ============================================================================

async function runVideoJob(jobId) {
  const j = jobs.get(jobId);
  if (!j) return;
  patchJob(jobId, { status: 'running', startedAt: new Date().toISOString() });
  let videoPath = null;

  try {
    // Step 1: yt-dlp downloads video + fetches caption (often has the recipe!)
    setJobMessage(jobId, 'download', 'Video wird heruntergeladen (yt-dlp)…', 10);
    const dl = await extractVideoUrl(j.url);
    if (!dl.videoPath) throw new Error('Konnte Video nicht herunterladen — Beitrag ist möglicherweise privat.');
    videoPath = dl.videoPath;
    patchJob(jobId, { platform: dl.platform });
    setJobMessage(jobId, 'download', `Video heruntergeladen (${(dl.sizeBytes / 1024 / 1024).toFixed(1)} MB)`, 40);

    // Step 2: transcribe audio (Whisper). May be empty/garbage if no speech.
    setJobMessage(jobId, 'transcribe', 'Transkribiere Audio (Whisper)…', 50);
    let transcript = '';
    try {
      transcript = await transcribeVideo(videoPath, 'small');
    } catch (e) {
      console.warn('Whisper fehlgeschlagen, fahre mit Caption fort:', e.message);
    }
    const transcriptClean = (transcript || '').trim();

    // Step 2b: Extract text from video frames (ingredients/steps shown as overlays)
    let frameText = '';
    try {
      frameText = await extractTextFromFrames(videoPath);
      console.log(`[videoRecipeImport] OCR frame text: ${frameText.length} chars`);
    } catch (e) {
      console.warn('OCR fehlgeschlagen:', e.message);
    }

    setJobMessage(jobId, 'transcribe', `Audio: ${transcriptClean.length} Zeichen · Caption: ${(dl.description || '').length} · OCR: ${frameText.length}`, 70);

    // Step 3: Build fallback provider list from settings (all configured providers except primary)
    const cfg = getConfig();
    const primaryProvider = cfg.provider;
    const fallbackProviders = Object.keys(PROVIDERS)
      .filter(k => k !== primaryProvider && k !== 'ollama' && k !== 'custom')
      .filter(k => cfg[k]?.apiKey || cfg[k]?.endpoint)
      .map(k => ({ provider: k, model: cfg[k]?.model || PROVIDERS[k]?.defaultModel || '' }));

    setJobMessage(jobId, 'recipe', 'Rezept wird extrahiert (LLM)…', 80);
    let recipe;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        recipe = await extractRecipeFromTranscript({
          description: dl.description || '',
          transcript: transcriptClean,
          title: dl.title || '',
          uploader: dl.uploader || '',
          frameText: frameText || ''
        }, dl.platform, fallbackProviders);
        break;
      } catch (e) {
        console.warn(`LLM attempt ${attempt} failed:`, e.message);
        if (attempt === 3) throw e;
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }

    // Fallback title if LLM returned empty
    const fallbackTitle = dl.title || `Rezept von ${dl.uploader || dl.platform || 'TikTok'}`;
    const result = {
      title: (recipe?.title && recipe.title.length > 3) ? recipe.title : fallbackTitle,
      description: recipe?.description || dl.description?.substring(0, 300) || '',
      ingredients: recipe?.ingredients || [],
      steps: recipe?.steps || [],
      category: recipe?.category || '',
      image_url: recipe?.image_url || dl.thumbnail || '',
      servings: recipe?.servings ?? null,
      prep_time: recipe?.prepTime ?? null,
      cook_time: recipe?.cookTime ?? null,
      source_url: j.url,
      video_transcript: transcriptClean.substring(0, 500),
      video_caption: (dl.description || '').substring(0, 500),
      platform: dl.platform,
      import_method: 'video'
    };
    // Auto-save so the recipe lands in the DB immediately
    const recipeId = saveImportedRecipe(result);
    if (recipeId) {
      result.recipe_id = recipeId;
      console.log(`💾 Video job ${jobId} → recipe #${recipeId}`);
    }

    patchJob(jobId, {
      status: 'done',
      stage: 'done',
      message: `Rezept #${recipeId || '?'} "${recipe.title}" gespeichert (${recipe.ingredients?.length || 0} Zutaten, ${recipe.steps?.length || 0} Schritte)`,
      progress: 100,
      result
    });
  } catch (e) {
    console.error(`Video job ${jobId} failed:`, e);
    patchJob(jobId, {
      status: 'error',
      stage: 'error',
      message: e.message || 'Unbekannter Fehler',
      error: e.message
    });
  } finally {
    // Always clean up the temp video file
    if (videoPath) { try { unlinkSync(videoPath); } catch {} }
  }
}

async function runUrlJob(jobId) {
  const j = jobs.get(jobId);
  if (!j) return;
  patchJob(jobId, { status: 'running', startedAt: new Date().toISOString() });

  try {
    setJobMessage(jobId, 'fetch', 'Webseite wird geladen…', 20);
    const data = await importRecipeFromUrl(j.url);
    const result = {
      title: data.title || '',
      description: data.description || '',
      ingredients: data.ingredients || [],
      steps: data.steps || [],
      category: data.category || '',
      image_url: data.imageUrl || '',
      servings: data.servings || null,
      prep_time: data.prepTime || null,
      cook_time: data.cookTime || null,
      source_url: j.url,
      import_method: 'url'
    };
    const recipeId = saveImportedRecipe(result);
    if (recipeId) {
      result.recipe_id = recipeId;
      console.log(`💾 URL job ${jobId} → recipe #${recipeId}`);
    }
    patchJob(jobId, {
      status: 'done',
      stage: 'done',
      message: `Rezept #${recipeId || '?'} "${result.title || 'Ohne Titel'}" gespeichert (${result.ingredients.length} Zutaten, ${result.steps.length} Schritte)`,
      progress: 100,
      result
    });
  } catch (e) {
    console.error(`URL job ${jobId} failed:`, e);
    patchJob(jobId, {
      status: 'error',
      stage: 'error',
      message: e.message || 'Webseiten-Import fehlgeschlagen',
      error: e.message
    });
  }
}

async function runJob(jobId) {
  const j = jobs.get(jobId);
  if (!j) return;
  if (j.type === 'video') await runVideoJob(jobId);
  else if (j.type === 'url') await runUrlJob(jobId);
}

async function runBatch(batchId) {
  const b = batches.get(batchId);
  if (!b) return;
  patchBatch(batchId, { status: 'running' });
  for (const jobId of b.jobIds) {
    await runJob(jobId);
    const j = jobs.get(jobId);
    if (j?.status === 'error') {
      patchBatch(batchId, { failedJobs: (b.failedJobs || 0) + 1 });
    } else if (j?.status === 'done') {
      patchBatch(batchId, { completedJobs: (b.completedJobs || 0) + 1 });
    }
  }
  patchBatch(batchId, { status: 'done' });
  console.log(`🏁 Batch ${batchId} done: ${b.completedJobs || 0} ok, ${b.failedJobs || 0} failed`);
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/recipes/import-video
 * Single video import (back-compat). Returns 202 with jobId.
 */
router.post('/import-video', async (req, res) => {
  const { url } = req.body;
  if (!url || !isVideoUrl(url)) {
    return res.status(400).json({ error: 'Invalid TikTok or Instagram URL' });
  }

  // Refuse if any job is already running
  for (const j of jobs.values()) {
    if (j.status === 'running') {
      return res.status(409).json({ error: 'Ein Import läuft bereits', jobId: j.jobId });
    }
  }

  const jobId = createJob({ type: 'video', url });
  // Run in background
  runJob(jobId).catch(err => console.error('runJob failed:', err));
  res.status(202).json({ success: true, started: true, jobId });
});

/**
 * POST /api/recipes/import/batch
 * Body: { items: [{ url: "..." }, { url: "..." }] }
 * Auto-detects type per URL. Returns 202 with batchId + jobIds.
 */
router.post('/import/batch', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array required' });
  }
  if (items.length > 50) {
    return res.status(400).json({ error: 'Max 50 items per batch' });
  }
  // Normalize + filter empties
  const clean = items
    .map(i => (typeof i === 'string' ? { url: i } : i))
    .filter(i => i && typeof i.url === 'string' && i.url.trim())
    .map(i => ({ url: i.url.trim() }));
  if (clean.length === 0) {
    return res.status(400).json({ error: 'No valid URLs in batch' });
  }

  const { batchId, jobIds } = createBatch(clean);
  // Process in background
  runBatch(batchId).catch(err => console.error('runBatch failed:', err));

  // Echo back with type hints so client can show previews
  const preview = jobIds.map((id, idx) => ({
    jobId: id,
    url: clean[idx].url,
    type: isVideoUrl(clean[idx].url) ? 'video' : 'url'
  }));
  res.status(202).json({ success: true, batchId, jobIds, items: preview });
});

/**
 * GET /api/recipes/import/active
 * Returns all running and recent (last 5 min) jobs — used by the start-page banner.
 */
router.get('/import/active', (req, res) => {
  const now = Date.now();
  const FIVE_MIN = 5 * 60 * 1000;
  const active = [];
  const recent = [];
  for (const j of jobs.values()) {
    const updated = new Date(j.updatedAt).getTime();
    const isLive = j.status === 'running' || j.status === 'pending';
    if (isLive) {
      active.push({
        jobId: j.jobId, batchId: j.batchId, type: j.type, url: j.url,
        status: j.status, stage: j.stage, message: j.message,
        progress: j.progress, title: j.result?.title || null
      });
    } else if (now - updated < FIVE_MIN) {
      recent.push({
        jobId: j.jobId, batchId: j.batchId, type: j.type, url: j.url,
        status: j.status, stage: j.stage, message: j.message,
        progress: j.progress, title: j.result?.title || null
      });
    }
  }
  res.json({ active, recent });
});

/**
 * GET /api/recipes/import-video/progress?jobId=...
 * Back-compat: returns single job (or null) — used by the form page.
 */
router.get('/import-video/progress', (req, res) => {
  const { jobId } = req.query;
  if (!jobId) return res.json({ progress: null });
  const j = jobs.get(jobId);
  if (!j) return res.json({ progress: null });
  const { result, ...progress } = j;
  res.json({ progress });
});

/**
 * GET /api/recipes/import/batch/progress?batchId=...
 * Returns full batch state.
 */
router.get('/import/batch/progress', (req, res) => {
  const { batchId } = req.query;
  if (!batchId) return res.json({ progress: null });
  res.json({ progress: batchProgress(batchId) });
});

/**
 * GET /api/recipes/import-video/result/:jobId
 * Back-compat: returns single job's recipe result.
 */
router.get('/import-video/result/:jobId', (req, res) => {
  const j = jobs.get(req.params.jobId);
  if (!j) return res.status(404).json({ error: 'Job not found' });
  if (j.status === 'pending' || j.status === 'running') {
    return res.status(202).json({ error: 'Job still running', status: j.status });
  }
  if (j.status === 'error') return res.status(500).json({ error: j.error || j.message });
  res.json(j.result);
});

/**
 * GET /api/recipes/import/batch/results?batchId=...
 * Returns all recipe results for a completed batch.
 */
router.get('/import/batch/results', (req, res) => {
  const { batchId } = req.query;
  if (!batchId) return res.status(400).json({ error: 'batchId required' });
  const b = batches.get(batchId);
  if (!b) return res.status(404).json({ error: 'Batch not found' });
  const results = b.jobIds
    .map(id => jobs.get(id))
    .filter(j => j && j.status === 'done')
    .map(j => j.result);
  res.json({ batchId, results });
});

/**
 * POST /api/recipes/import/cancel
 * Body: { jobId? | batchId? }
 * Cancels a single job or all jobs in a batch.
 */
router.post('/import/cancel', (req, res) => {
  const { jobId, batchId } = req.body || {};
  let cancelled = 0;
  if (jobId) {
    const j = jobs.get(jobId);
    if (j && (j.status === 'pending' || j.status === 'running')) {
      patchJob(jobId, { status: 'cancelled', stage: 'cancelled', message: 'Abgebrochen' });
      cancelled++;
    }
  }
  if (batchId) {
    const b = batches.get(batchId);
    if (b) {
      for (const id of b.jobIds) {
        const j = jobs.get(id);
        if (j && (j.status === 'pending' || j.status === 'running')) {
          patchJob(id, { status: 'cancelled', stage: 'cancelled', message: 'Abgebrochen' });
          cancelled++;
        }
      }
    }
  }
  res.json({ success: true, cancelled });
});

/**
 * GET /api/recipes/import-video/status
 * Back-compat health check.
 */
router.get('/import-video/status', (req, res) => {
  let running = 0;
  for (const j of jobs.values()) if (j.status === 'running') running++;
  res.json({
    fasterWhisper: true,
    ffmpeg: true,
    ollama: true,
    activeJobs: running
  });
});

module.exports = router;

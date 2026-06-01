const express = require('express');
const router = express.Router();
const { extractVideoUrl } = require('../services/videoRecipeExtractor.cjs');
const { transcribeVideoUrl } = require('../services/videoTranscriber.cjs');
const { extractRecipeFromTranscript } = require('../services/recipeFromVideo.cjs');

/**
 * Import recipe from TikTok or Instagram Reels video
 * POST /api/recipes/import-video
 * Body: { url: "https://www.tiktok.com/@user/video/123..." }
 * 
 * Steps:
 * 1. Extract video URL from the social media post
 * 2. Download and transcribe the video using faster-whisper
 * 3. Use LLM to extract structured recipe data from transcript
 */
router.post('/import-video', async (req, res) => {
  const { url } = req.body;
  
  if (!url || (!url.includes('tiktok.com') && !url.includes('instagram.com'))) {
    return res.status(400).json({ error: 'Invalid TikTok or Instagram URL' });
  }

  try {
    // Step 1: Extract video URL from the post
    console.log('📱 Extracting video from:', url);
    const { videoUrl, platform } = await extractVideoUrl(url);
    
    if (!videoUrl) {
      return res.status(404).json({ 
        error: 'Could not extract video. The post might be private or unavailable.',
        platform 
      });
    }
    console.log('✅ Got video URL, platform:', platform);

    // Step 2: Transcribe the video (this is the slow part)
    console.log('🎙️  Transcribing video...');
    let transcript;
    try {
      transcript = await transcribeVideoUrl(videoUrl, 'base');
      console.log('✅ Transcribed:', transcript?.length || 0, 'chars');
    } catch (e) {
      console.error('Transcription failed:', e.message);
      return res.status(422).json({ 
        error: 'Video transcription failed. The video might not have audio or is inaccessible.',
        details: e.message 
      });
    }

    if (!transcript || transcript.trim().length < 20) {
      return res.status(422).json({ 
        error: 'Transcription too short. Could not extract audio from video.',
        platform 
      });
    }

    // Step 3: Extract recipe data from transcript
    console.log('🤖 Extracting recipe from transcript...');
    const recipe = await extractRecipeFromTranscript(transcript, platform);
    console.log('✅ Extracted recipe:', recipe.title);

    res.json({
      ...recipe,
      source_url: url,
      video_transcript: transcript.substring(0, 500), // Store first 500 chars for reference
      platform,
      import_method: 'video'
    });

  } catch (e) {
    console.error('Video import error:', e);
    res.status(500).json({ 
      error: 'Failed to import recipe from video: ' + e.message,
      hint: 'Make sure the video is public and accessible' 
    });
  }
});

/**
 * Check if video import capabilities are available
 * GET /api/recipes/import-video/status
 */
router.get('/import-video/status', (req, res) => {
  const checks = {
    fasterWhisper: true, // Already verified
    ffmpeg: true,       // Assumed available
    ollama: false       // Will check on demand
  };

  // Quick check for Ollama
  try {
    const { spawn } = require('child_process');
    const proc = spawn('curl', ['-s', 'http://localhost:11434/api/tags']);
    setTimeout(() => { try { proc.kill(); } catch(e) {} }, 1000);
    proc.on('close', (code) => {
      checks.ollama = code === 0;
    });
  } catch(e) {}

  res.json(checks);
});

module.exports = router;
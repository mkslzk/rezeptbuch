const { readFileSync, existsSync, unlinkSync } = require('fs');
const { tmpdir } = require('os');
const { spawn } = require('child_process');
const path = require('path');

/**
 * Transcribe audio from a video file using faster-whisper
 * Works locally without API keys
 * 
 * @param {string} videoPath - Local path to video file
 * @param {string} model - 'tiny', 'base', 'small', 'medium', 'large' (default: 'base')
 * @returns {Promise<string>} Transcribed text
 */
function transcribeVideo(videoPath, model = 'base') {
  return new Promise((resolve, reject) => {
    const tmpOutput = path.join(tmpdir(), `transcript_${Date.now()}.txt`);
    
    // Use ffmpeg to extract audio and pipe to faster-whisper via Python
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
      '-f', 'wav', '-'
    ]);
    
    // Start whisper transcription using Python
    const whisper = spawn('python3', [
      '-c',
      `
import sys
import faster_whisper

model = faster_whisper.load_model("${model}")
segments, info = model.transcribe(sys.stdin.buffer, language="de", task="transcribe")
text = []
for segment in segments:
    text.append(segment.text)
print(' '.join(text), flush=True)
`
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let transcript = '';
    let error = '';

    ffmpeg.stdout.pipe(whisper.stdin);
    
    whisper.stdout.on('data', (data) => {
      transcript += data.toString();
    });

    whisper.stderr.on('data', (data) => {
      error += data.toString();
    });

    whisper.on('close', (code) => {
      if (code === 0) {
        resolve(transcript.trim());
      } else {
        reject(new Error(`Whisper failed: ${error}`));
      }
    });

    ffmpeg.on('error', (e) => reject(e));
    whisper.on('error', (e) => reject(e));
  });
}

/**
 * Simple transcript from video URL (downloads first)
 * @param {string} videoUrl - URL to video
 * @param {string} model - whisper model size
 */
async function transcribeVideoUrl(videoUrl, model = 'base') {
  const tmpVideo = path.join(tmpdir(), `video_${Date.now()}.mp4`);
  const tmpTranscript = path.join(tmpdir(), `transcript_${Date.now()}.txt`);
  
  // Download video using curl
  await new Promise((resolve, reject) => {
    const curl = spawn('curl', ['-L', '-o', tmpVideo, '--max-time', '120', videoUrl]);
    curl.on('close', (code) => code === 0 ? resolve() : reject(new Error('Download failed')));
    curl.on('error', reject);
  });

  try {
    const transcript = await transcribeVideo(tmpVideo, model);
    return transcript;
  } finally {
    // Cleanup
    try { unlinkSync(tmpVideo); } catch(e) {}
    try { unlinkSync(tmpTranscript); } catch(e) {}
  }
}

module.exports = { transcribeVideo, transcribeVideoUrl };
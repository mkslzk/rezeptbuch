const { existsSync, unlinkSync, mkdirSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { spawn } = require('child_process');
const path = require('path');

/**
 * Transcribe audio from a local video file using faster-whisper.
 * Uses a 2-step pipeline (ffmpeg → wav file → whisper file) instead of
 * piping ffmpeg stdout directly into whisper stdin, which used to crash
 * the whole Node process on EPIPE (whisper dies, ffmpeg keeps writing).
 *
 * @param {string} videoPath - Local path to video file
 * @param {string} model - 'tiny' | 'base' | 'small' | 'medium' | 'large' (default: 'small')
 * @returns {Promise<string>} Transcribed text
 */
function transcribeVideo(videoPath, model = 'small') {
  return new Promise((resolve, reject) => {
    if (!existsSync(videoPath)) return reject(new Error('Video-Datei nicht gefunden: ' + videoPath));

    const wavPath = path.join(tmpdir(), `audio_${Date.now()}.wav`);

    // Step 1: ffmpeg extracts audio to a WAV file (no piping, no EPIPE risk)
    const ffmpeg = spawn('ffmpeg', [
      '-y',                       // overwrite output
      '-i', videoPath,
      '-vn',                      // no video
      '-acodec', 'pcm_s16le',
      '-ar', '16000',             // 16kHz (whisper expects this)
      '-ac', '1',                 // mono
      wavPath
    ]);

    let ffmpegErr = '';
    ffmpeg.stderr.on('data', d => { ffmpegErr += d.toString(); });
    ffmpeg.on('error', e => reject(new Error('ffmpeg nicht verfügbar: ' + e.message)));

    ffmpeg.on('close', code => {
      if (code !== 0 || !existsSync(wavPath)) {
        try { unlinkSync(wavPath); } catch {}
        // Last useful line from ffmpeg (usually contains the real error)
        const lastLine = ffmpegErr.trim().split('\n').filter(l => l.trim()).pop() || '';
        return reject(new Error('Audio-Extraktion fehlgeschlagen: ' + (lastLine || `exit ${code}`)));
      }

      // Step 2: whisper reads the WAV file directly
      const whisper = spawn('python3', [
        '-c',
        `
import sys
import faster_whisper
# faster-whisper >=1.0: WhisperModel is a class, not a function
model = faster_whisper.WhisperModel("${model}", device="cpu", compute_type="int8")
# Auto-detect the spoken language instead of forcing German — works for
# Turkish / English / Arabic / etc. as well. The detected language is
# emitted on stdout as a marker line that Node strips and logs.
segments, info = model.transcribe("${wavPath}", task="transcribe")
print(f"__CHARLIE_LANG__:{info.language}:{info.language_probability:.3f}", flush=True)
print(' '.join(seg.text for seg in segments), flush=True)
`
      ]);

      let transcript = '';
      let whisperErr = '';
      let crashed = false;

      whisper.stdout.on('data', d => { transcript += d.toString(); });
      whisper.stderr.on('data', d => { whisperErr += d.toString(); });
      whisper.on('error', e => {
        crashed = true;
        try { unlinkSync(wavPath); } catch {}
        reject(new Error('Whisper-Fehler: ' + e.message));
      });

      whisper.on('close', wcode => {
        try { unlinkSync(wavPath); } catch {}
        if (crashed) return;
        if (wcode === 0) {
          // Strip the language-detection marker line emitted by the Python
          // helper. It always lives on its own line at the very start of
          // stdout, so we can find/remove it cheaply.
          const lines = transcript.split(/\r?\n/);
          const langLineIdx = lines.findIndex(l => l.startsWith('__CHARLIE_LANG__:'));
          if (langLineIdx >= 0) {
            const parts = lines[langLineIdx].split(':');
            const lang = parts[1] || 'unknown';
            const prob = parts[2] || '0';
            console.log(`[videoTranscriber] Whisper auto-detected language: ${lang} (confidence ${prob})`);
            lines.splice(langLineIdx, 1);
          }
          return resolve(lines.join('\n').trim());
        }
        // Surface the most informative whisper error
        const lastErr = whisperErr.trim().split('\n').filter(l => l.trim()).pop() || '';
        reject(new Error('Whisper fehlgeschlagen: ' + (lastErr || `exit ${wcode}`)));
      });
    });
  });
}

/**
 * Extract text from a video by extracting frames and running OCR (tesseract).
 * Samples frames every 3 seconds across the video duration.
 * Useful for capturing recipe ingredients/steps shown as text overlays in videos.
 *
 * @param {string} videoPath - Local path to video file
 * @returns {Promise<string>} Extracted text from frames
 */
function extractTextFromFrames(videoPath) {
  return new Promise((resolve, reject) => {
    if (!existsSync(videoPath)) return reject(new Error('Video-Datei nicht gefunden: ' + videoPath));

    const framesDir = path.join(tmpdir(), `frames_${Date.now()}`);
    mkdirSync(framesDir, { recursive: true });

    // Step 1: Get video duration
    const probe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      videoPath
    ]);

    let duration = 0;
    probe.stdout.on('data', d => { duration = parseFloat(d.toString().trim()) || 0; });
    probe.on('close', code => {
      if (code !== 0 || duration <= 0) {
        try { require('fs').rmSync(framesDir, { recursive: true }); } catch {}
        return resolve(''); // Can't get duration — skip OCR
      }

      // Step 2: Extract frames every 3 seconds
      const numFrames = Math.max(1, Math.floor(duration / 3));
      const extract = spawn('ffmpeg', [
        '-y', '-i', videoPath,
        '-vf', `fps=${numFrames / Math.max(duration, 1)}`,
        '-q:v', '3',
        path.join(framesDir, 'frame_%04d.jpg')
      ]);

      extract.on('close', code => {
        const { readdirSync, readFileSync } = require('fs');
        const files = readdirSync(framesDir).filter(f => f.endsWith('.jpg'));
        if (files.length === 0) {
          try { require('fs').rmSync(framesDir, { recursive: true }); } catch {}
          return resolve('');
        }

        // Step 3: Run tesseract on each frame
        let ocrTexts = [];
        let done = 0;
        files.forEach((file, i) => {
          const tesseract = spawn('tesseract', [
            path.join(framesDir, file),
            'stdout',
            '-l', 'deu+eng',
            '--psm', '6'
          ]);
          let output = '';
          tesseract.stdout.on('data', d => { output += d.toString(); });
          tesseract.on('close', () => {
            if (output.trim()) ocrTexts.push(output.trim());
            try { unlinkSync(path.join(framesDir, file)); } catch {}
            done++;
            if (done === files.length) {
              try { require('fs').rmSync(framesDir, { recursive: true }); } catch {}
              resolve(ocrTexts.join('\n'));
            }
          });
          tesseract.on('error', () => {
            done++;
            if (done === files.length) {
              try { require('fs').rmSync(framesDir, { recursive: true }); } catch {}
              resolve(ocrTexts.join('\n'));
            }
          });
        });
      });
    });
  });
}

/**
 * @deprecated Use extractVideoUrl (yt-dlp) + transcribeVideo directly.
 * Kept for backward compat — downloads with curl, which 403s on TikTok.
 */
async function transcribeVideoUrl(videoUrl, model = 'base') {
  const tmpVideo = path.join(tmpdir(), `video_${Date.now()}.mp4`);
  try {
    await new Promise((resolve, reject) => {
      const curl = spawn('curl', ['-L', '-o', tmpVideo, '--max-time', '120', videoUrl]);
      curl.on('close', code => code === 0 ? resolve() : reject(new Error('Download failed')));
      curl.on('error', reject);
    });
    return await transcribeVideo(tmpVideo, model);
  } finally {
    try { unlinkSync(tmpVideo); } catch {}
  }
}

module.exports = { transcribeVideo, transcribeVideoUrl, extractTextFromFrames };

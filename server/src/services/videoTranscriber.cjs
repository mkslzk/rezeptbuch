const { existsSync, unlinkSync } = require('fs');
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
segments, info = model.transcribe("${wavPath}", language="de", task="transcribe")
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
        if (wcode === 0) return resolve(transcript.trim());
        // Surface the most informative whisper error
        const lastErr = whisperErr.trim().split('\n').filter(l => l.trim()).pop() || '';
        reject(new Error('Whisper fehlgeschlagen: ' + (lastErr || `exit ${wcode}`)));
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

module.exports = { transcribeVideo, transcribeVideoUrl };

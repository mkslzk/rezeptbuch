const { spawn } = require('child_process');
const { tmpdir } = require('os');
const { existsSync, unlinkSync, statSync } = require('fs');
const path = require('path');

/**
 * Download a TikTok or Instagram Reels video + extract metadata.
 * Uses yt-dlp for everything (handles signatures, cookies, redirect chains).
 *
 * Returns:
 *   {
 *     videoPath,    // local mp4 path
 *     platform,     // 'tiktok' | 'instagram'
 *     sizeBytes,    // downloaded size
 *     description,  // post caption (often has the full recipe!)
 *     title,        // post title
 *     uploader      // account name
 *   }
 *
 * Why yt-dlp (not Playwright + curl)?
 * - TikTok serves blob: URLs that only work in-browser
 * - The real .mp4 URL is signed/short-lived and 403s on plain curl
 * - yt-dlp handles all that, plus Instagram cookies/redirects
 * - "worst[ext=mp4]/worst" picks the smallest mp4 — faster download
 *   and faster whisper transcription (we don't need HD audio)
 */
async function extractVideoUrl(url) {
  const isTikTok = url.includes('tiktok.com');
  const isInstagram = url.includes('instagram.com');
  if (!isTikTok && !isInstagram) {
    throw new Error('Unsupported URL — only TikTok and Instagram are supported');
  }

  const videoPath = path.join(tmpdir(), `video_${Date.now()}.mp4`);

  const args = [
    '--no-warnings',
    '--no-progress',
    '-f', 'worst[ext=mp4]/worst',
    '-o', videoPath,
    url
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);
    let stderr = '';
    let stdout = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('error', e => reject(new Error('yt-dlp nicht verfügbar: ' + e.message + ' — bitte `pip install yt-dlp` ausführen')));
    proc.on('close', code => {
      if (code !== 0 || !existsSync(videoPath)) {
        try { unlinkSync(videoPath); } catch {}
        const combined = (stderr || stdout).trim();
        const errLine = combined
          .split('\n')
          .reverse()
          .find(l => /ERROR|WARNING/.test(l)) || `yt-dlp Exit-Code ${code}`;
        const cleaned = errLine
          .replace(/^\[.*?\]\s*/, '')
          .replace(/^ERROR:\s*/, '')
          .replace(/^WARNING:\s*/, '');
        return reject(new Error(cleaned || 'yt-dlp fehlgeschlagen'));
      }

      let sizeBytes = 0;
      try { sizeBytes = statSync(videoPath).size; } catch {}
      if (sizeBytes < 1024) {
        try { unlinkSync(videoPath); } catch {}
        return reject(new Error('Heruntergeladene Datei ist zu klein (<1KB) — möglicherweise kein Video'));
      }

      const platform = isTikTok ? 'tiktok' : 'instagram';
      // Fetch metadata separately (lightweight, no re-download)
      fetchMetadata(url, videoPath, platform, sizeBytes)
        .then(resolve)
        .catch(err => {
          // Don't fail the whole import just because metadata fetch failed
          console.warn('yt-dlp metadata fetch failed:', err.message);
          resolve({ videoPath, platform, sizeBytes, description: '', title: '', uploader: '' });
        });
    });
  });
}

function fetchMetadata(url, videoPath, platform, sizeBytes) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', ['--no-warnings', '--dump-json', url]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', e => reject(e));
    proc.on('close', code => {
      if (code !== 0 || !stdout.trim()) return reject(new Error('keine Metadaten (exit ' + code + ')'));
      try {
        const data = JSON.parse(stdout);
        resolve({
          videoPath,
          platform,
          sizeBytes,
          description: data.description || data.title || '',
          title: data.title || '',
          uploader: data.uploader || data.uploader_id || ''
        });
      } catch (e) {
        reject(new Error('JSON-Parse-Fehler: ' + e.message));
      }
    });
  });
}

module.exports = { extractVideoUrl };

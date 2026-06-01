const { chromium } = require('playwright');

/**
 * Extract video URL from TikTok or Instagram Reels URL
 * Uses browser automation to bypass anti-bot protection
 * 
 * @param {string} url - TikTok or Instagram Reels URL
 * @returns {Object} { videoUrl, transcript (optional), platform }
 */
async function extractVideoUrl(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Try to detect platform from URL
    const isTikTok = url.includes('tiktok.com');
    const isInstagram = url.includes('instagram.com');

    let videoUrl = null;

    if (isTikTok) {
      videoUrl = await page.evaluate(() => {
        // TikTok stores video in video src attribute or in script tags
        const videoEl = document.querySelector('video');
        if (videoEl && videoEl.src) return videoEl.src;
        
        // Try to find from script data
        const scripts = document.querySelectorAll('script[id="__UNIVERSAL_DATA_FOR_REHYDRATION__"]');
        if (scripts.length > 0) {
          try {
            const data = JSON.parse(scripts[0].textContent);
            return data?.webapp?.videoDetail?.playAddr || data?.itemInfo?.itemStruct?.video?.playAddr;
          } catch(e) {}
        }
        
        // Try meta tags
        const ogVideo = document.querySelector('meta[property="og:video"]');
        if (ogVideo) return ogVideo.content;
        
        return null;
      });
    } else if (isInstagram) {
      videoUrl = await page.evaluate(() => {
        const videoEl = document.querySelector('video');
        if (videoEl && videoEl.src) return videoEl.src;
        
        // Try meta og:video
        const ogVideo = document.querySelector('meta[property="og:video"]');
        if (ogVideo) return ogVideo.content;
        
        // Try to find JSON-LD
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
          try {
            const data = JSON.parse(script.textContent);
            if (data?.video && data.video[0]?.contentUrl) {
              return data.video[0].contentUrl;
            }
          } catch(e) {}
        }
        
        return null;
      });
    }

    return { videoUrl, platform: isTikTok ? 'tiktok' : 'instagram' };
  } finally {
    await browser.close();
  }
}

module.exports = { extractVideoUrl };
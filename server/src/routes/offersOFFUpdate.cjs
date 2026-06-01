/**
 * OpenFoodFacts Update Router
 * Triggers the incremental OFF update directly in-process
 * (Docker-compatible, no external SSH)
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { runIncrementalUpdate, getProgress, isRunning, cancel } = require('../services/offUpdateService.cjs');

const REVISIONS_DIR = '/home/openclaw/.openclaw/workspace/charlie/data/openfoodfacts/revisions';
const CURRENT_FILE = '/home/openclaw/.openclaw/workspace/charlie/data/openfoodfacts/current/off_recipe_optimized.csv';
const LOG_FILE = '/home/openclaw/.openclaw/workspace/charlie/data/openfoodfacts/logs/last_run.log';
const PROGRESS_FILE = '/home/openclaw/.openclaw/workspace/charlie/data/openfoodfacts/progress.json';

/**
 * GET /api/offers/off-update/status
 */
router.get('/status', (req, res) => {
  try {
    let revisionCount = 0;
    let currentRev = null;
    let currentProducts = 0;
    let latestStats = null;

    if (fs.existsSync(REVISIONS_DIR)) {
      const revs = fs.readdirSync(REVISIONS_DIR).filter(f => f.startsWith('r')).sort().reverse();
      revisionCount = revs.length;
      if (revs.length > 0) {
        currentRev = revs[0];
        const cl = path.join(REVISIONS_DIR, currentRev, 'changelog.json');
        if (fs.existsSync(cl)) {
          latestStats = JSON.parse(fs.readFileSync(cl, 'utf8')).stats;
        }
      }
    }

    if (fs.existsSync(CURRENT_FILE)) {
      const lines = fs.readFileSync(CURRENT_FILE, 'utf8').split('\n').filter(l => l.trim());
      currentProducts = Math.max(0, lines.length - 1);
    }

    const progress = fs.existsSync(PROGRESS_FILE)
      ? JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))
      : null;

    res.json({
      status: 'ok',
      currentProducts,
      currentRevision: currentRev,
      totalRevisions: revisionCount,
      latestStats,
      progress
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/offers/off-update/progress
 * Returns live progress (polling endpoint)
 */
router.get('/progress', (req, res) => {
  try {
    if (!fs.existsSync(PROGRESS_FILE)) {
      return res.json({ running: false, progress: null });
    }
    const p = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    res.json({ running: p.status === 'running', progress: p });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/offers/off-update/trigger
 * Runs the update inline (async, doesn't block HTTP)
 */
router.post('/trigger', (req, res) => {
  const isFull = req.body.full === true;

  // Check if already running
  if (isRunning()) {
    return res.status(409).json({
      error: 'Update already in progress',
      progress: getProgress()
    });
  }

  // Return immediately, run in background
  res.json({
    success: true,
    message: 'Update started in background',
    isFull,
    checkStatus: 'GET /api/offers/off-update/status',
    checkProgress: 'GET /api/offers/off-update/progress',
    checkLogs: 'GET /api/offers/off-update/logs'
  });

  // Run async
  runIncrementalUpdate({ full: isFull }).then((result) => {
    if (result.success) {
      console.log(`[OFF] Update complete: ${JSON.stringify(result.stats)}`);
    } else {
      console.error(`[OFF] Update failed: ${result.error}`);
    }
  }).catch((err) => {
    console.error(`[OFF] Update exception: ${err.message}`);
  });
});

/**
 * GET /api/offers/off-update/logs
 */

/**
 * POST /api/offers/off-update/cancel
 * Cancel the running update
 */
router.post('/cancel', (req, res) => {
  if (!isRunning()) {
    return res.status(409).json({ error: 'No update in progress' });
  }
  cancel();
  res.json({ success: true, message: 'Cancel requested' });
});

router.get('/logs', (req, res) => {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return res.json({ logs: 'No logs yet - run an update first' });
    }
    res.json({ logs: fs.readFileSync(LOG_FILE, 'utf8') });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/offers/off-update/revisions
 */
router.get('/revisions', (req, res) => {
  try {
    if (!fs.existsSync(REVISIONS_DIR)) {
      return res.json({ revisions: [] });
    }
    const revisions = fs.readdirSync(REVISIONS_DIR)
      .filter(f => f.startsWith('r'))
      .sort()
      .reverse()
      .map(name => {
        const cl = path.join(REVISIONS_DIR, name, 'changelog.json');
        const changelog = fs.existsSync(cl) ? JSON.parse(fs.readFileSync(cl, 'utf8')) : null;
        return { name, changelog };
      });
    res.json({ revisions });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/offers/off-update/revisions/:name/changes
 * Get changes for a specific revision (paginated)
 */
router.get('/revisions/:name/changes', (req, res) => {
  try {
    const cl = path.join(REVISIONS_DIR, req.params.name, 'changelog.json');
    if (!fs.existsSync(cl)) {
      return res.status(404).json({ error: 'Revision not found' });
    }
    const changelog = JSON.parse(fs.readFileSync(cl, 'utf8'));
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '50');
    const offset = (page - 1) * limit;

    const changes = changelog.changes || [];
    const paginated = changes.slice(offset, offset + limit);

    res.json({
      revision: req.params.name,
      date: changelog.date,
      stats: changelog.stats,
      totalChanges: changes.length,
      page,
      totalPages: Math.ceil(changes.length / limit),
      changes: paginated
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
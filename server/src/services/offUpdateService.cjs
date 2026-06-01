/**
 * OpenFoodFacts Update Service
 * Spawns Python subprocess for heavy filtering (much faster than Node.js)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.OFF_DATA_DIR || '/home/openclaw/.openclaw/workspace/charlie/data/openfoodfacts';
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');
const PYTHON_SCRIPT = '/home/openclaw/.openclaw/workspace/charlie/scripts/openfoodfacts/off_update_python.py';

let currentProcess = null;

//===============================================================
function writeProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function clearProgress() {
  if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
}

function log(msg) { console.log(`[OFF Service] ${msg}`); }

//===============================================================
function runIncrementalUpdate({ full = false } = {}) {
  return new Promise((resolve, reject) => {
    log('Spawning Python OFF update...');
    clearProgress();

    const proc = spawn('python3', [PYTHON_SCRIPT], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });

    currentProcess = proc;

    proc.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    proc.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    proc.on('exit', (code) => {
      currentProcess = null;
      log(`Python process exited with code ${code}`);
    });

    proc.on('error', (err) => {
      log(`Python error: ${err.message}`);
      reject(err);
    });

    // Return immediately - progress written to progress.json
    resolve({ success: true, running: true });
  });
}

//===============================================================
function getProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch(e) { return null; }
}

function isRunning() {
  const p = getProgress();
  return p && p.status === 'running';
}

function cancel() {
  if (currentProcess) {
    log('Killing Python process...');
    currentProcess.kill('SIGKILL');
    currentProcess = null;
  }
  clearProgress();
  log('Update cancelled, progress cleared');
}

function isCancelled() {
  const p = getProgress();
  return p && p.status === 'cancelled';
}

module.exports = { runIncrementalUpdate, getProgress, isRunning, cancel, isCancelled };
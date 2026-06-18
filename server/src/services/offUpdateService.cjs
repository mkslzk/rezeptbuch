/**
 * OpenFoodFacts Update Service
 * Spawns Python subprocess for heavy filtering (much faster than Node.js)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// DATA_DIR: prefer ENV, then common project paths, then homedir
function resolveDataDir() {
  if (process.env.OFF_DATA_DIR) return process.env.OFF_DATA_DIR;
  // Try common project locations (legacy support)
  const candidates = [
    '/home/openclaw/.openclaw/workspace/charlie/data/openfoodfacts',
    '/home/openclaw/projects/rezeptbuch/data/openfoodfacts',
    path.join(os.homedir(), '.openclaw', 'data', 'openfoodfacts'),
    path.join(os.homedir(), '.local', 'share', 'moca', 'openfoodfacts')
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  // Fall back to env-style default (will be created on first use)
  return process.env.OFF_DATA_DIR || path.join(os.homedir(), '.openclaw', 'data', 'openfoodfacts');
}

const DATA_DIR = resolveDataDir();
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');
const PYTHON_SCRIPT = process.env.OFF_PYTHON_SCRIPT
  || path.join(os.homedir(), '.openclaw', 'workspace', 'charlie', 'scripts', 'openfoodfacts', 'off_update_python.py');

let currentProcess = null;

//===============================================================
// Atomic write: write to .tmp then rename. Prevents partial reads
// if a reader catches the file mid-write (race with Python process).
//===============================================================
function writeProgress(progress) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = PROGRESS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(progress, null, 2));
    fs.renameSync(tmp, PROGRESS_FILE);
  } catch (e) {
    console.warn(`[OFF Service] writeProgress failed: ${e.message}`);
  }
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
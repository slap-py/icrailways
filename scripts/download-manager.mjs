import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, '.data-download');
const stateFile = path.join(directory, 'status.json');
const logFile = path.join(directory, 'download.log');
const lock = path.join(directory, 'lock');
const command = process.argv[2] || 'status';
const read = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; } };
const alive = pid => { if (!Number.isInteger(pid) || pid < 1) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
const write = state => {
  fs.writeFileSync(`${stateFile}.tmp`, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
  fs.renameSync(`${stateFile}.tmp`, stateFile);
};
const tail = () => {
  if (!fs.existsSync(logFile)) return '';
  const fd = fs.openSync(logFile, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const buffer = Buffer.alloc(Math.min(size, 12000));
    fs.readSync(fd, buffer, 0, buffer.length, size - buffer.length);
    return buffer.toString().trim().split('\n').slice(-15).join('\n');
  } finally { fs.closeSync(fd); }
};
fs.mkdirSync(directory, { recursive: true });

if (command === 'start') {
  const state = read();
  if (alive(state.pid) && ['running', 'starting'].includes(state.status)) {
    console.log(`Download already running (PID ${state.pid}). Use npm run data:status.`);
  } else {
    // Atomic lock prevents two simultaneous starts. A fresh lock may belong to
    // a launcher that has not yet written its PID, so leave it alone briefly.
    if (fs.existsSync(lock)) {
      if (Date.now() - fs.statSync(lock).mtimeMs < 10000) {
        console.log('Downloader is starting. Use npm run data:status.');
        process.exit(0);
      }
      fs.rmdirSync(lock);
    }
    fs.mkdirSync(lock);
    const fd = fs.openSync(logFile, 'a');
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'worker'], {
      cwd: root, detached: true, stdio: ['ignore', fd, fd],
    });
    child.once('error', error => {
      write({ status: 'failed', error: error.message });
      fs.rmdirSync(lock);
      console.error(error.message);
      process.exitCode = 1;
    });
    child.once('spawn', () => {
      // The worker owns status writes; this avoids racing its completion.
      console.log(`Background downloader started (PID ${child.pid}).\nProgress: npm run data:status\nLog: ${logFile}\nYou can close this terminal and Codex. Keep the computer awake.`);
      child.unref();
    });
    fs.closeSync(fd);
  }
} else if (command === 'worker') {
  const startedAt = new Date().toISOString();
  let state = { status: 'running', pid: process.pid, startedAt, attempt: 0 };
  let child;
  let stopping = false;
  let pause;
  let resume;
  const log = message => console.log(`[${new Date().toISOString()}] ${message}`);
  const stop = () => {
    stopping = true;
    child?.kill('SIGTERM');
    clearTimeout(pause);
    resume?.();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  write(state);
  log('Starting Sweden download. Successful chunks and tiles are reused.');
  const heartbeat = setInterval(() => write(state), 10000);
  try {
    for (let attempt = 1; attempt <= 8 && !stopping; attempt++) {
      state = { ...state, attempt, phase: 'Downloading and preparing map data' };
      write(state);
      const code = await new Promise((resolve, reject) => {
        child = spawn(process.execPath, [path.join(root, 'scripts/fetch-osm.mjs')], {
          cwd: root, stdio: 'inherit',
          // Normal background jobs always publish the complete dataset.
          env: { ...process.env, ROW_RUN_VECTOR: '1', ROW_OUTPUT_FILE: '', ROW_CACHE_DIR: path.join(directory, 'cache') },
        });
        child.once('error', reject);
        child.once('exit', resolve);
      });
      child = undefined;
      if (stopping) break;
      if (code === 0) {
        state = { ...state, status: 'complete', phase: 'Ready — reload the game; rebuild dist if using preview' };
        log('COMPLETE: Sweden map published to public/data/sweden.json.');
        break;
      }
      if (attempt === 8) throw new Error('Download failed after 8 attempts. Run npm run data:download to resume from the cache.');
      const seconds = Math.min(900, 60 * 2 ** (attempt - 1));
      state = { ...state, phase: `Server/download error; retrying in ${seconds}s` };
      write(state);
      log(state.phase);
      await new Promise(resolve => { resume = resolve; pause = setTimeout(resolve, seconds * 1000); });
      resume = undefined;
    }
    if (stopping) state = { ...state, status: 'stopped', phase: 'Cached downloads retained; run npm run data:download to resume' };
  } catch (error) {
    state = { ...state, status: 'failed', error: error.message };
    log(error.stack || error.message);
  } finally {
    clearInterval(heartbeat);
    write(state);
    try { fs.rmdirSync(lock); } catch {}
  }
} else if (command === 'status') {
  const state = read();
  if (!state.status) console.log('No background download yet. Run npm run data:download.');
  else {
    const status = ['running', 'starting'].includes(state.status) && !alive(state.pid) ? 'interrupted — run npm run data:download to resume' : state.status;
    console.log(`Status: ${status}\n${state.phase || state.error || ''}\nStarted: ${state.startedAt || 'unknown'} | Attempt: ${state.attempt || 0}/8\nLast update: ${state.updatedAt}`);
    console.log(tail());
  }
} else if (command === 'stop') {
  const state = read();
  if (state.status === 'running' && alive(state.pid)) {
    // All importer subprocesses share this detached worker's process group.
    if (process.platform === 'win32') {
      const kill = spawn('taskkill', ['/pid', String(state.pid), '/T', '/F'], { stdio: 'inherit' });
      await new Promise(resolve => kill.once('exit', resolve));
      write({ ...state, status: 'stopped' });
    } else process.kill(-state.pid, 'SIGTERM');
    console.log('Stop requested. Cached downloads are retained.');
  } else console.log('No running download.');
} else {
  console.error('Use start, status, or stop.');
  process.exitCode = 1;
}

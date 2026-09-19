import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

async function fixture(job, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'row-downloader-test-'));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(new URL('./download-manager.mjs', import.meta.url), path.join(root, 'scripts/download-manager.mjs'));
  fs.writeFileSync(path.join(root, 'scripts/fetch-osm.mjs'), job);
  const command = name => execFileSync(process.execPath, [path.join(root, 'scripts/download-manager.mjs'), name], { encoding: 'utf8' });
  const state = () => { try { return JSON.parse(fs.readFileSync(path.join(root, '.data-download/status.json'), 'utf8')); } catch { return {}; } };
  const until = async predicate => {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(50); }
    throw new Error('Timed out waiting for downloader state');
  };
  try { await run({ root, command, state, until }); }
  finally {
    command('stop');
    await until(() => state().status !== 'running');
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('detached download completes and reports its log without network or an agent', async () => {
  await fixture('console.log("Fixture import finished");', async ({ command, state, until }) => {
    assert.match(command('start'), /Background downloader started/);
    await until(() => state().status === 'complete');
    assert.match(command('status'), /Fixture import finished/);
    assert.match(command('status'), /Status: complete/);
  });
});

test('duplicate starts are ignored and stop terminates the importer process group', async () => {
  await fixture('import fs from "node:fs"; process.on("SIGTERM", () => { fs.writeFileSync("terminated", "yes"); process.exit(0); }); fs.writeFileSync("ready", "yes"); setInterval(() => {}, 1000);', async ({ root, command, state, until }) => {
    command('start');
    await until(() => fs.existsSync(path.join(root, 'ready')));
    assert.match(command('start'), /already running/);
    command('stop');
    await until(() => state().status === 'stopped');
    assert.ok(fs.existsSync(path.join(root, 'terminated')));
  });
});

test('failed imports enter backoff and can be stopped and resumed', async () => {
  await fixture('process.exit(1);', async ({ root, command, state, until }) => {
    command('start');
    await until(() => state().phase?.includes('retrying'));
    command('stop');
    await until(() => state().status === 'stopped');
    fs.writeFileSync(path.join(root, 'scripts/fetch-osm.mjs'), 'console.log("Recovered");');
    command('start');
    await until(() => state().status === 'complete');
    assert.match(command('status'), /Recovered/);
  });
});

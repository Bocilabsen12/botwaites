import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

process.env.PUPPETEER_CACHE_DIR ||= '/opt/render/project/src/.cache/puppeteer';
process.env.PUPPETEER_SKIP_DOWNLOAD ||= 'false';

function findChromeFile(dir) {
  if (!fs.existsSync(dir)) return null;
  const stack = [dir];

  while (stack.length) {
    const current = stack.pop();
    let entries = [];

    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(full);
      } else if (
        entry.isFile() &&
        entry.name === 'chrome' &&
        full.includes('chrome-linux')
      ) {
        return full;
      }
    }
  }

  return null;
}

console.log('[Render Start] PUPPETEER_CACHE_DIR =', process.env.PUPPETEER_CACHE_DIR);
console.log('[Render Start] Memastikan Chrome Puppeteer terinstall...');

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const installResult = spawnSync(
  npxCommand,
  ['puppeteer', 'install', 'chrome@stable'],
  {
    stdio: 'inherit',
    env: process.env
  }
);

if (installResult.status !== 0) {
  console.error('[Render Start] Gagal install Chrome Puppeteer. Exit code:', installResult.status);
  process.exit(installResult.status || 1);
}

let executablePath = '';
try {
  executablePath = puppeteer.executablePath();
} catch {}

const foundChrome = findChromeFile(process.env.PUPPETEER_CACHE_DIR);

if (foundChrome) {
  process.env.PUPPETEER_EXECUTABLE_PATH = foundChrome;
  console.log('[Render Start] Chrome ditemukan:', foundChrome);
} else if (executablePath && fs.existsSync(executablePath)) {
  process.env.PUPPETEER_EXECUTABLE_PATH = executablePath;
  console.log('[Render Start] Chrome ditemukan via Puppeteer:', executablePath);
} else {
  console.error('[Render Start] Chrome masih tidak ditemukan.');
  console.error('[Render Start] puppeteer.executablePath() =', executablePath);
  console.error('[Render Start] Isi cache dir mungkin kosong:', process.env.PUPPETEER_CACHE_DIR);
  process.exit(1);
}

console.log('[Render Start] Menjalankan bot...');
await import('../src/index.js');

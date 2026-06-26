import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const projectCache = '/opt/render/project/src/.cache/puppeteer';
const homeCache = '/opt/render/.cache/puppeteer';

process.env.PUPPETEER_CACHE_DIR ||= projectCache;
process.env.PUPPETEER_SKIP_DOWNLOAD ||= 'false';

function findChromeFile(dir) {
  if (!dir || !fs.existsSync(dir)) return null;

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
        (full.includes('chrome-linux') || full.includes('chrome-headless-shell'))
      ) {
        return full;
      }
    }
  }

  return null;
}

function run(command, args) {
  console.log('[Render Start] RUN:', command, args.join(' '));
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env
  });

  if (result.status !== 0) {
    console.log('[Render Start] Command exit:', result.status);
  }

  return result.status === 0;
}

console.log('[Render Start] PUPPETEER_CACHE_DIR =', process.env.PUPPETEER_CACHE_DIR);

let chromePath =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  findChromeFile(projectCache) ||
  findChromeFile(homeCache) ||
  findChromeFile(process.env.PUPPETEER_CACHE_DIR);

if (!chromePath) {
  console.log('[Render Start] Chrome belum ditemukan. Install Chrome Puppeteer...');
  run('npx', ['puppeteer', 'install', 'chrome@stable']);
}

chromePath =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  findChromeFile(projectCache) ||
  findChromeFile(homeCache) ||
  findChromeFile(process.env.PUPPETEER_CACHE_DIR);

if (!chromePath) {
  console.log('[Render Start] Coba install ke cache project...');
  run('npx', ['@puppeteer/browsers', 'install', 'chrome@stable', '--path', projectCache]);
}

chromePath =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  findChromeFile(projectCache) ||
  findChromeFile(homeCache) ||
  findChromeFile(process.env.PUPPETEER_CACHE_DIR);

if (!chromePath) {
  let executablePath = '';
  try {
    executablePath = puppeteer.executablePath();
  } catch {}

  if (executablePath && fs.existsSync(executablePath)) {
    chromePath = executablePath;
  }
}

if (!chromePath) {
  console.error('[Render Start] Chrome masih tidak ditemukan.');
  console.error('[Render Start] Cek apakah build command dan env sudah benar.');
  console.error('[Render Start] projectCache:', projectCache);
  console.error('[Render Start] homeCache:', homeCache);
  process.exit(1);
}

process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
console.log('[Render Start] Chrome ditemukan:', chromePath);
console.log('[Render Start] Menjalankan bot...');

await import('../src/index.js');

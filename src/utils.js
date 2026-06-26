import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, 'data');
export const DOWNLOAD_DIR = path.join(ROOT, 'downloads');
export const IMAGE_DIR = path.join(ROOT, 'images');
export const LOG_DIR = path.join(ROOT, 'logs');

export async function initDirs() {
  await fs.ensureDir(DATA_DIR);
  await fs.ensureDir(DOWNLOAD_DIR);
  await fs.ensureDir(IMAGE_DIR);
  await fs.ensureDir(LOG_DIR);
}

export function sanitizeFileName(name = 'file') {
  return String(name)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'file';
}

export function extractUrl(text = '') {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

export function nowId() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-');
}

export function run(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: false, ...opts });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} keluar dengan code ${code}\n${stderr || stdout}`));
    });
  });
}

export async function newestFile(dir) {
  const files = await fs.readdir(dir);
  if (!files.length) return null;
  const stats = await Promise.all(
    files.map(async (f) => {
      const full = path.join(dir, f);
      const stat = await fs.stat(full);
      return { full, mtime: stat.mtimeMs, isFile: stat.isFile() };
    })
  );
  const onlyFiles = stats.filter((x) => x.isFile).sort((a, b) => b.mtime - a.mtime);
  return onlyFiles[0]?.full || null;
}

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cleanMediaUrl(url = '') {
  const u = String(url || '').trim();

  try {
    const parsed = new URL(u);

    // Bersihkan link share YouTube agar yt-dlp tidak bingung dengan parameter tracking seperti ?si=...
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '').trim();
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }

    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v) return `https://www.youtube.com/watch?v=${v}`;
    }

    return u;
  } catch {
    return u;
  }
}

function humanYtDlpError(stderr = '') {
  const s = String(stderr || '');

  if (s.includes('HTTP Error 403') || s.toLowerCase().includes('forbidden')) {
    return `yt-dlp terkena HTTP 403 Forbidden dari situs sumber.

Biasanya penyebabnya:
1. yt-dlp perlu update.
2. Link/video dibatasi dari sisi situs.
3. Video butuh login/region/umur, atau tidak bisa diakses publik.
4. Terlalu sering request dalam waktu dekat.

Coba di PowerShell:
yt-dlp --update-to nightly
yt-dlp --rm-cache-dir`;
  }

  return s || 'yt-dlp gagal tanpa pesan error.';
}

export async function downloadWithYtDlp(url, mode = 'mp3') {
  const cleanedUrl = cleanMediaUrl(url);
  const outDir = path.join(process.cwd(), 'downloads', safeTimestamp());
  ensureDir(outDir);

  const args = [
    '--no-playlist',
    '--windows-filenames',
    '--restrict-filenames',
    '--rm-cache-dir',
    '--force-ipv4',
    '--max-filesize',
    '50M',
    '-P',
    outDir
  ];

  if (mode === 'mp3') {
    args.push(
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '192K',
      '-f',
      'bestaudio/best'
    );
  } else {
    args.push(
      '-f',
      'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best',
      '--merge-output-format',
      'mp4'
    );
  }

  args.push(cleanedUrl);

  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { windowsHide: true });
    let stderr = '';

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp belum terinstall atau belum masuk PATH. Coba: winget install yt-dlp'));
      } else {
        reject(err);
      }
    });

    proc.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp keluar dengan code ${code}\n${humanYtDlpError(stderr)}`));
        return;
      }

      const files = fs.readdirSync(outDir).map((f) => path.join(outDir, f));
      if (!files.length) {
        reject(new Error('Download selesai tapi file tidak ditemukan.'));
        return;
      }

      files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
      resolve(files[0]);
    });
  });
}


function isImageFile(file = '') {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(String(file || ''));
}

function listFilesRecursive(dir) {
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

export async function downloadPhotosWithYtDlp(url) {
  const cleanedUrl = cleanMediaUrl(url);
  const outDir = path.join(process.cwd(), 'downloads', safeTimestamp());
  ensureDir(outDir);

  // Mode foto:
  // - Untuk YouTube/video: ambil thumbnail.
  // - Untuk IG/TikTok/FB photo/slideshow: yt-dlp biasanya bisa mengambil media gambar/thumbnail.
  // Catatan: hasil tergantung dukungan yt-dlp dan akses publik link tersebut.
  const args = [
    '--no-playlist',
    '--windows-filenames',
    '--restrict-filenames',
    '--rm-cache-dir',
    '--force-ipv4',
    '--write-thumbnail',
    '--convert-thumbnails',
    'jpg',
    '--skip-download',
    '-P',
    outDir,
    cleanedUrl
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args, { windowsHide: true });
    let stderr = '';

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp belum terinstall atau belum masuk PATH. Coba: winget install yt-dlp'));
      } else {
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp keluar dengan code ${code}\n${humanYtDlpError(stderr)}`));
        return;
      }

      const files = listFilesRecursive(outDir)
        .filter(isImageFile)
        .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);

      if (!files.length) {
        reject(new Error(`Foto/thumbnail tidak ditemukan.

Kemungkinan:
1. Link tidak publik / butuh login.
2. Situs membatasi download.
3. Link itu video tanpa thumbnail yang bisa diambil.
4. yt-dlp perlu update.

Coba:
yt-dlp --update-to nightly
yt-dlp --rm-cache-dir`));
        return;
      }

      resolve(files.slice(0, 10));
    });
  });
}

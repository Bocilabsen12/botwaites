import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import { DOWNLOAD_DIR, nowId } from './utils.js';

export async function stickerToPng(media) {
  if (!media?.data) throw new Error('Sticker tidak punya data media.');

  const mime = String(media.mimetype || '').toLowerCase();
  if (!mime.includes('webp')) {
    throw new Error(`Media ini bukan sticker WEBP. Mimetype: ${media.mimetype || 'tidak diketahui'}`);
  }

  const outDir = path.join(DOWNLOAD_DIR, 'sticker-to-image');
  await fs.ensureDir(outDir);

  const inputBuffer = Buffer.from(media.data, 'base64');
  const outPath = path.join(outDir, `${nowId()}-sticker.png`);

  // Untuk sticker animasi, sharp biasanya mengambil frame pertama agar menjadi foto PNG.
  await sharp(inputBuffer, { animated: false })
    .png()
    .toFile(outPath);

  return outPath;
}

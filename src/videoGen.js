import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const IMAGE_API = (process.env.IMAGE_API || 'http://127.0.0.1:7860').replace(/\/+$/, '');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function cleanBase64Image(data = '') {
  return String(data || '').replace(/^data:image\/\w+;base64,/, '');
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { windowsHide: true });
    let stderr = '';

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('ffmpeg belum terinstall atau belum masuk PATH. Install dulu: winget install -e --id Gyan.FFmpeg'));
      } else {
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg gagal dengan code ${code}\n${stderr.slice(-1600)}`));
        return;
      }
      resolve();
    });
  });
}

async function checkImageApiReady() {
  try {
    await axios.get(`${IMAGE_API}/sdapi/v1/sd-models`, { timeout: 8000 });
  } catch (err) {
    if (err?.response?.status === 404) {
      throw new Error(`Stable Diffusion API belum aktif di ${IMAGE_API}. Pastikan webui-user.bat pakai --api.`);
    }
    if (err?.code === 'ECONNREFUSED') {
      throw new Error(`Stable Diffusion belum jalan di ${IMAGE_API}. Jalankan WebUI/Forge dulu.`);
    }
    throw new Error(`Stable Diffusion API belum siap: ${err.message}`);
  }
}

async function generateFrame(prompt, outFile, frameIndex = 0, totalFrames = 1) {
  const width = Number(process.env.VIDEO_WIDTH || 512);
  const height = Number(process.env.VIDEO_HEIGHT || 512);
  const steps = Number(process.env.VIDEO_STEPS || 12);
  const cfg = Number(process.env.VIDEO_CFG || 7);
  const sampler = process.env.VIDEO_SAMPLER || process.env.IMAGE_SAMPLER || 'Euler a';

  const motionHint = totalFrames > 1
    ? `animation keyframe ${frameIndex + 1} of ${totalFrames}, subtle pose change, cinematic motion, consistent subject, consistent scene`
    : `single cinematic key visual for an animated camera move, dynamic composition, subject ready to move`;

  const payload = {
    prompt: `${prompt}, ${motionHint}, high quality, detailed, cinematic lighting`,
    negative_prompt: process.env.VIDEO_NEGATIVE || process.env.IMAGE_NEGATIVE || 'low quality, blurry, bad anatomy, watermark, text, logo, deformed, flicker, inconsistent face',
    steps,
    width,
    height,
    cfg_scale: cfg,
    sampler_name: sampler,
    seed: Number(process.env.VIDEO_SEED || -1),
    subseed: frameIndex + 1,
    subseed_strength: Number(process.env.VIDEO_SUBSEED_STRENGTH || 0.12)
  };

  const res = await axios.post(`${IMAGE_API}/sdapi/v1/txt2img`, payload, {
    timeout: Number(process.env.VIDEO_IMAGE_TIMEOUT || 300000)
  });

  const img = res.data?.images?.[0];
  if (!img) throw new Error('Stable Diffusion tidak mengembalikan frame gambar.');

  fs.writeFileSync(outFile, Buffer.from(cleanBase64Image(img), 'base64'));
}

async function makePanZoomVideo(inputImage, output) {
  const fps = Math.max(12, Math.min(Number(process.env.VIDEO_OUTPUT_FPS || 24), 30));
  const seconds = Math.max(2, Math.min(Number(process.env.VIDEO_SECONDS || 4), 10));
  const totalFrames = fps * seconds;
  const width = Number(process.env.VIDEO_WIDTH || 512);
  const height = Number(process.env.VIDEO_HEIGHT || 512);

  // Efek gerak kamera halus: zoom pelan + pan halus.
  // Ini tidak membuat karakter benar-benar bergerak, tapi hasilnya tidak kaku seperti slideshow.
  const zoomSpeed = Number(process.env.VIDEO_ZOOM_SPEED || 0.0018);
  const zoomExpr = `zoom+${zoomSpeed}`;
  const xExpr = `iw/2-(iw/zoom/2)+sin(on/18)*18`;
  const yExpr = `ih/2-(ih/zoom/2)+cos(on/22)*14`;

  await runFfmpeg([
    '-y',
    '-loop', '1',
    '-i', inputImage,
    '-vf',
    `scale=${width}:${height},zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:s=${width}x${height}:fps=${fps},format=yuv420p`,
    '-t', String(seconds),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    output
  ]);
}

async function makeMorphedVideo(framePattern, output) {
  const inputFps = Math.max(1, Math.min(Number(process.env.VIDEO_FPS || 4), 12));
  const outputFps = Math.max(12, Math.min(Number(process.env.VIDEO_OUTPUT_FPS || 24), 30));
  const width = Number(process.env.VIDEO_WIDTH || 512);
  const height = Number(process.env.VIDEO_HEIGHT || 512);

  // minterpolate mencoba membuat frame transisi agar lebih halus.
  // Kalau gerakan antar keyframe terlalu beda, hasil bisa aneh. Karena itu mode default tetap panzoom.
  await runFfmpeg([
    '-y',
    '-framerate', String(inputFps),
    '-i', framePattern,
    '-vf',
    `scale=${width}:${height},minterpolate=fps=${outputFps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,format=yuv420p`,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    output
  ]);
}

export async function generateVideoFromPrompt(prompt) {
  if (!prompt || !String(prompt).trim()) throw new Error('Prompt video kosong.');

  await checkImageApiReady();

  const mode = String(process.env.VIDEO_MOTION_MODE || 'panzoom').toLowerCase();
  const outDir = path.join(process.cwd(), 'generated-video', safeTimestamp());
  ensureDir(outDir);

  const output = path.join(outDir, `ai-luky-video-${safeTimestamp()}.mp4`);

  if (mode === 'morph' || mode === 'interpolate') {
    const frameCount = Math.max(4, Math.min(Number(process.env.VIDEO_FRAMES || 8), 24));
    for (let i = 0; i < frameCount; i++) {
      const frameName = `frame_${String(i + 1).padStart(4, '0')}.png`;
      const framePath = path.join(outDir, frameName);
      await generateFrame(String(prompt).trim(), framePath, i, frameCount);
    }
    await makeMorphedVideo(path.join(outDir, 'frame_%04d.png'), output);
    return output;
  }

  // Default: bikin 1 gambar bagus lalu kasih gerakan kamera halus.
  // Ini biasanya lebih rapi daripada gambar random disatukan.
  const keyImage = path.join(outDir, 'keyframe.png');
  await generateFrame(String(prompt).trim(), keyImage, 0, 1);
  await makePanZoomVideo(keyImage, output);
  return output;
}

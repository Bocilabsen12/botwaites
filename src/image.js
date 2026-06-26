import axios from 'axios';
import fs from 'fs';
import path from 'path';

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

function explainImageApiError(err) {
  const status = err?.response?.status;
  const url = err?.config?.url || `${IMAGE_API}/sdapi/v1/txt2img`;

  if (status === 404) {
    return `Image API 404 Not Found.

Bot sudah terhubung ke ${IMAGE_API}, tapi endpoint generate gambar tidak ditemukan:
${url}

Biasanya penyebabnya:
1. Stable Diffusion WebUI jalan tanpa --api.
2. Yang terbuka di port 7860 bukan A1111/Forge API.
3. Alamat IMAGE_API salah.
4. WebUI belum selesai loading.

Solusi:
- Buka E:\\stable-diffusion-webui-1.10.1\\webui-user.bat
- Pastikan ada:
  set COMMANDLINE_ARGS=--api
- Tutup WebUI lalu jalankan ulang:
  .\\webui-user.bat
- Tes browser:
  ${IMAGE_API}/docs
  atau
  ${IMAGE_API}/sdapi/v1/sd-models`;
  }

  if (err?.code === 'ECONNREFUSED') {
    return `Image API belum jalan di ${IMAGE_API}.

Jalankan Stable Diffusion WebUI/Forge dulu sampai muncul:
Running on local URL: ${IMAGE_API}`;
  }

  if (status) {
    return `Image API error HTTP ${status}: ${err?.response?.statusText || 'Unknown error'}`;
  }

  return err?.message || 'Gagal generate gambar.';
}

async function waitForImageApi() {
  try {
    await axios.get(`${IMAGE_API}/sdapi/v1/sd-models`, { timeout: 8000 });
    return true;
  } catch (err) {
    // Kalau /sdapi 404, cek root agar pesan error beda antara server hidup tapi API mati vs server mati.
    try {
      await axios.get(`${IMAGE_API}/`, { timeout: 8000 });
      const e = new Error(explainImageApiError(err));
      e.cause = err;
      throw e;
    } catch (rootErr) {
      if (rootErr.message?.includes('Image API 404')) throw rootErr;
      const e = new Error(explainImageApiError(err));
      e.cause = err;
      throw e;
    }
  }
}

export async function generateImage(prompt) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error('Prompt gambar kosong.');
  }

  await waitForImageApi();

  const payload = {
    prompt: String(prompt).trim(),
    negative_prompt: process.env.IMAGE_NEGATIVE || 'low quality, blurry, bad anatomy, watermark, text, logo',
    steps: Number(process.env.IMAGE_STEPS || 20),
    width: Number(process.env.IMAGE_WIDTH || 512),
    height: Number(process.env.IMAGE_HEIGHT || 512),
    cfg_scale: Number(process.env.IMAGE_CFG || 7),
    sampler_name: process.env.IMAGE_SAMPLER || 'Euler a'
  };

  try {
    const res = await axios.post(`${IMAGE_API}/sdapi/v1/txt2img`, payload, {
      timeout: Number(process.env.IMAGE_TIMEOUT || 300000)
    });

    const img = res.data?.images?.[0];
    if (!img) {
      throw new Error('Image API tidak mengembalikan gambar. Cek model/checkpoint Stable Diffusion.');
    }

    const outDir = path.join(process.cwd(), 'generated');
    ensureDir(outDir);

    const file = path.join(outDir, `ai-luky-${safeTimestamp()}.png`);
    fs.writeFileSync(file, Buffer.from(cleanBase64Image(img), 'base64'));
    return file;
  } catch (err) {
    throw new Error(explainImageApiError(err));
  }
}

export async function checkImageApi() {
  try {
    const models = await axios.get(`${IMAGE_API}/sdapi/v1/sd-models`, { timeout: 8000 });
    return {
      ok: true,
      api: IMAGE_API,
      models: Array.isArray(models.data) ? models.data.map((m) => m.model_name || m.title).filter(Boolean) : []
    };
  } catch (err) {
    return {
      ok: false,
      api: IMAGE_API,
      error: explainImageApiError(err)
    };
  }
}

import axios from 'axios';
import fs from 'fs';
import path from 'path';

const COMFY_URL = (process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/+$/, '');
const COMFY_WORKFLOW = process.env.COMFY_WORKFLOW || 'workflows/animatediff-api.json';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function randomSeed() {
  return Math.floor(Math.random() * 900000000000000) + 1000000000000;
}

function workflowFullPath() {
  return path.isAbsolute(COMFY_WORKFLOW)
    ? COMFY_WORKFLOW
    : path.join(process.cwd(), COMFY_WORKFLOW);
}

function shortData(data, max = 3000) {
  try {
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return text.length > max ? text.slice(0, max) + '\n...[dipotong]' : text;
  } catch {
    return String(data).slice(0, max);
  }
}

function saveDebugJson(name, data) {
  const dir = path.join(process.cwd(), 'logs');
  ensureDir(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  return file;
}

function makeAxiosError(err, where) {
  if (err?.response) {
    const data = err.response.data;
    saveDebugJson('comfy-last-http-error.json', {
      where,
      status: err.response.status,
      statusText: err.response.statusText,
      data,
      headers: err.response.headers,
      time: new Date().toISOString()
    });

    return new Error(
      `ComfyUI error di ${where}: HTTP ${err.response.status} ${err.response.statusText || ''}\n` +
      `Detail dari ComfyUI:\n${shortData(data)}\n\n` +
      `Detail lengkap disimpan di: E:\\lywbu-wa-ai-bot\\logs\\comfy-last-http-error.json\n` +
      `Kalau detailnya masih kosong, lihat terminal ComfyUI.`
    );
  }

  if (err?.code === 'ECONNREFUSED') {
    return new Error(`ComfyUI belum jalan di ${COMFY_URL}. Jalankan dulu: E:\\ComfyUI_windows_portable\\run_nvidia_gpu.bat`);
  }

  return new Error(`ComfyUI error di ${where}: ${err.message}`);
}

function loadWorkflow() {
  const workflowPath = workflowFullPath();

  if (!fs.existsSync(workflowPath)) {
    throw new Error(`Workflow ComfyUI belum ada.

Buat dulu file API workflow:
${workflowPath}

Caranya:
1. Buka ComfyUI http://127.0.0.1:8188
2. Pastikan workflow AnimateDiff kamu sudah bisa Run dan keluar MP4.
3. Aktifkan Dev Mode di settings.
4. Klik Save (API Format), bukan Save biasa.
5. Simpan sebagai: ${workflowPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Gagal membaca workflow JSON: ${workflowPath}\n${err.message}`);
  }

  // Workflow UI biasa punya nodes/links/last_node_id. Itu tidak bisa langsung dipakai /prompt API.
  if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.links)) {
    throw new Error(`File workflow yang kamu simpan masih format UI biasa, bukan API Format.

File sekarang berisi "nodes" dan "links".
Bot butuh API workflow yang bentuknya berisi ID node seperti:
{
  "3": { "class_type": "...", "inputs": {...} }
}

Solusi:
1. Buka ComfyUI.
2. Aktifkan Settings → Enable Dev mode Options.
3. Klik Save (API Format).
4. Simpan ulang ke:
${workflowPath}`);
  }

  return parsed;
}

function getNodes(workflow) {
  if (workflow && workflow.prompt && typeof workflow.prompt === 'object') return workflow.prompt;
  if (workflow && typeof workflow === 'object') return workflow;
  throw new Error('Format workflow tidak valid. Pastikan export workflow API dari ComfyUI.');
}

function includesAny(text = '', words = []) {
  const t = String(text || '').toLowerCase();
  return words.some((w) => t.includes(w));
}

function findNodeIds(nodes, predicate) {
  return Object.entries(nodes)
    .filter(([, node]) => predicate(node))
    .map(([id]) => id);
}

function classType(node) {
  return String(node?.class_type || '');
}

function patchWorkflow(workflow, userPrompt) {
  const nodes = getNodes(workflow);

  const positivePrompt = String(userPrompt || '').trim();
  const negativePrompt = process.env.COMFY_NEGATIVE ||
    'bad quality, blurry, watermark, text, logo, deformed, distorted, bad anatomy, ugly, flicker';

  const positiveId = process.env.COMFY_POSITIVE_NODE;
  const negativeId = process.env.COMFY_NEGATIVE_NODE;
  const latentId = process.env.COMFY_LATENT_NODE;
  const samplerId = process.env.COMFY_KSAMPLER_NODE;
  const videoId = process.env.COMFY_VIDEO_NODE;

  const clipNodes = findNodeIds(nodes, (node) =>
    includesAny(classType(node), ['cliptextencode', 'textencode'])
  );

  if (positiveId && nodes[positiveId]?.inputs) {
    nodes[positiveId].inputs.text = positivePrompt;
  } else if (clipNodes[0] && nodes[clipNodes[0]]?.inputs) {
    nodes[clipNodes[0]].inputs.text = positivePrompt;
  }

  if (negativeId && nodes[negativeId]?.inputs) {
    nodes[negativeId].inputs.text = negativePrompt;
  } else if (clipNodes[1] && nodes[clipNodes[1]]?.inputs) {
    nodes[clipNodes[1]].inputs.text = negativePrompt;
  }

  const latentNodes = latentId ? [latentId] : findNodeIds(nodes, (node) =>
    includesAny(classType(node), ['emptylatentimage', 'emptylatent'])
  );

  for (const id of latentNodes) {
    const input = nodes[id]?.inputs;
    if (!input) continue;
    if ('width' in input) input.width = Number(process.env.COMFY_WIDTH || 384);
    if ('height' in input) input.height = Number(process.env.COMFY_HEIGHT || 384);
    if ('batch_size' in input) input.batch_size = Number(process.env.COMFY_FRAMES || 16);
  }

  const samplerNodes = samplerId ? [samplerId] : findNodeIds(nodes, (node) =>
    includesAny(classType(node), ['ksampler'])
  );

  for (const id of samplerNodes) {
    const input = nodes[id]?.inputs;
    if (!input) continue;
    if ('seed' in input) input.seed = Number(process.env.COMFY_SEED || randomSeed());
    if ('steps' in input) input.steps = Number(process.env.COMFY_STEPS || 12);
    if ('cfg' in input) input.cfg = Number(process.env.COMFY_CFG || 7);
    if ('sampler_name' in input && process.env.COMFY_SAMPLER) input.sampler_name = process.env.COMFY_SAMPLER;
    if ('scheduler' in input && process.env.COMFY_SCHEDULER) input.scheduler = process.env.COMFY_SCHEDULER;
    if ('denoise' in input) input.denoise = Number(process.env.COMFY_DENOISE || 1);
  }

  const videoNodes = videoId ? [videoId] : findNodeIds(nodes, (node) =>
    includesAny(classType(node), ['videocombine', 'vhs', 'video combine'])
  );

  for (const id of videoNodes) {
    const input = nodes[id]?.inputs;
    if (!input) continue;
    if ('frame_rate' in input) input.frame_rate = Number(process.env.COMFY_FPS || 8);
    if ('fps' in input) input.fps = Number(process.env.COMFY_FPS || 8);
    if ('format' in input && process.env.COMFY_VIDEO_FORMAT) input.format = process.env.COMFY_VIDEO_FORMAT;
  }

  saveDebugJson('comfy-last-prompt.json', {
    time: new Date().toISOString(),
    workflow: workflowFullPath(),
    positivePrompt,
    patchedNodeGuess: {
      clipNodes,
      latentNodes,
      samplerNodes,
      videoNodes
    },
    prompt: nodes
  });

  return nodes;
}

async function waitForComfy() {
  try {
    await axios.get(`${COMFY_URL}/system_stats`, { timeout: 8000 });
  } catch (err) {
    throw makeAxiosError(err, '/system_stats');
  }
}

function findOutputFiles(historyData) {
  const files = [];
  const outputs = historyData?.outputs || {};

  for (const nodeOut of Object.values(outputs)) {
    for (const key of ['gifs', 'videos', 'images']) {
      const arr = nodeOut?.[key];
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (!item?.filename) continue;
        files.push({
          filename: item.filename,
          subfolder: item.subfolder || '',
          type: item.type || 'output',
          kind: key
        });
      }
    }
  }

  files.sort((a, b) => {
    const ap = /\.(mp4|webm|gif)$/i.test(a.filename) ? 0 : 1;
    const bp = /\.(mp4|webm|gif)$/i.test(b.filename) ? 0 : 1;
    return ap - bp;
  });

  return files;
}

async function downloadComfyFile(file, outDir) {
  ensureDir(outDir);
  try {
    const res = await axios.get(`${COMFY_URL}/view`, {
      params: {
        filename: file.filename,
        subfolder: file.subfolder || '',
        type: file.type || 'output'
      },
      responseType: 'arraybuffer',
      timeout: Number(process.env.COMFY_VIEW_HTTP_TIMEOUT || 180000)
    });

    const safeName = String(file.filename).replace(/[\\/:*?"<>|]/g, '_');
    const outFile = path.join(outDir, safeName);
    fs.writeFileSync(outFile, Buffer.from(res.data));
    return outFile;
  } catch (err) {
    throw makeAxiosError(err, '/view');
  }
}

export async function checkComfyStatus() {
  await waitForComfy();

  const workflowPath = workflowFullPath();
  const workflowExists = fs.existsSync(workflowPath);

  if (!workflowExists) {
    return {
      ok: false,
      url: COMFY_URL,
      workflowPath,
      workflowExists,
      error: 'Workflow API JSON belum ada.'
    };
  }

  const workflow = loadWorkflow();
  const nodes = getNodes(workflow);
  const entries = Object.entries(nodes);

  const summary = entries.map(([id, node]) => ({
    id,
    class_type: classType(node),
    input_keys: Object.keys(node?.inputs || {})
  }));

  const find = (words) => summary.filter((n) => includesAny(n.class_type, words)).map((n) => n.id);

  return {
    ok: true,
    url: COMFY_URL,
    workflowPath,
    workflowExists,
    nodeCount: entries.length,
    clipTextEncodeIds: find(['cliptextencode', 'textencode']),
    emptyLatentIds: find(['emptylatentimage', 'emptylatent']),
    ksamplerIds: find(['ksampler']),
    videoCombineIds: find(['videocombine', 'vhs']),
    firstNodes: summary.slice(0, 20)
  };
}

export async function generateComfyAnimation(userPrompt) {
  if (!userPrompt || !String(userPrompt).trim()) {
    throw new Error('Prompt animasi kosong.');
  }

  await waitForComfy();

  const workflow = loadWorkflow();
  const prompt = patchWorkflow(workflow, userPrompt);

  const clientId = `ai-luky-${Date.now()}`;

  let queue;
  try {
    queue = await axios.post(`${COMFY_URL}/prompt`, {
      prompt,
      client_id: clientId
    }, { timeout: Number(process.env.COMFY_PROMPT_HTTP_TIMEOUT || 120000) });
  } catch (err) {
    throw makeAxiosError(err, '/prompt');
  }

  const promptId = queue.data?.prompt_id;
  if (!promptId) {
    throw new Error(`ComfyUI tidak mengembalikan prompt_id. Response: ${shortData(queue.data)}`);
  }

  const timeoutMs = Number(process.env.COMFY_TIMEOUT || 900000);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, Number(process.env.COMFY_POLL_MS || 2000)));

    let history;
    try {
      history = await axios.get(`${COMFY_URL}/history/${promptId}`, { timeout: Number(process.env.COMFY_HISTORY_HTTP_TIMEOUT || 180000) });
    } catch (err) {
      throw makeAxiosError(err, `/history/${promptId}`);
    }

    const item = history.data?.[promptId];
    if (!item) continue;

    const status = item.status || {};
    const files = findOutputFiles(item);

    if (files.length) {
      const outDir = path.join(process.cwd(), 'generated-comfy', safeTimestamp());
      const outFile = await downloadComfyFile(files[0], outDir);
      return outFile;
    }

    if (status.completed === true) {
      saveDebugJson('comfy-last-history.json', item);
      throw new Error('ComfyUI selesai, tapi file output video tidak ditemukan. Pastikan workflow punya node VHS Video Combine / Save output. Detail history disimpan di logs/comfy-last-history.json');
    }

    if (String(status.status_str || '').toLowerCase().includes('error')) {
      saveDebugJson('comfy-last-history-error.json', item);
      throw new Error('ComfyUI error saat generate. Detail disimpan di logs/comfy-last-history-error.json dan terminal ComfyUI.');
    }
  }

  throw new Error(`Timeout menunggu ComfyUI selesai setelah ${Math.round(timeoutMs / 1000)} detik.`);
}

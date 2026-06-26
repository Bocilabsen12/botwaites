import 'dotenv/config';
import puppeteer from 'puppeteer';
import express from 'express';
import QRCode from 'qrcode';
import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';
import { initDirs, extractUrl } from './utils.js';
import { getMemory, addRecent, addFact, clearMemory, clearRecent, memoryToText } from './memory.js';
import { answerAI, shouldSearch, extractMemoryFact, describeImage, enhanceImagePrompt, enhanceVideoPrompt } from './ai.js';
import { webSearch, formatSearchResults } from './search.js';
import { generateImage, checkImageApi } from './image.js';
import { generateVideoFromPrompt } from './videoGen.js';
import { generateComfyAnimation, checkComfyStatus } from './comfyVideo.js';
import { downloadWithYtDlp, downloadPhotosWithYtDlp } from './media.js';
import { stickerToPng } from './stickerImage.js';
import { initLogger, logInfo, logChat, logError, getLogPaths } from './logger.js';
import { getTimeText } from './time.js';

const { Client, LocalAuth, MessageMedia } = pkg;

await initDirs();
await initLogger();

const paths = getLogPaths();
await logInfo(`Log aktif. chat.log=${paths.CHAT_LOG} error.log=${paths.ERROR_LOG}`);


let lastQR = null;
let botStatus = 'starting';
const startTime = Date.now();

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>${process.env.BOT_NAME || 'AI LUKY'} WhatsApp Bot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body { font-family: Arial, sans-serif; background:#111; color:#eee; padding:20px; }
          .card { max-width:650px; margin:auto; background:#1d1d1d; padding:22px; border-radius:16px; }
          a { color:#5aa7ff; }
          code { background:#333; padding:3px 7px; border-radius:6px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>${process.env.BOT_NAME || 'AI LUKY'} WhatsApp Bot</h2>
          <p>Status: <b>${botStatus}</b></p>
          <p>Uptime: ${Math.floor((Date.now() - startTime) / 1000)} detik</p>
          <p>Kalau belum login, buka <a href="/qr">/qr</a> untuk scan QR WhatsApp.</p>
          <p>Test command: <code>!menu</code> atau <code>!ping</code></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/qr', async (req, res) => {
  try {
    if (!lastQR) {
      return res.send(`
        <html>
          <head>
            <title>QR WhatsApp Bot</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
              body { font-family: Arial, sans-serif; background:#111; color:#eee; padding:20px; }
              .card { max-width:650px; margin:auto; background:#1d1d1d; padding:22px; border-radius:16px; }
              a { color:#5aa7ff; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>QR belum tersedia / bot sudah login</h2>
              <p>Status: <b>${botStatus}</b></p>
              <p>Kalau status masih starting, tunggu 30-60 detik lalu refresh.</p>
              <p><a href="/">Kembali ke status</a></p>
            </div>
          </body>
        </html>
      `);
    }

    const qrImage = await QRCode.toDataURL(lastQR);
    res.send(`
      <html>
        <head>
          <title>Scan QR WhatsApp Bot</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body { font-family: Arial, sans-serif; background:#111; color:#eee; padding:20px; text-align:center; }
            .card { max-width:650px; margin:auto; background:#1d1d1d; padding:22px; border-radius:16px; }
            img { width:280px; max-width:100%; background:#fff; padding:10px; border-radius:12px; }
            a { color:#5aa7ff; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Scan QR WhatsApp</h2>
            <img src="${qrImage}" />
            <p>Buka WhatsApp > Perangkat tertaut > Tautkan perangkat.</p>
            <p>Status: <b>${botStatus}</b></p>
            <p><a href="/">Kembali ke status</a></p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Gagal membuat QR: ' + err.message);
  }
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    status: botStatus,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000)
  });
});

app.listen(PORT, () => {
  console.log(`Web status aktif di port ${PORT}`);
});


const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'lywbu-ai-bot' }),
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

const lastImages = new Map();
const LAST_IMAGE_TTL_MS = 5 * 60 * 1000;

function cleanOldImages() {
  const now = Date.now();
  for (const [chatId, item] of lastImages.entries()) {
    if (!item?.time || now - item.time > LAST_IMAGE_TTL_MS) {
      lastImages.delete(chatId);
    }
  }
}

function getChatScope(msg) {
  const chatId = msg.from;
  const isGroup = String(chatId).endsWith('@g.us');

  return {
    id: `${isGroup ? 'group' : 'contact'}:${chatId}`,
    chatId,
    type: isGroup ? 'group' : 'contact',
    label: isGroup ? `Grup ${chatId}` : `Kontak ${chatId}`,
    participant: msg.author || msg.from
  };
}

function scopeText(scope) {
  return `RUANG_CHAT:
- Tipe: ${scope.type}
- ID ruang: ${scope.chatId}
- Memori dan topik untuk ruang chat ini terpisah dari grup/kontak lain.
- Jangan membawa topik dari chat/grup lain kecuali user menjelaskannya ulang.`;
}


client.on('qr', (qr) => {
  lastQR = qr;
  botStatus = 'need_scan';
  console.log('Scan QR ini pakai WhatsApp, atau buka /qr di URL Render:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  lastQR = null;
  botStatus = 'ready';
  await logInfo(`✅ ${process.env.BOT_NAME || 'AI LUKY'} sudah online`);
});

client.on('authenticated', async () => {
  botStatus = 'authenticated';
  await logInfo('✅ WhatsApp authenticated');
});

client.on('auth_failure', async (msg) => {
  botStatus = 'auth_failure';
  await logError(new Error(msg || 'Auth failure'), { event: 'auth_failure' });
});

client.on('disconnected', async (reason) => {
  botStatus = 'disconnected';
  await logError(new Error(reason || 'Disconnected'), { event: 'disconnected' });
});

process.on('unhandledRejection', async (reason) => {
  await logError(reason, { event: 'unhandledRejection' });
});

process.on('uncaughtException', async (err) => {
  await logError(err, { event: 'uncaughtException' });
});

function normalizeCommandText(text = '') {
  let t = String(text || '').trim();

  // Fix typo umum: "! video" -> "!video", "! mp3" -> "!mp3", dll.
  t = t.replace(/^!\s+([a-zA-Z0-9_]+)/, '!$1');

  // Alias Indonesia/typo ringan.
  t = t.replace(/^!vidio(\s|$)/i, '!video$1');
  t = t.replace(/^!videoai(\s|$)/i, '!vidgen$1');
  t = t.replace(/^!aivideo(\s|$)/i, '!vidgen$1');
  t = t.replace(/^!videogen(\s|$)/i, '!vidgen$1');
  t = t.replace(/^!genvideo(\s|$)/i, '!vidgen$1');
  t = t.replace(/^!animate(\s|$)/i, '!animasi$1');
  t = t.replace(/^!animation(\s|$)/i, '!animasi$1');
  t = t.replace(/^!t2v(\s|$)/i, '!animasi$1');
  t = t.replace(/^!comfyvideo(\s|$)/i, '!animasi$1');
  t = t.replace(/^!musik(\s|$)/i, '!mp3$1');
  t = t.replace(/^!lagu(\s|$)/i, '!mp3$1');
  t = t.replace(/^!gambar(\s|$)/i, '!img$1');
  t = t.replace(/^!photo(\s|$)/i, '!foto$1');
  t = t.replace(/^!thumbnail(\s|$)/i, '!thumb$1');
  t = t.replace(/^!stiker(\s|$)/i, '!sticker$1');

  return t;
}

function detectCommand(text = '') {
  const match = text.trim().match(/^!(\S+)/);
  return match ? `!${match[1].toLowerCase()}` : 'auto/chat';
}

function looksLikeBrokenMediaCommand(text = '') {
  const t = String(text || '').toLowerCase().trim();
  return /^!(video|mp3|img|gambar|sticker|stiker|s)\b/i.test(t) && !t.includes(' ');
}


function extractGenerateImagePrompt(text = '') {
  const raw = String(text || '').trim();

  if (!raw) return null;

  // Jangan tabrakan dengan analisis gambar/vision.
  const lower = raw.toLowerCase();
  const isQuestionAboutExistingImage =
    lower.includes('ini gambar apa') ||
    lower.includes('gambar ini') ||
    lower.includes('jelaskan gambar') ||
    lower.includes('lihat gambar') ||
    lower.includes('analisis gambar') ||
    lower.includes('baca screenshot') ||
    lower.includes('foto ini') ||
    lower.includes('gambar apa ini');

  if (isQuestionAboutExistingImage) return null;

  const hasGenerateVerb = /(buatkan|bikinkan|generate|buat|bikin|gambarin|desainkan|desainkan)/i.test(raw);
  const hasImageObject = /(gambar|foto|poster|ilustrasi|image|wallpaper|banner|logo)/i.test(raw);

  if (!hasGenerateVerb || !hasImageObject) return null;

  let prompt = raw
    .replace(/^!ai\s*/i, '')
    .replace(/^(tolong|coba|please)\s+/i, '')
    .replace(/^(buatkan|bikinkan|generate|buat|bikin|gambarin|desainkan|desainkan)\s+/i, '')
    .replace(/^(sebuah|satu|gambar|foto|poster|ilustrasi|image|wallpaper|banner|logo)\s+/i, '')
    .replace(/^(gambar|foto|poster|ilustrasi|image|wallpaper|banner|logo)\s+(tentang|tema|bertema)\s+/i, '')
    .trim();

  // Kalau masih diawali objek gambar, bersihkan sekali lagi.
  prompt = prompt.replace(/^(gambar|foto|poster|ilustrasi|image|wallpaper|banner|logo)\s+/i, '').trim();

  return prompt || 'gambar menarik dan jelas';
}



function extractGenerateVideoPrompt(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  const hasGenerateVerb = /(buatkan|bikinkan|generate|buat|bikin|jadikan|create)/i.test(raw);
  const hasVideoObject = /(video|vidio|film|animasi|motion|cinematic clip|short clip)/i.test(raw);

  if (!hasGenerateVerb || !hasVideoObject) return null;

  let prompt = raw
    .replace(/^!ai\s*/i, '')
    .replace(/^!(vidgen|videogen|aivideo|videoai|genvideo)\s*/i, '')
    .replace(/^(tolong|coba|please)\s+/i, '')
    .replace(/^(buatkan|bikinkan|generate|buat|bikin|jadikan|create)\s+/i, '')
    .replace(/^(sebuah|satu|video|vidio|film|animasi|motion)\s+/i, '')
    .trim();

  prompt = prompt.replace(/^(video|vidio|film|animasi|motion)\s+/i, '').trim();
  return prompt || 'cinematic short video';
}


function shouldResearchImagePrompt(prompt = '') {
  const t = String(prompt || '').toLowerCase();
  const hints = [
    'presiden', 'jokowi', 'joko widodo', 'prabowo', 'soekarno', 'soeharto',
    'artis', 'aktor', 'penyanyi', 'orang asli', 'mirip asli', 'realistis',
    'tokoh', 'public figure', 'selebriti', 'youtuber',
    'jakarta', 'indonesia', 'gedung', 'monumen', 'tempat nyata'
  ];
  return hints.some((w) => t.includes(w));
}

async function buildSmartImagePrompt(userPrompt, msg, command) {
  const useSmartPrompt = String(process.env.SMART_IMAGE_PROMPT ?? 'true').toLowerCase() !== 'false';
  if (!useSmartPrompt) return { finalPrompt: userPrompt, searched: false };

  let searchResults = [];
  let searched = false;

  if (String(process.env.IMAGE_PROMPT_SEARCH ?? 'true').toLowerCase() !== 'false' && shouldResearchImagePrompt(userPrompt)) {
    try {
      const query = `${userPrompt} visual appearance portrait reference`;
      await logInfo(`Image prompt search: ${query}`, { from: msg.from, command });
      searchResults = await webSearch(query, 5);
      searched = searchResults.length > 0;
    } catch (err) {
      await logError(err, { event: 'image prompt search gagal', from: msg.from, command, prompt: userPrompt });
    }
  }

  try {
    const finalPrompt = await enhanceImagePrompt({ userPrompt, searchResults });
    return { finalPrompt: finalPrompt || userPrompt, searched };
  } catch (err) {
    await logError(err, { event: 'enhanceImagePrompt gagal', from: msg.from, command, prompt: userPrompt });
    return { finalPrompt: userPrompt, searched };
  }
}



function shouldResearchVideoPrompt(prompt = '') {
  const t = String(prompt || '').toLowerCase();

  // Search hanya untuk prompt yang memang butuh referensi spesifik/real-world.
  const keywords = [
    'mirip', 'realistis', 'realistic', 'tokoh', 'public figure', 'orang asli',
    'presiden', 'jokowi', 'joko widodo', 'prabowo', 'soekarno', 'soeharto',
    'artis', 'aktor', 'aktris', 'penyanyi', 'youtuber', 'selebriti',
    'anime', 'karakter', 'game', 'genshin', 'naruto', 'one piece',
    'lamborghini', 'ferrari', 'bugatti', 'supra', 'skyline', 'tesla',
    'bmw', 'mercedes', 'avanza', 'fortuner', 'civic', 'brio',
    'jakarta', 'indonesia', 'tokyo', 'jepang', 'japan', 'shibuya',
    'monas', 'gedung', 'tempat nyata', 'landmark', 'city', 'kota',
    'baju adat', 'seragam', 'militer', 'robot', 'spacex', 'nasa',
    'rtx', 'nvidia', 'iphone', 'samsung', 'produk'
  ];

  if (keywords.some((w) => t.includes(w))) return true;

  // Untuk prompt generik seperti "mobil", "truk", "orang berjalan", tidak perlu search.
  return false;
}

function buildVideoSearchQuery(prompt = '') {
  const raw = String(prompt || '').trim();
  const t = raw.toLowerCase();

  if (t.includes('jokowi') || t.includes('joko widodo')) {
    return 'Joko Widodo visual appearance portrait reference';
  }
  if (t.includes('prabowo')) {
    return 'Prabowo Subianto visual appearance portrait reference';
  }
  if (t.includes('jakarta') || t.includes('monas')) {
    return `${raw} Jakarta landmark visual reference`;
  }
  if (t.includes('lamborghini') || t.includes('ferrari') || t.includes('tesla') || t.includes('supra') || t.includes('skyline')) {
    return `${raw} car model visual reference`;
  }

  return `${raw} visual reference`;
}


async function buildSmartVideoPrompt(userPrompt, msg, command) {
  const useSmartPrompt = String(process.env.SMART_VIDEO_PROMPT ?? 'true').toLowerCase() !== 'false';
  if (!useSmartPrompt) return { finalPrompt: userPrompt, searched: false };

  let searchResults = [];
  let searched = false;

  const searchEnabled = String(process.env.VIDEO_PROMPT_SEARCH ?? 'true').toLowerCase() !== 'false';

  if (searchEnabled && shouldResearchVideoPrompt(userPrompt)) {
    try {
      const query = buildVideoSearchQuery(userPrompt);
      await logInfo(`Video/animasi prompt search: ${query}`, { from: msg.from, command });
      searchResults = await webSearch(query, 6);
      searched = searchResults.length > 0;
    } catch (err) {
      await logError(err, { event: 'video prompt search gagal', from: msg.from, command, prompt: userPrompt });
    }
  }

  try {
    const finalPrompt = await enhanceVideoPrompt({ userPrompt, searchResults });
    return { finalPrompt: finalPrompt || userPrompt, searched };
  } catch (err) {
    await logError(err, { event: 'enhanceVideoPrompt gagal', from: msg.from, command, prompt: userPrompt });
    return { finalPrompt: userPrompt, searched };
  }
}


async function replyLog(msg, body, command = '') {
  await logChat('out', { to: msg.from, body, command });
  return msg.reply(body);
}

async function sendLog(to, content, options = {}, meta = {}) {
  await logChat('out', {
    to,
    body: meta.body || meta.caption || options.caption || '[media/file]',
    command: meta.command || '',
    hasMedia: Boolean(meta.hasMedia)
  });
  return client.sendMessage(to, content, options);
}

async function downloadImageMedia(candidate) {
  if (!candidate?.hasMedia) return null;

  try {
    const media = await candidate.downloadMedia();

    const type = String(candidate.type || '').toLowerCase();
    const rawMime =
      media?.mimetype ||
      candidate._data?.mimetype ||
      '';

    const mime = String(rawMime || '').toLowerCase();

    await logInfo('Media terdeteksi dari WhatsApp', {
      from: candidate.from,
      type,
      mime: mime || 'unknown',
      hasData: Boolean(media?.data),
      body: candidate.body || ''
    });

    if (!media?.data) return null;

    // Terima foto langsung, gambar dari caption, gambar reply, dan gambar yang terkirim sebagai document.
    // Sticker tetap tidak masuk vision otomatis karena sudah ada fitur !img untuk ubah sticker jadi foto.
    const isSticker = type === 'sticker';
    const isImageByMime = mime.startsWith('image/');
    const isImageByType = type === 'image' || type === 'document';

    if (isSticker) return null;
    if (!isImageByMime && !isImageByType) return null;

    return {
      base64: media.data,
      mimetype: mime || 'image/unknown',
      sourceType: type || 'unknown'
    };
  } catch (err) {
    await logError(err, {
      event: 'downloadImageMedia gagal',
      type: candidate?.type,
      hasMedia: candidate?.hasMedia,
      body: candidate?.body || ''
    });
    return null;
  }
}

async function getImagePayloadFromMessage(msg) {
  // 1. Cek gambar yang dikirim langsung dengan caption pertanyaan.
  const direct = await downloadImageMedia(msg);
  if (direct) return direct;

  // 2. Cek gambar yang di-reply.
  if (msg.hasQuotedMsg) {
    try {
      const quoted = await msg.getQuotedMessage();
      const quotedPayload = await downloadImageMedia(quoted);
      if (quotedPayload) return quotedPayload;
    } catch (err) {
      await logError(err, { event: 'getQuotedMessage gagal untuk vision' });
    }
  }

  return null;
}

function saveLastImage(chatId, payload) {
  if (!payload?.base64) return;
  cleanOldImages();
  lastImages.set(chatId, {
    ...payload,
    time: Date.now()
  });
}

function getLastImage(chatId) {
  cleanOldImages();
  const payload = lastImages.get(chatId);
  if (!payload) return null;
  if (Date.now() - payload.time > LAST_IMAGE_TTL_MS) {
    lastImages.delete(chatId);
    return null;
  }
  return payload;
}

function hasMentionText(text = '') {
  // Di grup WhatsApp, tag orang biasanya muncul sebagai @628xxx atau @nama.
  // Jangan jadikan pesan mention sebagai pertanyaan gambar otomatis.
  return /(^|\s)@\S+/i.test(String(text || ''));
}

function looksLikeImageQuestion(text = '') {
  const raw = String(text || '');
  const t = raw.toLowerCase().trim();

  // Anti-spam grup: kalau chat berisi tag @orang, jangan pakai gambar cache otomatis.
  // Tetap bisa lihat gambar jika user reply/kirim gambar dengan command !lihat / !ai.
  if (hasMentionText(t)) return false;

  // Kata/kalimat yang jelas mengarah ke gambar/foto/screenshot.
  return (
    t.includes('gambar') ||
    t.includes('foto') ||
    t.includes('photo') ||
    t.includes('screenshot') ||
    t.includes('ss') ||
    t.includes('stiker') ||
    t.includes('sticker') ||
    t.includes('ini gambar') ||
    t.includes('gambar ini') ||
    t.includes('ini foto') ||
    t.includes('foto ini') ||
    t.includes('apa ini') ||
    t.includes('ini apa') ||
    t.includes('jelaskan ini') ||
    t.includes('jelasin ini') ||
    t.includes('lihat ini') ||
    t.includes('baca ini') ||
    t.includes('teks ini') ||
    t.includes('ocr') ||
    t.includes('error ini') ||
    t.includes('kenapa ini')
  );
}
function looksLikeFaceRatingQuestion(text = '') {
  const t = String(text || '').toLowerCase();
  const ratingWords = ['rating', 'rate', 'nilai', 'nilainya', 'skor', 'score', '/10', 'dari 10', 'berapa'];
  const faceWords = ['muka', 'wajah', 'ganteng', 'cantik', 'jelek', 'tampan', 'cakep', 'foto orang', 'penampilan'];
  return ratingWords.some((w) => t.includes(w)) && faceWords.some((w) => t.includes(w));
}

function looksLikePersonPhotoQuestion(text = '') {
  const t = String(text || '').toLowerCase();
  const words = ['muka', 'wajah', 'foto orang', 'orang ini', 'penampilan', 'ganteng', 'cantik', 'tampan', 'cakep'];
  return words.some((w) => t.includes(w));
}

function improveVisionPromptForPeople(prompt = '') {
  const p = String(prompt || '').trim();

  if (looksLikeFaceRatingQuestion(p)) {
    return `${p}

Instruksi tambahan:
User meminta rating foto wajah/orang. Jangan menjawab default 7/10.
Nilai harus subjektif berdasarkan yang benar-benar terlihat di foto: lighting, angle, ekspresi, framing, grooming/kerapian, ketajaman/kualitas foto.
Jawab format:
Menurut foto ini: X/10
Alasan:
1. ...
2. ...
3. ...
Kalau foto kurang jelas, berikan rentang atau bilang tidak yakin. Jangan menghina fisik orang.`;
  }

  if (looksLikePersonPhotoQuestion(p)) {
    return `${p}

Instruksi tambahan:
Jika membahas wajah/orang, jangan memberi rating angka kecuali diminta.
Jelaskan objektif apa yang terlihat dan beri saran foto yang membantu, seperti lighting, angle, ekspresi, framing, dan kualitas foto.`;
  }

  return p;
}


async function answerImageQuestion(msg, imagePayload, prompt, command = 'vision') {
  const scope = getChatScope(msg);
  await replyLog(msg, '👀 Aku sedang melihat gambar...', command);

  if (!imagePayload?.base64) {
    throw new Error('Gambar tidak bisa diunduh dari WhatsApp. Coba kirim ulang gambarnya, jangan view-once.');
  }

  await logInfo('Analisis gambar dengan vision model', {
    from: msg.from,
    command,
    model: process.env.VISION_MODEL || 'default',
    mime: imagePayload.mimetype || 'unknown',
    sourceType: imagePayload.sourceType || 'unknown',
    prompt
  });

  const finalVisionPrompt = improveVisionPromptForPeople(prompt || 'Jelaskan gambar ini secara jelas dalam bahasa Indonesia.');

  const ans = await describeImage({
    base64: imagePayload.base64,
    prompt: finalVisionPrompt,
    scopeContext: scopeText(scope)
  });

  await replyLog(msg, ans.slice(0, 3500), command);
  await addRecent(msg.from, 'assistant', ans);
}


client.on('message', async (msg) => {
  const text = normalizeCommandText((msg.body || '').trim());
  const scope = getChatScope(msg);
  const userId = scope.id;
  const command = detectCommand(text);

  try {
    const acceptFromMe = String(process.env.DEBUG_ACCEPT_FROM_ME).toLowerCase() === 'true';
    if (msg.fromMe && !acceptFromMe) {
      await logInfo('Pesan diabaikan karena fromMe=true. Kirim tes dari nomor WhatsApp lain, bukan dari nomor yang login sebagai bot.', {
        from: msg.from,
        body: text || '[media]',
        command,
        hasMedia: msg.hasMedia,
        type: msg.type,
        fromMe: msg.fromMe
      });
      return;
    }

    await logChat('in', {
      from: msg.from,
      body: text || '[media]',
      command,
      hasMedia: msg.hasMedia,
      type: msg.type,
      fromMe: msg.fromMe,
      scopeId: userId,
      scopeType: scope.type,
      participant: scope.participant
    });

    const autoReply = String(process.env.AUTO_REPLY).toLowerCase() === 'true';

    if (!text && !msg.hasMedia) return;

    // Ambil gambar langsung/reply dulu. Ini penting untuk foto yang dikirim dengan caption pertanyaan.
    const imagePayload = await getImagePayloadFromMessage(msg);
    if (imagePayload) {
      saveLastImage(userId, imagePayload);
      await logInfo('Gambar disimpan sementara untuk vision', {
        from: msg.from,
        command,
        mime: imagePayload.mimetype,
        type: imagePayload.sourceType,
        text
      });
    }

    // Kalau user kirim gambar biasa tanpa caption/perintah, jangan dibalas agar tidak spam.
    // Gambar tetap disimpan sementara di cache, jadi user masih bisa tanya setelahnya: "ini gambar apa?"
    if (!text && imagePayload) {
      await logInfo('Gambar tanpa caption disimpan diam-diam, tidak dibalas agar tidak spam', {
        from: msg.from,
        command,
        mime: imagePayload.mimetype,
        type: imagePayload.sourceType
      });
      return;
    }

    // Vision anti-spam:
    // - Kalau pesan ini memang membawa gambar/reply gambar + caption, langsung analisis.
    // - Kalau hanya memakai gambar terakhir dari cache, analisis hanya kalau teksnya jelas tanya gambar.
    // - Chat biasa seperti "hai", "apa kabar", "buatkan kode" tidak akan masuk vision.
    const isVisionCommand = /^!(lihat|ai)(\s|$)/i.test(text);
    const isKnownNonVisionCommand = /^!(menu|help|remember|clear|clearobrolan|resetobrolan|memori|scope|ruang|search|img|promptimg|mp3|video|sticker|s|cekmedia|cekimg|jam|waktu|tanggal)(\s|$)/i.test(text);
    const isUnknownCommand = text && text.startsWith('!') && !isKnownNonVisionCommand;
    const hasImageInThisMessage = Boolean(imagePayload);
    const hasMention = hasMentionText(text);

    // Fix grup:
    // Kalau user sedang reply chat teks orang lain, jangan pakai cache gambar terakhir.
    // Cache gambar hanya dipakai kalau user bertanya di pesan biasa, bukan sedang reply pesan lain.
    const isReplyingToAnyMessage = Boolean(msg.hasQuotedMsg);
    const canUseImageCache = !isReplyingToAnyMessage;
    const cachedImage = canUseImageCache ? getLastImage(userId) : null;
    const hasCachedImageQuestion = !hasMention && looksLikeImageQuestion(text) && Boolean(cachedImage);

    const shouldUseVision =
      // Kalau pesan/reply ini benar-benar membawa gambar, baru boleh vision.
      (hasImageInThisMessage && !hasMention && (isVisionCommand || isUnknownCommand || looksLikeImageQuestion(text))) ||
      // Command vision eksplisit boleh jika ada gambar di pesan/reply, atau cache hanya jika tidak sedang reply chat teks.
      (isVisionCommand && (hasImageInThisMessage || hasCachedImageQuestion)) ||
      // Pakai cache gambar terakhir hanya kalau tidak sedang reply chat teks.
      (!text.startsWith('!') && hasCachedImageQuestion);

    if (shouldUseVision) {
      const visionImage = imagePayload || cachedImage;
      if (visionImage) {
        const prompt = text
          .replace(/^!lihat\s*/i, '')
          .replace(/^!ai\s*/i, '')
          .replace(/^!/, '')
          .trim() || 'Jelaskan gambar ini secara jelas dalam bahasa Indonesia.';
        await answerImageQuestion(msg, visionImage, prompt, isVisionCommand ? command : 'auto-image');
        return;
      }
    }

    if (!text.startsWith('!') && !autoReply) return;

    await addRecent(userId, 'user', text || '[media]');

    if (text === '!cekmedia') {
      let quotedInfo = null;
      if (msg.hasQuotedMsg) {
        try {
          const quoted = await msg.getQuotedMessage();
          quotedInfo = {
            hasMedia: quoted.hasMedia,
            type: quoted.type,
            mimetype: quoted._data?.mimetype || null,
            body: quoted.body || '',
            fromMe: quoted.fromMe
          };
        } catch (err) {
          quotedInfo = { error: err.message };
        }
      }

      const info = {
        hasMedia: msg.hasMedia,
        type: msg.type,
        mimetype: msg._data?.mimetype || null,
        body: msg.body || '',
        fromMe: msg.fromMe,
        hasQuotedMsg: msg.hasQuotedMsg,
        quoted: quotedInfo
      };

      await logInfo('CEKMEDIA', info);
      await replyLog(msg, `*CEK MEDIA*
hasMedia: ${info.hasMedia}
type: ${info.type}
mimetype: ${info.mimetype || '-'}
fromMe: ${info.fromMe}
hasQuotedMsg: ${info.hasQuotedMsg}

quoted.hasMedia: ${quotedInfo?.hasMedia ?? '-'}
quoted.type: ${quotedInfo?.type ?? '-'}
quoted.mimetype: ${quotedInfo?.mimetype ?? '-'}

Kalau hasMedia=false, bot memang belum menerima gambarnya sebagai media. Coba kirim dari nomor lain atau reply foto lalu ketik !cekmedia.`, command);
      return;
    }

    if (text === '!cekimg' || text === '!cekgambar') {
      const status = await checkImageApi();
      if (status.ok) {
        await replyLog(msg, `✅ Image API aktif
API: ${status.api}
Model terdeteksi: ${status.models.length ? status.models.slice(0, 5).join(', ') : 'ada, tapi nama model kosong'}

Sekarang coba:
!ai buatkan gambar mobil sport merah`, command);
      } else {
        await replyLog(msg, `❌ Image API belum siap
API: ${status.api}

${status.error}`, command);
      }
      return;
    }

    if (text === '!scope' || text === '!ruang') {
      await replyLog(msg, `*Ruang chat aktif*
Tipe: ${scope.type}
Memori key: ${userId}
Chat ID: ${scope.chatId}
Participant: ${scope.participant}

Memori/topik di ruang ini terpisah dari grup/kontak lain.`, command);
      return;
    }

    if (text === '!jam' || text === '!waktu' || text === '!tanggal') {
      await replyLog(msg, getTimeText(), command);
      return;
    }

    if (text === '!menu' || text === '!help') {
      await replyLog(msg, menuText(), command);
      return;
    }

    if (text.startsWith('!remember ')) {
      const fact = text.replace('!remember ', '').trim();
      await addFact(userId, fact);
      await replyLog(msg, '✅ Aku simpan ke memori.', command);
      return;
    }

    if (text === '!clear') {
      await clearMemory(userId);
      await replyLog(msg, '✅ Memori chat kamu sudah dibersihkan.', command);
      return;
    }

    if (text === '!naturalreset') {
      await clearRecent(userId);
      lastImages.delete(userId);
      await replyLog(msg, '✅ Mode natural direset. Konteks obrolan dan cache gambar ruang ini sudah dibersihkan.', command);
      return;
    }

    if (text === '!clearobrolan' || text === '!resetobrolan') {
      await clearRecent(userId);
      await replyLog(msg, '✅ Konteks obrolan terakhir sudah aku reset. Memori permanen tetap aman.', command);
      return;
    }

    if (text === '!memori') {
      const memory = await getMemory(userId);
      await replyLog(msg, memoryToText(memory).slice(0, 3500), command);
      return;
    }

    if (text === '!cleargambar' || text === '!clearimage') {
      lastImages.delete(userId);
      await replyLog(msg, '✅ Cache gambar terakhir sudah aku hapus.', command);
      return;
    }

    if (text.startsWith('!search ')) {
      const query = text.replace('!search ', '').trim();
      await logInfo(`Search manual: ${query}`, { from: msg.from, command });
      const results = await webSearch(query, 5);
      await replyLog(msg, formatSearchResults(results).slice(0, 3500), command);
      return;
    }

    if (text.startsWith('!promptimg ')) {
      const rawPrompt = text.replace('!promptimg ', '').trim();
      if (!rawPrompt) {
        await replyLog(msg, 'Kirim format: !promptimg <prompt gambar>', command);
        return;
      }
      await replyLog(msg, '🧠 Aku sedang membuat prompt gambar yang lebih detail...', command);
      const smart = await buildSmartImagePrompt(rawPrompt, msg, command);
      await replyLog(msg, `*Prompt gambar final:*
${smart.finalPrompt}

Search internet: ${smart.searched ? 'aktif/dipakai' : 'tidak dipakai'}`, command);
      return;
    }

    if (/^!img(\s|$)/i.test(text)) {
      const prompt = text.replace(/^!img\s*/i, '').trim();

      let target = msg;
      if (!target.hasMedia && msg.hasQuotedMsg) {
        const quoted = await msg.getQuotedMessage();
        if (quoted.hasMedia) target = quoted;
      }

      const isStickerMedia = target.hasMedia && (
        target.type === 'sticker' ||
        String(target._data?.type || '').toLowerCase() === 'sticker' ||
        String(target._data?.mimetype || '').toLowerCase().includes('webp')
      );

      // Mode 1: reply/kirim sticker dengan command !img = ubah sticker jadi foto PNG
      if (!prompt && isStickerMedia) {
        await replyLog(msg, '🖼️ Sticker sedang diubah jadi foto...', command);
        await logInfo('Convert sticker ke foto PNG', { from: msg.from, command });
        const stickerMedia = await target.downloadMedia();
        const file = await stickerToPng(stickerMedia);
        const imageMedia = MessageMedia.fromFilePath(file);
        await sendLog(msg.from, imageMedia, { caption: '✅ Sticker berhasil diubah jadi foto.' }, {
          command,
          hasMedia: true,
          caption: 'Sticker berhasil diubah jadi foto.'
        });
        return;
      }

      // Mode 2: !img <prompt> = generate gambar AI
      if (prompt) {
        await replyLog(msg, '🎨 Gambar sedang dibuat... aku rapikan prompt dulu biar hasilnya lebih jelas.', command);
        const smart = await buildSmartImagePrompt(prompt, msg, command);
        await logInfo(`Generate image smart prompt`, {
          from: msg.from,
          command,
          originalPrompt: prompt,
          finalPrompt: smart.finalPrompt,
          searched: smart.searched
        });
        const file = await generateImage(smart.finalPrompt);
        const media = MessageMedia.fromFilePath(file);
        const caption = `Hasil gambar: ${prompt}`;
        await sendLog(msg.from, media, { caption }, { command, hasMedia: true, caption });
        return;
      }

      await replyLog(msg, 'Kirim format: !img <prompt> untuk generate gambar, atau reply sticker dengan !img untuk ubah sticker jadi foto.', command);
      return;
    }

    if (text.startsWith('!promptanimasi ')) {
      const prompt = text.replace(/^!promptanimasi\s*/i, '').trim();
      if (!prompt) {
        await replyLog(msg, 'Kirim format: !promptanimasi <prompt animasi>', command);
        return;
      }
      const smart = await buildSmartVideoPrompt(prompt, msg, command);
      await replyLog(msg, `Prompt animasi final:\n${smart.finalPrompt}`, command);
      return;
    }

    if (text === '!comfycek' || text === '!cekcomfy') {
      const s = await checkComfyStatus();
      if (!s.ok) {
        await replyLog(msg, `❌ ComfyUI belum siap.\nURL: ${s.url}\nWorkflow: ${s.workflowPath}\nMasalah: ${s.error}`, command);
        return;
      }

      const lines = [
        '✅ ComfyUI kebaca.',
        `URL: ${s.url}`,
        `Workflow: ${s.workflowPath}`,
        `Jumlah node: ${s.nodeCount}`,
        `CLIPTextEncode: ${s.clipTextEncodeIds.join(', ') || '-'}`,
        `EmptyLatentImage: ${s.emptyLatentIds.join(', ') || '-'}`,
        `KSampler: ${s.ksamplerIds.join(', ') || '-'}`,
        `VideoCombine/VHS: ${s.videoCombineIds.join(', ') || '-'}`,
        '',
        'Kalau !animasi masih error, kirim isi logs/comfy-last-http-error.json dan terminal ComfyUI.'
      ];
      await replyLog(msg, lines.join('\n'), command);
      return;
    }

    if (/^!(animasi|animate|animation|t2v|comfyvideo)(\s|$)/i.test(text)) {
      const prompt = text.replace(/^!(animasi|animate|animation|t2v|comfyvideo)\s*/i, '').trim();
      if (!prompt) {
        await replyLog(msg, 'Kirim format: !animasi <prompt>\nContoh: !animasi mobil besar melaju kencang di jalan tol malam hari', command);
        return;
      }

      await replyLog(msg, '🎬 ANIMASI SEDANG DI GENERATE, MOHON TUNGGU...', command);
      const smart = await buildSmartVideoPrompt(prompt, msg, command);
      await logInfo('Generate animasi ComfyUI', {
        from: msg.from,
        command,
        originalPrompt: prompt,
        finalPrompt: smart.finalPrompt,
        searched: smart.searched
      });

      const file = await generateComfyAnimation(smart.finalPrompt);
      const media = MessageMedia.fromFilePath(file);
      const caption = `Hasil animasi: ${prompt}`;
      await sendLog(msg.from, media, { caption }, { command, hasMedia: true, caption });
      await addRecent(userId, 'assistant', `[animasi ComfyUI dibuat] ${prompt}`);
      return;
    }

    if (/^!(vidgen|videoai|aivideo|videogen|genvideo)(\s|$)/i.test(text)) {
      const prompt = text.replace(/^!(vidgen|videoai|aivideo|videogen|genvideo)\s*/i, '').trim();
      if (!prompt) {
        await replyLog(msg, 'Kirim format: !vidgen <prompt video>\nContoh: !vidgen mobil sport merah melaju di jalan malam', command);
        return;
      }

      await replyLog(msg, '🎞️ Oke, aku sedang membuat video pendek... ini bisa agak lama.', command);
      const smart = await buildSmartVideoPrompt(prompt, msg, command);
      await logInfo('Generate video smart prompt', {
        from: msg.from,
        command,
        originalPrompt: prompt,
        finalPrompt: smart.finalPrompt,
        searched: smart.searched
      });

      const file = await generateVideoFromPrompt(smart.finalPrompt);
      const media = MessageMedia.fromFilePath(file);
      const caption = `Hasil video: ${prompt}`;
      await sendLog(msg.from, media, { caption }, { command, hasMedia: true, caption });
      await addRecent(userId, 'assistant', `[video dibuat] ${prompt}`);
      return;
    }

    if (text.startsWith('!foto ') || text.startsWith('!photo ') || text.startsWith('!thumb ') || text.startsWith('!thumbnail ')) {
      const url = extractUrl(text);
      if (!url) return replyLog(msg, 'Kirim format: !foto <url>\nContoh: !foto https://vt.tiktok.com/...', command);

      await replyLog(msg, '🖼️ Mengambil foto/thumbnail... pakai hanya untuk konten milik sendiri/berizin.', command);
      await logInfo(`Download foto/thumbnail: ${url}`, { from: msg.from, command });

      const files = await downloadPhotosWithYtDlp(url);
      const maxSend = Math.min(files.length, 5);

      for (let i = 0; i < maxSend; i++) {
        const media = MessageMedia.fromFilePath(files[i]);
        await sendLog(msg.from, media, {
          caption: i === 0 ? `Foto/thumbnail dari link.` : undefined
        }, {
          command,
          hasMedia: true,
          caption: `Foto/thumbnail ${i + 1}/${maxSend}`
        });
      }

      if (files.length > maxSend) {
        await replyLog(msg, `✅ Ditemukan ${files.length} gambar, aku kirim ${maxSend} pertama supaya tidak spam.`, command);
      }
      return;
    }

    if (text.startsWith('!mp3 ')) {
      const url = extractUrl(text);
      if (!url) return replyLog(msg, 'Kirim format: !mp3 <url>', command);
      await replyLog(msg, '🎵 Mengambil audio... pakai hanya untuk konten milik sendiri/berizin.', command);
      await logInfo(`Download MP3: ${url}`, { from: msg.from, command });
      const file = await downloadWithYtDlp(url, 'mp3');
      const media = MessageMedia.fromFilePath(file);
      await sendLog(msg.from, media, { sendAudioAsVoice: false }, { command, hasMedia: true, body: `MP3: ${file}` });
      return;
    }

    if (text.startsWith('!video ')) {
      const url = extractUrl(text);
      if (!url) return replyLog(msg, 'Kirim format: !video <url>', command);
      await replyLog(msg, '🎬 Mengambil video... pakai hanya untuk konten milik sendiri/berizin.', command);
      await logInfo(`Download video: ${url}`, { from: msg.from, command });
      const file = await downloadWithYtDlp(url, 'video');
      const media = MessageMedia.fromFilePath(file);
      await sendLog(msg.from, media, { caption: 'Ini videonya.' }, { command, hasMedia: true, caption: 'Ini videonya.' });
      return;
    }

    if (/^!(sticker|s)(\s|$)/i.test(text)) {
      let target = msg;
      if (!target.hasMedia && msg.hasQuotedMsg) {
        const quoted = await msg.getQuotedMessage();
        if (quoted.hasMedia) target = quoted;
      }
      if (!target.hasMedia) {
        await replyLog(msg, 'Kirim/reply foto, GIF, atau video pendek dengan caption !sticker', command);
        return;
      }
      const quotedId = target?.id?._serialized || null;
      await logInfo('Membuat sticker', { from: msg.from, command, quoted: quotedId });
      const media = await target.downloadMedia();
      await sendLog(msg.from, media, {
        sendMediaAsSticker: true,
        stickerAuthor: process.env.STICKER_AUTHOR || 'AI LUKY',
        stickerName: process.env.STICKER_NAME || 'AI LUKY'
      }, { command, hasMedia: true, body: '[sticker]' });
      return;
    }

    if (text.startsWith('!lihat')) {
      const imagePayload = await getImagePayloadFromMessage(msg) || (!msg.hasQuotedMsg ? getLastImage(userId) : null);
      if (!imagePayload) {
        await replyLog(msg, 'Kirim/reply gambar dengan caption !lihat <pertanyaan opsional>. Kalau sedang reply chat teks, aku tidak akan memakai cache gambar lama.', command);
        return;
      }
      const prompt = text.replace('!lihat', '').trim() || 'Jelaskan gambar ini dan beri solusi jika ada error.';
      await answerImageQuestion(msg, imagePayload, prompt, command);
      return;
    }

    // Chat AI biasa: !ai <pesan> atau auto-reply kalau AUTO_REPLY=true
    const userText = text.startsWith('!ai ') ? text.replace('!ai ', '').trim() : text;
    if (!userText) return;

    // Kalau user menyuruh generate video lewat chat AI, langsung buat video pendek dan kirim ke WhatsApp.
    const autoVideoPrompt = extractGenerateVideoPrompt(text.startsWith('!ai ') ? userText : text);
    if (autoVideoPrompt && !msg.hasMedia && !msg.hasQuotedMsg) {
      await replyLog(msg, '🎞️ Oke, aku sedang membuat video pendek... ini bisa agak lama.', command);
      const smart = await buildSmartVideoPrompt(autoVideoPrompt, msg, command);
      await logInfo('Auto-generate video from AI chat', {
        from: msg.from,
        command,
        scopeId: userId,
        originalPrompt: autoVideoPrompt,
        finalPrompt: smart.finalPrompt,
        searched: smart.searched
      });
      const file = await generateVideoFromPrompt(smart.finalPrompt);
      const media = MessageMedia.fromFilePath(file);
      const caption = `Hasil video: ${autoVideoPrompt}`;
      await sendLog(msg.from, media, { caption }, {
        command: command === 'auto/chat' ? '!ai-video-auto' : command,
        hasMedia: true,
        caption
      });
      await addRecent(userId, 'assistant', `[video dibuat] ${autoVideoPrompt}`);
      return;
    }

    // Kalau user menyuruh generate gambar lewat chat AI, langsung buat dan kirim gambar ke WhatsApp.
    const autoImagePrompt = extractGenerateImagePrompt(text.startsWith('!ai ') ? userText : text);
    if (autoImagePrompt && !msg.hasMedia && !msg.hasQuotedMsg) {
      await replyLog(msg, '🎨 Oke, aku sedang membuat gambarnya... aku rapikan prompt dulu biar hasilnya lebih sesuai.', command);
      const smart = await buildSmartImagePrompt(autoImagePrompt, msg, command);
      await logInfo(`Auto-generate image from AI chat`, {
        from: msg.from,
        command,
        scopeId: userId,
        originalPrompt: autoImagePrompt,
        finalPrompt: smart.finalPrompt,
        searched: smart.searched
      });
      const file = await generateImage(smart.finalPrompt);
      const media = MessageMedia.fromFilePath(file);
      const caption = `Hasil gambar: ${autoImagePrompt}`;
      await sendLog(msg.from, media, { caption }, {
        command: command === 'auto/chat' ? '!ai-img-auto' : command,
        hasMedia: true,
        caption
      });
      await addRecent(userId, 'assistant', `[gambar dibuat] ${autoImagePrompt}`);
      return;
    }

    const memory = await getMemory(userId);
    let results = [];
    if (await shouldSearch(userText)) {
      await logInfo(`Auto-search aktif untuk: ${userText}`, { from: msg.from, command });
      results = await webSearch(userText, 5);
    }

    await logInfo(`AI chat mulai`, { from: msg.from, command, model: process.env.CHAT_MODEL || 'default' });
    const answer = await answerAI({ text: userText, memory, searchResults: results, scopeContext: scopeText(scope) });
    await replyLog(msg, answer.slice(0, 3500), command);
    await addRecent(userId, 'assistant', answer);

    const fact = await extractMemoryFact(userText);
    if (fact) {
      await addFact(userId, fact);
      await logInfo(`Memori otomatis disimpan: ${fact}`, { from: msg.from, command });
    }
  } catch (err) {
    await logError(err, { from: msg.from, command, body: text });
    try {
      await replyLog(msg, `❌ Error: ${err.message}\n\nCek detail di folder logs/error.log`.slice(0, 1500), command);
    } catch (replyErr) {
      await logError(replyErr, { from: msg.from, command, body: 'Gagal mengirim pesan error ke WhatsApp' });
    }
  }
});

function menuText() {
  return `*AI LUKY Bot*

menu:
!ai <pesan> = chat AI Ollama / bisa juga suruh generate gambar
!search <query> = search internet manual
!img <prompt> = generate gambar via Gemma prompt enhancer + SD
!img = reply sticker untuk ubah sticker jadi foto
!promptimg <prompt> = cek prompt gambar hasil Gemma
!sticker / !s = buat sticker dari foto/GIF/video pendek
!mp3 <url> = ambil audio dari link 
!video <url> = ambil video dari link
!animasi <prompt> = generate animasi asli lewat ComfyUI/AnimateDiff
!promptanimasi <prompt> = cek prompt animasi hasil Gemma + internet
!comfycek = cek ComfyUI workflow/API
!vidgen <prompt> = generate video sederhana dari Stable Diffusion
!foto / !photo / !thumb <url> = ambil foto/thumbnail dari link
!lihat = analisis gambar/screenshot
reply gambar + tanya biasa = AI lihat gambar otomatis
!remember <fakta> = simpan memori
!clear = hapus semua memori kamu
!clearobrolan = reset konteks obrolan terakhir
!naturalreset = reset mode natural kalau AI mulai nyangkut topik lama
!memori = lihat memori/konteks yang diingat
!cleargambar = hapus cache gambar terakhir
!menu = lihat menu
!jam = lihat jam/hari/tanggal sekarang
!cekmedia = debug deteksi gambar
!cekimg = cek Stable Diffusion API




Catatan: JANGAN SPAM!!!`;
}

client.initialize();

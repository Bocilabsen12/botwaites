import axios from 'axios';
import { formatSearchResults } from './search.js';
import { memoryToText } from './memory.js';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const CHAT_MODEL = process.env.CHAT_MODEL || 'qwen3:4b';
const VISION_MODEL = process.env.VISION_MODEL || 'qwen3-vl:8b';
const CLASSIFIER_MODEL = process.env.CLASSIFIER_MODEL || 'qwen3:4b';

function getCurrentTimeContext() {
  const timezone = process.env.TIMEZONE || 'Asia/Jakarta';
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  });

  return `WAKTU_SAAT_INI:
- ${formatter.format(now)}
- Zona waktu: ${timezone}
- ISO UTC: ${now.toISOString()}

Jika user bertanya jam, hari, tanggal, bulan, tahun, atau "sekarang kapan", jawab memakai WAKTU_SAAT_INI ini. Jangan mengarang tanggal/jam.`;
}


function needsTimeContext(text = '') {
  const t = String(text).toLowerCase();

  const timeWords = [
    'jam berapa', 'pukul berapa', 'sekarang jam', 'waktu sekarang',
    'hari ini', 'hari apa', 'tanggal berapa', 'tanggal hari ini',
    'bulan apa', 'tahun berapa', 'sekarang tanggal', 'sekarang hari',
    'besok tanggal', 'kemarin tanggal', 'hari/tanggal', 'wib', 'zona waktu'
  ];

  return timeWords.some((w) => t.includes(w));
}

export async function ollamaChat({ model = CHAT_MODEL, messages, options = {} }) {
  const res = await axios.post(
    `${OLLAMA_HOST}/api/chat`,
    {
      model,
      messages,
      stream: false,
      options: { temperature: 0.6, ...options }
    },
    { timeout: 120000 }
  );
  return res.data?.message?.content?.trim() || '';
}

function forceAkuKamu(text = '') {
  return String(text)
    .replace(/\bgua\b/gi, 'aku')
    .replace(/\bgw\b/gi, 'aku')
    .replace(/\bgue\b/gi, 'aku')
    .replace(/\bane\b/gi, 'aku')
    .replace(/\blu\b/gi, 'kamu')
    .replace(/\blo\b/gi, 'kamu')
    .replace(/\bloe\b/gi, 'kamu')
    .replace(/\bente\b/gi, 'kamu')
    .replace(/bot AI WhatsApp/gi, 'AI LUKY')
    .replace(/AI WhatsApp/gi, 'AI LUKY')
    .replace(/Bot WhatsApp/gi, 'AI LUKY');
}

function looksLikeNewTopic(text = '') {
  const t = String(text || '').toLowerCase().trim();

  const continuationWords = [
    'lanjut', 'lanjutkan', 'tadi', 'itu', 'dia', 'mereka', 'gimana tadi',
    'terus', 'trus', 'nah', 'maksudku', 'maksud ku', 'yang tadi', 'sebelumnya',
    'curhat', 'aku sedih', 'aku bingung', 'aku takut', 'aku capek'
  ];

  if (continuationWords.some((w) => t.includes(w))) return false;

  const newTopicWords = [
    'ganti topik', 'ngomongin lain', 'sekarang bahas', 'bahas',
    'cara install', 'error', 'pc', 'gpu', 'game', 'translate', 'artinya',
    'buatkan kode', 'coding', 'download', 'harga', 'jam berapa'
  ];

  return newTopicWords.some((w) => t.includes(w));
}

function conversationModeContext(text = '') {
  if (looksLikeNewTopic(text)) {
    return `MODE_OBROLAN:
User kemungkinan membuka topik baru. Jawab topik baru ini langsung. Jangan memaksa mengaitkan ke obrolan sebelumnya kecuali memang relevan.`;
  }

  return `MODE_OBROLAN:
Gunakan konteks chat terakhir hanya kalau pesan user jelas merujuk ke sebelumnya, misalnya 'lanjut', 'tadi', 'itu', 'dia', atau pertanyaan follow-up.
Kalau pesan user berdiri sendiri, sapaan, bercanda, atau topik baru, jawab pesan terbaru saja. Jangan memaksa melanjutkan topik lama.`;
}

export async function answerAI({ text, memory, searchResults = [], scopeContext = '' }) {
  const botName = process.env.BOT_NAME || 'AI LUKY';
  const system = `Kamu adalah ${botName}.
Nama kamu wajib: ${botName}. Jangan pernah memperkenalkan diri sebagai "bot AI WhatsApp", "AI WhatsApp", atau nama lain.
Bahasa utama: Indonesia santai, natural seperti teman ngobrol, jelas, dan tidak terlalu panjang.
Gaya bicara wajib pakai kata "aku" untuk diri sendiri dan "kamu" untuk user.
Dilarang memakai kata "gua", "gue", "gw", "lu", "lo", "loe", "ane", atau "ente".
Kalau user tanya siapa kamu, jawab bahwa kamu adalah ${botName}, asisten AI milik Luky.
Jangan menjawab semua chat sebagai "arti kata" atau gaya KBBI. Kalau user cuma menyapa, bercanda, atau chat pendek, balas normal dan santai.
Jelaskan arti/definisi hanya kalau user jelas menulis "artinya", "apa arti", "maksudnya", "definisi", "translate", atau meminta terjemahan.
Kalau ada HASIL_SEARCH, gunakan itu sebagai sumber terbaru untuk info yang memang berubah. Jangan memakai hasil search untuk sapaan, chat santai, curhat, atau kata pendek biasa. Jangan menjawab seperti KBBI kecuali user jelas bertanya arti/definisi/translate. Utamakan HASIL_SEARCH untuk berita, harga crypto, jadwal, skor, Piala Dunia, software, produk, tokoh, aturan, dan info yang bisa berubah. Jika hasil search kurang cukup, bilang informasinya belum pasti.
Kalau user bertanya jam, hari, tanggal, bulan, tahun, atau waktu sekarang, jawab singkat sesuai konteks WAKTU_SAAT_INI jika tersedia. Kalau tidak ditanya waktu, jangan menyebut jam/tanggal.
Pakai memori percakapan secara natural, tapi hanya untuk ruang chat aktif ini:
- Kalau user curhat, tanggapi empatik, nyambung dengan masalah sebelumnya, dan jangan terlalu menggurui.
- Kalau user menulis "lanjut", "tadi", "itu", "dia", atau kalimat pendek yang merujuk ke sebelumnya, pakai konteks obrolan terakhir.
- Kalau user ganti topik, ikuti topik baru. Jangan memaksa melanjutkan obrolan lama.
- Jangan terus-terusan mengulang topik lama kalau user tidak membahasnya. Jangan membawa topik dari grup/kontak lain.
Kalau tidak yakin, jujur bilang tidak yakin.
Jangan bantu spam, penipuan, bypass DRM, atau download konten ilegal.`;

  const messages = [
    { role: 'system', content: system },
    { role: 'system', content: scopeContext || 'RUANG_CHAT: Memori ruang chat ini terpisah.' },
    { role: 'system', content: conversationModeContext(text) },
    { role: 'system', content: memoryToText(memory) }
  ];

  // Anti-spam waktu: konteks jam/tanggal hanya dikirim kalau user memang bertanya waktu.
  if (needsTimeContext(text)) {
    messages.splice(1, 0, { role: 'system', content: getCurrentTimeContext() });
  }

  if (searchResults.length) {
    messages.push({ role: 'system', content: `HASIL_SEARCH TERBARU:\n${formatSearchResults(searchResults)}` });
  }

  messages.push({ role: 'user', content: text });
  const raw = await ollamaChat({ model: CHAT_MODEL, messages });
  return forceAkuKamu(raw);
}




function looksLikeMeaningQuestion(text = '') {
  const t = String(text || '').toLowerCase().trim();
  const patterns = [
    'artinya', 'apa arti', 'arti dari', 'maksud kata', 'maksud dari',
    'definisi', 'kbbi', 'sinonim', 'antonim', 'translate', 'terjemahkan',
    'bahasa inggris', 'bahasa jepang', 'bahasa indonesia nya', 'bahasa indonesia dari'
  ];
  return patterns.some((w) => t.includes(w));
}

function looksLikeTooShortForSearch(text = '') {
  const t = String(text || '').trim();
  if (!t) return true;
  const words = t.split(/\s+/).filter(Boolean);

  // Chat pendek seperti "iya", "oke", "wkwk", "lanjut", "gmn", satu kata random
  // jangan search dan jangan dijadikan definisi KBBI.
  if (words.length <= 2 && !looksLikeMeaningQuestion(t)) {
    const importantFreshWords = [
      'bitcoin', 'btc', 'eth', 'ethereum', 'sol', 'solana', 'xrp',
      'pildun', 'world cup', 'timnas'
    ];
    return !importantFreshWords.some((w) => t.toLowerCase().includes(w));
  }

  return false;
}


function looksLikeGreetingOrSmallTalk(text = '') {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return false;

  const exact = [
    'hai', 'hi', 'halo', 'hello', 'helo', 'hallo', 'yo', 'p', 'ping',
    'assalamualaikum', 'assalamu alaikum', 'salam',
    'pagi', 'siang', 'sore', 'malam', 'selamat pagi', 'selamat siang', 'selamat sore', 'selamat malam',
    'apa kabar', 'apakabar', 'gimana kabarmu', 'kamu apa kabar',
    'makasih', 'terima kasih', 'thanks', 'thank you', 'ok', 'oke',
    'wkwk', 'haha', 'hehe', 'test', 'tes'
  ];
  if (exact.includes(t)) return true;

  if (t.length <= 35 && /^(hai|hi|halo|hello|hallo|pagi|siang|sore|malam|yo|p)\b/i.test(t)) return true;

  const smallTalk = [
    'apa kabar', 'lagi apa', 'sedang apa', 'kamu siapa', 'siapa kamu',
    'nama kamu siapa', 'kenalan', 'aku mau curhat', 'temani aku',
    'jawab dong', 'kok diam', 'halo ai', 'hai ai'
  ];
  return smallTalk.some((w) => t.includes(w));
}


function looksLikeStableOfflineQuestion(text = '') {
  const t = String(text || '').toLowerCase().trim();

  // Hal-hal ini biasanya tidak perlu internet dan malah bikin jawaban lambat/aneh.
  const offlineHints = [
    'translate', 'terjemahkan', 'artinya', 'bahasa inggris', 'bahasa jepang',
    'apa arti', 'grammar', 'benerin kalimat',
    'curhat', 'aku sedih', 'aku bingung', 'aku capek', 'aku takut',
    'menurut kamu aku', 'dia suka aku', 'friendzone',
    'buat puisi', 'buat caption', 'buat kata kata', 'balas chat',
    'jelaskan gambar', 'ini gambar apa', 'rating muka', 'foto ini'
  ];

  return offlineHints.some((w) => t.includes(w));
}

function looksLikeQuestion(text = '') {
  const t = String(text || '').toLowerCase().trim();

  if (t.includes('?')) return true;

  const questionWords = [
    'apa', 'apakah', 'kenapa', 'mengapa', 'gimana', 'bagaimana',
    'kapan', 'siapa', 'dimana', 'di mana', 'berapa', 'mana yang',
    'mending', 'worth it', 'bagus mana', 'rekomendasi', 'info',
    'benarkah', 'apakah benar', 'kok bisa'
  ];

  return questionWords.some((w) => t.startsWith(w) || t.includes(` ${w} `));
}

function aggressiveSearchEnabled() {
  const mode = String(process.env.AUTO_SEARCH_MODE || 'smart').toLowerCase();
  return mode === 'aggressive' || mode === 'always';
}

export function likelyNeedsSearch(text = '') {
  const t = String(text || '').toLowerCase();

  if (!t.trim()) return false;
  if (looksLikeGreetingOrSmallTalk(t)) return true;
  if (looksLikeStableOfflineQuestion(t)) return false;

  const alwaysSearchMode = String(process.env.AUTO_SEARCH_MODE || 'smart').toLowerCase() === 'always';
  if (alwaysSearchMode) return true;

  const triggers = [
    // kata umum info terbaru
    'terbaru', 'hari ini', 'sekarang', 'saat ini', 'update', 'berita', 'news', 'rilis',
    'jadwal', 'hasil', 'skor', 'klasemen', 'live', 'prediksi', 'tanggal', 'kapan',
    'kemarin', 'besok', 'minggu ini', 'bulan ini', 'tahun ini', '2026', '2027',

    // harga / market / crypto
    'harga', 'kurs', 'market', 'naik', 'turun', 'drop', 'bullish', 'bearish',
    'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'xrp', 'crypto', 'kripto',
    'indodax', 'binance', 'saham', 'emas', 'dollar', 'usd', 'rupiah',

    // olahraga / piala dunia
    'pildun', 'piala dunia', 'world cup', 'fifa', 'kualifikasi', 'timnas',
    'indonesia vs', 'argentina', 'brasil', 'portugal', 'inggris', 'spanyol',

    // teknologi, software, produk
    'versi terbaru', 'driver terbaru', 'software terbaru', 'update windows',
    'nvidia driver', 'harga gpu', 'harga vga', 'rtx 5060', 'rtx 5090',
    'openai', 'chatgpt', 'ollama', 'gemma', 'qwen', 'python terbaru',

    // tokoh, aturan, tempat
    'presiden', 'ceo', 'aturan', 'regulasi', 'download', 'link',
    'lowongan', 'gaji', 'umr', 'cuaca'
  ];

  if (triggers.some((w) => t.includes(w))) return true;

  // Mode aggressive: hampir semua pertanyaan faktual akan search dulu.
  // Supaya AI tidak ketinggalan zaman saat user tanya info publik.
  if (aggressiveSearchEnabled() && looksLikeQuestion(t)) {
    return true;
  }

  return false;
}

export async function shouldSearch(text = '') {
  if (looksLikeStableOfflineQuestion(text)) return false;
  if (looksLikeTooShortForSearch(text)) return false;
  if (likelyNeedsSearch(text)) return true;

  // Kalau mode aggressive dan ini pertanyaan faktual, search walau classifier ragu.
  if (aggressiveSearchEnabled() && looksLikeQuestion(text) && !looksLikeStableOfflineQuestion(text)) {
    return true;
  }

  // Mode pintar: tanya model kecil apakah butuh info terbaru.
  // Kalau model gagal, default false supaya bot tetap jalan.
  try {
    const ans = await ollamaChat({
      model: CLASSIFIER_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Jawab hanya SEARCH atau NOSEARCH. SEARCH jika pertanyaan butuh info terbaru/internet/link/harga/jadwal/berita/skor/crypto/bitcoin/btc/piala dunia/pildun/2026/rilis/software terbaru. NOSEARCH jika pengetahuan umum stabil, curhat, translate, atau coding umum yang tidak butuh data terbaru.'
        },
        { role: 'user', content: text }
      ],
      options: { temperature: 0 }
    });
    return ans.toUpperCase().includes('SEARCH');
  } catch {
    return false;
  }
}

export async function extractMemoryFact(text = '') {
  if (String(process.env.AUTO_MEMORY).toLowerCase() !== 'true') return null;
  if (!text || text.length < 12) return null;

  try {
    const ans = await ollamaChat({
      model: CLASSIFIER_MODEL,
      messages: [
        {
          role: 'system',
          content: `Ambil 1 fakta jangka panjang tentang user dari chat ini jika berguna untuk percakapan berikutnya.
Contoh yang boleh: nama panggilan, preferensi bahasa, proyek yang sedang dibuat, spek PC, gaya jawaban yang disukai, tujuan belajar, hal yang ingin dilanjutkan nanti.
Untuk curhat, simpan ringkasan umum yang tidak sensitif, misalnya "User sedang ingin belajar mengelola harapan dalam hubungan" bukan detail pribadi berlebihan.
Jangan simpan rahasia, data sensitif, nomor, alamat, atau hal sementara.
Jawab JSON valid saja: {"fact":"..."} atau {"fact":null}`
        },
        { role: 'user', content: text }
      ],
      options: { temperature: 0 }
    });
    const json = JSON.parse(ans.replace(/```json|```/g, '').trim());
    return json.fact || null;
  } catch {
    return null;
  }
}

export async function describeImage({ base64, prompt = 'Jelaskan gambar ini secara detail.', scopeContext = '' }) {
  const botName = process.env.BOT_NAME || 'AI LUKY';
  const messages = [
    {
      role: 'system',
      content: `Kamu adalah ${botName}. Jawab bahasa Indonesia pakai aku/kamu. Jangan pakai gua/lo. Jangan menyebut jam/tanggal kecuali user bertanya waktu.

ATURAN VISION WAJAH/ORANG:
- Jelaskan hanya hal yang terlihat di gambar. Jangan mengarang.
- Kalau gambar blur, gelap, kepotong, atau kualitas rendah, bilang tidak yakin.
- Jangan memberi rating angka untuk wajah/kecantikan/ketampanan kecuali user jelas meminta rating/nilai.
- Kalau user meminta rating, jangan default 7/10. Beri nilai yang subjektif berdasarkan foto yang terlihat: pencahayaan, angle, ekspresi, framing, grooming/kerapian, dan kualitas foto.
- Kalau memberi rating, format singkat: "Menurut foto ini: X/10" lalu 2-4 alasan jelas. Jangan menghina fisik orang.
- Kalau user tidak minta rating, fokus bantu: deskripsi, saran foto, pose, lighting, atau cara memperbaiki hasil foto.`
    },
    { role: 'system', content: scopeContext || 'RUANG_CHAT: Memori ruang chat ini terpisah.' }
  ];

  if (needsTimeContext(prompt)) {
    messages.push({ role: 'system', content: getCurrentTimeContext() });
  }

  messages.push({
    role: 'user',
    content: prompt,
    images: [base64]
  });

  const raw = await ollamaChat({
    model: VISION_MODEL,
    messages
  });
  return forceAkuKamu(raw);
}


export async function enhanceImagePrompt({ userPrompt, searchResults = [] }) {
  const searchText = searchResults.length
    ? `\nINFO INTERNET / REFERENSI TEKS:\n${formatSearchResults(searchResults)}`
    : '';

  const messages = [
    {
      role: 'system',
      content: `Kamu adalah prompt engineer untuk Stable Diffusion.
Ubah permintaan user menjadi prompt gambar bahasa Inggris yang jelas dan detail.
Jawab HANYA prompt final, tanpa markdown.

Aturan:
- Pertahankan niat utama user.
- Tambahkan detail visual: subject, face, clothing, pose, location, lighting, camera, style, quality.
- Kalau user menyebut tokoh nyata/public figure, tulis realistic portrait of [nama] dan tambahkan ciri visual umum dari info yang tersedia.
- Fokus visual netral, jangan klaim politik/sensitif.
- Jangan tulis "same as photo" kalau tidak ada foto referensi.
- Target 70-130 kata.
- Tambahkan: highly detailed, realistic, sharp focus, natural lighting.`
    },
    {
      role: 'user',
      content: `Permintaan user: ${userPrompt}${searchText}\n\nBuat prompt final untuk Stable Diffusion.`
    }
  ];

  const raw = await ollamaChat({
    model: CHAT_MODEL,
    messages,
    options: { temperature: 0.35 }
  });

  return String(raw || userPrompt)
    .replace(/```/g, '')
    .replace(/^prompt\s*:\s*/i, '')
    .replace(/^final prompt\s*:\s*/i, '')
    .trim()
    .slice(0, 1200);
}

export async function enhanceVideoPrompt({ userPrompt, searchResults = [] }) {
  const searchText = searchResults.length
    ? `\nHASIL INTERNET / REFERENSI VISUAL TERBARU:\n${formatSearchResults(searchResults)}`
    : '';

  const messages = [
    {
      role: 'system',
      content: `Kamu adalah prompt engineer khusus ComfyUI AnimateDiff text-to-video.

Tugasmu: ubah permintaan user menjadi prompt animasi/video pendek bahasa Inggris yang lebih bagus, jelas, dan TETAP SETIA pada permintaan user.

Aturan paling penting:
- JANGAN mengubah subjek utama.
- Jika user minta mobil/kendaraan, prompt final HARUS tetap tentang kendaraan yang jelas terlihat sebagai kendaraan, tanpa unsur tubuh manusia seperti arms/legs.
- Jika user minta orang berjalan, prompt final HARUS tetap tentang orang berjalan.
- Untuk prompt pendek/sederhana, tetap literal dan sederhana. Jangan mengarang cerita baru, hutan, panggung, kota, atau suasana lain kecuali user menyebutkannya.
- Jawab HANYA prompt final bahasa Inggris, tanpa markdown, tanpa penjelasan.

Aturan detail:
- Fokus pada 1 subjek utama yang jelas dan mudah dikenali.
- Jelaskan subject motion, camera motion, dan environment motion secara singkat.
- Hindari prompt terlalu puitis atau terlalu panjang.
- Target 45-90 kata.
- Hindari teks, logo, watermark, subtitle.

Aturan spesifik orang:
- Gunakan: full body, both legs visible, natural walking gait, alternating steps, arms swinging naturally.
- Kalau user hanya bilang "orang berjalan", buat adegan sederhana dan jelas.

Aturan spesifik kendaraan:
- Gunakan: clearly recognizable car/truck/motorcycle, full vehicle visible, proper proportions, four wheels visible jika mobil/truk, body lines clear. Jangan menyebut arms, legs, walking gait, atau body manusia untuk kendaraan.
- Tambahkan: vehicle moving forward, wheels rotating, road motion, slight motion blur, tracking shot.
- Subjek kendaraan harus jadi fokus utama, tidak boleh berubah menjadi bentuk abstrak.
- Untuk kendaraan, jangan pernah menambahkan frasa seperti arms swinging, legs visible, walking gait, atau gerakan tubuh manusia.

Aturan referensi internet:
- Pakai referensi internet hanya jika user menyebut tokoh nyata, merek, model kendaraan tertentu, landmark, style tertentu, atau ingin hasil mirip sesuatu.
- Jika prompt generik seperti "mobil" atau "orang berjalan", jangan ubah menjadi adegan aneh hanya karena referensi internet.

Cocok untuk setting rendah 320-384px, 8-16 frames, AnimateDiff SD 1.5.`
    },
    {
      role: 'user',
      content: `Permintaan user: ${userPrompt}${searchText}\n\nBuat prompt final terbaik untuk AnimateDiff.`
    }
  ];

  const raw = await ollamaChat({
    model: CHAT_MODEL,
    messages,
    options: { temperature: 0.2 }
  });

  return String(raw || userPrompt)
    .replace(/```/g, '')
    .replace(/^prompt\s*:\s*/i, '')
    .replace(/^final prompt\s*:\s*/i, '')
    .trim()
    .slice(0, 1200);
}

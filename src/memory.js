import fs from 'fs-extra';
import path from 'path';
import { DATA_DIR } from './utils.js';

const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');
const MAX_RECENT = 45;
const MAX_FACTS = 80;

async function loadAll() {
  await fs.ensureFile(MEMORY_FILE);
  try {
    const data = await fs.readJson(MEMORY_FILE);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

async function saveAll(data) {
  await fs.writeJson(MEMORY_FILE, data, { spaces: 2 });
}

export async function getMemory(userId) {
  const all = await loadAll();
  if (!all[userId]) all[userId] = { facts: [], recent: [] };
  return all[userId];
}

export async function addRecent(userId, role, content) {
  const all = await loadAll();
  if (!all[userId]) all[userId] = { facts: [], recent: [] };
  all[userId].recent.push({ role, content, at: new Date().toISOString() });
  all[userId].recent = all[userId].recent.slice(-MAX_RECENT);
  await saveAll(all);
}

export async function addFact(userId, fact) {
  const clean = String(fact || '').trim();
  if (!clean) return;
  const all = await loadAll();
  if (!all[userId]) all[userId] = { facts: [], recent: [] };
  if (!all[userId].facts.includes(clean)) all[userId].facts.push(clean);
  all[userId].facts = all[userId].facts.slice(-MAX_FACTS);
  await saveAll(all);
}

export async function clearMemory(userId) {
  const all = await loadAll();
  all[userId] = { facts: [], recent: [] };
  await saveAll(all);
}

export async function clearRecent(userId) {
  const all = await loadAll();
  if (!all[userId]) all[userId] = { facts: [], recent: [] };
  all[userId].recent = [];
  await saveAll(all);
}

export function memoryToText(memory) {
  const facts = memory.facts?.length
    ? memory.facts.map((f) => `- ${f}`).join('\n')
    : '- Belum ada fakta permanen.';

  const recentItems = Array.isArray(memory.recent) ? memory.recent.slice(-12) : [];
  const recent = recentItems.length
    ? recentItems
        .map((m) => {
          const role = m.role === 'assistant' ? 'AI LUKY' : 'User';
          const content = String(m.content || '').replace(/\s+/g, ' ').trim();
          return `${role}: ${content}`;
        })
        .join('\n')
    : 'Belum ada chat terakhir.';

  return `MEMORI PERMANEN USER:
${facts}

KONTEKS OBROLAN TERAKHIR (pakai hanya jika relevan):
${recent}

ATURAN MEMORI:
- Pakai KONTEKS OBROLAN TERAKHIR hanya kalau pesan user memang berhubungan jelas dengan obrolan sebelumnya.
- Kalau user bilang "lanjut", "tadi", "itu", "dia", "gimana tadi", atau pesannya pendek dan tidak jelas, lihat konteks sebelumnya.
- Kalau user membuka topik baru, menyapa, bercanda, atau mengirim pesan pendek yang berdiri sendiri, jawab pesan terbaru saja dan jangan memaksa melanjutkan topik lama.
- Memori ini hanya berlaku untuk ruang chat aktif; jangan dianggap berlaku untuk grup/kontak lain.
- Kalau user curhat, ingat alur emosi dan masalahnya supaya jawaban terasa nyambung.
- Jangan menjawab gaya kamus/KBBI kecuali user meminta arti/definisi.
- Jangan mengarang memori yang tidak ada.`;
}

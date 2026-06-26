import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

function normalizeResults(items = []) {
  return items
    .filter(Boolean)
    .map((x) => ({
      title: x.title || x.name || 'Tanpa judul',
      url: x.url || x.link || x.href || '',
      snippet: x.snippet || x.content || x.description || x.text || ''
    }))
    .filter((x) => x.url || x.snippet)
    .slice(0, 8);
}

export async function ollamaWebSearch(query, maxResults = 5) {
  const key = process.env.OLLAMA_API_KEY;
  if (!key) return null;

  const res = await axios.post(
    'https://ollama.com/api/web_search',
    { query, max_results: maxResults },
    { headers: { Authorization: `Bearer ${key}` }, timeout: 20000 }
  );

  const body = res.data || {};
  return normalizeResults(body.results || body.items || body.data || []);
}

export async function bingRssSearch(query, maxResults = 5) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`;
  const res = await axios.get(url, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  const parser = new XMLParser({ ignoreAttributes: false });
  const xml = parser.parse(res.data);
  const items = xml?.rss?.channel?.item;
  const arr = Array.isArray(items) ? items : items ? [items] : [];
  return normalizeResults(arr).slice(0, maxResults);
}

export async function webSearch(query, maxResults = 5) {
  try {
    const paid = await ollamaWebSearch(query, maxResults);
    if (paid?.length) return paid;
  } catch (e) {
    console.log('Ollama Web Search gagal, fallback Bing RSS:', e.message);
  }

  try {
    return await bingRssSearch(query, maxResults);
  } catch (e) {
    console.log('Bing RSS gagal:', e.message);
    return [];
  }
}

export function formatSearchResults(results = []) {
  if (!results.length) return 'Tidak ada hasil search.';
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nRingkasan: ${r.snippet}`)
    .join('\n\n');
}

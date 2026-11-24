// Spokarr – audiobook request manager
// Audible catalog → Newznab indexer → SABnzbd → Audiobookshelf
import http from 'node:http';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.1.0';
const env = process.env;

// ---------- Configuration ----------
const AUDIBLE_REGIONS = {
  us: { host: 'api.audible.com', abs: 'audible', lang: 'english' },
  uk: { host: 'api.audible.co.uk', abs: 'audible.uk', lang: 'english' },
  ca: { host: 'api.audible.ca', abs: 'audible.ca', lang: 'english' },
  au: { host: 'api.audible.com.au', abs: 'audible.au', lang: 'english' },
  in: { host: 'api.audible.in', abs: 'audible.in', lang: 'english' },
  de: { host: 'api.audible.de', abs: 'audible.de', lang: 'german' },
  fr: { host: 'api.audible.fr', abs: 'audible.fr', lang: 'french' },
  it: { host: 'api.audible.it', abs: 'audible.it', lang: 'italian' },
  es: { host: 'api.audible.es', abs: 'audible.es', lang: 'spanish' },
  jp: { host: 'api.audible.co.jp', abs: 'audible.jp', lang: 'japanese' },
};
const REGION_KEY = (env.AUDIBLE_REGION || 'us').toLowerCase();
const REGION = AUDIBLE_REGIONS[REGION_KEY] || AUDIBLE_REGIONS.us;

const cfg = {
  port: Number(env.PORT || 5057),
  dataDir: env.DATA_DIR || '/data',
  libraryDir: env.LIBRARY_DIR || '/audiobooks',
  // Path of LIBRARY_DIR as seen by Audiobookshelf (used to find newly imported items)
  absLibraryMount: env.ABS_LIBRARY_MOUNT || env.LIBRARY_DIR || '/audiobooks',
  contentLanguage: (env.CONTENT_LANGUAGE || REGION.lang).toLowerCase(),
  sab: { url: env.SAB_URL || 'http://localhost:8080', key: env.SAB_API_KEY || '', category: env.SAB_CATEGORY || 'spokarr' },
  indexer: { url: env.NEWZNAB_URL || '', key: env.NEWZNAB_API_KEY || '', categories: env.NEWZNAB_CATEGORIES || '3030' },
  abs: { url: env.ABS_URL || '', publicUrl: env.ABS_PUBLIC_URL || env.ABS_URL || '', key: env.ABS_API_KEY || '', library: env.ABS_LIBRARY_ID || '' },
  // Extra rows on the discover page: "Title|keywords|narrator" separated by ";"
  discoverRows: env.DISCOVER_ROWS || '',
};
const AUDIBLE = `https://${REGION.host}/1.0/catalog/products`;
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

const log = (...a) => console.log(new Date().toISOString(), ...a);
class UserError extends Error { constructor(code, params = {}) { super(code); this.code = code; this.params = params; } }

// ---------- Text helpers ----------
const GERMAN_TRANSLIT = (s) => s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
  .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss');
const norm = (s) => GERMAN_TRANSLIT(String(s || '')).normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Strips edition notes that never appear in release names ("Narrated by …", "Gesprochen von …", "(Unabridged)")
const EDITION_SUFFIX = /\s*[-–:|]\s*(narrated|read by|unabridged|abridged|dramati[sz]ed|gesprochen|gelesen|ungekürzt|gekürzt|die ungekürzte|das hörspiel|hörspiel|hörbuch|lu par|letto da|narrado).*$/i;
const cleanTitle = (t) => String(t || '').replace(EDITION_SUFFIX, '').replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ').replace(/\s+/g, ' ').trim();
const safeName = (s) => String(s || 'Unknown').replace(/[\/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Unknown';
const stripHtml = (s) => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\n{3,}/g, '\n\n').trim();
const decodeXml = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();

async function fetchJson(url, opts = {}, timeout = 20000) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`${new URL(url).host} responded ${r.status}`);
  return r.json();
}
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, until: Date.now() + ttlMs });
  return value;
}

// ---------- Storage ----------
const STORE = path.join(cfg.dataDir, 'requests.json');
let requests = [];
async function load() {
  await fs.mkdir(cfg.dataDir, { recursive: true });
  try { requests = JSON.parse(await fs.readFile(STORE, 'utf8')); } catch { requests = []; }
}
let saving = Promise.resolve();
function save() {
  saving = saving.then(async () => {
    await fs.writeFile(STORE + '.tmp', JSON.stringify(requests, null, 2));
    await fs.rename(STORE + '.tmp', STORE);
  }).catch((e) => log('Saving failed:', e.message));
  return saving;
}

// ---------- Audible catalog ----------
const RG = 'contributors,media,product_attrs,product_desc,product_extended_attrs,series,rating';
const BOOK_TYPES = new Set(['SinglePartBook', 'MultiPartBook']);
async function audible(params) {
  const u = new URL(AUDIBLE);
  for (const [k, v] of Object.entries({ response_groups: RG, image_sizes: '500,1024', num_results: 30, ...params })) u.searchParams.set(k, v);
  return fetchJson(u, { headers: { Accept: 'application/json' } });
}
function mapProduct(p) {
  return {
    asin: p.asin,
    title: p.title || '',
    subtitle: p.subtitle || '',
    authors: (p.authors || []).map((a) => a.name),
    narrators: (p.narrators || []).map((a) => a.name),
    minutes: p.runtime_length_min || 0,
    abridged: p.format_type === 'abridged',
    release: p.release_date || p.issue_date || '',
    series: (p.series || []).map((s) => ({ title: s.title, seq: s.sequence || '' })),
    cover: p.product_images?.['1024'] || p.product_images?.['500'] || '',
    coverSmall: p.product_images?.['500'] || p.product_images?.['1024'] || '',
    language: p.language || '',
    publisher: p.publisher_name || '',
    summary: stripHtml(p.publisher_summary || p.merchandising_summary || ''),
    genres: (p.thesaurus_subject_keywords || []).slice(0, 5),
    rating: Number(p.rating?.overall_distribution?.display_average_rating) || null,
  };
}
async function searchAudible(params, { languageOnly = false } = {}) {
  const d = await audible(params);
  return (d.products || [])
    .filter((p) => !p.content_delivery_type || BOOK_TYPES.has(p.content_delivery_type))
    .filter((p) => !languageOnly || !cfg.contentLanguage || p.language === cfg.contentLanguage)
    .map(mapProduct);
}
async function getBook(asin) {
  return cached('book:' + asin, 6 * 3600e3, async () => {
    const u = new URL(`${AUDIBLE}/${encodeURIComponent(asin)}`);
    u.searchParams.set('response_groups', RG);
    u.searchParams.set('image_sizes', '500,1024');
    const d = await fetchJson(u, { headers: { Accept: 'application/json' } });
    if (!d.product?.title) throw new UserError('book_not_found');
    return mapProduct(d.product);
  });
}

// ---------- Audiobookshelf ----------
const absEnabled = () => !!(cfg.abs.url && cfg.abs.key);
const absHeaders = () => ({ Authorization: `Bearer ${cfg.abs.key}`, 'Content-Type': 'application/json' });
async function absLibraryId() {
  if (cfg.abs.library) return cfg.abs.library;
  const d = await fetchJson(`${cfg.abs.url}/api/libraries`, { headers: absHeaders() });
  cfg.abs.library = d.libraries?.find((l) => l.mediaType === 'book')?.id || '';
  return cfg.abs.library;
}
async function absItems() {
  if (!absEnabled()) return [];
  return cached('abs:items', 60e3, async () => {
    const lib = await absLibraryId();
    const d = await fetchJson(`${cfg.abs.url}/api/libraries/${lib}/items?limit=0&minified=1`, { headers: absHeaders() });
    return (d.results || []).map((i) => ({
      id: i.id, path: i.path,
      asin: i.media?.metadata?.asin || '',
      key: norm(cleanTitle(i.media?.metadata?.title || '')),
    }));
  }).catch((e) => { log('Audiobookshelf unreachable:', e.message); return []; });
}
async function absScan() {
  const lib = await absLibraryId();
  const r = await fetch(`${cfg.abs.url}/api/libraries/${lib}/scan?force=1`, { method: 'POST', headers: absHeaders() });
  cache.delete('abs:items');
  return r.ok;
}
async function absMatch(itemId, asin) {
  const r = await fetch(`${cfg.abs.url}/api/items/${itemId}/match`, {
    method: 'POST', headers: absHeaders(),
    body: JSON.stringify({ provider: REGION.abs, asin, overrideDefaults: true }),
  });
  return r.ok;
}

// ---------- Status per book ----------
async function statusResolver() {
  const items = await absItems();
  const byAsin = new Map(items.filter((i) => i.asin).map((i) => [i.asin, i]));
  // Title fallback only for library items without ASIN – otherwise every edition of a title would count as owned
  const byKey = new Map(items.filter((i) => i.key && !i.asin).map((i) => [i.key, i]));
  const reqByAsin = new Map(requests.map((r) => [r.asin, r]));
  return (book) => {
    const abs = byAsin.get(book.asin) || byKey.get(norm(cleanTitle(book.title)));
    if (abs) return { state: 'available', absId: abs.id };
    const req = reqByAsin.get(book.asin);
    if (req) return { state: req.status, progress: req.progress || 0, requestId: req.id };
    return null;
  };
}
async function annotate(books) {
  const st = await statusResolver();
  return books.map((b) => ({ ...b, status: st(b) }));
}

// ---------- Indexer (Newznab) ----------
function parseNewznab(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const tag = (t) => decodeXml((it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]);
    const attrs = {};
    for (const a of it.matchAll(/<(?:newznab:)?attr\s+name="([^"]+)"\s+value="([^"]*)"/g)) {
      attrs[a[1]] = attrs[a[1]] ? attrs[a[1]] + ',' + a[2] : a[2];
    }
    const enc = it.match(/<enclosure[^>]*url="([^"]+)"[^>]*length="(\d+)"/);
    items.push({
      title: tag('title'),
      guid: tag('guid') || tag('link'),
      link: decodeXml(enc?.[1] || tag('link')),
      size: Number(attrs.size || enc?.[2] || 0),
      cats: String(attrs.category || '').split(',').map(Number).filter(Boolean),
      pubDate: tag('pubDate'),
    });
  }
  return items;
}
async function newznab(q) {
  if (!cfg.indexer.url || !cfg.indexer.key) throw new UserError('indexer_not_configured');
  const u = new URL(cfg.indexer.url);
  if (!u.pathname.endsWith('/api')) u.pathname = u.pathname.replace(/\/?$/, '/api');
  u.searchParams.set('t', 'search');
  u.searchParams.set('q', q);
  u.searchParams.set('cat', cfg.indexer.categories);
  u.searchParams.set('limit', '100');
  u.searchParams.set('apikey', cfg.indexer.key);
  const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Indexer responded ${r.status}`);
  const xml = await r.text();
  const err = xml.match(/<error[^>]*description="([^"]+)"/);
  if (err) throw new Error('Indexer: ' + err[1]);
  return parseNewznab(xml);
}

// Words that mark the language of a release name
const LANG_TOKENS = {
  german: ['german', 'deutsch', 'ger'],
  english: ['english', 'eng'],
  french: ['french', 'francais', 'truefrench', 'vf'],
  italian: ['italian', 'italiano', 'ita'],
  spanish: ['spanish', 'espanol', 'spa', 'castellano'],
  japanese: ['japanese', 'jap', 'jpn'],
};
const ENGLISH_STOPWORDS = /\b(the|and|of)\b/;

function scoreRelease(book, rel) {
  const n = norm(rel.title);
  const words = new Set(n.split(' '));
  const titleWords = norm(cleanTitle(book.title)).split(' ').filter((w) => w.length > 1);
  const hit = titleWords.filter((w) => words.has(w)).length / Math.max(1, titleWords.length);
  const minus = [];
  const plus = [];
  let s = Math.round(hit * 60);
  if (hit < 0.75) minus.push('title_mismatch');

  const narrWords = book.narrators.flatMap((x) => norm(x).split(' ')).filter((w) => w.length > 2);
  if (narrWords.length && narrWords.some((w) => words.has(w))) { s += 25; plus.push('narrator'); }
  const authWords = book.authors.flatMap((x) => norm(x).split(' ')).filter((w) => w.length > 2);
  if (authWords.some((w) => words.has(w))) s += 5;

  // Language: bonus when the release names the book's language, penalty when it names another one
  const bookLang = book.language || cfg.contentLanguage;
  const named = Object.entries(LANG_TOKENS).filter(([, toks]) => toks.some((t) => words.has(t))).map(([l]) => l);
  const looksEnglish = named.includes('english') || (!named.length && ENGLISH_STOPWORDS.test(n));
  if (named.includes(bookLang)) { s += 10; plus.push('language'); }
  else if ((bookLang !== 'english' && looksEnglish) || named.some((l) => l !== bookLang)) { s -= 50; minus.push('wrong_language'); }

  const isDrama = (t) => /\bhoerspiel\b|full cast|dramati[sz]ed|audio drama/.test(t);
  if (isDrama(n) && !isDrama(norm(book.title + ' ' + book.subtitle))) { s -= 30; minus.push('drama'); }
  const unabr = /\bungekuerzt\b|\bunabridged\b/.test(n);
  const abr = !unabr && /\bgekuerzt\b|\babridged\b/.test(n);
  if (unabr && !book.abridged) { s += 5; plus.push('unabridged'); }
  if (abr && !book.abridged) { s -= 25; minus.push('abridged'); }

  if (book.minutes && rel.size) {
    const mbPerMin = rel.size / 1048576 / book.minutes;
    if (mbPerMin < 0.15) { s -= 30; minus.push('too_small'); }
    else if (mbPerMin > 4) { s -= 10; minus.push('too_large'); }
  }
  return { score: s, ok: hit >= 0.75 && s >= 50 && !minus.includes('wrong_language'), minus, plus };
}

async function findReleases(book) {
  const base = cleanTitle(book.title);
  const queries = [...new Set([base, GERMAN_TRANSLIT(base)])].filter(Boolean);
  const seen = new Map();
  for (const q of queries) {
    try {
      for (const r of await newznab(q)) if (!seen.has(r.guid)) seen.set(r.guid, r);
    } catch (e) {
      log('Indexer search failed:', q, e.message);
      if (!seen.size && q === queries.at(-1)) throw e;
    }
  }
  return [...seen.values()]
    .map((r) => ({ ...r, ...scoreRelease(book, r) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
}

// ---------- SABnzbd ----------
async function sab(params) {
  if (!cfg.sab.url || !cfg.sab.key) throw new UserError('sab_not_configured');
  const u = new URL('/api', cfg.sab.url);
  for (const [k, v] of Object.entries({ ...params, apikey: cfg.sab.key, output: 'json' })) u.searchParams.set(k, v);
  return fetchJson(u);
}
async function sendToSab(book, rel) {
  const name = safeName(`${book.authors[0] || 'Unknown'} - ${cleanTitle(book.title)}`);
  const d = await sab({ mode: 'addurl', name: rel.link, cat: cfg.sab.category, nzbname: name });
  if (!d.status || !d.nzo_ids?.length) throw new UserError('sab_rejected');
  return d.nzo_ids[0];
}

// ---------- Requests ----------
// Request states: downloading → processing → available | not_found | failed
const publicRequest = (r) => ({
  id: r.id, asin: r.asin, status: r.status, progress: r.progress || 0, eta: r.eta || '',
  message: r.message || null, createdAt: r.createdAt, updatedAt: r.updatedAt,
  release: r.release ? { title: r.release.title, size: r.release.size } : null,
  book: r.book, absId: r.absId || null,
});
const msg = (code, params = {}) => ({ code, params });

async function createRequest(asin, guid) {
  const book = await getBook(asin);
  let req = requests.find((r) => r.asin === asin);
  if (req && ['downloading', 'processing', 'available'].includes(req.status) && !guid) return req;
  const releases = await findReleases(book);
  const rel = guid ? releases.find((r) => r.guid === guid) : releases.find((r) => r.ok);
  const now = new Date().toISOString();
  if (!req) {
    req = { id: Math.random().toString(36).slice(2, 10), asin, book, createdAt: now };
    requests.unshift(req);
  }
  Object.assign(req, { updatedAt: now, progress: 0, message: null, release: null, nzo: null, eta: '' });
  if (!rel) {
    req.status = 'not_found';
    req.message = releases.length ? msg('no_safe_match', { count: releases.length }) : msg('nothing_found');
  } else {
    req.nzo = await sendToSab(book, rel);
    req.release = { title: rel.title, size: rel.size, guid: rel.guid };
    req.status = 'downloading';
    log('Requested', book.title, '→', rel.title);
  }
  await save();
  return req;
}

async function importDownload(req, storage) {
  const book = req.book;
  const author = safeName(book.authors[0] || 'Unknown');
  const title = safeName(cleanTitle(book.title));
  let dest = path.join(cfg.libraryDir, author, title);
  for (let i = 2; fss.existsSync(dest); i++) dest = path.join(cfg.libraryDir, author, `${title} (${i})`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rename(storage, dest);
  for (const f of await fs.readdir(dest)) {
    if (/\.(par2|nzb|sfv|srr|nfo|url)$/i.test(f)) await fs.rm(path.join(dest, f), { force: true });
  }
  // Audiobookshelf metadata file, read on scan
  const meta = {
    title: cleanTitle(book.title), subtitle: book.subtitle || null, authors: book.authors, narrators: book.narrators,
    series: book.series.map((s) => (s.seq ? `${s.title} #${s.seq}` : s.title)), genres: book.genres,
    publishedYear: (book.release || '').slice(0, 4) || null, publisher: book.publisher || null,
    description: book.summary || null, asin: book.asin, language: book.language || null,
    abridged: book.abridged, explicit: false, tags: [], chapters: [],
  };
  await fs.writeFile(path.join(dest, 'metadata.json'), JSON.stringify(meta, null, 2));
  if (book.cover && !fss.existsSync(path.join(dest, 'cover.jpg'))) {
    try {
      const r = await fetch(book.cover, { signal: AbortSignal.timeout(20000) });
      if (r.ok) await fs.writeFile(path.join(dest, 'cover.jpg'), Buffer.from(await r.arrayBuffer()));
    } catch { /* cover is optional */ }
  }
  req.path = dest;
  log('Imported', dest);
}

async function linkInAbs(req) {
  if (!absEnabled()) return true;
  await absScan();
  const absPath = path.join(cfg.absLibraryMount, path.relative(cfg.libraryDir, req.path));
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    cache.delete('abs:items');
    const item = (await absItems()).find((x) => x.path === absPath);
    if (item) {
      req.absId = item.id;
      await absMatch(item.id, req.asin).catch(() => false);
      cache.delete('abs:items');
      return true;
    }
  }
  return false;
}

let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try {
    const active = requests.filter((r) => r.status === 'downloading' && r.nzo);
    if (!active.length) return;
    const q = await sab({ mode: 'queue', limit: 200 });
    const slots = new Map((q.queue?.slots || []).map((s) => [s.nzo_id, s]));
    for (const req of active) {
      const s = slots.get(req.nzo);
      if (s) {
        req.progress = Number(s.percentage) || 0;
        req.eta = s.timeleft || '';
        req.message = s.status === 'Paused' ? msg('paused') : null;
        continue;
      }
      const h = await sab({ mode: 'history', nzo_ids: req.nzo });
      const slot = h.history?.slots?.[0];
      if (!slot) continue;
      if (slot.status === 'Completed') {
        req.status = 'processing';
        req.progress = 100;
        await save();
        try {
          await importDownload(req, slot.storage);
          const ok = await linkInAbs(req);
          req.status = 'available';
          req.message = ok ? null : msg('not_scanned_yet');
        } catch (e) {
          req.status = 'failed';
          req.message = msg('import_failed', { error: e.message });
          log('Import failed', req.book.title, e);
        }
      } else if (slot.status === 'Failed') {
        req.status = 'failed';
        req.message = msg('download_failed', { error: slot.fail_message || '' });
      } else {
        req.message = msg('sab_status', { status: slot.status });
      }
      req.updatedAt = new Date().toISOString();
    }
    await save();
  } catch (e) {
    log('SABnzbd sync failed:', e.message);
  } finally {
    polling = false;
  }
}

// ---------- Discover ----------
function customRows() {
  return cfg.discoverRows.split(';').map((r) => r.trim()).filter(Boolean).map((r, i) => {
    const [title, keywords = '', narrator = ''] = r.split('|').map((x) => x.trim());
    return { id: 'custom' + i, title, keywords: keywords || title, narrator: norm(narrator) };
  });
}
async function discover() {
  const rows = await cached('discover', 30 * 60e3, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const jobs = [
      ['popular', null, () => searchAudible({ products_sort_by: 'BestSellers' }, { languageOnly: true })],
      ['new', null, async () => (await searchAudible({ products_sort_by: 'BestSellers', num_results: 50 }, { languageOnly: true }))
        .filter((b) => b.release && b.release <= today && b.release >= cutoff)],
      ...customRows().map((row) => [row.id, row.title, async () => {
        let items = await searchAudible({ products_sort_by: 'BestSellers', keywords: row.keywords }, { languageOnly: true });
        if (row.narrator) items = items.filter((b) => b.narrators.some((n) => norm(n) === row.narrator));
        return items;
      }]),
    ];
    return Promise.all(jobs.map(async ([id, title, fn]) => {
      try { return { id, title, items: (await fn()).slice(0, 20) }; } catch (e) { return { id, title, items: [], error: e.message }; }
    }));
  });
  return Promise.all(rows.map(async (r) => ({ ...r, items: await annotate(r.items) })));
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.json': 'application/json' };
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
async function readBody(req) {
  let b = '';
  for await (const c of req) { b += c; if (b.length > 1e5) break; }
  try { return JSON.parse(b || '{}'); } catch { return {}; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/api/config') {
      return send(res, 200, { version: VERSION, region: REGION_KEY, absUrl: cfg.abs.publicUrl, absEnabled: absEnabled() });
    }
    if (p === '/api/health') return send(res, 200, { ok: true, version: VERSION, requests: requests.length });
    if (p === '/api/discover') return send(res, 200, await discover());
    if (p === '/api/search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) return send(res, 200, []);
      const items = await cached('search:' + q.toLowerCase(), 10 * 60e3,
        () => searchAudible({ keywords: q, products_sort_by: 'Relevance', num_results: 40 }));
      return send(res, 200, await annotate(items));
    }
    let m;
    if ((m = p.match(/^\/api\/book\/([A-Z0-9]{10})$/))) {
      const [book] = await annotate([await getBook(m[1])]);
      const r = requests.find((x) => x.asin === m[1]);
      return send(res, 200, { ...book, request: r ? publicRequest(r) : null });
    }
    if ((m = p.match(/^\/api\/book\/([A-Z0-9]{10})\/releases$/))) {
      const rel = await findReleases(await getBook(m[1]));
      return send(res, 200, rel.map(({ link, ...r }) => r));
    }
    if (p === '/api/requests' && req.method === 'GET') return send(res, 200, requests.map(publicRequest));
    if (p === '/api/requests' && req.method === 'POST') {
      const body = await readBody(req);
      if (!/^[A-Z0-9]{10}$/.test(body.asin || '')) return send(res, 400, { error: 'invalid_asin' });
      return send(res, 200, publicRequest(await createRequest(body.asin, body.guid)));
    }
    if ((m = p.match(/^\/api\/requests\/([a-z0-9]+)$/)) && req.method === 'DELETE') {
      requests = requests.filter((r) => r.id !== m[1]);
      await save();
      return send(res, 200, { ok: true });
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'not_found' });

    // Static files, everything else → index.html (single page app)
    let file = path.normalize(path.join(PUBLIC, p));
    if (!file.startsWith(PUBLIC) || !fss.existsSync(file) || fss.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
    fss.createReadStream(file).pipe(res);
  } catch (e) {
    if (e instanceof UserError) return send(res, 400, { error: e.code, params: e.params });
    log('Error', p, e.message);
    send(res, 502, { error: 'upstream', params: { message: e.message } });
  }
});

await load();
server.listen(cfg.port, () => {
  log(`Spokarr ${VERSION} listening on port ${cfg.port} (Audible ${REGION_KEY}, language ${cfg.contentLanguage})`);
  if (!cfg.indexer.url) log('Warning: NEWZNAB_URL is not set – requests cannot search for releases');
  if (!cfg.sab.key) log('Warning: SAB_API_KEY is not set – requests cannot be downloaded');
  if (!absEnabled()) log('Note: Audiobookshelf is not configured – library status and auto-match are disabled');
});
setInterval(poll, 15000);
poll();

// Audible catalog (public API, no account needed)
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, state } from './store.mjs';
import { cached, fetchJson, log, norm, stripHtml, UserError } from './util.mjs';

export const REGIONS = {
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
export const region = () => REGIONS[state.settings.general.region] || REGIONS.us;
export const contentLanguage = () => state.settings.general.contentLanguage || region().lang;
const base = () => `https://${region().host}/1.0/catalog/products`;

const RG = 'contributors,media,product_attrs,product_desc,product_extended_attrs,series,rating';
const BOOK_TYPES = new Set(['SinglePartBook', 'MultiPartBook']);

// Audible throttles hard: a handful of parallel requests is enough to make it answer 503 for
// minutes, on every endpoint. So at most three requests in flight, 120 ms apart, and up to four
// attempts with growing backoff on 502/503/429.
const MAX_PARALLEL = 3;
const GAP_MS = 120;
const RETRY_STATUS = [429, 502, 503];
let inFlight = 0;

async function limited(fn) {
  while (inFlight >= MAX_PARALLEL) await new Promise((r) => setTimeout(r, 50));
  inFlight++;
  try {
    const v = await fn();
    await new Promise((r) => setTimeout(r, GAP_MS));
    return v;
  } finally {
    inFlight--;
  }
}

async function audibleFetch(url, opts = {}, timeout = 20000) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 900 * 2 ** (attempt - 1)));
    try {
      return await limited(() => fetchJson(url, opts, timeout));
    } catch (e) {
      last = e;
      if (!RETRY_STATUS.includes(e.status)) throw e;
      log(`Audible answered ${e.status}, attempt ${attempt + 1}`);
    }
  }
  throw last;
}

async function audible(params) {
  const u = new URL(base());
  for (const [k, v] of Object.entries({ response_groups: RG, image_sizes: '500,1024', num_results: 30, ...params })) u.searchParams.set(k, v);
  return audibleFetch(u, { headers: { Accept: 'application/json' } });
}
export function mapProduct(p) {
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
export async function searchAudible(params, { languageOnly = false } = {}) {
  const lang = contentLanguage();
  const d = await audible(params);
  return (d.products || [])
    .filter((p) => !p.content_delivery_type || BOOK_TYPES.has(p.content_delivery_type))
    .filter((p) => !languageOnly || p.language === lang)
    .map(mapProduct);
}
const CATEGORY_TTL = 24 * 3600e3;
const catUrl = (path = '') => new URL(`https://${region().host}/1.0/catalog/categories${path}`);

/** Sort orders. The API only supports BestSellers and AvgRating in a useful way,
 *  everything else is sorted locally after loading. */
export const SORTS = {
  popular: 'BestSellers',
  hot: 'BestSellers',      // current bestsellers (best of the last 12 months)
  new: 'BestSellers',      // newest first (last 18 months, by date)
  old: 'BestSellers',      // oldest first
  rating: 'AvgRating',     // best rated
  long: 'BestSellers',     // longest first
};

/**
 * Whole category tree of the region as a flat list including the path.
 * The API only returns the children of a single node, so the tree is built
 * bottom-up level by level and cached for 24 hours afterwards.
 */
const catCacheFile = () => path.join(DATA_DIR, `categories-${state.settings.general.region}.json`);

const readCatCache = () => {
  try {
    const d = JSON.parse(fs.readFileSync(catCacheFile(), 'utf8'));
    return Array.isArray(d.items) && d.items.length ? d : null;
  } catch {
    return null;
  }
};

/**
 * Whole category tree as a flat list including the path. Building it costs ~200
 * requests (Audible throttles that), so the result is kept on disk and in memory for
 * 24 hours. If the build fails, an older snapshot is used instead of an empty page.
 */
export async function categoryIndex() {
  const disk = readCatCache();
  if (disk && Date.now() - disk.at < CATEGORY_TTL) return disk.items;
  let items;
  try {
    items = await cached(`catindex:${state.settings.general.region}`, CATEGORY_TTL, async () => {
      const d = await audibleFetch(catUrl(), { headers: { Accept: 'application/json' } });
      const all = (d.categories || []).map((c) => ({ id: c.id, name: c.name, depth: 0, path: c.name }));
      let level = all.slice();
      // Counted, not swallowed silently: a throttled build would otherwise be written to disk as a
      // snapshot with branches missing and stay there for 24 h.
      let failed = 0;
      for (let depth = 1; depth <= 3; depth++) {
        const next = [];
        for (let i = 0; i < level.length; i += 6) {
          const batch = level.slice(i, i + 6);
          const res = await Promise.all(batch.map((n) => audibleFetch(catUrl(`/${n.id}`), { headers: { Accept: 'application/json' } })
            .catch(() => { failed++; return {}; })));
          res.forEach((r, j) => {
            for (const k of ((r.category || {}).children || [])) {
              const node = { id: k.id, name: k.name, depth, path: `${batch[j].path} > ${k.name}` };
              next.push(node);
              all.push(node);
            }
          });
        }
        level = next;
        if (!level.length) break;
      }
      all.failed = failed;
      return all;
    });
  } catch (e) {
    if (disk) {
      console.warn('[spokarr] category tree could not be refreshed, using snapshot of', new Date(disk.at).toISOString(), '-', e.message);
      return disk.items;
    }
    throw e;
  }
  // Only a complete tree becomes the new snapshot - a throttled one keeps the previous file.
  if (items.failed) {
    log(`Category tree incomplete (${items.failed} requests failed), snapshot of ${disk ? new Date(disk.at).toISOString() : 'none'} kept`);
    return items;
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(catCacheFile(), JSON.stringify({ at: Date.now(), items }));
  } catch {}
  return items;
}

/** Map a genre name or path ("Science Fiction > Space Opera") to a category node. */
export async function findGenre(genre) {
  const q = String(genre || '').trim();
  if (!q) return null;
  const idx = await categoryIndex();
  const parts = q.split(/\s*[>\/]\s*/).map((x) => x.trim()).filter(Boolean);
  const key = (s) => s.split(' > ').map(norm).join(' > ');
  if (parts.length > 1) {
    const want = parts.map(norm).join(' > ');
    return idx.find((n) => key(n.path) === want)
      || idx.find((n) => key(n.path).endsWith(' > ' + want))
      || null;
  }
  const n = norm(q);
  // The same name exists under several parents ("Science Fiction" below Liebesromane
  // and below Science Fiction & Fantasy) - prefer the branch whose parent carries it.
  const rank = (c) => {
    const parent = c.path.split(' > ').slice(-2, -1)[0] || '';
    return (norm(parent).includes(n) ? 0 : 1) * 10 + c.depth;
  };
  const exact = idx.filter((c) => norm(c.name) === n).sort((a, b) => rank(a) - rank(b));
  if (exact.length) return exact[0];
  return idx.filter((c) => norm(c.name).includes(n)).sort((a, b) => rank(a) - rank(b))[0] || null;
}

/** All genre names and paths for the picker in the settings. */
export async function genreNames() {
  const idx = await categoryIndex();
  return idx.map((c) => c.path);
}

export async function browseGenre(genre, { q = '', sort = 'popular', limit = 150 } = {}) {
  const lang = contentLanguage();
  const apiSort = sort === 'rating' ? 'AvgRating' : 'BestSellers';
  return cached(`genre:${state.settings.general.region}:${genre}:${sort}:${limit}:${q.toLowerCase()}`.replace(/\s+/g, '_'), 10 * 60e3, async () => {
    // Category tree not reachable right now (Audible throttling): fall back to keywords
    let cat = null;
    try {
      cat = await findGenre(genre);
    } catch (e) {
      console.warn('[spokarr] category tree not reachable, searching by keyword:', e.message);
    }
    if (!cat) return searchAudible({ keywords: q || genre, products_sort_by: 'Relevance', num_results: 50 }, { languageOnly: true });
    // Fetch more pages than needed: language and book type filtering drops many hits
    const pages = Math.min(6, Math.max(2, Math.ceil(limit / 50) + 1));
    const seen = new Set();
    let items = [];
    for (let page = 0; page < pages; page++) {
      const d = await audible({ category_id: cat.id, products_sort_by: apiSort, num_results: 50, page });
      const prods = d.products || [];
      for (const p of prods) {
        if (p.content_delivery_type && !BOOK_TYPES.has(p.content_delivery_type)) continue;
        if (p.language && p.language !== lang) continue;
        if (seen.has(p.asin)) continue;
        seen.add(p.asin);
        items.push(mapProduct(p));
      }
      if (prods.length < 50 || items.length >= limit * 2) break;
    }
    if (sort === 'hot' || sort === 'new') {
      const days = sort === 'hot' ? 365 : 550;
      const cutoff = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
      items = items.filter((b) => b.release && b.release >= cutoff);
    }
    if (sort === 'new' || sort === 'old') {
      items.sort((a, b) => (a.release || '').localeCompare(b.release || '') * (sort === 'new' ? -1 : 1));
    } else if (sort === 'long') {
      items.sort((a, b) => (b.minutes || 0) - (a.minutes || 0));
    }
    const n = norm(q);
    if (n) items = items.filter((b) => norm(b.title).includes(n) || (b.authors || []).some((a) => norm(a).includes(n)));
    return items.slice(0, limit);
  });
}

export async function getBook(asin) {
  return cached(`book:${state.settings.general.region}:${asin}`, 6 * 3600e3, async () => {
    const u = new URL(`${base()}/${encodeURIComponent(asin)}`);
    u.searchParams.set('response_groups', RG);
    u.searchParams.set('image_sizes', '500,1024');
    const d = await audibleFetch(u, { headers: { Accept: 'application/json' } }).catch((e) => {
      if (e.status === 404) throw new UserError('book_not_found', {}, 404);
      throw e;
    });
    if (!d.product?.title) throw new UserError('book_not_found', {}, 404);
    return mapProduct(d.product);
  });
}

/** Several pages of a search, deduplicated by ASIN – the API returns at most 50 per page and the
 *  language filter drops entries, so pages are pulled until the wanted number is reached. */
async function searchPaged(params, limit, { languageOnly = false } = {}) {
  const out = [];
  const seen = new Set();
  for (let page = 1; page <= 4 && out.length < limit; page++) {
    const got = await searchAudible({ ...params, num_results: 50, page }, { languageOnly });
    if (!got.length) break;
    for (const b of got) if (b.asin && !seen.has(b.asin)) { seen.add(b.asin); out.push(b); }
  }
  return out.slice(0, limit);
}

/**
 * The rows of the Discover page, each with a fetcher that takes the wanted number of titles.
 * Used both for the preview rows and for the page behind a row heading.
 */
function rowDefs(sortOverride = '') {
  const g = state.settings.general;
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  return [
    ['popular', null, (limit) => searchPaged({ products_sort_by: 'BestSellers' }, limit, { languageOnly: true })],
    ['new', null, async (limit) => (await searchPaged({ products_sort_by: 'BestSellers' }, Math.max(limit * 2, 50), { languageOnly: true }))
      .filter((b) => b.release && b.release <= today && b.release >= cutoff)],
    ...(g.discoverRows || []).filter((r) => r.title).map((row, i) => ['custom' + i, row.title, async (limit) => {
      let items = await searchPaged({ products_sort_by: 'BestSellers', keywords: row.keywords || row.title }, limit * 2, { languageOnly: true });
      const narr = norm(row.narrator);
      if (narr) items = items.filter((b) => b.narrators.some((n) => norm(n) === narr));
      return items;
    }]),
    // Custom genre rows: resolve the Audible category node and show its bestsellers
    ...(g.discoverGenres || []).filter(Boolean).map((genre, i) => ['genre' + i, genre,
      (limit) => browseGenre(genre, { sort: sortOverride || g.genreSort || 'popular', limit })]),
  ];
}

export async function discoverRows(sortOverride = '') {
  const g = state.settings.general;
  const limit = g.rowItems || 20;
  return cached(`discover:${g.region}:${contentLanguage()}:${JSON.stringify(g.discoverRows)}:${JSON.stringify(g.discoverGenres || [])}:${sortOverride}:${g.genreSort || ''}:${limit}`, 30 * 60e3, async () => {
    const jobs = rowDefs(sortOverride);
    return Promise.all(jobs.map(async ([id, title, fn]) => {
      try { return { id, title, items: (await fn(limit)).slice(0, limit) }; } catch (e) { return { id, title, items: [], error: e.message }; }
    }));
  });
}

/** One row on its own page: the same row as on Discover, only with more titles. */
export async function discoverRow(id, { sort = '', limit = 100 } = {}) {
  const def = rowDefs(sort).find(([rid]) => rid === id);
  if (!def) throw new UserError('row_unknown', {}, 404);
  const [rid, title, fn] = def;
  const g = state.settings.general;
  const items = await cached(`row:${g.region}:${contentLanguage()}:${rid}:${sort}:${limit}`, 10 * 60e3,
    () => fn(limit).catch((e) => {
      log(`Row ${rid} could not be loaded:`, e.message);
      throw new UserError('discover_unavailable', {}, 502);
    }));
  return { id: rid, title, items: items.slice(0, limit) };
}

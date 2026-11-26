// Newznab indexers and release scoring
import { contentLanguage } from './audible.mjs';
import { clientFor } from './downloads.mjs';
import { state } from './store.mjs';
import { cleanTitle, decodeXml, fetchJson, GERMAN_TRANSLIT, log, norm, trimUrl, UserError } from './util.mjs';

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
function apiUrl(ix, params) {
  const u = new URL(trimUrl(ix.url));
  if (!u.pathname.endsWith('/api')) u.pathname = u.pathname.replace(/\/?$/, '/api');
  for (const [k, v] of Object.entries({ ...params, apikey: ix.apiKey })) u.searchParams.set(k, v);
  return u;
}
async function query(ix, params) {
  let r;
  try { r = await fetch(apiUrl(ix, params), { signal: AbortSignal.timeout(30000) }); } catch (e) { throw new UserError('indexer_unreachable', { name: ix.name }); }
  if (!r.ok) throw new UserError('indexer_error', { name: ix.name, status: r.status });
  const xml = await r.text();
  const err = xml.match(/<error[^>]*code="(\d+)"[^>]*description="([^"]+)"/);
  if (err) throw new UserError(err[1] === '100' ? 'indexer_bad_key' : 'indexer_error', { name: ix.name, status: err[2] });
  return xml;
}

/** Connection test: capabilities request, returns the indexer's audio categories. */
export async function testIndexer(ix) {
  if (!ix.url || !ix.apiKey) throw new UserError('indexer_incomplete');
  const xml = await query(ix, { t: 'caps' });
  const cats = [...xml.matchAll(/<(?:sub)?cat(?:egory)?\s+id="(\d+)"\s+name="([^"]+)"/g)]
    .map((m) => ({ id: Number(m[1]), name: decodeXml(m[2]) }))
    .filter((c) => c.id >= 3000 && c.id < 4000);
  // the test needs a search too – caps alone does not check the API key on every indexer
  await query(ix, { t: 'search', q: 'test', cat: ix.categories || '3030', limit: '1' });
  return { categories: cats };
}

async function search(ix, q) {
  const xml = await query(ix, { t: 'search', q, cat: ix.categories || '3030', limit: '100' });
  return parseNewznab(xml).map((r) => ({ ...r, indexer: ix.name, indexerId: ix.id, protocol: 'usenet' }));
}

// ---------- Prowlarr ----------
export const prowlarrEnabled = (conf = state.settings.prowlarr) => !!conf && conf.enabled === true && !!(conf.url && conf.apiKey);
const prowlarrHeaders = (conf) => ({ 'X-Api-Key': conf.apiKey, Accept: 'application/json' });

/** Connection test: version and the indexers configured in Prowlarr. */
export async function testProwlarr(conf) {
  if (!conf.url || !conf.apiKey) throw new UserError('prowlarr_incomplete');
  const base = trimUrl(conf.url);
  const status = await fetchJson(`${base}/api/v1/system/status`, { headers: prowlarrHeaders(conf) }, 10000)
    .catch((e) => { throw new UserError(e.status === 401 ? 'prowlarr_bad_key' : 'prowlarr_unreachable', { url: base }); });
  const ix = await fetchJson(`${base}/api/v1/indexer`, { headers: prowlarrHeaders(conf) }, 10000).catch(() => []);
  return {
    version: status.version,
    indexers: (ix || []).filter((i) => i.enable).map((i) => ({ name: i.name, protocol: i.protocol })),
  };
}

/** One search across all indexers in Prowlarr (usenet and torrent). */
async function searchProwlarr(q) {
  const conf = state.settings.prowlarr;
  const u = new URL(`${trimUrl(conf.url)}/api/v1/search`);
  u.searchParams.set('query', q);
  u.searchParams.set('type', 'search');
  u.searchParams.set('limit', '100');
  for (const c of String(conf.categories || '3030').split(',').map((x) => x.trim()).filter(Boolean)) u.searchParams.append('categories', c);
  const list = await fetchJson(u, { headers: prowlarrHeaders(conf) }, 45000)
    .catch((e) => { throw new UserError(e.status === 401 ? 'prowlarr_bad_key' : 'prowlarr_unreachable', { url: conf.url }); });
  return (Array.isArray(list) ? list : []).map((r) => ({
    title: r.title || '',
    guid: r.guid || r.downloadUrl || r.magnetUrl,
    link: r.downloadUrl || r.magnetUrl || '',
    size: Number(r.size) || 0,
    cats: (r.categories || []).map((c) => c.id),
    pubDate: r.publishDate || '',
    indexer: r.indexer ? `${r.indexer} (Prowlarr)` : 'Prowlarr',
    indexerId: `prowlarr:${r.indexerId}`,
    protocol: r.protocol === 'torrent' ? 'torrent' : 'usenet',
    seeders: r.protocol === 'torrent' ? Number(r.seeders) || 0 : null,
  })).filter((r) => r.link);
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
// Words that do not make a title distinctive (articles, "and", "of" …)
const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'der', 'die', 'das', 'und', 'ein', 'eine', 'von', 'im', 'le', 'la', 'les', 'el', 'il']);

export function scoreRelease(book, rel) {
  const n = norm(rel.title);
  const words = new Set(n.split(' '));
  const titleWords = norm(cleanTitle(book.title)).split(' ').filter((w) => w.length > 1);
  const hit = titleWords.filter((w) => words.has(w)).length / Math.max(1, titleWords.length);
  const minus = [];
  const plus = [];
  let s = Math.round(hit * 60);
  if (hit < 0.75) minus.push('title_mismatch');

  const authWords = book.authors.flatMap((x) => norm(x).split(' ')).filter((w) => w.length > 2);
  const narrWords = book.narrators.flatMap((x) => norm(x).split(' ')).filter((w) => w.length > 2);
  // Words the narrator shares with the author ("Michael Ende" reading "Momo") are in almost every
  // release name, so they prove nothing. An author reading their own book only counts with an
  // explicit "read by" / "gelesen von" / "Autorenlesung".
  const ownNarr = narrWords.filter((w) => !authWords.includes(w));
  const readMarker = /\b(read by|narrated by|gelesen von|gesprochen von|autorenlesung|liest)\b/.test(n);
  const narratorHit = ownNarr.length ? ownNarr.some((w) => words.has(w)) : narrWords.length > 0 && readMarker && narrWords.some((w) => words.has(w));
  if (narratorHit) { s += 25; plus.push('narrator'); }
  const authorHit = authWords.some((w) => words.has(w));
  if (authorHit) { s += 5; plus.push('author'); }
  // A short title ("The Knot", "Momo") is contained in many other names ("Untying the Knot"), so the
  // title alone proves nothing there: the author has to be named too. Optional for every title.
  const shortTitle = titleWords.filter((w) => !STOPWORDS.has(w)).length <= 2;
  const authorMissing = authWords.length > 0 && !authorHit && (shortTitle || state.settings.general.requireAuthor === true);
  if (authorMissing) { s -= 20; minus.push('author_missing'); }

  // Language: bonus when the release names the book's language, penalty when it names another one
  const bookLang = book.language || contentLanguage();
  const named = Object.entries(LANG_TOKENS).filter(([, toks]) => toks.some((t) => words.has(t))).map(([l]) => l);
  const looksEnglish = named.includes('english') || (!named.length && ENGLISH_STOPWORDS.test(n));
  if (named.includes(bookLang)) { s += 10; plus.push('language'); }
  else if ((bookLang !== 'english' && looksEnglish) || named.some((l) => l !== bookLang)) { s -= 50; minus.push('wrong_language'); }

  const isDrama = (t) => /\bh(?:oe|o)?rspiel\b|\bhoorspel\b|full cast|dramati[sz](?:ed|ation)|audio drama|radio (?:drama|play|adapt\w*)|\bbbc radio\b/.test(t);
  const wantDrama = book.drama === true || isDrama(norm(book.title + ' ' + book.subtitle));
  if (isDrama(n) && !wantDrama) { s -= 30; minus.push('drama'); }
  // A manual request for a radio play: readings are shown, but the play is preferred
  if (book.drama === true) { if (isDrama(n)) { s += 15; plus.push('drama'); } else { s -= 20; minus.push('not_drama'); } }
  const unabr = /\bungekuerzt\b|\bunabridged\b/.test(n);
  const abr = !unabr && /\bgekuerzt\b|\babridged\b/.test(n);
  if (unabr && !book.abridged) { s += 5; plus.push('unabridged'); }
  if (abr && !book.abridged) { s -= 25; minus.push('abridged'); }

  if (book.minutes && rel.size) {
    const mbPerMin = rel.size / 1048576 / book.minutes;
    if (mbPerMin < 0.15) { s -= 30; minus.push('too_small'); }
    else if (mbPerMin > 4) { s -= 10; minus.push('too_large'); }
  }
  if (rel.protocol === 'torrent' && rel.seeders === 0) { s -= 40; minus.push('no_seeders'); }
  // Manual requests for one particular reading ("Nigel Planer"): without the narrator in the release
  // name it is most likely the current edition – shown, but never picked automatically
  const narratorMissing = book.requireNarrator && !plus.includes('narrator');
  if (narratorMissing) minus.push('narrator_missing');
  return { score: s, ok: hit >= 0.75 && s >= 50 && !minus.includes('wrong_language') && !minus.includes('no_seeders') && !narratorMissing && !authorMissing, minus, plus };
}

export async function findReleases(book) {
  const indexers = (state.settings.indexers || []).filter((i) => i.enabled && i.url && i.apiKey);
  const useProwlarr = prowlarrEnabled();
  if (!indexers.length && !useProwlarr) throw new UserError('indexer_not_configured');
  const base = cleanTitle(book.title);
  // A wanted narrator also goes into the search – indexers often name the reader of older editions
  const withNarrator = book.requireNarrator && book.narrators[0] ? [`${base} ${book.narrators[0]}`] : [];
  const queries = [...new Set([base, GERMAN_TRANSLIT(base), ...withNarrator])].filter(Boolean);
  const seen = new Map();
  const errors = [];
  const sources = [
    ...indexers.map((ix) => ({ name: ix.name, run: (q) => search(ix, q) })),
    ...(useProwlarr ? [{ name: 'Prowlarr', run: searchProwlarr }] : []),
  ];
  await Promise.all(sources.map(async (src) => {
    for (const q of queries) {
      try {
        for (const r of await src.run(q)) if (!seen.has(r.guid)) seen.set(r.guid, r);
      } catch (e) { errors.push(e); log('Search failed:', src.name, q, e.message); }
    }
  }));
  if (!seen.size && errors.length) throw errors[0];
  return [...seen.values()]
    .map((r) => {
      const sc = scoreRelease(book, r);
      // a release is only usable if a download client for its protocol is set up
      if (!clientFor(r.protocol)) { sc.minus.push('no_client'); sc.ok = false; }
      return { ...r, ...sc };
    })
    .sort((a, b) => b.score - a.score || (b.seeders ?? 0) - (a.seeders ?? 0))
    .slice(0, 40);
}

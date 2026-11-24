// Newznab indexers and release scoring
import { contentLanguage } from './audible.mjs';
import { state } from './store.mjs';
import { cleanTitle, decodeXml, GERMAN_TRANSLIT, log, norm, trimUrl, UserError } from './util.mjs';

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
  return parseNewznab(xml).map((r) => ({ ...r, indexer: ix.name, indexerId: ix.id }));
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

export function scoreRelease(book, rel) {
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
  const bookLang = book.language || contentLanguage();
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

export async function findReleases(book) {
  const indexers = (state.settings.indexers || []).filter((i) => i.enabled && i.url && i.apiKey);
  if (!indexers.length) throw new UserError('indexer_not_configured');
  const base = cleanTitle(book.title);
  const queries = [...new Set([base, GERMAN_TRANSLIT(base)])].filter(Boolean);
  const seen = new Map();
  const errors = [];
  await Promise.all(indexers.map(async (ix) => {
    for (const q of queries) {
      try {
        for (const r of await search(ix, q)) if (!seen.has(r.guid)) seen.set(r.guid, r);
      } catch (e) { errors.push(e); log('Indexer search failed:', ix.name, q, e.message); }
    }
  }));
  if (!seen.size && errors.length) throw errors[0];
  return [...seen.values()]
    .map((r) => ({ ...r, ...scoreRelease(book, r) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
}

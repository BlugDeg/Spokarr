// Chaptarr as the backend: Spokarr keeps users, requests and approval, Chaptarr finds, downloads and
// imports the book (like Seerr hands requests to Sonarr/Radarr). Readarr-style API v1 with X-Api-Key.
// Chaptarr has its own book ids (Goodreads/Hardcover), not ASINs – the book is matched by title and
// author, and only the requested book is monitored, not the rest of the author's work.
import { state } from './store.mjs';
import { cleanTitle, norm, trimUrl, UserError } from './util.mjs';

export const chaptarrEnabled = (c = state.settings.chaptarr) => !!c && c.enabled === true && !!c.url && !!c.apiKey;

async function api(conf, method, path, body) {
  let r;
  try {
    r = await fetch(`${trimUrl(conf.url)}/api/v1${path}`, {
      method,
      headers: { 'X-Api-Key': conf.apiKey || '', Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new UserError('chaptarr_unreachable', { url: trimUrl(conf.url) });
  }
  if (r.status === 401) throw new UserError('chaptarr_bad_key');
  if (r.status === 404) return null;
  const text = await r.text();
  let d = null;
  try { d = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!r.ok) {
    const message = Array.isArray(d) ? d.map((x) => x.errorMessage).filter(Boolean).join('; ') : d?.title || d?.message || text.slice(0, 200);
    throw new UserError('chaptarr_error', { status: r.status, message });
  }
  return d;
}

/** Connection test: version plus what can be picked in the settings (audiobook folders and profiles). */
export async function testChaptarr(conf) {
  const st = await api(conf, 'GET', '/system/status');
  if (!st || !/chaptarr|readarr/i.test(st.appName || '')) throw new UserError('chaptarr_not_chaptarr');
  const [folders, quality, metadata] = await Promise.all([
    api(conf, 'GET', '/rootfolder'), api(conf, 'GET', '/qualityprofile'), api(conf, 'GET', '/metadataprofile'),
  ]);
  const audio = (p) => p.profileType === 'audiobook' || p.profileType === 1 || /audio/i.test(p.name || '');
  return {
    version: st.version || '', categoryExists: true,
    // folderType 1 = audiobooks; a folder that also takes ebooks next to them works as well
    rootFolders: (folders || []).filter((f) => f.folderType === 1 || f.audiobookQualityProfileId || f.isEffectiveDefaultAudiobook)
      .map((f) => ({ path: f.path, name: f.name || f.path, qualityProfileId: f.audiobookQualityProfileId || null, metadataProfileId: f.audiobookMetadataProfileId || null })),
    qualityProfiles: (quality || []).filter(audio).map((p) => ({ id: p.id, name: p.name })),
    metadataProfiles: (metadata || []).filter(audio).map((p) => ({ id: p.id, name: p.name })),
  };
}

const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'der', 'die', 'das', 'und', 'ein', 'eine', 'le', 'la', 'les']);
// Series suffixes differ between Audible ("…, Book 3", "Band 3") and Chaptarr ("(Harry Potter, #3)"),
// so they are left out of the comparison
const SERIES_SUFFIX = /[,:–-]?\s*\b(book|band|teil|folge|volume|vol|episode|tome|part|buch)\s*\d+\b.*$/i;
const words = (s) => [...new Set(norm(cleanTitle(s).replace(SERIES_SUFFIX, '')).split(' ').filter((w) => w.length > 1 && !STOP.has(w)))];
// Collections and companion books carry the title as well – they are never the requested book
const NOT_THE_BOOK = /\b(collection|box ?set|boxed set|books? \d+ ?[-–] ?\d+|omnibus|workbook|study guide|summary|sammelband|gesamtausgabe)\b/i;

/**
 * How well a Chaptarr lookup result fits the requested book: the author has to match, then the title
 * words. Extra words count against it, so "… Student Workbook" or "Summary of …" lose against the
 * book itself.
 */
export function matchScore(book, cand) {
  const candAuthor = norm(cand.author?.authorName || '');
  const authorOk = (book.authors || []).some((a) => {
    const parts = norm(a).split(' ').filter((w) => w.length > 1);
    const last = parts[parts.length - 1];
    return last && candAuthor.split(' ').includes(last);
  });
  if (!authorOk) return 0;
  if (cand.isOmnibus || (NOT_THE_BOOK.test(cand.title || '') && !NOT_THE_BOOK.test(book.title || ''))) return 0;
  const want = words(book.title);
  if (!want.length) return 0;
  const have = words(cand.title);
  const hit = want.filter((w) => have.includes(w)).length / want.length;
  if (hit < 0.75) return 0;
  const extra = have.filter((w) => !want.includes(w)).length / Math.max(1, have.length);
  // more than half of the candidate's title is something else: a companion book, not the book
  if (extra > 0.5) return 0;
  return hit - extra;
}

async function lookup(conf, term) {
  return (await api(conf, 'GET', `/book/lookup?term=${encodeURIComponent(term)}`)) || [];
}

/** Finds the book in Chaptarr, adds it (monitored, audiobook) and starts the search. */
export async function sendToChaptarr(book) {
  const conf = state.settings.chaptarr;
  if (!conf.rootFolder || !conf.qualityProfileId || !conf.metadataProfileId) throw new UserError('chaptarr_incomplete');
  const title = cleanTitle(book.title);
  let cands = await lookup(conf, `${title} ${book.authors[0] || ''}`.trim());
  let best = cands.map((c) => ({ c, s: matchScore(book, c) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0];
  if (!best) {
    cands = await lookup(conf, title);
    best = cands.map((c) => ({ c, s: matchScore(book, c) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0];
  }
  if (!best) throw new UserError('chaptarr_no_match', { title });
  const cand = best.c;

  // Already in Chaptarr (requested before, or part of the library)?
  let existing = null;
  if (Number(cand.localBookId)) existing = await api(conf, 'GET', `/book/${Number(cand.localBookId)}`);
  if (!existing) existing = ((await api(conf, 'GET', '/book')) || []).find((b) => b.foreignBookId === cand.foreignBookId) || null;

  let bookId;
  if (existing) {
    bookId = existing.id;
    if (!existing.monitored || existing.audiobookMonitored === false) {
      await api(conf, 'PUT', '/book/monitor', { bookIds: [bookId], monitored: true });
    }
  } else {
    const body = {
      ...cand,
      monitored: true, audiobookMonitored: true, ebookMonitored: false, mediaType: 'audiobook',
      addOptions: { addType: 'manual', searchForNewBook: false },
      author: {
        ...cand.author,
        qualityProfileId: Number(conf.qualityProfileId), metadataProfileId: Number(conf.metadataProfileId),
        rootFolderPath: conf.rootFolder, monitored: false, monitorNewItems: 'none',
        addOptions: { monitor: 'none', searchForMissingBooks: false },
      },
    };
    const added = await api(conf, 'POST', '/book', body);
    bookId = added?.id || ((await api(conf, 'GET', '/book')) || []).find((b) => b.foreignBookId === cand.foreignBookId)?.id;
  }
  if (!bookId) throw new UserError('chaptarr_error', { status: '', message: 'book was not added' });
  await api(conf, 'POST', '/command', { name: 'BookSearch', bookIds: [bookId] });
  return { ref: bookId, title: cand.title };
}

/** "Search again": Chaptarr searches once more, nothing is removed. */
export async function chaptarrSearchAgain(bookId) {
  await api(state.settings.chaptarr, 'POST', '/command', { name: 'BookSearch', bookIds: [Number(bookId)] });
}

const fmtLeft = (s) => (/^\d{1,2}:\d{2}:\d{2}$/.test(String(s || '')) ? s : String(s || '').replace(/\.\d+$/, ''));

export async function chaptarrStatus(bookId) {
  const conf = state.settings.chaptarr;
  const book = await api(conf, 'GET', `/book/${bookId}`);
  if (!book) return { state: 'missing' };
  // Asked directly: the book's statistics lag behind an import
  const files = (await api(conf, 'GET', `/bookfile?bookId=${bookId}`)) || [];
  const file = files.find((f) => f.path);
  if (file) return { state: 'done', path: file.path.replace(/\/[^/]+$/, ''), imported: true };
  const queue = (await api(conf, 'GET', '/queue?pageSize=200&includeUnknownAuthorItems=false')) || {};
  const q = (queue.records || []).find((x) => x.bookId === Number(bookId));
  if (q) {
    const size = Number(q.size) || 0;
    const left = Number(q.sizeleft) || 0;
    const problem = (q.statusMessages || []).flatMap((m) => m.messages || []).join(' ') || q.errorMessage || '';
    if (q.trackedDownloadState === 'importFailed' || q.trackedDownloadStatus === 'error') {
      return { state: 'downloading', progress: 100, queued: true, message: `Chaptarr: ${problem || q.trackedDownloadState}` };
    }
    return {
      state: 'downloading',
      progress: size ? Math.round(((size - left) / size) * 1000) / 10 : 0,
      eta: q.timeleft ? fmtLeft(q.timeleft) : '',
      paused: /paused/i.test(q.status || ''),
      queued: /queued|delay|importpending/i.test(`${q.status} ${q.trackedDownloadState}`),
      message: problem ? `Chaptarr: ${problem}` : '',
    };
  }
  // Not in the queue yet: Chaptarr is still searching (or waits for its next RSS sync)
  return { state: 'downloading', progress: 0, queued: true, waiting: true };
}

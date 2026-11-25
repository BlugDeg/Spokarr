// Audiobookshelf: sign-in, library status, scan, match and tags
import { state } from './store.mjs';
import { cached, cleanTitle, fetchJson, firstAuthor, log, norm, trimUrl, uncache, UserError } from './util.mjs';

const cfg = () => state.settings.abs;
export const absEnabled = () => !!(cfg().url && cfg().apiKey);
const headers = (key = cfg().apiKey) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });

/** Checks that a URL points to an Audiobookshelf server. */
export async function absStatus(url) {
  const u = trimUrl(url);
  if (!/^https?:\/\//.test(u)) throw new UserError('abs_invalid_url');
  const d = await fetchJson(`${u}/status`, {}, 10000).catch(() => { throw new UserError('abs_unreachable', { url: u }); });
  if (d.app !== 'audiobookshelf') throw new UserError('abs_not_abs', { url: u });
  return { version: d.serverVersion, initialized: d.isInit };
}

/** Signs a user in against Audiobookshelf. Returns the ABS user and a token valid for that user. */
export async function absLogin(username, password, url = cfg().url) {
  if (!url) throw new UserError('abs_not_configured', {}, 503);
  let r;
  try {
    r = await fetch(`${trimUrl(url)}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-return-tokens': 'true' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new UserError('abs_unreachable', { url }, 503);
  }
  if (r.status === 401 || r.status === 403) throw new UserError('login_failed', {}, 401);
  if (r.status === 429) throw new UserError('login_rate_limited', {}, 429);
  if (!r.ok) throw new UserError('abs_error', { status: r.status }, 502);
  const d = await r.json();
  const u = d.user;
  if (!u?.id) throw new UserError('abs_error', { status: 'no user' }, 502);
  if (u.isActive === false || u.isLocked) throw new UserError('login_disabled', {}, 403);
  return {
    user: { id: u.id, username: u.username, type: u.type, email: u.email || null },
    token: u.accessToken || u.token || null,
  };
}

/** Creates a permanent API key for Spokarr, using the token of an ABS admin (first setup). */
export async function absCreateApiKey(token, userId, url = cfg().url) {
  const r = await fetch(`${trimUrl(url)}/api/api-keys`, {
    method: 'POST', headers: headers(token),
    body: JSON.stringify({ name: 'Spokarr', isActive: true, userId }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) return null; // Audiobookshelf before 2.26 has no API keys – the admin can paste a token in the settings
  const d = await r.json();
  return d.apiKey?.apiKey || null;
}

export async function absLibraries(url = cfg().url, key = cfg().apiKey) {
  const d = await fetchJson(`${trimUrl(url)}/api/libraries`, { headers: headers(key) }, 10000)
    .catch((e) => { throw new UserError(e.status === 401 ? 'abs_bad_key' : 'abs_unreachable', { url }); });
  return (d.libraries || []).map((l) => ({
    id: l.id, name: l.name, mediaType: l.mediaType, folders: (l.folders || []).map((f) => f.fullPath),
  }));
}
export async function absUsers() {
  const d = await fetchJson(`${cfg().url}/api/users`, { headers: headers() }, 10000);
  return (d.users || []).map((u) => ({ id: u.id, username: u.username, type: u.type, isActive: u.isActive !== false }));
}

/**
 * Creates a normal Audiobookshelf user (invite links). Needs an API key of an ABS admin – the key
 * Spokarr creates during the first setup belongs to the owner and has these rights.
 */
export async function absCreateUser(username, password) {
  if (!absEnabled()) throw new UserError('abs_not_configured', {}, 503);
  let r;
  try {
    r = await fetch(`${trimUrl(cfg().url)}/api/users`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({
        username, password, type: 'user', isActive: true,
        permissions: { download: true, update: false, delete: false, upload: false, accessAllLibraries: true, accessAllTags: true, accessExplicitContent: true },
        librariesAccessible: [], itemTagsSelected: [],
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new UserError('abs_unreachable', { url: cfg().url }, 503);
  }
  const body = await r.text();
  if (r.status === 401 || r.status === 403) throw new UserError('abs_no_admin', {}, 502);
  if (!r.ok) {
    if (/taken|exists/i.test(body)) throw new UserError('invite_username_taken', {}, 409);
    throw new UserError('abs_error', { status: r.status }, 502);
  }
  let d = {};
  try { d = JSON.parse(body); } catch { /* checked below */ }
  if (!d.user?.id) throw new UserError('abs_error', { status: 'no user' }, 502);
  return { id: d.user.id, username: d.user.username, type: d.user.type };
}

async function libraryId() {
  if (cfg().libraryId) return cfg().libraryId;
  const lib = (await absLibraries()).find((l) => l.mediaType === 'book');
  return lib?.id || '';
}

/** Plausible person name – keeps library folders like "!! Sorted" or "01 Hörbücher" out. */
const looksLikeName = (s) => /^\p{L}[\p{L}\p{N}.,'’&-]*(\s+[\p{L}\p{N}.,'’&-]+){0,4}$/u.test(s)
  && String(s).trim().length >= 3;

/**
 * Author from the folder name when ABS has no metadata. Two layouts are in use:
 * "Author - Series - Title" in one folder, and "Author/Title" (the layout Spokarr itself creates on
 * import), where the last folder is the title and the author is its parent.
 */
export const authorFromPath = (p) => {
  const segs = String(p || '').split('/').map((s) => s.trim()).filter(Boolean);
  const last = segs[segs.length - 1] || '';
  const [first] = last.split(' - ');
  if (last.includes(' - ') && looksLikeName(first.trim())) return firstAuthor(first.trim());
  const parent = segs[segs.length - 2] || '';
  return looksLikeName(parent) ? firstAuthor(parent) : '';
};

export async function absItems() {
  if (!absEnabled()) return [];
  return cached('abs:items', 60e3, async () => {
    const lib = await libraryId();
    const d = await fetchJson(`${cfg().url}/api/libraries/${lib}/items?limit=0&minified=1`, { headers: headers() });
    return (d.results || []).map((i) => ({
      id: i.id, path: i.path,
      asin: i.media?.metadata?.asin || '',
      key: norm(cleanTitle(i.media?.metadata?.title || '')),
      author: norm(firstAuthor(i.media?.metadata?.authorName) || i.media?.metadata?.authors?.[0]?.name || authorFromPath(i.path)),
    }));
  }).catch((e) => { log('Audiobookshelf unreachable:', e.message); return []; });
}

export async function absScan() {
  const lib = await libraryId();
  const r = await fetch(`${cfg().url}/api/libraries/${lib}/scan?force=1`, { method: 'POST', headers: headers() });
  uncache('abs:items');
  return r.ok;
}
export async function absMatch(itemId, asin, provider) {
  const r = await fetch(`${cfg().url}/api/items/${itemId}/match`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ provider, asin, overrideDefaults: true }),
  });
  return r.ok;
}
export async function absAddTags(itemId, tags) {
  const item = await fetchJson(`${cfg().url}/api/items/${itemId}`, { headers: headers() });
  const merged = [...new Set([...(item.media?.tags || []), ...tags])];
  const r = await fetch(`${cfg().url}/api/items/${itemId}/media`, {
    method: 'PATCH', headers: headers(), body: JSON.stringify({ tags: merged }),
  });
  return r.ok;
}

// ---------- Chapters ----------
const looksLikeFileName = (t) => /\.(mp3|m4a|m4b|flac|ogg|opus)$/i.test(t) || /^(cd|disc|track|part)?[\s_-]*\d+[\s_-]/i.test(t);

/**
 * Releases split into many files (one per CD track) give one chapter per file named like the file.
 * Better chapters, in this order:
 *  1. title tags of the files – consecutive files with the same title become one chapter
 *  2. Audible chapters (via Audiobookshelf/Audnexus) – only if the runtime matches within 1 %,
 *     otherwise the chapter marks would drift (other editions often have different pauses)
 */
export async function absImproveChapters(itemId, asin, region) {
  const item = await fetchJson(`${cfg().url}/api/items/${itemId}?expanded=1`, { headers: headers() });
  const files = [...(item.media?.audioFiles || [])].sort((a, b) => a.index - b.index);
  const current = item.media?.chapters || [];
  const duration = files.reduce((s, a) => s + (a.duration || 0), 0);
  if (files.length < 2 || !duration) return 'kept';
  const fileBased = current.length === files.length || current.every((c) => looksLikeFileName(c.title || ''));
  if (current.length && !fileBased) return 'kept';

  let chapters = null;
  let source = '';
  const titles = files.map((a) => (a.metaTags?.tagTitle || '').trim());
  if (titles.every(Boolean)) {
    const grouped = [];
    let t = 0;
    files.forEach((a, i) => {
      if (!grouped.length || grouped.at(-1).title !== titles[i]) grouped.push({ id: grouped.length, start: t, end: t + a.duration, title: titles[i] });
      else grouped.at(-1).end = t + a.duration;
      t += a.duration;
    });
    // only useful if files really share titles and the titles are not just file names
    if (grouped.length >= 2 && grouped.length < files.length && !grouped.every((g) => looksLikeFileName(g.title))) {
      chapters = grouped;
      source = 'tags';
    }
  }
  if (!chapters && asin) {
    const d = await fetchJson(`${cfg().url}/api/search/chapters?asin=${encodeURIComponent(asin)}&region=${encodeURIComponent(region)}`, { headers: headers() }).catch(() => null);
    const audible = d?.chapters || [];
    const runtime = (d?.runtimeLengthMs || 0) / 1000;
    if (audible.length >= 2 && runtime && Math.abs(runtime - duration) / duration < 0.01) {
      chapters = audible.map((c, i) => ({
        id: i, title: c.title,
        start: c.startOffsetMs / 1000,
        end: i < audible.length - 1 ? audible[i + 1].startOffsetMs / 1000 : duration,
      }));
      source = 'audible';
    }
  }
  if (!chapters) return 'kept';
  const r = await fetch(`${cfg().url}/api/items/${itemId}/chapters`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ chapters }),
  });
  return r.ok ? `${source}:${chapters.length}` : 'failed';
}

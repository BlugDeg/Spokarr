// Audiobookshelf: sign-in, library status, scan, match and tags
import { state } from './store.mjs';
import { cached, cleanTitle, fetchJson, log, norm, trimUrl, uncache, UserError } from './util.mjs';

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

async function libraryId() {
  if (cfg().libraryId) return cfg().libraryId;
  const lib = (await absLibraries()).find((l) => l.mediaType === 'book');
  return lib?.id || '';
}

export async function absItems() {
  if (!absEnabled()) return [];
  return cached('abs:items', 60e3, async () => {
    const lib = await libraryId();
    const d = await fetchJson(`${cfg().url}/api/libraries/${lib}/items?limit=0&minified=1`, { headers: headers() });
    return (d.results || []).map((i) => ({
      id: i.id, path: i.path,
      asin: i.media?.metadata?.asin || '',
      key: norm(cleanTitle(i.media?.metadata?.title || '')),
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

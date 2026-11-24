// qBittorrent download client (torrents), Web API v2
import { state } from './store.mjs';
import { trimUrl, UserError } from './util.mjs';

export const qbitEnabled = (conf = state.settings.qbit) => !!conf && conf.enabled === true && !!conf.url;

// Session cookie ("name=value") per server; qBittorrent expires it after inactivity, then we sign in again
const sids = new Map();

async function signIn(conf) {
  const url = trimUrl(conf.url);
  let r;
  try {
    r = await fetch(`${url}/api/v2/auth/login`, {
      method: 'POST',
      // qBittorrent checks Referer/Origin against its own address (CSRF protection)
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: url, Origin: url },
      body: new URLSearchParams({ username: conf.username || '', password: conf.password || '' }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new UserError('qbit_unreachable', { url });
  }
  if (r.status === 403) throw new UserError('qbit_banned');
  const text = await r.text();
  if (!r.ok || /fails/i.test(text)) throw new UserError('qbit_bad_login');
  // Cookie name is "SID" up to qBittorrent 4.x and "QBT_SID_<port>" from 5.0 – keep it as sent
  const m = (r.headers.get('set-cookie') || '').match(/((?:QBT_)?SID[^=]*)=([^;]+)/);
  sids.set(url, m ? `${m[1]}=${m[2]}` : ''); // empty when "bypass authentication" is on
}

export async function qbit(path, { method = 'GET', form, query, conf = state.settings.qbit, retry = true } = {}) {
  if (!conf?.url) throw new UserError('qbit_not_configured');
  const url = trimUrl(conf.url);
  if (!sids.has(url)) await signIn(conf);
  const u = new URL(`${url}/api/v2/${path}`);
  for (const [k, v] of Object.entries(query || {})) u.searchParams.set(k, v);
  let r;
  try {
    r = await fetch(u, {
      method, body: form,
      headers: { ...(sids.get(url) ? { Cookie: sids.get(url) } : {}), Referer: url, Origin: url },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new UserError('qbit_unreachable', { url });
  }
  if (r.status === 403 && retry) { sids.delete(url); return qbit(path, { method, form, query, conf, retry: false }); }
  if (!r.ok) throw new UserError('qbit_error', { status: r.status });
  const type = r.headers.get('content-type') || '';
  return type.includes('json') ? r.json() : r.text();
}

/** Connection test: version and whether the category exists. */
export async function testQbit(conf) {
  sids.delete(trimUrl(conf.url));
  const version = await qbit('app/version', { conf });
  const cats = await qbit('torrents/categories', { conf }).catch(() => ({}));
  return { version: String(version).trim(), categoryExists: !!cats?.[conf.category] };
}

/** Adds a torrent (URL or magnet). The tag identifies it later, because the API returns no hash. */
export async function sendToQbit(reqId, rel) {
  const conf = state.settings.qbit;
  const tag = `spokarr-${reqId}`;
  const form = new FormData();
  form.set('urls', rel.link);
  if (conf.category) form.set('category', conf.category);
  form.set('tags', tag);
  const out = await qbit('torrents/add', { method: 'POST', form });
  if (/fail/i.test(String(out))) throw new UserError('qbit_rejected');
  return tag;
}

const SEEDING = new Set(['uploading', 'stalledUP', 'pausedUP', 'stoppedUP', 'queuedUP', 'checkingUP', 'forcedUP']);
const fmtEta = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export async function qbitStatus(tag) {
  const list = await qbit('torrents/info', { query: { tag } });
  const t = (Array.isArray(list) ? list : []).find((x) => String(x.tags || '').split(',').map((s) => s.trim()).includes(tag));
  if (!t) return { state: 'missing' };
  if (t.state === 'error' || t.state === 'missingFiles') return { state: 'failed', message: t.state };
  const p = Number(t.progress) || 0;
  if (p >= 1 && SEEDING.has(t.state)) return { state: 'done', path: t.content_path || t.save_path, keep: true };
  return {
    state: 'downloading',
    progress: Math.round(p * 1000) / 10,
    eta: t.eta > 0 && t.eta < 8640000 ? fmtEta(t.eta) : '',
    paused: /paused|stopped/i.test(t.state),
    queued: /queued/i.test(t.state),
  };
}

/** Removes the torrent and its files – used when retrying a stalled download. */
export async function qbitRemove(tag) {
  const list = await qbit('torrents/info', { query: { tag } }).catch(() => []);
  const hashes = (Array.isArray(list) ? list : []).filter((x) => String(x.tags || '').split(',').map((s) => s.trim()).includes(tag)).map((x) => x.hash);
  if (!hashes.length) return;
  const form = new URLSearchParams({ hashes: hashes.join('|'), deleteFiles: 'true' });
  await qbit('torrents/delete', { method: 'POST', form }).catch(() => {});
}

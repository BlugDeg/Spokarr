// Deluge download client (torrents), through the JSON-RPC of the Deluge web interface (1.3 and 2.x).
// The web interface talks to the Deluge daemon; Spokarr signs in with the web password and, if the
// web interface is not connected to a daemon yet, connects it to the first one it knows.
import { state } from './store.mjs';
import { torrentSource } from './transmission.mjs';
import { trimUrl, UserError } from './util.mjs';

export const delugeEnabled = (conf = state.settings.deluge) => !!conf && conf.enabled === true && !!conf.url;

/** "http://host:8112" → ".../json"; a full address ending in /json is kept. */
export const jsonUrl = (url) => {
  const u = trimUrl(url);
  return /\/json$/.test(u) ? u : `${u}/json`;
};

// Session cookie of the web interface, per address
const cookies = new Map();
let seq = 0;

async function rpc(conf, method, params = []) {
  const url = jsonUrl(conf.url);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (cookies.has(url)) headers.Cookie = cookies.get(url);
  let r;
  try {
    r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ method, params, id: ++seq }), signal: AbortSignal.timeout(20000) });
  } catch {
    throw new UserError('deluge_unreachable', { url: trimUrl(conf.url) });
  }
  const set = r.headers.get('set-cookie');
  if (set) cookies.set(url, set.split(';')[0]);
  if (!r.ok) throw new UserError('deluge_error', { status: r.status });
  const d = await r.json().catch(() => null);
  if (!d) throw new UserError('deluge_error', { status: r.status });
  if (d.error) {
    const e = new UserError('deluge_rejected', { message: d.error.message || '' });
    e.rpcCode = d.error.code;
    throw e;
  }
  return d.result;
}

async function login(conf) {
  const ok = await rpc(conf, 'auth.login', [conf.password || '']);
  if (!ok) throw new UserError('deluge_bad_login');
}

/** Signed in and connected to a daemon – done once, again only when the session has expired. */
async function ensureSession(conf) {
  let connected;
  try {
    connected = await rpc(conf, 'web.connected');
  } catch (e) {
    // code 1 = not authenticated
    if (e.rpcCode !== 1) throw e;
    await login(conf);
    connected = await rpc(conf, 'web.connected');
  }
  if (connected) return;
  const hosts = (await rpc(conf, 'web.get_hosts')) || [];
  if (!hosts.length) throw new UserError('deluge_no_daemon');
  await rpc(conf, 'web.connect', [hosts[0][0]]);
  if (!(await rpc(conf, 'web.connected'))) throw new UserError('deluge_no_daemon');
}

/** One call, with a fresh sign-in if the session expired in between. */
export async function deluge(method, params = [], conf = state.settings.deluge) {
  if (!conf?.url) throw new UserError('deluge_not_configured');
  await ensureSession(conf);
  try {
    return await rpc(conf, method, params);
  } catch (e) {
    if (e.rpcCode !== 1) throw e;
    await login(conf);
    await ensureSession(conf);
    return rpc(conf, method, params);
  }
}

export async function testDeluge(conf) {
  cookies.delete(jsonUrl(conf.url));
  await login(conf);
  await ensureSession(conf);
  // Deluge 2 knows daemon.get_version, 1.3 only daemon.info
  const version = await rpc(conf, 'daemon.get_version').catch(() => rpc(conf, 'daemon.info')).catch(() => '');
  const plugins = (await rpc(conf, 'core.get_enabled_plugins').catch(() => [])) || [];
  // Labels need the Label plugin; without it Spokarr simply sets none
  const needsLabel = !!String(conf.label || '').trim();
  return { version: String(version || ''), categoryExists: true, labelPlugin: plugins.includes('Label'), labelWarning: needsLabel && !plugins.includes('Label') };
}

const HASH = /\b([0-9a-f]{40})\b/i;
const magnetHash = (m) => (String(m).match(/xt=urn:btih:([0-9a-f]{40})/i) || [])[1]?.toLowerCase() || null;

/** Adds the torrent and returns its info hash. */
export async function sendToDeluge(reqId, rel) {
  const conf = state.settings.deluge;
  const src = await torrentSource(rel.link);
  const opts = { add_paused: false };
  if (conf.downloadDir) opts.download_location = conf.downloadDir;
  let id;
  try {
    if (src.metainfo) id = await deluge('core.add_torrent_file', [`spokarr-${reqId}.torrent`, src.metainfo, opts]);
    else if (/^magnet:/i.test(src.filename)) id = await deluge('core.add_torrent_magnet', [src.filename, opts]);
    else id = await deluge('core.add_torrent_url', [src.filename, opts]);
  } catch (e) {
    // Already in Deluge: the message carries the hash ("Torrent already in session (…)")
    const known = String(e.params?.message || '').match(HASH)?.[1];
    if (!known) throw e;
    id = known.toLowerCase();
  }
  // Deluge answers null for a duplicate magnet link on some versions
  if (!id && /^magnet:/i.test(src.filename || '')) id = magnetHash(src.filename);
  if (!id) throw new UserError('deluge_rejected', { message: 'no torrent' });
  const label = String(conf.label || '').trim().toLowerCase();
  if (label) {
    try {
      const labels = (await deluge('label.get_labels')) || [];
      if (!labels.includes(label)) await deluge('label.add', [label]);
      await deluge('label.set_torrent', [id, label]);
    } catch { /* Label plugin off – no label */ }
  }
  return String(id).toLowerCase();
}

const FIELDS = ['name', 'state', 'progress', 'eta', 'save_path', 'download_location', 'total_wanted', 'total_done', 'is_finished', 'message'];
const fmtEta = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export async function delugeStatus(hash) {
  const t = await deluge('core.get_torrent_status', [hash, FIELDS]);
  if (!t || !Object.keys(t).length) return { state: 'missing' };
  if (t.state === 'Error') return { state: 'failed', message: t.message || 'error' };
  const p = Number(t.progress) || 0;
  const checking = t.state === 'Checking' || t.state === 'Allocating' || t.state === 'Moving';
  const complete = p >= 100 || (t.total_wanted > 0 && t.total_done >= t.total_wanted);
  if (complete && !checking) {
    // A single-file torrent lies directly in the folder, otherwise in a folder named after it
    const dir = String(t.download_location || t.save_path || '').replace(/\/+$/, '');
    return { state: 'done', path: `${dir}/${t.name}`, keep: true };
  }
  return {
    state: 'downloading',
    progress: Math.round(p * 10) / 10,
    eta: t.eta > 0 && t.eta < 8640000 ? fmtEta(t.eta) : '',
    paused: t.state === 'Paused',
    queued: t.state === 'Queued' || checking,
  };
}

/** Removes the torrent and its files – used when retrying a stalled download. */
export async function delugeRemove(hash) {
  await deluge('core.remove_torrent', [hash, true]).catch(() => {});
}

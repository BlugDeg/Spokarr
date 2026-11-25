// Transmission download client (torrents), RPC protocol (Transmission 2.80+, labels from 3.0)
import { state } from './store.mjs';
import { trimUrl, UserError } from './util.mjs';

export const transmissionEnabled = (conf = state.settings.transmission) => !!conf && conf.enabled === true && !!conf.url;

/** "http://host:9091" → ".../transmission/rpc"; a full RPC address (custom rpc-url) is kept as it is. */
export const rpcUrl = (url) => {
  const u = trimUrl(url);
  return /\/rpc$/.test(u) ? u : `${u}/transmission/rpc`;
};

// Transmission's CSRF protection: every answer 409 carries the session id to send along
const sessionIds = new Map();

export async function transmission(method, args = {}, conf = state.settings.transmission, retry = true) {
  if (!conf?.url) throw new UserError('transmission_not_configured');
  const url = rpcUrl(conf.url);
  const headers = { 'Content-Type': 'application/json' };
  if (conf.username || conf.password) headers.Authorization = 'Basic ' + Buffer.from(`${conf.username || ''}:${conf.password || ''}`).toString('base64');
  if (sessionIds.has(url)) headers['X-Transmission-Session-Id'] = sessionIds.get(url);
  let r;
  try {
    r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ method, arguments: args }), signal: AbortSignal.timeout(20000) });
  } catch {
    throw new UserError('transmission_unreachable', { url: trimUrl(conf.url) });
  }
  if (r.status === 409 && retry) {
    sessionIds.set(url, r.headers.get('x-transmission-session-id') || '');
    return transmission(method, args, conf, false);
  }
  if (r.status === 401) throw new UserError('transmission_bad_login');
  if (r.status === 403) throw new UserError('transmission_forbidden');
  if (!r.ok) throw new UserError('transmission_error', { status: r.status });
  const d = await r.json().catch(() => null);
  if (!d) throw new UserError('transmission_error', { status: r.status });
  if (d.result !== 'success') throw new UserError('transmission_rejected', { message: d.result || '' });
  return d.arguments || {};
}

/** Connection test. Labels need no setup in Transmission, so there is no category to check. */
export async function testTransmission(conf) {
  const s = await transmission('session-get', { fields: ['version', 'rpc-version', 'download-dir'] }, conf);
  return { version: String(s.version || '').split(' ')[0], categoryExists: true, downloadDir: s['download-dir'] || '' };
}

/**
 * The torrent itself. Transmission fetches a URL on its own, but cannot follow a redirect to a
 * magnet link (which Prowlarr and many indexers answer with), and it may not reach an indexer that
 * only Spokarr can reach. So Spokarr resolves the link first: magnet → passed on, .torrent → sent as
 * file content. If that fails, Transmission gets the plain URL as a last resort.
 */
async function torrentSource(link) {
  if (/^magnet:/i.test(link)) return { filename: link };
  let url = link;
  try {
    for (let hop = 0; hop < 5; hop++) {
      const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get('location') || '';
        if (/^magnet:/i.test(loc)) return { filename: loc };
        if (!loc) break;
        url = new URL(loc, url).toString();
        continue;
      }
      if (!r.ok) break;
      const buf = Buffer.from(await r.arrayBuffer());
      // bencoded dictionary: a real .torrent starts with "d" and contains "4:info"
      if (buf[0] === 0x64 && buf.includes('4:info')) return { metainfo: buf.toString('base64') };
      const text = buf.toString('utf8').trim();
      if (/^magnet:/i.test(text)) return { filename: text };
      break;
    }
  } catch { /* fall through to the plain URL */ }
  return { filename: link };
}

/** Adds the torrent and returns its info hash, which identifies it from then on. */
export async function sendToTransmission(reqId, rel) {
  const conf = state.settings.transmission;
  const args = { ...(await torrentSource(rel.link)), paused: false };
  if (conf.downloadDir) args['download-dir'] = conf.downloadDir;
  const out = await transmission('torrent-add', args);
  const t = out['torrent-added'] || out['torrent-duplicate'];
  if (!t?.hashString) throw new UserError('transmission_rejected', { message: 'no torrent' });
  // Label for overview in the Transmission UI (3.0+); older versions simply do not know labels
  if (conf.label) await transmission('torrent-set', { ids: [t.hashString], labels: [conf.label] }).catch(() => {});
  return t.hashString;
}

// Status codes of the RPC: 0 stopped, 1 check wait, 2 checking, 3 download wait, 4 downloading,
// 5 seed wait, 6 seeding
const fmtEta = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
const FIELDS = ['hashString', 'name', 'status', 'percentDone', 'leftUntilDone', 'eta', 'error', 'errorString', 'downloadDir', 'isFinished'];

export async function transmissionStatus(hash) {
  const out = await transmission('torrent-get', { ids: [hash], fields: FIELDS });
  const t = (out.torrents || [])[0];
  if (!t) return { state: 'missing' };
  // error 3 = local error (disk full, permissions …); 1/2 are tracker warnings and usually pass
  if (t.error === 3) return { state: 'failed', message: t.errorString || 'local error' };
  const p = Number(t.percentDone) || 0;
  const verifying = t.status === 1 || t.status === 2;
  if (p >= 1 && t.leftUntilDone === 0 && !verifying) {
    // A single-file torrent lies directly in the download folder, otherwise in a folder named after it
    const dir = String(t.downloadDir || '').replace(/\/+$/, '');
    return { state: 'done', path: `${dir}/${t.name}`, keep: true };
  }
  return {
    state: 'downloading',
    progress: Math.round(p * 1000) / 10,
    eta: t.eta > 0 && t.eta < 8640000 ? fmtEta(t.eta) : '',
    paused: t.status === 0,
    queued: t.status === 3 || t.status === 1,
  };
}

/** Removes the torrent and its files – used when retrying a stalled download. */
export async function transmissionRemove(hash) {
  await transmission('torrent-remove', { ids: [hash], 'delete-local-data': true }).catch(() => {});
}

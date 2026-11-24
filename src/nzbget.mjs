// NZBGet download client (usenet), JSON-RPC API
import { state } from './store.mjs';
import { cleanTitle, safeName, trimUrl, UserError } from './util.mjs';

export const nzbgetEnabled = (conf = state.settings.nzbget) => !!conf && conf.enabled === true && !!conf.url;

export async function nzbget(method, params = [], conf = state.settings.nzbget) {
  if (!conf?.url) throw new UserError('nzbget_not_configured');
  const url = trimUrl(conf.url);
  const headers = { 'Content-Type': 'application/json' };
  if (conf.username || conf.password) headers.Authorization = 'Basic ' + Buffer.from(`${conf.username || ''}:${conf.password || ''}`).toString('base64');
  const call = () => fetch(`${url}/jsonrpc`, { method: 'POST', headers, body: JSON.stringify({ method, params }), signal: AbortSignal.timeout(20000) });
  let r;
  try {
    // NZBGet closes kept-alive connections without notice (e.g. after a failed login) – retry once on a fresh one
    r = await call().catch(() => call());
  } catch {
    throw new UserError('nzbget_unreachable', { url });
  }
  if (r.status === 401 || r.status === 403) throw new UserError('nzbget_bad_login');
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) throw new UserError('nzbget_error', { status: r.status });
  if (d.error) throw new UserError('nzbget_error', { status: d.error.message || d.error.code || 'RPC' });
  return d.result;
}

/** Connection test: version and whether the category exists. */
export async function testNzbget(conf) {
  const version = await nzbget('version', [], conf);
  const config = await nzbget('config', [], conf).catch(() => []);
  const cats = (config || []).filter((o) => /^Category\d+\.Name$/i.test(o.Name)).map((o) => o.Value);
  return { version: String(version), categories: cats, categoryExists: cats.some((c) => c.toLowerCase() === String(conf.category || '').toLowerCase()) };
}

export async function sendToNzbget(book, rel) {
  const conf = state.settings.nzbget;
  const name = safeName(`${book.authors[0] || 'Unknown'} - ${cleanTitle(book.title)}`);
  // NZBFilename, NZBContent (an URL is fetched by NZBGet), Category, Priority, AddToTop, AddPaused, DupeKey, DupeScore, DupeMode, PPParameters
  const id = await nzbget('append', [`${name}.nzb`, rel.link, conf.category || '', 0, false, false, '', 0, 'FORCE', []]);
  if (!(Number(id) > 0)) throw new UserError('nzbget_rejected');
  return String(id);
}

const fmtEta = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
// "WARNING/SCRIPT" only means a post-processing script complained – the files are there
const OK_HISTORY = /^SUCCESS\/|^WARNING\/SCRIPT$/;

/** State of one job: downloading (with progress), done (with path), failed, or missing. */
export async function nzbgetStatus(ref) {
  const id = Number(ref);
  const groups = await nzbget('listgroups', [0]);
  const g = (groups || []).find((x) => x.NZBID === id);
  if (g) {
    const total = Number(g.FileSizeMB) || 0;
    const left = Number(g.RemainingSizeMB) || 0;
    const progress = total ? Math.round(((total - left) / total) * 1000) / 10 : 0;
    const post = /^(PP_|LOADING_PARS|VERIFYING|REPAIRING|RENAMING|UNPACKING|MOVING|EXECUTING|PP_FINISHED)/.test(g.Status);
    const st = await nzbget('status').catch(() => null);
    const globalPause = !post && !!st?.DownloadPaused; // whole NZBGet paused
    const rate = Number(st?.DownloadRate) || 0; // bytes per second
    const eta = !post && !globalPause && left > 0 && rate > 0 ? fmtEta((left * 1024 * 1024) / rate) : '';
    return {
      state: 'downloading',
      progress: post ? 100 : progress,
      eta,
      paused: g.Status === 'PAUSED' || globalPause,
      queued: g.Status === 'QUEUED' && !globalPause,
      message: post ? g.Status.toLowerCase().replace(/_/g, ' ') : '',
    };
  }
  const hist = await nzbget('history', [false]);
  const h = (hist || []).find((x) => x.NZBID === id);
  if (!h) return { state: 'missing' };
  if (OK_HISTORY.test(h.Status)) return { state: 'done', path: h.FinalDir || h.DestDir };
  return { state: 'failed', message: h.Status };
}

/** Removes a job from queue and history – used when retrying a stalled download. */
export async function nzbgetRemove(ref) {
  const ids = [Number(ref)];
  await nzbget('editqueue', ['GroupFinalDelete', '', ids]).catch(() => {});
  await nzbget('editqueue', ['HistoryFinalDelete', '', ids]).catch(() => {});
}

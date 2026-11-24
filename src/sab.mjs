// SABnzbd download client (usenet)
import { state } from './store.mjs';
import { cleanTitle, fetchJson, safeName, trimUrl, UserError } from './util.mjs';

export const sabEnabled = (conf = state.settings.sab) => conf.enabled !== false && !!(conf.url && conf.apiKey);

export async function sab(params, conf = state.settings.sab) {
  if (!conf.url || !conf.apiKey) throw new UserError('sab_not_configured');
  const u = new URL('/api', trimUrl(conf.url) + '/');
  for (const [k, v] of Object.entries({ ...params, apikey: conf.apiKey, output: 'json' })) u.searchParams.set(k, v);
  const d = await fetchJson(u, {}, 15000).catch(() => { throw new UserError('sab_unreachable', { url: conf.url }); });
  if (d.status === false && /api key/i.test(d.error || '')) throw new UserError('sab_bad_key');
  return d;
}

/** Connection test: version and whether the configured category exists. */
export async function testSab(conf) {
  const v = await sab({ mode: 'version' }, conf);
  const cats = await sab({ mode: 'get_cats' }, conf);
  return { version: v.version, categories: cats.categories || [], categoryExists: (cats.categories || []).includes(conf.category) };
}

export async function sendToSab(book, rel) {
  const conf = state.settings.sab;
  const name = safeName(`${book.authors[0] || 'Unknown'} - ${cleanTitle(book.title)}`);
  const d = await sab({ mode: 'addurl', name: rel.link, cat: conf.category, nzbname: name });
  if (!d.status || !d.nzo_ids?.length) throw new UserError('sab_rejected');
  return d.nzo_ids[0];
}

/** State of one job: downloading (with progress), done (with path), failed, or missing. */
export async function sabStatus(nzo) {
  const q = await sab({ mode: 'queue', limit: 200 });
  const s = (q.queue?.slots || []).find((x) => x.nzo_id === nzo);
  if (s) return { state: 'downloading', progress: Number(s.percentage) || 0, eta: s.timeleft || '', paused: s.status === 'Paused' };
  const h = await sab({ mode: 'history', nzo_ids: nzo });
  const slot = h.history?.slots?.[0];
  if (!slot) return { state: 'missing' };
  if (slot.status === 'Completed') return { state: 'done', path: slot.storage };
  if (slot.status === 'Failed') return { state: 'failed', message: slot.fail_message || '' };
  return { state: 'downloading', progress: 100, eta: '', message: slot.status };
}

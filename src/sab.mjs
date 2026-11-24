// SABnzbd download client
import { state } from './store.mjs';
import { cleanTitle, fetchJson, safeName, trimUrl, UserError } from './util.mjs';

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

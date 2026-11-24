// Picks the download client for a release and wraps their status
import { nzbgetEnabled, nzbgetRemove, nzbgetStatus, sendToNzbget } from './nzbget.mjs';
import { qbitEnabled, qbitRemove, qbitStatus, sendToQbit } from './qbit.mjs';
import { sabEnabled, sabRemove, sabStatus, sendToSab } from './sab.mjs';
import { state } from './store.mjs';
import { UserError } from './util.mjs';

export const CLIENT_NAMES = { sab: 'SABnzbd', nzbget: 'NZBGet', qbit: 'qBittorrent' };

/** usenet → SABnzbd (or NZBGet), torrent → qBittorrent */
export function clientFor(protocol) {
  if (protocol === 'torrent') return qbitEnabled() ? 'qbit' : null;
  if (sabEnabled()) return 'sab';
  return nzbgetEnabled() ? 'nzbget' : null;
}

export async function startClientDownload(req, rel) {
  const client = clientFor(rel.protocol);
  if (!client) throw new UserError('no_client', { protocol: rel.protocol || 'usenet' });
  const ref = client === 'qbit' ? await sendToQbit(req.id, rel)
    : client === 'nzbget' ? await sendToNzbget(req.book, rel)
    : await sendToSab(req.book, rel);
  return { client, ref };
}

export async function clientStatus(download) {
  const st = download.client === 'qbit' ? await qbitStatus(download.ref)
    : download.client === 'nzbget' ? await nzbgetStatus(download.ref)
    : await sabStatus(download.ref);
  if (st.path) st.path = mapPath(download.client, st.path);
  return st;
}

/** Remote path mapping: the client may see the disk under another path than Spokarr does. */
export function mapPath(client, p) {
  const conf = state.settings[client] || {};
  const from = (conf.pathFrom || '').replace(/\/+$/, '');
  const to = (conf.pathTo || '').replace(/\/+$/, '');
  if (!from || !to || !p) return p;
  return p === from || p.startsWith(from + '/') ? to + p.slice(from.length) : p;
}

export async function removeClientDownload(download) {
  if (!download) return;
  if (download.client === 'qbit') await qbitRemove(download.ref);
  else if (download.client === 'nzbget') await nzbgetRemove(download.ref);
  else await sabRemove(download.ref);
}

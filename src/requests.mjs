// Requests: approval, download, import into the library
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { absAddTags, absEnabled, absItems, absMatch, absScan } from './abs.mjs';
import { getBook, region } from './audible.mjs';
import { findReleases } from './indexers.mjs';
import { sab, sendToSab } from './sab.mjs';
import { LIBRARY_DIR, save, state } from './store.mjs';
import { cleanTitle, log, norm, randomId, safeName, uncache, UserError } from './util.mjs';

// States: pending → (approved) searching → downloading → processing → available
//         declined | not_found | failed
export const ACTIVE = ['downloading', 'processing'];
const msg = (code, params = {}) => ({ code, params });

export function publicRequest(r) {
  const u = state.users.find((x) => x.id === r.requestedBy);
  const a = state.users.find((x) => x.id === r.decidedBy);
  return {
    id: r.id, asin: r.asin, status: r.status, progress: r.progress || 0, eta: r.eta || '',
    message: r.message || null, createdAt: r.createdAt, updatedAt: r.updatedAt,
    release: r.release ? { title: r.release.title, size: r.release.size, indexer: r.release.indexer } : null,
    book: r.book, absId: r.absId || null,
    requestedBy: u ? { id: u.id, username: u.username } : null,
    decidedBy: a ? { id: a.id, username: a.username } : null,
  };
}

/** Status of a book for the interface: available in the library, or the state of its request. */
export async function statusResolver() {
  const items = await absItems();
  const byAsin = new Map(items.filter((i) => i.asin).map((i) => [i.asin, i]));
  // Title fallback only for library items without ASIN – otherwise every edition of a title would count as owned
  const byKey = new Map(items.filter((i) => i.key && !i.asin).map((i) => [i.key, i]));
  const reqByAsin = new Map(state.requests.map((r) => [r.asin, r]));
  return (book) => {
    const abs = byAsin.get(book.asin) || byKey.get(norm(cleanTitle(book.title)));
    if (abs) return { state: 'available', absId: abs.id };
    const req = reqByAsin.get(book.asin);
    if (req && req.status !== 'declined') return { state: req.status, progress: req.progress || 0, requestId: req.id };
    return null;
  };
}

async function startDownload(req, guid) {
  const releases = await findReleases(req.book);
  const rel = guid ? releases.find((r) => r.guid === guid) : releases.find((r) => r.ok);
  Object.assign(req, { progress: 0, message: null, release: null, nzo: null, eta: '', updatedAt: new Date().toISOString() });
  if (!rel) {
    req.status = 'not_found';
    req.message = releases.length ? msg('no_safe_match', { count: releases.length }) : msg('nothing_found');
    return;
  }
  req.nzo = await sendToSab(req.book, rel);
  req.release = { title: rel.title, size: rel.size, guid: rel.guid, indexer: rel.indexer };
  req.status = 'downloading';
  log('Downloading', req.book.title, '→', rel.title);
}

/** New request by a user. Users without auto-approve create a pending request. */
export async function createRequest(user, asin) {
  if (!user.permissions.request && user.role !== 'admin') throw new UserError('forbidden', {}, 403);
  const book = await getBook(asin);
  let req = state.requests.find((r) => r.asin === asin);
  if (req && !['declined', 'not_found', 'failed'].includes(req.status)) throw new UserError('already_requested', {}, 409);
  const now = new Date().toISOString();
  if (!req) {
    req = { id: randomId(5), asin, createdAt: now };
    state.requests.unshift(req);
  }
  Object.assign(req, { book, requestedBy: user.id, decidedBy: null, updatedAt: now, message: null, release: null });
  const auto = user.role === 'admin' || user.permissions.autoApprove;
  if (auto) {
    req.decidedBy = user.id;
    await startDownload(req);
  } else {
    req.status = 'pending';
  }
  await save.requests();
  return req;
}

/** Approve a pending request, retry one, or download a hand-picked release. */
export async function approveRequest(admin, id, guid) {
  const req = state.requests.find((r) => r.id === id);
  if (!req) throw new UserError('not_found', {}, 404);
  if (ACTIVE.includes(req.status) && !guid) throw new UserError('already_requested', {}, 409);
  req.decidedBy = admin.id;
  await startDownload(req, guid);
  await save.requests();
  return req;
}
/** Hand-picked release for a book that has no request yet (admins / request managers). */
export async function requestWithRelease(user, asin, guid) {
  let req = state.requests.find((r) => r.asin === asin);
  if (!req) {
    req = { id: randomId(5), asin, createdAt: new Date().toISOString(), book: await getBook(asin), requestedBy: user.id };
    state.requests.unshift(req);
  }
  return approveRequest(user, req.id, guid);
}
export async function declineRequest(admin, id) {
  const req = state.requests.find((r) => r.id === id);
  if (!req) throw new UserError('not_found', {}, 404);
  Object.assign(req, { status: 'declined', decidedBy: admin.id, updatedAt: new Date().toISOString() });
  await save.requests();
  return req;
}

async function importDownload(req, storage) {
  const book = req.book;
  const author = safeName(book.authors[0] || 'Unknown');
  const title = safeName(cleanTitle(book.title));
  let dest = path.join(LIBRARY_DIR, author, title);
  for (let i = 2; fss.existsSync(dest); i++) dest = path.join(LIBRARY_DIR, author, `${title} (${i})`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rename(storage, dest);
  for (const f of await fs.readdir(dest)) {
    if (/\.(par2|nzb|sfv|srr|nfo|url)$/i.test(f)) await fs.rm(path.join(dest, f), { force: true });
  }
  // Audiobookshelf metadata file, read on scan
  const meta = {
    title: cleanTitle(book.title), subtitle: book.subtitle || null, authors: book.authors, narrators: book.narrators,
    series: book.series.map((s) => (s.seq ? `${s.title} #${s.seq}` : s.title)), genres: book.genres,
    publishedYear: (book.release || '').slice(0, 4) || null, publisher: book.publisher || null,
    description: book.summary || null, asin: book.asin, language: book.language || null,
    abridged: book.abridged, explicit: false, tags: [], chapters: [],
  };
  await fs.writeFile(path.join(dest, 'metadata.json'), JSON.stringify(meta, null, 2));
  if (book.cover && !fss.existsSync(path.join(dest, 'cover.jpg'))) {
    try {
      const r = await fetch(book.cover, { signal: AbortSignal.timeout(20000) });
      if (r.ok) await fs.writeFile(path.join(dest, 'cover.jpg'), Buffer.from(await r.arrayBuffer()));
    } catch { /* cover is optional */ }
  }
  req.path = dest;
  log('Imported', dest);
}

async function linkInAbs(req) {
  if (!absEnabled()) return true;
  await absScan();
  const absPath = path.join(state.settings.abs.libraryMount || LIBRARY_DIR, path.relative(LIBRARY_DIR, req.path));
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    uncache('abs:items');
    const item = (await absItems()).find((x) => x.path === absPath);
    if (item) {
      req.absId = item.id;
      await absMatch(item.id, req.asin, region().abs).catch(() => false);
      const u = state.users.find((x) => x.id === req.requestedBy);
      if (u && state.settings.general.tagRequester) {
        await absAddTags(item.id, [`Requested by ${u.username}`]).catch((e) => log('Tagging failed:', e.message));
      }
      uncache('abs:items');
      return true;
    }
  }
  return false;
}

let polling = false;
export async function poll() {
  if (polling) return;
  polling = true;
  try {
    const active = state.requests.filter((r) => r.status === 'downloading' && r.nzo);
    if (!active.length) return;
    const q = await sab({ mode: 'queue', limit: 200 });
    const slots = new Map((q.queue?.slots || []).map((s) => [s.nzo_id, s]));
    for (const req of active) {
      const s = slots.get(req.nzo);
      if (s) {
        req.progress = Number(s.percentage) || 0;
        req.eta = s.timeleft || '';
        req.message = s.status === 'Paused' ? msg('paused') : null;
        continue;
      }
      const h = await sab({ mode: 'history', nzo_ids: req.nzo });
      const slot = h.history?.slots?.[0];
      if (!slot) continue;
      if (slot.status === 'Completed') {
        req.status = 'processing';
        req.progress = 100;
        await save.requests();
        try {
          await importDownload(req, slot.storage);
          const ok = await linkInAbs(req);
          req.status = 'available';
          req.message = ok ? null : msg('not_scanned_yet');
        } catch (e) {
          req.status = 'failed';
          req.message = msg('import_failed', { error: e.message });
          log('Import failed', req.book.title, e);
        }
      } else if (slot.status === 'Failed') {
        req.status = 'failed';
        req.message = msg('download_failed', { error: slot.fail_message || '' });
      } else {
        req.message = msg('sab_status', { status: slot.status });
      }
      req.updatedAt = new Date().toISOString();
    }
    await save.requests();
  } catch (e) {
    log('SABnzbd sync failed:', e.message);
  } finally {
    polling = false;
  }
}

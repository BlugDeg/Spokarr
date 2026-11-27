// Spokarr – audiobook request manager
// Audible catalog → Newznab indexers → SABnzbd → Audiobookshelf
import http from 'node:http';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { absEnabled, absLibraries, absStatus, absUsers } from './src/abs.mjs';
import { browseGenre, categoryIndex, contentLanguage, discoverRow, discoverRows, genreNames, LIST_SORTS, listBy, REGIONS, searchAudible, SORTS } from './src/audible.mjs';
import { can, endSessionsOf, login, logout, publicUser, sessionUser, setupRequired } from './src/auth.mjs';
import { findReleases, testIndexer, testProwlarr } from './src/indexers.mjs';
import {
  ACTIVE, approveRequest, bookFor, createManualRequest, createRequest, searchManual, declineRequest, poll, publicRequest, requestWithRelease, statusResolver,
} from './src/requests.mjs';
import { EVENTS, testNotify } from './src/notify.mjs';
import { testQbit } from './src/qbit.mjs';
import { testTransmission } from './src/transmission.mjs';
import { createInvite, deleteInvite, inviteInfo, publicInvite, redeemInvite } from './src/invites.mjs';
import { availableUpdate, checkUpdateNow, latestRelease, startUpdateCheck } from './src/update.mjs';
import { testNzbget } from './src/nzbget.mjs';
import { testSab } from './src/sab.mjs';
import { DEFAULT_PERMISSIONS, LIBRARY_DIR, loadState, save, state } from './src/store.mjs';
import { cached, log, randomId, trimUrl, uncache, UserError } from './src/util.mjs';

const VERSION = JSON.parse(fss.readFileSync(new URL('./package.json', import.meta.url))).version;
const PORT = Number(process.env.PORT || 5057);
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

// ---------- Helpers ----------
/**
 * Build the category index in the background. It costs a few hundred Audible requests, so it only
 * runs when genres are actually configured - a plain installation never asks for the tree. A genre
 * search or the settings picker builds it on demand anyway.
 */
async function warmGenres(tries = 0) {
  if (!(state.settings.general.discoverGenres || []).length) return;
  try {
    await categoryIndex();
  } catch (e) {
    log('genre tree could not be loaded:', e.message);
    if (tries < 12) setTimeout(() => warmGenres(tries + 1), 10 * 60e3);
  }
}

async function annotate(books) {
  const st = await statusResolver();
  return books.map((b) => ({ ...b, status: st(b) }));
}
const mask = (s) => {
  const out = structuredClone(s);
  for (const sec of [out.abs, out.sab, out.prowlarr]) { sec.hasApiKey = !!sec.apiKey; sec.apiKey = ''; }
  for (const sec of [out.qbit, out.nzbget, out.transmission]) { sec.hasPassword = !!sec.password; sec.password = ''; }
  const n = out.notifications;
  n.discord.hasWebhook = !!n.discord.webhook; n.discord.webhook = '';
  n.ntfy.hasToken = !!n.ntfy.token; n.ntfy.token = '';
  out.indexers = (out.indexers || []).map((i) => ({ ...i, hasApiKey: !!i.apiKey, apiKey: '' }));
  out.libraryDir = LIBRARY_DIR;
  return out;
};
// Empty API key fields in the settings form mean "keep the stored key"
const keepKey = (incoming, stored) => (incoming === undefined || incoming === '' ? stored : incoming || '');
const bool = (v) => v === true;

function applySettings(body) {
  const s = state.settings;
  if (body.general) {
    const g = body.general;
    if (g.region !== undefined) {
      if (!REGIONS[g.region]) throw new UserError('invalid_region');
      s.general.region = g.region;
    }
    if (g.contentLanguage !== undefined) s.general.contentLanguage = String(g.contentLanguage || '').toLowerCase();
    if (Array.isArray(g.discoverRows)) {
      s.general.discoverRows = g.discoverRows
        .map((r) => ({ title: String(r.title || '').trim(), keywords: String(r.keywords || '').trim(), narrator: String(r.narrator || '').trim() }))
        .filter((r) => r.title).slice(0, 12);
    }
    if (g.discoverGenres !== undefined) {
      const list = Array.isArray(g.discoverGenres) ? g.discoverGenres : String(g.discoverGenres || '').split(/[;,]/);
      s.general.discoverGenres = list.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 12);
    }
    if (g.hiddenGenres !== undefined) {
      const list = Array.isArray(g.hiddenGenres) ? g.hiddenGenres : String(g.hiddenGenres || '').split(/[;,]/);
      s.general.hiddenGenres = list.map((x) => String(x || '').trim().slice(0, 200)).filter(Boolean).slice(0, 30);
    }
    if (g.genreSort !== undefined) s.general.genreSort = SORTS[g.genreSort] ? g.genreSort : 'popular';
    if (g.rowItems !== undefined) s.general.rowItems = Math.min(50, Math.max(10, Number(g.rowItems) || 20));
    if (g.defaultPermissions) {
      s.general.defaultPermissions = {
        request: bool(g.defaultPermissions.request), autoApprove: bool(g.defaultPermissions.autoApprove),
        manageRequests: bool(g.defaultPermissions.manageRequests),
      };
    }
    if (g.tagRequester !== undefined) s.general.tagRequester = bool(g.tagRequester);
    if (g.appUrl !== undefined) s.general.appUrl = trimUrl(g.appUrl);
    if (g.notifyLanguage !== undefined) s.general.notifyLanguage = g.notifyLanguage === 'de' ? 'de' : 'en';
    if (g.updateCheck !== undefined) s.general.updateCheck = bool(g.updateCheck);
    if (g.requireAuthor !== undefined) s.general.requireAuthor = bool(g.requireAuthor);
    if (g.stallHours !== undefined) s.general.stallHours = Math.min(168, Math.max(1, Number(g.stallHours) || 6));
  }
  if (body.abs) {
    const a = body.abs;
    s.abs = {
      ...s.abs,
      url: a.url !== undefined ? trimUrl(a.url) : s.abs.url,
      publicUrl: a.publicUrl !== undefined ? trimUrl(a.publicUrl) : s.abs.publicUrl,
      apiKey: keepKey(a.apiKey, s.abs.apiKey),
      libraryId: a.libraryId !== undefined ? String(a.libraryId) : s.abs.libraryId,
      libraryMount: a.libraryMount !== undefined ? String(a.libraryMount).trim() : s.abs.libraryMount,
    };
  }
  const str = (v, old) => (v !== undefined ? String(v).trim() : old);
  if (body.sab) {
    const b = body.sab;
    s.sab = {
      enabled: b.enabled !== undefined ? bool(b.enabled) : s.sab.enabled,
      url: b.url !== undefined ? trimUrl(b.url) : s.sab.url,
      apiKey: keepKey(b.apiKey, s.sab.apiKey),
      category: b.category !== undefined ? String(b.category).trim() || 'spokarr' : s.sab.category,
      pathFrom: str(b.pathFrom, s.sab.pathFrom), pathTo: str(b.pathTo, s.sab.pathTo),
    };
  }
  if (body.nzbget) {
    const b = body.nzbget;
    s.nzbget = {
      enabled: b.enabled !== undefined ? bool(b.enabled) : s.nzbget.enabled,
      url: b.url !== undefined ? trimUrl(b.url) : s.nzbget.url,
      username: str(b.username, s.nzbget.username),
      password: keepKey(b.password, s.nzbget.password),
      category: str(b.category, s.nzbget.category),
      pathFrom: str(b.pathFrom, s.nzbget.pathFrom), pathTo: str(b.pathTo, s.nzbget.pathTo),
    };
  }
  if (body.qbit) {
    const b = body.qbit;
    s.qbit = {
      enabled: b.enabled !== undefined ? bool(b.enabled) : s.qbit.enabled,
      url: b.url !== undefined ? trimUrl(b.url) : s.qbit.url,
      username: str(b.username, s.qbit.username),
      password: keepKey(b.password, s.qbit.password),
      category: str(b.category, s.qbit.category),
      pathFrom: str(b.pathFrom, s.qbit.pathFrom), pathTo: str(b.pathTo, s.qbit.pathTo),
    };
  }
  if (body.transmission) {
    const b = body.transmission;
    s.transmission = {
      enabled: b.enabled !== undefined ? bool(b.enabled) : s.transmission.enabled,
      url: b.url !== undefined ? trimUrl(b.url) : s.transmission.url,
      username: str(b.username, s.transmission.username),
      password: keepKey(b.password, s.transmission.password),
      label: str(b.label, s.transmission.label),
      downloadDir: str(b.downloadDir, s.transmission.downloadDir),
      pathFrom: str(b.pathFrom, s.transmission.pathFrom), pathTo: str(b.pathTo, s.transmission.pathTo),
    };
  }
  if (body.prowlarr) {
    const b = body.prowlarr;
    s.prowlarr = {
      enabled: b.enabled !== undefined ? bool(b.enabled) : s.prowlarr.enabled,
      url: b.url !== undefined ? trimUrl(b.url) : s.prowlarr.url,
      apiKey: keepKey(b.apiKey, s.prowlarr.apiKey),
      categories: b.categories !== undefined ? String(b.categories).replace(/[^0-9,]/g, '') || '3030' : s.prowlarr.categories,
    };
  }
  if (Array.isArray(body.indexers)) {
    const old = new Map((s.indexers || []).map((i) => [i.id, i]));
    s.indexers = body.indexers.map((i) => ({
      id: old.has(i.id) ? i.id : randomId(4),
      name: String(i.name || 'Indexer').trim().slice(0, 60),
      url: trimUrl(i.url),
      apiKey: keepKey(i.apiKey, old.get(i.id)?.apiKey || ''),
      categories: String(i.categories || '3030').replace(/[^0-9,]/g, ''),
      enabled: i.enabled !== false,
    }));
  }
  if (body.notifications) {
    const n = body.notifications;
    const events = (v, old) => (Array.isArray(v) ? v.filter((e) => EVENTS.includes(e)) : old);
    if (n.discord) {
      const o = s.notifications.discord;
      s.notifications.discord = {
        enabled: n.discord.enabled !== undefined ? bool(n.discord.enabled) : o.enabled,
        webhook: keepKey(n.discord.webhook, o.webhook),
        events: events(n.discord.events, o.events),
      };
    }
    if (n.ntfy) {
      const o = s.notifications.ntfy;
      s.notifications.ntfy = {
        enabled: n.ntfy.enabled !== undefined ? bool(n.ntfy.enabled) : o.enabled,
        server: n.ntfy.server !== undefined ? trimUrl(n.ntfy.server) || 'https://ntfy.sh' : o.server,
        topic: str(n.ntfy.topic, o.topic),
        token: keepKey(n.ntfy.token, o.token),
        events: events(n.ntfy.events, o.events),
      };
    }
  }
  uncache('discover:');
  uncache('abs:');
}

// ---------- HTTP plumbing ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.json': 'application/json' };
function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  let b = '';
  for await (const c of req) { b += c; if (b.length > 2e5) throw new UserError('too_large', {}, 413); }
  try { return JSON.parse(b || '{}'); } catch { throw new UserError('invalid_json'); }
}

const routes = [];
const route = (method, pattern, opts, handler) => routes.push({ method, pattern, opts, handler });
const PUBLIC_ROUTE = { auth: false };
const USER = { auth: true };
const MANAGER = { auth: true, perm: 'manageRequests' };
const ADMIN = { auth: true, admin: true };

// ---------- Public ----------
route('GET', '/api/health', PUBLIC_ROUTE, () => ({ ok: true, version: VERSION }));
route('GET', '/api/status', PUBLIC_ROUTE, ({ user }) => ({
  version: VERSION,
  setupRequired: setupRequired(),
  absConfigured: !!state.settings.abs.url,
  absUrl: state.settings.abs.publicUrl || state.settings.abs.url,
  user: publicUser(user),
  // Only admins can update the container, so only they see the hint
  update: user?.role === 'admin' ? availableUpdate() : null,
}));
route('POST', '/api/setup/abs', PUBLIC_ROUTE, async ({ body }) => {
  if (!setupRequired()) throw new UserError('forbidden', {}, 403);
  const info = await absStatus(body.url);
  if (!info.initialized) throw new UserError('abs_not_initialized');
  state.settings.abs.url = trimUrl(body.url);
  if (!state.settings.abs.publicUrl) state.settings.abs.publicUrl = state.settings.abs.url;
  await save.settings();
  return { ok: true, version: info.version };
});
route('POST', '/api/auth/login', PUBLIC_ROUTE, async ({ req, res, body }) => ({ user: publicUser(await login(req, res, body)) }));
route('POST', '/api/auth/logout', PUBLIC_ROUTE, async ({ req, res }) => { await logout(req, res); return { ok: true }; });

// ---------- Catalog ----------
route('GET', '/api/genres', USER, () => genreNames());
route('GET', '/api/config', USER, () => ({
  region: state.settings.general.region, absUrl: state.settings.abs.publicUrl || state.settings.abs.url, absEnabled: absEnabled(),
  appUrl: state.settings.general.appUrl || '',
  genres: state.settings.general.discoverGenres || [], genreSort: state.settings.general.genreSort || 'popular',
}));
route('GET', '/api/discover', USER, async ({ url }) => {
  const rows = await discoverRows((url.searchParams.get('sort') || '').trim());
  return Promise.all(rows.map(async (r) => ({ ...r, items: await annotate(r.items) })));
});
route('GET', '/api/list', USER, async ({ url }) => {
  const kind = (url.searchParams.get('kind') || '').trim();
  const name = (url.searchParams.get('name') || '').trim();
  const sort = (url.searchParams.get('sort') || 'popular').trim();
  const limit = Math.min(150, Math.max(20, Number(url.searchParams.get('limit')) || 100));
  return { kind, name, sort, items: await annotate(await listBy(kind, name, { limit, sort })) };
});
route('GET', /^\/api\/row\/([a-z0-9]+)$/, USER, async ({ m, url }) => {
  const sort = (url.searchParams.get('sort') || '').trim();
  const limit = Math.min(150, Math.max(20, Number(url.searchParams.get('limit')) || 100));
  const row = await discoverRow(m[1], { sort, limit });
  return { ...row, items: await annotate(row.items) };
});
route('GET', '/api/search', USER, async ({ url }) => {
  const q = (url.searchParams.get('q') || '').trim();
  const genre = (url.searchParams.get('genre') || '').trim();
  const sort = (url.searchParams.get('sort') || 'popular').trim();
  const limit = Math.min(250, Math.max(20, Number(url.searchParams.get('limit')) || 100));
  if (!q && !genre) return [];
  const items = await cached(`search:${state.settings.general.region}:${q.toLowerCase()}:${genre.toLowerCase()}:${sort}:${limit}`, 10 * 60e3,
    () => (genre ? browseGenre(genre, { q, sort, limit })
      : searchAudible({ keywords: q, products_sort_by: LIST_SORTS[sort] || LIST_SORTS.relevance, num_results: 50 })));
  return annotate(items);
});
route('GET', /^\/api\/book\/([A-Z0-9]{10})$/, USER, async ({ m, user }) => {
  const [book] = await annotate([await bookFor(m[1])]);
  const r = state.requests.find((x) => x.asin === m[1]);
  const visible = r && (can(user, 'manageRequests') || r.requestedBy === user.id);
  return { ...book, request: visible ? publicRequest(r) : (r ? { status: r.status } : null) };
});
route('GET', /^\/api\/book\/([A-Z0-9]{10})\/releases$/, MANAGER, async ({ m }) => {
  const rel = await findReleases(await bookFor(m[1]));
  return rel.map(({ link, ...r }) => r);
});
route('POST', /^\/api\/book\/([A-Z0-9]{10})\/download$/, MANAGER, async ({ m, user, body }) => {
  if (!body.guid) throw new UserError('invalid_request');
  return publicRequest(await requestWithRelease(user, m[1], body.guid));
});

// ---------- Requests ----------
route('GET', '/api/requests', USER, ({ user, url }) => {
  const all = can(user, 'manageRequests') && url.searchParams.get('scope') !== 'mine';
  return state.requests.filter((r) => all || r.requestedBy === user.id).map(publicRequest);
});
route('POST', '/api/requests', USER, async ({ user, body }) => {
  if (!/^[A-Z0-9]{10}$/.test(body.asin || '')) throw new UserError('invalid_asin');
  return publicRequest(await createRequest(user, body.asin));
});
route('POST', '/api/requests/manual/search', USER, ({ user, body }) => searchManual(user, body));
route('POST', '/api/requests/manual', USER, async ({ user, body }) => publicRequest(await createManualRequest(user, body)));
route('POST', /^\/api\/requests\/([a-z0-9]+)\/approve$/, MANAGER, async ({ m, user, body }) => publicRequest(await approveRequest(user, m[1], body.guid)));
route('POST', /^\/api\/requests\/([a-z0-9]+)\/decline$/, MANAGER, async ({ m, user }) => publicRequest(await declineRequest(user, m[1])));
route('DELETE', /^\/api\/requests\/([a-z0-9]+)$/, USER, async ({ m, user }) => {
  const r = state.requests.find((x) => x.id === m[1]);
  if (!r) throw new UserError('not_found', {}, 404);
  const own = r.requestedBy === user.id && !ACTIVE.includes(r.status);
  if (!own && !can(user, 'manageRequests')) throw new UserError('forbidden', {}, 403);
  state.requests = state.requests.filter((x) => x.id !== m[1]);
  await save.requests();
  return { ok: true };
});

// ---------- Users ----------
route('GET', '/api/users', ADMIN, () => state.users.map((u) => publicUser(u, true)));
route('PUT', /^\/api\/users\/([a-z0-9]+)$/, ADMIN, async ({ m, user, body }) => {
  const u = state.users.find((x) => x.id === m[1]);
  if (!u) throw new UserError('not_found', {}, 404);
  if (u.owner && (body.role === 'user' || body.disabled)) throw new UserError('owner_protected', {}, 403);
  if (u.id === user.id && body.role === 'user') throw new UserError('self_protected', {}, 403);
  if (body.role === 'admin' || body.role === 'user') u.role = body.role;
  if (body.permissions) u.permissions = { request: bool(body.permissions.request), autoApprove: bool(body.permissions.autoApprove), manageRequests: bool(body.permissions.manageRequests) };
  if (body.disabled !== undefined) { u.disabled = bool(body.disabled); if (u.disabled) await endSessionsOf(u.id); }
  await save.users();
  return publicUser(u, true);
});
route('DELETE', /^\/api\/users\/([a-z0-9]+)$/, ADMIN, async ({ m, user }) => {
  const u = state.users.find((x) => x.id === m[1]);
  if (!u) throw new UserError('not_found', {}, 404);
  if (u.owner || u.id === user.id) throw new UserError('owner_protected', {}, 403);
  state.users = state.users.filter((x) => x.id !== u.id);
  await endSessionsOf(u.id);
  await save.users();
  return { ok: true };
});
route('POST', '/api/users/import', ADMIN, async () => {
  if (!absEnabled()) throw new UserError('abs_not_configured');
  let added = 0;
  for (const a of await absUsers()) {
    if (!a.isActive || state.users.some((u) => u.absUserId === a.id)) continue;
    const admin = a.type === 'root' || a.type === 'admin';
    state.users.push({
      id: randomId(5), absUserId: a.id, username: a.username, absType: a.type, role: admin ? 'admin' : 'user',
      permissions: { ...DEFAULT_PERMISSIONS, ...state.settings.general.defaultPermissions }, createdAt: new Date().toISOString(),
    });
    added++;
  }
  await save.users();
  return { added };
});

// ---------- Invites ----------
route('GET', '/api/invites', ADMIN, () => state.invites.map(publicInvite).reverse());
route('POST', '/api/invites', ADMIN, ({ user, body }) => {
  if (!absEnabled()) throw new UserError('abs_not_configured');
  return createInvite(user, body);
});
route('DELETE', /^\/api\/invites\/([a-z0-9]+)$/, ADMIN, async ({ m }) => { await deleteInvite(m[1]); return { ok: true }; });
route('GET', /^\/api\/invite\/([a-f0-9]+)$/, PUBLIC_ROUTE, ({ m }) => inviteInfo(m[1]));
route('POST', /^\/api\/invite\/([a-f0-9]+)$/, PUBLIC_ROUTE, async ({ req, res, m, body }) => ({ user: publicUser(await redeemInvite(req, res, m[1], body)) }));

// ---------- Settings ----------
route('GET', '/api/settings', ADMIN, () => ({ ...mask(state.settings), regions: Object.keys(REGIONS), effectiveLanguage: contentLanguage(), events: EVENTS, latest: latestRelease() }));
route('PUT', '/api/settings', ADMIN, async ({ body }) => {
  applySettings(body);
  await save.settings();
  // Genres just switched on? Fetch the tree in the background instead of on the first page view.
  if ((state.settings.general.discoverGenres || []).length) setTimeout(() => warmGenres(), 500);
  if (state.settings.general.updateCheck !== false && !latestRelease()) await checkUpdateNow();
  return { ...mask(state.settings), regions: Object.keys(REGIONS), effectiveLanguage: contentLanguage(), events: EVENTS, latest: latestRelease() };
});
route('POST', '/api/settings/test/abs', ADMIN, async ({ body }) => {
  const url = trimUrl(body.url ?? state.settings.abs.url);
  const info = await absStatus(url);
  const libraries = await absLibraries(url, keepKey(body.apiKey, state.settings.abs.apiKey));
  return { version: info.version, libraries };
});
route('POST', '/api/settings/test/sab', ADMIN, async ({ body }) => testSab({
  url: trimUrl(body.url ?? state.settings.sab.url),
  apiKey: keepKey(body.apiKey, state.settings.sab.apiKey),
  category: body.category ?? state.settings.sab.category,
}));
route('POST', '/api/settings/test/nzbget', ADMIN, async ({ body }) => testNzbget({
  url: trimUrl(body.url ?? state.settings.nzbget.url),
  username: body.username ?? state.settings.nzbget.username,
  password: keepKey(body.password, state.settings.nzbget.password),
  category: body.category ?? state.settings.nzbget.category,
}));
route('POST', '/api/settings/test/qbit', ADMIN, async ({ body }) => testQbit({
  url: trimUrl(body.url ?? state.settings.qbit.url),
  username: body.username ?? state.settings.qbit.username,
  password: keepKey(body.password, state.settings.qbit.password),
  category: body.category ?? state.settings.qbit.category,
}));
route('POST', '/api/settings/test/transmission', ADMIN, async ({ body }) => testTransmission({
  url: trimUrl(body.url ?? state.settings.transmission.url),
  username: body.username ?? state.settings.transmission.username,
  password: keepKey(body.password, state.settings.transmission.password),
}));
route('POST', '/api/settings/test/prowlarr', ADMIN, async ({ body }) => testProwlarr({
  url: trimUrl(body.url ?? state.settings.prowlarr.url),
  apiKey: keepKey(body.apiKey, state.settings.prowlarr.apiKey),
}));
route('POST', /^\/api\/settings\/test\/notify\/(discord|ntfy)$/, ADMIN, async ({ m, body }) => {
  const stored = state.settings.notifications[m[1]];
  return testNotify(m[1], m[1] === 'discord'
    ? { webhook: keepKey(body.webhook, stored.webhook) }
    : { server: body.server || stored.server, topic: body.topic ?? stored.topic, token: keepKey(body.token, stored.token) });
});
route('POST', '/api/settings/test/indexer', ADMIN, async ({ body }) => {
  const stored = (state.settings.indexers || []).find((i) => i.id === body.id);
  return testIndexer({ name: body.name || 'Indexer', url: body.url, apiKey: keepKey(body.apiKey, stored?.apiKey || ''), categories: body.categories });
});

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p.startsWith('/api/')) {
      const mutating = req.method !== 'GET' && req.method !== 'HEAD';
      // Cross-site form posts cannot send JSON – this blocks CSRF together with SameSite cookies
      if (mutating && !String(req.headers['content-type'] || '').startsWith('application/json')) throw new UserError('invalid_request', {}, 415);
      const user = sessionUser(req);
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = typeof r.pattern === 'string' ? (r.pattern === p ? [p] : null) : p.match(r.pattern);
        if (!m) continue;
        if (r.opts.auth && !user) throw new UserError('unauthorized', {}, 401);
        if (r.opts.admin && user.role !== 'admin') throw new UserError('forbidden', {}, 403);
        if (r.opts.perm && !can(user, r.opts.perm)) throw new UserError('forbidden', {}, 403);
        const body = mutating ? await readBody(req) : {};
        const out = await r.handler({ req, res, url, m, user, body });
        return send(res, 200, out);
      }
      throw new UserError('not_found', {}, 404);
    }
    // Static files, everything else → index.html (single page app)
    let file = path.normalize(path.join(PUBLIC, p));
    if (!file.startsWith(PUBLIC) || !fss.existsSync(file) || fss.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    fss.createReadStream(file).pipe(res);
  } catch (e) {
    if (e instanceof UserError) return send(res, e.status, { error: e.code, params: e.params });
    log('Error', req.method, p, e.message);
    send(res, 502, { error: 'upstream', params: { message: e.message } });
  }
});

await loadState();
server.listen(PORT, () => {
  log(`Spokarr ${VERSION} listening on port ${PORT} (Audible ${state.settings.general.region}, language ${contentLanguage()})`);
  // Only warm up when genres are in use - see warmGenres().
  if ((state.settings.general.discoverGenres || []).length) setTimeout(() => warmGenres(), 4000);
  startUpdateCheck(VERSION);
  if (setupRequired()) log('Setup required: open the web interface and sign in with an Audiobookshelf admin account');
});
setInterval(poll, 15000);
poll();

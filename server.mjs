// Spokarr – audiobook request manager
// Audible catalog → Newznab indexers → SABnzbd → Audiobookshelf
import http from 'node:http';
import fss from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { absEnabled, absLibraries, absStatus, absUsers } from './src/abs.mjs';
import { contentLanguage, discoverRows, getBook, REGIONS, searchAudible } from './src/audible.mjs';
import { can, endSessionsOf, login, logout, publicUser, sessionUser, setupRequired } from './src/auth.mjs';
import { findReleases, testIndexer } from './src/indexers.mjs';
import {
  ACTIVE, approveRequest, createRequest, declineRequest, poll, publicRequest, requestWithRelease, statusResolver,
} from './src/requests.mjs';
import { testSab } from './src/sab.mjs';
import { DEFAULT_PERMISSIONS, LIBRARY_DIR, loadState, save, state } from './src/store.mjs';
import { cached, log, randomId, trimUrl, uncache, UserError } from './src/util.mjs';

const VERSION = JSON.parse(fss.readFileSync(new URL('./package.json', import.meta.url))).version;
const PORT = Number(process.env.PORT || 5057);
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

// ---------- Helpers ----------
async function annotate(books) {
  const st = await statusResolver();
  return books.map((b) => ({ ...b, status: st(b) }));
}
const mask = (s) => {
  const out = structuredClone(s);
  for (const sec of [out.abs, out.sab]) { sec.hasApiKey = !!sec.apiKey; sec.apiKey = ''; }
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
    if (g.defaultPermissions) {
      s.general.defaultPermissions = {
        request: bool(g.defaultPermissions.request), autoApprove: bool(g.defaultPermissions.autoApprove),
        manageRequests: bool(g.defaultPermissions.manageRequests),
      };
    }
    if (g.tagRequester !== undefined) s.general.tagRequester = bool(g.tagRequester);
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
  if (body.sab) {
    const b = body.sab;
    s.sab = {
      url: b.url !== undefined ? trimUrl(b.url) : s.sab.url,
      apiKey: keepKey(b.apiKey, s.sab.apiKey),
      category: b.category !== undefined ? String(b.category).trim() || 'spokarr' : s.sab.category,
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
route('GET', '/api/config', USER, () => ({
  region: state.settings.general.region, absUrl: state.settings.abs.publicUrl || state.settings.abs.url, absEnabled: absEnabled(),
}));
route('GET', '/api/discover', USER, async () => {
  const rows = await discoverRows();
  return Promise.all(rows.map(async (r) => ({ ...r, items: await annotate(r.items) })));
});
route('GET', '/api/search', USER, async ({ url }) => {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return [];
  const items = await cached(`search:${state.settings.general.region}:${q.toLowerCase()}`, 10 * 60e3,
    () => searchAudible({ keywords: q, products_sort_by: 'Relevance', num_results: 40 }));
  return annotate(items);
});
route('GET', /^\/api\/book\/([A-Z0-9]{10})$/, USER, async ({ m, user }) => {
  const [book] = await annotate([await getBook(m[1])]);
  const r = state.requests.find((x) => x.asin === m[1]);
  const visible = r && (can(user, 'manageRequests') || r.requestedBy === user.id);
  return { ...book, request: visible ? publicRequest(r) : (r ? { status: r.status } : null) };
});
route('GET', /^\/api\/book\/([A-Z0-9]{10})\/releases$/, MANAGER, async ({ m }) => {
  const rel = await findReleases(await getBook(m[1]));
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

// ---------- Settings ----------
route('GET', '/api/settings', ADMIN, () => ({ ...mask(state.settings), regions: Object.keys(REGIONS), effectiveLanguage: contentLanguage() }));
route('PUT', '/api/settings', ADMIN, async ({ body }) => {
  applySettings(body);
  await save.settings();
  return { ...mask(state.settings), regions: Object.keys(REGIONS), effectiveLanguage: contentLanguage() };
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
  if (setupRequired()) log('Setup required: open the web interface and sign in with an Audiobookshelf admin account');
});
setInterval(poll, 15000);
poll();

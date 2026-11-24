// Sign-in with Audiobookshelf accounts, sessions and permissions
import crypto from 'node:crypto';
import { absCreateApiKey, absLogin } from './abs.mjs';
import { DEFAULT_PERMISSIONS, save, state } from './store.mjs';
import { log, randomId, UserError } from './util.mjs';

const COOKIE = 'spokarr_session';
const SESSION_DAYS = 30;

export const setupRequired = () => !state.users.some((u) => u.owner);

export function publicUser(u, withStats = false) {
  if (!u) return null;
  const base = {
    id: u.id, username: u.username, role: u.role, owner: !!u.owner, absType: u.absType,
    permissions: u.role === 'admin' ? { request: true, autoApprove: true, manageRequests: true } : u.permissions,
    createdAt: u.createdAt, lastLogin: u.lastLogin || null,
  };
  if (withStats) {
    const mine = state.requests.filter((r) => r.requestedBy === u.id);
    base.requestCount = mine.length;
    base.availableCount = mine.filter((r) => r.status === 'available').length;
  }
  return base;
}
export const can = (u, perm) => !!u && (u.role === 'admin' || !!u.permissions?.[perm]);

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function sessionUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const s = state.sessions[hash(token)];
  if (!s || s.expires < Date.now()) return null;
  const u = state.users.find((x) => x.id === s.userId);
  if (!u || u.disabled) return null;
  // sliding expiry, written at most once a day
  if (s.expires - Date.now() < (SESSION_DAYS - 1) * 864e5) { s.expires = Date.now() + SESSION_DAYS * 864e5; save.sessions(); }
  return u;
}

function cookieHeader(req, token, maxAgeSec) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

// Simple brute-force protection: 8 failed attempts per IP and 15 minutes
const failures = new Map();
function checkRate(ip) {
  const f = failures.get(ip);
  if (f && f.count >= 8 && Date.now() - f.first < 15 * 60e3) throw new UserError('login_rate_limited', {}, 429);
}
function noteFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first > 15 * 60e3) failures.set(ip, { count: 1, first: Date.now() });
  else f.count++;
}

export async function login(req, res, { username, password }) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  checkRate(ip);
  if (!username || !password) throw new UserError('login_failed', {}, 401);
  let result;
  try {
    result = await absLogin(String(username), String(password));
  } catch (e) {
    if (e.code === 'login_failed') noteFailure(ip);
    throw e;
  }
  const absUser = result.user;
  const isAbsAdmin = absUser.type === 'root' || absUser.type === 'admin';
  const firstUser = setupRequired();
  if (firstUser && !isAbsAdmin) throw new UserError('setup_needs_admin', {}, 403);

  let user = state.users.find((u) => u.absUserId === absUser.id);
  const now = new Date().toISOString();
  if (!user) {
    user = {
      id: randomId(5), absUserId: absUser.id, username: absUser.username, absType: absUser.type,
      role: isAbsAdmin ? 'admin' : 'user',
      permissions: { ...DEFAULT_PERMISSIONS, ...state.settings.general.defaultPermissions },
      createdAt: now, owner: firstUser,
    };
    state.users.push(user);
    log(`New user ${user.username} (${user.role})`);
  }
  if (user.disabled) throw new UserError('login_disabled', {}, 403);
  Object.assign(user, { username: absUser.username, absType: absUser.type, lastLogin: now });

  // First setup: let Spokarr create its own API key with the owner's session
  if (firstUser) {
    if (!state.settings.abs.apiKey && result.token) {
      const key = await absCreateApiKey(result.token, absUser.id);
      if (key) { state.settings.abs.apiKey = key; log('Created Audiobookshelf API key "Spokarr"'); }
    }
    for (const r of state.requests) if (!r.requestedBy) r.requestedBy = user.id;
    await save.settings();
    await save.requests();
  }
  await save.users();

  const token = crypto.randomBytes(32).toString('hex');
  state.sessions[hash(token)] = { userId: user.id, created: Date.now(), expires: Date.now() + SESSION_DAYS * 864e5 };
  // drop expired sessions
  for (const [k, s] of Object.entries(state.sessions)) if (s.expires < Date.now()) delete state.sessions[k];
  await save.sessions();
  failures.delete(ip);
  res.setHeader('Set-Cookie', cookieHeader(req, token, SESSION_DAYS * 86400));
  return user;
}

export async function logout(req, res) {
  const token = parseCookies(req)[COOKIE];
  if (token) { delete state.sessions[hash(token)]; await save.sessions(); }
  res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
}

export async function endSessionsOf(userId) {
  for (const [k, s] of Object.entries(state.sessions)) if (s.userId === userId) delete state.sessions[k];
  await save.sessions();
}

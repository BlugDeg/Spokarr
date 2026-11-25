// Invite links: an admin creates a link, the person picks a username and password, Spokarr creates
// the account in Audiobookshelf and in Spokarr and signs them in.
import crypto from 'node:crypto';
import { absCreateUser, absUsers } from './abs.mjs';
import { login } from './auth.mjs';
import { DEFAULT_PERMISSIONS, save, state } from './store.mjs';
import { clientIp, log, randomId, UserError } from './util.mjs';

const DAY = 864e5;
const USERNAME = /^[\p{L}\p{N}._-]{3,32}$/u;

const isOpen = (i) => i.expires > Date.now() && (!i.maxUses || i.uses < i.maxUses) && !i.revoked;
const findByToken = (token) => (/^[a-f0-9]{48}$/.test(String(token || ''))
  ? state.invites.find((i) => crypto.timingSafeEqual(Buffer.from(i.token), Buffer.from(token)))
  : null);

export const publicInvite = (i) => ({
  id: i.id, token: i.token, note: i.note, createdAt: i.createdAt, expires: new Date(i.expires).toISOString(),
  maxUses: i.maxUses, uses: i.uses, open: isOpen(i), users: i.users || [],
});

export async function createInvite(by, { days = 7, maxUses = 1, note = '' } = {}) {
  const d = [1, 7, 30].includes(Number(days)) ? Number(days) : 7;
  const n = Math.max(0, Math.min(100, Math.floor(Number(maxUses) || 0)));
  const inv = {
    id: randomId(4), token: crypto.randomBytes(24).toString('hex'), note: String(note || '').trim().slice(0, 80),
    createdBy: by.id, createdAt: new Date().toISOString(), expires: Date.now() + d * DAY, maxUses: n, uses: 0, users: [],
  };
  // closed invites older than 30 days are dropped
  state.invites = state.invites.filter((i) => isOpen(i) || Date.now() - i.expires < 30 * DAY);
  state.invites.push(inv);
  await save.invites();
  return publicInvite(inv);
}

export async function deleteInvite(id) {
  state.invites = state.invites.filter((i) => i.id !== id);
  await save.invites();
}

/** What the invite page may show before signing up – nothing about who created it. */
export function inviteInfo(token) {
  const i = findByToken(token);
  if (!i || !isOpen(i)) throw new UserError('invite_invalid', {}, 404);
  return { valid: true, expires: new Date(i.expires).toISOString() };
}

// Guessing tokens is pointless (192 bit), but sign-ups still cost an ABS account each: 10 per IP and hour
const attempts = new Map();
function rate(ip) {
  const a = attempts.get(ip);
  if (!a || Date.now() - a.first > 3600e3) { attempts.set(ip, { n: 1, first: Date.now() }); return; }
  if (++a.n > 10) throw new UserError('login_rate_limited', {}, 429);
}

export async function redeemInvite(req, res, token, { username, password } = {}) {
  rate(clientIp(req));
  const inv = findByToken(token);
  if (!inv || !isOpen(inv)) throw new UserError('invite_invalid', {}, 404);
  const name = String(username || '').trim();
  const pw = String(password || '');
  if (!USERNAME.test(name)) throw new UserError('invite_bad_username', {}, 400);
  if (pw.length < 8 || pw.length > 128) throw new UserError('invite_bad_password', {}, 400);
  // Clear message instead of a generic ABS error; ABS compares usernames case-insensitively
  const existing = await absUsers().catch(() => []);
  if (existing.some((u) => String(u.username).toLowerCase() === name.toLowerCase())) {
    throw new UserError('invite_username_taken', {}, 409);
  }
  // Check again after the await and reserve the use before the slow ABS call, so a single-use link
  // cannot be redeemed twice by two requests at the same time
  if (!isOpen(inv)) throw new UserError('invite_invalid', {}, 404);
  inv.uses++;
  let absUser;
  try {
    absUser = await absCreateUser(name, pw);
  } catch (e) {
    inv.uses--;
    throw e;
  }
  inv.users = [...(inv.users || []), absUser.username];
  await save.invites();
  if (!state.users.some((u) => u.absUserId === absUser.id)) {
    state.users.push({
      id: randomId(5), absUserId: absUser.id, username: absUser.username, absType: absUser.type || 'user', role: 'user',
      permissions: { ...DEFAULT_PERMISSIONS, ...state.settings.general.defaultPermissions },
      createdAt: new Date().toISOString(), invitedBy: inv.createdBy,
    });
    await save.users();
  }
  log(`New user ${absUser.username} via invite ${inv.id}`);
  // Sign in right away with the new account (also checks that ABS accepts the password)
  return login(req, res, { username: name, password: pw });
}

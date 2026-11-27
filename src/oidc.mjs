// Single sign-on with an OpenID Connect provider (Authentik, Authelia, Keycloak, Pocket ID …).
// Authorization code flow with PKCE. Spokarr does not keep its own accounts: the person signed in at
// the provider is matched to their Audiobookshelf account (by username, then by email), the same
// way Audiobookshelf itself links OIDC users.
import crypto from 'node:crypto';
import { absUsers } from './abs.mjs';
import { state } from './store.mjs';
import { log, trimUrl, UserError } from './util.mjs';

export const oidcEnabled = (c = state.settings.oidc) => !!c && c.enabled === true && !!c.issuer && !!c.clientId;

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const fromB64url = (s) => Buffer.from(String(s || ''), 'base64url');
const issuerKey = (s) => trimUrl(s).replace(/\/+$/, '');

// ---------- Provider metadata and keys (cached for an hour) ----------
const meta = new Map();
async function getJson(url, opts = {}) {
  let r;
  try {
    r = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new UserError('oidc_unreachable', { url: String(url).split('?')[0] });
  }
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) {
    const e = new UserError('oidc_error', { status: r.status, message: d?.error_description || d?.error || '' });
    e.status = r.status;
    throw e;
  }
  return d;
}

export async function discovery(issuer) {
  const key = issuerKey(issuer);
  const hit = meta.get(key);
  if (hit && Date.now() - hit.at < 3600e3) return hit.doc;
  const doc = await getJson(`${key}/.well-known/openid-configuration`);
  // The document has to name exactly this issuer, otherwise tokens could come from somewhere else
  if (issuerKey(doc.issuer) !== key) throw new UserError('oidc_issuer_mismatch', { issuer: doc.issuer || '' });
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) throw new UserError('oidc_bad_discovery');
  meta.set(key, { at: Date.now(), doc });
  return doc;
}

const jwksCache = new Map();
async function signingKey(doc, kid, fresh = false) {
  let hit = jwksCache.get(doc.jwks_uri);
  if (fresh || !hit || Date.now() - hit.at > 3600e3) {
    hit = { at: Date.now(), keys: (await getJson(doc.jwks_uri)).keys || [] };
    jwksCache.set(doc.jwks_uri, hit);
  }
  const usable = hit.keys.filter((k) => !k.use || k.use === 'sig');
  const k = kid ? usable.find((x) => x.kid === kid) : usable.length === 1 ? usable[0] : null;
  // Unknown key id: the provider may have rotated its keys – fetch once more
  if (!k && !fresh) return signingKey(doc, kid, true);
  if (!k) throw new UserError('oidc_bad_token', { message: 'unknown signing key' });
  return crypto.createPublicKey({ key: k, format: 'jwk' });
}

const ALGS = {
  RS256: ['sha256'], RS384: ['sha384'], RS512: ['sha512'],
  PS256: ['sha256', { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }],
  PS384: ['sha384', { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 48 }],
  PS512: ['sha512', { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 64 }],
  ES256: ['sha256', { dsaEncoding: 'ieee-p1363' }], ES384: ['sha384', { dsaEncoding: 'ieee-p1363' }],
  ES512: ['sha512', { dsaEncoding: 'ieee-p1363' }], EdDSA: [null],
};

/** Checks signature, issuer, audience, expiry and nonce of an ID token and returns its claims. */
export async function verifyIdToken(token, doc, clientId, nonce) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new UserError('oidc_bad_token', { message: 'malformed' });
  let header, claims;
  try {
    header = JSON.parse(fromB64url(parts[0]).toString('utf8'));
    claims = JSON.parse(fromB64url(parts[1]).toString('utf8'));
  } catch {
    throw new UserError('oidc_bad_token', { message: 'malformed' });
  }
  const alg = ALGS[header.alg];
  // "none" and HMAC (HS256, signed with the client secret) are not accepted
  if (!alg) throw new UserError('oidc_bad_token', { message: `algorithm ${header.alg} not supported` });
  const key = await signingKey(doc, header.kid);
  const keyOpts = alg[1] ? { key, ...alg[1] } : key;
  const ok = crypto.verify(alg[0], Buffer.from(`${parts[0]}.${parts[1]}`), keyOpts, fromB64url(parts[2]));
  if (!ok) throw new UserError('oidc_bad_token', { message: 'signature' });
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (issuerKey(claims.iss) !== issuerKey(doc.issuer)) throw new UserError('oidc_bad_token', { message: 'issuer' });
  if (!aud.includes(clientId)) throw new UserError('oidc_bad_token', { message: 'audience' });
  if (aud.length > 1 && claims.azp && claims.azp !== clientId) throw new UserError('oidc_bad_token', { message: 'azp' });
  if (!(Number(claims.exp) > now - 60)) throw new UserError('oidc_bad_token', { message: 'expired' });
  if (claims.iat && Number(claims.iat) > now + 300) throw new UserError('oidc_bad_token', { message: 'issued in the future' });
  if (claims.nonce !== nonce) throw new UserError('oidc_bad_token', { message: 'nonce' });
  return claims;
}

// ---------- Flow ----------
// Started logins, by state. Kept for 10 minutes – long enough to type a password and a second factor.
const pending = new Map();
const PENDING_MS = 10 * 60e3;

export async function oidcStart(redirectUri) {
  const c = state.settings.oidc;
  if (!oidcEnabled(c)) throw new UserError('oidc_disabled', {}, 404);
  const doc = await discovery(c.issuer);
  for (const [k, v] of pending) if (Date.now() - v.at > PENDING_MS) pending.delete(k);
  if (pending.size > 1000) throw new UserError('login_rate_limited', {}, 429);
  const st = b64url(crypto.randomBytes(24));
  const nonce = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  pending.set(st, { at: Date.now(), nonce, verifier, redirectUri });
  const u = new URL(doc.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', c.clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', 'openid profile email');
  u.searchParams.set('state', st);
  u.searchParams.set('nonce', nonce);
  u.searchParams.set('code_challenge', b64url(crypto.createHash('sha256').update(verifier).digest()));
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

/** Turns the provider's answer into the matching Audiobookshelf user. */
export async function oidcFinish(params) {
  const c = state.settings.oidc;
  if (!oidcEnabled(c)) throw new UserError('oidc_disabled', {}, 404);
  const st = params.get('state') || '';
  const p = pending.get(st);
  pending.delete(st);
  if (!p || Date.now() - p.at > PENDING_MS) throw new UserError('oidc_expired');
  if (params.get('error')) throw new UserError('oidc_denied', { message: params.get('error_description') || params.get('error') });
  const code = params.get('code');
  if (!code) throw new UserError('oidc_denied', { message: 'no code' });
  const doc = await discovery(c.issuer);

  // Code → tokens. client_secret_basic is the default of the spec; providers that only take
  // client_secret_post say so in their discovery document.
  const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: p.redirectUri, code_verifier: p.verifier, client_id: c.clientId });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const methods = doc.token_endpoint_auth_methods_supported || ['client_secret_basic'];
  if (c.clientSecret) {
    if (methods.includes('client_secret_basic')) {
      headers.Authorization = 'Basic ' + Buffer.from(`${encodeURIComponent(c.clientId)}:${encodeURIComponent(c.clientSecret)}`).toString('base64');
    } else form.set('client_secret', c.clientSecret);
  }
  const tokens = await getJson(doc.token_endpoint, { method: 'POST', headers, body: form.toString() });
  const claims = await verifyIdToken(tokens.id_token, doc, c.clientId, p.nonce);

  // Some providers only put the username and email into the userinfo answer
  const claimName = c.usernameClaim || 'preferred_username';
  let info = claims;
  if ((!claims[claimName] || !claims.email) && doc.userinfo_endpoint && tokens.access_token) {
    const ui = await getJson(doc.userinfo_endpoint, { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' } }).catch(() => null);
    if (ui && ui.sub === claims.sub) info = { ...ui, ...claims };
  }
  return matchAbsUser(info, claimName);
}

/** Username first (what Audiobookshelf uses as well), then a verified email address. */
export async function matchAbsUser(info, claimName = 'preferred_username') {
  const users = await absUsers().catch(() => { throw new UserError('oidc_no_abs'); });
  const low = (v) => String(v || '').trim().toLowerCase();
  // The configured claim, otherwise the usual ones (the display name is never used: "Anna Muster"
  // could be someone else's username)
  const name = low(info[claimName] || info.preferred_username || info.nickname);
  const email = low(info.email);
  let u = name ? users.find((x) => low(x.username) === name) : null;
  if (!u && email && info.email_verified !== false) u = users.find((x) => low(x.email) === email);
  if (!u) {
    log(`SSO sign-in without matching Audiobookshelf account (${claimName}: ${name || '–'}, email: ${email ? 'yes' : 'no'})`);
    throw new UserError('oidc_no_account', { name: name || email || String(info.sub || '') }, 403);
  }
  if (!u.isActive) throw new UserError('login_disabled', {}, 403);
  return { id: u.id, username: u.username, type: u.type };
}

/** Connection test for the settings: discovery document reachable and valid. */
export async function testOidc(conf) {
  if (!conf.issuer) throw new UserError('oidc_incomplete');
  meta.delete(issuerKey(conf.issuer));
  const doc = await discovery(conf.issuer);
  return { issuer: doc.issuer, pkce: (doc.code_challenge_methods_supported || ['S256']).includes('S256') };
}

// Shared helpers
export const log = (...a) => console.log(new Date().toISOString(), ...a);

/** An error whose code is shown to the user (translated in the interface). */
export class UserError extends Error {
  constructor(code, params = {}, status = 400) {
    super(code);
    this.code = code;
    this.params = params;
    this.status = status;
  }
}

export const GERMAN_TRANSLIT = (s) => s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
  .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss');
export const norm = (s) => GERMAN_TRANSLIT(String(s || '')).normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Edition notes that never appear in release names ("Narrated by …", "Gesprochen von …", "(Unabridged)")
const EDITION_SUFFIX = /\s*[-–:|]\s*(narrated|read by|unabridged|abridged|dramati[sz]ed|gesprochen|gelesen|ungekürzt|gekürzt|die ungekürzte|das hörspiel|hörspiel|hörbuch|lu par|letto da|narrado).*$/i;
export const cleanTitle = (t) => String(t || '').replace(EDITION_SUFFIX, '').replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ').replace(/\s+/g, ' ').trim();
// ABS stores several authors as one string ("A, B"), Audible returns one entry per author – so only
// the first name is compared, otherwise a book written by two people never matches.
export const firstAuthor = (s) => String(s || '').split(/\s*(?:,|&|\bund\b)\s*/i).map((x) => x.trim()).filter(Boolean)[0] || '';
export const safeName = (s) => String(s || 'Unknown').replace(/[\/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Unknown';
export const stripHtml = (s) => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/\n{3,}/g, '\n\n').trim();
export const decodeXml = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
export const trimUrl = (u) => String(u || '').trim().replace(/\/+$/, '');

export async function fetchJson(url, opts = {}, timeout = 20000) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) {
    const e = new Error(`${new URL(url).host} responded ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

const cacheMap = new Map();
export async function cached(key, ttlMs, fn) {
  const hit = cacheMap.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await fn();
  cacheMap.set(key, { value, until: Date.now() + ttlMs });
  return value;
}
export const uncache = (prefix) => { for (const k of cacheMap.keys()) if (k.startsWith(prefix)) cacheMap.delete(k); };
export const randomId = (bytes = 6) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

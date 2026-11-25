// Shared UI helpers
import { LANGUAGES, lang, locale, t } from './i18n.js';

export const view = () => document.getElementById('view');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Language: a small segmented switch (EN | DE) instead of a native dropdown
export const langSwitch = () => Object.entries(LANGUAGES).map(([k, v]) =>
  `<button type="button" data-lang="${k}" aria-pressed="${k === lang}" title="${esc(v)}">${k.toUpperCase()}</button>`).join('');

export const icon = {
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  userPlus: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3Zm0 6v5m0 3v.5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8L7 4Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 16a2 2 0 0 1 2-2h13"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/></svg>',
  import: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/></svg>',
  plug: '<svg viewBox="0 0 24 24"><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8Zm6 9v4"/></svg>',
  logout: '<svg viewBox="0 0 24 24"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>',
};
export const STATUS_ICON = { available: icon.check, pending: icon.clock, downloading: icon.down, processing: icon.clock, not_found: icon.warn, failed: icon.warn, declined: icon.x };

export class ApiError extends Error { constructor(code, params, status) { super(code); this.code = code; this.params = params || {}; this.status = status; } }
export async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith('/api/auth/') && !path.startsWith('/api/status')) {
    window.dispatchEvent(new CustomEvent('spokarr:signedout'));
  }
  if (!r.ok) throw new ApiError(d.error || 'generic', { code: r.status, ...(d.params || {}) }, r.status);
  return d;
}
export const post = (path, body = {}) => api(path, { method: 'POST', body: JSON.stringify(body) });
export const put = (path, body = {}) => api(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = (path) => api(path, { method: 'DELETE', body: '{}' });
export const errText = (e) => (e instanceof ApiError ? t('err.' + e.code, e.params) : e.message);
export const msgText = (m) => (m ? t('msg.' + m.code, m.params) : '');

export function toast(text, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.className = 'toast ' + kind;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 3800);
}

export const duration = (min) => {
  if (!min) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? t('dur.hm', { h, m }) : t('dur.m', { m });
};
export const size = (b) => (b > 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : Math.round(b / 1048576) + ' MB');
export const year = (d) => (d || '').slice(0, 4);
export const date = (d) => (d ? new Date(d).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
export const since = (d) => {
  if (!d) return '';
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return t('time.justNow');
  if (s < 3600) return t('time.minAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return t('time.hAgo', { n: Math.floor(s / 3600) });
  if (s < 7 * 86400) return Math.floor(s / 86400) === 1 ? t('time.dAgo1') : t('time.dAgo', { n: Math.floor(s / 86400) });
  return date(d);
};

// Audible reports languages as English words ("german"); show them in the interface language
const LANG_CODES = { english: 'en', german: 'de', french: 'fr', italian: 'it', spanish: 'es', japanese: 'ja', dutch: 'nl', portuguese: 'pt', polish: 'pl', swedish: 'sv', danish: 'da', norwegian: 'no', finnish: 'fi', russian: 'ru', chinese: 'zh', hindi: 'hi' };
export const languageName = (l) => {
  const code = LANG_CODES[String(l || '').toLowerCase()];
  if (!code) return l;
  try { return new Intl.DisplayNames([locale()], { type: 'language' }).of(code); } catch { return l; }
};

export function badge(status) {
  if (!status) return '';
  const extra = status.state === 'downloading' && status.progress ? ` ${Math.round(status.progress)} %` : '';
  return `<span class="badge b-${status.state}">${STATUS_ICON[status.state] || icon.warn}${esc(t('status.' + status.state))}${extra}</span>`;
}

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#84cc16'];
export function avatar(name, cls = '') {
  const n = String(name || '?');
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="avatar ${cls}" style="background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}">${esc(n.slice(0, 1).toUpperCase())}</span>`;
}

export const PLACEHOLDER = '/cover-placeholder.svg';
export const coverOf = (b, small = true) => (small ? b.coverSmall || b.cover : b.cover || b.coverSmall) || PLACEHOLDER;
export function card(b) {
  const series = b.series?.[0];
  return `<a class="card" href="#/book/${b.asin}" title="${esc(b.title)}">
    <img class="cover" src="${esc(coverOf(b))}" alt="" loading="lazy">
    ${badge(b.status)}
    <div class="overlay"><b>${esc(b.title)}</b><small>${esc(b.authors?.[0] || '')}${b.narrators?.length ? ' · ' + esc(b.narrators[0]) : ''}</small>${series ? `<small>${esc(series.title)}${series.seq ? ' #' + esc(series.seq) : ''}</small>` : ''}</div>
    <div class="card-meta"><div class="t">${esc(b.title)}</div><div class="a">${esc(b.authors?.join(', ') || '')}</div></div>
  </a>`;
}
export const skeletonRow = (title) => `<section class="row"><div class="row-head"><h2>${esc(title)}</h2></div><div class="scroller">${'<div class="skel skel-card"></div>'.repeat(8)}</div></section>`;
export const empty = (ic, text) => `<div class="empty">${ic}<div>${esc(text)}</div></div>`;
export const spinner = '<span class="spinner"></span>';

/** Disables a button while an async action runs. */
export async function busy(btn, fn) {
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = spinner + html.replace(/<svg[\s\S]*?<\/svg>/, '');
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
}

export function confirmDialog(text) {
  return new Promise((resolve) => {
    const d = document.createElement('div');
    d.className = 'modal-back';
    d.innerHTML = `<div class="modal small"><p>${esc(text)}</p><div class="modal-actions">
      <button class="btn btn-ghost" data-v="0">${esc(t('common.cancel'))}</button><button class="btn btn-danger" data-v="1">${esc(t('common.yes'))}</button></div></div>`;
    d.addEventListener('click', (e) => {
      const v = e.target.closest('[data-v]')?.dataset.v;
      if (v !== undefined || e.target === d) { d.remove(); resolve(v === '1'); }
    });
    document.body.append(d);
  });
}

/** Opens a modal; returns the element so callers can wire up their buttons. */
export function modal(title, bodyHtml) {
  const d = document.createElement('div');
  d.className = 'modal-back';
  d.innerHTML = `<div class="modal"><div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close>${icon.x}</button></div>${bodyHtml}</div>`;
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.remove(); });
  document.body.append(d);
  return d;
}

/** Copy to the clipboard – also over plain http in the LAN, where navigator.clipboard is missing. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall back below */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

// Spokarr – user interface
import { t, lang, setLang, locale, LANGUAGES } from './i18n.js';

const view = document.getElementById('view');
const searchInput = document.getElementById('searchInput');
let absUrl = '';
let refreshTimer = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = {
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3Zm0 6v5m0 3v.5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8L7 4Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 16a2 2 0 0 1 2-2h13"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};
const STATUS_ICON = { available: icon.check, downloading: icon.down, processing: icon.clock, not_found: icon.warn, failed: icon.warn };

class ApiError extends Error { constructor(code, params) { super(code); this.code = code; this.params = params || {}; } }
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(d.error || 'generic', { code: r.status, ...(d.params || {}) });
  return d;
}
const errText = (e) => (e instanceof ApiError ? t('err.' + e.code, e.params) : e.message);
const msgText = (m) => (m ? t('msg.' + m.code, m.params) : '');

function toast(text, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.className = 'toast ' + kind;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 3800);
}
const duration = (min) => {
  if (!min) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? t('dur.hm', { h, m }) : t('dur.m', { m });
};
const size = (b) => (b > 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : Math.round(b / 1048576) + ' MB');
const year = (d) => (d || '').slice(0, 4);
// Audible reports languages as English words ("german"); show them in the interface language
const LANG_CODES = { english: 'en', german: 'de', french: 'fr', italian: 'it', spanish: 'es', japanese: 'ja', dutch: 'nl', portuguese: 'pt', polish: 'pl', swedish: 'sv', danish: 'da', norwegian: 'no', finnish: 'fi', russian: 'ru', chinese: 'zh', hindi: 'hi' };
const languageName = (l) => {
  const code = LANG_CODES[String(l || '').toLowerCase()];
  if (!code) return l;
  try { return new Intl.DisplayNames([locale()], { type: 'language' }).of(code); } catch { return l; }
};
const date = (d) => (d ? new Date(d).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const since = (d) => {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return t('time.justNow');
  if (s < 3600) return t('time.minAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return t('time.hAgo', { n: Math.floor(s / 3600) });
  return date(d);
};

function badge(status) {
  if (!status) return '';
  const extra = status.state === 'downloading' && status.progress ? ` ${Math.round(status.progress)} %` : '';
  return `<span class="badge b-${status.state}">${STATUS_ICON[status.state] || icon.warn}${t('status.' + status.state)}${extra}</span>`;
}

function card(b) {
  const series = b.series?.[0];
  return `<a class="card" href="#/book/${b.asin}" title="${esc(b.title)}">
    <img class="cover" src="${esc(b.coverSmall || b.cover)}" alt="" loading="lazy">
    ${badge(b.status)}
    <div class="overlay"><b>${esc(b.title)}</b><small>${esc(b.authors?.[0] || '')}${b.narrators?.length ? ' · ' + esc(b.narrators[0]) : ''}</small>${series ? `<small>${esc(series.title)}${series.seq ? ' #' + esc(series.seq) : ''}</small>` : ''}</div>
    <div class="card-meta"><div class="t">${esc(b.title)}</div><div class="a">${esc(b.authors?.join(', ') || '')}</div></div>
  </a>`;
}
const skeletonRow = (title) => `<section class="row"><div class="row-head"><h2>${esc(title)}</h2></div><div class="scroller">${'<div class="skel skel-card"></div>'.repeat(8)}</div></section>`;
const empty = (ic, text) => `<div class="empty">${ic}<div>${esc(text)}</div></div>`;

function setActive(name) {
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
}

// ---------- Static texts ----------
function applyStaticTexts() {
  document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  searchInput.placeholder = t('search.placeholder');
  document.querySelectorAll('.lang-select').forEach((s) => (s.value = lang));
  document.querySelectorAll('.lang-code').forEach((el) => (el.textContent = lang.toUpperCase()));
}
function setupLanguageSelect() {
  const options = Object.entries(LANGUAGES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  document.querySelectorAll('.lang-select').forEach((s) => {
    s.innerHTML = options;
    s.value = lang;
    s.addEventListener('change', () => { setLang(s.value); applyStaticTexts(); route(); });
  });
}

// ---------- Pages ----------
async function pageDiscover() {
  setActive('discover');
  view.innerHTML = [t('row.popular'), t('row.new')].map(skeletonRow).join('');
  const rows = await api('/api/discover');
  view.innerHTML = rows.filter((r) => r.items.length).map((r) => `
    <section class="row">
      <div class="row-head"><h2>${esc(r.title || t('row.' + r.id))}</h2></div>
      <div class="scroller">${r.items.map(card).join('')}</div>
    </section>`).join('') || empty(icon.warn, t('discover.unavailable'));
}

async function pageSearch(q) {
  setActive('search');
  searchInput.value = q;
  if (!q) {
    view.innerHTML = empty(icon.search, t('search.prompt'));
    if (matchMedia('(max-width: 1023px)').matches) searchInput.focus();
    return;
  }
  view.innerHTML = `<h1 class="page-title">${esc(t('search.title'))}</h1><div class="grid">${'<div class="skel skel-card"></div>'.repeat(12)}</div>`;
  const items = await api('/api/search?q=' + encodeURIComponent(q));
  view.innerHTML = `<h1 class="page-title">${esc(t('search.titleFor', { q }))}</h1>` +
    (items.length ? `<div class="grid">${items.map(card).join('')}</div>` : empty(icon.search, t('search.none')));
}

const isActive = (b) => b.request && ['downloading', 'processing'].includes(b.request.status) && b.status?.state !== 'available';

async function pageBook(asin) {
  setActive('');
  view.innerHTML = `<div class="detail"><div class="detail-inner"><div class="detail-cover skel"></div><div class="detail-info"><div class="skel" style="height:40px;width:70%"></div><div class="skel" style="height:20px;width:40%;margin-top:14px"></div></div></div></div>`;
  const b = await api('/api/book/' + asin);
  renderBook(b);
  if (isActive(b)) refreshTimer = setTimeout(() => refreshBook(asin), 5000);
}
async function refreshBook(asin) {
  try {
    const b = await api('/api/book/' + asin);
    if (location.hash !== '#/book/' + asin) return;
    const scrollY = window.scrollY;
    const relOpen = !document.getElementById('relSection')?.hidden;
    const relHtml = document.getElementById('relBox')?.innerHTML;
    renderBook(b);
    if (relOpen && relHtml) {
      document.getElementById('relSection').hidden = false;
      document.getElementById('relBox').innerHTML = relHtml;
      bindReleaseButtons(b);
    }
    window.scrollTo(0, scrollY);
    if (isActive(b)) refreshTimer = setTimeout(() => refreshBook(asin), 5000);
  } catch { /* keep the page as it is */ }
}

function renderBook(b) {
  const st = b.status;
  const req = b.request;
  const series = b.series?.[0];
  const edition = b.abridged ? t('book.abridged') : t('book.unabridged');
  let action;
  if (st?.state === 'available') {
    action = absUrl
      ? `<a class="btn btn-green" href="${esc(absUrl)}${st.absId ? '/item/' + st.absId : ''}" target="_blank" rel="noopener">${icon.play}${esc(t('book.listen'))}</a>`
      : `<button class="btn btn-green" disabled>${icon.check}${esc(t('status.available'))}</button>`;
  } else if (st?.state === 'downloading' || st?.state === 'processing') {
    action = `<button class="btn btn-primary" disabled>${icon.down}${esc(t(st.state === 'downloading' ? 'book.downloadingBtn' : 'book.importingBtn'))}</button>`;
  } else {
    action = `<button class="btn btn-primary" id="reqBtn">${icon.plus}${esc(t(st ? 'book.requestAgain' : 'book.request'))}</button>`;
  }
  const progress = st?.state === 'downloading'
    ? `<div class="progress"><i style="width:${Math.max(2, st.progress || 0)}%"></i></div><div class="facts" style="margin-top:8px"><span>${Math.round(st.progress || 0)} %${req?.eta ? ' · ' + esc(t('book.left', { t: req.eta })) : ''}</span></div>`
    : '';
  const message = req?.message && st?.state !== 'available' ? `<div class="facts note">${esc(msgText(req.message))}</div>` : '';
  const row = (label, value) => `<div>${esc(label)}</div><div>${value || '–'}</div>`;

  view.innerHTML = `
  <div class="detail">
    <div class="detail-bg" style="background-image:url('${esc(b.cover)}')"></div>
    <div class="detail-inner">
      <img class="detail-cover" src="${esc(b.cover)}" alt="">
      <div class="detail-info">
        <div class="badges">${badge(st)}<span class="badge b-type">${esc(edition)}</span>${b.language ? `<span class="badge b-type">${esc(languageName(b.language))}</span>` : ''}</div>
        <h1>${esc(b.title)}</h1>
        ${b.subtitle ? `<div class="sub">${esc(b.subtitle)}</div>` : ''}
        <div class="facts">
          <span><b>${esc(t('book.by'))}</b>${esc(b.authors.join(', '))}</span>
          ${b.narrators.length ? `<span><b>${esc(t('book.narratedBy'))}</b>${esc(b.narrators.join(', '))}</span>` : ''}
          ${b.minutes ? `<span>${duration(b.minutes)}</span>` : ''}
          ${b.release ? `<span>${year(b.release)}</span>` : ''}
        </div>
        ${message}
        ${progress}
        <div class="actions">${action}<button class="btn btn-ghost" id="relBtn">${icon.list}${esc(t('book.releases'))}</button></div>
      </div>
    </div>
  </div>
  <div class="detail-grid">
    <div>
      ${b.summary ? `<div class="section"><h3>${esc(t('book.description'))}</h3><div class="overview">${esc(b.summary)}</div></div>` : ''}
      <div class="section" id="relSection" hidden><h3>${esc(t('book.releasesTitle'))}</h3><div class="panel releases" id="relBox"></div></div>
    </div>
    <div class="section">
      <div class="panel kv">
        ${series ? row(t('book.series'), esc(series.title) + (series.seq ? ' · ' + esc(t('book.seriesBook', { n: series.seq })) : '')) : ''}
        ${row(t('book.author'), esc(b.authors.join(', ')))}
        ${row(t('book.narrator'), esc(b.narrators.join(', ')))}
        ${row(t('book.length'), duration(b.minutes))}
        ${row(t('book.edition'), esc(edition))}
        ${row(t('book.released'), date(b.release))}
        ${row(t('book.publisher'), esc(b.publisher))}
        ${b.rating ? row(t('book.rating'), '★ ' + b.rating.toFixed(1)) : ''}
        ${row('ASIN', esc(b.asin))}
      </div>
    </div>
  </div>`;

  document.getElementById('reqBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${esc(t('book.searching'))}`;
    try {
      const r = await api('/api/requests', { method: 'POST', body: JSON.stringify({ asin: b.asin }) });
      if (r.status === 'downloading') toast(t('toast.requested'), 'ok');
      else toast(msgText(r.message) || t('toast.noMatch'), 'err');
      refreshBook(b.asin);
    } catch (err) {
      toast(errText(err), 'err');
      btn.disabled = false;
      btn.innerHTML = icon.plus + esc(t('book.request'));
    }
  });
  document.getElementById('relBtn').addEventListener('click', () => loadReleases(b));
}

async function loadReleases(b) {
  const sec = document.getElementById('relSection');
  const box = document.getElementById('relBox');
  sec.hidden = false;
  box.innerHTML = `<div class="rel"><span class="spinner"></span><div class="name">${esc(t('rel.searching'))}</div></div>`;
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const rels = await api(`/api/book/${b.asin}/releases`);
    box.innerHTML = rels.length ? rels.map((r) => `
      <div class="rel">
        <div class="score ${r.ok ? 'good' : r.score < 30 ? 'bad' : ''}">${r.score}</div>
        <div>
          <div class="name">${esc(r.title)}</div>
          <div class="why"><span>${size(r.size)}</span>${r.pubDate ? `<span>${since(r.pubDate)}</span>` : ''}${r.plus.map((x) => `<span class="pos">✓ ${esc(t('rel.plus.' + x))}</span>`).join('')}${r.minus.map((x) => `<span class="neg">✕ ${esc(t('rel.minus.' + x))}</span>`).join('')}</div>
        </div>
        <button class="btn btn-sm ${r.ok ? 'btn-primary' : 'btn-ghost'}" data-guid="${esc(r.guid)}">${icon.down}${esc(t('rel.download'))}</button>
      </div>`).join('') : `<div class="rel"><div></div><div class="name">${esc(t('rel.none'))}</div></div>`;
    bindReleaseButtons(b);
  } catch (e) {
    box.innerHTML = `<div class="rel"><div></div><div class="name">${esc(errText(e))}</div></div>`;
  }
}
function bindReleaseButtons(b) {
  document.querySelectorAll('#relBox [data-guid]').forEach((btn) => btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      await api('/api/requests', { method: 'POST', body: JSON.stringify({ asin: b.asin, guid: btn.dataset.guid }) });
      toast(t('toast.started'), 'ok');
      refreshBook(b.asin);
    } catch (e) {
      toast(errText(e), 'err');
      btn.disabled = false;
      btn.innerHTML = icon.down + esc(t('rel.download'));
    }
  }));
}

async function pageRequests(quiet = false) {
  setActive('requests');
  if (!quiet) view.innerHTML = `<h1 class="page-title">${esc(t('req.title'))}</h1><div class="req-list">${'<div class="skel" style="height:120px"></div>'.repeat(3)}</div>`;
  const list = await api('/api/requests');
  if (location.hash !== '#/requests') return;
  view.innerHTML = `<h1 class="page-title">${esc(t('req.title'))}</h1>` + (list.length ? `<div class="req-list">${list.map((r) => `
    <div class="panel req">
      <div class="req-bg" style="background-image:url('${esc(r.book.coverSmall || r.book.cover)}')"></div>
      <a href="#/book/${r.asin}"><img src="${esc(r.book.coverSmall || r.book.cover)}" alt=""></a>
      <div>
        <a href="#/book/${r.asin}" class="t">${esc(r.book.title)}</a>
        <div class="a">${esc(r.book.authors.join(', '))}${r.book.narrators.length ? ' · ' + esc(t('book.narratedBy')) + ' ' + esc(r.book.narrators.join(', ')) : ''}</div>
        ${r.status === 'downloading' ? `<div class="progress"><i style="width:${Math.max(2, r.progress)}%"></i></div>` : ''}
        <div class="m">${r.message ? esc(msgText(r.message)) + ' · ' : ''}${r.release ? esc(r.release.title) + ' · ' + size(r.release.size) + ' · ' : ''}${esc(t('req.requested', { t: since(r.createdAt) }))}</div>
      </div>
      <div class="side">
        ${badge({ state: r.status, progress: r.progress })}
        <button class="btn btn-sm btn-ghost" data-del="${r.id}" title="${esc(t('req.remove'))}">${icon.trash}</button>
      </div>
    </div>`).join('')}</div>` : empty(icon.book, t('req.empty')));
  view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(t('req.removeConfirm'))) return;
    await api('/api/requests/' + b.dataset.del, { method: 'DELETE' });
    pageRequests(true);
  }));
  if (list.some((r) => ['downloading', 'processing'].includes(r.status))) refreshTimer = setTimeout(() => location.hash === '#/requests' && pageRequests(true), 5000);
}

// ---------- Router ----------
async function route() {
  clearTimeout(refreshTimer);
  const h = location.hash.replace(/^#/, '') || '/';
  window.scrollTo(0, 0);
  try {
    let m;
    if (h === '/') await pageDiscover();
    else if ((m = h.match(/^\/search(?:\?q=(.*))?$/))) await pageSearch(decodeURIComponent(m[1] || ''));
    else if ((m = h.match(/^\/book\/([A-Z0-9]{10})$/))) await pageBook(m[1]);
    else if (h === '/requests') await pageRequests();
    else location.hash = '#/';
  } catch (e) {
    view.innerHTML = empty(icon.warn, errText(e));
  }
}

document.getElementById('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  searchInput.blur();
  location.hash = '#/search?q=' + encodeURIComponent(searchInput.value.trim());
});
let typing;
searchInput.addEventListener('input', () => {
  clearTimeout(typing);
  const q = searchInput.value.trim();
  if (q.length < 3) return;
  typing = setTimeout(() => { location.hash = '#/search?q=' + encodeURIComponent(q); }, 600);
});
window.addEventListener('hashchange', route);

setupLanguageSelect();
applyStaticTexts();
api('/api/config').then((c) => {
  absUrl = c.absUrl || '';
  document.querySelectorAll('.abs-link').forEach((a) => {
    if (absUrl) a.href = absUrl; else a.hidden = true;
  });
  document.querySelectorAll('.version').forEach((el) => (el.textContent = 'v' + c.version));
}).catch(() => {});
route();

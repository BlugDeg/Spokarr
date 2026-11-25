// Spokarr – app shell and router
import { LANGUAGES, lang, setLang, t } from './i18n.js';
import { api, avatar, empty, errText, esc, icon, post, view } from './lib.js';
import { renderLogin } from './pages/auth.js';
import { pageBook, stopBook } from './pages/book.js';
import { pageDiscover, pageRow, pageSearch } from './pages/catalog.js';
import { pageRequests, stopRequests } from './pages/requests.js';
import { pageSettings } from './pages/settings.js';
import { pageUsers } from './pages/users.js';
import { isAdmin, session } from './session.js';

const app = document.getElementById('app');
const authRoot = document.getElementById('auth');
const searchInput = document.getElementById('searchInput');

function setActive(name) {
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
}

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
    s.addEventListener('change', () => { setLang(s.value); applyStaticTexts(); renderUserChip(); start(); });
  });
}

function renderUserChip() {
  const u = session.user;
  document.querySelectorAll('[data-admin]').forEach((el) => (el.hidden = !isAdmin()));
  const absUrl = session.config.absUrl;
  document.querySelectorAll('.abs-link').forEach((a) => { if (absUrl) { a.href = absUrl; a.hidden = false; } else a.hidden = true; });
  const chip = document.getElementById('userChip');
  if (!u) { chip.innerHTML = ''; return; }
  chip.innerHTML = `${avatar(u.username)}<div class="chip-text"><b>${esc(u.username)}</b><small>${esc(u.owner ? t('users.role.owner') : t('users.role.' + u.role))}</small></div>
    <button class="icon-btn" id="logoutBtn" title="${esc(t('nav.signOut'))}" aria-label="${esc(t('nav.signOut'))}">${icon.logout}</button>`;
  chip.querySelector('#logoutBtn').addEventListener('click', signOut);
}

async function signOut() {
  await post('/api/auth/logout').catch(() => {});
  session.user = null;
  start();
}

function moreMenu() {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  const u = session.user;
  back.innerHTML = `<div class="sheet">
    <div class="sheet-user">${avatar(u.username, 'lg')}<div><b>${esc(u.username)}</b><small>${esc(u.owner ? t('users.role.owner') : t('users.role.' + u.role))}</small></div></div>
    ${session.config.absUrl ? `<a href="${esc(session.config.absUrl)}" target="_blank" rel="noopener">${icon.play}${esc(t('nav.audiobookshelf'))}</a>` : ''}
    ${isAdmin() ? `<a href="#/users">${icon.book}${esc(t('nav.users'))}</a><a href="#/settings">${icon.edit}${esc(t('nav.settings'))}</a>` : ''}
    <label class="sheet-lang">${esc(t('lang.label'))}<select class="lang-select-sheet">${Object.entries(LANGUAGES).map(([k, v]) => `<option value="${k}" ${k === lang ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <button id="sheetLogout">${icon.logout}${esc(t('nav.signOut'))}</button>
  </div>`;
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('a')) back.remove(); });
  back.querySelector('#sheetLogout').addEventListener('click', () => { back.remove(); signOut(); });
  back.querySelector('.lang-select-sheet').addEventListener('change', (e) => { setLang(e.target.value); applyStaticTexts(); back.remove(); renderUserChip(); route(); });
  document.body.append(back);
}

// ---------- Router ----------
async function route() {
  if (!session.user) return;
  stopBook();
  stopRequests();
  const h = location.hash.replace(/^#/, '') || '/';
  window.scrollTo(0, 0);
  try {
    let m;
    if ((m = h.match(/^\/?(?:\?(.*))?$/))) {
      setActive('discover');
      await pageDiscover(new URLSearchParams(m[1] || '').get('sort') || '');
    }
    else if ((m = h.match(/^\/row\/([a-z0-9]+)(?:\?(.*))?$/))) {
      setActive('');
      await pageRow(m[1], new URLSearchParams(m[2] || '').get('sort') || '');
    }
    else if ((m = h.match(/^\/search(?:\?(.*))?$/))) {
      setActive('search');
      const sp = new URLSearchParams(m[1] || '');
      await pageSearch(sp.get('q') || '', sp.get('genre') || '', sp.get('sort') || '');
    }
    else if ((m = h.match(/^\/book\/([A-Z0-9]{10})$/))) { setActive(''); await pageBook(m[1]); }
    else if (h === '/requests') { setActive('requests'); await pageRequests(); }
    else if (h === '/users' && isAdmin()) { setActive('users'); await pageUsers(); }
    else if ((m = h.match(/^\/settings(?:\/(\w+))?$/)) && isAdmin()) { setActive('settings'); await pageSettings(m[1]); }
    else location.hash = '#/';
  } catch (e) {
    view().innerHTML = empty(icon.warn, errText(e));
  }
}

async function start() {
  session.status = await api('/api/status').catch(() => ({ setupRequired: false }));
  session.user = session.status.user || null;
  if (!session.user) {
    app.hidden = true;
    authRoot.hidden = false;
    renderLogin(authRoot, start);
    return;
  }
  session.config = await api('/api/config').catch(() => ({}));
  authRoot.hidden = true;
  authRoot.innerHTML = '';
  app.hidden = false;
  renderUserChip();
  document.querySelectorAll('.version').forEach((el) => (el.textContent = 'v' + session.status.version));
  route();
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
document.getElementById('moreBtn').addEventListener('click', moreMenu);
window.addEventListener('hashchange', route);
window.addEventListener('spokarr:signedout', () => { if (session.user) { session.user = null; start(); } });

setupLanguageSelect();
applyStaticTexts();
start();

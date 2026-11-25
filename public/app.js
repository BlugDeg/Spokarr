// Spokarr – app shell and router
import { lang, setLang, t } from './i18n.js';
import { api, avatar, empty, errText, esc, icon, langSwitch, post, toast, view } from './lib.js';
import { renderInvite, renderLogin } from './pages/auth.js';
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
  renderLangSwitches();
}
function renderLangSwitches() {
  document.querySelectorAll('.lang-switch').forEach((el) => (el.innerHTML = langSwitch()));
}
function changeLang(code) {
  if (code === lang) return;
  setLang(code);
  applyStaticTexts();
  renderUserChip();
  if (session.user) { renderUpdate(); route(); } else start();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.lang-switch [data-lang]');
  if (!b) return;
  changeLang(b.dataset.lang);
  b.closest('.sheet-back')?.remove();
});

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
    <div class="sheet-lang"><span>${esc(t('lang.label'))}</span><div class="lang-switch" role="group" aria-label="Language">${langSwitch()}</div></div>
    <button id="sheetLogout">${icon.logout}${esc(t('nav.signOut'))}</button>
  </div>`;
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('a')) back.remove(); });
  back.querySelector('#sheetLogout').addEventListener('click', () => { back.remove(); signOut(); });
  document.body.append(back);
}

function toastSignedIn() { toast(t('invite.alreadySignedIn')); }

// ---------- Router ----------
async function route() {
  if (!session.user) return;
  stopBook();
  stopRequests();
  // a dialog belongs to the page it was opened on (back button, links in toasts)
  document.querySelectorAll('.modal-back').forEach((d) => d.remove());
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
    else if (h.startsWith('/invite/')) { toastSignedIn(); location.hash = '#/'; }
    else if (h === '/requests') { setActive('requests'); await pageRequests(); }
    else if (h === '/users' && isAdmin()) { setActive('users'); await pageUsers(); }
    else if ((m = h.match(/^\/settings(?:\/(\w+))?$/)) && isAdmin()) { setActive('settings'); await pageSettings(m[1]); }
    else location.hash = '#/';
  } catch (e) {
    view().innerHTML = empty(icon.warn, errText(e));
  }
}

// Version in the sidebar links to its release notes; a newer release shows a badge
const RELEASES = 'https://github.com/BlugDeg/Spokarr/releases';
function renderUpdate() {
  const st = session.status || {};
  document.querySelectorAll('.version').forEach((el) => { el.textContent = 'v' + st.version; el.href = `${RELEASES}/tag/v${st.version}`; });
  document.querySelectorAll('.update-badge').forEach((el) => {
    const u = st.update;
    el.hidden = !u;
    if (u) { el.href = u.url; el.innerHTML = `${icon.download}<span>${esc(t('update.available', { version: u.version }))}</span>`; }
  });
}

async function start() {
  session.status = await api('/api/status').catch(() => ({ setupRequired: false }));
  session.user = session.status.user || null;
  if (!session.user) {
    app.hidden = true;
    authRoot.hidden = false;
    const inv = location.hash.match(/^#\/invite\/([a-f0-9]{48})$/);
    if (inv && !session.status.setupRequired) renderInvite(authRoot, inv[1], start);
    else renderLogin(authRoot, start);
    return;
  }
  session.config = await api('/api/config').catch(() => ({}));
  authRoot.hidden = true;
  authRoot.innerHTML = '';
  app.hidden = false;
  renderUserChip();
  renderUpdate();
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
window.addEventListener('hashchange', () => (session.user ? route() : start()));
window.addEventListener('spokarr:signedout', () => { if (session.user) { session.user = null; start(); } });

applyStaticTexts();
start();

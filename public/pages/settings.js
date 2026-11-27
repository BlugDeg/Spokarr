// Settings (admins): general, Audiobookshelf, download client, indexers, about
import { t } from '../i18n.js';
import { api, busy, copyText, errText, esc, icon, languageName, post, put, toast, view } from '../lib.js';
import { session } from '../session.js';

const TABS = ['general', 'abs', 'downloads', 'indexers', 'notifications', 'about'];
const REGION_NAMES = { us: 'audible.com (US)', uk: 'audible.co.uk', ca: 'audible.ca', au: 'audible.com.au', in: 'audible.in', de: 'audible.de', fr: 'audible.fr', it: 'audible.it', es: 'audible.es', jp: 'audible.co.jp' };
const LANGS = ['english', 'german', 'french', 'italian', 'spanish', 'japanese'];
let data = null;
let libraries = null;
let genres = null;

export async function pageSettings(tab = 'general') {
  if (!TABS.includes(tab)) tab = 'general';
  const v = view();
  if (!data) v.innerHTML = `<h1 class="page-title">${esc(t('settings.title'))}</h1><div class="skel" style="height:320px"></div>`;
  data = await api('/api/settings');
  v.innerHTML = `
    <h1 class="page-title">${esc(t('settings.title'))}</h1>
    <nav class="tabs">${TABS.map((k) => `<a href="#/settings/${k}" class="${k === tab ? 'on' : ''}">${esc(t('settings.' + k))}</a>`).join('')}</nav>
    <div class="settings-body">${({ general, abs, downloads, indexers, notifications, about })[tab]()}</div>`;
  ({ general: bindGeneral, abs: bindAbs, downloads: bindDownloads, indexers: bindIndexers, notifications: bindNotifications, about: () => {} })[tab]();
  // The genre list costs a full category-tree build on a cold start (~45 s), which a plain
  // installation would pay once a day for nothing. So it is only fetched when the field is used.
  // Delegated on the container (focusin bubbles, focus does not), so it survives a re-render and
  // does not sit on a node that may already have been replaced.
  v.addEventListener('focusin', (e) => {
    if ((e.target?.name === 'discoverGenres' || e.target?.name === 'hiddenGenres') && !genres) fillGenres();
  });
}

async function fillGenres() {
  try {
    genres = await api('/api/genres');
  } catch {
    genres = [];
  }
  const list = document.getElementById('genreList');
  if (list) list.innerHTML = genres.map((n) => `<option value="${esc(n)}"></option>`).join('');
}

// ---------- building blocks ----------
const field = (label, input, hint = '') => `<label class="field"><span>${esc(label)}</span>${input}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
const text = (name, value, attrs = '') => `<input name="${name}" value="${esc(value ?? '')}" ${attrs}>`;
const keyInput = (name, has) => `<input name="${name}" type="password" autocomplete="off" placeholder="${esc(has ? t('settings.keyStored') : '')}">`;
const toggle = (name, checked, label, hint = '') => `<label class="toggle"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span class="switch"></span><span><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span></label>`;
const logo = (name) => `<img class="svc-logo" src="/icons/${name}.svg" alt="" width="26" height="26">`;
// A service card: logo, name, on/off switch; switched off it collapses to that one line
const svcCard = (attrs, logoName, title, pill, enabled, body) => `
  <section class="panel settings-section client${enabled ? '' : ' off'}" ${attrs}>
    <div class="indexer-head"><h2>${logo(logoName)}${esc(title)}${pill ? ` <span class="pill">${esc(pill)}</span>` : ''}</h2>${toggle('enabled', enabled, t('settings.indexerEnabled'))}</div>
    <div class="client-body">${body}</div>
  </section>`;
const testFoot = (label = t('settings.test')) => `<div class="indexer-foot"><span class="test-result" data-result></span><button type="button" class="btn btn-ghost btn-sm" data-test>${icon.plug}${esc(label)}</button></div>`;
const loginFields = (c) => `<div class="grid-2">
        ${field(t('login.username'), text('username', c.username, 'autocomplete="off"'))}
        ${field(t('login.password'), `<input name="password" type="password" autocomplete="new-password" placeholder="${esc(c.hasPassword ? t('settings.keyStored') : '')}">`)}
      </div>`;
// Opening a switched-off card when it is switched on
function bindCollapse(root) {
  root.querySelectorAll('.client').forEach((card) => {
    const sw = card.querySelector('.indexer-head [name=enabled]');
    sw?.addEventListener('change', () => card.classList.toggle('off', !sw.checked));
  });
}
const section = (title, inner, hint = '', logoName = '') => `<section class="panel settings-section"><h2${logoName ? ' class="with-logo"' : ''}>${logoName ? logo(logoName) : ''}${esc(title)}</h2>${hint ? `<p class="muted">${esc(hint)}</p>` : ''}${inner}</section>`;
const saveBar = (extra = '') => `<div class="save-bar">${extra}<span class="test-result" id="testResult"></span><button class="btn btn-primary" type="submit">${esc(t('settings.save'))}</button></div>`;
function showTest(ok, textValue) {
  const el = document.getElementById('testResult');
  el.className = 'test-result ' + (ok ? 'ok' : 'err');
  el.innerHTML = (ok ? icon.check : icon.warn) + esc(textValue);
}
async function save(body) {
  data = await put('/api/settings', body);
  toast(t('settings.saved'), 'ok');
}

// ---------- General ----------
function general() {
  const g = data.general;
  const rows = g.discoverRows || [];
  const genreNames = genres || [];
  return `<form id="f">
    ${section(t('settings.region'), `<div class="grid-2">
      ${field(t('settings.region'), `<select name="region">${data.regions.map((r) => `<option value="${r}" ${r === g.region ? 'selected' : ''}>${esc(REGION_NAMES[r] || r)}</option>`).join('')}</select>`, t('settings.regionHint'))}
      ${field(t('settings.language'), `<select name="contentLanguage"><option value="">–</option>${LANGS.map((l) => `<option value="${l}" ${l === g.contentLanguage ? 'selected' : ''}>${esc(languageName(l))}</option>`).join('')}</select>`, t('settings.languageHint', { lang: languageName(data.effectiveLanguage) }))}</div>`)}
    ${section(t('settings.rows'), `
      <div class="row-editor" id="rows">${rows.map(rowEditor).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm" id="addRow">${icon.plus}${esc(t('settings.addRow'))}</button>`, t('settings.rowsHint'))}
    ${section(t('settings.genres'), `
      ${field(t('settings.genres'), text('discoverGenres', (g.discoverGenres || []).join(', '), 'placeholder="Science Fiction, Krimi" list="genreList"') + `<datalist id="genreList">${(genreNames || []).map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>`, t('settings.genresHint'))}
      ${field(t('settings.hiddenGenres'), text('hiddenGenres', (g.hiddenGenres || []).join(', '), 'placeholder="Romance, Erotik" list="genreList"'), t('settings.hiddenGenresHint'))}
      <div class="grid-2">${field(t('settings.genreSort'), `<select name="genreSort">${['popular','hot','new','rating','old','long'].map((k) => `<option value="${k}" ${k === (g.genreSort || 'popular') ? 'selected' : ''}>${esc(t('sort.' + k))}</option>`).join('')}</select>`, t('settings.genreSortHint'))}
      ${field(t('settings.rowItems'), text('rowItems', g.rowItems ?? 20, 'type="number" min="10" max="50"'), t('settings.rowItemsHint'))}</div>`)}
    ${section(t('settings.defaults'), `
      ${toggle('request', g.defaultPermissions.request, t('perm.request'), t('perm.requestHint'))}
      ${toggle('autoApprove', g.defaultPermissions.autoApprove, t('perm.autoApprove'), t('perm.autoApproveHint'))}
      ${toggle('manageRequests', g.defaultPermissions.manageRequests, t('perm.manageRequests'), t('perm.manageRequestsHint'))}`, t('settings.defaultsHint'))}
    ${section(t('settings.matching'), toggle('requireAuthor', g.requireAuthor === true, t('settings.requireAuthor'), t('settings.requireAuthorHint')))}
    ${section(t('settings.abs'), toggle('tagRequester', g.tagRequester, t('settings.tagRequester'), t('settings.tagRequesterHint')))}
    ${section(t('settings.app'), `
      <div class="grid-2">${field(t('settings.appUrl'), text('appUrl', g.appUrl, 'type="url" placeholder="https://spokarr.example.com"'), t('settings.appUrlHint'))}
      ${field(t('settings.stallHours'), text('stallHours', g.stallHours ?? 6, 'type="number" min="1" max="168"'), t('settings.stallHoursHint'))}</div>
      ${toggle('updateCheck', g.updateCheck !== false, t('settings.updateCheck'), t('settings.updateCheckHint'))}`)}
    ${saveBar()}
  </form>`;
}
const rowEditor = (r = {}) => `<div class="row-edit">
  <input data-k="title" placeholder="${esc(t('settings.rowTitle'))}" value="${esc(r.title || '')}">
  <input data-k="keywords" placeholder="${esc(t('settings.rowKeywords'))}" value="${esc(r.keywords || '')}">
  <input data-k="narrator" placeholder="${esc(t('settings.rowNarrator'))}" value="${esc(r.narrator || '')}">
  <button type="button" class="icon-btn" data-remove title="${esc(t('settings.remove'))}" aria-label="${esc(t('settings.remove'))}">${icon.trash}</button></div>`;
function bindGeneral() {
  const f = document.getElementById('f');
  const rows = f.querySelector('#rows');
  f.querySelector('#addRow').addEventListener('click', () => rows.insertAdjacentHTML('beforeend', rowEditor()));
  rows.addEventListener('click', (e) => e.target.closest('[data-remove]')?.closest('.row-edit').remove());
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(f.querySelector('[type=submit]'), async () => {
      try {
        await save({ general: {
          region: f.region.value, contentLanguage: f.contentLanguage.value, tagRequester: f.tagRequester.checked,
          appUrl: f.appUrl.value, stallHours: Number(f.stallHours.value), updateCheck: f.updateCheck.checked, requireAuthor: f.requireAuthor.checked,
          discoverRows: [...rows.querySelectorAll('.row-edit')].map((r) => Object.fromEntries([...r.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value]))),
          discoverGenres: String(f.discoverGenres.value || '').split(',').map((x) => x.trim()).filter(Boolean),
          hiddenGenres: String(f.hiddenGenres.value || '').split(',').map((x) => x.trim()).filter(Boolean),
          genreSort: f.genreSort.value, rowItems: Math.min(50, Math.max(10, Number(f.rowItems.value) || 20)),
          defaultPermissions: { request: f.request.checked, autoApprove: f.autoApprove.checked, manageRequests: f.manageRequests.checked },
        } });
        pageSettings('general');
      } catch (err) { toast(errText(err), 'err'); }
    });
  });
}

// ---------- Audiobookshelf ----------
function abs() {
  const a = data.abs;
  const libs = libraries || (a.libraryId ? [{ id: a.libraryId, name: a.libraryId, mediaType: 'book' }] : []);
  return `<form id="f">
    ${section(t('settings.abs'), `
      ${field(t('settings.absUrl'), text('url', a.url, 'type="url" placeholder="http://audiobookshelf:80"'), t('settings.absUrlHint'))}
      ${field(t('settings.absPublicUrl'), text('publicUrl', a.publicUrl, 'type="url" placeholder="https://abs.example.com"'), t('settings.absPublicUrlHint'))}
      ${field(t('settings.apiKey'), keyInput('apiKey', a.hasApiKey), t('settings.absKeyHint'))}
      ${field(t('settings.library'), `<select name="libraryId"><option value="">–</option>${libs.filter((l) => l.mediaType === 'book').map((l) => `<option value="${esc(l.id)}" ${l.id === a.libraryId ? 'selected' : ''}>${esc(l.name)}${l.folders?.length ? ' – ' + esc(l.folders.join(', ')) : ''}</option>`).join('')}</select>`, t('settings.libraryHint'))}
      ${field(t('settings.libraryMount'), text('libraryMount', a.libraryMount, 'placeholder="/audiobooks"'), t('settings.libraryMountHint', { dir: data.libraryDir }))}`, '', 'audiobookshelf')}
    ${saveBar(`<button type="button" class="btn btn-ghost" id="test">${icon.plug}${esc(t('settings.test'))}</button>`)}
  </form>
  ${sso()}`;
}

// Single sign-on: a card of its own below, with its own save button
const ssoRedirect = () => `${(data.general.appUrl || location.origin).replace(/\/+$/, '')}/api/auth/oidc/callback`;
function sso() {
  const o = data.oidc || {};
  return `<form id="fsso">${svcCard('data-sso', 'openid', t('sso.title'), '', !!o.enabled, `
      <p class="muted">${esc(t('sso.hint'))}</p>
      ${field(t('sso.issuer'), text('issuer', o.issuer, 'type="url" placeholder="https://auth.example.com/application/o/spokarr/"'), t('sso.issuerHint'))}
      <div class="grid-2">
        ${field(t('sso.clientId'), text('clientId', o.clientId, 'autocomplete="off"'))}
        ${field(t('sso.clientSecret'), keyInput('clientSecret', o.hasClientSecret))}
      </div>
      <div class="grid-2">
        ${field(t('sso.label'), text('label', o.label || 'SSO', 'maxlength="40"'), t('sso.labelHint'))}
        ${field(t('sso.claim'), text('usernameClaim', o.usernameClaim || 'preferred_username'), t('sso.claimHint'))}
      </div>
      <label class="field"><span>${esc(t('sso.redirect'))}</span><div class="copy-row"><input readonly value="${esc(ssoRedirect())}" data-redirect><button type="button" class="icon-btn" data-copy title="${esc(t('sso.copy'))}" aria-label="${esc(t('sso.copy'))}">${icon.copy}</button></div><small>${esc(t('sso.redirectHint'))}</small></label>
      ${toggle('hidePassword', !!o.hidePassword, t('sso.hidePassword'), t('sso.hidePasswordHint'))}
      ${testFoot()}`)}
    <div class="save-bar"><button class="btn btn-primary" type="submit">${esc(t('settings.save'))}</button></div>
  </form>`;
}
function bindSso() {
  const f = document.getElementById('fsso');
  if (!f) return;
  bindCollapse(f);
  const values = () => ({
    enabled: f.enabled.checked, issuer: f.issuer.value, clientId: f.clientId.value, clientSecret: f.clientSecret.value,
    label: f.label.value, usernameClaim: f.usernameClaim.value, hidePassword: f.hidePassword.checked,
  });
  f.querySelector('[data-copy]').addEventListener('click', () => copyText(f.querySelector('[data-redirect]').value));
  f.querySelector('[data-test]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const out = f.querySelector('[data-result]');
    try {
      const r = await post('/api/settings/test/oidc', { issuer: f.issuer.value });
      out.className = 'test-result ok';
      out.innerHTML = icon.check + esc(`${t('settings.testOk')} · ${r.issuer}`);
    } catch (err) { out.className = 'test-result err'; out.innerHTML = icon.warn + esc(errText(err)); }
  }));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(f.querySelector('[type=submit]'), async () => {
      try { await save({ oidc: values() }); pageSettings('abs'); } catch (err) { toast(errText(err), 'err'); }
    });
  });
}
function bindAbs() {
  bindSso();
  const f = document.getElementById('f');
  const values = () => ({ url: f.url.value, publicUrl: f.publicUrl.value, apiKey: f.apiKey.value, libraryId: f.libraryId.value, libraryMount: f.libraryMount.value });
  f.querySelector('#test').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      const r = await post('/api/settings/test/abs', values());
      const keep = values();
      libraries = r.libraries;
      data.abs = { ...data.abs, ...keep, hasApiKey: data.abs.hasApiKey || !!keep.apiKey };
      document.querySelector('.settings-body').innerHTML = abs();
      bindAbs();
      document.getElementById('f').apiKey.value = keep.apiKey;
      showTest(true, `${t('settings.testOk')} · Audiobookshelf ${r.version}`);
    } catch (err) { showTest(false, errText(err)); }
  }));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(f.querySelector('[type=submit]'), async () => {
      try { await save({ abs: values() }); session.config.absUrl = data.abs.publicUrl || data.abs.url; pageSettings('abs'); } catch (err) { toast(errText(err), 'err'); }
    });
  });
}

// ---------- Download clients ----------
const pathFields = (c) => `
  <details class="advanced"${c.pathFrom ? ' open' : ''}><summary>${esc(t('settings.pathMapping'))}</summary>
    <p class="muted">${esc(t('settings.pathMappingHint', { dir: data.libraryDir }))}</p>
    <div class="grid-2">
      ${field(t('settings.pathFrom'), text('pathFrom', c.pathFrom, 'placeholder="/downloads"'))}
      ${field(t('settings.pathTo'), text('pathTo', c.pathTo, 'placeholder="/media/downloads"'))}
    </div>
  </details>`;
function downloads() {
  const s = data.sab;
  const q = data.qbit;
  const n = data.nzbget || {};
  const tr = data.transmission || {};
  const dl = data.deluge || {};
  return `<form id="f">
    ${svcCard('data-client="sab"', 'sabnzbd', 'SABnzbd', 'Usenet', s.enabled !== false, `
      <div class="grid-2">
        ${field(t('settings.sabUrl'), text('url', s.url, 'type="url" placeholder="http://sabnzbd:8080"'))}
        ${field(t('settings.apiKey'), keyInput('apiKey', s.hasApiKey), t('settings.sabKeyHint'))}
      </div>
      ${field(t('settings.sabCategory'), text('category', s.category, 'placeholder="spokarr"'), t('settings.sabCategoryHint'))}
      ${pathFields(s)}${testFoot()}`)}
    ${svcCard('data-client="nzbget"', 'nzbget', 'NZBGet', 'Usenet', n.enabled === true, `
      <p class="muted client-hint">${esc(t('settings.nzbgetHint'))}</p>
      ${field(t('settings.nzbgetUrl'), text('url', n.url, 'type="url" placeholder="http://nzbget:6789"'))}
      ${loginFields(n)}
      ${field(t('settings.sabCategory'), text('category', n.category, 'placeholder="spokarr"'), t('settings.nzbgetCategoryHint'))}
      ${pathFields(n)}${testFoot()}`)}
    ${svcCard('data-client="qbit"', 'qbittorrent', 'qBittorrent', 'Torrent', q.enabled === true, `
      ${field(t('settings.qbitUrl'), text('url', q.url, 'type="url" placeholder="http://qbittorrent:8080"'), t('settings.qbitUrlHint'))}
      ${loginFields(q)}
      ${field(t('settings.sabCategory'), text('category', q.category, 'placeholder="spokarr"'), t('settings.qbitCategoryHint'))}
      ${pathFields(q)}${testFoot()}`)}
    ${svcCard('data-client="transmission"', 'transmission', 'Transmission', 'Torrent', tr.enabled === true, `
      <p class="muted client-hint">${esc(t('settings.transmissionHint'))}</p>
      ${field(t('settings.transmissionUrl'), text('url', tr.url, 'type="url" placeholder="http://transmission:9091"'), t('settings.transmissionUrlHint'))}
      ${loginFields(tr)}
      <div class="grid-2">
        ${field(t('settings.transmissionLabel'), text('label', tr.label, 'placeholder="spokarr"'), t('settings.transmissionLabelHint'))}
        ${field(t('settings.transmissionDir'), text('downloadDir', tr.downloadDir, 'placeholder="/downloads/audiobooks"'), t('settings.transmissionDirHint'))}
      </div>
      ${pathFields(tr)}${testFoot()}`)}
    ${svcCard('data-client="deluge"', 'deluge', 'Deluge', 'Torrent', dl.enabled === true, `
      <p class="muted client-hint">${esc(t('settings.delugeHint'))}</p>
      <div class="grid-2">
        ${field(t('settings.delugeUrl'), text('url', dl.url, 'type="url" placeholder="http://deluge:8112"'), t('settings.delugeUrlHint'))}
        ${field(t('login.password'), `<input name="password" type="password" autocomplete="new-password" placeholder="${esc(dl.hasPassword ? t('settings.keyStored') : '')}">`, t('settings.delugePasswordHint'))}
      </div>
      <div class="grid-2">
        ${field(t('settings.transmissionLabel'), text('label', dl.label, 'placeholder="spokarr"'), t('settings.delugeLabelHint'))}
        ${field(t('settings.transmissionDir'), text('downloadDir', dl.downloadDir, 'placeholder="/downloads/audiobooks"'), t('settings.delugeDirHint'))}
      </div>
      ${pathFields(dl)}${testFoot()}`)}
    ${saveBar()}
  </form>`;
}
function bindDownloads() {
  const f = document.getElementById('f');
  bindCollapse(f);
  const read = (sec) => ({
    enabled: sec.querySelector('[name=enabled]').checked,
    ...Object.fromEntries([...sec.querySelectorAll('input:not([type=checkbox])')].map((i) => [i.name, i.value])),
  });
  f.querySelectorAll('[data-client]').forEach((sec) => sec.querySelector('[data-test]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const out = sec.querySelector('[data-result]');
    const client = sec.dataset.client;
    try {
      const r = await post(`/api/settings/test/${client}`, read(sec));
      const name = { sab: 'SABnzbd', nzbget: 'NZBGet', qbit: 'qBittorrent', transmission: 'Transmission', deluge: 'Deluge' }[client];
      const okCat = r.categoryExists;
      out.className = 'test-result ' + (okCat ? 'ok' : 'err');
      out.innerHTML = (okCat ? icon.check : icon.warn) + esc(okCat ? `${t('settings.testOk')} · ${name} ${r.version}${r.labelWarning ? ' · ' + t('settings.delugeNoLabel') : ''}` : t('settings.sabCategoryMissing', { cat: read(sec).category, client: name }));
    } catch (err) { out.className = 'test-result err'; out.innerHTML = icon.warn + esc(errText(err)); }
  })));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const body = {};
    f.querySelectorAll('[data-client]').forEach((sec) => { body[sec.dataset.client] = read(sec); });
    busy(f.querySelector('[type=submit]'), async () => {
      try { await save(body); pageSettings('downloads'); } catch (err) { toast(errText(err), 'err'); }
    });
  });
}

// ---------- Indexers ----------
const indexerCard = (ix = { enabled: true, categories: '3030' }) => `
  <section class="panel settings-section indexer" data-id="${esc(ix.id || '')}">
    <div class="indexer-head">
      <input class="indexer-name" data-k="name" value="${esc(ix.name || 'Indexer')}" aria-label="${esc(t('settings.indexerName'))}">
      ${toggle('enabled', ix.enabled !== false, t('settings.indexerEnabled'))}
    </div>
    <div class="grid-2">
      ${field(t('settings.indexerUrl'), `<input data-k="url" type="url" value="${esc(ix.url || '')}" placeholder="https://indexer.example/api">`)}
      ${field(t('settings.apiKey'), `<input data-k="apiKey" type="password" autocomplete="off" placeholder="${esc(ix.hasApiKey ? t('settings.keyStored') : '')}">`)}
    </div>
    ${field(t('settings.indexerCategories'), `<input data-k="categories" value="${esc(ix.categories || '3030')}">`, t('settings.indexerCategoriesHint'))}
    <div class="indexer-foot">
      <span class="test-result" data-result></span>
      <button type="button" class="btn btn-ghost btn-sm" data-test>${icon.plug}${esc(t('settings.test'))}</button>
      <button type="button" class="btn btn-danger-ghost btn-sm" data-remove>${icon.trash}${esc(t('settings.remove'))}</button>
    </div>
  </section>`;
function indexers() {
  const list = data.indexers || [];
  const p = data.prowlarr || {};
  return `<form id="f">
    ${svcCard('id="prowlarr"', 'prowlarr', 'Prowlarr', '', p.enabled === true, `
      <p class="muted client-hint">${esc(t('settings.prowlarrHint'))}</p>
      <div class="grid-2">
        ${field(t('settings.indexerUrl'), text('url', p.url, 'type="url" placeholder="http://prowlarr:9696"'))}
        ${field(t('settings.apiKey'), keyInput('apiKey', p.hasApiKey), t('settings.prowlarrKeyHint'))}
      </div>
      ${field(t('settings.indexerCategories'), text('categories', p.categories || '3030'), t('settings.indexerCategoriesHint'))}
      ${testFoot()}`)}
    <h2 class="subhead">${esc(t('settings.newznabIndexers'))}</h2>
    <div id="ixList">${list.length ? list.map(indexerCard).join('') : `<p class="muted" id="noIx">${esc(t('settings.noIndexers'))}</p>`}</div>
    <button type="button" class="btn btn-ghost" id="addIx">${icon.plus}${esc(t('settings.addIndexer'))}</button>
    ${saveBar()}
  </form>`;
}
function bindIndexers() {
  const f = document.getElementById('f');
  bindCollapse(f);
  const list = f.querySelector('#ixList');
  const prow = f.querySelector('#prowlarr');
  const readProw = () => ({ enabled: prow.querySelector('[name=enabled]').checked, url: prow.querySelector('[name=url]').value, apiKey: prow.querySelector('[name=apiKey]').value, categories: prow.querySelector('[name=categories]').value });
  const read = (card) => ({
    id: card.dataset.id || undefined,
    ...Object.fromEntries([...card.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value])),
    enabled: card.querySelector('[name=enabled]').checked,
  });
  prow.querySelector('[data-test]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const out = prow.querySelector('[data-result]');
    try {
      const r = await post('/api/settings/test/prowlarr', readProw());
      out.className = 'test-result ok';
      out.innerHTML = icon.check + esc(`${t('settings.testOk')} · Prowlarr ${r.version}`) + `<small>${esc(t('settings.prowlarrIndexers', { n: r.indexers.length, list: r.indexers.map((i) => `${i.name} (${i.protocol})`).join(', ') || '–' }))}</small>`;
    } catch (err) { out.className = 'test-result err'; out.innerHTML = icon.warn + esc(errText(err)); }
  }));
  f.querySelector('#addIx').addEventListener('click', () => { f.querySelector('#noIx')?.remove(); list.insertAdjacentHTML('beforeend', indexerCard()); });
  list.addEventListener('click', async (e) => {
    const card = e.target.closest('.indexer');
    if (e.target.closest('[data-remove]')) return card.remove();
    const btn = e.target.closest('[data-test]');
    if (!btn) return;
    const out = card.querySelector('[data-result]');
    await busy(btn, async () => {
      try {
        const r = await post('/api/settings/test/indexer', read(card));
        out.className = 'test-result ok';
        out.innerHTML = icon.check + esc(t('settings.testOk')) + (r.categories.length ? `<small>${esc(t('settings.indexerCats', { cats: r.categories.map((c) => `${c.id} ${c.name}`).join(', ') }))}</small>` : '');
      } catch (err) { out.className = 'test-result err'; out.innerHTML = icon.warn + esc(errText(err)); }
    });
  });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(f.querySelector('[type=submit]'), async () => {
      try { await save({ prowlarr: readProw(), indexers: [...list.querySelectorAll('.indexer')].map(read) }); pageSettings('indexers'); } catch (err) { toast(errText(err), 'err'); }
    });
  });
}

// ---------- Notifications ----------
function notifications() {
  const n = data.notifications;
  const g = data.general;
  const events = (agent) => `<fieldset class="field events"><span>${esc(t('settings.events'))}</span>
    ${data.events.map((e) => `<label class="toggle"><input type="checkbox" data-event="${e}" ${agent.events.includes(e) ? 'checked' : ''}><span class="switch"></span><span><b>${esc(t('event.' + e))}</b><small>${esc(t('event.' + e + 'Hint'))}</small></span></label>`).join('')}
  </fieldset>`;
  return `<form id="f">
    ${section(t('settings.notifyLanguage'), field(t('settings.notifyLanguage'), `<select name="notifyLanguage"><option value="en" ${g.notifyLanguage !== 'de' ? 'selected' : ''}>English</option><option value="de" ${g.notifyLanguage === 'de' ? 'selected' : ''}>Deutsch</option></select>`, t('settings.notifyLanguageHint')))}
    ${svcCard('data-agent="discord"', 'discord', 'Discord', '', n.discord.enabled, `
      ${field(t('settings.webhook'), `<input name="webhook" type="password" autocomplete="off" placeholder="${esc(n.discord.hasWebhook ? t('settings.keyStored') : 'https://discord.com/api/webhooks/…')}">`, t('settings.webhookHint'))}
      ${events(n.discord)}
      ${testFoot(t('settings.sendTest'))}`)}
    ${svcCard('data-agent="ntfy"', 'ntfy', 'ntfy', '', n.ntfy.enabled, `
      <div class="grid-2">
        ${field(t('settings.ntfyServer'), text('server', n.ntfy.server, 'type="url" placeholder="https://ntfy.sh"'))}
        ${field(t('settings.ntfyTopic'), text('topic', n.ntfy.topic, 'placeholder="spokarr-…"'))}
      </div>
      ${field(t('settings.ntfyToken'), `<input name="token" type="password" autocomplete="off" placeholder="${esc(n.ntfy.hasToken ? t('settings.keyStored') : '')}">`, t('settings.ntfyHint'))}
      ${events(n.ntfy)}
      ${testFoot(t('settings.sendTest'))}`)}
    ${saveBar()}
  </form>`;
}
function bindNotifications() {
  const f = document.getElementById('f');
  bindCollapse(f);
  const read = (sec) => ({
    enabled: sec.querySelector('[name=enabled]').checked,
    ...Object.fromEntries([...sec.querySelectorAll('input:not([type=checkbox])')].map((i) => [i.name, i.value])),
    events: [...sec.querySelectorAll('[data-event]')].filter((i) => i.checked).map((i) => i.dataset.event),
  });
  f.querySelectorAll('[data-agent]').forEach((sec) => sec.querySelector('[data-test]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const out = sec.querySelector('[data-result]');
    try {
      await post(`/api/settings/test/notify/${sec.dataset.agent}`, read(sec));
      out.className = 'test-result ok'; out.innerHTML = icon.check + esc(t('settings.testSent'));
    } catch (err) { out.className = 'test-result err'; out.innerHTML = icon.warn + esc(errText(err)); }
  })));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const body = { general: { notifyLanguage: f.notifyLanguage.value }, notifications: {} };
    f.querySelectorAll('[data-agent]').forEach((sec) => { body.notifications[sec.dataset.agent] = read(sec); });
    busy(f.querySelector('[type=submit]'), async () => {
      try { await save(body); pageSettings('notifications'); } catch (err) { toast(errText(err), 'err'); }
    });
  });
}

// ---------- About ----------
const GITHUB = 'https://github.com/BlugDeg';
const ext = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;
function about() {
  const ver = session.status?.version || '';
  const latest = data.latest;
  const upd = session.status?.update;
  const versionInfo = upd
    ? `${esc(ver)} · <a class="update-inline" href="${esc(upd.url)}" target="_blank" rel="noopener">${esc(t('update.available', { version: upd.version }))}</a>`
    : `${ext(`${GITHUB}/Spokarr/releases/tag/v${ver}`, ver)}${latest ? ` <span class="muted">· ${esc(t('settings.upToDate'))}</span>` : ''}`;
  return section(t('settings.about'), `<div class="kv plain">
    <div>${esc(t('settings.version'))}</div><div>${versionInfo}</div>
    <div>${esc(t('settings.createdBy'))}</div><div>${ext(GITHUB, 'BlugDeg')}</div>
    <div>${esc(t('settings.aiLabel'))}</div><div>${esc(t('settings.aiText'))}</div>
    <div>${esc(t('settings.source'))}</div><div>${ext(`${GITHUB}/Spokarr`, 'github.com/BlugDeg/Spokarr')} · MIT</div>
    <div>${esc(t('settings.releases'))}</div><div>${ext(`${GITHUB}/Spokarr/releases`, t('settings.releasesLink'))}</div>
    <div>${esc(t('settings.dataDir'))}</div><div><code>${esc(data.libraryDir)}</code></div>
    <div>Audible</div><div>${esc(REGION_NAMES[data.general.region] || data.general.region)}</div>
    <div>${esc(t('settings.icons'))}</div><div>${ext('https://github.com/homarr-labs/dashboard-icons', 'dashboard-icons')} (Apache-2.0)</div>
  </div>`);
}

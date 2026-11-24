// Settings (admins): general, Audiobookshelf, download client, indexers, about
import { t } from '../i18n.js';
import { api, busy, errText, esc, icon, languageName, post, put, toast, view } from '../lib.js';
import { session } from '../session.js';

const TABS = ['general', 'abs', 'downloads', 'indexers', 'about'];
const REGION_NAMES = { us: 'audible.com (US)', uk: 'audible.co.uk', ca: 'audible.ca', au: 'audible.com.au', in: 'audible.in', de: 'audible.de', fr: 'audible.fr', it: 'audible.it', es: 'audible.es', jp: 'audible.co.jp' };
const LANGS = ['english', 'german', 'french', 'italian', 'spanish', 'japanese'];
let data = null;
let libraries = null;

export async function pageSettings(tab = 'general') {
  if (!TABS.includes(tab)) tab = 'general';
  const v = view();
  if (!data) v.innerHTML = `<h1 class="page-title">${esc(t('settings.title'))}</h1><div class="skel" style="height:320px"></div>`;
  data = await api('/api/settings');
  v.innerHTML = `
    <h1 class="page-title">${esc(t('settings.title'))}</h1>
    <nav class="tabs">${TABS.map((k) => `<a href="#/settings/${k}" class="${k === tab ? 'on' : ''}">${esc(t('settings.' + k))}</a>`).join('')}</nav>
    <div class="settings-body">${({ general, abs, downloads, indexers, about })[tab]()}</div>`;
  ({ general: bindGeneral, abs: bindAbs, downloads: bindDownloads, indexers: bindIndexers, about: () => {} })[tab]();
}

// ---------- building blocks ----------
const field = (label, input, hint = '') => `<label class="field"><span>${esc(label)}</span>${input}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
const text = (name, value, attrs = '') => `<input name="${name}" value="${esc(value ?? '')}" ${attrs}>`;
const keyInput = (name, has) => `<input name="${name}" type="password" autocomplete="off" placeholder="${esc(has ? t('settings.keyStored') : '')}">`;
const toggle = (name, checked, label, hint = '') => `<label class="toggle"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span class="switch"></span><span><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span></label>`;
const section = (title, inner, hint = '') => `<section class="panel settings-section"><h2>${esc(title)}</h2>${hint ? `<p class="muted">${esc(hint)}</p>` : ''}${inner}</section>`;
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
  return `<form id="f">
    ${section(t('settings.region'), `
      ${field(t('settings.region'), `<select name="region">${data.regions.map((r) => `<option value="${r}" ${r === g.region ? 'selected' : ''}>${esc(REGION_NAMES[r] || r)}</option>`).join('')}</select>`, t('settings.regionHint'))}
      ${field(t('settings.language'), `<select name="contentLanguage"><option value="">–</option>${LANGS.map((l) => `<option value="${l}" ${l === g.contentLanguage ? 'selected' : ''}>${esc(languageName(l))}</option>`).join('')}</select>`, t('settings.languageHint', { lang: languageName(data.effectiveLanguage) }))}`)}
    ${section(t('settings.rows'), `
      <div class="row-editor" id="rows">${rows.map(rowEditor).join('')}</div>
      <button type="button" class="btn btn-ghost btn-sm" id="addRow">${icon.plus}${esc(t('settings.addRow'))}</button>`, t('settings.rowsHint'))}
    ${section(t('settings.defaults'), `
      ${toggle('request', g.defaultPermissions.request, t('perm.request'), t('perm.requestHint'))}
      ${toggle('autoApprove', g.defaultPermissions.autoApprove, t('perm.autoApprove'), t('perm.autoApproveHint'))}
      ${toggle('manageRequests', g.defaultPermissions.manageRequests, t('perm.manageRequests'), t('perm.manageRequestsHint'))}`, t('settings.defaultsHint'))}
    ${section(t('settings.abs'), toggle('tagRequester', g.tagRequester, t('settings.tagRequester'), t('settings.tagRequesterHint')))}
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
          discoverRows: [...rows.querySelectorAll('.row-edit')].map((r) => Object.fromEntries([...r.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value]))),
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
      ${field(t('settings.libraryMount'), text('libraryMount', a.libraryMount, 'placeholder="/audiobooks"'), t('settings.libraryMountHint', { dir: data.libraryDir }))}`)}
    ${saveBar(`<button type="button" class="btn btn-ghost" id="test">${icon.plug}${esc(t('settings.test'))}</button>`)}
  </form>`;
}
function bindAbs() {
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

// ---------- Download client ----------
function downloads() {
  const s = data.sab;
  return `<form id="f">
    ${section('SABnzbd', `
      ${field(t('settings.sabUrl'), text('url', s.url, 'type="url" placeholder="http://sabnzbd:8080"'))}
      ${field(t('settings.apiKey'), keyInput('apiKey', s.hasApiKey), t('settings.sabKeyHint'))}
      ${field(t('settings.sabCategory'), text('category', s.category, 'placeholder="spokarr"'), t('settings.sabCategoryHint'))}`)}
    ${saveBar(`<button type="button" class="btn btn-ghost" id="test">${icon.plug}${esc(t('settings.test'))}</button>`)}
  </form>`;
}
function bindDownloads() {
  const f = document.getElementById('f');
  const values = () => ({ url: f.url.value, apiKey: f.apiKey.value, category: f.category.value });
  f.querySelector('#test').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      const r = await post('/api/settings/test/sab', values());
      showTest(r.categoryExists, r.categoryExists ? `${t('settings.testOk')} · SABnzbd ${r.version}` : t('settings.sabCategoryMissing', { cat: f.category.value }));
    } catch (err) { showTest(false, errText(err)); }
  }));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(f.querySelector('[type=submit]'), async () => {
      try { await save({ sab: values() }); pageSettings('downloads'); } catch (err) { toast(errText(err), 'err'); }
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
  return `<form id="f">
    <div id="ixList">${list.length ? list.map(indexerCard).join('') : `<p class="muted" id="noIx">${esc(t('settings.noIndexers'))}</p>`}</div>
    <button type="button" class="btn btn-ghost" id="addIx">${icon.plus}${esc(t('settings.addIndexer'))}</button>
    ${saveBar()}
  </form>`;
}
function bindIndexers() {
  const f = document.getElementById('f');
  const list = f.querySelector('#ixList');
  const read = (card) => ({
    id: card.dataset.id || undefined,
    ...Object.fromEntries([...card.querySelectorAll('[data-k]')].map((i) => [i.dataset.k, i.value])),
    enabled: card.querySelector('[name=enabled]').checked,
  });
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
      try { await save({ indexers: [...list.querySelectorAll('.indexer')].map(read) }); pageSettings('indexers'); } catch (err) { toast(errText(err), 'err'); }
    });
  });
}

// ---------- About ----------
function about() {
  return section(t('settings.about'), `<div class="kv plain">
    <div>${esc(t('settings.version'))}</div><div>${esc(session.status?.version || '')}</div>
    <div>${esc(t('settings.dataDir'))}</div><div><code>${esc(data.libraryDir)}</code></div>
    <div>Audible</div><div>${esc(REGION_NAMES[data.general.region] || data.general.region)}</div>
    <div>${esc(t('settings.source'))}</div><div><a href="https://github.com/BlugDeg/Spokarr" target="_blank" rel="noopener">GitHub</a></div>
  </div>`);
}

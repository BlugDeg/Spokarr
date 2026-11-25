// Book detail page
import { t } from '../i18n.js';
import {
  api, avatar, badge, busy, coverOf, date, releaseRows, duration, errText, esc, icon, languageName, msgText, post, since, size, spinner, toast, view, year,
} from '../lib.js';
import { can, session } from '../session.js';

let timer = null;
export const stopBook = () => clearTimeout(timer);
const isActive = (b) => ['downloading', 'processing'].includes(b.status?.state);
// Author, narrator and series lead to their own list page
const listLink = (kind, name) => `#/list?kind=${kind}&name=${encodeURIComponent(name)}`;
const nameLinks = (kind, names) => (names || []).map((n) => `<a href="${listLink(kind, n)}">${esc(n)}</a>`).join(', ');
const seriesLinks = (series) => (series || []).map((s) => `<a href="${listLink('series', s.title)}">${esc(s.title)}</a>`
  + (s.seq ? ' · ' + esc(t('book.seriesBook', { n: s.seq })) : '')).join(', ');

export async function pageBook(asin) {
  view().innerHTML = `<div class="detail"><div class="detail-inner"><div class="detail-cover skel"></div><div class="detail-info"><div class="skel" style="height:40px;width:70%"></div><div class="skel" style="height:20px;width:40%;margin-top:14px"></div></div></div></div>`;
  const b = await api('/api/book/' + asin);
  render(b);
  if (isActive(b)) timer = setTimeout(() => refresh(asin), 5000);
}
async function refresh(asin) {
  try {
    const b = await api('/api/book/' + asin);
    if (location.hash !== '#/book/' + asin) return;
    const y = window.scrollY;
    const rel = document.getElementById('relSection');
    const reopen = !!rel && !rel.hidden && relData && relAsin === asin;
    render(b);
    if (reopen) {
      document.getElementById('relSection').hidden = false;
      renderReleases(document.getElementById('relBox'), relData, b);
    }
    window.scrollTo(0, y);
    if (isActive(b)) timer = setTimeout(() => refresh(asin), 5000);
  } catch { /* keep the page */ }
}

function actionButtons(b) {
  const st = b.status?.state;
  const req = b.request;
  const out = [];
  if (st === 'available') {
    const url = session.config.absUrl;
    out.push(url
      ? `<a class="btn btn-green" href="${esc(url)}${b.status.absId ? '/item/' + b.status.absId : ''}" target="_blank" rel="noopener">${icon.play}${esc(t('book.listen'))}</a>`
      : `<button class="btn btn-green" disabled>${icon.check}${esc(t('status.available'))}</button>`);
  } else if (st === 'downloading' && req?.stalled && can('manageRequests') && req.id) {
    out.push(`<button class="btn btn-primary" data-approve="${req.id}">${icon.refresh}${esc(t('req.retry'))}</button>`);
  } else if (st === 'downloading' || st === 'processing') {
    out.push(`<button class="btn btn-primary" disabled>${icon.down}${esc(t(st === 'downloading' ? 'book.downloadingBtn' : 'book.importingBtn'))}</button>`);
  } else if (st === 'pending') {
    if (can('manageRequests') && req?.id) {
      out.push(`<button class="btn btn-green" data-approve="${req.id}">${icon.check}${esc(t('book.approve'))}</button>`);
      out.push(`<button class="btn btn-ghost" data-decline="${req.id}">${icon.x}${esc(t('book.decline'))}</button>`);
    } else {
      out.push(`<button class="btn btn-primary" disabled>${icon.clock}${esc(t('book.pendingBtn'))}</button>`);
    }
  } else if (can('request')) {
    out.push(`<button class="btn btn-primary" id="reqBtn">${icon.plus}${esc(t(st ? 'book.requestAgain' : 'book.request'))}</button>`);
  }
  if (can('manageRequests')) out.push(`<button class="btn btn-ghost" id="relBtn">${icon.list}${esc(t('book.releases'))}</button>`);
  return out.join('');
}

function render(b) {
  const st = b.status;
  const req = b.request;
  const series = b.series?.[0];
  const edition = b.abridged ? t('book.abridged') : t('book.unabridged');
  const progress = st?.state === 'downloading'
    ? `<div class="progress"><i style="width:${Math.max(2, st.progress || 0)}%"></i></div><div class="facts" style="margin-top:8px"><span>${Math.round(st.progress || 0)} %${req?.eta ? ' · ' + esc(t('book.left', { t: req.eta })) : ''}</span></div>`
    : '';
  const message = req?.message && st?.state !== 'available' ? `<div class="facts note">${esc(msgText(req.message))}</div>` : '';
  const chosen = req?.chosen ? `<div class="facts note">${esc(t('manual.chosen'))}: <b>${esc(req.chosen.title)}</b> · ${size(req.chosen.size)} · ${esc(req.chosen.indexer)}</div>` : '';
  const requester = req?.requestedBy && st?.state !== 'available'
    ? `<div class="facts requester">${avatar(req.requestedBy.username, 'sm')}<span>${esc(t('book.requestedBy', { name: req.requestedBy.username }))} · ${esc(since(req.createdAt))}</span></div>` : '';
  const row = (label, value) => `<div>${esc(label)}</div><div>${value || '–'}</div>`;

  view().innerHTML = `
  <div class="detail">
    <div class="detail-bg" style="background-image:url('${esc(coverOf(b, false))}')"></div>
    <div class="detail-inner">
      <img class="detail-cover" src="${esc(coverOf(b, false))}" alt="">
      <div class="detail-info">
        <div class="badges">${badge(st)}${b.manual ? `<span class="badge b-manual">${esc(t('manual.badge'))}</span>` : ''}${b.drama ? `<span class="badge b-type">${esc(t('manual.kindDrama'))}</span>` : ''}<span class="badge b-type">${esc(edition)}</span>${b.language ? `<span class="badge b-type">${esc(languageName(b.language))}</span>` : ''}</div>
        <h1>${esc(b.title)}</h1>
        ${b.subtitle ? `<div class="sub">${esc(b.subtitle)}</div>` : ''}
        <div class="facts">
          <span><b>${esc(t('book.by'))}</b>${nameLinks('author', b.authors)}</span>
          ${b.narrators.length ? `<span><b>${esc(t('book.narratedBy'))}</b>${nameLinks('narrator', b.narrators)}</span>` : ''}
          ${b.minutes ? `<span>${duration(b.minutes)}</span>` : ''}
          ${b.release ? `<span>${year(b.release)}</span>` : ''}
        </div>
        ${requester}${chosen}${message}${progress}
        <div class="actions">${actionButtons(b)}</div>
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
        ${b.series?.length ? row(t('book.series'), seriesLinks(b.series)) : ''}
        ${row(t('book.author'), nameLinks('author', b.authors))}
        ${row(t('book.narrator'), nameLinks('narrator', b.narrators))}
        ${row(t('book.length'), duration(b.minutes))}
        ${row(t('book.edition'), esc(edition))}
        ${row(t('book.released'), b.manual ? year(b.release) : date(b.release))}
        ${row(t('book.publisher'), esc(b.publisher))}
        ${b.rating ? row(t('book.rating'), '★ ' + b.rating.toFixed(1)) : ''}
        ${b.manual ? row(t('manual.source'), esc(t(b.requireNarrator ? 'manual.sourceNarrator' : 'manual.sourceText'))) : row('ASIN', esc(b.asin))}
      </div>
    </div>
  </div>`;

  const v = view();
  v.querySelector('#reqBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `${spinner}${esc(t('book.searching'))}`;
    try {
      const r = await post('/api/requests', { asin: b.asin });
      if (r.status === 'downloading') toast(t('toast.requested'), 'ok');
      else if (r.status === 'pending') toast(t('toast.pending'), 'ok');
      else toast(msgText(r.message) || t('toast.noMatch'), 'err');
      refresh(b.asin);
    } catch (err) {
      toast(errText(err), 'err');
      refresh(b.asin);
    }
  });
  v.querySelector('[data-approve]')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      const r = await post(`/api/requests/${e.currentTarget.dataset.approve}/approve`);
      const ok = r.status === 'downloading' && !r.stalled;
      toast(ok ? t('toast.approved') : (msgText(r.message) || t('toast.noMatch')), ok ? 'ok' : 'err');
    } catch (err) { toast(errText(err), 'err'); }
    refresh(b.asin);
  }));
  v.querySelector('[data-decline]')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try { await post(`/api/requests/${e.currentTarget.dataset.decline}/decline`); toast(t('toast.declined')); } catch (err) { toast(errText(err), 'err'); }
    refresh(b.asin);
  }));
  v.querySelector('#relBtn')?.addEventListener('click', () => loadReleases(b));
}

let relData = null;
let relAsin = null;
let relOrder = 'score';
// Score is the default order the server returns; the rest is a plain local re-sort.
const REL_ORDERS = {
  score: null,
  size: (a, b) => (b.size || 0) - (a.size || 0),
  // pubDate comes from the indexer as an RFC 822 string, so compare timestamps instead of text
  new: (a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0),
  seeders: (a, b) => (b.seeders || 0) - (a.seeders || 0),
  indexer: (a, b) => String(a.indexer || '').localeCompare(String(b.indexer || ''), 'de'),
};

function renderReleases(box, rels, b) {
  relData = rels;
  relAsin = b.asin;
  const sorted = REL_ORDERS[relOrder] ? [...rels].sort(REL_ORDERS[relOrder]) : rels;
  box.innerHTML = sorted.length
    ? `<div class="sortbar"><label class="field"><span>${esc(t('discover.sort'))}</span><select data-rel-order>${['score', 'size', 'new', 'seeders', 'indexer'].map((k) => `<option value="${k}" ${k === relOrder ? 'selected' : ''}>${esc(t('rel.order.' + k))}</option>`).join('')}</select></label></div>`
      + releaseRows(sorted, t('rel.download'))
    : `<div class="rel"><div></div><div class="name">${esc(t('rel.none'))}</div></div>`;
  box.querySelector('[data-rel-order]')?.addEventListener('change', (e) => { relOrder = e.target.value; renderReleases(box, rels, b); });
  bindReleases(b);
}
async function loadReleases(b) {
  const sec = document.getElementById('relSection');
  const box = document.getElementById('relBox');
  sec.hidden = false;
  box.innerHTML = `<div class="rel">${spinner}<div class="name">${esc(t('rel.searching'))}</div></div>`;
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    renderReleases(box, await api(`/api/book/${b.asin}/releases`), b);
  } catch (e) {
    box.innerHTML = `<div class="rel"><div></div><div class="name">${esc(errText(e))}</div></div>`;
  }
}
function bindReleases(b) {
  document.querySelectorAll('#relBox [data-guid]').forEach((btn) => btn.addEventListener('click', () => busy(btn, async () => {
    try {
      await post(`/api/book/${b.asin}/download`, { guid: btn.dataset.guid });
      toast(t('toast.started'), 'ok');
      refresh(b.asin);
    } catch (e) { toast(errText(e), 'err'); }
  })));
}

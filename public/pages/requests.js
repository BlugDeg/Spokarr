// Requests list with filters, approval and retry
import { t } from '../i18n.js';
import { api, avatar, badge, busy, confirmDialog, coverOf, del, empty, errText, esc, icon, msgText, post, since, size, toast, view } from '../lib.js';
import { openManualRequest } from './manual.js';
import { can, session } from '../session.js';

let timer = null;
let filter = 'all';
export const stopRequests = () => clearTimeout(timer);

const FILTERS = {
  all: () => true,
  pending: (r) => r.status === 'pending',
  active: (r) => ['downloading', 'processing'].includes(r.status) && !r.stalled,
  available: (r) => r.status === 'available',
  problems: (r) => ['not_found', 'failed', 'declined'].includes(r.status) || r.stalled,
  mine: (r) => r.requestedBy?.id === session.user.id,
};

export async function pageRequests(quiet = false) {
  const v = view();
  const manager = can('manageRequests');
  if (!manager && filter === 'mine') filter = 'all';
  if (!quiet) v.innerHTML = `<h1 class="page-title">${esc(t('req.title'))}</h1><div class="req-list">${'<div class="skel" style="height:120px"></div>'.repeat(3)}</div>`;
  const list = await api('/api/requests');
  if (location.hash !== '#/requests') return;
  const keys = manager ? Object.keys(FILTERS) : ['all', 'pending', 'active', 'available', 'problems'];
  const count = (k) => list.filter(FILTERS[k]).length;
  const shown = list.filter(FILTERS[filter]);
  v.innerHTML = `
    <div class="page-head"><h1 class="page-title">${esc(t('req.title'))}</h1>${can('request') ? `<button class="btn btn-ghost" id="manualBtn">${icon.plus}${esc(t('manual.open'))}</button>` : ''}</div>
    <div class="chips">${keys.map((k) => `<button class="chip ${k === filter ? 'on' : ''}" data-filter="${k}">${esc(t('req.filter.' + k))}<span>${count(k)}</span></button>`).join('')}</div>
    ${shown.length ? `<div class="req-list">${shown.map((r) => item(r, manager)).join('')}</div>` : empty(icon.book, t('req.empty'))}`;

  v.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; pageRequests(true); }));
  v.querySelector('#manualBtn')?.addEventListener('click', () => openManualRequest());
  v.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog(t('req.removeConfirm')))) return;
    try { await del('/api/requests/' + b.dataset.del); } catch (e) { toast(errText(e), 'err'); }
    pageRequests(true);
  }));
  v.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    try {
      const r = await post(`/api/requests/${b.dataset.approve}/approve`);
      const ok = r.status === 'downloading' && !r.stalled;
      toast(ok ? t('toast.approved') : (msgText(r.message) || t('toast.noMatch')), ok ? 'ok' : 'err');
    } catch (e) { toast(errText(e), 'err'); }
    pageRequests(true);
  })));
  v.querySelectorAll('[data-decline]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    try { await post(`/api/requests/${b.dataset.decline}/decline`); toast(t('toast.declined')); } catch (e) { toast(errText(e), 'err'); }
    pageRequests(true);
  })));
  if (list.some((r) => ['downloading', 'processing'].includes(r.status))) {
    timer = setTimeout(() => location.hash === '#/requests' && pageRequests(true), 5000);
  }
}

function item(r, manager) {
  const cover = esc(coverOf(r.book));
  const actions = [];
  if (manager && r.status === 'pending') {
    actions.push(`<button class="btn btn-sm btn-green" data-approve="${r.id}">${icon.check}${esc(t('book.approve'))}</button>`);
    actions.push(`<button class="btn btn-sm btn-ghost" data-decline="${r.id}">${icon.x}${esc(t('book.decline'))}</button>`);
  }
  if (manager && (['not_found', 'failed'].includes(r.status) || r.stalled)) {
    actions.push(`<button class="btn btn-sm btn-ghost" data-approve="${r.id}">${icon.refresh}${esc(t('req.retry'))}</button>`);
  }
  const mayDelete = manager || (r.requestedBy?.id === session.user.id && !['downloading', 'processing'].includes(r.status));
  if (mayDelete) actions.push(`<button class="btn btn-sm btn-ghost" data-del="${r.id}" title="${esc(t('req.remove'))}" aria-label="${esc(t('req.remove'))}">${icon.trash}</button>`);
  return `
    <div class="panel req">
      <div class="req-bg" style="background-image:url('${cover}')"></div>
      <a href="#/book/${r.asin}"><img src="${cover}" alt=""></a>
      <div class="req-main">
        <a href="#/book/${r.asin}" class="t">${esc(r.book.title)}</a>
        <div class="a">${esc(r.book.authors.join(', '))}${r.book.narrators.length ? ' · ' + esc(t('book.narratedBy')) + ' ' + esc(r.book.narrators.join(', ')) : ''}</div>
        ${r.status === 'downloading' ? `<div class="progress"><i style="width:${Math.max(2, r.progress)}%"></i></div>` : ''}
        <div class="m">
          ${r.requestedBy ? `<span class="who">${avatar(r.requestedBy.username, 'xs')}${esc(r.requestedBy.username)}</span>` : ''}
          <span>${esc(t('req.requested', { t: since(r.createdAt) }))}</span>
          ${r.message ? `<span>${esc(msgText(r.message))}</span>` : ''}
          ${r.release && manager ? `<span class="rel-name">${esc(r.release.title)} · ${size(r.release.size)}</span>` : ''}
        </div>
      </div>
      <div class="side">
        ${r.stalled ? `<span class="badge b-stalled">${icon.warn}${esc(t('status.stalled'))}</span>` : badge({ state: r.status, progress: r.progress })}
        <div class="side-actions">${actions.join('')}</div>
      </div>
    </div>`;
}

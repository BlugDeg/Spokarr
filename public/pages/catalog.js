// Discover and search
import { t } from '../i18n.js';
import { api, card, empty, errText, esc, icon, skeletonRow, view } from '../lib.js';

const SORT_KEYS = ['popular', 'hot', 'new', 'rating', 'old', 'long'];

// Same look as in the settings: label above the select
const sortField = (current, attr) => `
  <label class="field">
    <span>${esc(t('discover.sort'))}</span>
    <select ${attr}>
      ${SORT_KEYS.map((k) => `<option value="${k}" ${k === current ? 'selected' : ''}>${esc(t('sort.' + k))}</option>`).join('')}
    </select>
  </label>`;

const chipBar = (genres, active = '') => (genres && genres.length ? `
  <section class="row row-chips">
    <div class="row-head"><h2>${esc(t('discover.genres'))}</h2></div>
    <div class="chips">${genres.map((g) => `
      <a class="chip${g === active ? ' chip-active' : ''}" href="#/search?genre=${encodeURIComponent(g)}">${esc(g)}</a>`).join('')}
    </div>
  </section>` : '');

export async function pageDiscover(sort = '') {
  const v = view();
  v.innerHTML = [t('row.popular'), t('row.new')].map(skeletonRow).join('');
  const [rows, cfg] = await Promise.all([
    api('/api/discover' + (sort ? '?sort=' + encodeURIComponent(sort) : '')),
    api('/api/config').catch(() => ({ genres: [], genreSort: 'popular' })),
  ]);
  const current = sort || cfg.genreSort || 'popular';
  const body = rows.filter((r) => r.items.length).map((r) => `
    <section class="row">
      <div class="row-head"><h2><a href="#/row/${encodeURIComponent(r.id)}">${esc(r.title || t('row.' + r.id))}<span class="row-count">${r.items.length}</span></a></h2></div>
      <div class="scroller">${r.items.map(card).join('')}</div>
    </section>`).join('');
  // The sort control only applies to the genre rows - "Popular" and "New releases" are fixed rows,
  // so on an installation without genres it would be a control that does nothing.
  v.innerHTML = ((cfg.genres || []).length ? `<div class="sortbar">${sortField(current, 'data-discover-sort')}</div>` : '') +
    chipBar(cfg.genres || []) + (body || empty(icon.warn, t('discover.unavailable')));
  v.querySelector('[data-discover-sort]')?.addEventListener('change', (e) => {
    const s = e.target.value;
    location.hash = s === 'popular' ? '#/' : '#/?sort=' + encodeURIComponent(s);
  });
}

/**
 * One Discover row as a page of its own – reached by clicking the row heading. Genre rows keep the
 * sort picker, the other rows are fixed (best sellers / new releases / keyword).
 */
export async function pageRow(id, sort = '') {
  const v = view();
  const isGenre = /^genre/.test(id);
  const cfg = await api('/api/config').catch(() => ({ genreSort: 'popular' }));
  const current = sort || cfg.genreSort || 'popular';
  const skeletons = `<div class="grid">${'<div class="skel skel-card"></div>'.repeat(12)}</div>`;
  v.innerHTML = skeletons;
  let row;
  try {
    row = await api(`/api/row/${encodeURIComponent(id)}` + (isGenre ? '?sort=' + encodeURIComponent(current) : ''));
  } catch (e) {
    v.innerHTML = empty(icon.warn, errText(e));
    return;
  }
  const title = row.title || t('row.' + row.id);
  v.innerHTML = `<h1 class="page-title">${esc(title)}</h1>`
    + (isGenre ? `<div class="sortbar">${sortField(current, 'data-row-sort')}</div>` : '')
    + (row.items.length
      ? `<p class="muted">${row.items.length} ${esc(t('search.results'))}</p><div class="grid">${row.items.map(card).join('')}</div>`
      : empty(icon.search, t('search.none')));
  const sel = v.querySelector('[data-row-sort]');
  if (sel) sel.addEventListener('change', (e) => { location.hash = `#/row/${encodeURIComponent(id)}?sort=${encodeURIComponent(e.target.value)}`; });
}

export async function pageSearch(q, genre = '', sort = '') {
  const v = view();
  const input = document.getElementById('searchInput');
  input.value = q;
  const cfg = await api('/api/config').catch(() => ({ genres: [] }));
  const chips = chipBar(cfg.genres || [], genre);
  const current = sort || 'popular';
  if (!q && !genre) {
    v.innerHTML = chips + empty(icon.search, t('search.prompt'));
    if (matchMedia('(max-width: 1023px)').matches) input.focus();
    return;
  }
  const title = q && genre ? t('search.titleForGenre', { q, g: genre })
    : genre ? t('search.byGenre', { g: genre }) : t('search.titleFor', { q });
  const head = `<h1 class="page-title">${esc(title)}</h1>${chips}` +
    (genre ? `<div class="sortbar">${sortField(current, 'data-search-sort')}</div>` : '');
  v.innerHTML = head + `<div class="grid">${'<div class="skel skel-card"></div>'.repeat(12)}</div>`;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (genre) { params.set('genre', genre); params.set('sort', current); }
  const items = await api('/api/search?' + params.toString());
  v.innerHTML = head.replace('</h1>', `</h1>`) +
    (items.length
      ? `<p class="muted">${items.length} ${esc(t('search.results'))}</p><div class="grid">${items.map(card).join('')}</div>`
      : empty(icon.search, t('search.none')));
  const sel = v.querySelector('[data-search-sort]');
  if (sel) sel.addEventListener('change', (e) => {
    const p = new URLSearchParams({ genre, sort: e.target.value });
    if (q) p.set('q', q);
    location.hash = '#/search?' + p.toString();
  });
}

// Discover and search
import { t } from '../i18n.js';
import { api, card, empty, esc, icon, skeletonRow, view } from '../lib.js';

export async function pageDiscover() {
  const v = view();
  v.innerHTML = [t('row.popular'), t('row.new')].map(skeletonRow).join('');
  const rows = await api('/api/discover');
  v.innerHTML = rows.filter((r) => r.items.length).map((r) => `
    <section class="row">
      <div class="row-head"><h2>${esc(r.title || t('row.' + r.id))}</h2></div>
      <div class="scroller">${r.items.map(card).join('')}</div>
    </section>`).join('') || empty(icon.warn, t('discover.unavailable'));
}

export async function pageSearch(q) {
  const v = view();
  const input = document.getElementById('searchInput');
  input.value = q;
  if (!q) {
    v.innerHTML = empty(icon.search, t('search.prompt'));
    if (matchMedia('(max-width: 1023px)').matches) input.focus();
    return;
  }
  v.innerHTML = `<h1 class="page-title">${esc(t('search.title'))}</h1><div class="grid">${'<div class="skel skel-card"></div>'.repeat(12)}</div>`;
  const items = await api('/api/search?q=' + encodeURIComponent(q));
  v.innerHTML = `<h1 class="page-title">${esc(t('search.titleFor', { q }))}</h1>` +
    (items.length ? `<div class="grid">${items.map(card).join('')}</div>` : empty(icon.search, t('search.none')));
}

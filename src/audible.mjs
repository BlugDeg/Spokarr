// Audible catalog (public API, no account needed)
import { state } from './store.mjs';
import { cached, fetchJson, norm, stripHtml, UserError } from './util.mjs';

export const REGIONS = {
  us: { host: 'api.audible.com', abs: 'audible', lang: 'english' },
  uk: { host: 'api.audible.co.uk', abs: 'audible.uk', lang: 'english' },
  ca: { host: 'api.audible.ca', abs: 'audible.ca', lang: 'english' },
  au: { host: 'api.audible.com.au', abs: 'audible.au', lang: 'english' },
  in: { host: 'api.audible.in', abs: 'audible.in', lang: 'english' },
  de: { host: 'api.audible.de', abs: 'audible.de', lang: 'german' },
  fr: { host: 'api.audible.fr', abs: 'audible.fr', lang: 'french' },
  it: { host: 'api.audible.it', abs: 'audible.it', lang: 'italian' },
  es: { host: 'api.audible.es', abs: 'audible.es', lang: 'spanish' },
  jp: { host: 'api.audible.co.jp', abs: 'audible.jp', lang: 'japanese' },
};
export const region = () => REGIONS[state.settings.general.region] || REGIONS.us;
export const contentLanguage = () => state.settings.general.contentLanguage || region().lang;
const base = () => `https://${region().host}/1.0/catalog/products`;

const RG = 'contributors,media,product_attrs,product_desc,product_extended_attrs,series,rating';
const BOOK_TYPES = new Set(['SinglePartBook', 'MultiPartBook']);

async function audible(params) {
  const u = new URL(base());
  for (const [k, v] of Object.entries({ response_groups: RG, image_sizes: '500,1024', num_results: 30, ...params })) u.searchParams.set(k, v);
  return fetchJson(u, { headers: { Accept: 'application/json' } });
}
export function mapProduct(p) {
  return {
    asin: p.asin,
    title: p.title || '',
    subtitle: p.subtitle || '',
    authors: (p.authors || []).map((a) => a.name),
    narrators: (p.narrators || []).map((a) => a.name),
    minutes: p.runtime_length_min || 0,
    abridged: p.format_type === 'abridged',
    release: p.release_date || p.issue_date || '',
    series: (p.series || []).map((s) => ({ title: s.title, seq: s.sequence || '' })),
    cover: p.product_images?.['1024'] || p.product_images?.['500'] || '',
    coverSmall: p.product_images?.['500'] || p.product_images?.['1024'] || '',
    language: p.language || '',
    publisher: p.publisher_name || '',
    summary: stripHtml(p.publisher_summary || p.merchandising_summary || ''),
    genres: (p.thesaurus_subject_keywords || []).slice(0, 5),
    rating: Number(p.rating?.overall_distribution?.display_average_rating) || null,
  };
}
export async function searchAudible(params, { languageOnly = false } = {}) {
  const lang = contentLanguage();
  const d = await audible(params);
  return (d.products || [])
    .filter((p) => !p.content_delivery_type || BOOK_TYPES.has(p.content_delivery_type))
    .filter((p) => !languageOnly || p.language === lang)
    .map(mapProduct);
}
export async function getBook(asin) {
  return cached(`book:${state.settings.general.region}:${asin}`, 6 * 3600e3, async () => {
    const u = new URL(`${base()}/${encodeURIComponent(asin)}`);
    u.searchParams.set('response_groups', RG);
    u.searchParams.set('image_sizes', '500,1024');
    const d = await fetchJson(u, { headers: { Accept: 'application/json' } }).catch((e) => {
      if (e.status === 404) throw new UserError('book_not_found', {}, 404);
      throw e;
    });
    if (!d.product?.title) throw new UserError('book_not_found', {}, 404);
    return mapProduct(d.product);
  });
}

export async function discoverRows() {
  const g = state.settings.general;
  return cached(`discover:${g.region}:${contentLanguage()}:${JSON.stringify(g.discoverRows)}`, 30 * 60e3, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const jobs = [
      ['popular', null, () => searchAudible({ products_sort_by: 'BestSellers' }, { languageOnly: true })],
      ['new', null, async () => (await searchAudible({ products_sort_by: 'BestSellers', num_results: 50 }, { languageOnly: true }))
        .filter((b) => b.release && b.release <= today && b.release >= cutoff)],
      ...(g.discoverRows || []).filter((r) => r.title).map((row, i) => ['custom' + i, row.title, async () => {
        let items = await searchAudible({ products_sort_by: 'BestSellers', keywords: row.keywords || row.title }, { languageOnly: true });
        const narr = norm(row.narrator);
        if (narr) items = items.filter((b) => b.narrators.some((n) => norm(n) === narr));
        return items;
      }]),
    ];
    return Promise.all(jobs.map(async ([id, title, fn]) => {
      try { return { id, title, items: (await fn()).slice(0, 20) }; } catch (e) { return { id, title, items: [], error: e.message }; }
    }));
  });
}

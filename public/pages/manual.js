// Manual request: a book that is not (or no longer) in the Audible catalog
import { t } from '../i18n.js';
import { busy, errText, esc, icon, languageName, modal, msgText, post, releaseRows, spinner, toast } from '../lib.js';

const LANGS = ['english', 'german', 'french', 'italian', 'spanish', 'japanese', 'dutch'];

export function openManualRequest(prefill = {}) {
  const m = modal(t('manual.title'), `
    <p class="muted" id="manIntro">${esc(t('manual.intro'))}</p>
    <form class="form" id="manForm">
      <label class="field"><span>${esc(t('manual.bookTitle'))}</span><input name="title" required maxlength="200" value="${esc(prefill.title || '')}" placeholder="Guards! Guards!"></label>
      <div class="grid-2">
        <label class="field"><span>${esc(t('book.author'))}</span><input name="author" required maxlength="120" value="${esc(prefill.author || '')}" placeholder="Terry Pratchett"></label>
        <label class="field"><span>${esc(t('book.narrator'))}</span><input name="narrator" maxlength="120" placeholder="Nigel Planer"></label>
      </div>
      <label class="toggle"><input type="checkbox" name="requireNarrator" checked><span class="switch"></span><span><b>${esc(t('manual.requireNarrator'))}</b><small>${esc(t('manual.requireNarratorHint'))}</small></span></label>
      <div class="grid-2">
        <label class="field"><span>${esc(t('manual.language'))}</span><select name="language"><option value="">${esc(t('manual.languageDefault'))}</option>${LANGS.map((l) => `<option value="${l}">${esc(languageName(l))}</option>`).join('')}</select></label>
        <label class="field"><span>${esc(t('manual.year'))}</span><input name="year" inputmode="numeric" maxlength="4" placeholder="1995"></label>
      </div>
      <label class="field"><span>${esc(t('manual.kind'))}</span><select name="kind">
        <option value="reading">${esc(t('manual.kindReading'))}</option><option value="drama">${esc(t('manual.kindDrama'))}</option></select></label>
      <label class="toggle"><input type="checkbox" name="abridged"><span class="switch"></span><span><b>${esc(t('book.abridged'))}</b><small>${esc(t('manual.abridgedHint'))}</small></span></label>
      <label class="field"><span>${esc(t('manual.note'))}</span><input name="note" maxlength="500" placeholder="${esc(t('manual.notePlaceholder'))}"></label>
      <div class="modal-actions"><button type="submit" class="btn btn-primary">${icon.search}${esc(t('manual.search'))}</button></div>
    </form>
    <div id="manPick" hidden></div>`);
  const f = m.querySelector('#manForm');
  const syncNarr = () => { f.requireNarrator.disabled = !f.narrator.value.trim(); };
  f.narrator.addEventListener('input', syncNarr);
  syncNarr();
  const values = () => ({
    title: f.title.value, author: f.author.value, narrator: f.narrator.value,
    requireNarrator: f.requireNarrator.checked, language: f.language.value, year: f.year.value,
    abridged: f.abridged.checked, note: f.note.value, kind: f.kind.value,
  });
  const pick = m.querySelector('#manPick');
  const intro = m.querySelector('#manIntro');
  const showForm = () => { pick.hidden = true; f.hidden = false; intro.hidden = false; };

  // Step 2: the request itself, with the chosen release (or without one)
  async function request(guid, btn) {
    await busy(btn, async () => {
      try {
        const r = await post('/api/requests/manual', { ...values(), guid: guid || undefined });
        m.remove();
        const ok = r.status === 'downloading' || r.status === 'pending';
        toast(r.status === 'pending' ? t('toast.pending') : r.status === 'downloading' ? t('toast.requested') : (msgText(r.message) || t('toast.noMatch')), ok ? 'ok' : 'err');
        location.hash = '#/book/' + r.asin;
      } catch (err) { toast(errText(err), 'err'); }
    });
  }

  // Step 1: search only – nothing is requested or downloaded
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(f.querySelector('[type=submit]'), async () => {
      try {
        const rels = await post('/api/requests/manual/search', values());
        f.hidden = true;
        intro.hidden = true;
        pick.hidden = false;
        pick.innerHTML = rels.length
          ? `<h4 class="pick-head">${esc(t('manual.pickTitle'))}</h4><p class="muted">${esc(t('manual.pickIntro', { n: rels.length, title: f.title.value.trim() }))}</p>
             <div class="panel releases pick-list">${releaseRows(rels, t('manual.pick'))}</div>
             <div class="modal-actions spread"><button type="button" class="btn btn-ghost" data-back>${esc(t('manual.back'))}</button></div>`
          : `<p class="muted">${esc(t('manual.none'))}</p><p class="muted small-note">${esc(t('manual.saveAnywayHint'))}</p>
             <div class="modal-actions spread"><button type="button" class="btn btn-ghost" data-back>${esc(t('manual.back'))}</button>
             <button type="button" class="btn btn-primary" data-anyway>${icon.plus}${esc(t('manual.saveAnyway'))}</button></div>`;
        pick.querySelector('[data-back]').addEventListener('click', showForm);
        pick.querySelector('[data-anyway]')?.addEventListener('click', (ev) => request(null, ev.currentTarget));
        pick.querySelectorAll('[data-guid]').forEach((b) => b.addEventListener('click', () => request(b.dataset.guid, b)));
      } catch (err) { toast(errText(err), 'err'); }
    });
  });
}

/** Hint below search results: not found → request it by hand */
export const manualHint = () => `<div class="panel manual-hint">
  <div><b>${esc(t('manual.hintTitle'))}</b><small>${esc(t('manual.hintText'))}</small></div>
  <button type="button" class="btn btn-ghost" data-manual>${icon.plus}${esc(t('manual.open'))}</button></div>`;

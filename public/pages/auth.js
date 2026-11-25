// Sign-in and first-time setup
import { t } from '../i18n.js';
import { api, busy, date, errText, esc, langSwitch, post } from '../lib.js';
import { session } from '../session.js';

const shell = (inner) => `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="lang-switch auth-lang" role="group" aria-label="Language">${langSwitch()}</div>
      <div class="auth-brand"><img src="/logo.svg" alt="" width="52" height="52"><span>Spokarr</span></div>
      ${inner}
    </div>
  </div>`;

export function renderLogin(root, onDone) {
  const setup = session.status?.setupRequired;
  const needsAbs = setup && !session.status?.absConfigured;
  if (needsAbs) return renderSetupAbs(root, onDone);
  root.innerHTML = shell(`
    ${setup ? `<h1>${esc(t('setup.title'))}</h1><div class="steps"><span class="step done">1</span><span class="step on">2</span></div>
      <h2>${esc(t('setup.step2'))}</h2><p class="muted">${esc(t('setup.step2Text'))}</p>`
    : `<h1>${esc(t('login.title'))}</h1><p class="muted">${esc(t('login.subtitle'))}</p>`}
    <form id="loginForm" class="form">
      <label class="field"><span>${esc(t('login.username'))}</span><input name="username" autocomplete="username" required autofocus></label>
      <label class="field"><span>${esc(t('login.password'))}</span><input name="password" type="password" autocomplete="current-password" required></label>
      <div class="form-error" id="loginError" hidden></div>
      <button class="btn btn-primary btn-block" type="submit">${esc(t('login.submit'))}</button>
      ${setup ? `<button class="btn btn-link" type="button" id="changeAbs">${esc(t('setup.change'))}</button>` : ''}
    </form>`);
  const form = root.querySelector('#loginForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = root.querySelector('#loginError');
    err.hidden = true;
    const fd = new FormData(form);
    try {
      await busy(form.querySelector('[type=submit]'), async () => {
        const r = await post('/api/auth/login', { username: fd.get('username'), password: fd.get('password') });
        session.user = r.user;
      });
      onDone();
    } catch (ex) {
      err.textContent = errText(ex);
      err.hidden = false;
    }
  });
  root.querySelector('#changeAbs')?.addEventListener('click', () => renderSetupAbs(root, onDone));
}

function renderSetupAbs(root, onDone) {
  root.innerHTML = shell(`
    <h1>${esc(t('setup.title'))}</h1>
    <div class="steps"><span class="step on">1</span><span class="step">2</span></div>
    <h2>${esc(t('setup.step1'))}</h2>
    <p class="muted">${esc(t('setup.step1Text'))}</p>
    <form id="absForm" class="form">
      <label class="field"><span>${esc(t('setup.url'))}</span><input name="url" type="url" placeholder="http://audiobookshelf:80" required autofocus>
        <small>${esc(t('setup.urlHint'))}</small></label>
      <div class="form-error" id="absError" hidden></div>
      <button class="btn btn-primary btn-block" type="submit">${esc(t('setup.connect'))}</button>
    </form>`);
  const form = root.querySelector('#absForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = root.querySelector('#absError');
    err.hidden = true;
    try {
      await busy(form.querySelector('[type=submit]'), () => post('/api/setup/abs', { url: new FormData(form).get('url') }));
      session.status.absConfigured = true;
      renderLogin(root, onDone);
    } catch (ex) {
      err.textContent = errText(ex);
      err.hidden = false;
    }
  });
}

// ---------- Invite link: create an account ----------
export async function renderInvite(root, token, onDone) {
  root.innerHTML = shell(`<div class="skel" style="height:220px"></div>`);
  let info;
  try {
    info = await api('/api/invite/' + encodeURIComponent(token));
  } catch (ex) {
    root.innerHTML = shell(`
      <h1>${esc(t('invite.signupTitle'))}</h1>
      <div class="form-error">${esc(errText(ex))}</div>
      <a class="btn btn-ghost btn-block" href="#/">${esc(t('invite.toLogin'))}</a>`);
    return;
  }
  root.innerHTML = shell(`
    <h1>${esc(t('invite.signupTitle'))}</h1>
    <p class="muted">${esc(t('invite.signupText'))}</p>
    <form id="inviteForm" class="form">
      <label class="field"><span>${esc(t('login.username'))}</span><input name="username" autocomplete="username" required minlength="3" maxlength="32" autofocus>
        <small>${esc(t('invite.usernameHint'))}</small></label>
      <label class="field"><span>${esc(t('login.password'))}</span><input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128">
        <small>${esc(t('invite.passwordHint'))}</small></label>
      <label class="field"><span>${esc(t('invite.repeat'))}</span><input name="repeat" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label>
      <div class="form-error" id="invError" hidden></div>
      <button class="btn btn-primary btn-block" type="submit">${esc(t('invite.signupBtn'))}</button>
      <p class="muted small-note">${esc(t('invite.validUntil', { date: date(info.expires) }))} · ${esc(t('invite.absNote'))}</p>
    </form>`);
  const form = root.querySelector('#inviteForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = root.querySelector('#invError');
    err.hidden = true;
    if (form.password.value !== form.repeat.value) { err.textContent = t('invite.mismatch'); err.hidden = false; return; }
    try {
      await busy(form.querySelector('[type=submit]'), async () => {
        const r = await post('/api/invite/' + encodeURIComponent(token), { username: form.username.value.trim(), password: form.password.value });
        session.user = r.user;
      });
      history.replaceState(null, '', location.pathname + '#/');
      onDone();
    } catch (ex) {
      err.textContent = errText(ex);
      err.hidden = false;
    }
  });
}

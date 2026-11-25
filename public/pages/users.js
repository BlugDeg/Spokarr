// User management (admins)
import { t } from '../i18n.js';
import { api, avatar, busy, confirmDialog, copyText, date, del, empty, errText, esc, icon, modal, post, put, since, toast, view } from '../lib.js';
import { session } from '../session.js';

const PERMS = ['request', 'autoApprove', 'manageRequests'];
const roleLabel = (u) => (u.owner ? t('users.role.owner') : t('users.role.' + u.role));

export async function pageUsers() {
  const v = view();
  v.innerHTML = `<h1 class="page-title">${esc(t('users.title'))}</h1><div class="user-list">${'<div class="skel" style="height:76px"></div>'.repeat(3)}</div>`;
  const [users, invites] = await Promise.all([api('/api/users'), api('/api/invites').catch(() => [])]);
  if (location.hash !== '#/users') return;
  v.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">${esc(t('users.title'))}</h1>
      <div class="head-actions">
        <button class="btn btn-ghost" id="importBtn">${icon.import}${esc(t('users.import'))}</button>
        <button class="btn btn-primary" id="inviteBtn">${icon.userPlus}${esc(t('invite.create'))}</button>
      </div>
    </div>
    ${users.length ? `<div class="user-list">${users.map((u) => `
      <button class="panel user-row" data-user="${u.id}">
        ${avatar(u.username, 'lg')}
        <div class="user-main">
          <div class="user-name">${esc(u.username)} <span class="badge role-${u.owner ? 'owner' : u.role}">${esc(roleLabel(u))}</span>${u.disabled ? ` <span class="badge b-failed">${esc(t('users.disabled'))}</span>` : ''}</div>
          <div class="user-meta">${esc(t('users.absType', { type: u.absType || '–' }))} · ${esc(t('users.lastLogin'))}: ${esc(u.lastLogin ? since(u.lastLogin) : t('users.never'))}</div>
          <div class="perm-pills">${PERMS.filter((p) => u.permissions[p]).map((p) => `<span class="pill">${esc(t('perm.' + p))}</span>`).join('')}</div>
        </div>
        <div class="user-stats"><b>${u.requestCount}</b><span>${esc(t('nav.requests'))}</span></div>
        <span class="chev">${icon.edit}</span>
      </button>`).join('')}</div>` : empty(icon.book, t('users.empty'))}
    ${inviteList(invites)}`;
  v.querySelector('#inviteBtn').addEventListener('click', createInvite);
  v.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyLink(b.dataset.copy)));
  v.querySelectorAll('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog(t('invite.deleteConfirm')))) return;
    try { await del('/api/invites/' + b.dataset.revoke); pageUsers(); } catch (err) { toast(errText(err), 'err'); }
  }));

  v.querySelector('#importBtn').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try { const r = await post('/api/users/import'); toast(t('users.imported', { n: r.added }), 'ok'); pageUsers(); } catch (err) { toast(errText(err), 'err'); }
  }));
  v.querySelectorAll('[data-user]').forEach((b) => b.addEventListener('click', () => editUser(users.find((u) => u.id === b.dataset.user))));
}

function editUser(u) {
  const self = u.id === session.user.id;
  const m = modal(t('users.edit'), `
    <div class="modal-user">${avatar(u.username, 'lg')}<div><b>${esc(u.username)}</b><div class="muted">${esc(t('users.absType', { type: u.absType || '–' }))}</div></div></div>
    <form class="form" id="userForm">
      <label class="field"><span>${esc(t('users.role'))}</span>
        <select name="role" ${u.owner || self ? 'disabled' : ''}>
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>${esc(t('users.role.user'))}</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>${esc(t('users.role.admin'))}</option>
        </select><small>${esc(t('users.adminHint'))}</small></label>
      <fieldset class="field perms"><span>${esc(t('users.permissions'))}</span>
        ${PERMS.map((p) => `<label class="toggle"><input type="checkbox" name="${p}" ${u.permissions[p] ? 'checked' : ''}><span class="switch"></span><span><b>${esc(t('perm.' + p))}</b><small>${esc(t('perm.' + p + 'Hint'))}</small></span></label>`).join('')}
      </fieldset>
      ${u.owner || self ? '' : `<label class="toggle"><input type="checkbox" name="disabled" ${u.disabled ? 'checked' : ''}><span class="switch"></span><span><b>${esc(t('users.disable'))}</b></span></label>`}
      <div class="modal-actions spread">
        ${u.owner || self ? '<span></span>' : `<button type="button" class="btn btn-danger-ghost" id="delUser">${icon.trash}${esc(t('users.delete'))}</button>`}
        <button type="submit" class="btn btn-primary">${esc(t('users.save'))}</button>
      </div>
    </form>`);
  const form = m.querySelector('#userForm');
  const syncPerms = () => {
    const admin = form.role.value === 'admin';
    PERMS.forEach((p) => { form[p].disabled = admin; if (admin) form[p].checked = true; });
  };
  form.role.addEventListener('change', syncPerms);
  syncPerms();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(form.querySelector('[type=submit]'), async () => {
      try {
        await put('/api/users/' + u.id, {
          role: form.role.disabled ? undefined : form.role.value,
          permissions: Object.fromEntries(PERMS.map((p) => [p, form[p].checked])),
          disabled: form.disabled ? form.disabled.checked : undefined,
        });
        m.remove();
        pageUsers();
      } catch (err) { toast(errText(err), 'err'); }
    });
  });
  m.querySelector('#delUser')?.addEventListener('click', async () => {
    if (!(await confirmDialog(t('users.deleteConfirm', { name: u.username })))) return;
    try { await del('/api/users/' + u.id); m.remove(); pageUsers(); } catch (err) { toast(errText(err), 'err'); }
  });
}

// ---------- Invite links ----------
// The link uses the address from the settings (behind a proxy) or the one this page was opened with
const inviteUrl = (token) => `${(session.config.appUrl || location.origin).replace(/\/+$/, '')}/#/invite/${token}`;
async function copyLink(token) {
  const ok = await copyText(inviteUrl(token));
  toast(ok ? t('invite.copied') : inviteUrl(token), ok ? 'ok' : '');
}
function inviteList(list) {
  if (!list.length) return '';
  return `<h2 class="subhead">${esc(t('invite.title'))}</h2>
    <div class="invite-list">${list.map((i) => `
      <div class="panel invite-row${i.open ? '' : ' closed'}">
        <div class="invite-main">
          <b>${esc(i.note || t('invite.noNote'))}</b>
          <small>${esc(i.open ? t('invite.validUntil', { date: date(i.expires) }) : t('invite.closed'))} · ${esc(i.maxUses ? t('invite.usesOf', { n: i.uses, max: i.maxUses }) : t('invite.usesUnlimited', { n: i.uses }))}${i.users.length ? ' · ' + esc(i.users.join(', ')) : ''}</small>
        </div>
        ${i.open ? `<button class="btn btn-ghost btn-sm" data-copy="${esc(i.token)}">${icon.copy}${esc(t('invite.copy'))}</button>` : ''}
        <button class="icon-btn" data-revoke="${esc(i.id)}" title="${esc(t('invite.delete'))}" aria-label="${esc(t('invite.delete'))}">${icon.trash}</button>
      </div>`).join('')}</div>`;
}
function createInvite() {
  const m = modal(t('invite.create'), `
    <p class="muted">${esc(t('invite.intro'))}</p>
    <form class="form" id="invForm">
      <label class="field"><span>${esc(t('invite.note'))}</span><input name="note" maxlength="80" placeholder="${esc(t('invite.notePlaceholder'))}"><small>${esc(t('invite.noteHint'))}</small></label>
      <div class="grid-2">
        <label class="field"><span>${esc(t('invite.validFor'))}</span><select name="days">
          <option value="1">${esc(t('invite.days', { n: 1 }))}</option><option value="7" selected>${esc(t('invite.days', { n: 7 }))}</option><option value="30">${esc(t('invite.days', { n: 30 }))}</option></select></label>
        <label class="field"><span>${esc(t('invite.uses'))}</span><select name="maxUses">
          <option value="1" selected>${esc(t('invite.once'))}</option><option value="5">5×</option><option value="10">10×</option><option value="0">${esc(t('invite.unlimited'))}</option></select></label>
      </div>
      <div class="modal-actions"><button type="submit" class="btn btn-primary">${icon.link}${esc(t('invite.createBtn'))}</button></div>
    </form>`);
  const form = m.querySelector('#invForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(form.querySelector('[type=submit]'), async () => {
      try {
        const inv = await post('/api/invites', { note: form.note.value, days: Number(form.days.value), maxUses: Number(form.maxUses.value) });
        const url = inviteUrl(inv.token);
        form.outerHTML = `<div class="form">
          <label class="field"><span>${esc(t('invite.link'))}</span><input class="invite-link" readonly value="${esc(url)}"><small>${esc(t('invite.linkHint'))}</small></label>
          <div class="modal-actions"><button type="button" class="btn btn-primary" id="copyNew">${icon.copy}${esc(t('invite.copy'))}</button></div></div>`;
        m.querySelector('.invite-link').addEventListener('focus', (ev) => ev.target.select());
        m.querySelector('#copyNew').addEventListener('click', () => copyLink(inv.token));
        pageUsers();
      } catch (err) { toast(errText(err), 'err'); }
    });
  });
}

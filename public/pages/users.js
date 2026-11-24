// User management (admins)
import { t } from '../i18n.js';
import { api, avatar, busy, confirmDialog, del, empty, errText, esc, icon, modal, post, put, since, toast, view } from '../lib.js';
import { session } from '../session.js';

const PERMS = ['request', 'autoApprove', 'manageRequests'];
const roleLabel = (u) => (u.owner ? t('users.role.owner') : t('users.role.' + u.role));

export async function pageUsers() {
  const v = view();
  v.innerHTML = `<h1 class="page-title">${esc(t('users.title'))}</h1><div class="user-list">${'<div class="skel" style="height:76px"></div>'.repeat(3)}</div>`;
  const users = await api('/api/users');
  if (location.hash !== '#/users') return;
  v.innerHTML = `
    <div class="page-head">
      <h1 class="page-title">${esc(t('users.title'))}</h1>
      <button class="btn btn-ghost" id="importBtn">${icon.import}${esc(t('users.import'))}</button>
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
      </button>`).join('')}</div>` : empty(icon.book, t('users.empty'))}`;

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

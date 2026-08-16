import { post } from '/js/api.js';
import { el, icon, toast } from '/js/ui.js';
import { currentUser } from '../app.js';

export default async function accountView() {
  const username = el('input', { type: 'text', autocomplete: 'username', value: currentUser?.username || '' });
  const current = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Current password (required)' });
  const next = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'New password (min 6 chars, optional)' });
  const next2 = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Repeat new password' });

  const save = el('button', { class: 'btn', onclick: async () => {
    save.disabled = true;
    try {
      const body = { current: current.value };
      const nextUser = username.value.trim().toLowerCase();
      if (nextUser && nextUser !== currentUser.username) body.username = nextUser;
      if (next.value) {
        if (next.value.length < 6) throw new Error('New password must be at least 6 characters');
        if (next.value !== next2.value) throw new Error('New passwords do not match');
        body.next = next.value;
      }
      if (!body.username && !body.next) throw new Error('Enter a new username or password');
      const result = await post('/auth/account', body);
      toast('Login updated ✓');
      current.value = next.value = next2.value = '';
      if (result?.user?.username && result.user.username !== currentUser.username) {
        location.reload();
      }
    } catch (e) { toast(e.message, 'err'); }
    finally { save.disabled = false; }
  } }, 'Save login');

  const isDefault = ['admin', 'demo'].includes(String(currentUser?.username || '').toLowerCase());

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Login & security'), el('p', {}, 'Change the admin username and password so demo logins are not left on the live site'))),

    isDefault ? el('div', { class: 'card', style: { marginBottom: '16px', borderColor: 'var(--red, #f87171)' } },
      el('b', {}, 'Default login is still active'),
      el('p', { class: 'muted', style: { margin: '8px 0 0' } },
        `This account is still @${currentUser.username}. Anyone who knows the seeded demo password can sign in. Change both the username and password now.`)) : null,

    el('div', { class: 'card', style: { maxWidth: '480px' } },
      el('h3', {}, icon('key'), ' Your login'),
      el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '14px' } },
        'Current account: @' + (currentUser?.username || '') + (currentUser?.role ? ' · ' + currentUser.role : '')),
      el('div', { class: 'field' }, el('label', {}, 'Username'), username),
      el('div', { class: 'field' }, el('label', {}, 'Current password'), current),
      el('div', { class: 'field' }, el('label', {}, 'New password'), next),
      el('div', { class: 'field' }, el('label', {}, 'Confirm new password'), next2),
      save,
      el('p', { class: 'muted', style: { marginTop: '12px', fontSize: '13px' } },
        'To change the demo user, open Users → Change login. To delete it, use Users → Delete.')),
  );
}

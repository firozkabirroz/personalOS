import { get, post, del } from '/js/api.js';
import { el, icons, formModal, confirmModal, toast, fmtDate } from '/js/ui.js';

const ROLE_BADGE = { owner: 'purple', manager: 'accent', support: 'cyan' };
const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', support: 'Support' };
const ROLE_DESC = {
  owner: 'Full access to everything, can manage the team',
  manager: 'Can see/do everything for customers, payments, pricing and support — cannot change the team',
  support: 'Can only view and reply to support tickets',
};

export default async function teamView() {
  let team = await get('/admin/team');
  const listEl = el('div', { class: 'stack' });

  const refresh = async () => { team = await get('/admin/team'); render(); };

  const addMember = () => formModal({
    title: 'Add a team member',
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Their name' },
      { key: 'username', label: 'Username', placeholder: 'For logging in' },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'At least 6 characters' },
      { key: 'role', label: 'Role', type: 'select', options: [{ value: 'support', label: 'Support — tickets only' }, { value: 'manager', label: 'Manager — full admin' }], default: 'support' },
    ],
    submitLabel: 'Add',
    onSubmit: async (v) => {
      if (!v.username.trim()) throw new Error('Enter a username');
      if (!v.password || v.password.length < 6) throw new Error('Password must be at least 6 characters');
      await post('/admin/team', v);
      await refresh();
      toast('Team member added ✓');
    },
  });

  function row(u) {
    const isOwner = u.role === 'owner';
    const actions = el('div', { class: 'row-actions', style: { opacity: 1, gap: '6px' } });
    if (!isOwner) {
      const otherRole = u.role === 'support' ? 'manager' : 'support';
      actions.append(
        el('button', { class: 'btn ghost sm', onclick: async () => {
          await post(`/admin/team/${u.id}/role`, { role: otherRole });
          toast(`Role changed to ${ROLE_LABEL[otherRole]}`);
          refresh();
        } }, `→ ${ROLE_LABEL[otherRole]}`),
        (() => { const b = el('button', { class: 'icon-btn', title: 'Remove', onclick: () => confirmModal(`Remove "${u.username}" from the team?`, async () => { await del(`/admin/team/${u.id}`); toast('Removed'); refresh(); }) }); b.innerHTML = icons.trash; return b; })());
    }
    return el('div', { class: 'list-row' },
      el('div', { class: 'grow' },
        el('div', { class: 'title' }, u.name || u.username, u.name && u.name !== u.username ? el('span', { class: 'muted' }, ' · @' + u.username) : null),
        el('div', { class: 'sub' }, ROLE_DESC[u.role] + (u.created_at ? ' · joined ' + fmtDate(u.created_at.slice(0, 10)) : ''))),
      el('span', { class: `badge ${ROLE_BADGE[u.role]}` }, ROLE_LABEL[u.role]),
      actions);
  }

  function render() {
    listEl.innerHTML = '';
    team.forEach(u => listEl.append(row(u)));
  }
  render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Team'), el('p', {}, 'Admin staff — access varies by role')),
      el('div', { class: 'page-actions' }, el('button', { class: 'btn', onclick: addMember }, 'Add member'))),
    listEl,
    el('div', { class: 'card', style: { marginTop: '16px' } },
      el('h3', {}, 'Role differences'),
      el('div', { class: 'stack', style: { gap: '10px' } },
        Object.entries(ROLE_DESC).map(([r, d]) =>
          el('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } },
            el('span', { class: `badge ${ROLE_BADGE[r]}`, style: { flexShrink: 0 } }, ROLE_LABEL[r]),
            el('span', { class: 'muted', style: { fontSize: '13px' } }, d))))));
}

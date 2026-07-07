import { get, post, del } from '../api.js';
import { el, icon, icons, formModal, confirmModal, toast, fmtDate } from '../ui.js';

const ROLE_BADGE = { owner: 'purple', manager: 'accent', support: 'cyan' };
const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', support: 'Support' };
const ROLE_DESC = {
  owner: 'সব কিছুর সম্পূর্ণ অ্যাক্সেস, টিম ম্যানেজ করতে পারে',
  manager: 'কাস্টমার, পেমেন্ট, প্রাইসিং, সাপোর্ট — সব দেখতে/করতে পারে, টিম বদলাতে পারে না',
  support: 'শুধু সাপোর্ট টিকিট দেখতে ও উত্তর দিতে পারে',
};

export default async function teamView() {
  let team = await get('/admin/team');
  const listEl = el('div', { class: 'stack' });

  const refresh = async () => { team = await get('/admin/team'); render(); };

  const addMember = () => formModal({
    title: 'নতুন টিম মেম্বার যোগ করুন',
    fields: [
      { key: 'name', label: 'নাম', placeholder: 'তার নাম' },
      { key: 'username', label: 'ইউজারনেম', placeholder: 'লগইনের জন্য' },
      { key: 'password', label: 'পাসওয়ার্ড', type: 'password', placeholder: 'কমপক্ষে ৬ ক্যারেক্টার' },
      { key: 'role', label: 'রোল', type: 'select', options: [{ value: 'support', label: 'Support — শুধু টিকিট' }, { value: 'manager', label: 'Manager — ফুল অ্যাডমিন' }], default: 'support' },
    ],
    submitLabel: 'যোগ করুন',
    onSubmit: async (v) => {
      if (!v.username.trim()) throw new Error('ইউজারনেম দিন');
      if (!v.password || v.password.length < 6) throw new Error('পাসওয়ার্ড কমপক্ষে ৬ ক্যারেক্টার হতে হবে');
      await post('/admin/team', v);
      await refresh();
      toast('টিম মেম্বার যোগ হয়েছে ✓');
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
          toast(`রোল বদলে ${ROLE_LABEL[otherRole]} করা হয়েছে`);
          refresh();
        } }, `→ ${ROLE_LABEL[otherRole]}`),
        (() => { const b = el('button', { class: 'icon-btn', title: 'সরান', onclick: () => confirmModal(`"${u.username}"-কে টিম থেকে সরাবেন?`, async () => { await del(`/admin/team/${u.id}`); toast('সরানো হয়েছে'); refresh(); }) }); b.innerHTML = icons.trash; return b; })());
    }
    return el('div', { class: 'list-row' },
      el('div', { class: 'grow' },
        el('div', { class: 'title' }, u.name || u.username, u.name && u.name !== u.username ? el('span', { class: 'muted' }, ' · @' + u.username) : null),
        el('div', { class: 'sub' }, ROLE_DESC[u.role] + (u.created_at ? ' · যোগদান ' + fmtDate(u.created_at.slice(0, 10)) : ''))),
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
      el('div', {}, el('h2', {}, '👥 টিম'), el('p', {}, 'অ্যাডমিন টিম মেম্বার — রোল অনুযায়ী আলাদা অ্যাক্সেস')),
      el('div', { class: 'page-actions' }, el('button', { class: 'btn', onclick: addMember }, icon('plus'), 'মেম্বার যোগ করুন'))),
    listEl,
    el('div', { class: 'card', style: { marginTop: '16px' } },
      el('h3', {}, 'রোলের পার্থক্য'),
      el('div', { class: 'stack', style: { gap: '10px' } },
        Object.entries(ROLE_DESC).map(([r, d]) =>
          el('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } },
            el('span', { class: `badge ${ROLE_BADGE[r]}`, style: { flexShrink: 0 } }, ROLE_LABEL[r]),
            el('span', { class: 'muted', style: { fontSize: '13px' } }, d))))));
}

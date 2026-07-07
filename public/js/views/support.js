import { get, post } from '../api.js';
import { el, icon, icons, modal, formModal, toast, fmtDate } from '../ui.js';
import { currentUser } from '../app.js';

const STATUS_BADGE = { open: 'red', pending: 'amber', closed: 'green' };
const STATUS_LABEL = { open: 'Open', pending: 'Pending', closed: 'Closed' };

export default async function supportView() {
  const isStaff = ['owner', 'manager', 'support'].includes(currentUser.role);
  let filter = '';
  let tickets = await get('/support/tickets' + (filter ? `?status=${filter}` : ''));

  const listEl = el('div', { class: 'stack' });

  const refresh = async () => {
    tickets = await get('/support/tickets' + (filter ? `?status=${filter}` : ''));
    render();
  };

  function newTicket() {
    formModal({
      title: 'নতুন সাপোর্ট টিকিট',
      fields: [
        { key: 'subject', label: 'বিষয়', placeholder: 'সংক্ষেপে সমস্যা লিখুন' },
        { key: 'message', label: 'বিস্তারিত', type: 'textarea', rows: 5, placeholder: 'বিস্তারিত লিখুন…' },
      ],
      submitLabel: 'পাঠান',
      onSubmit: async (v) => {
        if (!v.subject.trim()) throw new Error('বিষয় লিখুন');
        if (!v.message.trim()) throw new Error('বার্তা লিখুন');
        await post('/support/tickets', v);
        await refresh();
        toast('টিকিট জমা হয়েছে ✓');
      },
    });
  }

  function timeAgo(iso) {
    if (!iso) return '';
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'এইমাত্র';
    if (mins < 60) return `${mins} মিনিট আগে`;
    if (mins < 1440) return `${Math.round(mins / 60)} ঘণ্টা আগে`;
    return fmtDate(iso.slice(0, 10));
  }

  async function openTicket(t) {
    const data = await get(`/support/tickets/${t.id}`);
    const msgWrap = el('div', { class: 'stack', style: { maxHeight: '360px', overflowY: 'auto', paddingRight: '4px' } });

    function bubble(m) {
      const isMine = m.sender_id === currentUser.id;
      const staffMsg = ['owner', 'manager', 'support'].includes(m.role);
      return el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: '3px' } },
        el('div', { class: 'muted', style: { fontSize: '11.5px' } },
          `${m.name || m.username}${staffMsg ? ' (support)' : ''} · ${timeAgo(m.created_at)}`),
        el('div', {
          style: {
            background: isMine ? 'var(--accent)' : 'var(--panel-2)',
            color: isMine ? '#fff' : 'var(--text)',
            padding: '9px 13px', borderRadius: '12px', maxWidth: '85%', fontSize: '13.5px', whiteSpace: 'pre-wrap',
          },
        }, m.message));
    }
    data.messages.forEach(m => msgWrap.append(bubble(m)));

    const replyInput = el('textarea', { rows: 3, placeholder: 'উত্তর লিখুন…', style: { width: '100%', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text)', fontFamily: 'inherit', fontSize: '13.5px', resize: 'vertical' } });

    const statusRow = isStaff ? el('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
      el('span', { class: 'muted', style: { alignSelf: 'center', marginRight: 'auto' } }, `গ্রাহক: ${data.customer.name || data.customer.username}`),
      data.ticket.status !== 'closed'
        ? el('button', { class: 'btn ghost sm', onclick: async () => { await post(`/support/tickets/${t.id}/status`, { status: 'closed' }); close(); await refresh(); toast('টিকিট বন্ধ করা হয়েছে'); } }, 'বন্ধ করুন')
        : el('button', { class: 'btn ghost sm', onclick: async () => { await post(`/support/tickets/${t.id}/status`, { status: 'open' }); close(); await refresh(); toast('আবার খোলা হয়েছে'); } }, 'আবার খুলুন')) : null;

    const close = modal({
      title: `#${t.id} — ${data.ticket.subject}`,
      wide: true,
      body: [
        el('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px' } },
          el('span', { class: `badge ${STATUS_BADGE[data.ticket.status]}` }, STATUS_LABEL[data.ticket.status])),
        msgWrap,
        data.ticket.status !== 'closed' || isStaff ? el('div', { style: { marginTop: '12px' } },
          el('div', { class: 'field' }, replyInput)) : el('p', { class: 'muted', style: { marginTop: '12px' } }, 'এই টিকিট বন্ধ আছে।'),
        statusRow,
      ],
      footer: (data.ticket.status !== 'closed' || isStaff) ? [
        el('button', { class: 'btn ghost', onclick: () => close() }, 'বন্ধ করুন'),
        el('button', { class: 'btn', onclick: async () => {
          if (!replyInput.value.trim()) return toast('কিছু লিখুন', 'err');
          try {
            await post(`/support/tickets/${t.id}/reply`, { message: replyInput.value.trim() });
            close(); await refresh(); toast('পাঠানো হয়েছে ✓');
          } catch (e) { toast(e.message, 'err'); }
        } }, 'উত্তর পাঠান'),
      ] : [el('button', { class: 'btn ghost', onclick: () => close() }, 'বন্ধ করুন')],
    });
  }

  function row(t) {
    return el('div', { class: 'list-row', style: { cursor: 'pointer' }, onclick: () => openTicket(t) },
      el('div', { class: 'grow' },
        el('div', { class: 'title' }, `#${t.id} ${t.subject}`),
        el('div', { class: 'sub' },
          (isStaff ? `${t.name || t.username} · ` : '') + `${t.message_count} বার্তা · ${timeAgo(t.updated_at)}`)),
      el('span', { class: `badge ${STATUS_BADGE[t.status]}` }, STATUS_LABEL[t.status]));
  }

  function render() {
    listEl.innerHTML = '';
    if (!tickets.length) {
      listEl.append(el('div', { class: 'empty' }, el('div', { class: 'big' }, '🎫'),
        isStaff ? 'কোনো টিকিট নেই — সব পরিষ্কার!' : 'আপনার কোনো সাপোর্ট টিকিট নেই।'));
      return;
    }
    tickets.forEach(t => listEl.append(row(t)));
  }
  render();

  const tabs = isStaff ? el('div', { class: 'tabs' },
    ['', 'open', 'pending', 'closed'].map(s =>
      el('button', { class: `tab${s === filter ? ' active' : ''}`, onclick: (e) => {
        filter = s;
        tabs.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        e.target.classList.add('active');
        refresh();
      } }, s ? STATUS_LABEL[s] : 'সব')) ) : null;

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {},
        el('h2', {}, isStaff ? '🎫 সাপোর্ট ইনবক্স' : '🎫 সাপোর্ট'),
        el('p', {}, isStaff ? 'গ্রাহকদের সমস্যার সমাধান দিন' : 'কোনো সমস্যা হলে টিকিট খুলুন, আমরা উত্তর দেব')),
      el('div', { class: 'page-actions' }, tabs,
        !isStaff ? el('button', { class: 'btn', onclick: newTicket }, icon('plus'), 'নতুন টিকিট') : null)),
    listEl);
}

import { get, post } from '/js/api.js';
import { el, toast } from '/js/ui.js';

export default async function configView() {
  const cfg = await get('/admin/config');
  const f = {};
  const field = (key, label, type = 'text') => {
    const input = type === 'textarea' ? el('textarea', { rows: 4 }) : el('input', { type });
    input.value = cfg[key] || '';
    f[key] = input;
    return el('div', { class: 'field' }, el('label', {}, label), input);
  };
  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, '⚙️ Settings'), el('p', {}, 'Trial length, currency and payment instructions'))),
    el('div', { class: 'card', style: { maxWidth: '620px' } },
      el('div', { class: 'field-row' }, field('saas_currency', 'Currency symbol'), field('saas_trial_days', 'Free trial (days)', 'number')),
      field('saas_payment_info', 'Payment instructions (shown to customers)', 'textarea'),
      el('button', { class: 'btn', style: { marginTop: '8px' }, onclick: async () => {
        const body = {};
        for (const [k, input] of Object.entries(f)) body[k] = input.value;
        await post('/admin/config', body);
        toast('Settings saved ✓');
      } }, 'Save settings')));
}

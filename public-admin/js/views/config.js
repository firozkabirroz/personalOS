import { get, post } from '/js/api.js';
import { el, toast } from '/js/ui.js';

export default async function configView() {
  const cfg = await get('/admin/config');

  const currency = el('input', {}); currency.value = cfg.saas_currency || '৳';
  const signupCredits = el('input', { type: 'number' }); signupCredits.value = cfg.saas_signup_credits || '10';
  const paymentInfo = el('textarea', { rows: 5 }); paymentInfo.value = cfg.saas_payment_info || '';

  const save = el('button', { class: 'btn', onclick: async () => {
    await post('/admin/config', {
      saas_currency: currency.value,
      saas_signup_credits: signupCredits.value,
      saas_payment_info: paymentInfo.value,
      saas_trial_days: '0',
    });
    toast('Settings saved ✓');
  } }, 'Save settings');

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Settings'), el('p', {}, 'Platform is free forever — configure credits & payment text'))),
    el('div', { class: 'card' },
      el('div', { class: 'field-row' },
        el('div', { class: 'field' }, el('label', {}, 'Currency symbol'), currency),
        el('div', { class: 'field' }, el('label', {}, 'Signup bonus credits'), signupCredits)),
      el('div', { class: 'field' }, el('label', {}, 'Payment instructions (shown when buying credits)'), paymentInfo),
      save));
}

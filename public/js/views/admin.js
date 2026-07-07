import { get, post, put, del } from '../api.js';
import { el, icon, icons, modal, formModal, confirmModal, toast, fmtDate, fmtMoney } from '../ui.js';
import { navigate } from '../app.js';

const PROVIDER_LABEL = { anthropic: 'Anthropic', openai: 'OpenAI', custom: 'Custom (OpenAI-compatible)' };

export default async function adminView() {
  let tab = 'overview';
  const body = el('div', {});

  const TABS = ['overview', 'payments', 'users', 'plans', 'ai', 'settings'];
  const TAB_LABEL = { overview: 'Overview', payments: 'Payments', users: 'Users', plans: 'Plans', ai: 'AI Models', settings: 'Settings' };
  const tabs = el('div', { class: 'tabs' },
    TABS.map(t =>
      el('button', { class: `tab${t === tab ? ' active' : ''}`, onclick: (e) => {
        tab = t;
        tabs.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        e.target.classList.add('active');
        render();
      } }, TAB_LABEL[t])));

  async function render() {
    body.innerHTML = '';
    body.append(el('div', { class: 'muted', style: { padding: '20px' } }, 'Loading…'));
    try {
      if (tab === 'overview') body.replaceChildren(await overview());
      else if (tab === 'payments') body.replaceChildren(await payments());
      else if (tab === 'users') body.replaceChildren(await users());
      else if (tab === 'plans') body.replaceChildren(await plansTab());
      else if (tab === 'ai') body.replaceChildren(await aiTab());
      else body.replaceChildren(await config());
    } catch (e) {
      body.replaceChildren(el('div', { class: 'empty' }, el('div', { class: 'big' }, '⚠️'), e.message));
    }
  }

  // ---- Overview ----
  async function overview() {
    const o = await get('/admin/overview');
    const cfg = await get('/admin/config');
    const cur = cfg.saas_currency || '৳';
    const stat = (label, value, hint, color) =>
      el('div', { class: 'card stat-card' },
        el('div', { class: 'label' }, label),
        el('div', { class: 'value', style: color ? { color } : {} }, String(value)),
        el('div', { class: 'hint' }, hint));
    return el('div', {},
      el('div', { class: 'grid cols-4', style: { marginBottom: '16px' } },
        stat('👥 Total customers', o.users, `${o.active} active`, null),
        stat('✅ Active subscriptions', o.active, `${o.expired} expired`, '#34d399'),
        stat('⏳ Pending payments', o.pendingPayments, o.pendingPayments ? 'needs your review' : 'all clear', o.pendingPayments ? '#fbbf24' : null),
        stat('⚠️ Expiring in 7 days', o.expiringSoon, 'remind them to renew', o.expiringSoon ? '#fbbf24' : null),
        stat('🎫 Open tickets', o.openTickets, o.openTickets ? 'customers waiting' : 'inbox zero', o.openTickets ? '#f87171' : '#34d399')),
      el('div', { class: 'grid cols-2' },
        stat('💰 Revenue this month', fmtMoney(o.revenueMonth, cur), 'approved payments', '#34d399'),
        stat('🏦 Total revenue', fmtMoney(o.revenueTotal, cur), 'all time', '#34d399')),
      o.pendingPayments ? el('div', { class: 'card', style: { marginTop: '16px', borderColor: 'var(--amber)' } },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
          el('span', { style: { fontSize: '22px' } }, '⏳'),
          el('div', { class: 'grow' }, el('b', {}, `${o.pendingPayments} payment(s) waiting for approval`)),
          el('button', { class: 'btn sm', onclick: () => { tab = 'payments'; tabs.querySelectorAll('.tab')[1].click(); } }, 'Review now'))) : null,
      o.openTickets ? el('div', { class: 'card', style: { marginTop: '12px', borderColor: 'var(--red)' } },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
          el('span', { style: { fontSize: '22px' } }, '🎫'),
          el('div', { class: 'grow' }, el('b', {}, `${o.openTickets} open support ticket(s)`)),
          el('button', { class: 'btn sm', onclick: () => { navigate('support'); } }, 'Open inbox'))) : null);
  }

  // ---- Payments ----
  async function payments() {
    const pays = await get('/admin/payments');
    const cfg = await get('/admin/config');
    const cur = cfg.saas_currency || '৳';
    if (!pays.length) return el('div', { class: 'empty' }, el('div', { class: 'big' }, '💳'), 'No payments yet.');
    return el('div', { class: 'card', style: { padding: '8px 4px' } },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Date'), el('th', {}, 'User'), el('th', {}, 'Plan'), el('th', {}, 'Cycle'), el('th', {}, 'Amount'), el('th', {}, 'Method / TrxID'), el('th', {}, 'Status'), el('th', {}, ''))),
        el('tbody', {}, pays.map(p => {
          const actions = el('div', { class: 'row-actions', style: { opacity: 1 } });
          if (p.status === 'pending') {
            actions.append(
              el('button', { class: 'btn success sm', onclick: async () => {
                try { const r = await post(`/admin/payments/${p.id}/approve`); toast(`Approved — valid until ${fmtDate(r.plan_expires)} ✓`); render(); }
                catch (e) { toast(e.message, 'err'); }
              } }, '✓ Approve'),
              el('button', { class: 'btn danger sm', onclick: () => {
                const reason = el('input', { placeholder: 'Reason (optional)' });
                const close = modal({ title: 'Reject payment', body: [el('p', { class: 'muted' }, `User: ${p.username}, TrxID: ${p.trx_id}`), el('div', { class: 'field' }, el('label', {}, 'Reason'), reason)],
                  footer: [el('button', { class: 'btn ghost', onclick: () => close() }, 'Cancel'),
                    el('button', { class: 'btn danger', onclick: async () => { await post(`/admin/payments/${p.id}/reject`, { note: reason.value }); close(); toast('Payment rejected'); render(); } }, 'Reject')] });
              } }, '✕ Reject'));
          }
          return el('tr', {},
            el('td', { class: 'muted' }, fmtDate(p.created_at?.slice(0, 10))),
            el('td', {}, el('b', {}, p.username), p.name && p.name !== p.username ? el('div', { class: 'muted' }, p.name) : null),
            el('td', {}, el('span', { class: 'badge accent' }, p.tier_key || '—')),
            el('td', {}, p.plan),
            el('td', {}, fmtMoney(p.amount, cur)),
            el('td', {}, el('div', {}, p.method), el('div', { class: 'muted', style: { fontFamily: 'monospace' } }, p.trx_id)),
            el('td', {}, el('span', { class: `badge ${p.status === 'approved' ? 'green' : p.status === 'pending' ? 'amber' : 'red'}` }, p.status)),
            el('td', {}, actions));
        }))));
  }

  // ---- Users ----
  async function users() {
    const list = await get('/admin/users');
    return el('div', { class: 'card', style: { padding: '8px 4px' } },
      el('table', { class: 'data' },
        el('thead', {}, el('tr', {}, el('th', {}, 'User'), el('th', {}, 'Tier'), el('th', {}, 'Cycle'), el('th', {}, 'Expires'), el('th', {}, 'Status'), el('th', {}, 'Actions'))),
        el('tbody', {}, list.map(u => {
          const actions = el('div', { class: 'row-actions', style: { opacity: 1, gap: '4px' } });
          actions.append(
            el('button', { class: 'btn ghost sm', title: 'Extend 1 month', onclick: async () => { const r = await post(`/admin/users/${u.id}/plan`, { action: 'extend', months: 1 }); toast(`Extended to ${fmtDate(r.plan_expires)}`); render(); } }, '+1mo'),
            el('button', { class: 'btn ghost sm', title: 'Extend 1 year', onclick: async () => { const r = await post(`/admin/users/${u.id}/plan`, { action: 'extend', months: 12 }); toast(`Extended to ${fmtDate(r.plan_expires)}`); render(); } }, '+1yr'),
            el('button', { class: 'btn ghost sm', title: 'Lock now', onclick: () => confirmModal(`Lock "${u.username}" immediately?`, async () => { await post(`/admin/users/${u.id}/plan`, { action: 'lock' }); toast('User locked'); render(); }) }, '🔒'),
            (() => { const b = el('button', { class: 'icon-btn', title: 'Delete user', onclick: () => confirmModal(`Delete "${u.username}" and ALL their data permanently?`, async () => { await del(`/admin/users/${u.id}`); toast('User deleted'); render(); }) }); b.innerHTML = icons.trash; return b; })());
          return el('tr', {},
            el('td', {}, el('b', {}, u.username), u.name && u.name !== u.username ? el('div', { class: 'muted' }, u.name) : null),
            el('td', {}, el('span', { class: 'badge accent' }, u.tier_key || 'free')),
            el('td', {}, u.plan),
            el('td', {}, u.plan === 'lifetime' ? '∞' : fmtDate(u.plan_expires)),
            el('td', {}, el('span', { class: `badge ${u.expired ? 'red' : 'green'}` }, u.expired ? 'expired' : 'active')),
            el('td', {}, actions));
        }))));
  }

  // ---- Plans (subscription tiers) ----
  async function plansTab() {
    const [plansList, models] = await Promise.all([get('/admin/plans'), get('/admin/ai-models')]);
    const cfg = await get('/admin/config');
    const cur = cfg.saas_currency || '৳';
    const activeModels = models.filter(m => m.active);

    const planFields = (values = {}) => [
      ...(values.id ? [] : [{ key: 'key', label: 'Key (fixed identifier, e.g. "pro")', placeholder: 'lowercase, no spaces' }]),
      { key: 'name', label: 'Display name', placeholder: 'e.g. Pro' },
      { key: 'monthly_price', label: `Monthly price (${cur})`, type: 'number', half: true, default: 0 },
      { key: 'yearly_price', label: `Yearly price (${cur})`, type: 'number', half: true, default: 0 },
      { key: 'ai_model_id', label: 'AI model included', type: 'select', options: [{ value: '', label: '— none —' }, ...activeModels.map(m => ({ value: m.id, label: `${m.name} (${PROVIDER_LABEL[m.provider]})` }))], half: true },
      { key: 'ai_message_limit', label: 'AI messages / month', type: 'number', half: true, default: 0 },
      { key: 'is_free', label: 'This is the free tier', type: 'select', options: [{ value: '0', label: 'No' }, { value: '1', label: 'Yes' }], default: '0' },
    ];

    const addPlan = () => formModal({
      title: 'New plan tier', fields: planFields(), submitLabel: 'Create',
      onSubmit: async (v) => {
        if (!v.key.trim() || !v.name.trim()) throw new Error('Key and name are required');
        await post('/admin/plans', { ...v, is_free: v.is_free === '1' });
        toast('Plan created ✓'); render();
      },
    });

    const editPlan = (p) => formModal({
      title: `Edit "${p.name}"`, fields: planFields(p), values: { ...p, is_free: String(p.is_free), ai_model_id: p.ai_model_id || '' },
      onSubmit: async (v) => {
        await put(`/admin/plans/${p.id}`, { ...v, is_free: v.is_free === '1' });
        toast('Plan updated ✓'); render();
      },
    });

    const rows = plansList.map(p => {
      const editBtn = el('button', { class: 'icon-btn', onclick: () => editPlan(p) }); editBtn.innerHTML = icons.edit;
      const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete plan "${p.name}"?`, async () => {
        try { await del(`/admin/plans/${p.id}`); toast('Deleted'); render(); } catch (e) { toast(e.message, 'err'); }
      }) }); delBtn.innerHTML = icons.trash;
      const toggleBtn = el('button', { class: 'btn ghost sm', onclick: async () => { await put(`/admin/plans/${p.id}`, { active: p.active ? 0 : 1 }); render(); } }, p.active ? 'Deactivate' : 'Activate');
      return el('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '8px', opacity: p.active ? 1 : 0.55 } },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
          el('div', {}, el('b', { style: { fontSize: '15px' } }, p.name), p.is_free ? el('span', { class: 'badge green', style: { marginLeft: '8px' } }, 'free tier') : null,
            el('div', { class: 'muted' }, `key: ${p.key}`)),
          el('div', { style: { display: 'flex', gap: '4px' } }, toggleBtn, editBtn, delBtn)),
        el('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px' } },
          el('span', {}, 'Monthly: ', el('b', {}, fmtMoney(p.monthly_price, cur))),
          el('span', {}, 'Yearly: ', el('b', {}, fmtMoney(p.yearly_price, cur))),
          el('span', {}, 'AI model: ', el('b', {}, p.model_name || 'none')),
          el('span', {}, 'Messages/mo: ', el('b', {}, p.ai_message_limit))));
    });

    return el('div', {},
      el('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' } },
        el('button', { class: 'btn', onclick: addPlan }, icon('plus'), 'New plan')),
      el('div', { class: 'grid cols-2' }, rows.length ? rows : el('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, 'No plans yet.')));
  }

  // ---- AI Models + platform keys ----
  async function aiTab() {
    const [models, keys] = await Promise.all([get('/admin/ai-models'), get('/admin/ai-keys')]);

    const keyField = (key, label, placeholder) => {
      const input = el('input', { type: key.endsWith('_base_url') ? 'text' : 'password', placeholder: keys[key + '_set'] ? `Saved: ${keys[key]}` : placeholder });
      if (key.endsWith('_base_url')) input.value = keys[key] || '';
      return { key, input, el: el('div', { class: 'field' }, el('label', {}, label), input) };
    };
    const kAnthropic = keyField('admin_anthropic_key', 'Anthropic API key', 'sk-ant-...');
    const kOpenai = keyField('admin_openai_key', 'OpenAI API key', 'sk-...');
    const kCustom = keyField('admin_custom_key', 'Custom provider API key', 'optional');
    const kCustomUrl = keyField('admin_custom_base_url', 'Custom base URL', 'https://your-endpoint.example.com');

    const saveKeys = el('button', { class: 'btn', onclick: async () => {
      const body = {};
      for (const f of [kAnthropic, kOpenai, kCustom, kCustomUrl]) if (f.input.value.trim()) body[f.key] = f.input.value.trim();
      await post('/admin/ai-keys', body);
      toast('Platform AI keys saved ✓'); render();
    } }, 'Save platform keys');

    const modelFields = (values = {}) => [
      { key: 'name', label: 'Display name', placeholder: 'e.g. GPT-4o mini' },
      { key: 'provider', label: 'Provider', type: 'select', options: [{ value: 'anthropic', label: 'Anthropic' }, { value: 'openai', label: 'OpenAI' }, { value: 'custom', label: 'Custom (OpenAI-compatible)' }], default: 'openai' },
      { key: 'model_id', label: 'Model ID (exact API string)', placeholder: 'e.g. gpt-4o-mini' },
      { key: 'input_cost', label: 'Input $/1M tokens', type: 'number', step: '0.01', half: true, default: 0 },
      { key: 'output_cost', label: 'Output $/1M tokens', type: 'number', step: '0.01', half: true, default: 0 },
    ];

    const addModel = () => formModal({
      title: 'Add AI model', fields: modelFields(), submitLabel: 'Add',
      onSubmit: async (v) => {
        if (!v.name.trim() || !v.model_id.trim()) throw new Error('Name and model ID are required');
        await post('/admin/ai-models', v); toast('Model added ✓'); render();
      },
    });
    const editModel = (m) => formModal({
      title: `Edit "${m.name}"`, fields: modelFields(m), values: m,
      onSubmit: async (v) => { await put(`/admin/ai-models/${m.id}`, v); toast('Updated ✓'); render(); },
    });

    return el('div', {},
      el('div', { class: 'card', style: { marginBottom: '16px' } },
        el('h3', {}, '🔑 Platform AI keys'),
        el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '14px' } }, 'One key per provider covers every model of that provider below — used for all customers\' AI chats (billed to you, limited per plan).'),
        el('div', { class: 'field-row' }, kAnthropic.el, kOpenai.el),
        el('div', { class: 'field-row' }, kCustom.el, kCustomUrl.el),
        saveKeys),
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
        el('h3', { style: { margin: 0 } }, '🤖 Model catalog'),
        el('button', { class: 'btn', onclick: addModel }, icon('plus'), 'Add model')),
      el('div', { class: 'grid cols-3' }, models.map(m => {
        const editBtn = el('button', { class: 'icon-btn', onclick: () => editModel(m) }); editBtn.innerHTML = icons.edit;
        const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete model "${m.name}"?`, async () => {
          try { await del(`/admin/ai-models/${m.id}`); toast('Deleted'); render(); } catch (e) { toast(e.message, 'err'); }
        }) }); delBtn.innerHTML = icons.trash;
        const toggleBtn = el('button', { class: 'btn ghost sm', onclick: async () => { await put(`/admin/ai-models/${m.id}`, { active: m.active ? 0 : 1 }); render(); } }, m.active ? 'Deactivate' : 'Activate');
        return el('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '6px', opacity: m.active ? 1 : 0.55 } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between' } },
            el('b', {}, m.name), el('div', { style: { display: 'flex', gap: '4px' } }, editBtn, delBtn)),
          el('div', { class: 'badge accent', style: { width: 'fit-content' } }, PROVIDER_LABEL[m.provider]),
          el('div', { class: 'muted', style: { fontFamily: 'monospace', fontSize: '12px' } }, m.model_id),
          el('div', { class: 'muted', style: { fontSize: '12px' } }, `$${m.input_cost}/$${m.output_cost} per 1M tokens`),
          toggleBtn);
      })));
  }

  // ---- Settings (trial/currency/payment info) ----
  async function config() {
    const cfg = await get('/admin/config');
    const f = {};
    const field = (key, label, type = 'text') => {
      const input = type === 'textarea' ? el('textarea', { rows: 4 }) : el('input', { type });
      input.value = cfg[key] || '';
      f[key] = input;
      return el('div', { class: 'field' }, el('label', {}, label), input);
    };
    return el('div', { class: 'card', style: { maxWidth: '620px' } },
      el('h3', {}, '⚙️ General subscription settings'),
      el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '14px' } }, 'Plan prices are managed in the Plans tab. This is everything else.'),
      el('div', { class: 'field-row' }, field('saas_currency', 'Currency symbol'), field('saas_trial_days', 'Free trial (days)', 'number')),
      field('saas_payment_info', 'Payment instructions (shown to customers)', 'textarea'),
      el('button', { class: 'btn', style: { marginTop: '8px' }, onclick: async () => {
        const body = {};
        for (const [k, input] of Object.entries(f)) body[k] = input.value;
        await post('/admin/config', body);
        toast('Settings saved ✓');
      } }, 'Save settings'));
  }

  render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, '🛡 Admin Panel'), el('p', {}, 'Customers, payments, revenue and AI plans — owner only')),
      el('div', { class: 'page-actions' }, tabs)),
    body);
}

import { get, post, del } from '../api.js';
import { el, icon, modal, toast } from '../ui.js';

const MODEL_HINTS = {
  anthropic: 'e.g. claude-sonnet-4-6, claude-haiku-4-5-20251001',
  openai: 'e.g. gpt-4o, gpt-4o-mini',
  custom: 'whatever your endpoint expects',
};

export default async function settingsView() {
  let s = await get('/settings');

  // ---------- AI section ----------
  const provider = el('select', {},
    el('option', { value: 'anthropic', selected: (s.ai_provider || 'anthropic') === 'anthropic' }, 'Anthropic (Claude)'),
    el('option', { value: 'openai', selected: s.ai_provider === 'openai' }, 'OpenAI (GPT)'),
    el('option', { value: 'custom', selected: s.ai_provider === 'custom' }, 'Custom (OpenAI-compatible URL)'));
  const apiKey = el('input', { type: 'password', placeholder: s.ai_api_key_set ? `Saved: ${s.ai_api_key}` : 'Paste your API key' });
  const model = el('input', { placeholder: MODEL_HINTS[s.ai_provider || 'anthropic'] }); model.value = s.ai_model || '';
  const baseUrl = el('input', { placeholder: 'https://your-endpoint.example.com' }); baseUrl.value = s.ai_base_url || '';
  const baseUrlField = el('div', { class: 'field', style: { display: s.ai_provider === 'custom' ? 'block' : 'none' } },
    el('label', {}, 'Base URL'), baseUrl);
  provider.addEventListener('change', () => {
    model.placeholder = MODEL_HINTS[provider.value];
    baseUrlField.style.display = provider.value === 'custom' ? 'block' : 'none';
  });

  const saveAI = el('button', { class: 'btn', onclick: async () => {
    const body = { ai_provider: provider.value, ai_model: model.value, ai_base_url: baseUrl.value };
    if (apiKey.value.trim()) body.ai_api_key = apiKey.value.trim();
    await post('/settings', body);
    toast('AI settings saved ✓');
    s = await get('/settings');
    apiKey.value = '';
    apiKey.placeholder = s.ai_api_key_set ? `Saved: ${s.ai_api_key}` : 'Paste your API key';
  } }, 'Save AI settings');

  const testAI = el('button', { class: 'btn ghost', onclick: async () => {
    testAI.disabled = true;
    try {
      await post('/ai/chat', { message: 'Reply with exactly: Connection OK' });
      toast('AI connection works ✓');
    } catch (e) { toast(e.message, 'err'); }
    testAI.disabled = false;
  } }, 'Test connection');

  // ---------- Google section ----------
  const gStatus = el('span', { class: `badge ${s.google_connected ? 'green' : ''}` }, s.google_connected ? '● Connected' : 'Not connected');

  const connectGoogle = el('button', { class: 'btn ghost', onclick: async () => {
    try {
      const { url, redirect_uri } = await get('/google/auth-url');
      navigator.clipboard?.writeText(redirect_uri).catch(() => {});
      window.open(url, '_blank', 'width=520,height=640');
      toast('Complete the consent in the popup, then refresh this page');
    } catch (e) { toast(e.message, 'err'); }
  } }, icon('link'), 'Connect Google');

  const disconnectGoogle = el('button', { class: 'btn danger sm', style: { display: s.google_connected ? 'inline-flex' : 'none' }, onclick: async () => {
    await del('/settings/google_tokens');
    toast('Google disconnected');
    location.reload();
  } }, 'Disconnect');

  // ---------- Notion section ----------
  const notionToken = el('input', { type: 'password', placeholder: s.notion_token_set ? `Saved: ${s.notion_token}` : 'secret_xxx (internal integration token)' });
  const saveNotion = el('button', { class: 'btn ghost sm', onclick: async () => {
    if (!notionToken.value.trim()) return toast('Paste a token first', 'err');
    await post('/settings', { notion_token: notionToken.value.trim() });
    toast('Notion token saved ✓');
    notionToken.value = '';
  } }, 'Save token');

  const importNotion = el('button', { class: 'btn ghost', onclick: async () => {
    try {
      const pages = await get('/notion/search');
      if (!pages.length) return toast('No pages found — share pages with your integration in Notion', 'err');
      const list = el('div', { class: 'stack' }, pages.map(p => {
        const btn = el('button', { class: 'btn sm', onclick: async () => {
          btn.disabled = true;
          try {
            await post('/notion/import', { page_id: p.id, title: p.title });
            toast(`Imported "${p.title}" into Brainstorming ✓`);
          } catch (e) { toast(e.message, 'err'); }
          btn.disabled = false;
        } }, 'Import');
        return el('div', { class: 'list-row' },
          el('div', { class: 'grow' }, el('div', { class: 'title' }, p.title),
            el('div', { class: 'sub' }, 'Edited ' + (p.last_edited || '').slice(0, 10))),
          btn);
      }));
      modal({ title: 'Import from Notion', body: list, wide: true });
    } catch (e) { toast(e.message, 'err'); }
  } }, icon('download'), 'Browse & import pages');

  // ---------- Telegram section ----------
  const tgStatus = el('span', { class: `badge ${s.telegram_connected ? 'green' : ''}` }, s.telegram_connected ? '● Connected' : 'Not connected');
  const tgToken = el('input', { type: 'password', placeholder: s.telegram_bot_token_set ? `Saved: ${s.telegram_bot_token}` : '123456:ABC-xxxx (from @BotFather)' });
  const tgTz = el('input', { placeholder: 'Asia/Dhaka' }); tgTz.value = s.timezone || 'Asia/Dhaka';

  const connectTg = el('button', { class: 'btn ghost', onclick: async () => {
    try {
      if (tgToken.value.trim()) await post('/settings', { telegram_bot_token: tgToken.value.trim() });
      const { url } = await post('/telegram/link-start');
      window.open(url, '_blank');
      toast('Tap Start in the chat that just opened — waiting…');
      connectTg.disabled = true;
      const startedAt = Date.now();
      const poll = setInterval(async () => {
        const fresh = await get('/settings');
        if (fresh.telegram_connected || Date.now() - startedAt > 90000) {
          clearInterval(poll);
          connectTg.disabled = false;
          if (fresh.telegram_connected) { toast('Telegram connected ✓'); location.reload(); }
          else toast('Still not connected — make sure you tapped Start, then try again', 'err');
        }
      }, 3000);
    } catch (e) { toast(e.message, 'err'); }
  } }, icon('link'), 'Save & Connect');

  const disconnectTg = el('button', { class: 'btn danger sm', style: { display: s.telegram_connected ? 'inline-flex' : 'none' }, onclick: async () => {
    await del('/settings/telegram_chat_id');
    toast('Telegram disconnected');
    location.reload();
  } }, 'Disconnect');

  const saveTz = el('button', { class: 'btn ghost sm', onclick: async () => {
    await post('/settings', { timezone: tgTz.value.trim() || 'Asia/Dhaka' });
    toast('Timezone saved ✓');
  } }, 'Save timezone');

  const testTg = el('button', { class: 'btn ghost', onclick: async () => {
    testTg.disabled = true;
    try { await post('/telegram/test'); toast('Test message sent — check Telegram ✓'); }
    catch (e) { toast(e.message, 'err'); }
    testTg.disabled = false;
  } }, 'Send test message');

  // Notification preferences — morning/night/finance/payment defaulted ON historically (always sent);
  // telegram_ai_reports defaulted OFF (opt-in) — preserve both defaults for existing users.
  const notifOptions = (key, label, defaultOn = true) => {
    const val = defaultOn ? (s[key] === 'off' ? 'off' : 'on') : (s[key] === 'on' ? 'on' : 'off');
    return el('div', { class: 'field' }, el('label', {}, label),
      el('select', { onchange: async (e) => { await post('/settings', { [key]: e.target.value }); toast('Saved ✓'); } },
        el('option', { value: 'on', selected: val === 'on' }, 'On'),
        el('option', { value: 'off', selected: val === 'off' }, 'Off')));
  };

  // ---------- General ----------
  const currency = el('input', { placeholder: '$, ৳, €, BDT …', style: { maxWidth: '120px' } }); currency.value = s.currency || '$';
  const saveGeneral = el('button', { class: 'btn ghost sm', onclick: async () => {
    await post('/settings', { currency: currency.value });
    toast('Saved ✓');
  } }, 'Save');

  // ---------- Password ----------
  const curPass = el('input', { type: 'password', placeholder: 'Current password' });
  const newPass = el('input', { type: 'password', placeholder: 'New password (min 6 chars)' });
  const changePass = el('button', { class: 'btn ghost sm', onclick: async () => {
    try {
      await post('/auth/change-password', { current: curPass.value, next: newPass.value });
      toast('Password changed ✓');
      curPass.value = newPass.value = '';
    } catch (e) { toast(e.message, 'err'); }
  } }, 'Change password');

  const section = (title, desc, ...kids) => el('div', { class: 'card' },
    el('h3', {}, title),
    desc ? el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '14px' } }, desc) : null,
    ...kids);

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Settings'), el('p', {}, 'Connect AI and integrations — everything configurable right here, no code'))),
    el('div', { class: 'grid cols-2' },

      section('🤖 AI Assistant — your own key (optional)', 'Your subscription plan already includes AI messages each month (see My Subscription). Add your own API key here only if you want unlimited usage beyond your plan\'s limit — it overrides the platform AI and is billed to you directly.',
        el('div', { class: 'field' }, el('label', {}, 'Provider'), provider),
        el('div', { class: 'field' }, el('label', {}, 'API key'), apiKey),
        el('div', { class: 'field' }, el('label', {}, 'Model'), model),
        baseUrlField,
        el('div', { style: { display: 'flex', gap: '10px' } }, saveAI, testAI)),

      section('📅 Google Calendar & Drive', 'One click — no setup needed on your end.',
        el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, connectGoogle, gStatus, disconnectGoogle)),

      section('📨 Telegram notifications', 'Create a bot with @BotFather (takes 30 seconds), paste its token below, then tap Save & Connect — no need to look up a chat ID, we detect it automatically.',
        el('div', { class: 'field' }, el('label', {}, 'Bot token'), tgToken),
        el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', margin: '10px 0 14px' } }, connectTg, tgStatus, disconnectTg),
        el('div', { class: 'field' }, el('label', {}, 'Timezone'), tgTz),
        saveTz,
        el('div', { class: 'divider', style: { margin: '14px 0' } }),
        notifOptions('notif_morning', '☀️ Morning report (10:00) — running projects'),
        notifOptions('notif_night', '🌙 Night report (22:00) — daily progress'),
        notifOptions('notif_finance', '📊 Monthly finance report (1st of month)'),
        notifOptions('notif_payment', '💳 Payment status updates'),
        notifOptions('telegram_ai_reports', '🤖 AI task reports — every AI answer', false),
        el('div', { style: { marginTop: '10px' } }, testTg)),

      section('📓 Notion Import', 'Create an internal integration at notion.so/my-integrations, share your pages with it, then import them as brainstorming notes.',
        el('div', { class: 'field' }, el('label', {}, 'Integration token'), notionToken),
        el('div', { style: { display: 'flex', gap: '10px' } }, saveNotion, importNotion)),

      section('⚙️ General', null,
        el('div', { class: 'field' }, el('label', {}, 'Currency symbol'), currency),
        saveGeneral,
        el('div', { class: 'divider', style: { margin: '16px 0' } }),
        el('div', { class: 'field' }, el('label', {}, 'Change password'), curPass),
        el('div', { class: 'field' }, newPass),
        changePass),
    ));
}

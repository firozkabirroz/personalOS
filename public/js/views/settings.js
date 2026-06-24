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
  const gClientId = el('input', { placeholder: 'xxxxx.apps.googleusercontent.com' }); gClientId.value = s.google_client_id || '';
  const gSecret = el('input', { type: 'password', placeholder: s.google_client_secret_set ? `Saved: ${s.google_client_secret}` : 'Client secret' });
  const gStatus = el('span', { class: `badge ${s.google_connected ? 'green' : ''}` }, s.google_connected ? '● Connected' : 'Not connected');

  const connectGoogle = el('button', { class: 'btn ghost', onclick: async () => {
    try {
      const body = { google_client_id: gClientId.value.trim() };
      if (gSecret.value.trim()) body.google_client_secret = gSecret.value.trim();
      await post('/settings', body);
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
  const tgToken = el('input', { type: 'password', placeholder: s.telegram_bot_token_set ? `Saved: ${s.telegram_bot_token}` : '123456:ABC-xxxx (from @BotFather)' });
  const tgChat = el('input', { placeholder: 'Your chat ID (from @userinfobot)' }); tgChat.value = s.telegram_chat_id || '';
  const tgTz = el('input', { placeholder: 'Asia/Dhaka' }); tgTz.value = s.timezone || 'Asia/Dhaka';
  const tgAi = el('select', {},
    el('option', { value: 'off', selected: (s.telegram_ai_reports || 'off') === 'off' }, 'Off'),
    el('option', { value: 'on', selected: s.telegram_ai_reports === 'on' }, 'On — send every AI answer to Telegram'));

  const saveTg = el('button', { class: 'btn', onclick: async () => {
    const body = { telegram_chat_id: tgChat.value.trim(), timezone: tgTz.value.trim() || 'Asia/Dhaka', telegram_ai_reports: tgAi.value };
    if (tgToken.value.trim()) body.telegram_bot_token = tgToken.value.trim();
    await post('/settings', body);
    toast('Telegram settings saved ✓');
    s = await get('/settings');
    tgToken.value = '';
    tgToken.placeholder = s.telegram_bot_token_set ? `Saved: ${s.telegram_bot_token}` : '123456:ABC-xxxx (from @BotFather)';
  } }, 'Save Telegram settings');

  const testTg = el('button', { class: 'btn ghost', onclick: async () => {
    testTg.disabled = true;
    try { await post('/telegram/test'); toast('Test message sent — check Telegram ✓'); }
    catch (e) { toast(e.message, 'err'); }
    testTg.disabled = false;
  } }, 'Send test message');

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

      section('🤖 AI Assistant', 'Plug in any AI provider. Your key is stored locally on your machine and never shown again in full.',
        el('div', { class: 'field' }, el('label', {}, 'Provider'), provider),
        el('div', { class: 'field' }, el('label', {}, 'API key'), apiKey),
        el('div', { class: 'field' }, el('label', {}, 'Model'), model),
        baseUrlField,
        el('div', { style: { display: 'flex', gap: '10px' } }, saveAI, testAI)),

      section('📅 Google Calendar & Drive', 'Create an OAuth client (Web application) in Google Cloud Console. Add the redirect URI shown after clicking Connect (it is copied to your clipboard automatically).',
        el('div', { class: 'field' }, el('label', {}, 'OAuth Client ID'), gClientId),
        el('div', { class: 'field' }, el('label', {}, 'OAuth Client Secret'), gSecret),
        el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, connectGoogle, gStatus, disconnectGoogle),
        el('p', { class: 'muted', style: { marginTop: '10px' } },
          `Redirect URI to whitelist: ${location.origin}/api/google/callback`)),

      section('📨 Telegram Bot', 'Create a bot with @BotFather in Telegram, copy its token, then get your chat ID from @userinfobot. You will receive: ☀️ 10:00 running projects, 🌙 22:00 progress report, 📊 monthly finance report on the 1st — in your timezone.',
        el('div', { class: 'field' }, el('label', {}, 'Bot token'), tgToken),
        el('div', { class: 'field' }, el('label', {}, 'Chat ID'), tgChat),
        el('div', { class: 'field' }, el('label', {}, 'Timezone'), tgTz),
        el('div', { class: 'field' }, el('label', {}, 'AI task reports'), tgAi),
        el('div', { style: { display: 'flex', gap: '10px' } }, saveTg, testTg)),

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

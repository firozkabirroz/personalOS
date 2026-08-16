import { get, post, del } from '../api.js';
import { el, icon, modal, toast } from '../ui.js';
import { currentUser } from '../app.js';

export default async function settingsView() {
  let s = await get('/settings');

  // ---------- Google ----------
  const gStatus = el('span', { class: `badge ${s.google_connected ? 'green' : ''}` }, s.google_connected ? '● Connected' : 'Not connected');
  const connectGoogle = el('button', { class: 'btn', onclick: async () => {
    try {
      const { url } = await get('/google/auth-url');
      window.open(url, '_blank', 'width=520,height=640');
      toast('Complete the consent in the popup, then refresh this page');
    } catch (e) { toast(e.message, 'err'); }
  } }, icon('link'), 'Connect Google');
  const disconnectGoogle = el('button', { class: 'btn danger sm', style: { display: s.google_connected ? 'inline-flex' : 'none' }, onclick: async () => {
    await del('/settings/google_tokens');
    toast('Google disconnected');
    location.reload();
  } }, 'Disconnect');

  // ---------- Notion (one-click OAuth) ----------
  const nStatus = el('span', { class: `badge ${s.notion_connected ? 'green' : ''}` }, s.notion_connected ? '● Connected' : 'Not connected');
  const connectNotion = el('button', { class: 'btn', onclick: async () => {
    try {
      const { url } = await get('/notion/auth-url');
      window.open(url, '_blank', 'width=520,height=640');
      toast('Complete Notion consent, then refresh this page');
    } catch (e) { toast(e.message, 'err'); }
  } }, icon('link'), 'Connect Notion');
  const disconnectNotion = el('button', { class: 'btn danger sm', style: { display: s.notion_connected ? 'inline-flex' : 'none' }, onclick: async () => {
    await del('/settings/notion_tokens');
    toast('Notion disconnected');
    location.reload();
  } }, 'Disconnect');

  const importNotion = el('button', { class: 'btn ghost', style: { display: s.notion_connected ? 'inline-flex' : 'none' }, onclick: async () => {
    try {
      const pages = await get('/notion/search');
      if (!pages.length) return toast('No pages found — share pages with the Notion integration', 'err');
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

  // ---------- Telegram ----------
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

  const notifOptions = (key, label, defaultOn = true) => {
    const val = defaultOn ? (s[key] === 'off' ? 'off' : 'on') : (s[key] === 'on' ? 'on' : 'off');
    return el('div', { class: 'field' }, el('label', {}, label),
      el('select', { onchange: async (e) => { await post('/settings', { [key]: e.target.value }); toast('Saved ✓'); } },
        el('option', { value: 'on', selected: val === 'on' }, 'On'),
        el('option', { value: 'off', selected: val === 'off' }, 'Off')));
  };

  const currency = el('input', { placeholder: '$, ৳, €, BDT …', style: { maxWidth: '120px' } }); currency.value = s.currency || '$';
  const saveGeneral = el('button', { class: 'btn ghost sm', onclick: async () => {
    await post('/settings', { currency: currency.value });
    toast('Saved ✓');
  } }, 'Save');

  const curUser = el('input', { type: 'text', autocomplete: 'username' });
  curUser.value = currentUser?.username || '';
  const curPass = el('input', { type: 'password', placeholder: 'Current password' });
  const newPass = el('input', { type: 'password', placeholder: 'New password (min 6 chars, optional)' });
  const changePass = el('button', { class: 'btn ghost sm', onclick: async () => {
    try {
      const body = { current: curPass.value };
      const nextUser = curUser.value.trim().toLowerCase();
      if (nextUser && nextUser !== currentUser?.username) body.username = nextUser;
      if (newPass.value) body.next = newPass.value;
      if (!body.username && !body.next) throw new Error('Enter a new username or password');
      const result = await post('/auth/account', body);
      toast('Login updated ✓');
      curPass.value = newPass.value = '';
      if (result?.user?.username && result.user.username !== currentUser?.username) location.reload();
    } catch (e) { toast(e.message, 'err'); }
  } }, 'Save login');

  const section = (ic, title, desc, ...kids) => el('div', { class: 'card' },
    el('h3', {}, icon(ic), title),
    desc ? el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '14px' } }, desc) : null,
    ...kids);

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Settings'), el('p', {}, 'Just register and use — connect Google/Notion in one click if you want'))),
    el('div', { class: 'grid cols-2' },

      section('calendar', 'Google Calendar & Drive', 'One click — admin already set up the OAuth app. No API keys needed from you.',
        el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } }, connectGoogle, gStatus, disconnectGoogle)),

      section('book', 'Notion', 'One-click connect. Then import pages into Brainstorming.',
        el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } }, connectNotion, nStatus, disconnectNotion, importNotion)),

      section('bell', 'Telegram notifications', 'Optional. Create a bot with @BotFather, paste its token, then tap Save & Connect.',
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

      section('settings', 'General', null,
        el('div', { class: 'field' }, el('label', {}, 'Currency symbol'), currency),
        saveGeneral,
        el('div', { class: 'divider', style: { margin: '16px 0' } }),
        el('div', { class: 'field' }, el('label', {}, 'Username'), curUser),
        el('div', { class: 'field' }, el('label', {}, 'Current password'), curPass),
        el('div', { class: 'field' }, el('label', {}, 'New password'), newPass),
        changePass),
    ));
}

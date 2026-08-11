import { get, post } from '/js/api.js';
import { el, toast } from '/js/ui.js';

export default async function integrationsView() {
  const cfg = await get('/admin/integrations');

  const gClientId = el('input', { placeholder: 'xxxxx.apps.googleusercontent.com' }); gClientId.value = cfg.platform_google_client_id || '';
  const gSecret = el('input', { type: 'password', placeholder: cfg.platform_google_client_secret_set ? `Saved: ${cfg.platform_google_client_secret}` : 'Client secret' });

  const saveGoogle = el('button', { class: 'btn', onclick: async () => {
    try {
      const body = {};
      if (gClientId.value.trim()) body.platform_google_client_id = gClientId.value.trim();
      if (gSecret.value.trim()) body.platform_google_client_secret = gSecret.value.trim();
      await post('/admin/integrations', body);
      toast('Google settings saved ✓');
      gSecret.value = '';
    } catch (e) { toast(e.message, 'err'); }
  } }, 'Save Google settings');

  const nClientId = el('input', { placeholder: 'Notion OAuth client ID' }); nClientId.value = cfg.platform_notion_client_id || '';
  const nSecret = el('input', { type: 'password', placeholder: cfg.platform_notion_client_secret_set ? `Saved: ${cfg.platform_notion_client_secret}` : 'Client secret' });

  const saveNotion = el('button', { class: 'btn', onclick: async () => {
    try {
      const body = {};
      if (nClientId.value.trim()) body.platform_notion_client_id = nClientId.value.trim();
      if (nSecret.value.trim()) body.platform_notion_client_secret = nSecret.value.trim();
      await post('/admin/integrations', body);
      toast('Notion settings saved ✓');
      nSecret.value = '';
    } catch (e) { toast(e.message, 'err'); }
  } }, 'Save Notion settings');

  const section = (title, desc, ...kids) => el('div', { class: 'card', style: { marginBottom: '16px' } },
    el('h3', {}, title),
    desc ? el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '14px' } }, desc) : null,
    ...kids);

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Integrations'), el('p', {}, 'Platform-wide credentials — users connect with one click'))),

    section('📅 Google OAuth', 'Create an OAuth client (Web application) in Google Cloud Console. Whitelist BOTH redirect URIs below. Users then get one-click Google login + Calendar/Drive.',
      el('div', { class: 'field' }, el('label', {}, 'OAuth Client ID'), gClientId),
      el('div', { class: 'field' }, el('label', {}, 'OAuth Client Secret'), gSecret),
      saveGoogle,
      el('p', { class: 'muted', style: { marginTop: '10px', fontFamily: 'monospace', fontSize: '12px' } },
        `${location.origin}/api/google/callback`, el('br'), `${location.origin}/api/auth/google/callback`)),

    section('📓 Notion OAuth', 'Create a public Notion integration at notion.so/my-integrations → Distribution → OAuth domain. Users connect with one click — no token paste.',
      el('div', { class: 'field' }, el('label', {}, 'OAuth Client ID'), nClientId),
      el('div', { class: 'field' }, el('label', {}, 'OAuth Client Secret'), nSecret),
      saveNotion,
      el('p', { class: 'muted', style: { marginTop: '10px', fontFamily: 'monospace', fontSize: '12px' } },
        `Redirect URI: ${location.origin}/api/notion/callback`)),

    section('📨 Telegram', 'Telegram bots stay per-customer — each user creates their own bot via @BotFather in Settings. Nothing to configure here.'));
}

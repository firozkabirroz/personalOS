import { get, post } from '/js/api.js';
import { el, toast } from '/js/ui.js';

export default async function integrationsView() {
  const cfg = await get('/admin/integrations');

  // ---------- Google ----------
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

  const section = (title, desc, ...kids) => el('div', { class: 'card', style: { marginBottom: '16px' } },
    el('h3', {}, title),
    desc ? el('p', { class: 'muted', style: { marginTop: '-8px', marginBottom: '14px' } }, desc) : null,
    ...kids);

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, '🔌 Integrations'), el('p', {}, 'Platform-wide credentials'))),

    section('📅 Google OAuth', 'Create an OAuth client (Web application) in Google Cloud Console. Whitelist BOTH redirect URIs below. Once saved, every customer gets one-click Google login/connect — no setup on their end.',
      el('div', { class: 'field' }, el('label', {}, 'OAuth Client ID'), gClientId),
      el('div', { class: 'field' }, el('label', {}, 'OAuth Client Secret'), gSecret),
      saveGoogle,
      el('p', { class: 'muted', style: { marginTop: '10px', fontFamily: 'monospace', fontSize: '12px' } },
        `${location.origin}/api/google/callback`, el('br'), `${location.origin}/api/auth/google/callback`)),

    section('📨 Telegram', 'Telegram bots are per-customer — each customer creates their own bot via @BotFather in their own Settings page. There is nothing to configure here.'));
}

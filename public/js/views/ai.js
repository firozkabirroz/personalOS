import { get, post, del } from '../api.js';
import { el, icon, confirmModal, toast } from '../ui.js';
import { navigate } from '../app.js';

const SUGGESTIONS = [
  'What should I focus on today?',
  'Summarize my running projects and what\'s at risk',
  'Where am I overspending this month?',
  'How are my habits and health trending?',
  'Help me plan my next trip within budget',
];

export default async function aiView() {
  const settings = await get('/settings');
  const history = await get('/ai/history');
  const configured = settings.ai_api_key_set;

  const scroll = el('div', { class: 'chat-scroll' });

  function bubble(role, text) {
    const b = el('div', { class: `msg ${role === 'user' ? 'user' : 'ai'}` },
      el('div', { class: 'who' }, role === 'user' ? 'Y' : 'AI'),
      el('div', { class: 'bubble' }, text));
    if (role !== 'user') {
      const tg = el('button', {
        class: 'icon-btn', title: 'Send this answer to my Telegram',
        style: { alignSelf: 'flex-end', fontSize: '13px' },
        onclick: async () => {
          tg.disabled = true;
          try { await post('/telegram/forward', { text, title: 'AI Task Report' }); toast('Sent to Telegram ✓'); }
          catch (e) { toast(e.message, 'err'); }
          tg.disabled = false;
        },
      }, '📨');
      b.append(tg);
    }
    return b;
  }

  function scrollDown() { scroll.scrollTop = scroll.scrollHeight; }

  if (!history.length) {
    scroll.append(el('div', { style: { textAlign: 'center', padding: '30px 16px', color: 'var(--text-dim)' } },
      el('div', { style: { fontSize: '38px', marginBottom: '10px' } }, '🤖'),
      el('h3', { style: { color: 'var(--text)', marginBottom: '6px' } }, 'Your personal AI'),
      el('p', { style: { fontSize: '13px', maxWidth: '440px', margin: '0 auto 18px' } },
        'It can see your tasks, projects, plans, ideas, expenses, habits, health log, trips and calendar — ask anything about your life and work.'),
      el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' } },
        SUGGESTIONS.map(s => el('button', { class: 'btn ghost sm', onclick: () => { input.value = s; send(); } }, s))),
      !configured ? el('p', { style: { marginTop: '20px' } },
        el('span', { class: 'badge amber' }, '⚠ No API key configured'), ' ',
        el('a', { style: { cursor: 'pointer' }, onclick: () => navigate('settings') }, 'Set up in Settings →')) : null,
    ));
  } else {
    history.forEach(m => scroll.append(bubble(m.role, m.content)));
  }

  const input = el('textarea', { rows: 1, placeholder: configured ? 'Ask about your data… (Enter to send, Shift+Enter for new line)' : 'Add your AI API key in Settings first…' });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  const sendBtn = el('button', { class: 'btn', onclick: () => send() }, icon('send'), 'Send');

  let busy = false;
  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    // clear welcome screen on first message
    if (scroll.querySelector('h3')) scroll.innerHTML = '';
    scroll.append(bubble('user', text));
    const typing = el('div', { class: 'msg ai' }, el('div', { class: 'who' }, 'AI'),
      el('div', { class: 'bubble' }, el('span', { class: 'typing' }, el('span'), el('span'), el('span'))));
    scroll.append(typing);
    scrollDown();
    try {
      const r = await post('/ai/chat', { message: text });
      typing.remove();
      scroll.append(bubble('assistant', r.reply));
    } catch (e) {
      typing.remove();
      scroll.append(el('div', { class: 'msg ai' }, el('div', { class: 'who' }, '!'),
        el('div', { class: 'bubble', style: { borderColor: 'rgba(239,68,68,.4)', color: '#fca5a5' } }, e.message)));
    }
    busy = false;
    sendBtn.disabled = false;
    scrollDown();
    input.focus();
  }

  const clearBtn = el('button', { class: 'btn ghost', onclick: () => confirmModal('Clear the whole conversation history?', async () => {
    await del('/ai/history');
    toast('Conversation cleared');
    navigate('ai');
    location.reload();
  }) }, 'Clear chat');

  setTimeout(scrollDown, 60);

  return el('div', {},
    el('div', { class: 'page-head', style: { marginBottom: '12px' } },
      el('div', {}, el('h2', {}, 'AI Assistant'),
        el('p', {}, settings.ai_provider ? `Provider: ${settings.ai_provider}${settings.ai_model ? ' · ' + settings.ai_model : ''}` : 'Connect any AI provider from Settings — no code needed')),
      el('div', { class: 'page-actions' }, clearBtn)),
    el('div', { class: 'chat-wrap' },
      scroll,
      el('div', { class: 'chat-input' }, input, sendBtn)));
}

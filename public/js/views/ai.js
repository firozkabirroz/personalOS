import { get, post, del, api } from '../api.js';
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
  const [{ models, credits: startCredits, unlimited }, history] = await Promise.all([
    get('/ai/models'),
    get('/ai/history'),
  ]);
  let credits = startCredits || 0;
  let selectedModelId = models.find(m => m.is_free)?.id || models[0]?.id || null;
  let pendingFiles = [];

  const scroll = el('div', { class: 'chat-scroll' });
  const creditBadge = el('span', {});
  const modelSelect = el('select', {
    style: { maxWidth: '220px' },
    onchange: (e) => { selectedModelId = Number(e.target.value); renderCreditBadge(); },
  });

  function renderModels() {
    modelSelect.innerHTML = '';
    for (const m of models) {
      const label = m.is_free ? `${m.name} · Free` : `${m.name} · ${m.credit_cost} credit${m.credit_cost === 1 ? '' : 's'}`;
      modelSelect.append(el('option', { value: m.id, selected: m.id === selectedModelId }, label));
    }
  }
  renderModels();

  function renderCreditBadge() {
    creditBadge.innerHTML = '';
    if (unlimited) {
      creditBadge.append(el('span', { class: 'badge green' }, 'Unlimited (staff)'));
      return;
    }
    const m = models.find(x => x.id === selectedModelId);
    creditBadge.append(
      el('span', { class: `badge ${credits > 0 ? 'accent' : 'amber'}` }, `⚡ ${credits} credits`),
      m && !m.is_free ? el('span', { class: 'badge', style: { marginLeft: '6px' } }, `${m.credit_cost}/msg`) : null,
    );
  }
  renderCreditBadge();

  function bubble(role, text, meta) {
    const b = el('div', { class: `msg ${role === 'user' ? 'user' : 'ai'}` },
      el('div', { class: 'who' }, role === 'user' ? 'Y' : 'AI'),
      el('div', { class: 'bubble' }, text));
    if (meta) b.append(el('div', { class: 'muted', style: { fontSize: '11px', marginTop: '2px' } }, meta));
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
        'Free models are unlimited. Switch to a paid model anytime — it uses your credits. Attach files if you want.'),
      el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' } },
        SUGGESTIONS.map(s => el('button', { class: 'btn ghost sm', onclick: () => { input.value = s; send(); } }, s))),
    ));
  } else {
    history.forEach(m => scroll.append(bubble(m.role, m.content)));
  }

  const input = el('textarea', { rows: 1, placeholder: 'Ask about your data… (Enter to send, Shift+Enter for new line)' });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  const fileInput = el('input', { type: 'file', multiple: true, accept: 'image/*,.pdf,.txt', style: { display: 'none' } });
  const fileChip = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' } });
  function renderFiles() {
    fileChip.innerHTML = '';
    pendingFiles.forEach((f, i) => {
      fileChip.append(el('span', { class: 'badge', style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
        f.name.slice(0, 24),
        el('button', { class: 'icon-btn', style: { fontSize: '10px', padding: '0' }, onclick: () => { pendingFiles.splice(i, 1); renderFiles(); } }, '×')));
    });
  }
  fileInput.addEventListener('change', () => {
    pendingFiles = [...pendingFiles, ...Array.from(fileInput.files || [])].slice(0, 4);
    fileInput.value = '';
    renderFiles();
  });

  const attachBtn = el('button', { class: 'btn ghost sm', type: 'button', title: 'Attach image / PDF / text', onclick: () => fileInput.click() }, '📎');
  const sendBtn = el('button', { class: 'btn', onclick: () => send() }, icon('send'), 'Send');

  let busy = false;
  async function send() {
    const text = input.value.trim();
    if ((!text && !pendingFiles.length) || busy) return;
    busy = true;
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    if (scroll.querySelector('h3')) scroll.innerHTML = '';

    const filesSnapshot = pendingFiles.slice();
    pendingFiles = [];
    renderFiles();

    const meta = filesSnapshot.length ? `📎 ${filesSnapshot.map(f => f.name).join(', ')}` : '';
    scroll.append(bubble('user', text || '(attachment)', meta));
    const typing = el('div', { class: 'msg ai' }, el('div', { class: 'who' }, 'AI'),
      el('div', { class: 'bubble' }, el('span', { class: 'typing' }, el('span'), el('span'), el('span'))));
    scroll.append(typing);
    scrollDown();

    try {
      const fd = new FormData();
      fd.append('message', text);
      if (selectedModelId) fd.append('model_id', String(selectedModelId));
      for (const f of filesSnapshot) fd.append('files', f);

      const r = await api('/ai/chat', { method: 'POST', body: fd });
      typing.remove();
      scroll.append(bubble('assistant', r.reply, r.model ? `${r.model.name}${r.charged ? ` · −${r.charged} credit` : ' · Free'}` : ''));
      if (typeof r.credits === 'number') { credits = r.credits; renderCreditBadge(); }
    } catch (e) {
      typing.remove();
      scroll.append(el('div', { class: 'msg ai' }, el('div', { class: 'who' }, '!'),
        el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          el('div', { class: 'bubble', style: { borderColor: 'rgba(239,68,68,.4)', color: '#fca5a5' } }, e.message),
          e.needsCredits ? el('a', { style: { cursor: 'pointer', fontSize: '13px' }, onclick: () => navigate('billing') }, 'Buy credits →') : null)));
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
        el('p', {}, 'Pick a model, attach files if needed — free models cost nothing')),
      el('div', { class: 'page-actions', style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
        modelSelect, creditBadge, clearBtn)),
    el('div', { class: 'chat-wrap' },
      scroll,
      el('div', { class: 'chat-input', style: { flexDirection: 'column', alignItems: 'stretch' } },
        fileChip,
        el('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-end' } },
          fileInput, attachBtn, input, sendBtn))));
}

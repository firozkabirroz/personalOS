import { get, post, del, api } from '../api.js';
import { el, icon, icons, confirmModal, toast, renderMarkdown } from '../ui.js';
import { navigate } from '../app.js';

const SUGGESTIONS = [
  'What should I focus on today?',
  'Summarize my running projects and what\'s at risk',
  'Where am I overspending this month?',
  'How are my habits and health trending?',
  'Help me plan my next trip within budget',
];

export default async function aiView() {
  const [{ models }, history] = await Promise.all([
    get('/ai/models'),
    get('/ai/history'),
  ]);
  let selectedModelId = models[0]?.id || null;
  let pendingFiles = [];

  const scroll = el('div', { class: 'chat-scroll' });

  const modelSelect = el('select', {
    class: 'model-pill',
    title: 'Switch AI model',
    onchange: (e) => { selectedModelId = Number(e.target.value); },
  });
  for (const m of models) {
    modelSelect.append(el('option', { value: m.id, selected: m.id === selectedModelId }, m.name));
  }

  function aiAvatar() {
    const who = el('div', { class: 'who' });
    who.innerHTML = icons.ai;
    return who;
  }

  function bubble(role, text, { meta = '', images = [], files = [] } = {}) {
    const content = role === 'user'
      ? el('div', { class: 'bubble' }, text)
      : renderMarkdown(text);

    const col = el('div', { class: 'msg-col' });
    if (images.length || files.length) {
      col.append(el('div', { class: 'attach-strip' },
        images.map(src => el('img', { class: 'attach-thumb', src, alt: 'attachment' })),
        files.map(name => {
          const f = el('span', { class: 'attach-file' });
          f.innerHTML = icons.file;
          f.append(name);
          return f;
        })));
    }
    col.append(content);
    if (meta) col.append(el('div', { class: 'msg-meta' }, meta));

    const b = el('div', { class: `msg ${role === 'user' ? 'user' : 'ai'}` },
      role === 'user' ? el('div', { class: 'who' }, 'Y') : aiAvatar(),
      col);

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

  function welcomeScreen() {
    const heroIc = el('div', { class: 'hero-ic' });
    heroIc.innerHTML = icons.sparkles;
    return el('div', { class: 'welcome-hero' },
      heroIc,
      el('h3', {}, 'Your personal AI — free & unlimited'),
      el('p', {}, 'It can see your tasks, projects, expenses, habits and more. Switch models anytime, attach files if you want — everything is free.'),
      el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' } },
        SUGGESTIONS.map(s => el('button', { class: 'btn ghost sm', onclick: () => { input.value = s; send(); } }, s))));
  }

  if (!history.length) {
    scroll.append(welcomeScreen());
  } else {
    history.forEach(m => {
      let files = [];
      try {
        const at = m.attachments ? JSON.parse(m.attachments) : [];
        files = at.map(a => a.name);
      } catch {}
      scroll.append(bubble(m.role, m.content, { files }));
    });
  }

  const input = el('textarea', { rows: 1, placeholder: 'Ask about your data… (Enter to send)' });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  const fileInput = el('input', { type: 'file', multiple: true, accept: 'image/*,.pdf,.txt', style: { display: 'none' } });
  const fileChips = el('div', { class: 'chat-file-chips', style: { display: 'none' } });
  function renderFiles() {
    fileChips.innerHTML = '';
    fileChips.style.display = pendingFiles.length ? 'flex' : 'none';
    pendingFiles.forEach((f, i) => {
      fileChips.append(el('span', { class: 'chat-file-chip' },
        f.name.length > 26 ? f.name.slice(0, 24) + '…' : f.name,
        el('button', { onclick: () => { pendingFiles.splice(i, 1); renderFiles(); } }, '×')));
    });
  }
  fileInput.addEventListener('change', () => {
    pendingFiles = [...pendingFiles, ...Array.from(fileInput.files || [])].slice(0, 4);
    fileInput.value = '';
    renderFiles();
  });

  const attachBtn = el('button', { class: 'icon-btn', type: 'button', title: 'Attach image / PDF / text', onclick: () => fileInput.click() });
  attachBtn.innerHTML = icons.paperclip;

  const sendBtn = el('button', { class: 'btn', onclick: () => send() }, icon('send'), 'Send');

  let busy = false;
  async function send() {
    const text = input.value.trim();
    if ((!text && !pendingFiles.length) || busy) return;
    busy = true;
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    if (scroll.querySelector('.welcome-hero')) scroll.innerHTML = '';

    const filesSnapshot = pendingFiles.slice();
    pendingFiles = [];
    renderFiles();

    const images = filesSnapshot.filter(f => f.type.startsWith('image/')).map(f => URL.createObjectURL(f));
    const otherFiles = filesSnapshot.filter(f => !f.type.startsWith('image/')).map(f => f.name);
    scroll.append(bubble('user', text || '(attachment)', { images, files: otherFiles }));

    const typing = el('div', { class: 'msg ai' }, aiAvatar(),
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
      scroll.append(bubble('assistant', r.reply, { meta: r.model?.name || '' }));
    } catch (e) {
      typing.remove();
      scroll.append(el('div', { class: 'msg ai' }, el('div', { class: 'who' }, '!'),
        el('div', { class: 'msg-col' },
          el('div', { class: 'bubble', style: { borderColor: 'rgba(239,68,68,.4)', color: '#fca5a5' } }, e.message))));
    }
    busy = false;
    sendBtn.disabled = false;
    scrollDown();
    input.focus();
  }

  const clearBtn = el('button', { class: 'btn ghost sm', onclick: () => confirmModal('Clear the whole conversation history?', async () => {
    await del('/ai/history');
    toast('Conversation cleared');
    navigate('ai');
    location.reload();
  }) }, 'Clear chat');

  setTimeout(scrollDown, 60);

  return el('div', {},
    el('div', { class: 'page-head', style: { marginBottom: '12px' } },
      el('div', {}, el('h2', {}, 'AI Assistant'),
        el('p', {}, 'Free & unlimited — switch models or attach files right from the composer')),
      el('div', { class: 'page-actions' }, el('span', { class: 'badge green' }, 'Free · Unlimited'), clearBtn)),
    el('div', { class: 'chat-wrap' },
      scroll,
      el('div', { class: 'chat-input' },
        fileChips,
        el('div', { class: 'chat-input-row' },
          fileInput,
          el('div', { class: 'chat-tools' }, attachBtn, modelSelect),
          input,
          sendBtn))));
}

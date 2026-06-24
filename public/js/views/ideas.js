import { get, post, put, del } from '../api.js';
import { el, icon, icons, formModal, confirmModal, toast } from '../ui.js';

const COLORS = ['#f59e0b', '#10b981', '#6366f1', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444'];

export default async function ideasView() {
  let ideas = await get('/ideas');
  let query = '';
  const gridEl = el('div', { class: 'grid cols-3' });

  const fields = () => [
    { key: 'title', label: 'Title', placeholder: 'Name your idea' },
    { key: 'content', label: 'Brain dump', type: 'textarea', rows: 7, placeholder: 'Write freely — thoughts, sketches, anything…' },
    { key: 'tags', label: 'Tags (comma separated)', placeholder: 'app, business, weekend', half: true },
    { key: 'color', label: 'Color', type: 'select', options: COLORS.map(c => ({ value: c, label: c })), default: COLORS[Math.floor(Math.random() * COLORS.length)], half: true },
  ];

  const refresh = async () => { ideas = await get('/ideas'); render(); };

  const addIdea = () => formModal({
    title: 'New brainstorm', fields: fields(), submitLabel: 'Save idea', wide: true,
    onSubmit: async (v) => {
      if (!v.title.trim()) throw new Error('Title is required');
      await post('/ideas', v); await refresh(); toast('Idea captured 💡');
    },
  });

  const editIdea = (i) => formModal({
    title: 'Edit idea', fields: fields(), values: i, wide: true,
    onSubmit: async (v) => { await put(`/ideas/${i.id}`, v); await refresh(); toast('Idea updated'); },
  });

  function render() {
    const shown = ideas.filter(i => !query ||
      i.title.toLowerCase().includes(query) || (i.content || '').toLowerCase().includes(query) || (i.tags || '').toLowerCase().includes(query));
    gridEl.innerHTML = '';
    if (!shown.length) {
      gridEl.append(el('div', { class: 'empty', style: { gridColumn: '1 / -1' } },
        el('div', { class: 'big' }, '💡'), query ? 'No ideas match your search.' : 'Empty canvas. Capture your first idea!'));
      return;
    }
    for (const i of shown) {
      const pinBtn = el('button', { class: 'icon-btn', title: i.pinned ? 'Unpin' : 'Pin', style: i.pinned ? { color: 'var(--amber)' } : {}, onclick: async () => { await put(`/ideas/${i.id}`, { pinned: i.pinned ? 0 : 1 }); refresh(); } });
      pinBtn.innerHTML = icons.pin;
      const editBtn = el('button', { class: 'icon-btn', onclick: () => editIdea(i) }); editBtn.innerHTML = icons.edit;
      const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete "${i.title}"?`, async () => { await del(`/ideas/${i.id}`); refresh(); }) });
      delBtn.innerHTML = icons.trash;
      gridEl.append(el('div', { class: 'card', style: { borderLeft: `3px solid ${i.color}`, display: 'flex', flexDirection: 'column', gap: '8px' } },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '6px', alignItems: 'flex-start' } },
          el('b', { style: { fontSize: '14.5px' } }, (i.pinned ? '📌 ' : '') + i.title),
          el('div', { style: { display: 'flex' } }, pinBtn, editBtn, delBtn)),
        i.content ? el('p', { style: { color: 'var(--text-dim)', fontSize: '13px', whiteSpace: 'pre-wrap', maxHeight: '150px', overflow: 'hidden' } },
          i.content.length > 400 ? i.content.slice(0, 400) + '…' : i.content) : null,
        i.tags ? el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 'auto' } },
          i.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => el('span', { class: 'badge' }, '#' + t))) : null,
      ));
    }
  }
  render();

  const search = el('input', { placeholder: 'Search ideas…', oninput: (e) => { query = e.target.value.toLowerCase(); render(); } });

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Brainstorming'), el('p', {}, 'A wall for your raw thoughts and ideas')),
      el('div', { class: 'page-actions' },
        el('div', { class: 'searchbar' }, icon('search'), search),
        el('button', { class: 'btn', onclick: addIdea }, icon('plus'), 'New idea'))),
    gridEl);
}

import { get, post, put, del } from '../api.js';
import { el, icon, icons, formModal, confirmModal, toast, todayStr, fmtDate, daysUntil } from '../ui.js';

export default async function tasksView() {
  let tasks = await get('/tasks');
  let filter = 'upcoming'; // upcoming | today | all | done

  const listEl = el('div', {});

  function taskFields(values = {}) {
    return [
      { key: 'title', label: 'Task', placeholder: 'What needs to be done?' },
      { key: 'date', label: 'Date', type: 'date', default: todayStr(), half: true },
      { key: 'time', label: 'Time (optional)', type: 'time', half: true },
      { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high'], default: 'medium', half: true },
      { key: 'status', label: 'Status', type: 'select', options: ['pending', 'in-progress', 'done'], default: 'pending', half: true },
      { key: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
    ];
  }

  const addTask = () => formModal({
    title: 'New task',
    fields: taskFields(),
    submitLabel: 'Add task',
    onSubmit: async (v) => {
      if (!v.title.trim()) throw new Error('Title is required');
      if (!v.date) throw new Error('Date is required');
      await post('/tasks', v);
      tasks = await get('/tasks');
      render();
      toast('Task added');
    },
  });

  const editTask = (t) => formModal({
    title: 'Edit task',
    fields: taskFields(),
    values: t,
    onSubmit: async (v) => {
      await put(`/tasks/${t.id}`, v);
      tasks = await get('/tasks');
      render();
      toast('Task updated');
    },
  });

  function render() {
    const today = todayStr();
    let shown = tasks;
    if (filter === 'today') shown = tasks.filter(t => t.date === today);
    else if (filter === 'upcoming') shown = tasks.filter(t => t.status !== 'done' || t.date >= today);
    else if (filter === 'done') shown = tasks.filter(t => t.status === 'done');

    // group by date
    const groups = {};
    for (const t of shown) (groups[t.date] ||= []).push(t);
    const dates = Object.keys(groups).sort();

    listEl.innerHTML = '';
    if (!shown.length) {
      listEl.append(el('div', { class: 'empty' }, el('div', { class: 'big' }, '📝'), 'No tasks here. Add your first task!'));
      return;
    }
    for (const date of dates) {
      const diff = daysUntil(date);
      const label = date === today ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : fmtDate(date);
      listEl.append(el('div', { style: { margin: '18px 0 8px', display: 'flex', alignItems: 'center', gap: '10px' } },
        el('b', { style: { fontSize: '13px' } }, label),
        diff < 0 && groups[date].some(t => t.status !== 'done') ? el('span', { class: 'badge red' }, 'overdue') : null,
        el('span', { class: 'muted' }, `${groups[date].filter(t => t.status === 'done').length}/${groups[date].length} done`),
      ));
      listEl.append(el('div', { class: 'stack' }, groups[date].map(row)));
    }
  }

  function row(t) {
    const checkBtn = el('button', {
      class: `check${t.status === 'done' ? ' on' : ''}`,
      onclick: async () => {
        t.status = t.status === 'done' ? 'pending' : 'done';
        await put(`/tasks/${t.id}`, { status: t.status });
        render();
      },
    });
    checkBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
    const editBtn = el('button', { class: 'icon-btn', onclick: () => editTask(t) }); editBtn.innerHTML = icons.edit;
    const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete task "${t.title}"?`, async () => { await del(`/tasks/${t.id}`); tasks = tasks.filter(x => x.id !== t.id); render(); }) });
    delBtn.innerHTML = icons.trash;
    return el('div', { class: `list-row${t.status === 'done' ? ' done' : ''}` },
      checkBtn,
      el('div', { class: 'grow' },
        el('div', { class: 'title' }, t.title),
        (t.time || t.notes) ? el('div', { class: 'sub' }, [t.time && '🕐 ' + t.time, t.notes].filter(Boolean).join(' · ')) : null),
      t.status === 'in-progress' ? el('span', { class: 'badge cyan' }, 'in progress') : null,
      el('span', { class: `badge ${t.priority === 'high' ? 'red' : t.priority === 'low' ? '' : 'amber'}` }, t.priority),
      el('div', { class: 'row-actions' }, editBtn, delBtn));
  }

  const tabs = el('div', { class: 'tabs' },
    ['upcoming', 'today', 'all', 'done'].map(f =>
      el('button', { class: `tab${f === filter ? ' active' : ''}`, onclick: (e) => {
        filter = f;
        tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        render();
      } }, f[0].toUpperCase() + f.slice(1))));

  render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Daily Tasks'), el('p', {}, 'Plan your days, check things off')),
      el('div', { class: 'page-actions' }, tabs,
        el('button', { class: 'btn', onclick: addTask }, icon('plus'), 'New task'))),
    listEl);
}

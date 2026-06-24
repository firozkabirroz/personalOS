import { get, post, put, del } from '../api.js';
import { el, icon, icons, formModal, confirmModal, toast, fmtDate, daysUntil } from '../ui.js';

const STATUSES = ['idea', 'researching', 'committed', 'started', 'dropped'];
const BADGE = { idea: '', researching: 'cyan', committed: 'accent', started: 'green', dropped: 'red' };

export default async function plansView() {
  let plans = await get('/plans');
  const listEl = el('div', { class: 'stack' });

  const fields = () => [
    { key: 'title', label: 'Plan', placeholder: 'e.g. Launch a YouTube channel' },
    { key: 'details', label: 'Details', type: 'textarea', rows: 4 },
    { key: 'estimate_date', label: 'Estimated date', type: 'date', half: true },
    { key: 'status', label: 'Status', type: 'select', options: STATUSES, default: 'idea', half: true },
  ];

  const refresh = async () => { plans = await get('/plans'); render(); };

  const addPlan = () => formModal({
    title: 'New plan', fields: fields(), submitLabel: 'Add plan',
    onSubmit: async (v) => {
      if (!v.title.trim()) throw new Error('Title is required');
      await post('/plans', v); await refresh(); toast('Plan added');
    },
  });

  const editPlan = (p) => formModal({
    title: 'Edit plan', fields: fields(), values: p,
    onSubmit: async (v) => { await put(`/plans/${p.id}`, v); await refresh(); toast('Plan updated'); },
  });

  function render() {
    listEl.innerHTML = '';
    if (!plans.length) {
      listEl.append(el('div', { class: 'empty' }, el('div', { class: 'big' }, '🧭'), 'No future plans yet. What\'s next for you?'));
      return;
    }
    for (const p of plans) {
      const left = daysUntil(p.estimate_date);
      const editBtn = el('button', { class: 'icon-btn', onclick: () => editPlan(p) }); editBtn.innerHTML = icons.edit;
      const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete plan "${p.title}"?`, async () => { await del(`/plans/${p.id}`); refresh(); }) });
      delBtn.innerHTML = icons.trash;
      const promote = p.status !== 'dropped' && el('button', {
        class: 'btn ghost sm', title: 'Convert into an upcoming project',
        onclick: async () => {
          await post('/projects', { name: p.title, description: p.details, status: 'upcoming', start_date: p.estimate_date });
          await put(`/plans/${p.id}`, { status: 'started' });
          toast('Converted to upcoming project');
          refresh();
        },
      }, '→ Make project');
      listEl.append(el('div', { class: 'list-row' },
        el('div', { class: 'grow' },
          el('div', { class: 'title' }, p.title),
          el('div', { class: 'sub' },
            'Est. ' + fmtDate(p.estimate_date) +
            (left !== null && p.status !== 'dropped' ? (left >= 0 ? ` · in ${left} days` : ` · ${-left} days ago`) : '') +
            (p.details ? ' — ' + p.details.slice(0, 90) : ''))),
        el('span', { class: `badge ${BADGE[p.status] || ''}` }, p.status),
        promote,
        el('div', { class: 'row-actions' }, editBtn, delBtn)));
    }
  }
  render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Next Plans'), el('p', {}, 'Future ideas with estimated dates — promote them to projects when ready')),
      el('div', { class: 'page-actions' }, el('button', { class: 'btn', onclick: addPlan }, icon('plus'), 'New plan'))),
    listEl);
}

import { get, post, put, del } from '../api.js';
import { el, icon, icons, formModal, confirmModal, toast, fmtDate, fmtMoney, daysUntil, todayStr } from '../ui.js';

const STATUSES = ['planning', 'booked', 'ongoing', 'completed'];
const BADGE = { planning: 'amber', booked: 'accent', ongoing: 'green', completed: '' };

export default async function travelView() {
  let trips = await get('/trips');
  let items = await get('/trip_items');
  const settings = await get('/settings');
  const cur = settings.currency || '$';
  const wrap = el('div', { class: 'grid cols-2' });

  const fields = () => [
    { key: 'destination', label: 'Destination', placeholder: 'e.g. Cox\'s Bazar' },
    { key: 'start_date', label: 'Start date', type: 'date', half: true },
    { key: 'end_date', label: 'End date', type: 'date', half: true },
    { key: 'budget', label: `Budget (${cur})`, type: 'number', min: 0, half: true },
    { key: 'status', label: 'Status', type: 'select', options: STATUSES, default: 'planning', half: true },
    { key: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
  ];

  const refresh = async () => { trips = await get('/trips'); items = await get('/trip_items'); render(); };

  const addTrip = () => formModal({
    title: 'Plan a trip', fields: fields(), submitLabel: 'Create trip',
    onSubmit: async (v) => {
      if (!v.destination.trim()) throw new Error('Destination is required');
      v.budget = Number(v.budget) || 0;
      await post('/trips', v); await refresh(); toast('Trip created ✈️');
    },
  });

  const editTrip = (t) => formModal({
    title: 'Edit trip', fields: fields(), values: t,
    onSubmit: async (v) => { v.budget = Number(v.budget) || 0; await put(`/trips/${t.id}`, v); await refresh(); toast('Trip updated'); },
  });

  function tripCard(t) {
    const tripItems = items.filter(i => i.trip_id === t.id);
    const checklist = tripItems.filter(i => i.type === 'checklist');
    const itinerary = tripItems.filter(i => i.type === 'itinerary').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const doneCount = checklist.filter(i => i.done).length;
    const until = daysUntil(t.start_date);

    const editBtn = el('button', { class: 'icon-btn', onclick: () => editTrip(t) }); editBtn.innerHTML = icons.edit;
    const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete trip to "${t.destination}"?`, async () => { await del(`/trips/${t.id}`); refresh(); }) });
    delBtn.innerHTML = icons.trash;

    const newItem = el('input', { placeholder: '+ Add checklist item (Enter)', style: { fontSize: '12.5px' } });
    newItem.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && newItem.value.trim()) {
        await post('/trip_items', { trip_id: t.id, type: 'checklist', content: newItem.value.trim() });
        await refresh();
      }
    });
    const newIt = el('input', { placeholder: '+ Add itinerary stop (Enter)', style: { fontSize: '12.5px' } });
    const newItDate = el('input', { type: 'date', style: { fontSize: '12.5px', width: '135px' } });
    newIt.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && newIt.value.trim()) {
        await post('/trip_items', { trip_id: t.id, type: 'itinerary', content: newIt.value.trim(), date: newItDate.value || '' });
        await refresh();
      }
    });

    return el('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
        el('div', {},
          el('b', { style: { fontSize: '16px' } }, '✈️ ' + t.destination),
          el('div', { class: 'muted' }, `${fmtDate(t.start_date)} → ${fmtDate(t.end_date)}` +
            (until !== null && until >= 0 && t.status !== 'completed' ? ` · in ${until} days` : ''))),
        el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
          el('span', { class: `badge ${BADGE[t.status]}` }, t.status), editBtn, delBtn)),
      t.budget ? el('div', {}, el('span', { class: 'badge green' }, 'Budget: ' + fmtMoney(t.budget, cur))) : null,
      t.notes ? el('p', { style: { color: 'var(--text-dim)', fontSize: '13px' } }, t.notes) : null,

      el('div', {},
        el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' } },
          el('b', { style: { fontSize: '12.5px' } }, '🧳 Packing / To-do'),
          checklist.length ? el('span', { class: 'muted' }, `${doneCount}/${checklist.length}`) : null),
        el('div', { class: 'stack', style: { gap: '4px' } },
          checklist.map(i => {
            const cb = el('button', { class: `check${i.done ? ' on' : ''}`, style: { width: '17px', height: '17px' },
              onclick: async () => { await put(`/trip_items/${i.id}`, { done: i.done ? 0 : 1 }); refresh(); } });
            cb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
            const rm = el('button', { class: 'icon-btn', onclick: async () => { await del(`/trip_items/${i.id}`); refresh(); } });
            rm.innerHTML = icons.x;
            return el('div', { style: { display: 'flex', alignItems: 'center', gap: '9px', fontSize: '13px' } },
              cb, el('span', { style: i.done ? { textDecoration: 'line-through', color: 'var(--text-faint)' } : {} }, i.content),
              el('span', { class: 'row-actions', style: { marginLeft: 'auto' } }, rm));
          }),
          el('div', { class: 'field', style: { marginTop: '4px' } }, newItem))),

      el('div', {},
        el('b', { style: { fontSize: '12.5px', display: 'block', marginBottom: '6px' } }, '🗺️ Itinerary'),
        el('div', { class: 'stack', style: { gap: '4px' } },
          itinerary.map(i => {
            const rm = el('button', { class: 'icon-btn', onclick: async () => { await del(`/trip_items/${i.id}`); refresh(); } });
            rm.innerHTML = icons.x;
            return el('div', { style: { display: 'flex', alignItems: 'center', gap: '9px', fontSize: '13px' } },
              el('span', { class: 'badge cyan' }, i.date ? fmtDate(i.date) : 'TBD'),
              el('span', {}, i.content),
              el('span', { class: 'row-actions', style: { marginLeft: 'auto' } }, rm));
          }),
          el('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } },
            el('div', { class: 'field', style: { flex: 1 } }, newIt),
            el('div', { class: 'field' }, newItDate)))),
    );
  }

  function render() {
    wrap.innerHTML = '';
    if (!trips.length) {
      wrap.append(el('div', { class: 'empty', style: { gridColumn: '1 / -1' } },
        el('div', { class: 'big' }, '🌍'), 'No trips planned. Where to next?'));
      return;
    }
    trips.forEach(t => wrap.append(tripCard(t)));
  }
  render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Travel Planner'), el('p', {}, 'Trips with budgets, packing lists and itineraries')),
      el('div', { class: 'page-actions' }, el('button', { class: 'btn', onclick: addTrip }, icon('plus'), 'Plan trip'))),
    wrap);
}

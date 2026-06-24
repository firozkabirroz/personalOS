import { get, post, del } from '../api.js';
import { el, icon, icons, formModal, modal, confirmModal, toast, todayStr, fmtDate } from '../ui.js';

export default async function calendarView() {
  let events = await get('/events');
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-based

  const gridEl = el('div', {});
  const titleEl = el('b', { style: { fontSize: '15px', minWidth: '150px', textAlign: 'center', display: 'inline-block' } });

  const refresh = async () => { events = await get('/events'); render(); };

  const addEvent = (date) => formModal({
    title: 'New event',
    fields: [
      { key: 'title', label: 'Event', placeholder: 'e.g. Team meeting' },
      { key: 'date', label: 'Date', type: 'date', default: date || todayStr(), half: true },
      { key: 'start_time', label: 'Start time', type: 'time', half: true },
      { key: 'end_time', label: 'End time', type: 'time', half: true },
      { key: 'notes', label: 'Notes / location', half: true },
    ],
    submitLabel: 'Add event',
    onSubmit: async (v) => {
      if (!v.title.trim()) throw new Error('Title is required');
      if (!v.date) throw new Error('Date is required');
      await post('/events', v); await refresh(); toast('Event added');
    },
  });

  function dayModal(dateStr, dayEvents) {
    const close = modal({
      title: fmtDate(dateStr),
      body: [
        dayEvents.length
          ? el('div', { class: 'stack' }, dayEvents.map(e => {
              const delBtn = e.source !== 'google' && el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete "${e.title}"?`, async () => { await del(`/events/${e.id}`); close(); refresh(); }) });
              if (delBtn) delBtn.innerHTML = icons.trash;
              return el('div', { class: 'list-row' },
                el('div', { class: 'grow' },
                  el('div', { class: 'title' }, e.title),
                  el('div', { class: 'sub' }, [e.start_time, e.end_time && '→ ' + e.end_time, e.notes].filter(Boolean).join(' '))),
                e.source === 'google' ? el('span', { class: 'badge cyan' }, 'Google') : null,
                delBtn || null);
            }))
          : el('p', { class: 'muted' }, 'No events on this day.'),
      ],
      footer: [el('button', { class: 'btn', onclick: () => { close(); addEvent(dateStr); } }, '+ Add event')],
    });
  }

  function render() {
    titleEl.textContent = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const first = new Date(year, month, 1);
    const startDow = first.getDay(); // 0 Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = todayStr();

    const byDate = {};
    for (const e of events) (byDate[e.date] ||= []).push(e);

    const cells = [el('div', { class: 'cal-grid' },
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => el('div', { class: 'cal-dow' }, d)))];
    const grid = el('div', { class: 'cal-grid' });

    // leading cells from previous month
    const prevDays = new Date(year, month, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      grid.append(el('div', { class: 'cal-cell other' }, el('div', { class: 'd' }, prevDays - i)));
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = (byDate[dateStr] || []).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
      grid.append(el('div', { class: `cal-cell${dateStr === today ? ' today' : ''}`, onclick: () => dayModal(dateStr, dayEvents) },
        el('div', { class: 'd' }, day),
        dayEvents.slice(0, 3).map(e => el('div', { class: `cal-ev${e.source === 'google' ? ' google' : ''}` },
          (e.start_time ? e.start_time + ' ' : '') + e.title)),
        dayEvents.length > 3 ? el('div', { class: 'muted', style: { fontSize: '10px' } }, `+${dayEvents.length - 3} more`) : null));
    }
    // trailing
    const total = startDow + daysInMonth;
    for (let i = 0; i < (7 - (total % 7)) % 7; i++) {
      grid.append(el('div', { class: 'cal-cell other' }, el('div', { class: 'd' }, i + 1)));
    }
    cells.push(grid);
    gridEl.innerHTML = '';
    gridEl.append(...cells);
  }
  render();

  const prevBtn = el('button', { class: 'btn ghost sm', onclick: () => { month--; if (month < 0) { month = 11; year--; } render(); } });
  prevBtn.innerHTML = icons.chevL;
  const nextBtn = el('button', { class: 'btn ghost sm', onclick: () => { month++; if (month > 11) { month = 0; year++; } render(); } });
  nextBtn.innerHTML = icons.chevR;

  const syncBtn = el('button', { class: 'btn ghost', onclick: async () => {
    syncBtn.disabled = true;
    try {
      const r = await post('/google/calendar/sync');
      toast(`Synced ${r.imported} events from Google Calendar ✓`);
      await refresh();
    } catch (e) { toast(e.message, 'err'); }
    syncBtn.disabled = false;
  } }, icon('sync'), 'Sync Google');

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Calendar'), el('p', {}, 'Your events plus Google Calendar in one view')),
      el('div', { class: 'page-actions' },
        prevBtn, titleEl, nextBtn,
        syncBtn,
        el('button', { class: 'btn', onclick: () => addEvent() }, icon('plus'), 'New event'))),
    gridEl);
}

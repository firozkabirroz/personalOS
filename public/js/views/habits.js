import { get, post, put, del } from '../api.js';
import { el, icon, icons, formModal, confirmModal, toast, todayStr, dstr } from '../ui.js';

const ICONS = ['✅', '💪', '📖', '🧘', '💧', '🏃', '😴', '🥗', '✍️', '🎸', '🧠', '🚭'];
const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6'];
const DAYS_SHOWN = 14;

export default async function habitsView() {
  let habits = await get('/habits?archived=0');
  const from = dateOffset(-DAYS_SHOWN + 1);
  let logs = await get(`/habit_logs?from=${from}`);
  const wrap = el('div', { class: 'stack', style: { gap: '14px' } });

  function dateOffset(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return dstr(d);
  }

  const refresh = async () => {
    habits = await get('/habits?archived=0');
    logs = await get(`/habit_logs?from=${from}`);
    render();
  };

  const addHabit = () => formModal({
    title: 'New habit',
    fields: [
      { key: 'name', label: 'Habit', placeholder: 'e.g. Read 20 minutes' },
      { key: 'icon', label: 'Icon', type: 'select', options: ICONS, default: '✅', half: true },
      { key: 'color', label: 'Color', type: 'select', options: COLORS.map(c => ({ value: c, label: c })), default: COLORS[0], half: true },
    ],
    submitLabel: 'Create habit',
    onSubmit: async (v) => {
      if (!v.name.trim()) throw new Error('Name is required');
      await post('/habits', v); await refresh(); toast('Habit created');
    },
  });

  function streak(habitId) {
    const set = new Set(logs.filter(l => l.habit_id === habitId).map(l => l.date));
    let s = 0;
    let day = todayStr();
    // streak counts back from today (or yesterday if today not done yet)
    if (!set.has(day)) day = dateOffset(-1);
    while (set.has(day)) {
      s++;
      const d = new Date(day + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      day = dstr(d);
    }
    return s;
  }

  function render() {
    wrap.innerHTML = '';
    if (!habits.length) {
      wrap.append(el('div', { class: 'empty' }, el('div', { class: 'big' }, '🔥'), 'No habits yet. Small habits, big results — add one!'));
      return;
    }
    const days = Array.from({ length: DAYS_SHOWN }, (_, i) => dateOffset(i - DAYS_SHOWN + 1));

    for (const h of habits) {
      const logSet = new Set(logs.filter(l => l.habit_id === h.id).map(l => l.date));
      const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete habit "${h.name}" and its history?`, async () => { await del(`/habits/${h.id}`); refresh(); }) });
      delBtn.innerHTML = icons.trash;
      const s = streak(h.id);

      const dots = el('div', { class: 'habit-grid' }, days.map(d => {
        const on = logSet.has(d);
        const dot = el('button', {
          class: `habit-dot${on ? ' on' : ''}`,
          title: d,
          style: on ? { background: h.color, borderColor: h.color } : {},
          onclick: async () => {
            const r = await post('/habit_logs/toggle', { habit_id: h.id, date: d });
            if (r.done) { logs.push({ habit_id: h.id, date: d }); }
            else { logs = logs.filter(l => !(l.habit_id === h.id && l.date === d)); }
            render();
          },
        }, String(new Date(d + 'T00:00:00').getDate()));
        return dot;
      }));

      wrap.append(el('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' } },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px', flex: '1' } },
          el('span', { style: { fontSize: '24px' } }, h.icon),
          el('div', {},
            el('b', { style: { fontSize: '14.5px' } }, h.name),
            el('div', { class: 'muted' }, s > 0 ? `🔥 ${s}-day streak` : 'No streak yet')),
        ),
        dots,
        delBtn));
    }
    wrap.append(el('p', { class: 'muted', style: { textAlign: 'center' } }, `Showing the last ${DAYS_SHOWN} days — click a square to toggle`));
  }
  render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Habit Tracker'), el('p', {}, 'Build streaks, one day at a time')),
      el('div', { class: 'page-actions' }, el('button', { class: 'btn', onclick: addHabit }, icon('plus'), 'New habit'))),
    wrap);
}

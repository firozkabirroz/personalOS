import { get, post, put } from '../api.js';
import { el, icon, icons, fmtDate, fmtMoney, daysUntil, todayStr, countUp } from '../ui.js';
import { navigate } from '../app.js';

export default async function dashboard() {
  const [d, settings] = await Promise.all([
    get('/dashboard?date=' + todayStr()),
    get('/settings'),
  ]);
  const cur = settings.currency || '$';

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5) return 'Good night';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const pendingToday = d.tasksToday.filter(t => t.status !== 'done').length;
  const habitsDone = d.habits.filter(h => h.done_today).length;

  const wrap = el('div', {},
    el('div', { class: 'page-head' },
      el('div', {},
        el('h2', {}, `${greeting} 👋`),
        el('p', {}, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })),
      ),
    ),

    // Stat row
    el('div', { class: 'grid cols-4', style: { marginBottom: '16px' } },
      statCard({ label: 'Tasks today', num: pendingToday, suffix: ' pending', hint: d.overdueTasks ? `${d.overdueTasks} overdue` : 'Nothing overdue 🎉', ic: 'tasks', color: 'indigo', onclick: () => navigate('tasks') }),
      statCard({ label: 'Running projects', num: d.runningProjects.length, hint: `${d.upcomingProjects.length} upcoming`, ic: 'running', color: 'cyan', onclick: () => navigate('running') }),
      statCard({ label: 'Spent this month', num: d.monthExpenses, prefix: cur + ' ', decimals: 2,
        hint: d.monthIncome ? `Balance: ${fmtMoney(d.monthIncome - d.monthExpenses, cur)}` : 'Expense tracker',
        ic: 'expense', color: 'amber', onclick: () => navigate('expenses') }),
      statCard({ label: 'Habits today', num: habitsDone, suffix: `/${d.habits.length}`, hint: habitsDone === d.habits.length && d.habits.length ? 'All done! 🔥' : 'Keep going', ic: 'habit', color: 'green', onclick: () => navigate('habits') }),
    ),

    el('div', { class: 'grid cols-2' },
      // Today's tasks
      el('div', { class: 'card' },
        el('h3', {}, icon('tasks'), "Today's tasks"),
        d.tasksToday.length
          ? el('div', { class: 'stack' }, d.tasksToday.slice(0, 7).map(t => taskRow(t)))
          : el('div', { class: 'muted' }, 'No tasks scheduled for today. ',
              el('a', { style: { cursor: 'pointer' }, onclick: () => navigate('tasks') }, 'Add one →')),
      ),

      // Running projects
      el('div', { class: 'card' },
        el('h3', {}, icon('running'), 'Running projects'),
        d.runningProjects.length
          ? el('div', { class: 'stack' }, d.runningProjects.map(p => {
              const left = daysUntil(p.end_date);
              return el('div', { style: { padding: '4px 0' } },
                el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '5px' } },
                  el('b', { style: { fontSize: '13.5px' } }, p.name),
                  el('span', { class: `badge ${left !== null && left < 7 ? 'red' : 'accent'}` },
                    left === null ? 'no deadline' : left < 0 ? `${-left}d overdue` : `${left}d left`),
                ),
                el('div', { class: 'progress' }, el('div', { style: { width: `${p.progress}%`, background: p.color } })),
              );
            }))
          : el('div', { class: 'muted' }, 'No running projects.'),
      ),

      // Calendar / events
      el('div', { class: 'card' },
        el('h3', {}, icon('calendar'), 'Schedule'),
        (d.eventsToday.length || d.upcomingEvents.length)
          ? el('div', { class: 'stack' },
              d.eventsToday.map(e => evRow(e, true)),
              d.upcomingEvents.slice(0, 4).map(e => evRow(e, false)),
            )
          : el('div', { class: 'muted' }, 'No upcoming events. Sync Google Calendar in Settings or add events in Calendar.'),
      ),

      // Plans & misc
      el('div', { class: 'card' },
        el('h3', {}, icon('plan'), 'Next plans'),
        d.plans.length
          ? el('div', { class: 'stack' }, d.plans.map(p =>
              el('div', { class: 'list-row' },
                el('div', { class: 'grow' },
                  el('div', { class: 'title' }, p.title),
                  el('div', { class: 'sub' }, 'Est. ' + fmtDate(p.estimate_date))),
                el('span', { class: 'badge purple' }, p.status))))
          : el('div', { class: 'muted' }, 'Nothing planned yet.'),
        d.activeTrip ? el('div', { style: { marginTop: '12px' } },
          el('div', { class: 'divider' }),
          el('div', { class: 'list-row', style: { marginTop: '10px' } },
            el('span', { style: { fontSize: '18px' } }, '✈️'),
            el('div', { class: 'grow' },
              el('div', { class: 'title' }, 'Trip: ' + d.activeTrip.destination),
              el('div', { class: 'sub' }, `${fmtDate(d.activeTrip.start_date)} → ${fmtDate(d.activeTrip.end_date)}`)),
            el('span', { class: 'badge cyan' }, d.activeTrip.status))) : null,
      ),
    ),
  );

  function statCard({ label, num, prefix = '', suffix = '', decimals = 0, hint, ic, color = 'indigo', onclick }) {
    const tile = el('div', { class: `stat-ic ${color}` });
    tile.innerHTML = icons[ic] || '';
    const value = el('div', { class: 'value' }, prefix + '0' + suffix);
    requestAnimationFrame(() => countUp(value, num, { prefix, suffix, decimals }));
    return el('div', { class: 'card stat-card lift', onclick },
      tile,
      el('div', { class: 'label' }, label),
      value,
      el('div', { class: 'hint' }, hint));
  }

  function taskRow(t) {
    const checkBtn = el('button', {
      class: `check${t.status === 'done' ? ' on' : ''}`,
      onclick: async () => {
        const next = t.status === 'done' ? 'pending' : 'done';
        await put(`/tasks/${t.id}`, { status: next });
        t.status = next;
        checkBtn.classList.toggle('on');
        row.classList.toggle('done');
      },
    });
    checkBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
    const row = el('div', { class: `list-row${t.status === 'done' ? ' done' : ''}` },
      checkBtn,
      el('div', { class: 'grow' },
        el('div', { class: 'title' }, t.title),
        t.time ? el('div', { class: 'sub' }, '🕐 ' + t.time) : null),
      el('span', { class: `badge ${t.priority === 'high' ? 'red' : t.priority === 'low' ? '' : 'amber'}` }, t.priority));
    return row;
  }

  function evRow(e, isToday) {
    return el('div', { class: 'list-row' },
      el('div', { class: 'grow' },
        el('div', { class: 'title' }, e.title),
        el('div', { class: 'sub' }, (isToday ? 'Today' : fmtDate(e.date)) + (e.start_time ? ' · ' + e.start_time : ''))),
      e.source === 'google' ? el('span', { class: 'badge cyan' }, 'Google') : null);
  }

  return wrap;
}

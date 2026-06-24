import { get, post, del } from '../api.js';
import { el, icon, icons, modal, confirmModal, toast, todayStr, fmtDate, lineChart } from '../ui.js';

const MOODS = ['😞', '😕', '😐', '🙂', '😄'];

export default async function healthView() {
  let entries = await get('/health'); // newest first
  const content = el('div', {});

  const refresh = async () => { entries = await get('/health'); render(); };

  function logModal() {
    const today = todayStr();
    const existing = entries.find(e => e.date === today) || {};
    const date = el('input', { type: 'date' }); date.value = today;
    const weight = el('input', { type: 'number', step: '0.1', placeholder: 'kg' }); weight.value = existing.weight ?? '';
    const sleep = el('input', { type: 'number', step: '0.5', placeholder: 'hours' }); sleep.value = existing.sleep_hours ?? '';
    const water = el('input', { type: 'number', placeholder: 'glasses' }); water.value = existing.water_glasses ?? '';
    const steps = el('input', { type: 'number', placeholder: 'steps' }); steps.value = existing.steps ?? '';
    const notes = el('input', { type: 'text', placeholder: 'How are you feeling?' }); notes.value = existing.notes ?? '';
    let mood = existing.mood ?? null;
    const moodRow = el('div', { class: 'mood-row' }, MOODS.map((m, i) =>
      el('button', { class: mood === i + 1 ? 'sel' : '', onclick: (e) => {
        mood = i + 1;
        moodRow.querySelectorAll('button').forEach(b => b.classList.remove('sel'));
        e.target.classList.add('sel');
      } }, m)));

    date.addEventListener('change', () => {
      const ex = entries.find(e => e.date === date.value) || {};
      weight.value = ex.weight ?? ''; sleep.value = ex.sleep_hours ?? ''; water.value = ex.water_glasses ?? '';
      steps.value = ex.steps ?? ''; notes.value = ex.notes ?? ''; mood = ex.mood ?? null;
      moodRow.querySelectorAll('button').forEach((b, i) => b.classList.toggle('sel', mood === i + 1));
    });

    const close = modal({
      title: 'Log health entry',
      body: [
        el('div', { class: 'field' }, el('label', {}, 'Date'), date),
        el('div', { class: 'field-row' },
          el('div', { class: 'field' }, el('label', {}, 'Weight (kg)'), weight),
          el('div', { class: 'field' }, el('label', {}, 'Sleep (hours)'), sleep)),
        el('div', { class: 'field-row' },
          el('div', { class: 'field' }, el('label', {}, 'Water (glasses)'), water),
          el('div', { class: 'field' }, el('label', {}, 'Steps'), steps)),
        el('div', { class: 'field' }, el('label', {}, 'Mood'), moodRow),
        el('div', { class: 'field' }, el('label', {}, 'Notes'), notes),
      ],
      footer: [
        el('button', { class: 'btn ghost', onclick: () => close() }, 'Cancel'),
        el('button', { class: 'btn', onclick: async () => {
          try {
            await post('/health', {
              date: date.value,
              weight: weight.value ? Number(weight.value) : null,
              sleep_hours: sleep.value ? Number(sleep.value) : null,
              water_glasses: water.value ? Number(water.value) : null,
              steps: steps.value ? Number(steps.value) : null,
              mood, notes: notes.value,
            });
            close(); refresh(); toast('Health entry saved');
          } catch (e) { toast(e.message, 'err'); }
        } }, 'Save'),
      ],
    });
  }

  function metricCard(title, ic, key, unit, color) {
    const points = [...entries].reverse().slice(-30).map(e => ({ label: e.date, value: e[key] }));
    const latest = entries.find(e => e[key] !== null && e[key] !== undefined);
    return el('div', { class: 'card' },
      el('h3', {}, el('span', { style: { fontSize: '15px' } }, ic), title,
        latest ? el('span', { style: { marginLeft: 'auto', fontWeight: 700, color } }, `${latest[key]}${unit}`) : null),
      lineChart(points, { color }));
  }

  function render() {
    content.innerHTML = '';
    const latest = entries[0];
    content.append(
      el('div', { class: 'grid cols-2', style: { marginBottom: '16px' } },
        metricCard('Weight', '⚖️', 'weight', ' kg', '#6366f1'),
        metricCard('Sleep', '😴', 'sleep_hours', ' h', '#8b5cf6'),
        metricCard('Water', '💧', 'water_glasses', ' glasses', '#06b6d4'),
        metricCard('Steps', '🏃', 'steps', '', '#10b981'),
      ),
      el('div', { class: 'card' },
        el('h3', {}, icon('health'), 'Recent entries'),
        entries.length
          ? el('table', { class: 'data' },
              el('thead', {}, el('tr', {},
                el('th', {}, 'Date'), el('th', {}, 'Weight'), el('th', {}, 'Sleep'), el('th', {}, 'Water'),
                el('th', {}, 'Steps'), el('th', {}, 'Mood'), el('th', {}, 'Notes'), el('th', {}, ''))),
              el('tbody', {}, entries.slice(0, 14).map(e => {
                const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete entry for ${e.date}?`, async () => { await del(`/health/${e.id}`); refresh(); }) });
                delBtn.innerHTML = icons.trash;
                return el('tr', {},
                  el('td', {}, fmtDate(e.date)),
                  el('td', {}, e.weight ?? '—'),
                  el('td', {}, e.sleep_hours != null ? e.sleep_hours + 'h' : '—'),
                  el('td', {}, e.water_glasses ?? '—'),
                  el('td', {}, e.steps?.toLocaleString() ?? '—'),
                  el('td', { style: { fontSize: '17px' } }, e.mood ? MOODS[e.mood - 1] : '—'),
                  el('td', { class: 'muted' }, e.notes || ''),
                  el('td', {}, el('div', { class: 'row-actions' }, delBtn)));
              })))
          : el('div', { class: 'empty' }, el('div', { class: 'big' }, '🩺'), 'No health data yet. Log your first entry!')),
    );
  }
  render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Health Dashboard'), el('p', {}, 'Track weight, sleep, hydration, activity and mood')),
      el('div', { class: 'page-actions' }, el('button', { class: 'btn', onclick: logModal }, icon('plus'), "Log today"))),
    content);
}

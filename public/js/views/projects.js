import { get, post, put, del } from '../api.js';
import { el, icon, icons, formModal, confirmModal, toast, fmtDate, daysUntil } from '../ui.js';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899'];

export default async function projectsView(status = 'running') {
  let projects = await get(`/projects?status=${status}`);
  let items = await get('/project_items');
  const isRunning = status === 'running';
  const gridEl = el('div', { class: 'grid cols-2' });

  const fields = (hasItems = false) => [
    { key: 'name', label: 'Project name', placeholder: 'e.g. Website redesign' },
    { key: 'description', label: 'Description', type: 'textarea', rows: 3 },
    { key: 'start_date', label: 'Start date', type: 'date', half: true },
    { key: 'end_date', label: 'End date', type: 'date', half: true },
    { key: 'status', label: 'Status', type: 'select', options: ['running', 'upcoming', 'completed'], default: status, half: true },
    { key: 'progress', label: hasItems ? 'Progress % (auto from points)' : 'Progress (%)', type: 'number', min: 0, max: 100, default: 0, half: true },
    { key: 'color', label: 'Color', type: 'select', options: COLORS.map(c => ({ value: c, label: c })), default: COLORS[Math.floor(Math.random() * COLORS.length)] },
  ];

  const refresh = async () => {
    projects = await get(`/projects?status=${status}`);
    items = await get('/project_items');
    render();
  };

  const addProject = () => formModal({
    title: isRunning ? 'New running project' : 'New upcoming project',
    fields: fields(),
    submitLabel: 'Create project',
    onSubmit: async (v) => {
      if (!v.name.trim()) throw new Error('Name is required');
      v.progress = Number(v.progress) || 0;
      await post('/projects', v);
      await refresh();
      toast('Project created — now add its points below it');
    },
  });

  const editProject = (p) => formModal({
    title: 'Edit project',
    fields: fields(items.some(i => i.project_id === p.id)),
    values: p,
    onSubmit: async (v) => {
      v.progress = Number(v.progress) || 0;
      await put(`/projects/${p.id}`, v);
      await refresh();
      toast('Project updated');
    },
  });

  function card(p) {
    const pItems = items.filter(i => i.project_id === p.id);
    const doneCount = pItems.filter(i => i.done).length;
    const hasItems = pItems.length > 0;
    const left = daysUntil(isRunning ? p.end_date : p.start_date);

    const editBtn = el('button', { class: 'icon-btn', onclick: () => editProject(p) }); editBtn.innerHTML = icons.edit;
    const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete project "${p.name}" and all its points?`, async () => { await del(`/projects/${p.id}`); refresh(); }) });
    delBtn.innerHTML = icons.trash;

    // ---- points checklist ----
    const newPoint = el('input', { placeholder: '+ Add a point / step… (press Enter)', style: { fontSize: '13px' } });
    newPoint.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && newPoint.value.trim()) {
        const maxPos = pItems.reduce((m, i) => Math.max(m, i.position || 0), 0);
        await post('/project_items', { project_id: p.id, content: newPoint.value.trim(), position: maxPos + 1 });
        await refresh();
        // keep typing flow: refocus the same project's input after re-render
        setTimeout(() => {
          const inputs = gridEl.querySelectorAll(`input[data-proj="${p.id}"]`);
          if (inputs[0]) inputs[0].focus();
        }, 30);
      }
    });
    newPoint.setAttribute('data-proj', p.id);

    const pointRows = pItems.map(it => {
      const cb = el('button', {
        class: `check${it.done ? ' on' : ''}`, style: { width: '18px', height: '18px' },
        onclick: async () => {
          await put(`/project_items/${it.id}`, { done: it.done ? 0 : 1 });
          await refresh();
          if (!it.done) {
            const after = items.filter(i => i.project_id === p.id);
            if (after.length && after.every(i => i.done)) toast(`🎉 All points of "${p.name}" complete!`);
          }
        },
      });
      cb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
      const rm = el('button', { class: 'icon-btn', onclick: async () => { await del(`/project_items/${it.id}`); refresh(); } });
      rm.innerHTML = icons.x;
      return el('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '9px', fontSize: '13px', padding: '2px 0' } },
        cb,
        el('span', { style: { flex: 1, ...(it.done ? { textDecoration: 'line-through', color: 'var(--text-faint)' } : {}) } }, it.content),
        el('span', { class: 'row-actions' }, rm));
    });

    return el('div', { class: 'card', style: { borderTop: `3px solid ${p.color}`, display: 'flex', flexDirection: 'column', gap: '10px' } },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' } },
        el('b', { style: { fontSize: '15px' } }, p.name),
        el('div', { class: 'row-actions', style: { opacity: 1 } }, editBtn, delBtn)),
      p.description ? el('p', { style: { color: 'var(--text-dim)', fontSize: '13px', whiteSpace: 'pre-wrap' } }, p.description) : null,
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        el('span', { class: 'badge' }, `${fmtDate(p.start_date)} → ${fmtDate(p.end_date)}`),
        left !== null ? el('span', { class: `badge ${left < 0 ? 'red' : left < 7 ? 'amber' : 'green'}` },
          isRunning
            ? (left < 0 ? `${-left}d overdue` : `${left}d left`)
            : (left < 0 ? 'should have started' : `starts in ${left}d`)) : null,
        hasItems ? el('span', { class: 'badge accent' }, `${doneCount}/${pItems.length} points`) : null),

      el('div', {},
        el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '5px' } },
          el('span', {}, hasItems ? 'Progress (auto from points)' : 'Progress'),
          el('b', {}, p.progress + '%')),
        el('div', { class: 'progress' }, el('div', { style: { width: `${p.progress}%`, background: p.color } }))),

      el('div', {},
        el('b', { style: { fontSize: '12.5px', display: 'block', marginBottom: '6px' } }, '📋 Project points'),
        el('div', { class: 'stack', style: { gap: '2px' } },
          pointRows.length ? pointRows : el('span', { class: 'muted' }, 'Break the project into points — each one you complete moves the progress bar.'),
          el('div', { class: 'field', style: { marginTop: '6px' } }, newPoint))),

      !isRunning ? el('button', { class: 'btn ghost sm', style: { alignSelf: 'flex-start' }, onclick: async () => {
        await put(`/projects/${p.id}`, { status: 'running' });
        toast(`"${p.name}" moved to Running`);
        refresh();
      } }, '▶ Start project') : null,
      isRunning && p.progress >= 100 ? el('button', { class: 'btn success sm', style: { alignSelf: 'flex-start' }, onclick: async () => {
        await put(`/projects/${p.id}`, { status: 'completed' });
        toast(`"${p.name}" completed 🎉`);
        refresh();
      } }, '✓ Mark completed') : null,
    );
  }

  function render() {
    gridEl.innerHTML = '';
    if (!projects.length) {
      gridEl.append(el('div', { class: 'empty', style: { gridColumn: '1 / -1' } },
        el('div', { class: 'big' }, isRunning ? '🚀' : '📅'),
        isRunning ? 'No running projects. Create one or start an upcoming project.' : 'No upcoming projects planned.'));
      return;
    }
    projects.forEach(p => gridEl.append(card(p)));
  }
  render();

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {},
        el('h2', {}, isRunning ? 'Running Projects' : 'Upcoming Projects'),
        el('p', {}, isRunning ? 'Break each project into points — completing them fills the progress bar automatically' : 'Plan the points now, start when ready')),
      el('div', { class: 'page-actions' },
        el('button', { class: 'btn', onclick: addProject }, icon('plus'), 'New project'))),
    gridEl);
}

import { get, post, put, del, api, token } from '../api.js';
import { el, icon, icons, modal, confirmModal, toast, fmtBytes, fmtDate } from '../ui.js';

export default async function filesView() {
  let files = await get('/files');
  let projects = await get('/projects');
  let projectFilter = '';
  const tableWrap = el('div', { class: 'card', style: { padding: '8px 4px' } });

  const refresh = async () => { files = await get('/files'); render(); };

  function uploadModal() {
    const fileInput = el('input', { type: 'file', multiple: true });
    const projSelect = el('select', {},
      el('option', { value: '' }, '— No project (general storage) —'),
      projects.map(p => el('option', { value: p.id }, p.name)));
    const close = modal({
      title: 'Upload files',
      body: [
        el('div', { class: 'field' }, el('label', {}, 'Files (up to 20, max 100 MB each)'), fileInput),
        el('div', { class: 'field' }, el('label', {}, 'Attach to project'), projSelect),
      ],
      footer: [
        el('button', { class: 'btn ghost', onclick: () => close() }, 'Cancel'),
        el('button', { class: 'btn', onclick: async () => {
          if (!fileInput.files.length) return toast('Choose at least one file', 'err');
          const fd = new FormData();
          for (const f of fileInput.files) fd.append('files', f);
          if (projSelect.value) fd.append('project_id', projSelect.value);
          try {
            await api('/files', { method: 'POST', body: fd });
            close(); refresh(); toast(`Uploaded ${fileInput.files.length} file(s)`);
          } catch (e) { toast(e.message, 'err'); }
        } }, 'Upload'),
      ],
    });
  }

  function fileEmoji(mime, name) {
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.startsWith('video/')) return '🎬';
    if (mime.startsWith('audio/')) return '🎵';
    if (mime.includes('pdf')) return '📕';
    if (/\.(zip|rar|7z)$/i.test(name)) return '🗜️';
    if (/\.(doc|docx)$/i.test(name)) return '📘';
    if (/\.(xls|xlsx|csv)$/i.test(name)) return '📗';
    if (/\.(js|ts|py|html|css|json)$/i.test(name)) return '💻';
    return '📄';
  }

  function render() {
    const shown = projectFilter ? files.filter(f => String(f.project_id) === projectFilter) : files;
    tableWrap.innerHTML = '';
    if (!shown.length) {
      tableWrap.append(el('div', { class: 'empty', style: { margin: '14px' } },
        el('div', { class: 'big' }, '📁'), 'No files stored yet. Upload project files to keep everything in one place.'));
      return;
    }
    const tbody = el('tbody', {}, shown.map(f => {
      const dlBtn = el('button', { class: 'icon-btn', title: 'Download', onclick: () => {
        window.open(`/api/files/${f.id}/download?token=${encodeURIComponent(token())}`, '_blank');
      } });
      dlBtn.innerHTML = icons.download;
      const driveBtn = el('button', { class: 'icon-btn', title: 'Upload to Google Drive', onclick: async () => {
        driveBtn.disabled = true;
        try {
          const r = await post(`/google/drive/upload/${f.id}`);
          toast('Sent to Google Drive ✓');
          if (r.link) window.open(r.link, '_blank');
        } catch (e) { toast(e.message, 'err'); }
        driveBtn.disabled = false;
      } });
      driveBtn.innerHTML = icons.upload;
      const delBtn = el('button', { class: 'icon-btn', onclick: () => confirmModal(`Delete "${f.original}"?`, async () => { await del(`/files/${f.id}`); refresh(); }) });
      delBtn.innerHTML = icons.trash;
      return el('tr', {},
        el('td', {}, el('span', { style: { marginRight: '8px' } }, fileEmoji(f.mime || '', f.original)), el('b', {}, f.original)),
        el('td', {}, f.project_name
          ? el('span', { class: 'badge accent', style: { background: 'transparent', border: `1px solid ${f.project_color || 'var(--border)'}`, color: f.project_color || 'var(--text-dim)' } }, f.project_name)
          : el('span', { class: 'muted' }, '—')),
        el('td', {}, fmtBytes(f.size)),
        el('td', {}, fmtDate(f.created_at?.slice(0, 10))),
        el('td', {}, el('div', { class: 'row-actions' }, dlBtn, driveBtn, delBtn)));
    }));
    tableWrap.append(el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, el('th', {}, 'File'), el('th', {}, 'Project'), el('th', {}, 'Size'), el('th', {}, 'Uploaded'), el('th', {}, ''))),
      tbody));
  }
  render();

  const filterSelect = el('select', { style: { width: 'auto' }, onchange: (e) => { projectFilter = e.target.value; render(); } },
    el('option', { value: '' }, 'All projects'),
    projects.map(p => el('option', { value: p.id }, p.name)));

  return el('div', {},
    el('div', { class: 'page-head' },
      el('div', {}, el('h2', {}, 'Project File Store'), el('p', {}, 'Central storage for project files — push any file to Google Drive with one click')),
      el('div', { class: 'page-actions' },
        el('div', { class: 'field', style: { marginBottom: 0 } }, filterSelect),
        el('button', { class: 'btn', onclick: uploadModal }, icon('upload'), 'Upload'))),
    tableWrap);
}
